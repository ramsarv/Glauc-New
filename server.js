/**
 * glauc-gateway/server.js
 * ══════════════════════════════════════════════════════════════
 * Glauc Node.js API Gateway  v1.0
 *
 * Sits between the React Native app and the Python model server.
 * Responsibilities:
 *   • Auth (JWT)               — validates user tokens
 *   • Rate limiting            — 10 scans/day per user
 *   • Input validation         — file size, type, metadata
 *   • Image preprocessing      — compress before forwarding to Python
 *   • User management          — SQLite user store
 *   • Push notifications       — 90-day retest reminders
 *   • Forwards to Python API   — proxies /predict, /explain, /trend
 *
 * Stack: Node 20 · Express 5 · Multer · Sharp · Better-SQLite3
 *        Jose (JWT) · node-fetch · nodemailer (reminders)
 *
 * Run:
 *   npm install
 *   node server.js
 *
 * Env vars (set in .env):
 *   JWT_SECRET        — random 64-char hex string
 *   PYTHON_API_URL    — http://localhost:8000  (your glauc_api.py)
 *   PORT              — 3000
 *   NODE_ENV          — development | production
 */

import "dotenv/config";
import express           from "express";
import multer            from "multer";
import sharp             from "sharp";
import Database          from "better-sqlite3";
import { SignJWT, jwtVerify } from "jose";
import fetch             from "node-fetch";
import FormData          from "form-data";
import { randomUUID, createHash } from "crypto";
import { readFileSync }  from "fs";
import path              from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CONFIG ────────────────────────────────────────────────────
const PORT           = process.env.PORT           || 3000;
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
const JWT_SECRET_RAW = process.env.JWT_SECRET     || "change-me-in-production-use-64-char-hex";
const JWT_SECRET     = new TextEncoder().encode(JWT_SECRET_RAW);
const MAX_SCANS_DAY  = parseInt(process.env.MAX_SCANS_DAY || "10");
const MAX_FILE_MB    = 15;


// ── DATABASE ──────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "glauc_users.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name         TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    reminder_enabled INTEGER DEFAULT 1,
    last_scan_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Prepared statements
const stmts = {
  findByEmail:    db.prepare("SELECT * FROM users WHERE email = ?"),
  findById:       db.prepare("SELECT * FROM users WHERE id = ?"),
  createUser:     db.prepare(`INSERT INTO users (id, email, password_hash, name)
                              VALUES (?, ?, ?, ?)`),
  scansToday:     db.prepare(`SELECT COUNT(*) AS n FROM scan_log
                              WHERE user_id = ? AND date(created_at) = date('now')`),
  logScan:        db.prepare(`INSERT INTO scan_log (id, user_id) VALUES (?, ?)`),
  updateLastScan: db.prepare(`UPDATE users SET last_scan_at = datetime('now') WHERE id = ?`),
};


// ── APP SETUP ─────────────────────────────────────────────────
const app    = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG and WebP images are accepted."));
    }
    cb(null, true);
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS — restrict to your app domain in production
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin",  "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.path}`);
  next();
});


// ── AUTH HELPERS ──────────────────────────────────────────────
const hashPassword  = (pw) => createHash("sha256").update(pw + JWT_SECRET_RAW).digest("hex");
const anonymiseId   = (id) => createHash("sha256").update(id).digest("hex").slice(0, 32);

async function signToken(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_SECRET);
}

async function verifyToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid token." });
  }
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Token expired or invalid." });
  }
}


// ── RATE LIMITER ──────────────────────────────────────────────
function checkRateLimit(req, res, next) {
  const { n } = stmts.scansToday.get(req.userId);
  if (n >= MAX_SCANS_DAY) {
    return res.status(429).json({
      error:   "Daily scan limit reached.",
      message: `You can perform up to ${MAX_SCANS_DAY} scans per day.`,
      resetAt: "midnight UTC",
    });
  }
  next();
}


// ── ROUTES ────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({
    status:    "ok",
    gateway:   "glauc-node-gateway",
    version:   "1.0.0",
    timestamp: new Date().toISOString(),
  });
});


// ── AUTH: POST /auth/register ─────────────────────────────────
app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  if (stmts.findByEmail.get(email)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const userId      = randomUUID();
  const passwordHash = hashPassword(password);

  try {
    stmts.createUser.run(userId, email.toLowerCase().trim(), passwordHash, name || "");
    const token = await signToken(userId);
    return res.status(201).json({
      token,
      user: { id: anonymiseId(userId), email, name },
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Registration failed." });
  }
});


// ── AUTH: POST /auth/login ────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = stmts.findByEmail.get(email?.toLowerCase()?.trim() || "");

  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = await signToken(user.id);
  return res.json({
    token,
    user: { id: anonymiseId(user.id), email: user.email, name: user.name },
  });
});


// ── AUTH: GET /auth/me ────────────────────────────────────────
app.get("/auth/me", verifyToken, (req, res) => {
  const user = stmts.findById.get(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({
    id:       anonymiseId(user.id),
    email:    user.email,
    name:     user.name,
    joinedAt: user.created_at,
    lastScan: user.last_scan_at,
    scansToday: stmts.scansToday.get(user.id).n,
  });
});


// ── PREDICT: POST /scan ───────────────────────────────────────
app.post("/scan", verifyToken, checkRateLimit, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded." });
  }

  const { gender, race, age, datetime_str = "" } = req.body;

  // Validate metadata
  if (!gender || !race || !age) {
    return res.status(400).json({ error: "gender, race, and age are required." });
  }
  const ageInt = parseInt(age);
  if (isNaN(ageInt) || ageInt < 10 || ageInt > 110) {
    return res.status(400).json({ error: "age must be a number between 10 and 110." });
  }

  // Compress + normalise image with Sharp before forwarding
  // This reduces payload size by ~60-70% and standardises format
  let processedBuffer;
  try {
    processedBuffer = await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();
  } catch (err) {
    return res.status(422).json({ error: "Image could not be processed.", detail: err.message });
  }

  // Anonymised user ID for Python API (never send raw user ID)
  const anonId = anonymiseId(req.userId);

  // Forward to Python model API
  const form = new FormData();
  form.append("file",         processedBuffer, { filename: "eye.jpg", contentType: "image/jpeg" });
  form.append("gender",       gender.toUpperCase().trim());
  form.append("race",         race.trim());
  form.append("age",          String(ageInt));
  form.append("user_id",      anonId);
  form.append("datetime_str", datetime_str || new Date().toISOString());

  let pythonRes;
  try {
    pythonRes = await fetch(`${PYTHON_API_URL}/predict`, {
      method:  "POST",
      body:    form,
      headers: form.getHeaders(),
      signal:  AbortSignal.timeout(60_000),    // 60s timeout
    });
  } catch (err) {
    console.error("Python API unreachable:", err.message);
    return res.status(503).json({
      error:   "Model server unreachable.",
      message: "Please try again in a moment.",
    });
  }

  if (pythonRes.status === 422) {
    const body = await pythonRes.json();
    return res.status(422).json(body);  // quality rejection — pass through
  }

  if (!pythonRes.ok) {
    const text = await pythonRes.text();
    console.error(`Python API error ${pythonRes.status}:`, text);
    return res.status(500).json({ error: "Model inference failed." });
  }

  const result = await pythonRes.json();

  // Log scan for rate limiting
  stmts.logScan.run(result.session_id || randomUUID(), req.userId);
  stmts.updateLastScan.run(req.userId);

  return res.json(result);
});


// ── EXPLAIN: GET /scan/explain/:jobId ────────────────────────
app.get("/scan/explain/:jobId", verifyToken, async (req, res) => {
  try {
    const r = await fetch(`${PYTHON_API_URL}/explain/${req.params.jobId}`,
                          { signal: AbortSignal.timeout(5_000) });
    if (!r.ok) return res.status(r.status).json({ error: "Explanation not found." });
    return res.json(await r.json());
  } catch {
    return res.status(503).json({ status: "pending" });
  }
});


// ── HISTORY: GET /history ─────────────────────────────────────
app.get("/history", verifyToken, async (req, res) => {
  const anonId = anonymiseId(req.userId);
  try {
    const r = await fetch(`${PYTHON_API_URL}/history/${anonId}`,
                          { signal: AbortSignal.timeout(10_000) });
    return res.json(await r.json());
  } catch {
    return res.status(503).json({ error: "Could not retrieve history." });
  }
});


// ── TREND: GET /trend ─────────────────────────────────────────
app.get("/trend", verifyToken, async (req, res) => {
  const anonId = anonymiseId(req.userId);
  try {
    const r = await fetch(`${PYTHON_API_URL}/trend/${anonId}`,
                          { signal: AbortSignal.timeout(10_000) });
    return res.json(await r.json());
  } catch {
    return res.status(503).json({ error: "Could not retrieve trend." });
  }
});


// ── REMINDER: POST /reminder ──────────────────────────────────
// Called by the app when user enables scan reminders.
// In production, integrate with APNs/FCM for push notifications.
app.post("/reminder", verifyToken, (req, res) => {
  const { enabled } = req.body;
  db.prepare("UPDATE users SET reminder_enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, req.userId);
  return res.json({ success: true, reminder_enabled: !!enabled });
});


// ── ERROR HANDLER ─────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `File too large. Maximum is ${MAX_FILE_MB}MB.` });
  }
  if (err.message?.includes("Only JPEG")) {
    return res.status(400).json({ error: err.message });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});


// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║  Glauc Gateway  v1.0                ║
  ║  http://localhost:${PORT}               ║
  ║  Python API: ${PYTHON_API_URL}  ║
  ╚══════════════════════════════════════╝
  `);
});
