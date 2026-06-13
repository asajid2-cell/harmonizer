// Core auth: users, invites, sessions, login, claim, master backdoor, verify.
import { getDb, getSetting, setSetting, getSessionEpoch, writeAudit } from "./db.js";
import { config } from "./config.js";
import { hashPassword, verifyPassword, randomToken, sha256, uuid } from "./crypto.js";
import { isAdmin, isOwner } from "./authz.js";

const MASTER_USERNAME = "__master__"; // legacy system user (older master sessions); not created anymore

function now() { return Date.now(); }
function deviceLabel(ua) {
  return String(ua || "unknown").replace(/\s+/g, " ").trim().slice(0, 120);
}

// --- master password --------------------------------------------------------

export function isMasterConfigured() {
  return Boolean(getSetting("master_password_hash"));
}
export function setMasterPassword(plain, actor = "admin") {
  setSetting("master_password_hash", hashPassword(plain));
  writeAudit({ actor, action: "master_rotated", target: "master_password" });
}
function masterMatches(password) {
  const h = getSetting("master_password_hash");
  return Boolean(h) && verifyPassword(password, h);
}

// --- sessions ---------------------------------------------------------------

export function createSession({ userId, isMaster = false, ip, ua }) {
  const d = getDb();
  const raw = randomToken(32);
  const id = uuid();
  const ts = now();
  d.prepare(
    `INSERT INTO sessions(id, user_id, token_hash, is_master, device_label, ip, created_at, last_seen_at, expires_at, session_epoch)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).run(id, userId, sha256(raw), isMaster ? 1 : 0, deviceLabel(ua), ip || null, ts, ts, ts + config.sessionTtlMs, getSessionEpoch());
  return { token: raw, sessionId: id };
}

/** Validate a raw session token. Returns identity or null. Slides the expiry. */
export function verifyToken(rawToken) {
  if (!rawToken) return null;
  const d = getDb();
  const s = d.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(sha256(rawToken));
  if (!s) return { ok: false, reason: "no_session" };
  if (s.revoked_at) return { ok: false, reason: "revoked" };
  if (s.expires_at <= now()) return { ok: false, reason: "expired" };
  if (s.session_epoch !== getSessionEpoch()) return { ok: false, reason: "stale_epoch" };

  const user = d.prepare("SELECT * FROM users WHERE id = ?").get(s.user_id);
  if (!user || user.status !== "active") return { ok: false, reason: "suspended" };

  // Sliding renewal (cheap; only when it's been a while to avoid write storms).
  const ts = now();
  if (ts - s.last_seen_at > 60_000) {
    d.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?")
      .run(ts, ts + config.sessionTtlMs, s.id);
    d.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(ts, user.id);
  }

  return {
    ok: true,
    sessionId: s.id,
    userId: user.id,
    username: s.is_master ? "master" : user.username,
    isMaster: Boolean(s.is_master)
  };
}

export function revokeByToken(rawToken) {
  getDb().prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
    .run(now(), sha256(rawToken));
}
export function revokeSession(sessionId, actor = "admin") {
  getDb().prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(now(), sessionId);
  writeAudit({ actor, action: "session_killed", target: sessionId });
}
export function revokeUserSessions(userId) {
  getDb().prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").run(now(), userId);
}
export function rotateAll(actor = "admin") {
  setSetting("session_epoch", String(getSessionEpoch() + 1));
  writeAudit({ actor, action: "rotate_all", target: "all_sessions" });
}

// --- login (+ master backdoor) ---------------------------------------------

/**
 * Returns { token, isMaster, isAdmin, username } on success; throws on failure.
 *
 * Master is NOT a universal "any username" backdoor (which would force a master
 * check on every login). Instead it is an ADMIN account's alternate password:
 * for an admin user, if the normal password doesn't match, the master password
 * is tried. So `owner` + (owner password OR master password) both log in, and
 * the master check only ever runs for an admin username whose normal password
 * already failed.
 */
export function login({ username, password, ip, ua }) {
  const uname = String(username || "").trim();
  const u = getDb().prepare("SELECT * FROM users WHERE username = ?").get(uname);

  if (u && u.status === "active" && u.username !== MASTER_USERNAME) {
    // 1) the account's own password
    if (verifyPassword(password, u.password_hash)) {
      const { token } = createSession({ userId: u.id, ip, ua });
      writeAudit({ actor: u.username, action: "login_success", target: "login", ip, userAgent: ua });
      return { token, isMaster: false, isOwner: isOwner(u.id), isAdmin: isAdmin(u.id), username: u.username };
    }
    // 2) master password — the OWNER's emergency key only, after the normal password missed
    if (isOwner(u.id) && isMasterConfigured() && masterMatches(password)) {
      const { token } = createSession({ userId: u.id, isMaster: true, ip, ua });
      writeAudit({ actor: u.username, action: "master_used", target: "login", ip, userAgent: ua });
      return { token, isMaster: true, isOwner: true, isAdmin: true, username: u.username };
    }
  }

  writeAudit({ actor: uname || "(blank)", action: "login_fail", target: "login", ip, userAgent: ua });
  throw new Error("Invalid username or password.");
}

/** Self-service password change for the logged-in account. */
export function changePassword({ userId, currentPassword, newPassword }) {
  const d = getDb();
  const u = d.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!u) throw new Error("Account not found.");
  if (!verifyPassword(currentPassword, u.password_hash)) throw new Error("Current password is incorrect.");
  if (String(newPassword || "").length < 8) throw new Error("New password must be at least 8 characters.");
  d.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), userId);
  writeAudit({ actor: u.username, action: "password_changed", target: u.username });
}

/** Owner-only password reset of another account (no current-password). Forces re-login. */
export function adminResetPassword({ userId, newPassword, actor = "owner" }) {
  const d = getDb();
  const u = d.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!u) throw new Error("Account not found.");
  if (String(newPassword || "").length < 8) throw new Error("New password must be at least 8 characters.");
  d.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(newPassword), userId);
  revokeUserSessions(userId); // their old sessions die — they sign in fresh with the new password
  writeAudit({ actor, action: "password_reset", target: u.username });
  return u.username;
}

// --- users ------------------------------------------------------------------

export function usernameTaken(username) {
  return Boolean(getDb().prepare("SELECT 1 FROM users WHERE username = ?").get(String(username || "").trim()));
}

export function createUser({ username, password, roleId = null, actor = "admin" }) {
  const uname = String(username || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(uname)) throw new Error("Username must be 3–32 chars: letters, numbers, . _ -");
  if (String(password || "").length < 8) throw new Error("Password must be at least 8 characters.");
  if (usernameTaken(uname)) throw new Error("That username is taken.");
  const d = getDb();
  const id = uuid();
  d.prepare("INSERT INTO users(id, username, password_hash, status, created_at) VALUES(?,?,?,?,?)")
    .run(id, uname, hashPassword(password), "active", now());
  if (roleId) d.prepare("INSERT INTO user_roles(user_id, role_id) VALUES(?, ?) ON CONFLICT DO NOTHING").run(id, roleId);
  writeAudit({ actor, action: "user_created", target: uname });
  return d.prepare("SELECT id, username, status, created_at FROM users WHERE id = ?").get(id);
}

export function suspendUser(userId, actor = "admin") {
  if (isOwner(userId)) throw new Error("The owner account is protected and cannot be suspended.");
  getDb().prepare("UPDATE users SET status = 'suspended' WHERE id = ?").run(userId);
  revokeUserSessions(userId);
  writeAudit({ actor, action: "user_suspended", target: userId });
}
export function restoreUser(userId, actor = "admin") {
  getDb().prepare("UPDATE users SET status = 'active' WHERE id = ?").run(userId);
  writeAudit({ actor, action: "user_restored", target: userId });
}

// --- invites ----------------------------------------------------------------

export const NEVER_EXPIRES = 8640000000000000; // sentinel for "no expiry" (max JS Date ms)

export function createInvite({ roleId = null, note = null, ttlMs = null, actor = "admin" }) {
  const d = getDb();
  const raw = randomToken(12); // ~16-char shareable code
  const id = uuid();
  const ts = now();
  // ttlMs null/<=0 → never expires; otherwise expire ts+ttlMs.
  const expiresAt = ttlMs && ttlMs > 0 ? ts + ttlMs : NEVER_EXPIRES;
  d.prepare("INSERT INTO invites(id, code_hash, role_id, note, expires_at, created_at) VALUES(?,?,?,?,?,?)")
    .run(id, sha256(raw), roleId, note, expiresAt, ts);
  writeAudit({ actor, action: "invite_created", target: id, meta: { note, expiresAt } });
  return { code: raw, id, expiresAt };
}

/** Delete an unclaimed invite. */
export function revokeInvite(id, actor = "admin") {
  const d = getDb();
  const inv = d.prepare("SELECT * FROM invites WHERE id = ?").get(id);
  if (!inv) return;
  if (inv.claimed_at) throw new Error("That invite was already claimed and can't be revoked.");
  d.prepare("DELETE FROM invites WHERE id = ?").run(id);
  writeAudit({ actor, action: "invite_revoked", target: id });
}

/** Lightweight validity check for the claim screen (does not consume the invite). */
export function inviteStatus(code) {
  const inv = inviteByCode(code);
  if (!inv) return { valid: false, reason: "Unknown invite code." };
  if (inv.claimed_at) return { valid: false, reason: "This invite has already been used." };
  if (inv.expires_at <= now()) return { valid: false, reason: "This invite has expired — ask for a new one." };
  const role = inv.role_id ? getDb().prepare("SELECT name FROM roles WHERE id = ?").get(inv.role_id) : null;
  return { valid: true, roleName: role ? role.name : "member" };
}

export function inviteByCode(code) {
  return getDb().prepare("SELECT * FROM invites WHERE code_hash = ?").get(sha256(String(code || "")));
}

/** Claim an invite to create an account + session. Returns { token, user }. */
export function claimInvite({ code, username, password, ip, ua }) {
  const d = getDb();
  const inv = inviteByCode(code);
  if (!inv) throw new Error("Invalid or unknown invite code.");
  if (inv.claimed_at) throw new Error("This invite has already been used.");
  if (inv.expires_at <= now()) throw new Error("This invite has expired — ask for a new one.");

  // Default to the 'member' role if the invite didn't pin one.
  let roleId = inv.role_id;
  if (!roleId) {
    const member = d.prepare("SELECT id FROM roles WHERE name = 'member'").get();
    roleId = member ? member.id : null;
  }

  const user = createUser({ username, password, roleId, actor: `invite:${inv.id}` });
  d.prepare("UPDATE invites SET claimed_by = ?, claimed_at = ? WHERE id = ?").run(user.id, now(), inv.id);
  writeAudit({ actor: user.username, action: "invite_claimed", target: inv.id, ip, userAgent: ua });

  const { token } = createSession({ userId: user.id, ip, ua });
  return { token, user };
}
