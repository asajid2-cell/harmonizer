// Admin dashboard + management actions. All behind requireAdmin.
import express from "express";
import { config, link } from "../config.js";
import { getDb, writeAudit } from "../db.js";
import {
  createInvite, revokeInvite, suspendUser, restoreUser, revokeSession, rotateAll,
  setMasterPassword, isMasterConfigured, NEVER_EXPIRES, adminResetPassword
} from "../auth.js";
import { allRoles, allPages, allowedPageIds, getUserRoles, isOwner, createPage, setPageAccess, ACCESS_MODES } from "../authz.js";
import { csrfToken, verifyCsrf, requireAdmin, clientIp } from "../middleware.js";
import { adminPage, codeRevealPage } from "../views.js";

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

const actor = (req) => (req.auth.isMaster ? "master" : req.auth.username);
const viewerIsOwner = (req) => Boolean(req.auth.isMaster || isOwner(req.auth.userId));
// Owner-only gate for privileged actions (master key, resetting others' passwords).
function requireOwner(req, res, next) {
  if (viewerIsOwner(req)) return next();
  return deny(res, "Only the owner can do that.");
}

adminRouter.get("/", (req, res) => {
  const d = getDb();
  const pages = allPages();
  const pageLabel = Object.fromEntries(pages.map((p) => [p.id, p.label]));

  // Most-recent live activity per account (for the "last seen" column).
  const lastSeen = Object.fromEntries(
    d.prepare("SELECT user_id, MAX(last_seen_at) ls FROM sessions WHERE revoked_at IS NULL GROUP BY user_id").all().map((r) => [r.user_id, r.ls])
  );
  const users = d
    .prepare("SELECT id, username, status, created_at FROM users WHERE username != '__master__' ORDER BY created_at")
    .all()
    .map((u) => ({
      ...u,
      roles: getUserRoles(u.id).map((r) => r.name),
      pages: [...allowedPageIds(u.id)].map((id) => pageLabel[id] || id),
      lastSeen: lastSeen[u.id] || null
    }));

  const sessions = d
    .prepare(
      `SELECT s.id, s.is_master, s.device_label, s.ip, s.last_seen_at, u.username
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.revoked_at IS NULL AND s.expires_at > ? AND s.session_epoch = (SELECT value FROM settings WHERE key='session_epoch')
       ORDER BY s.last_seen_at DESC LIMIT 100`
    )
    .all(Date.now())
    .map((s) => ({ ...s, username: s.is_master ? "master" : s.username }));

  const invites = d
    .prepare(
      `SELECT i.id, i.note, i.expires_at, i.claimed_at, r.name role_name, cu.username claimed_username
       FROM invites i LEFT JOIN roles r ON r.id = i.role_id LEFT JOIN users cu ON cu.id = i.claimed_by
       ORDER BY i.created_at DESC LIMIT 30`
    )
    .all()
    .map((i) => ({
      ...i,
      open: !i.claimed_at,
      expiryLabel:
        i.expires_at >= NEVER_EXPIRES
          ? "never"
          : new Date(i.expires_at).toISOString().slice(0, 16).replace("T", " ")
    }));

  const audit = d.prepare("SELECT ts, actor, action, target, ip FROM audit ORDER BY ts DESC LIMIT 40").all();

  res.send(
    adminPage({
      csrf: csrfToken(req, res),
      flash: req.query.ok || "",
      error: req.query.err || "",
      roles: allRoles(),
      pages,
      accessModes: ACCESS_MODES,
      users,
      sessions,
      invites,
      audit,
      isOwnerViewer: viewerIsOwner(req),
      masterConfigured: isMasterConfigured(),
      verifyCacheSeconds: config.verifyCacheSeconds
    })
  );
});

const EXPIRY_MS = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  never: null
};

adminRouter.post("/invites", verifyCsrf, (req, res) => {
  try {
    const ttlMs = req.body.expiry in EXPIRY_MS ? EXPIRY_MS[req.body.expiry] : EXPIRY_MS["7d"];
    const { code } = createInvite({
      roleId: req.body.role_id || null,
      note: req.body.note || null,
      ttlMs,
      actor: actor(req)
    });
    const claimUrl = `${req.protocol}://${req.get("host")}${link("/claim")}?code=${encodeURIComponent(code)}`;
    res.send(codeRevealPage({ code, claimUrl, csrf: csrfToken(req, res) }));
  } catch (e) {
    res.redirect(`${link("/admin")}?err=${encodeURIComponent(e.message)}`);
  }
});

adminRouter.post("/invites/revoke", verifyCsrf, (req, res) => {
  try {
    revokeInvite(req.body.invite_id, actor(req));
    res.redirect(`${link("/admin")}?ok=Invite revoked`);
  } catch (e) {
    res.redirect(`${link("/admin")}?err=${encodeURIComponent(e.message)}`);
  }
});

const deny = (res, msg) => res.redirect(`${link("/admin")}?err=${encodeURIComponent(msg)}`);

adminRouter.post("/users/role", verifyCsrf, (req, res) => {
  const d = getDb();
  const { user_id, role_id, op } = req.body;
  const roleName = d.prepare("SELECT name FROM roles WHERE id=?").get(role_id)?.name;
  // The owner role is fixed at setup — it can't be handed out or stripped here.
  if (roleName === "owner") return deny(res, "The owner role is fixed at setup and can't be changed here.");
  // The owner account is protected: you can't strip its roles.
  if (isOwner(user_id) && op === "remove") return deny(res, "The owner account is protected and can't be modified.");
  if (op === "add") d.prepare("INSERT INTO user_roles(user_id, role_id) VALUES(?,?) ON CONFLICT DO NOTHING").run(user_id, role_id);
  else if (op === "remove") d.prepare("DELETE FROM user_roles WHERE user_id=? AND role_id=?").run(user_id, role_id);
  writeAudit({ actor: actor(req), action: "role_changed", target: user_id, meta: { role_id, op }, ip: clientIp(req) });
  res.redirect(`${link("/admin")}?ok=Role updated`);
});

adminRouter.post("/users/override", verifyCsrf, (req, res) => {
  const d = getDb();
  const { user_id, page_id, effect } = req.body;
  if (isOwner(user_id)) return deny(res, "The owner account is protected (always has full access).");
  d.prepare("DELETE FROM user_page_overrides WHERE user_id=? AND page_id=?").run(user_id, page_id);
  if (effect === "grant" || effect === "deny") {
    d.prepare("INSERT INTO user_page_overrides(user_id, page_id, effect) VALUES(?,?,?)").run(user_id, page_id, effect);
  }
  writeAudit({ actor: actor(req), action: "override_changed", target: user_id, meta: { page_id, effect }, ip: clientIp(req) });
  res.redirect(`${link("/admin")}?ok=Page access updated`);
});

adminRouter.post("/users/status", verifyCsrf, (req, res) => {
  const { user_id, op } = req.body;
  try {
    if (op === "suspend") suspendUser(user_id, actor(req));      // throws for the owner
    else if (op === "restore") restoreUser(user_id, actor(req));
    res.redirect(`${link("/admin")}?ok=User ${op === "suspend" ? "suspended" : "restored"}`);
  } catch (e) {
    deny(res, e.message);
  }
});

adminRouter.post("/sessions/kill", verifyCsrf, (req, res) => {
  revokeSession(req.body.session_id, actor(req));
  res.redirect(`${link("/admin")}?ok=Session killed`);
});

adminRouter.post("/rotate-all", verifyCsrf, (req, res) => {
  rotateAll(actor(req));
  res.redirect(`${link("/admin")}?ok=All sessions rotated`);
});

adminRouter.post("/master", verifyCsrf, requireOwner, (req, res) => {
  const pw = String(req.body.master || "");
  if (pw.length < 12) return res.redirect(`${link("/admin")}?err=${encodeURIComponent("Master password must be at least 12 characters")}`);
  setMasterPassword(pw, actor(req));
  res.redirect(`${link("/admin")}?ok=Master password set`);
});

// Owner resets another account's password (forces them to re-login).
adminRouter.post("/users/password", verifyCsrf, requireOwner, (req, res) => {
  const { user_id, new_password } = req.body;
  if (isOwner(user_id)) return deny(res, "The owner password is changed from the owner's own account settings.");
  try {
    const uname = adminResetPassword({ userId: user_id, newPassword: new_password, actor: actor(req) });
    res.redirect(`${link("/admin")}?ok=${encodeURIComponent(`Password reset for ${uname}`)}`);
  } catch (e) {
    deny(res, e.message);
  }
});

adminRouter.post("/pages/access", verifyCsrf, (req, res) => {
  try {
    setPageAccess(req.body.page_id, req.body.access);
    writeAudit({ actor: actor(req), action: "page_access_changed", target: req.body.page_id, meta: { access: req.body.access }, ip: clientIp(req) });
    res.redirect(`${link("/admin")}?ok=Access mode updated`);
  } catch (e) {
    deny(res, e.message);
  }
});

adminRouter.post("/pages", verifyCsrf, (req, res) => {
  try {
    createPage({ id: req.body.page_id, label: req.body.label, pathPrefix: req.body.path_prefix, access: req.body.access });
    writeAudit({ actor: actor(req), action: "page_created", target: String(req.body.page_id || "").toLowerCase(), meta: { access: req.body.access }, ip: clientIp(req) });
    res.redirect(`${link("/admin")}?ok=Page added`);
  } catch (e) {
    deny(res, e.message);
  }
});
