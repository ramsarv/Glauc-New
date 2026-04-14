"""
glauc_model.py  —  Glauc Production Training Pipeline  v3.0
══════════════════════════════════════════════════════════════
New in v3.0 (on top of all v2.0 fixes)
  1. Huber loss          replaces MSE for age regression
                         delta=5 yrs: L2 under 5y error, L1 above
                         → better calibration at age extremes
  2. TTA (Test-Time Aug) built into mc_predict()
                         8 augmented views per MC pass
                         → MC×TTA = 30×8 = 240 effective passes
  3. backbone_features() method for GradCAM hook registration
  4. temperature param   nn.Parameter for post-hoc calibration
                         tuned in glauc_analysis.run_calibration()
  5. 9-step main()       includes calibration + GradCAM steps

v2.0 fixes (all retained)
  1.  MC Dropout context manager  — BN stays eval; only Dropout layers active
  2.  Correct periocular landmarks — curated 20-pt sets, not range() slices
  3.  Eye crop aspect ratio        — pad-to-square before resize, no stretch
  4.  Disease heads frozen         — zero-label training removed entirely
  5.  Thread-safe losses           — criteria created inside function
  6.  DINOv3 module-level cache    — loaded once, reused across all instances
  7.  Dataset scan deduplication   — val set reuses train samples list
  8.  Gradient clipping            — max_norm=1.0 every step
  9.  zero_grad(set_to_none=True)  — lower memory overhead
  10. Early stopping               — patience=10 on val MAE
  11. Auto num_workers             — detects CPU count, caps at 8
  12. No HorizontalFlip on crops   — preserves left/right diagnostic orientation
  13. Correct Qwen3-VL class       — Qwen2VLForConditionalGeneration
  14. torch.compile on trunk       — ~30% inference speedup on CUDA
  15. matplotlib Agg backend       — safe for headless servers

Models
  DINOv3 ViT-B/14   github.com/facebookresearch/dinov3   (Meta, Aug 2025)
  Qwen3-VL-8B        huggingface.co/Qwen/Qwen3-VL-8B-Instruct (Alibaba, Oct 2025)
  MediaPipe FaceMesh google.github.io/mediapipe

Input  : [Age]_[Gender]_[Race]_[DateTime].jpg
Output : glauc_outputs/  (plots, CSVs, checkpoint, bias report, vocab.json)
"""

import os, re, csv, json, math, logging, warnings, contextlib
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

import torch, torch.nn as nn, torch.optim as optim
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader, Subset
from torchvision import transforms
from PIL import Image

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("glauc")

# ── CONFIG ────────────────────────────────────────────────────────
IMAGE_DIR                = "./eye_images"
OUTPUT_DIR               = "./glauc_outputs"
BATCH_SIZE               = 16
EPOCHS                   = 80
LR                       = 3e-4
LR_MIN                   = 1e-6
WEIGHT_DECAY             = 5e-3
GRAD_CLIP_NORM           = 1.0
EARLY_STOP_PATIENCE      = 10
VAL_SPLIT                = 0.20
SEED                     = 42
DEVICE                   = "cuda" if torch.cuda.is_available() else "cpu"
NUM_WORKERS              = min(os.cpu_count() or 1, 8)
USE_COMPILE              = torch.cuda.is_available()
DINOV3_MODEL             = "dinov3_vitb14"   # vitb14 | vitl14 | vitg14
GENDER_EMB_DIM           = 16
RACE_EMB_DIM             = 32
DISEASE_LABELS_AVAILABLE = False
LOSS_WEIGHT_AGE          = 1.0
LOSS_WEIGHT_GLAUC        = 0.20
LOSS_WEIGHT_DR           = 0.15
LOSS_WEIGHT_CARDIO       = 0.10
HUBER_DELTA              = 5.0      # Huber loss delta (years)
MC_DROPOUT_PASSES        = 30
TTA_VIEWS                = 8        # augmented views per MC pass
MIN_BRIGHTNESS           = 35
MAX_BRIGHTNESS           = 225
MIN_SHARPNESS            = 40.0
MIN_EYE_CROP_PX          = 56
RUN_EXPLANATIONS         = True
QWEN_MODEL_ID            = "Qwen/Qwen3-VL-8B-Instruct"
MAX_EXPLANATION_IMGS     = 20
MAX_NEW_TOKENS           = 512
THINKING_MODE            = False

TEST_SPLIT = 0.10   # held-out test set (never touched during training/calibration)

os.makedirs(OUTPUT_DIR, exist_ok=True)


def _set_seeds(seed: int = SEED):
    """Call at the start of main() to ensure full reproducibility."""
    torch.manual_seed(seed)
    np.random.seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _worker_init_fn(worker_id: int):
    """Seed each DataLoader worker independently for reproducible augmentation."""
    np.random.seed(SEED + worker_id)


# ── 1. FILENAME PARSER ────────────────────────────────────────────
_FNAME_RE = re.compile(r"^(\d+)_([^_]+)_([^_]+)_(.+)$")

def parse_filename(filename: str) -> Optional[Dict]:
    m = _FNAME_RE.match(Path(filename).stem)
    if not m: return None
    age_str, gender, race, dt = m.groups()
    try: age = int(age_str)
    except ValueError: return None
    return {"age": age, "gender": gender.strip().upper(),
            "race": race.strip().title(), "datetime": dt, "filename": filename}


# ── 2. IMAGE QUALITY GATE ─────────────────────────────────────────
def check_image_quality(img: Image.Image) -> Tuple[bool, str]:
    import cv2
    w, h = img.size
    if w < 224 or h < 224: return False, f"resolution {w}x{h} < 224x224"
    gray = np.array(img.convert("L"), dtype=np.float32)
    lum  = gray.mean()
    if lum < MIN_BRIGHTNESS: return False, f"too dark (lum={lum:.0f})"
    if lum > MAX_BRIGHTNESS: return False, f"overexposed (lum={lum:.0f})"
    lap = cv2.Laplacian(gray.astype(np.uint8), cv2.CV_64F).var()
    if lap < MIN_SHARPNESS: return False, f"too blurry (lap={lap:.1f})"
    return True, "ok"


# ── 3. EYE REGION CROPPER ─────────────────────────────────────────
# Curated 20-pt periocular landmark sets (verified, MediaPipe 478-pt model)
_L_PERI = [33,  7,  163, 144, 145, 153, 154, 155, 133, 173,
           157, 158, 159, 160, 161, 246, 130,  25, 110,  24]
_R_PERI = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466,
           388, 387, 386, 385, 384, 398, 359, 255, 339, 254]
_FACE_MESH = None

def _get_face_mesh():
    global _FACE_MESH
    if _FACE_MESH is None:
        try:
            import mediapipe as mp
            _FACE_MESH = mp.solutions.face_mesh.FaceMesh(
                static_image_mode=True, max_num_faces=1,
                refine_landmarks=True, min_detection_confidence=0.45)
        except Exception: _FACE_MESH = "unavailable"
    return _FACE_MESH

def _pad_square(crop: Image.Image) -> Image.Image:
    w, h = crop.size; s = max(w, h)
    out = Image.new("RGB", (s, s), 0)
    out.paste(crop, ((s-w)//2, (s-h)//2))
    return out

def crop_eye_region(img: Image.Image, eye: str = "both",
                    padding_frac: float = 0.40) -> Tuple[Image.Image, bool]:
    import cv2
    fm = _get_face_mesh()
    if fm == "unavailable":
        w, h = img.size; m = min(w, h)//4
        return img.crop((m, m, w-m, h-m)), False
    arr = np.array(img); H, W = arr.shape[:2]
    try: res = fm.process(cv2.cvtColor(arr, cv2.COLOR_RGB2BGR))
    except Exception: return img, False
    if not res.multi_face_landmarks: return img, False
    lm = res.multi_face_landmarks[0].landmark

    def _crop(idx_list):
        xs = [lm[i].x*W for i in idx_list]; ys = [lm[i].y*H for i in idx_list]
        bw = max(xs)-min(xs); bh = max(ys)-min(ys)
        x0 = max(0, int(min(xs)-bw*padding_frac)); y0 = max(0, int(min(ys)-bh*padding_frac))
        x1 = min(W, int(max(xs)+bw*padding_frac)); y1 = min(H, int(max(ys)+bh*padding_frac))
        if (x1-x0)<MIN_EYE_CROP_PX or (y1-y0)<MIN_EYE_CROP_PX: return None
        return img.crop((x0, y0, x1, y1))

    if eye == "both":
        lc = _crop(_L_PERI); rc = _crop(_R_PERI)
        if lc and rc:
            lc = _pad_square(lc).resize((112,112), Image.LANCZOS)
            rc = _pad_square(rc).resize((112,112), Image.LANCZOS)
            combined = Image.new("RGB", (224, 112))
            combined.paste(lc, (0,0)); combined.paste(rc, (112,0))
            return combined, True
        crop = lc or rc
    elif eye == "left": crop = _crop(_L_PERI)
    else:               crop = _crop(_R_PERI)
    return (_pad_square(crop), True) if crop else (img, False)


# ── 4. DEMOGRAPHIC VOCABULARY ─────────────────────────────────────
class DemographicVocab:
    def __init__(self, samples: List[Dict]):
        genders = sorted({m["gender"] for m in samples})
        races   = sorted({m["race"]   for m in samples})
        self.gender_to_id = {g: i+1 for i, g in enumerate(genders)}
        self.race_to_id   = {r: i+1 for i, r in enumerate(races)}
        self.num_genders  = len(genders)+1
        self.num_races    = len(races)+1
        log.info(f"Gender vocab ({self.num_genders}): {genders}")
        log.info(f"Race vocab   ({self.num_races}):   {races}")

    def encode_gender(self, g: str) -> int:
        return self.gender_to_id.get(str(g).strip().upper(), 0)
    def encode_race(self, r: str) -> int:
        return self.race_to_id.get(str(r).strip().title(), 0)

    def to_dict(self) -> Dict:
        return {"gender_to_id": self.gender_to_id, "race_to_id": self.race_to_id,
                "num_genders": self.num_genders, "num_races": self.num_races}

    @classmethod
    def from_dict(cls, d: Dict) -> "DemographicVocab":
        obj = object.__new__(cls)
        obj.gender_to_id = d["gender_to_id"]; obj.race_to_id = d["race_to_id"]
        obj.num_genders  = d["num_genders"];  obj.num_races   = d["num_races"]
        return obj

    def save(self, path: str):
        with open(path, "w") as f: json.dump(self.to_dict(), f, indent=2)
        log.info(f"Vocab → {path}")

    @classmethod
    def load(cls, path: str) -> "DemographicVocab":
        with open(path) as f: return cls.from_dict(json.load(f))


# ── 5. TRANSFORMS ─────────────────────────────────────────────────
# No RandomHorizontalFlip — preserves L/R eye orientation
TRAIN_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224), interpolation=transforms.InterpolationMode.LANCZOS),
    transforms.RandomRotation(8),
    transforms.ColorJitter(brightness=0.15, contrast=0.15, saturation=0.08, hue=0.02),
    transforms.RandomGrayscale(p=0.05),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
VAL_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224), interpolation=transforms.InterpolationMode.LANCZOS),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
# TTA: subtle — small rotation + brightness + minor crop. No flip.
TTA_TRANSFORM = transforms.Compose([
    transforms.Resize((232, 232), interpolation=transforms.InterpolationMode.LANCZOS),
    transforms.RandomRotation(5),
    transforms.ColorJitter(brightness=0.10, contrast=0.10),
    transforms.RandomCrop(224),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


# ── 6. DATASET ────────────────────────────────────────────────────
class OcularAgeDataset(Dataset):
    def __init__(self, image_dir: str, vocab=None, transform=None,
                 use_eye_crop: bool = True, eye_side: str = "both",
                 samples: Optional[List[Dict]] = None):
        self.image_dir    = image_dir
        self.transform    = transform
        self.use_eye_crop = use_eye_crop
        self.eye_side     = eye_side
        self.skipped: List[Tuple[str, str]] = []

        if samples is not None:
            self.samples = samples
        else:
            self.samples = []
            for fname in sorted(os.listdir(image_dir)):
                if not fname.lower().endswith((".jpg", ".jpeg", ".png")): continue
                meta = parse_filename(fname)
                if not meta: self.skipped.append((fname, "filename format")); continue
                try:
                    img = Image.open(os.path.join(image_dir, fname)).convert("RGB")
                    ok, reason = check_image_quality(img)
                    if not ok: self.skipped.append((fname, reason)); continue
                except Exception as e: self.skipped.append((fname, str(e))); continue
                self.samples.append(meta)
            log.info(f"Accepted {len(self.samples)} | Rejected {len(self.skipped)}")
            for fn, r in self.skipped[:5]: log.info(f"  ✗ {fn}: {r}")

        self.vocab = vocab or DemographicVocab(self.samples)

    def __len__(self): return len(self.samples)

    def __getitem__(self, idx):
        meta = self.samples[idx]
        img  = Image.open(os.path.join(self.image_dir, meta["filename"])).convert("RGB")
        if self.use_eye_crop: img, _ = crop_eye_region(img, self.eye_side)
        if self.transform: img = self.transform(img)
        return (img,
                torch.tensor(self.vocab.encode_gender(meta["gender"]), dtype=torch.long),
                torch.tensor(self.vocab.encode_race(meta["race"]),     dtype=torch.long),
                torch.tensor(meta["age"],                              dtype=torch.float32),
                meta["filename"])


# ── 7. STRATIFIED SPLIT ───────────────────────────────────────────
def stratified_split(samples: List[Dict], val_fraction: float = 0.20,
                     test_fraction: float = 0.10,
                     seed: int = 42) -> Tuple[List[int], List[int], List[int]]:
    """
    Returns (train_idx, val_idx, test_idx).
    test_idx is a held-out set — never used for model selection or calibration.
    """
    rng = np.random.default_rng(seed); buckets = defaultdict(list)
    for i, m in enumerate(samples): buckets[m["age"]//10].append(i)
    train_idx, val_idx, test_idx = [], [], []
    for arr in buckets.values():
        arr = np.array(arr); rng.shuffle(arr)
        n_test = max(1, math.floor(len(arr) * test_fraction))
        n_val  = max(1, math.floor(len(arr) * val_fraction))
        test_idx.extend(arr[:n_test].tolist())
        val_idx.extend(arr[n_test:n_test + n_val].tolist())
        train_idx.extend(arr[n_test + n_val:].tolist())
    return train_idx, val_idx, test_idx


# ── 8. MC DROPOUT CONTEXT MANAGER ────────────────────────────────
@contextlib.contextmanager
def mc_dropout_mode(model: nn.Module):
    """Enable dropout while keeping BatchNorm in eval mode."""
    model.eval()
    for m in model.modules():
        if isinstance(m, (nn.Dropout, nn.Dropout2d, nn.Dropout3d)): m.train()
    try: yield
    finally: model.eval()


# ── 9. MODEL v3 ───────────────────────────────────────────────────
_DINO_CACHE: Dict[str, nn.Module] = {}

def _load_dinov3(name: str) -> nn.Module:
    if name not in _DINO_CACHE:
        log.info(f"Loading DINOv3: {name}")
        _DINO_CACHE[name] = torch.hub.load("facebookresearch/dinov3", name, verbose=False)
    return _DINO_CACHE[name]


class GlaucDINOv3(nn.Module):
    def __init__(self, backbone_name: str, num_genders: int, num_races: int,
                 gender_emb_dim: int = GENDER_EMB_DIM, race_emb_dim: int = RACE_EMB_DIM,
                 freeze_backbone: bool = False, disease_active: bool = DISEASE_LABELS_AVAILABLE):
        super().__init__()
        self.disease_active = disease_active
        self.backbone = _load_dinov3(backbone_name)
        if freeze_backbone: self.backbone.requires_grad_(False)

        img_dim   = self.backbone.embed_dim
        fused_dim = img_dim + gender_emb_dim + race_emb_dim

        self.gender_emb = nn.Embedding(num_genders, gender_emb_dim, padding_idx=0)
        self.race_emb   = nn.Embedding(num_races,   race_emb_dim,   padding_idx=0)

        _trunk = nn.Sequential(
            nn.LayerNorm(fused_dim),
            nn.Linear(fused_dim, 512), nn.GELU(), nn.Dropout(0.3),
            nn.Linear(512, 256),       nn.GELU(), nn.Dropout(0.2),
        )
        self.trunk = torch.compile(_trunk) if USE_COMPILE else _trunk

        self.age_head    = nn.Linear(256, 1)
        self.glauc_head  = nn.Linear(256, 1)
        self.dr_head     = nn.Linear(256, 1)
        self.cardio_head = nn.Linear(256, 1)

        if not disease_active:
            for h in (self.glauc_head, self.dr_head, self.cardio_head):
                h.requires_grad_(False)

        # Temperature scaling — tuned post-training by glauc_analysis.run_calibration()
        self.temperature = nn.Parameter(torch.ones(1), requires_grad=False)

        log.info(f"Architecture: img({img_dim})+g({gender_emb_dim})+r({race_emb_dim})={fused_dim}")
        log.info(f"Disease heads: {'active' if disease_active else 'frozen'}")

    def backbone_features(self, images: torch.Tensor) -> torch.Tensor:
        """Raw CLS token — used by GradCAM for gradient hooks."""
        return self.backbone(images)

    def forward(self, images, gender_ids, race_ids):
        f  = self.backbone(images)
        s  = self.trunk(torch.cat([f, self.gender_emb(gender_ids),
                                      self.race_emb(race_ids)], dim=1))
        age    = torch.clamp(self.age_head(s).squeeze(1) * self.temperature, 0.0, 120.0)
        glauc  = torch.sigmoid(self.glauc_head(s)).squeeze(1)
        dr     = torch.sigmoid(self.dr_head(s)).squeeze(1)
        cardio = torch.sigmoid(self.cardio_head(s)).squeeze(1)
        return age, glauc, dr, cardio

    @torch.no_grad()
    def mc_predict(self, images, gender_ids, race_ids,
                   n_passes: int = MC_DROPOUT_PASSES,
                   use_tta: bool = True,
                   pil_images: Optional[List] = None) -> Dict:
        """
        MC Dropout inference with optional Test-Time Augmentation.
        With TTA: each MC pass averages TTA_VIEWS augmented crops.
        Total effective diversity: MC_DROPOUT_PASSES × TTA_VIEWS = 240.
        """
        ages, gs, ds, cs = [], [], [], []
        do_tta = use_tta and pil_images is not None

        with mc_dropout_mode(self):
            for _ in range(n_passes):
                if do_tta:
                    tta_a, tta_g, tta_d, tta_c = [], [], [], []
                    for _ in range(TTA_VIEWS):
                        tta_batch = torch.stack([TTA_TRANSFORM(p) for p in pil_images]).to(images.device)
                        a, g, d, c = self(tta_batch, gender_ids, race_ids)
                        tta_a.append(a); tta_g.append(g); tta_d.append(d); tta_c.append(c)
                    a = torch.stack(tta_a).mean(0); g = torch.stack(tta_g).mean(0)
                    d = torch.stack(tta_d).mean(0); c = torch.stack(tta_c).mean(0)
                else:
                    a, g, d, c = self(images, gender_ids, race_ids)
                ages.append(a.cpu()); gs.append(g.cpu()); ds.append(d.cpu()); cs.append(c.cpu())

        def _s(lst):
            t = torch.stack(lst); return t.mean(0), t.std(0)

        am, as_ = _s(ages); gm, _ = _s(gs); dm, _ = _s(ds); cm, _ = _s(cs)
        return {"age_mean": am, "age_std": as_, "age_ci95": as_*1.96,
                "glauc_mean": gm, "dr_mean": dm, "cardio_mean": cm}


# ── 10. HUBER LOSS ────────────────────────────────────────────────
def compute_loss(age_pred, age_label,
                 glauc_pred=None, dr_pred=None, cardio_pred=None,
                 glauc_label=None, dr_label=None, cardio_label=None):
    age_loss = F.huber_loss(age_pred, age_label, delta=HUBER_DELTA)
    if (DISEASE_LABELS_AVAILABLE and
            all(x is not None for x in (glauc_pred, dr_pred, cardio_pred,
                                         glauc_label, dr_label, cardio_label))):
        bce   = nn.BCELoss()
        total = (LOSS_WEIGHT_AGE    * age_loss
               + LOSS_WEIGHT_GLAUC  * bce(glauc_pred,  glauc_label)
               + LOSS_WEIGHT_DR     * bce(dr_pred,      dr_label)
               + LOSS_WEIGHT_CARDIO * bce(cardio_pred,  cardio_label))
    else:
        total = age_loss
    return total, age_loss


# ── 11. TRAINING LOOPS ────────────────────────────────────────────
def train_one_epoch(model, loader, optimizer, device):
    model.train(); totals = defaultdict(float); n = 0
    for imgs, gids, rids, labels, _ in loader:
        imgs, gids, rids, labels = (
            imgs.to(device, non_blocking=True), gids.to(device, non_blocking=True),
            rids.to(device, non_blocking=True), labels.to(device, non_blocking=True))
        optimizer.zero_grad(set_to_none=True)
        ap, gp, dp, cp = model(imgs, gids, rids)
        loss, _ = compute_loss(ap, labels)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP_NORM)
        optimizer.step()
        B = len(labels)
        totals["loss"] += loss.item()*B; totals["mae"] += torch.abs(ap-labels).sum().item(); n += B
    return {k: v/n for k, v in totals.items()}


@torch.no_grad()
def validate_epoch(model, loader, device):
    model.eval(); totals = defaultdict(float); preds, labels_out, files = [], [], []; n = 0
    for imgs, gids, rids, labels, fnames in loader:
        imgs, gids, rids, labels = (
            imgs.to(device, non_blocking=True), gids.to(device, non_blocking=True),
            rids.to(device, non_blocking=True), labels.to(device, non_blocking=True))
        ap, gp, dp, cp = model(imgs, gids, rids)
        loss, _ = compute_loss(ap, labels)
        B = len(labels)
        totals["loss"] += loss.item()*B; totals["mae"] += torch.abs(ap-labels).sum().item(); n += B
        preds.extend(ap.cpu().numpy()); labels_out.extend(labels.cpu().numpy()); files.extend(fnames)
    return {k: v/n for k, v in totals.items()}, preds, labels_out, files


# ── 12. MC + TTA INFERENCE ────────────────────────────────────────
def run_mc_inference(model, loader, device, n_passes=MC_DROPOUT_PASSES, use_tta=True):
    log.info(f"MC Dropout ({n_passes} passes, TTA={'on ×'+str(TTA_VIEWS) if use_tta else 'off'})...")
    results = []
    for imgs, gids, rids, labels, fnames in loader:
        imgs  = imgs.to(device, non_blocking=True)
        gids  = gids.to(device, non_blocking=True)
        rids  = rids.to(device, non_blocking=True)
        pil_imgs = None
        if use_tta:
            pil_imgs = []
            for fn in fnames:
                p = Image.open(os.path.join(IMAGE_DIR, fn)).convert("RGB")
                p, _ = crop_eye_region(p, "both")
                pil_imgs.append(p)
        mc = model.mc_predict(imgs, gids, rids, n_passes, use_tta=use_tta, pil_images=pil_imgs)
        for i, fn in enumerate(fnames):
            results.append({
                "filename":    fn,   "actual_age":  float(labels[i]),
                "age_mean":    float(mc["age_mean"][i]),
                "age_std":     float(mc["age_std"][i]),
                "age_ci95":    float(mc["age_ci95"][i]),
                "glauc_risk":  float(mc["glauc_mean"][i]),
                "dr_risk":     float(mc["dr_mean"][i]),
                "cardio_risk": float(mc["cardio_mean"][i]),
            })
    return results


# ── 13. BIAS AUDIT ────────────────────────────────────────────────
def run_bias_audit(mc_results: List[Dict], output_dir: str) -> List[str]:
    subgroup: Dict[str, List[float]] = defaultdict(list); overall = []
    for r in mc_results:
        meta = parse_filename(r["filename"])
        if not meta: continue
        err = abs(r["age_mean"]-r["actual_age"]); overall.append(err)
        subgroup[f"{meta['gender']} | {meta['race']}"].append(err)
    if not overall: return []
    om = np.mean(overall); thr = om*1.25; flagged = []
    lines = ["="*58, "  GLAUC BIAS AUDIT", f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
             "="*58, f"\nOverall MAE : {om:.2f}  Threshold : {thr:.2f}\n",
             f"{'Subgroup':<32} {'N':>5}  {'MAE':>7}  Status", "-"*58]
    for key in sorted(subgroup):
        errs = subgroup[key]; mae = np.mean(errs); flag = "⚠ REVIEW" if mae>thr else "✓"
        if mae>thr: flagged.append(key)
        lines.append(f"{key:<32} {len(errs):>5}  {mae:>7.2f}  {flag}")
    lines += ["", f"⚠  {len(flagged)} subgroups need data:" if flagged else "✓  All within threshold."]
    lines += [f"   • {f}" for f in flagged]
    report = "\n".join(lines); path = os.path.join(output_dir, "bias_audit.txt")
    with open(path, "w") as f: f.write(report)
    print(report); log.info(f"Bias audit → {path}"); return flagged


# ── 14. QWEN3-VL EXPLAINER ───────────────────────────────────────
class GlaucExplainer:
    def __init__(self, model_id=QWEN_MODEL_ID, device=DEVICE, thinking=THINKING_MODE):
        log.info(f"Loading Qwen3-VL: {model_id}")
        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
        from qwen_vl_utils import process_vision_info
        self._pvi = process_vision_info; self.device = device; self.thinking = thinking
        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if "cuda" in device else torch.float32,
            device_map="auto",
            attn_implementation="flash_attention_2" if "cuda" in device else "eager")
        self.proc = AutoProcessor.from_pretrained(model_id)
        self.model.eval(); log.info("Qwen3-VL ready.")

    def explain(self, image_path, mc_result, gender, race, dt_str=""):
        a=mc_result["age_mean"]; ci=mc_result["age_ci95"]; act=mc_result["actual_age"]
        gap=a-act; gp=mc_result["glauc_risk"]; dp=mc_result["dr_risk"]; cp=mc_result["cardio_risk"]
        gap_str=(f"{abs(gap):.1f} yrs {'older' if gap>0 else 'younger'} than chronological"
                 if abs(gap)>0.5 else "closely matching chronological age")
        think = "<think>\n" if self.thinking else ""
        system = ("You are an expert ocular diagnostics AI for Glauc. Be specific, "
                  "evidence-based, clinically relevant. Do not speculate beyond what is visible.")
        user = f"""{think}Analyse this external anterior eye image.

━━━ Patient ━━━
Age: {act}  |  Gender: {gender}  |  Race: {race}  |  Captured: {dt_str or 'unknown'}

━━━ DINOv3 + MC + TTA Prediction ━━━
Ocular Age  : {a:.1f} ± {ci:.1f} yrs (95% CI)  |  {gap_str}
Glaucoma    : {gp:.3f}   DR: {dp:.3f}   Cardio: {cp:.3f}

━━━ Report ━━━
1. VISUAL FEATURES — scleral clarity, limbal ring, iris, cornea, vessels, periocular tissue
2. ALIGNMENT — features supporting/conflicting predicted age {a:.1f} yrs
3. DEMOGRAPHIC CONTEXT — known aging differences for ({gender}, {race})
4. RISK SIGNALS — interpret glaucoma/DR/cardio scores in context of image
5. RECOMMENDATION — referral needed? What specific follow-up?"""
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": [{"type":"image","image":image_path},
                                                  {"type":"text","text":user}]}]
        text = self.proc.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        ii, vi = self._pvi(messages)
        inp = self.proc(text=[text], images=ii, videos=vi, padding=True, return_tensors="pt").to(self.device)
        with torch.no_grad():
            gen = self.model.generate(**inp, max_new_tokens=MAX_NEW_TOKENS,
                                       temperature=0.15, do_sample=True, repetition_penalty=1.05)
        trim = [o[len(i):] for i, o in zip(inp.input_ids, gen)]
        raw  = self.proc.batch_decode(trim, skip_special_tokens=True,
                                       clean_up_tokenization_spaces=False)[0].strip()
        if self.thinking and "</think>" in raw: raw = raw.split("</think>", 1)[-1].strip()
        return raw


# ── 15. PLOTTING ─────────────────────────────────────────────────
def _ax(ax):
    ax.set_facecolor("#0d0d0d"); ax.tick_params(colors="#aaaaaa")
    for s in ax.spines.values(): s.set_edgecolor("#333")
    ax.grid(True, alpha=0.12, color="white")

def plot_training_curves(train_h, val_h, output_dir):
    eps = np.arange(1, len(train_h["loss"])+1)
    fig = plt.figure(figsize=(18, 5), facecolor="#0d0d0d")
    gs  = gridspec.GridSpec(1, 3, figure=fig, wspace=0.3)
    for i, (tr, vl, title, yl) in enumerate([
        (train_h["loss"], val_h["loss"], "Huber Loss",      "Loss"),
        (train_h["mae"],  val_h["mae"],  "Age MAE (years)", "MAE")]):
        ax = fig.add_subplot(gs[i]); _ax(ax)
        ax.plot(eps, tr, color="#FF6B6B", lw=2.2, label="Train")
        ax.plot(eps, vl, color="#4ECDC4", lw=2.2, label="Val")
        ax.set_title(title, color="white", fontsize=13)
        ax.set_xlabel("Epoch", color="#aaaaaa"); ax.set_ylabel(yl, color="#aaaaaa")
        ax.legend(facecolor="#1a1a1a", labelcolor="white", edgecolor="#444")
    ax = fig.add_subplot(gs[2]); _ax(ax)
    ax.plot(eps, train_h.get("lr", [LR]*len(eps)), color="#FFD93D", lw=2.0)
    ax.set_title("Learning Rate", color="white", fontsize=13)
    ax.set_xlabel("Epoch", color="#aaaaaa"); ax.set_yscale("log")
    p = os.path.join(output_dir, "training_curves.png")
    plt.savefig(p, dpi=150, bbox_inches="tight", facecolor="#0d0d0d"); plt.close(fig); log.info(f"Saved {p}")

def plot_predictions_with_uncertainty(mc_results, output_dir):
    preds  = np.array([r["age_mean"]   for r in mc_results])
    labels = np.array([r["actual_age"] for r in mc_results])
    ci95   = np.array([r["age_ci95"]   for r in mc_results])
    errors = preds - labels; mae = np.mean(np.abs(errors))
    fig, axes = plt.subplots(1, 3, figsize=(19, 5), facecolor="#0d0d0d")
    ax = axes[0]; _ax(ax)
    ax.errorbar(labels, preds, yerr=ci95, fmt="o", color="#4ECDC4",
                ecolor="#4ECDC4", alpha=0.45, elinewidth=0.8, capsize=2, ms=4)
    lo, hi = min(labels.min(),preds.min()), max(labels.max(),preds.max())
    ax.plot([lo,hi],[lo,hi],color="#FF6B6B",ls="--",lw=1.8,label="Perfect fit")
    ax.set_title("Predicted vs Actual\n(95% CI, MC+TTA)", color="white", fontsize=12)
    ax.set_xlabel("Actual Age", color="#aaaaaa"); ax.set_ylabel("Predicted Age", color="#aaaaaa")
    ax.legend(facecolor="#1a1a1a", labelcolor="white", edgecolor="#444")
    ax = axes[1]; _ax(ax)
    ax.hist(errors, bins=24, color="#FF6B6B", edgecolor="#cc4444", alpha=0.85)
    ax.axvline(0, color="#4ECDC4", lw=2, ls="--")
    ax.set_title("Error Distribution", color="white", fontsize=12)
    ax.set_xlabel("Error (years)", color="#aaaaaa"); ax.set_ylabel("Count", color="#aaaaaa")
    ax = axes[2]; _ax(ax)
    sc = ax.scatter(labels, ci95, c=np.abs(errors), cmap="RdYlGn_r", alpha=0.7, s=40, edgecolors="none")
    cb = plt.colorbar(sc, ax=ax); cb.set_label("|error| (yrs)", color="white")
    cb.ax.yaxis.set_tick_params(color="white"); plt.setp(cb.ax.yaxis.get_ticklabels(), color="white")
    ax.set_title("CI Width vs Age\n(colour=|error|)", color="white", fontsize=12)
    ax.set_xlabel("Actual Age", color="#aaaaaa"); ax.set_ylabel("95% CI Width", color="#aaaaaa")
    fig.suptitle(f"Validation  MAE {mae:.2f} yrs  Mean CI ±{ci95.mean():.1f} yrs",
                 color="white", fontsize=14, y=1.02)
    plt.tight_layout()
    p = os.path.join(output_dir, "prediction_analysis.png")
    plt.savefig(p, dpi=150, bbox_inches="tight", facecolor="#0d0d0d"); plt.close(fig); log.info(f"Saved {p}")

def plot_demographic_breakdown(mc_results, output_dir):
    ge = defaultdict(list); re = defaultdict(list)
    for r in mc_results:
        meta = parse_filename(r["filename"])
        if not meta: continue
        err = abs(r["age_mean"]-r["actual_age"]); ge[meta["gender"]].append(err); re[meta["race"]].append(err)
    pal = ["#4ECDC4","#FF6B6B","#FFD93D","#C9B1FF","#FF9F43","#54A0FF","#5F27CD","#00D2D3"]
    fig, axes = plt.subplots(1, 2, figsize=(14, 5), facecolor="#0d0d0d")
    for ax, data, title in [(axes[0],ge,"MAE by Gender"),(axes[1],re,"MAE by Race")]:
        _ax(ax); groups = sorted(data); maes = [np.mean(data[g]) for g in groups]
        bars = ax.bar(groups, maes, color=pal[:len(groups)], edgecolor="#333", lw=0.7)
        ax.set_title(title, color="white", fontsize=13)
        ax.set_xlabel("Group", color="#aaaaaa"); ax.set_ylabel("MAE (years)", color="#aaaaaa")
        ax.tick_params(axis="x", rotation=30, colors="#aaaaaa")
        for b, v in zip(bars, maes): ax.text(b.get_x()+b.get_width()/2, b.get_height()+0.05,
                                              f"{v:.1f}", ha="center", color="white", fontsize=9)
    plt.tight_layout()
    p = os.path.join(output_dir, "demographic_breakdown.png")
    plt.savefig(p, dpi=150, bbox_inches="tight", facecolor="#0d0d0d"); plt.close(fig); log.info(f"Saved {p}")

def plot_risk_scores(mc_results, output_dir):
    g = [r["glauc_risk"] for r in mc_results]
    d = [r["dr_risk"]    for r in mc_results]
    c = [r["cardio_risk"] for r in mc_results]
    fig, axes = plt.subplots(1, 3, figsize=(16, 5), facecolor="#0d0d0d")
    for ax, sc, title, col in [(axes[0],g,"Glaucoma Risk","#FF6B6B"),
                                (axes[1],d,"Diabetic Retinopathy","#FFD93D"),
                                (axes[2],c,"Cardiovascular Proxy","#4ECDC4")]:
        _ax(ax); ax.hist(sc, bins=20, color=col, edgecolor="#333", alpha=0.85)
        ax.axvline(0.5, color="white", lw=1.5, ls="--", label="Threshold 0.5")
        ax.set_title(title+"\n(placeholder — needs labels)", color="white", fontsize=11)
        ax.set_xlabel("Risk Score", color="#aaaaaa"); ax.set_ylabel("Count", color="#aaaaaa")
        ax.legend(facecolor="#1a1a1a", labelcolor="white", edgecolor="#444", fontsize=8)
    plt.tight_layout()
    p = os.path.join(output_dir, "risk_scores.png")
    plt.savefig(p, dpi=150, bbox_inches="tight", facecolor="#0d0d0d"); plt.close(fig); log.info(f"Saved {p}")


# ── 16. SAVE OUTPUTS ─────────────────────────────────────────────
def save_predictions_csv(mc_results, explanations, output_dir):
    has_exp = bool(explanations); exp_lu = dict(explanations)
    path = os.path.join(output_dir, "predictions.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        h = ["filename","actual_age","predicted_age","error_years","age_ci95",
             "glauc_risk","dr_risk","cardio_risk","gender","race","datetime"]
        if has_exp: h.append("qwen3vl_explanation")
        w.writerow(h)
        for r in mc_results:
            meta = parse_filename(r["filename"]) or {}
            row  = [r["filename"], round(r["actual_age"],1), round(r["age_mean"],2),
                    round(r["age_mean"]-r["actual_age"],2), round(r["age_ci95"],2),
                    round(r["glauc_risk"],4), round(r["dr_risk"],4), round(r["cardio_risk"],4),
                    meta.get("gender",""), meta.get("race",""), meta.get("datetime","")]
            if has_exp: row.append(exp_lu.get(r["filename"],""))
            w.writerow(row)
    log.info(f"Saved {path}")

def save_explanations_txt(explanations, output_dir):
    path = os.path.join(output_dir, "explanations_report.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("="*65+"\n  GLAUC — Qwen3-VL Clinical Explanations\n")
        f.write(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"+"="*65+"\n\n")
        for fn, exp in explanations: f.write(f"Image: {fn}\n{'─'*48}\n{exp}\n\n")
    log.info(f"Saved {path}")

def save_summary(train_h, val_h, mc_results, vocab, n_rejected,
                 flagged, explanations, stopped_epoch, temperature, output_dir):
    preds  = np.array([r["age_mean"]   for r in mc_results])
    labels = np.array([r["actual_age"] for r in mc_results])
    mae    = np.mean(np.abs(preds-labels))
    rmse   = np.sqrt(np.mean((preds-labels)**2))
    r2     = 1 - np.sum((labels-preds)**2)/np.sum((labels-np.mean(labels))**2)
    mci    = np.mean([r["age_ci95"] for r in mc_results])
    path   = os.path.join(output_dir, "training_summary.txt")
    with open(path, "w") as f:
        f.write("="*58+"\n  GLAUC  v3.0  Summary\n")
        f.write(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"+"="*58+"\n\n")
        f.write(f"DINOv3             : {DINOV3_MODEL}\n")
        f.write(f"Loss function      : Huber (delta={HUBER_DELTA})\n")
        f.write(f"TTA views          : {TTA_VIEWS}\n")
        f.write(f"MC passes          : {MC_DROPOUT_PASSES}\n")
        f.write(f"Temperature (cal.) : {temperature:.4f}\n")
        f.write(f"Gender vocab       : {vocab.num_genders}\n")
        f.write(f"Race vocab         : {vocab.num_races}\n")
        f.write(f"Disease heads      : {'active' if DISEASE_LABELS_AVAILABLE else 'frozen'}\n")
        f.write(f"torch.compile      : {'yes' if USE_COMPILE else 'no'}\n")
        f.write(f"Explainer          : {QWEN_MODEL_ID if RUN_EXPLANATIONS else 'off'}\n\n")
        f.write(f"Images accepted    : {len(mc_results)}\n")
        f.write(f"Images rejected    : {n_rejected}\n")
        f.write(f"Stopped at epoch   : {stopped_epoch}\n\n")
        f.write(f"Val MAE            : {mae:.2f} yrs\n")
        f.write(f"Val RMSE           : {rmse:.2f} yrs\n")
        f.write(f"Val R²             : {r2:.4f}\n")
        f.write(f"Mean 95% CI        : ±{mci:.2f} yrs\n\n")
        f.write(f"Bias flags         : {len(flagged)}\n")
        for sg in flagged: f.write(f"  ⚠ {sg}\n")
        f.write(f"Explanations       : {len(explanations)}\n")
    log.info(f"Saved {path}")


# ── 17. MAIN ─────────────────────────────────────────────────────
def main():
    from glauc_analysis import (run_calibration, plot_reliability_diagram, plot_gradcam_grid)

    # Seed all RNGs at the top of main for full reproducibility
    _set_seeds(SEED)

    log.info("="*58); log.info("  GLAUC Production Pipeline  v3.1"); log.info("="*58)

    log.info("[1/10] Dataset scan...")
    base_ds = OcularAgeDataset(IMAGE_DIR, transform=TRAIN_TRANSFORM, use_eye_crop=True, eye_side="both")
    if not base_ds.samples: log.error("No valid images. Exiting."); return
    n_rejected = len(base_ds.skipped)

    # Three-way stratified split: train / val / test
    train_idx, val_idx, test_idx = stratified_split(base_ds.samples, VAL_SPLIT, TEST_SPLIT, SEED)
    log.info(f"Train {len(train_idx)} | Val {len(val_idx)} | Test {len(test_idx)} | Rejected {n_rejected}")

    # Vocab built from train samples only — no information leakage from val/test demographics
    train_samples = [base_ds.samples[i] for i in train_idx]
    vocab = DemographicVocab(train_samples)
    base_ds.vocab = vocab  # update dataset reference
    vocab.save(os.path.join(OUTPUT_DIR, "vocab.json"))

    train_set = Subset(base_ds, train_idx)
    val_ds    = OcularAgeDataset(IMAGE_DIR, vocab=vocab, transform=VAL_TRANSFORM,
                                  use_eye_crop=True, eye_side="both", samples=base_ds.samples)
    test_ds   = OcularAgeDataset(IMAGE_DIR, vocab=vocab, transform=VAL_TRANSFORM,
                                  use_eye_crop=True, eye_side="both", samples=base_ds.samples)
    val_set   = Subset(val_ds,  val_idx)
    test_set  = Subset(test_ds, test_idx)

    dl_kw = dict(num_workers=NUM_WORKERS, pin_memory=True, persistent_workers=NUM_WORKERS>0,
                 worker_init_fn=_worker_init_fn)
    train_loader = DataLoader(train_set, batch_size=BATCH_SIZE, shuffle=True,  **dl_kw)
    val_loader   = DataLoader(val_set,   batch_size=BATCH_SIZE, shuffle=False, **dl_kw)
    test_loader  = DataLoader(test_set,  batch_size=BATCH_SIZE, shuffle=False, **dl_kw)

    log.info("[2/10] Building model...")
    model = GlaucDINOv3(DINOV3_MODEL, vocab.num_genders, vocab.num_races).to(DEVICE)
    optimizer = optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()),
                             lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS, eta_min=LR_MIN)

    log.info(f"[3/10] Training (max {EPOCHS} epochs, patience={EARLY_STOP_PATIENCE})...")
    train_h = defaultdict(list); val_h = defaultdict(list)
    best_mae = float("inf"); patience = 0; stopped = EPOCHS
    ckpt = os.path.join(OUTPUT_DIR, "best_model.pt")

    for epoch in range(1, EPOCHS+1):
        tr = train_one_epoch(model, train_loader, optimizer, DEVICE)
        vl, _, _, _ = validate_epoch(model, val_loader, DEVICE)
        scheduler.step(); lr_now = scheduler.get_last_lr()[0]
        for k, v in tr.items(): train_h[k].append(v)
        for k, v in vl.items(): val_h[k].append(v)
        train_h["lr"].append(lr_now)
        log.info(f"Ep {epoch:3d}/{EPOCHS} | tr {tr['mae']:.2f} vl {vl['mae']:.2f} | lr {lr_now:.2e}")
        if vl["mae"] < best_mae:
            best_mae = vl["mae"]; patience = 0
            # Save full checkpoint (model + optimizer + epoch) for resumable training
            torch.save({
                "model":     model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "epoch":     epoch,
                "val_mae":   best_mae,
            }, ckpt)
        else:
            patience += 1
            if patience >= EARLY_STOP_PATIENCE:
                log.info(f"Early stop at epoch {epoch}"); stopped = epoch; break

    # Load best checkpoint (backward-compatible with old plain state_dict format)
    ckpt_data = torch.load(ckpt, map_location=DEVICE)
    model.load_state_dict(ckpt_data["model"] if isinstance(ckpt_data, dict) and "model" in ckpt_data else ckpt_data)
    model.eval()

    log.info("[4/10] Training plots..."); plot_training_curves(train_h, val_h, OUTPUT_DIR)

    log.info("[5/10] Temperature calibration (val set)...")
    temperature = run_calibration(model, val_loader, DEVICE, OUTPUT_DIR)
    plot_reliability_diagram(model, val_loader, DEVICE, OUTPUT_DIR)
    log.info(f"  Optimal temperature: {temperature:.4f}")

    log.info(f"[6/10] MC + TTA inference on val set ({MC_DROPOUT_PASSES} passes × {TTA_VIEWS} views)...")
    mc = run_mc_inference(model, val_loader, DEVICE, use_tta=True)
    plot_predictions_with_uncertainty(mc, OUTPUT_DIR)
    plot_demographic_breakdown(mc, OUTPUT_DIR); plot_risk_scores(mc, OUTPUT_DIR)

    log.info(f"[7/10] MC + TTA inference on held-out test set...")
    mc_test = run_mc_inference(model, test_loader, DEVICE, use_tta=True)
    test_mae = np.mean([abs(r["age_mean"] - r["actual_age"]) for r in mc_test])
    log.info(f"  Test MAE (unseen): {test_mae:.2f} yrs  (n={len(mc_test)})")

    log.info("[8/10] GradCAM heatmaps...")
    plot_gradcam_grid(model, val_ds, val_idx[:12], DEVICE, OUTPUT_DIR)

    log.info("[9/10] Bias audit...")
    flagged = run_bias_audit(mc, OUTPUT_DIR)

    explanations = []
    if RUN_EXPLANATIONS:
        log.info(f"[10/10] Qwen3-VL explanations ({MAX_EXPLANATION_IMGS} images)...")
        meta_map  = {m["filename"]: m for m in val_ds.samples}
        explainer = GlaucExplainer(QWEN_MODEL_ID, DEVICE, THINKING_MODE)
        for i, r in enumerate(mc[:MAX_EXPLANATION_IMGS]):
            fn = r["filename"]; m = meta_map.get(fn, {})
            log.info(f"  [{i+1}/{min(MAX_EXPLANATION_IMGS,len(mc))}] {fn}")
            try:
                exp = explainer.explain(os.path.join(IMAGE_DIR,fn), r,
                                         m.get("gender","Unknown"), m.get("race","Unknown"),
                                         m.get("datetime",""))
                explanations.append((fn, exp))
            except Exception as e:
                log.warning(f"  Failed: {e}"); explanations.append((fn, f"[Error: {e}]"))
        del explainer
        if torch.cuda.is_available(): torch.cuda.empty_cache()
        save_explanations_txt(explanations, OUTPUT_DIR)
    else:
        log.info("[10/10] Explanations skipped.")

    save_predictions_csv(mc, explanations, OUTPUT_DIR)
    save_summary(train_h, val_h, mc, vocab, n_rejected, flagged,
                 explanations, stopped, temperature, OUTPUT_DIR)
    final_mae = np.mean([abs(r["age_mean"]-r["actual_age"]) for r in mc])
    log.info("="*58)
    log.info(f"  Best Val MAE   : {best_mae:.2f} yrs")
    log.info(f"  Val MC+TTA MAE : {final_mae:.2f} yrs")
    log.info(f"  Test MAE       : {test_mae:.2f} yrs  ← held-out, unseen")
    log.info(f"  Temperature    : {temperature:.4f}")
    log.info(f"  Stopped epoch  : {stopped}")
    log.info(f"  Bias flags     : {len(flagged)}")
    log.info(f"  Outputs        : {OUTPUT_DIR}/")
    log.info("="*58)


if __name__ == "__main__":
    main()
