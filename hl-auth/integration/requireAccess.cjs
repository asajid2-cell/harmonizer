// CommonJS mirror of requireAccess.js for apps that use require() (e.g. watch-together).
// Keep in sync with requireAccess.js. Zero dependencies — uses global fetch (Node 18+).
//
// Exports: requireAccess(page) middleware, checkAccess(req,page) for non-HTTP gates
// (WebSocket handshakes), clearAuthCache().
//
// Local-never-locked-out: only requests that arrived through the public nginx
// (X-Forwarded-For / public marker) are gated. Direct on-box requests bypass.
//
// Config is read LAZILY (memoized) so it works even when the host app populates
// process.env after requiring this module.

let _cfg = null;
function cfg() {
  if (_cfg) return _cfg;
  _cfg = {
    internalUrl: (process.env.AUTH_INTERNAL_URL || "http://127.0.0.1:4200").replace(/\/$/, ""),
    publicBase: (process.env.AUTH_PUBLIC_BASE || "/auth").replace(/\/$/, ""),
    internalKey: process.env.AUTH_INTERNAL_KEY || "",
    serviceKey: process.env.AUTH_SERVICE_KEY || "", // trusted backend-to-backend key (X-HL-Service-Key)
    cookieName: process.env.AUTH_COOKIE_NAME || "hl_session",
    cacheTtlMs: Number(process.env.AUTH_CACHE_TTL_MS || 60000),
    verifyTimeoutMs: Number(process.env.AUTH_VERIFY_TIMEOUT_MS || 2500),
    localBypass: process.env.AUTH_LOCAL_BYPASS !== "0",
    publicMarker: (process.env.AUTH_PUBLIC_MARKER || "x-hl-gate").toLowerCase(),
    appPrefix: (process.env.AUTH_APP_PREFIX || "").replace(/\/$/, "")
  };
  return _cfg;
}

const cache = new Map();

function isLoopback(ip) {
  const a = String(ip || "").replace(/^::ffff:/, "");
  return a === "" || a === "127.0.0.1" || a === "::1";
}
function isLocalDirect(req) {
  const viaProxy = req.headers["x-forwarded-for"] || req.headers[cfg().publicMarker];
  if (viaProxy) return false;
  const peer = (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress);
  return isLoopback(peer);
}
function readCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
async function verify(token, page) {
  const key = (token || "") + "|" + page;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.decision;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg().verifyTimeoutMs);
  let decision;
  try {
    const url = cfg().internalUrl + "/internal/verify?page=" + encodeURIComponent(page);
    const res = await fetch(url, { headers: { "x-session-token": token || "", "x-internal-key": cfg().internalKey }, signal: ctrl.signal });
    decision = await res.json();
  } catch {
    decision = { authenticated: false, allowed: false, reason: "verify_unreachable" }; // FAIL CLOSED
  } finally {
    clearTimeout(t);
  }
  cache.set(key, { decision, exp: Date.now() + cfg().cacheTtlMs });
  return decision;
}
async function checkAccess(req, page) {
  if (cfg().localBypass && isLocalDirect(req)) {
    return { ok: true, local: true, user: { username: "local", isMaster: true, local: true }, reason: "local_bypass" };
  }
  const svc = req.headers["x-hl-service-key"];
  if (cfg().serviceKey && svc && svc === cfg().serviceKey) {
    return { ok: true, service: true, user: { username: "service", service: true }, reason: "service_key" };
  }
  // May be null — public pages are still allowed (verify decides by page mode).
  const token = readCookie(req, cfg().cookieName);
  const d = await verify(token, page);
  if (d.allowed) return { ok: true, user: d.user || { public: true }, public: Boolean(d.public), reason: d.reason || "ok" };
  if (d.authenticated && !d.allowed) return { ok: false, status: 403, reason: d.reason || "not_authorized", user: d.user };
  return { ok: false, status: 401, reason: d.reason || "unauthenticated" };
}
function redirectToLogin(req, res) {
  const prefix = req.headers["x-forwarded-prefix"] || cfg().appPrefix || "";
  const next = encodeURIComponent(prefix + (req.originalUrl || "/"));
  res.redirect(cfg().publicBase + "/login?next=" + next);
}
function requireAccess(page) {
  return async (req, res, next) => {
    const r = await checkAccess(req, page);
    if (r.ok) { req.hlUser = r.user; return next(); }
    if (r.status === 403) {
      return res.status(403).type("html").send(
        '<!doctype html><meta charset=utf-8><body style="font-family:system-ui;background:#0b0c10;color:#e8e8ea;padding:40px">' +
        '<h1>403 — no access</h1><p>Your account cannot open this page. Ask the admin for access.</p>' +
        '<p><a style="color:#7aa2ff" href="' + cfg().publicBase + '/account">Your account</a></p></body>'
      );
    }
    return redirectToLogin(req, res);
  };
}
function clearAuthCache() { cache.clear(); }

module.exports = { requireAccess, checkAccess, clearAuthCache };
