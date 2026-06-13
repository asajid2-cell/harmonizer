// Public auth routes: login, claim (invite signup), logout, account home.
import express from "express";
import { config, link } from "../config.js";
import { login, claimInvite, revokeByToken, changePassword, inviteStatus } from "../auth.js";
import { allowedPageIds, allPages, isAdmin, isOwner, openablePages } from "../authz.js";
import { csrfToken, verifyCsrf, requireSession, rateLimit, clientIp } from "../middleware.js";
import { loginPage, claimPage, accountPage, changePasswordPage, notice } from "../views.js";

export const authRouter = express.Router();

function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    domain: config.cookieDomain,
    path: "/",
    maxAge: config.sessionTtlMs
  });
}
function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { domain: config.cookieDomain, path: "/" });
}

/**
 * Where to send someone after login. A real gated-app redirect (?next=/mediamtx/…)
 * is always honored. Otherwise:
 *   - OWNER  → the management dashboard (/auth/admin)
 *   - admin / member → their account home (NOT forced to the dashboard)
 * So the admin account "just goes where it was headed" instead of the owner page.
 */
function landingFor(owner, next) {
  const n = typeof next === "string" ? next : "";
  const realNext =
    n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") && n !== "/" && !n.startsWith(config.basePath);
  if (realNext) return n;
  return owner ? `${config.basePath}/admin` : `${config.basePath}/account`;
}
const ownerLanding = (req) => req.auth.isMaster || isOwner(req.auth.userId);

// Landing: send logged-in users to their landing, else to login.
authRouter.get("/", (req, res) => {
  if (!req.auth?.ok) return res.redirect(`${config.basePath}/login`);
  res.redirect(landingFor(ownerLanding(req), req.query.next));
});

authRouter.get("/login", (req, res) => {
  if (req.auth?.ok) return res.redirect(landingFor(ownerLanding(req), req.query.next));
  res.send(loginPage({ next: req.query.next || "", csrf: csrfToken(req, res) }));
});

authRouter.post("/login", rateLimit({ action: "login", max: 8, windowMs: 60_000 }), verifyCsrf, (req, res) => {
  const { username, password, next } = req.body;
  try {
    const result = login({ username, password, ip: clientIp(req), ua: req.get("user-agent") });
    setSessionCookie(res, result.token);
    res.redirect(landingFor(result.isOwner, next));
  } catch (e) {
    res.status(401).send(loginPage({ next: next || "", error: e.message, csrf: csrfToken(req, res) }));
  }
});

authRouter.get("/claim", (req, res) => {
  const code = req.query.code || "";
  // Validate the code up front so the user sees whether the invite is good before filling the form.
  const status = code ? inviteStatus(code) : null;
  res.send(claimPage({ code, csrf: csrfToken(req, res), status }));
});

authRouter.post("/claim", rateLimit({ action: "claim", max: 10, windowMs: 60_000 }), verifyCsrf, (req, res) => {
  const { code, username, password } = req.body;
  try {
    const { token } = claimInvite({ code, username, password, ip: clientIp(req), ua: req.get("user-agent") });
    setSessionCookie(res, token);
    res.redirect(`${config.basePath}/account`);
  } catch (e) {
    res.status(400).send(claimPage({ code: code || "", error: e.message, csrf: csrfToken(req, res), status: code ? inviteStatus(code) : null }));
  }
});

authRouter.post("/logout", (req, res) => {
  const token = req.cookies?.[config.cookieName];
  if (token) revokeByToken(token);
  clearSessionCookie(res);
  res.send(notice({ title: "Signed out", message: "You have been signed out.", link: { href: link("/login"), label: "Sign in again" } }));
});

authRouter.get("/account", requireSession, (req, res) => {
  const pageIds = req.auth.isMaster ? new Set(allPages().map((p) => p.id)) : allowedPageIds(req.auth.userId);
  const pages = allPages().filter((p) => pageIds.has(p.id));
  res.send(
    accountPage({
      username: req.auth.username,
      isMaster: req.auth.isMaster,
      isAdminUser: req.auth.isMaster || isAdmin(req.auth.userId),
      pages
    })
  );
});

// Dedicated change-password screen.
authRouter.get("/password", requireSession, (req, res) => {
  res.send(
    changePasswordPage({
      username: req.auth.username,
      isMaster: req.auth.isMaster,
      csrf: csrfToken(req, res),
      pwOk: req.query.pwok ? "Password updated." : "",
      pwErr: req.query.pwerr || ""
    })
  );
});

// Self-service password change for the logged-in account (not for master sessions).
authRouter.post("/account/password", requireSession, rateLimit({ action: "pwchange", max: 12, windowMs: 60_000 }), verifyCsrf, (req, res) => {
  if (req.auth.isMaster) {
    return res.redirect(`${link("/password")}?pwerr=${encodeURIComponent("A master session has no account password — rotate the master password from the admin panel.")}`);
  }
  try {
    changePassword({
      userId: req.auth.userId,
      currentPassword: req.body.current_password,
      newPassword: req.body.new_password
    });
    res.redirect(`${link("/password")}?pwok=1`);
  } catch (e) {
    res.redirect(`${link("/password")}?pwerr=${encodeURIComponent(e.message)}`);
  }
});

// ---------------------------------------------------------------------------
// JSON API — lets a property's own SPA log in against hl-auth without leaving its
// UI (e.g. cameraroom keeps its branded login screen). Protected by a strict
// same-origin check (so a cross-site form can't drive it) + rate limiting; the
// shared host cookie does the rest. No CSRF token needed (origin-gated JSON).
// ---------------------------------------------------------------------------

function requireSameOrigin(req, res, next) {
  const origin = req.get("origin");
  if (!origin) return res.status(403).json({ ok: false, error: "Origin required" });
  let host;
  try { host = new URL(origin).host; } catch { return res.status(403).json({ ok: false, error: "Bad origin" }); }
  if (host !== req.get("host")) return res.status(403).json({ ok: false, error: "Cross-origin not allowed" });
  next();
}

function identity(req) {
  if (!req.auth?.ok) return { authenticated: false };
  const pageIds = req.auth.isMaster ? new Set(allPages().map((p) => p.id)) : allowedPageIds(req.auth.userId);
  return {
    authenticated: true,
    user: {
      username: req.auth.username,
      isMaster: req.auth.isMaster,
      isOwner: req.auth.isMaster || isOwner(req.auth.userId),
      isAdmin: req.auth.isMaster || isAdmin(req.auth.userId)
    },
    pages: req.auth.isMaster ? "*" : [...pageIds]
  };
}

authRouter.get("/api/me", (req, res) => res.json(identity(req)));

// Public, cookie-based: EVERY page + a per-page `canOpen` flag for THIS session,
// resolved by each page's access mode (the SAME rule as /internal/pages). The
// harmonizer landing calls this and hides any icon whose page the caller can't
// open — so registering a page in the admin auto-gates its landing icon, no
// hardcoded list. Exposes only page paths + the caller's own access (no secrets),
// so no origin gate is needed.
authRouter.get("/api/access", (req, res) => {
  const v = req.auth?.ok ? req.auth : null;
  const canOpen = new Set(openablePages(v).map((p) => p.id));
  res.json({
    authenticated: Boolean(v),
    pages: allPages().map((p) => ({ id: p.id, path_prefix: p.path_prefix, access: p.access, canOpen: canOpen.has(p.id) }))
  });
});

authRouter.post("/api/login", requireSameOrigin, rateLimit({ action: "apilogin", max: 8, windowMs: 60_000 }), (req, res) => {
  try {
    const r = login({ username: req.body?.username, password: req.body?.password, ip: clientIp(req), ua: req.get("user-agent") });
    setSessionCookie(res, r.token);
    res.json({ ok: true, user: { username: r.username, isMaster: r.isMaster, isOwner: r.isOwner, isAdmin: r.isAdmin } });
  } catch (e) {
    res.status(401).json({ ok: false, error: e.message });
  }
});

authRouter.post("/api/logout", (req, res) => {
  const token = req.cookies?.[config.cookieName];
  if (token) revokeByToken(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});
