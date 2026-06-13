// Authorization resolution: allowed = (∪ role pages) − denies + grants.
// admin role ⇒ all pages. Master sessions bypass this entirely (handled in auth.js).
import { getDb } from "./db.js";

export function getUserRoles(userId) {
  return getDb()
    .prepare(
      `SELECT r.id, r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`
    )
    .all(userId);
}

// Two privileged tiers: `owner` (top, protected) and `admin` (one below).
// Both are "admin-capable" (reach the dashboard, all pages); only owner is protected.
export function isOwner(userId) {
  return getUserRoles(userId).some((r) => r.name === "owner");
}
export function isAdmin(userId) {
  return getUserRoles(userId).some((r) => r.name === "admin" || r.name === "owner");
}

/** Set<page_id> the user may access. Admin ⇒ every page. */
export function allowedPageIds(userId) {
  const d = getDb();
  if (isAdmin(userId)) {
    return new Set(d.prepare("SELECT id FROM pages").all().map((p) => p.id));
  }
  const fromRoles = d
    .prepare(
      `SELECT DISTINCT rp.page_id FROM role_pages rp
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`
    )
    .all(userId)
    .map((r) => r.page_id);

  const overrides = d
    .prepare("SELECT page_id, effect FROM user_page_overrides WHERE user_id = ?")
    .all(userId);

  const allowed = new Set(fromRoles);
  for (const o of overrides) {
    if (o.effect === "deny") allowed.delete(o.page_id);     // explicit deny wins
  }
  for (const o of overrides) {
    if (o.effect === "grant") allowed.add(o.page_id);       // explicit grant wins
  }
  return allowed;
}

export function canAccess(userId, pageId) {
  if (!pageId) return true; // a page-less check is just "are you authenticated"
  return allowedPageIds(userId).has(pageId);
}

export const ACCESS_MODES = ["public", "members", "restricted"];

/** A page's access mode. Unknown pages fail closed ('restricted'). */
export function pageAccessMode(pageId) {
  const row = getDb().prepare("SELECT access FROM pages WHERE id = ?").get(pageId);
  if (!row) return "restricted";
  return ACCESS_MODES.includes(row.access) ? row.access : "members";
}

export function setPageAccess(pageId, mode) {
  if (!ACCESS_MODES.includes(mode)) throw new Error("Invalid access mode.");
  const info = getDb().prepare("UPDATE pages SET access = ? WHERE id = ?").run(mode, pageId);
  if (info.changes === 0) throw new Error("Unknown page.");
}

const PAGE_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export function createPage({ id, label, pathPrefix, access = "members" }) {
  const pid = String(id || "").trim().toLowerCase();
  if (!PAGE_ID_RE.test(pid)) throw new Error("Page id must be 2–41 chars: a–z, 0–9, hyphen.");
  const prefix = String(pathPrefix || "").trim();
  if (!prefix.startsWith("/")) throw new Error("Path prefix must start with '/'.");
  if (!ACCESS_MODES.includes(access)) throw new Error("Invalid access mode.");
  const d = getDb();
  if (d.prepare("SELECT 1 FROM pages WHERE id = ?").get(pid)) throw new Error("A page with that id already exists.");
  d.prepare("INSERT INTO pages(id, label, path_prefix, access) VALUES(?,?,?,?)")
    .run(pid, String(label || pid).trim(), prefix, access);
  // owner + admin roles reach every page
  const priv = d.prepare("SELECT id FROM roles WHERE name IN ('owner','admin')").all();
  const grant = d.prepare("INSERT INTO role_pages(role_id, page_id) VALUES(?, ?) ON CONFLICT DO NOTHING");
  for (const r of priv) grant.run(r.id, pid);
  return pid;
}

export function allPages() {
  return getDb().prepare("SELECT * FROM pages ORDER BY label").all();
}

// A user's explicit per-page override ('grant' | 'deny' | null). An explicit deny
// is the strongest, most specific signal — it locks a single account out of a page
// even when the page is open to "members", which is what makes the lockdown granular.
export function pageOverrideEffect(userId, pageId) {
  const row = getDb().prepare("SELECT effect FROM user_page_overrides WHERE user_id = ? AND page_id = ?").get(userId, pageId);
  return row ? row.effect : null;
}

// The pages a session may OPEN, resolved by each page's access mode:
//   public     -> everyone (even signed-out)
//   members    -> any signed-in account (UNLESS explicitly denied)
//   restricted -> only an explicitly-granted account (role/override); unknown -> restricted
// An explicit per-user DENY always wins (members + restricted); master is never locked out.
// The SINGLE source of truth shared by /internal/pages (server-side gating) and the
// public /auth/api/access (the landing's per-icon gate). `v` is a verified session
// ({ ok, userId, isMaster }) or null/falsey for signed-out.
export function openablePages(v) {
  const authed = Boolean(v && v.ok);
  return allPages().filter((p) => {
    if (p.access === "public") return true;                              // public: open to all
    if (!authed) return false;                                           // members/restricted need a session
    if (v.isMaster) return true;                                         // master is never locked out
    if (pageOverrideEffect(v.userId, p.id) === "deny") return false;     // explicit per-user deny wins
    if (p.access === "members") return true;                             // any signed-in account
    return canAccess(v.userId, p.id);                                    // restricted: role/override grant
  });
}
export function allRoles() {
  return getDb().prepare("SELECT * FROM roles ORDER BY name").all();
}
export function rolePageIds(roleId) {
  return getDb().prepare("SELECT page_id FROM role_pages WHERE role_id = ?").all(roleId).map((r) => r.page_id);
}
