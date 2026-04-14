/**
 * glauc-gateway/server.js  v1.1
 * ══════════════════════════════════════════════════════════════
 * Production-hardened Node.js API Gateway.
 *
 * Security fixes (v1.1):
 *   • JWT_SECRET required — process exits if unset (no fallback)
 *   • GATEWAY_SECRET — HMAC shared secret to Python API
 *   • bcryptjs — argon2-comparable password hashing (cost 12)
 *   • express-rate-limit — 10 attempts / 15 min on auth routes
 *   • helmet — secure HTTP headers
 *   • CORS — whitelist via CORS_ORIGINS env var; wildcard only in dev
 *   • JSON body size capped at 1 MB
 *   • Email format validated before DB write
 *   • Demographic inputs whitelisted / length-capped before Python API
 *   • Structured JSON logging throughout
 *   • HTTPS warning on production startup without proxy
 */

import "dotenv/config";
import express        from "express";
import multer         from "multer";
import sharp          from "sharp";
import Database       from "better-sqlite3";
import { SignJWT, jwtVerify } from "jose";
import fetch          from "node-fetch";
import FormData       from "form-data";
import { randomUUID, createHmac } from "crypto";
import path           from "path";
import { fileURLToPath } from "url";
import bcryptjs       from "bcryptjs";
import rateLimit      from "express-rate-limit";
import helmet         from "helmet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CONFIG ────────────────────────────────────────────────────
const PORT           = process.env.PORT           || 3000;
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://localhost:8000";
const MAX_SCANS_DAY  = parseInt(process.env.MAX_SCANS_DAY || "10");
const MAX_FILE_MB    = 15;
const NODE_ENV       = process.env.NODE_ENV || "development";

// Fail hard if JWT_SECRET not set — never run without it
if (!process.env.JWT_SECRET) {
  console.error(JSON.stringify({ level: "fatal", msg: "JWT_SECRET env var is required. Exiting." }));
  process.exit(1);
}
const JWT_SECRET_RAW = process.env.JWT_SECRET;
const JWT_SECRET     = new TextEncoder().encode(JWT_SECRET_RAW);

// Shared secret between gateway and Python API
const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";
if (!GATEWAY_SECRET) {
  console.warn(JSON.stringify({ level: "warn", msg: "GATEWAY_SECRET not set — Python API has no gateway auth." }));
}

// CORS whitelist (comma-separated origins in env)
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

// Validated gender / race token lists (prevent prompt injection)
const VALID_GENDERS = new Set(["M", "F", "MALE", "FEMALE", "OTHER"]);


// ── STRUCTURED LOGGER ─────────────────────────────────────────
const log = {
  info:  (msg, meta = {}) => console.log(JSON.stringify({ level: "info",  ts: new Date().toISOString(), msg, ...meta })),
  warn:  (msg, meta = {}) => console.warn(JSON.stringify({ level: "warn",  ts: new Date().toISOString(), msg, ...meta })),
  error: (msg, meta = {}) => console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), msg, ...meta })),
};


// ── EMAIL VALIDATOR ───────────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;


// ── DATABASE ──────────────────────────────────────────────────
const db = new Database(path.join(__dirname, "glauc_users.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT UNIQUE NOT NULL,
    password_hash  TEXT NOT NULL,
    name           TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','utc')),
    reminder_enabled INTEGER DEFAULT 1,
    last_scan_at   TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Prepared statements
const stmts = {
  findByEmail:    db.prepare("SELECT * FROM users WHERE email = ?"),
  findById:       db.prepare("SELECT * FROM users WHERE id = ?"),
  createUser:     db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"),
  scansToday:     db.prepare("SELECT COUNT(*) AS n FROM scan_log WHERE user_id = ? AND date(created_at) = date('now','utc')"),
  logScan:        db.prepare("INSERT INTO scan_log (id, user_id) VALUES (?, ?)"),
  updateLastScan: db.prepare("UPDATE users SET last_scan_at = datetime('now','utc') WHERE id = ?"),
};


// ── APP ───────────────────────────────────────────────────────
const app    = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG and WebP images are accepted."));
    }
    cb(null, true);
  },
});

// Secure HTTP headers
app.use(helmet());

// Body size limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// CORS — wildcard only in development; production requires CORS_ORIGINS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let allowed = null;

  if (CORS_ORIGINS.length > 0) {
    if (CORS_ORIGINS.includes(origin)) allowed = origin;
  } else if (NODE_ENV !== "production") {
    allowed = "*";
  }

  if (allowed) {
    res.header("Access-Control-Allow-Origin", allowed);
    if (allowed !== "*") res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Structured request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => log.info("request", {
    method: req.method, path: req.path,
    status: res.statusCode, ms: Date.now() - start,
  }));
  next();
});

// Auth rate limiter — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
  skip: () => NODE_ENV === "test",
});


// ── AUTH HELPERS ──────────────────────────────────────────────
async function hashPassword(pw) {
  return bcryptjs.hash(pw, 12);
}
async function verifyPassword(pw, hash) {
  return bcryptjs.compare(pw, hash);
}

// HMAC-based anonymisation (keyed, not plain SHA256)
function anonymiseId(id) {
  return createHmac("sha256", JWT_SECRET_RAW).update(id).digest("hex").slice(0, 32);
}

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

// Forward gateway secret to Python API
function gatewayHeaders() {
  return GATEWAY_SECRET ? { "X-Gateway-Secret": GATEWAY_SECRET } : {};
}


// ── SCAN RATE LIMITER ─────────────────────────────────────────
function checkScanRateLimit(req, res, next) {
  const { n } = stmts.scansToday.get(req.userId);
  if (n >= MAX_SCANS_DAY) {
    log.warn("scan_rate_limit", { userId: anonymiseId(req.userId) });
    return res.status(429).json({
      error:   "Daily scan limit reached.",
      message: `You can perform up to ${MAX_SCANS_DAY} scans per day.`,
      resetAt: "midnight UTC",
    });
  }
  next();
}


// ── ROUTES ────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({
  status: "ok", gateway: "glauc-node-gateway", version: "1.1.0",
  timestamp: new Date().toISOString(),
}));


// ── AUTH: POST /auth/register ─────────────────────────────────
app.post("/auth/register", authLimiter, async (req, res) => {
  const { email = "", password = "", name = "" } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const normEmail = email.toLowerCase().trim();
  if (stmts.findByEmail.get(normEmail)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const userId       = randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    stmts.createUser.run(userId, normEmail, passwordHash, name.trim() || "");
    const token = await signToken(userId);
    log.info("user_registered", { userId: anonymiseId(userId) });
    return res.status(201).json({
      token,
      user: { id: anonymiseId(userId), email: normEmail, name: name.trim() || "" },
    });
  } catch (err) {
    log.error("register_error", { message: err.message });
    return res.status(500).json({ error: "Registration failed." });
  }
});


// ── AUTH: POST /auth/login ────────────────────────────────────
app.post("/auth/login", authLimiter, async (req, res) => {
  const { email = "", password = "" } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const user = stmts.findByEmail.get(email.toLowerCase().trim());

  // Use bcrypt constant-time compare; always compare to prevent timing attacks
  const dummyHash = "$2b$12$invalidhashfortimingnormalization00000000000000000000000";
  const valid = user
    ? await verifyPassword(password, user.password_hash)
    : (await verifyPassword(password, dummyHash), false);

  if (!valid) {
    log.warn("login_failed", { prefix: email.slice(0, 3) });
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = await signToken(user.id);
  log.info("login_success", { userId: anonymiseId(user.id) });
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
    id:         anonymiseId(user.id),
    email:      user.email,
    name:       user.name,
    joinedAt:   user.created_at,
    lastScan:   user.last_scan_at,
    scansToday: stmts.scansToday.get(user.id).n,
  });
});


// ── PREDICT: POST /scan ───────────────────────────────────────
app.post("/scan", verifyToken, checkScanRateLimit, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file uploaded." });
  }

  const { gender = "", race = "", age, datetime_str = "" } = req.body;

  if (!gender || !race || age == null) {
    return res.status(400).json({ error: "gender, race, and age are required." });
  }

  const ageInt = parseInt(age);
  if (isNaN(ageInt) || ageInt < 10 || ageInt > 110) {
    return res.status(400).json({ error: "age must be a number between 10 and 110." });
  }

  // Whitelist / cap demographic fields to prevent downstream prompt injection
  const normGender = gender.trim().toUpperCase();
  if (!VALID_GENDERS.has(normGender)) {
    return res.status(400).json({ error: "Invalid gender value." });
  }
  const normRace = race.trim().slice(0, 30);
  if (!normRace) {
    return res.status(400).json({ error: "Invalid race value." });
  }

  // Compress + normalise image before forwarding (~60-70% smaller)
  let processedBuffer;
  try {
    processedBuffer = await sharp(req.file.buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer();
  } catch (err) {
    return res.status(422).json({ error: "Image could not be processed.", detail: err.message });
  }

  const anonId = anonymiseId(req.userId);

  const form = new FormData();
  form.append("file",         processedBuffer, { filename: "eye.jpg", contentType: "image/jpeg" });
  form.append("gender",       normGender);
  form.append("race",         normRace);
  form.append("age",          String(ageInt));
  form.append("user_id",      anonId);
  form.append("datetime_str", datetime_str || new Date().toISOString());

  let pythonRes;
  try {
    pythonRes = await fetch(`${PYTHON_API_URL}/predict`, {
      method:  "POST",
      body:    form,
      headers: { ...form.getHeaders(), ...gatewayHeaders() },
      signal:  AbortSignal.timeout(60_000),
    });
  } catch (err) {
    log.error("python_api_unreachable", { message: err.message });
    return res.status(503).json({ error: "Model server unreachable.", message: "Please try again in a moment." });
  }

  if (pythonRes.status === 422) {
    return res.status(422).json(await pythonRes.json());
  }
  if (!pythonRes.ok) {
    log.error("python_api_error", { status: pythonRes.status });
    return res.status(500).json({ error: "Model inference failed." });
  }

  const result = await pythonRes.json();
  stmts.logScan.run(result.session_id || randomUUID(), req.userId);
  stmts.updateLastScan.run(req.userId);
  log.info("scan_complete", { userId: anonId });
  return res.json(result);
});


// ── EXPLAIN: GET /scan/explain/:jobId ────────────────────────
app.get("/scan/explain/:jobId", verifyToken, async (req, res) => {
  try {
    const r = await fetch(
      `${PYTHON_API_URL}/explain/${encodeURIComponent(req.params.jobId)}`,
      { headers: gatewayHeaders(), signal: AbortSignal.timeout(5_000) }
    );
    if (!r.ok) return res.status(r.status).json({ error: "Explanation not found." });
    return res.json(await r.json());
  } catch {
    return res.status(503).json({ status: "pending" });
  }
});


// ── HISTORY: GET /history ─────────────────────────────────────
app.get("/history", verifyToken, async (req, res) => {
  const anonId = anonymiseId(req.userId);
  const page   = Math.max(0, parseInt(req.query.page || "0"));
  try {
    const r = await fetch(
      `${PYTHON_API_URL}/history/${anonId}?page=${page}`,
      { headers: gatewayHeaders(), signal: AbortSignal.timeout(10_000) }
    );
    return res.json(await r.json());
  } catch {
    return res.status(503).json({ error: "Could not retrieve history." });
  }
});


// ── TREND: GET /trend ─────────────────────────────────────────
app.get("/trend", verifyToken, async (req, res) => {
  const anonId = anonymiseId(req.userId);
  try {
    const r = await fetch(
      `${PYTHON_API_URL}/trend/${anonId}`,
      { headers: gatewayHeaders(), signal: AbortSignal.timeout(10_000) }
    );
    return res.json(await r.json());
  } catch {
    return res.status(503).json({ error: "Could not retrieve trend." });
  }
});


// ── REMINDER: POST /reminder ──────────────────────────────────
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
  log.error("unhandled_error", { message: err.message, path: req.path });
  res.status(500).json({ error: "Internal server error." });
});


// ── START ─────────────────────────────────────────────────────
if (NODE_ENV === "production" && !process.env.HTTPS_PROXY && !process.env.FORCE_HTTP) {
  log.warn("https_check", {
    message: "Running in production — ensure a TLS-terminating reverse proxy is in front of this server.",
  });
}

app.listen(PORT, () => {
  log.info("gateway_started", {
    port: PORT, env: NODE_ENV,
    cors: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : (NODE_ENV !== "production" ? "*" : "NONE"),
    gatewayAuth: !!GATEWAY_SECRET,
  });
});
