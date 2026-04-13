/**
 * glauc-gateway/server.js  v1.2
 * ══════════════════════════════════════════════════════════════
 * Production-hardened Node.js API Gateway.
 *
 * v1.2 additions:
 *   • POST /auth/google — verifies Google ID token via tokeninfo endpoint
 *   • POST /auth/apple  — verifies Apple identity token via JWKS (jose)
 *   • oauth_accounts table for provider ↔ user mapping
 *   • GOOGLE_CLIENT_ID / APPLE_BUNDLE_ID audience checks
 */

import "dotenv/config";
import express        from "express";
import multer         from "multer";
import sharp          from "sharp";
import Database       from "better-sqlite3";
import { SignJWT, jwtVerify, importJWK } from "jose";
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

// Fail hard if JWT_SECRET not set
if (!process.env.JWT_SECRET) {
  console.error(JSON.stringify({ level: "fatal", msg: "JWT_SECRET env var is required. Exiting." }));
  process.exit(1);
}
const JWT_SECRET_RAW = process.env.JWT_SECRET;
const JWT_SECRET     = new TextEncoder().encode(JWT_SECRET_RAW);

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || "";
if (!GATEWAY_SECRET) {
  console.warn(JSON.stringify({ level: "warn", msg: "GATEWAY_SECRET not set — Python API has no gateway auth." }));
}

// OAuth config
const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
].filter(Boolean);

const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.glauc.app";

// CORS whitelist
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

const VALID_GENDERS = new Set(["M", "F", "MALE", "FEMALE", "OTHER"]);


// ── STRUCTURED LOGGER ─────────────────────────────────────────
const log = {
  info:  (msg, meta = {}) => console.log(JSON.stringify({ level: "info",  ts: new Date().toISOString(), msg, ...meta })),
  warn:  (msg, meta = {}) => console.warn(JSON.stringify({ level: "warn",  ts: new Date().toISOString(), msg, ...meta })),
  error: (msg, meta = {}) => console.error(JSON.stringify({ level: "error", ts: new Date().toISOString(), msg, ...meta })),
};

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

  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    provider    TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(provider, provider_id)
  );

  CREATE TABLE IF NOT EXISTS scan_log (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','utc')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const stmts = {
  findByEmail:      db.prepare("SELECT * FROM users WHERE email = ?"),
  findById:         db.prepare("SELECT * FROM users WHERE id = ?"),
  createUser:       db.prepare("INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)"),
  findOAuth:        db.prepare("SELECT u.* FROM oauth_accounts o JOIN users u ON u.id = o.user_id WHERE o.provider = ? AND o.provider_id = ?"),
  linkOAuth:        db.prepare("INSERT OR IGNORE INTO oauth_accounts (id, user_id, provider, provider_id) VALUES (?, ?, ?, ?)"),
  scansToday:       db.prepare("SELECT COUNT(*) AS n FROM scan_log WHERE user_id = ? AND date(created_at) = date('now','utc')"),
  logScan:          db.prepare("INSERT INTO scan_log (id, user_id) VALUES (?, ?)"),
  updateLastScan:   db.prepare("UPDATE users SET last_scan_at = datetime('now','utc') WHERE id = ?"),
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

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => log.info("request", {
    method: req.method, path: req.path,
    status: res.statusCode, ms: Date.now() - start,
  }));
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again in 15 minutes." },
  skip: () => NODE_ENV === "test",
});


// ── AUTH HELPERS ──────────────────────────────────────────────
async function hashPassword(pw) { return bcryptjs.hash(pw, 12); }
async function verifyPassword(pw, hash) { return bcryptjs.compare(pw, hash); }

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

function gatewayHeaders() {
  return GATEWAY_SECRET ? { "X-Gateway-Secret": GATEWAY_SECRET } : {};
}

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

// Build a safe user response object
function userResponse(user) {
  return {
    id:    anonymiseId(user.id),
    email: user.email,
    name:  user.name || "",
  };
}


// ── ROUTES ────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({
  status: "ok", gateway: "glauc-node-gateway", version: "1.2.0",
  timestamp: new Date().toISOString(),
}));


// ── POST /auth/register ───────────────────────────────────────
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
    return res.status(201).json({ token, isNewUser: true, user: userResponse({ id: userId, email: normEmail, name: name.trim() }) });
  } catch (err) {
    log.error("register_error", { message: err.message });
    return res.status(500).json({ error: "Registration failed." });
  }
});


// ── POST /auth/login ──────────────────────────────────────────
app.post("/auth/login", authLimiter, async (req, res) => {
  const { email = "", password = "" } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  const user = stmts.findByEmail.get(email.toLowerCase().trim());
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
  return res.json({ token, isNewUser: false, user: userResponse(user) });
});


// ── POST /auth/google ─────────────────────────────────────────
app.post("/auth/google", authLimiter, async (req, res) => {
  const { id_token } = req.body;
  if (!id_token || typeof id_token !== "string") {
    return res.status(400).json({ error: "id_token is required." });
  }
  try {
    // Verify via Google's tokeninfo endpoint (no extra library needed)
    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!infoRes.ok) {
      return res.status(401).json({ error: "Google token verification failed." });
    }
    const info = await infoRes.json();

    // Validate audience (must match one of our registered client IDs)
    if (GOOGLE_CLIENT_IDS.length > 0 && !GOOGLE_CLIENT_IDS.includes(info.aud)) {
      log.warn("google_audience_mismatch", { aud: info.aud });
      return res.status(401).json({ error: "Token audience mismatch." });
    }

    if (!info.email || info.email_verified !== "true") {
      return res.status(400).json({ error: "Google account email not verified." });
    }

    const googleUserId = info.sub;
    const email        = info.email.toLowerCase();
    const displayName  = info.name || info.given_name || "";

    // Look up by OAuth account first, then by email
    let user = stmts.findOAuth.get("google", googleUserId);
    let isNewUser = false;

    if (!user) {
      user = stmts.findByEmail.get(email);
      if (!user) {
        // Create new account
        const userId = randomUUID();
        stmts.createUser.run(userId, email, "OAUTH_GOOGLE", displayName);
        user = stmts.findById.get(userId);
        isNewUser = true;
      }
      // Link OAuth account
      stmts.linkOAuth.run(randomUUID(), user.id, "google", googleUserId);
    }

    const token = await signToken(user.id);
    log.info("google_login", { userId: anonymiseId(user.id), isNewUser });
    return res.json({ token, isNewUser, user: userResponse(user) });
  } catch (err) {
    log.error("google_auth_error", { message: err.message });
    return res.status(500).json({ error: "Google authentication failed." });
  }
});


// ── POST /auth/apple ──────────────────────────────────────────
// Cache Apple's JWKS for 1 hour to avoid repeated fetches
let appleJWKSCache = null;
let appleJWKSFetchedAt = 0;
const APPLE_JWKS_TTL = 60 * 60 * 1000; // 1 hour

async function getAppleJWKS() {
  if (appleJWKSCache && Date.now() - appleJWKSFetchedAt < APPLE_JWKS_TTL) {
    return appleJWKSCache;
  }
  const r = await fetch("https://appleid.apple.com/auth/keys", {
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) throw new Error("Failed to fetch Apple JWKS");
  const { keys } = await r.json();
  appleJWKSCache    = keys;
  appleJWKSFetchedAt = Date.now();
  return keys;
}

app.post("/auth/apple", authLimiter, async (req, res) => {
  const { identity_token, name } = req.body;
  if (!identity_token || typeof identity_token !== "string") {
    return res.status(400).json({ error: "identity_token is required." });
  }
  try {
    // Decode header to find the right key
    const parts = identity_token.split(".");
    if (parts.length !== 3) {
      return res.status(400).json({ error: "Malformed identity token." });
    }
    let header;
    try {
      header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Could not decode token header." });
    }

    const keys = await getAppleJWKS();
    const jwk  = keys.find(k => k.kid === header.kid);
    if (!jwk) {
      return res.status(401).json({ error: "No matching Apple key found." });
    }

    const publicKey = await importJWK(jwk);
    const { payload } = await jwtVerify(identity_token, publicKey, {
      issuer:   "https://appleid.apple.com",
      audience: APPLE_BUNDLE_ID,
    });

    const appleUserId = payload.sub;
    // Apple may provide private relay email or real email
    const email = (payload.email || `${appleUserId}@privaterelay.appleid.com`).toLowerCase();

    // Resolve name from request body (only available on first sign-in via Apple)
    let displayName = "";
    if (name && (name.firstName || name.lastName)) {
      displayName = `${name.firstName || ""} ${name.lastName || ""}`.trim();
    }

    let user = stmts.findOAuth.get("apple", appleUserId);
    let isNewUser = false;

    if (!user) {
      user = stmts.findByEmail.get(email);
      if (!user) {
        const userId = randomUUID();
        stmts.createUser.run(userId, email, "OAUTH_APPLE", displayName);
        user = stmts.findById.get(userId);
        isNewUser = true;
      }
      stmts.linkOAuth.run(randomUUID(), user.id, "apple", appleUserId);
    }

    const token = await signToken(user.id);
    log.info("apple_login", { userId: anonymiseId(user.id), isNewUser });
    return res.json({ token, isNewUser, user: userResponse(user) });
  } catch (err) {
    log.error("apple_auth_error", { message: err.message });
    return res.status(401).json({ error: "Apple authentication failed." });
  }
});


// ── GET /auth/me ──────────────────────────────────────────────
app.get("/auth/me", verifyToken, (req, res) => {
  const user = stmts.findById.get(req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({
    id:              anonymiseId(user.id),
    email:           user.email,
    name:            user.name || "",
    joinedAt:        user.created_at,
    lastScan:        user.last_scan_at,
    reminder_enabled: !!user.reminder_enabled,
    scansToday:      stmts.scansToday.get(user.id).n,
  });
});


// ── POST /scan ────────────────────────────────────────────────
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
  const normGender = gender.trim().toUpperCase();
  if (!VALID_GENDERS.has(normGender)) {
    return res.status(400).json({ error: "Invalid gender value." });
  }
  const normRace = race.trim().slice(0, 30);
  if (!normRace) {
    return res.status(400).json({ error: "Invalid race value." });
  }

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
  const form   = new FormData();
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


// ── GET /scan/explain/:jobId ──────────────────────────────────
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


// ── GET /history ──────────────────────────────────────────────
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


// ── GET /trend ────────────────────────────────────────────────
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


// ── POST /reminder ────────────────────────────────────────────
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
    message: "Running in production — ensure a TLS-terminating reverse proxy is in front.",
  });
}

app.listen(PORT, () => {
  log.info("gateway_started", {
    port: PORT, env: NODE_ENV,
    googleOAuth: GOOGLE_CLIENT_IDS.length > 0,
    appleOAuth:  true,
    gatewayAuth: !!GATEWAY_SECRET,
  });
});
