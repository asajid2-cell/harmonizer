// Internal identity oracle for integrating apps. Mounted at /internal (NOT under the
// public base path) and NEVER routed by nginx publicly. Apps call it directly on
// 127.0.0.1:<port>. Optionally gated by a shared X-Internal-Key.
import express from "express";
import { config } from "../config.js";
import { verifyToken } from "../auth.js";
import { canAccess, allowedPageIds, isAdmin, isOwner, pageAccessMode, allPages, openablePages, pageOverrideEffect } from "../authz.js";

export const internalRouter = express.Router();

function readToken(req) {
  return (
    req.get("x-session-token") ||
    req.query.token ||
    req.cookies?.[config.cookieName] ||
    null
  );
}

function gate(req, res, next) {
  if (config.internalKey && req.get("x-internal-key") !== config.internalKey) {
    return res.status(401).json({ authenticated: false, reason: "bad_internal_key" });
  }
  next();
}

function userObj(v) {
  return {
    id: v.userId,
    username: v.username,
    isMaster: v.isMaster,
    isOwner: v.isMaster || isOwner(v.userId),
    isAdmin: v.isMaster || isAdmin(v.userId)
  };
}
function pagesFor(v) {
  return v.isMaster ? "*" : [...allowedPageIds(v.userId)];
}

// GET/POST /internal/verify?token=...&page=cloud-squeeze
// Decision depends on the PAGE's access mode (set in the admin panel):
//   public     -> allowed for everyone (no login)
//   members    -> allowed for any signed-in account
//   restricted -> allowed only if the account is granted the page (role/override)
// Compatibility oracle for nginx's shared auth_request guard. Unlike /verify,
// this endpoint uses HTTP status to express authentication because auth_request
// considers only 2xx a successful authorization decision.
internalRouter.all("/authed", gate, (req, res) => {
  const v = verifyToken(readToken(req));
  if (!v || !v.ok) return res.status(401).json({ authenticated: false });
  return res.status(200).json({ authenticated: true });
});

internalRouter.all("/verify", gate, (req, res) => {
  const token = readToken(req);
  const page = req.query.page || req.body?.page || null;
  const mode = page ? pageAccessMode(page) : null;
  const v = verifyToken(token);
  const authed = Boolean(v && v.ok);

  // Public pages: allowed even with no/expired session.
  if (page && mode === "public") {
    return res.json({
      authenticated: authed,
      allowed: true,
      public: true,
      reason: "public",
      user: authed ? userObj(v) : null,
      pages: authed ? pagesFor(v) : []
    });
  }

  if (!authed) {
    return res.json({ authenticated: false, allowed: false, reason: v?.reason || "no_session" });
  }

  let allowed;
  if (!page) allowed = true;                       // page-less check = "are you logged in"
  else if (v.isMaster) allowed = true;
  else if (pageOverrideEffect(v.userId, page) === "deny") allowed = false; // explicit deny wins (even on members)
  else if (mode === "members") allowed = true;     // any signed-in account
  else allowed = canAccess(v.userId, page);        // restricted (and unknown→restricted)

  res.json({
    authenticated: true,
    allowed,
    reason: allowed ? "ok" : "not_authorized",
    user: userObj(v),
    pages: pagesFor(v)
  });
});

// GET/POST /internal/pages?token=... — the full set of pages THIS session may open, each decided by
// the same rule as /verify (public→all, members→any signed-in, restricted→canAccess, master→all).
// A landing page calls this once to render only the icons the account is allowed to open.
internalRouter.all("/pages", gate, (req, res) => {
  const token = readToken(req);
  const v = verifyToken(token);
  const authed = Boolean(v && v.ok);
  const allowed = openablePages(v).map((p) => ({ id: p.id, label: p.label, path_prefix: p.path_prefix, access: p.access }));
  res.json({ authenticated: authed, user: authed ? userObj(v) : null, pages: allowed });
});

internalRouter.get("/health", (_req, res) => res.json({ ok: true }));
