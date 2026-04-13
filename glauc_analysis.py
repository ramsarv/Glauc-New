"""
glauc_analysis.py  —  Glauc Analysis Module  v1.0
══════════════════════════════════════════════════════════════
Five capabilities:

  1. GradCAM              Which pixels drove the DINOv3 prediction?
                          Hooks last attention block, generates heatmaps,
                          saves a 12-image grid overlay.

  2. Temperature scaling  Post-hoc calibration via LBFGS on val set.
                          Finds optimal T, saves to checkpoint.

  3. Reliability diagram  Plots actual CI coverage vs nominal level.
                          ECE (Expected Calibration Error) computed + saved.

  4. Longitudinal DB      SQLite store for every prediction per user.
                          Enables rate-of-change tracking over time.

  5. Trend plotting       Per-user longitudinal chart with slope annotation.
"""

import os
import sqlite3
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

log = logging.getLogger("glauc.analysis")


# ══════════════════════════════════════════════════════════
# 1. GRADCAM
# ══════════════════════════════════════════════════════════

class DINOv3GradCAM:
    """
    GradCAM for DINOv3 ViT backbone.
    Hooks the last attention block's output projection.
    Computes gradient of age prediction w.r.t. patch token activations.
    """
    def __init__(self, model, device: str):
        self.model  = model
        self.device = device
        self._acts: Optional[torch.Tensor]  = None
        self._grads: Optional[torch.Tensor] = None
        self._hooks = []
        self._register()

    def _register(self):
        try:
            target = self.model.backbone.blocks[-1].attn.proj
        except AttributeError:
            log.warning("Could not locate DINOv3 attention layer. GradCAM disabled.")
            return

        self._hooks.append(target.register_forward_hook(
            lambda m, i, o: setattr(self, "_acts", o.detach())))
        self._hooks.append(target.register_full_backward_hook(
            lambda m, gi, go: setattr(self, "_grads", go[0].detach())))

    def generate(self, image_tensor, gender_id, race_id,
                 original_size=(224, 224)) -> Optional[np.ndarray]:
        if not self._hooks: return None
        self.model.eval()
        image_tensor = image_tensor.to(self.device).requires_grad_(True)
        gender_id    = gender_id.to(self.device)
        race_id      = race_id.to(self.device)

        age_pred, _, _, _ = self.model(image_tensor, gender_id, race_id)
        self.model.zero_grad()
        age_pred.sum().backward()

        if self._acts is None or self._grads is None: return None

        grads = self._grads[0][1:]   # exclude CLS token
        acts  = self._acts[0][1:]
        weights = grads.mean(dim=-1, keepdim=True)
        cam     = F.relu((weights * acts).sum(dim=-1))

        n = cam.shape[0]; g = int(n**0.5)
        if g*g != n:
            log.warning(f"Non-square patch grid ({n}). Skipping."); return None

        cam = cam.reshape(g, g).cpu().numpy()
        cam = (cam - cam.min()) / (cam.max() - cam.min() + 1e-8)
        cam_img = Image.fromarray((cam*255).astype(np.uint8))
        return np.array(cam_img.resize(original_size, Image.BILINEAR)) / 255.0

    def remove_hooks(self):
        for h in self._hooks: h.remove()
        self._hooks = []


def plot_gradcam_grid(model, dataset, indices: List[int],
                      device: str, output_dir: str, n_images: int = 12):
    """
    Generate a grid of GradCAM overlays for n_images val samples.
    Each row: original crop | heatmap overlay with prediction annotation.
    Hooks are always removed in a finally block to prevent memory leaks.
    """
    from glauc_model import VAL_TRANSFORM, crop_eye_region, IMAGE_DIR

    gradcam = DINOv3GradCAM(model, device)
    indices = indices[:n_images]; n = len(indices)

    fig, axes = plt.subplots(n, 2, figsize=(10, n*3), facecolor="#0d0d0d")
    if n == 1: axes = [axes]

    try:
        for row, idx in enumerate(indices):
            sample = dataset.samples[idx]; fname = sample["filename"]
            pil = Image.open(os.path.join(IMAGE_DIR, fname)).convert("RGB")
            pil, _ = crop_eye_region(pil, "both")
            pil_224 = pil.resize((224, 224))

            tensor    = VAL_TRANSFORM(pil).unsqueeze(0)
            gender_id = torch.tensor([dataset.vocab.encode_gender(sample["gender"])], dtype=torch.long)
            race_id   = torch.tensor([dataset.vocab.encode_race(sample["race"])],     dtype=torch.long)
            heatmap   = gradcam.generate(tensor, gender_id, race_id, (224, 224))

            model.eval()
            with torch.no_grad():
                age_pred, _, _, _ = model(tensor.to(device), gender_id.to(device), race_id.to(device))
            pred_age = float(age_pred[0]); true_age = sample["age"]
            err = pred_age - true_age

            ax = axes[row][0]
            ax.imshow(pil_224); ax.axis("off")
            ax.set_title(f"Actual: {true_age}y  ·  {fname[:28]}", color="white", fontsize=7, pad=3)

            ax = axes[row][1]
            ax.imshow(pil_224)
            if heatmap is not None: ax.imshow(heatmap, cmap="jet", alpha=0.45)
            ax.axis("off")
            ax.set_title(f"Predicted: {pred_age:.1f}y  ·  Error: {err:+.1f}y",
                         color="#4ECDC4" if abs(err)<3 else "#FF6B6B", fontsize=7, pad=3)

        fig.suptitle("GradCAM — DINOv3 Attention Heatmaps\nWarm = high influence on age prediction",
                     color="white", fontsize=11, y=1.01)
        plt.tight_layout()
        path = os.path.join(output_dir, "gradcam_grid.png")
        try:
            plt.savefig(path, dpi=150, bbox_inches="tight", facecolor="#0d0d0d")
            log.info(f"GradCAM grid → {path}")
        except Exception as e:
            log.warning(f"GradCAM save failed: {e}")
        plt.close(fig)
    except Exception as e:
        log.error(f"GradCAM grid failed: {e}")
        plt.close(fig)
    finally:
        # Always remove hooks to prevent memory leaks regardless of success/failure
        gradcam.remove_hooks()


# ══════════════════════════════════════════════════════════
# 2 & 5. TEMPERATURE SCALING CALIBRATION
# ══════════════════════════════════════════════════════════

def run_calibration(model, val_loader: DataLoader, device: str,
                    output_dir: str) -> float:
    """
    Optimise temperature T on val set (LBFGS, Gaussian NLL).
    Updates model.temperature in-place and saves to checkpoint.
    Returns optimal T value.
    """
    import json
    log.info("Temperature calibration (LBFGS)...")
    model.eval()

    orig = model.temperature.data.clone()
    model.temperature.data.fill_(1.0)

    all_preds, all_labels = [], []
    with torch.no_grad():
        for imgs, gids, rids, labels, _ in val_loader:
            imgs, gids, rids = (imgs.to(device, non_blocking=True),
                                gids.to(device, non_blocking=True),
                                rids.to(device, non_blocking=True))
            ap, _, _, _ = model(imgs, gids, rids)
            all_preds.append(ap.cpu()); all_labels.append(labels)

    preds  = torch.cat(all_preds)
    labels = torch.cat(all_labels)

    model.temperature.requires_grad_(True)
    model.temperature.data.fill_(1.0)
    opt = torch.optim.LBFGS([model.temperature], lr=0.01, max_iter=100)

    def _closure():
        opt.zero_grad()
        scaled = preds / model.temperature
        loss   = F.gaussian_nll_loss(scaled, labels,
                                      var=model.temperature.pow(2).expand_as(preds))
        loss.backward(); return loss

    opt.step(_closure)

    T = float(model.temperature.data.clamp(0.5, 5.0))
    model.temperature.data.fill_(T)
    model.temperature.requires_grad_(False)

    log.info(f"  T = {T:.4f}  ({'overconfident → widened' if T>1.05 else 'underconfident → narrowed' if T<0.95 else 'well-calibrated'})")

    ckpt = os.path.join(output_dir, "best_model.pt")
    if os.path.exists(ckpt):
        state = torch.load(ckpt, map_location="cpu")
        # Handle both dict checkpoint (v1.1+) and legacy plain state_dict
        if isinstance(state, dict) and "model" in state:
            state["model"]["temperature"] = model.temperature.data
        else:
            state["temperature"] = model.temperature.data
        torch.save(state, ckpt)
        log.info(f"  Calibrated checkpoint saved → {ckpt}")

    with open(os.path.join(output_dir, "calibration_summary.json"), "w") as f:
        json.dump({"temperature": round(T, 6), "generated": datetime.now().isoformat()}, f, indent=2)

    return T


# ══════════════════════════════════════════════════════════
# 3. RELIABILITY DIAGRAM
# ══════════════════════════════════════════════════════════

def _conf_to_z(conf: float) -> float:
    from scipy import stats
    return float(stats.norm.ppf((1+conf)/2))


def plot_reliability_diagram(model, val_loader: DataLoader,
                              device: str, output_dir: str) -> None:
    """
    Reliability diagram: actual CI coverage vs nominal confidence level.
    Perfectly calibrated model lies on the diagonal. ECE saved to JSON.
    """
    import json
    from glauc_model import MC_DROPOUT_PASSES, mc_dropout_mode

    log.info("Reliability diagram...")
    model.eval()
    all_means, all_stds, all_labels = [], [], []

    for imgs, gids, rids, labels, _ in val_loader:
        imgs, gids, rids = (imgs.to(device, non_blocking=True),
                            gids.to(device, non_blocking=True),
                            rids.to(device, non_blocking=True))
        ages = []
        with mc_dropout_mode(model):
            for _ in range(MC_DROPOUT_PASSES):
                a, _, _, _ = model(imgs, gids, rids); ages.append(a.cpu())
        t = torch.stack(ages)
        all_means.append(t.mean(0)); all_stds.append(t.std(0)); all_labels.append(labels)

    means  = torch.cat(all_means).numpy()
    stds   = torch.cat(all_stds).numpy()
    labels = torch.cat(all_labels).numpy()

    conf_levels = np.linspace(0.05, 0.99, 20)
    actual_cov  = []
    for c in conf_levels:
        z  = _conf_to_z(c)
        lo = means - z*stds; hi = means + z*stds
        actual_cov.append(float(((labels>=lo) & (labels<=hi)).mean()))

    ece = float(np.mean(np.abs(np.array(actual_cov) - conf_levels)))

    fig, ax = plt.subplots(figsize=(7, 7), facecolor="#0d0d0d")
    ax.set_facecolor("#0d0d0d")
    ax.plot([0,1],[0,1], color="white", ls="--", lw=1.5, alpha=0.5, label="Perfect calibration")
    ax.plot(conf_levels, actual_cov, color="#4ECDC4", lw=2.5, marker="o", ms=5,
            label=f"Glauc  ECE={ece:.3f}")
    ax.fill_between(conf_levels, conf_levels, actual_cov, alpha=0.12, color="#FF6B6B")
    ax.set_xlim(0,1); ax.set_ylim(0,1)
    ax.set_xlabel("Nominal confidence", color="#aaaaaa", fontsize=12)
    ax.set_ylabel("Actual coverage",    color="#aaaaaa", fontsize=12)
    ax.set_title(f"Reliability Diagram  ·  ECE = {ece:.4f}", color="white", fontsize=13, pad=10)
    ax.tick_params(colors="#aaaaaa")
    ax.legend(facecolor="#1a1a1a", labelcolor="white", edgecolor="#444")
    for s in ax.spines.values(): s.set_edgecolor("#333")
    ax.grid(True, alpha=0.12, color="white")

    path = os.path.join(output_dir, "reliability_diagram.png")
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor="#0d0d0d")
    plt.close(fig); log.info(f"Reliability diagram → {path}  ECE={ece:.4f}")

    cal = os.path.join(output_dir, "calibration_summary.json")
    try:
        with open(cal) as f: d = json.load(f)
    except Exception: d = {}
    d["ece"] = round(ece, 6)
    with open(cal, "w") as f: json.dump(d, f, indent=2)


# ══════════════════════════════════════════════════════════
# 4. LONGITUDINAL DATABASE
# ══════════════════════════════════════════════════════════

DB_PATH = "./glauc_outputs/glauc_predictions.db"

def init_db(db_path: str = DB_PATH) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id             TEXT    NOT NULL,
                session_id          TEXT    NOT NULL,
                timestamp           TEXT    NOT NULL DEFAULT (datetime('now','utc')),
                gender              TEXT,
                race                TEXT,
                capture_datetime    TEXT,
                chronological_age   INTEGER,
                ocular_age_mean     REAL,
                ocular_age_ci95     REAL,
                age_gap             REAL,
                glauc_risk          REAL,
                dr_risk             REAL,
                cardio_risk         REAL,
                eye_crop_detected   INTEGER,
                model_version       TEXT,
                temperature         REAL
            )
        """)
        conn.commit()
    log.info(f"DB initialised → {db_path}")


def store_prediction(user_id, session_id, gender, race, capture_datetime,
                     chronological_age, ocular_age_mean, ocular_age_ci95,
                     glauc_risk, dr_risk, cardio_risk, eye_crop_detected,
                     model_version="v3.0", temperature=1.0, db_path=DB_PATH) -> int:
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute("""
            INSERT INTO predictions (
                user_id, session_id, gender, race, capture_datetime,
                chronological_age, ocular_age_mean, ocular_age_ci95, age_gap,
                glauc_risk, dr_risk, cardio_risk,
                eye_crop_detected, model_version, temperature
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (user_id, session_id, gender, race, capture_datetime,
              chronological_age, ocular_age_mean, ocular_age_ci95,
              ocular_age_mean - chronological_age,
              glauc_risk, dr_risk, cardio_risk,
              int(eye_crop_detected), model_version, temperature))
        conn.commit(); return cur.lastrowid


def get_user_history(user_id: str, db_path: str = DB_PATH,
                     limit: int = 100, offset: int = 0) -> List[Dict]:
    """Returns paginated history, newest-first via ASC + LIMIT/OFFSET."""
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM predictions WHERE user_id=? ORDER BY timestamp ASC LIMIT ? OFFSET ?",
            (user_id, limit, offset)).fetchall()
    return [dict(r) for r in rows]


def get_ocular_age_trend(user_id: str, db_path: str = DB_PATH) -> Dict:
    history = get_user_history(user_id, db_path)
    if len(history) < 2:
        return {"timestamps":[], "ocular_ages":[], "ci95s":[],
                "rate_per_year": None, "n_sessions": len(history)}

    timestamps  = [h["timestamp"]       for h in history]
    ocular_ages = [h["ocular_age_mean"] for h in history]
    ci95s       = [h["ocular_age_ci95"] for h in history]

    from datetime import datetime as dt
    # Parse with explicit UTC so timezone arithmetic is unambiguous
    def _parse(ts): return dt.fromisoformat(ts).replace(tzinfo=timezone.utc)
    t0   = _parse(timestamps[0])
    days = [(_parse(ts) - t0).days for ts in timestamps]
    slope = float(np.polyfit(days, ocular_ages, 1)[0]) * 365.25 if max(days) > 0 else None

    return {"timestamps": timestamps, "ocular_ages": ocular_ages, "ci95s": ci95s,
            "rate_per_year": slope, "n_sessions": len(history)}


def plot_user_trend(user_id: str, output_dir: str, db_path: str = DB_PATH) -> Optional[str]:
    trend = get_ocular_age_trend(user_id, db_path)
    if trend["n_sessions"] < 2: return None

    from datetime import datetime as dt
    timestamps  = trend["timestamps"]
    ages        = np.array(trend["ocular_ages"])
    ci95s       = np.array(trend["ci95s"])
    rate        = trend["rate_per_year"]
    def _parse(ts): return dt.fromisoformat(ts).replace(tzinfo=timezone.utc)
    t0          = _parse(timestamps[0])
    days        = np.array([(_parse(ts) - t0).days for ts in timestamps])

    fig, ax = plt.subplots(figsize=(10, 5), facecolor="#0d0d0d")
    ax.set_facecolor("#0d0d0d")
    ax.fill_between(days, ages-ci95s, ages+ci95s, alpha=0.2, color="#4ECDC4", label="95% CI")
    ax.plot(days, ages, color="#4ECDC4", lw=2.5, marker="o", ms=6, label="Ocular Age")
    if rate is not None:
        color = "#FF6B6B" if rate>1.2 else "#FFD93D" if rate>0.8 else "#4ECDC4"
        ax.plot(days, ages[0]+rate/365.25*days, color=color, lw=1.5, ls="--",
                label=f"Trend: {rate:+.2f} yrs/yr")
    ax.set_xlabel("Days since first test", color="#aaaaaa", fontsize=11)
    ax.set_ylabel("Ocular Age (years)",    color="#aaaaaa", fontsize=11)
    ax.set_title(f"Longitudinal Ocular Age  ·  User {user_id[:8]}",
                 color="white", fontsize=13, pad=10)
    ax.tick_params(colors="#aaaaaa")
    ax.legend(facecolor="#1a1a1a", labelcolor="white", edgecolor="#444")
    for s in ax.spines.values(): s.set_edgecolor("#333")
    ax.grid(True, alpha=0.12, color="white")

    path = os.path.join(output_dir, f"trend_{user_id[:8]}.png")
    plt.savefig(path, dpi=150, bbox_inches="tight", facecolor="#0d0d0d")
    plt.close(fig); log.info(f"Trend plot → {path}"); return path


# Initialise DB on import
init_db()
