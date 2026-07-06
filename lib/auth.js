const crypto = require('crypto');

// ---------------------------------------------------------------- passwords
// The owner password comes from the OWNER_PASSWORD env var. We never store it
// in plaintext beyond the process env: at boot we derive a scrypt hash with a
// per-process random salt and compare candidates against that in constant time.
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'changeme';
const OWNER_NAME = process.env.OWNER_NAME || 'Dr. Gaurav';
const USING_DEFAULT_PASSWORD = !process.env.OWNER_PASSWORD;

const SALT = crypto.randomBytes(16);
const OWNER_HASH = crypto.scryptSync(OWNER_PASSWORD, SALT, 64);

function verifyPassword(candidate) {
  if (typeof candidate !== 'string' || !candidate) return false;
  let hash;
  try {
    hash = crypto.scryptSync(candidate, SALT, 64);
  } catch {
    return false;
  }
  return hash.length === OWNER_HASH.length && crypto.timingSafeEqual(hash, OWNER_HASH);
}

// ----------------------------------------------------------------- sessions
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE_NAME = 'sid';

// db.sessions maps token -> { name, expires }. It is persisted with the rest of
// the store so a redeploy on a persistent disk keeps people logged in.
function createSession(db, save) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { name: OWNER_NAME, expires: Date.now() + SESSION_TTL_MS };
  pruneSessions(db);
  save(db);
  return token;
}

function destroySession(db, save, token) {
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    save(db);
  }
}

function pruneSessions(db) {
  const now = Date.now();
  for (const [t, s] of Object.entries(db.sessions)) {
    if (!s || s.expires < now) delete db.sessions[t];
  }
}

function sessionFromReq(db, req) {
  const token = getCookie(req, COOKIE_NAME);
  if (!token) return null;
  const s = db.sessions[token];
  if (!s || s.expires < Date.now()) return null;
  return { token, ...s };
}

// ------------------------------------------------------------------ cookies
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function buildSetCookie(token) {
  const secure = process.env.SECURE_COOKIES === 'true' || process.env.NODE_ENV === 'production';
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function buildClearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  OWNER_NAME,
  USING_DEFAULT_PASSWORD,
  verifyPassword,
  createSession,
  destroySession,
  sessionFromReq,
  buildSetCookie,
  buildClearCookie,
  COOKIE_NAME
};
