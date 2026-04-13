"""
glauc_api.py  —  Glauc Cloud API  v3.1
══════════════════════════════════════════════════════════════
FastAPI server — the Python model layer the Node gateway talks to.

Production fixes (v3.1):
  • CORS restricted to gateway origin (GATEWAY_ORIGIN env var)
  • Gateway authentication via X-Gateway-Secret header
  • Hard startup failure if model checkpoint is missing
  • Age range validated (10–110) at API boundary
  • Explanation timeout (120 s) prevents worker deadlock
  • Temp file cleaned up when queue is full (no leaks)
  • Demographic inputs sanitised before Qwen3-VL prompt
  • Backward-compatible checkpoint loading (dict or state_dict)
  • Pagination on history endpoint

Endpoints
  POST /predict              image + metadata → score + CI + risk + job_id
  GET  /explain/{job_id}     poll for Qwen3-VL explanation (async)
  GET  /history/{user_id}    paginated predictions for this user
  GET  /trend/{user_id}      rate-of-change analysis JSON
  GET  /trend/{user_id}/plot longitudinal age trend PNG
  GET  /health               liveness + queue depth

Run:
  uvicorn glauc_api:app --host 0.0.0.0 --port 8000 --workers 1
"""

import hmac
import io
import os
import re
import asyncio
import logging
import tempfile
import uuid
from datetime import datetime
from typing import Optional

import torch
from PIL import Image
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, Depends, Query
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
MODEL_VERSION    = "v3.1"
HISTORY_PAGE_SIZE = 50

# Gateway shared secret — must match Node gateway GATEWAY_SECRET
_GATEWAY_SECRET = os.environ.get("GATEWAY_SECRET", "")
if not _GATEWAY_SECRET:
    log.warning("GATEWAY_SECRET not set — gateway authentication disabled.")

# CORS: only allow the Node gateway origin
GATEWAY_ORIGIN = os.environ.get("GATEWAY_ORIGIN", "http://localhost:3000")

app = FastAPI(
    title="Glauc Ocular Age API  v3.1",
    description="DINOv3 + TTA + Calibration + Qwen3-VL + Longitudinal Tracking",
    version="3.1.0",
    # Disable interactive docs in production
    docs_url=None if os.environ.get("DISABLE_DOCS") else "/docs",
    redoc_url=None if os.environ.get("DISABLE_DOCS") else "/redoc",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[GATEWAY_ORIGIN],
    allow_methods=["GET", "POST"],
    allow_headers=["X-Gateway-Secret", "Content-Type"],
)

_model:     Optional[GlaucDINOv3]     = None
_vocab:     Optional[DemographicVocab] = None
_explainer: Optional[GlaucExplainer]  = None
_jobs: dict = {}
_explain_queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_QUEUE_DEPTH)
_worker_healthy: bool = False


# ── GATEWAY AUTH DEPENDENCY ───────────────────────────────────
async def gateway_auth(x_gateway_secret: str = Header(default="")):
    """Validates the shared secret from the Node gateway."""
    if _GATEWAY_SECRET and not hmac.compare_digest(x_gateway_secret, _GATEWAY_SECRET):
        raise HTTPException(status_code=401, detail="Gateway authentication required.")


# ── STARTUP ───────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    global _model, _vocab, _explainer, _worker_healthy
    init_db(DB_PATH)

    # Load vocabulary
    if not os.path.exists(VOCAB_PATH):
        log.warning("vocab.json not found — demographics default to UNK.")
        _vocab = _fallback_vocab()
    else:
        _vocab = DemographicVocab.load(VOCAB_PATH)
        log.info("Vocab loaded.")

    # Hard failure if model checkpoint missing — no point serving 503s indefinitely
    if not os.path.exists(MODEL_CHECKPOINT):
        raise RuntimeError(
            f"Model checkpoint not found: {MODEL_CHECKPOINT}. "
            "Run glauc_model.py first, then restart the API."
        )

    _model = GlaucDINOv3(DINOV3_MODEL, _vocab.num_genders, _vocab.num_races,
                          GENDER_EMB_DIM, RACE_EMB_DIM).to(DEVICE)

    # Backward-compatible checkpoint loading (dict format from v1.1+, or raw state_dict)
    ckpt_data = torch.load(MODEL_CHECKPOINT, map_location=DEVICE)
    if isinstance(ckpt_data, dict) and "model" in ckpt_data:
        _model.load_state_dict(ckpt_data["model"])
    else:
        _model.load_state_dict(ckpt_data)

    _model.eval()
    log.info(f"DINOv3 ready. Temperature={float(_model.temperature.data):.4f}")

    # Load Qwen3-VL (non-fatal — explanations disabled if it fails)
    if RUN_EXPLANATIONS:
        try:
            _explainer = GlaucExplainer(QWEN_MODEL_ID, DEVICE, THINKING_MODE)
        except Exception as e:
            log.warning(f"Qwen3-VL failed to load: {e}. Explanations disabled.")

    asyncio.create_task(_explanation_worker())
    log.info("API v3.1 ready.")


def _fallback_vocab():
    class _FV:
        num_genders = 4
        num_races   = 8
        def encode_gender(self, g): return 0
        def encode_race(self, r):   return 0
    return _FV()


# ── EXPLANATION WORKER ────────────────────────────────────────
async def _explanation_worker():
    """Bounded async queue — pulls jobs and runs Qwen3-VL in a thread pool."""
    global _worker_healthy
    loop = asyncio.get_event_loop()
    _worker_healthy = True

    while True:
        job_id, tmp_path, mc_result, gender, race, dt_str = await _explain_queue.get()
        try:
            if _explainer is None:
                _jobs[job_id] = {"status": "error", "message": "Explainer not loaded"}
                continue
            try:
                exp = await asyncio.wait_for(
                    loop.run_in_executor(
                        None, _explainer.explain, tmp_path, mc_result, gender, race, dt_str
                    ),
                    timeout=120.0,
                )
                _jobs[job_id] = {"status": "done", "explanation": exp}
                log.info(f"Explanation done: {job_id[:8]}")
            except asyncio.TimeoutError:
                _jobs[job_id] = {"status": "error", "message": "Explanation timed out."}
                log.warning(f"Explanation timeout: {job_id[:8]}")
        except Exception as e:
            _jobs[job_id] = {"status": "error", "message": str(e)}
            log.warning(f"Explanation failed {job_id[:8]}: {e}")
        finally:
            # Worker always owns cleanup of temp file
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            _explain_queue.task_done()


# ── INPUT SANITISER ───────────────────────────────────────────
_SAFE_DEMO = re.compile(r"[^\w\s\-]")

def _sanitise(value: str, max_len: int) -> str:
    """Strip non-alphanumeric chars and truncate — prevents prompt injection."""
    return _SAFE_DEMO.sub("", value).strip()[:max_len]


# ── POST /predict ─────────────────────────────────────────────
@app.post("/predict")
async def predict(
    file:         UploadFile = File(...),
    gender:       str        = Form(...),
    race:         str        = Form(...),
    age:          int        = Form(..., ge=10, le=110),
    user_id:      str        = Form(...),
    datetime_str: str        = Form(default=""),
    _auth:        None       = Depends(gateway_auth),
):
    if _model is None:
        raise HTTPException(503, "Model not loaded.")

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

    mc = _model.mc_predict(tensor, gid, rid, MC_DROPOUT_PASSES,
                            use_tta=True, pil_images=[cropped])

    age_mean    = float(mc["age_mean"][0])
    age_ci95    = float(mc["age_ci95"][0])
    glauc_risk  = float(mc["glauc_mean"][0])
    dr_risk     = float(mc["dr_mean"][0])
    cardio_risk = float(mc["cardio_mean"][0])
    gap         = age_mean - age
    temperature = float(_model.temperature.data)

    def _level(s): return "low" if s < 0.3 else "moderate" if s < 0.6 else "elevated"

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
    job_id = str(uuid.uuid4())
    exp_note = "Explanations disabled."

    if _explainer is not None:
        # Sanitise demographic inputs before they reach the prompt
        safe_gender = _sanitise(gender, 20)
        safe_race   = _sanitise(race,   30)
        safe_dt     = _sanitise(datetime_str, 50)

        mc_result = {
            "actual_age": age,    "age_mean":   age_mean,
            "age_ci95":   age_ci95, "glauc_risk": glauc_risk,
            "dr_risk":    dr_risk,  "cardio_risk": cardio_risk,
            "filename":   file.filename or "upload.jpg",
        }

        if _explain_queue.full():
            exp_note = "Explanation queue full — retry shortly."
            # No temp file was created — nothing to clean up
        else:
            # Write temp file; worker is responsible for deleting it
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False, dir="/tmp")
            try:
                pil.save(tmp.name, format="JPEG", quality=92)
            except Exception:
                try: os.unlink(tmp.name)
                except OSError: pass
                exp_note = "Could not save temp image for explanation."
                tmp = None
            finally:
                tmp.close() if tmp else None

            if tmp is not None:
                _jobs[job_id] = {"status": "pending"}
                await _explain_queue.put(
                    (job_id, tmp.name, mc_result, safe_gender, safe_race, safe_dt)
                )
                exp_note = f"Poll GET /explain/{job_id}"

    return {
        "status":            "success",
        "timestamp":         datetime.utcnow().isoformat() + "Z",
        "session_id":        session_id,
        "eye_crop_detected": crop_found,
        "prediction": {
            "ocular_age_years": round(age_mean, 1),
            "confidence_ci95":  round(age_ci95,  1),
            "age_gap_years":    round(gap, 1),
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
async def get_explanation(job_id: str, _auth: None = Depends(gateway_auth)):
    job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(404, f"Job {job_id!r} not found.")
    if job.get("status") in ("done", "error"):
        _jobs.pop(job_id, None)
    return job


# ── GET /history/{user_id} ────────────────────────────────────
@app.get("/history/{user_id}")
async def get_history(
    user_id: str,
    page:    int  = Query(default=0, ge=0),
    _auth:   None = Depends(gateway_auth),
):
    history = get_user_history(
        user_id, limit=HISTORY_PAGE_SIZE, offset=page * HISTORY_PAGE_SIZE
    )
    return {
        "user_id":    user_id,
        "n_sessions": len(history),
        "history":    history,
        "page":       page,
    }


# ── GET /trend/{user_id} ─────────────────────────────────────
@app.get("/trend/{user_id}")
async def get_trend(user_id: str, _auth: None = Depends(gateway_auth)):
    trend = get_ocular_age_trend(user_id)
    if trend["n_sessions"] < 2:
        return {
            "user_id": user_id,
            "message": "Need ≥2 sessions for trend analysis.",
            "n_sessions": trend["n_sessions"],
        }
    return {"user_id": user_id, **trend}


# ── GET /trend/{user_id}/plot ─────────────────────────────────
@app.get("/trend/{user_id}/plot")
async def get_trend_plot(user_id: str, _auth: None = Depends(gateway_auth)):
    path = plot_user_trend(user_id, OUTPUT_DIR)
    if path is None:
        raise HTTPException(400, "Need ≥2 sessions to generate trend plot.")
    return FileResponse(path, media_type="image/png",
                        filename=f"trend_{user_id[:8]}.png")


# ── GET /health ───────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":           "ok",
        "model_loaded":     _model    is not None,
        "explainer_ready":  _explainer is not None,
        "worker_healthy":   _worker_healthy,
        "temperature":      float(_model.temperature.data) if _model else None,
        "queue_depth":      _explain_queue.qsize(),
        "queue_utilisation": f"{_explain_queue.qsize() / MAX_QUEUE_DEPTH * 100:.0f}%",
        "pending_jobs":     sum(1 for j in _jobs.values() if j.get("status") == "pending"),
        "device":           DEVICE,
        "model_version":    MODEL_VERSION,
        "timestamp":        datetime.utcnow().isoformat() + "Z",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("glauc_api:app", host="0.0.0.0", port=8000, reload=False)
