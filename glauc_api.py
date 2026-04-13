"""
glauc_api.py  —  Glauc Cloud API  v3.0
══════════════════════════════════════════════════════════════
FastAPI server — the Python model layer the Node gateway talks to.

Endpoints
  POST /predict              image + metadata → score + CI + risk + job_id
  GET  /explain/{job_id}     poll for Qwen3-VL explanation (async)
  GET  /history/{user_id}    all past predictions for this user
  GET  /trend/{user_id}      rate-of-change analysis JSON
  GET  /trend/{user_id}/plot longitudinal age trend PNG
  GET  /health               liveness + queue depth

Key design decisions:
  • DINOv3 + TTA inference is synchronous (~2-5s GPU) — returned immediately
  • Qwen3-VL explanation runs in asyncio.Queue worker — polled via job_id
  • User IDs received here are already anonymised (SHA256) by the Node gateway
  • Every prediction written to SQLite longitudinal DB
  • Temperature scaling applied automatically via model.temperature parameter

Run:
  uvicorn glauc_api:app --host 0.0.0.0 --port 8000 --workers 1
  (1 worker — GPU not shareable across processes without extra infra)
"""

import os, io, uuid, asyncio, logging, tempfile
from datetime import datetime
from typing import Optional

import torch
from PIL import Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from torchvision import transforms

from glauc_model import (
    GlaucDINOv3, GlaucExplainer, DemographicVocab,
    check_image_quality, crop_eye_region,
    DINOV3_MODEL, QWEN_MODEL_ID, DEVICE,
    GENDER_EMB_DIM, RACE_EMB_DIM, MC_DROPOUT_PASSES,
    THINKING_MODE, OUTPUT_DIR, RUN_EXPLANATIONS, TTA_VIEWS,
    VAL_TRANSFORM,
)
from glauc_analysis import (
    store_prediction, get_user_history,
    get_ocular_age_trend, plot_user_trend,
    init_db, DB_PATH,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("glauc.api")

MODEL_CHECKPOINT = os.path.join(OUTPUT_DIR, "best_model.pt")
VOCAB_PATH       = os.path.join(OUTPUT_DIR, "vocab.json")
MAX_IMAGE_MB     = 10
MAX_QUEUE_DEPTH  = 100
MODEL_VERSION    = "v3.0"

app = FastAPI(
    title="Glauc Ocular Age API  v3.0",
    description="DINOv3 + TTA + Calibration + Qwen3-VL + Longitudinal Tracking",
    version="3.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_model:     Optional[GlaucDINOv3]      = None
_vocab:     Optional[DemographicVocab] = None
_explainer: Optional[GlaucExplainer]  = None
_jobs: dict = {}
_explain_queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_QUEUE_DEPTH)


@app.on_event("startup")
async def startup():
    global _model, _vocab, _explainer
    init_db(DB_PATH)

    # Load vocabulary
    if not os.path.exists(VOCAB_PATH):
        log.warning("vocab.json not found — demographics default to UNK.")
        _vocab = _fallback_vocab()
    else:
        _vocab = DemographicVocab.load(VOCAB_PATH)
        log.info("Vocab loaded.")

    # Load DINOv3 model
    if not os.path.exists(MODEL_CHECKPOINT):
        log.error(f"Checkpoint not found: {MODEL_CHECKPOINT}. Run glauc_model.py first.")
        return

    _model = GlaucDINOv3(DINOV3_MODEL, _vocab.num_genders, _vocab.num_races,
                          GENDER_EMB_DIM, RACE_EMB_DIM).to(DEVICE)
    _model.load_state_dict(torch.load(MODEL_CHECKPOINT, map_location=DEVICE))
    _model.eval()
    log.info(f"DINOv3 ready. Temperature={float(_model.temperature.data):.4f}")

    # Load Qwen3-VL (non-fatal)
    if RUN_EXPLANATIONS:
        try:
            _explainer = GlaucExplainer(QWEN_MODEL_ID, DEVICE, THINKING_MODE)
        except Exception as e:
            log.warning(f"Qwen3-VL failed to load: {e}. Explanations disabled.")

    asyncio.create_task(_explanation_worker())
    log.info("API v3.0 ready.")


def _fallback_vocab():
    class _FV:
        num_genders=4; num_races=8
        def encode_gender(self, g): return 0
        def encode_race(self, r):   return 0
    return _FV()


async def _explanation_worker():
    """Bounded async queue — pulls jobs and runs Qwen3-VL in thread pool."""
    loop = asyncio.get_event_loop()
    while True:
        job_id, tmp_path, mc_result, gender, race, dt_str = await _explain_queue.get()
        try:
            if _explainer is None:
                _jobs[job_id] = {"status": "error", "message": "Explainer not loaded"}
                continue
            exp = await loop.run_in_executor(
                None, _explainer.explain, tmp_path, mc_result, gender, race, dt_str)
            _jobs[job_id] = {"status": "done", "explanation": exp}
            log.info(f"Explanation done: {job_id[:8]}")
        except Exception as e:
            _jobs[job_id] = {"status": "error", "message": str(e)}
            log.warning(f"Explanation failed {job_id[:8]}: {e}")
        finally:
            try: os.unlink(tmp_path)
            except OSError: pass
            _explain_queue.task_done()


# ── POST /predict ─────────────────────────────────────────────
@app.post("/predict")
async def predict(
    file:         UploadFile = File(...),
    gender:       str        = Form(...),
    race:         str        = Form(...),
    age:          int        = Form(...),
    user_id:      str        = Form(...),
    datetime_str: str        = Form(default=""),
):
    if _model is None:
        raise HTTPException(503, "Model not loaded. Run glauc_model.py first.")

    # Read + validate image
    raw = await file.read()
    if len(raw) > MAX_IMAGE_MB * 1_048_576:
        raise HTTPException(413, f"Image exceeds {MAX_IMAGE_MB}MB.")
    try:
        pil = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Cannot decode image. Send JPEG or PNG.")

    # Quality gate
    ok, reason = check_image_quality(pil)
    if not ok:
        return JSONResponse(status_code=422, content={
            "error":  "image_quality_rejected",
            "reason": reason,
            "action": "Retake with good lighting and focus on the eye.",
        })

    # Eye crop
    cropped, crop_found = crop_eye_region(pil, eye="both")

    # DINOv3 + MC Dropout + TTA inference
    tensor   = VAL_TRANSFORM(cropped).unsqueeze(0).to(DEVICE)
    gid      = torch.tensor([_vocab.encode_gender(gender)], dtype=torch.long).to(DEVICE)
    rid      = torch.tensor([_vocab.encode_race(race)],     dtype=torch.long).to(DEVICE)
    pil_list = [cropped]   # single image — TTA generates augmented views internally

    mc = _model.mc_predict(tensor, gid, rid, MC_DROPOUT_PASSES,
                            use_tta=True, pil_images=pil_list)

    age_mean    = float(mc["age_mean"][0])
    age_ci95    = float(mc["age_ci95"][0])
    glauc_risk  = float(mc["glauc_mean"][0])
    dr_risk     = float(mc["dr_mean"][0])
    cardio_risk = float(mc["cardio_mean"][0])
    gap         = age_mean - age
    temperature = float(_model.temperature.data)

    def _level(s): return "low" if s<0.3 else "moderate" if s<0.6 else "elevated"

    # Store in longitudinal DB
    session_id = str(uuid.uuid4())
    try:
        store_prediction(
            user_id=user_id, session_id=session_id,
            gender=gender, race=race, capture_datetime=datetime_str,
            chronological_age=age, ocular_age_mean=age_mean, ocular_age_ci95=age_ci95,
            glauc_risk=glauc_risk, dr_risk=dr_risk, cardio_risk=cardio_risk,
            eye_crop_detected=crop_found, model_version=MODEL_VERSION, temperature=temperature,
        )
    except Exception as e:
        log.warning(f"DB write failed: {e}")

    # Queue Qwen3-VL explanation
    job_id = str(uuid.uuid4()); exp_note = "Explanations disabled."
    if _explainer is not None:
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False, dir="/tmp")
        pil.save(tmp.name, format="JPEG", quality=92); tmp.close()
        mc_result = {
            "actual_age":  age,    "age_mean":    age_mean,
            "age_ci95":    age_ci95, "glauc_risk":  glauc_risk,
            "dr_risk":     dr_risk,  "cardio_risk": cardio_risk,
            "filename":    file.filename or "upload.jpg",
        }
        if _explain_queue.full():
            exp_note = "Explanation queue full — retry shortly."
        else:
            _jobs[job_id] = {"status": "pending"}
            await _explain_queue.put((job_id, tmp.name, mc_result, gender, race, datetime_str))
            exp_note = f"Poll GET /explain/{job_id}"

    return {
        "status":             "success",
        "timestamp":          datetime.utcnow().isoformat()+"Z",
        "session_id":         session_id,
        "eye_crop_detected":  crop_found,
        "prediction": {
            "ocular_age_years":  round(age_mean, 1),
            "confidence_ci95":   round(age_ci95,  1),
            "age_gap_years":     round(gap, 1),
            "interpretation": (
                "accelerated ocular aging"  if gap >  3 else
                "decelerated ocular aging"  if gap < -3 else
                "normal ocular aging"
            ),
        },
        "risk_scores": {
            "glaucoma":             {"score": round(glauc_risk,  3), "level": _level(glauc_risk)},
            "diabetic_retinopathy": {"score": round(dr_risk,     3), "level": _level(dr_risk)},
            "cardiovascular_proxy": {"score": round(cardio_risk, 3), "level": _level(cardio_risk)},
        },
        "calibration": {"temperature": round(temperature, 4)},
        "note": "Disease risk scores are placeholder outputs pending clinical validation.",
        "explanation": {"job_id": job_id, "note": exp_note},
        "metadata": {
            "gender": gender, "race": race,
            "model": DINOV3_MODEL, "tta_views": TTA_VIEWS, "mc_passes": MC_DROPOUT_PASSES,
        },
    }


# ── GET /explain/{job_id} ─────────────────────────────────────
@app.get("/explain/{job_id}")
async def get_explanation(job_id: str):
    job = _jobs.get(job_id)
    if job is None: raise HTTPException(404, f"Job {job_id!r} not found.")
    if job.get("status") in ("done", "error"): _jobs.pop(job_id, None)
    return job


# ── GET /history/{user_id} ────────────────────────────────────
@app.get("/history/{user_id}")
async def get_history(user_id: str):
    history = get_user_history(user_id)
    return {"user_id": user_id, "n_sessions": len(history), "history": history}


# ── GET /trend/{user_id} ─────────────────────────────────────
@app.get("/trend/{user_id}")
async def get_trend(user_id: str):
    trend = get_ocular_age_trend(user_id)
    if trend["n_sessions"] < 2:
        return {"user_id": user_id, "message": "Need ≥2 sessions for trend analysis.",
                "n_sessions": trend["n_sessions"]}
    return {"user_id": user_id, **trend}


# ── GET /trend/{user_id}/plot ─────────────────────────────────
@app.get("/trend/{user_id}/plot")
async def get_trend_plot(user_id: str):
    path = plot_user_trend(user_id, OUTPUT_DIR)
    if path is None:
        raise HTTPException(400, "Need ≥2 sessions to generate trend plot.")
    return FileResponse(path, media_type="image/png",
                        filename=f"trend_{user_id[:8]}.png")


# ── GET /health ───────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":          "ok",
        "model_loaded":    _model    is not None,
        "explainer_ready": _explainer is not None,
        "temperature":     float(_model.temperature.data) if _model else None,
        "queue_depth":     _explain_queue.qsize(),
        "pending_jobs":    sum(1 for j in _jobs.values() if j.get("status") == "pending"),
        "device":          DEVICE,
        "model_version":   MODEL_VERSION,
        "timestamp":       datetime.utcnow().isoformat()+"Z",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("glauc_api:app", host="0.0.0.0", port=8000, reload=False)
