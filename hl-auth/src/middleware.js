// Express middleware: identity attach, gates, CSRF (double-submit), rate limiting.
import { config } from "./config.js";
import { verifyToken } from "./auth.js";
import { isAdmin } from "./authz.js";
import { randomToken } from "./crypto.js";

export function clientIp(req) {
  return (req.ip || req.connection?.remoteAddress || "").replace(/^::ffff:/, "");
}

/** Attach req.auth ({userId, username, isMaster}) if the session cookie is valid. */
export function attachUser(req, _res, next) {
  const token = req.cookies?.[config.cookieName];
  const v = token ? verifyToken(token) : null;
  req.auth = v && v.ok ? v : null;
  next();
}

/** Browser gate: redirect to login (preserving where they were going). */
export function requireSession(req, res, next) {
  if (req.auth?.ok) return next();
  const next_ = encodeURIComponent(req.originalUrl || config.basePath);
  return res.redirect(`${config.basePath}/login?next=${next_}`);
}

/** Admin gate: a valid session that is admin or master. */
export function requireAdmin(req, res, next) {
  if (req.auth?.ok && (req.auth.isMaster || isAdmin(req.auth.userId))) return next();
  if (req.auth?.ok) return res.status(403).send(render403("You need admin access for this page."));
  const next_ = encodeURIComponent(req.originalUrl || config.basePath);
  return res.redirect(`${config.basePath}/login?next=${next_}`);
}

function render403(msg) {
  return `<!doctype html><meta charset="utf-8"><title>403</title><body style="font-family:system-ui;background:#0b0c10;color:#e8e8ea;padding:40px"><h1>403</h1><p>${msg}</p></body>`;
}

// --- CSRF (double-submit cookie) -------------------------------------------

const CSRF_COOKIE = "hl_csrf";

/** Ensure a CSRF cookie exists; return its value to embed in a form. */
export function csrfToken(req, res) {
  let t = req.cookies?.[CSRF_COOKIE];
  if (!t) {
    t = randomToken(16);
    res.cookie(CSRF_COOKIE, t, {
      httpOnly: false, secure: config.cookieSecure, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 * 1000
    });
  }
  return t;
}

/** Reject POSTs whose _csrf field doesn't match the CSRF cookie. */
export function verifyCsrf(req, res, next) {
  const cookieTok = req.cookies?.[CSRF_COOKIE];
  const formTok = req.body?._csrf;
  if (cookieTok && formTok && cookieTok === formTok) return next();
  return res.status(403).send(render403("Form expired or invalid. Go back and try again."));
}

// --- rate limiting (in-memory fixed window + lockout) -----------------------

const buckets = new Map(); // key -> { count, resetAt, lockedUntil }

/**
 * Limit `max` attempts per `windowMs`; on exceed, lock the key for `lockMs`.
 * Keyed by action + client IP (+ optional username from the body).
 */
export function rateLimit({ action, max = 8, windowMs = 60_000, lockMs = 5 * 60_000 }) {
  const cap = Number(process.env.AUTH_RATELIMIT_MAX) || max; // tests/ops can raise the cap
  return (req, res, next) => {
    const key = `${action}:${clientIp(req)}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) b = { count: 0, resetAt: now + windowMs, lockedUntil: 0 };
    if (b.lockedUntil > now) {
      res.set("Retry-After", String(Math.ceil((b.lockedUntil - now) / 1000)));
      return res.status(429).send("Too many attempts. Try again later.");
    }
    b.count += 1;
    if (b.count > cap) {
      b.lockedUntil = now + lockMs;
      buckets.set(key, b);
      res.set("Retry-After", String(Math.ceil(lockMs / 1000)));
      return res.status(429).send("Too many attempts. Locked for a few minutes.");
    }
    buckets.set(key, b);
    next();
  };
}
