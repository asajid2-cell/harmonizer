// SQLite storage. Single file, WAL, transactional. The auth service is the only writer.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { hashPassword, sha256, uuid } from "./crypto.js";

let db;

export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}

function migrate(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',     -- active | suspended
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      path_prefix TEXT NOT NULL,
      access TEXT NOT NULL DEFAULT 'members'      -- public | members | restricted
    );

    CREATE TABLE IF NOT EXISTS role_pages (
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, page_id)
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS user_page_overrides (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      effect TEXT NOT NULL,                      -- grant | deny
      PRIMARY KEY (user_id, page_id)
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      code_hash TEXT UNIQUE NOT NULL,
      role_id TEXT REFERENCES roles(id) ON DELETE SET NULL,
      note TEXT,
      expires_at INTEGER NOT NULL,
      claimed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      claimed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      is_master INTEGER NOT NULL DEFAULT 0,      -- 1 = root master-password session
      device_label TEXT,
      ip TEXT,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      session_epoch INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      ts INTEGER NOT NULL,
      actor TEXT,
      action TEXT NOT NULL,
      target TEXT,
      ip TEXT,
      user_agent TEXT,
      meta_json TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code_hash);
    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
  `);

  // Migration for existing DBs: add pages.access if it isn't there yet.
  const pageCols = d.prepare("PRAGMA table_info(pages)").all();
  if (!pageCols.some((c) => c.name === "access")) {
    d.exec("ALTER TABLE pages ADD COLUMN access TEXT NOT NULL DEFAULT 'members'");
  }
}

// --- settings helpers -------------------------------------------------------

export function getSetting(key, dflt = null) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : dflt;
}
export function setSetting(key, value) {
  getDb()
    .prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, String(value));
}
export function getSessionEpoch() {
  return Number(getSetting("session_epoch", "1"));
}

// --- first-run seed ---------------------------------------------------------

/** Idempotent: creates roles, pages, the admin account, and the master hash if absent. */
export function seed() {
  const d = getDb();
  const now = Date.now();

  if (!getSetting("session_epoch")) setSetting("session_epoch", "1");

  // Roles
  const ensureRole = d.prepare("INSERT INTO roles(id, name) VALUES(?, ?) ON CONFLICT(name) DO NOTHING");
  ensureRole.run(uuid(), "owner"); // top tier (protected)
  ensureRole.run(uuid(), "admin"); // one below owner
  ensureRole.run(uuid(), "member");
  ensureRole.run(uuid(), "demo");
  const roleByName = (name) => d.prepare("SELECT * FROM roles WHERE name = ?").get(name);

  // Pages from SEED_PAGES (id:label:pathPrefix[:access], comma-separated).
  // On conflict we refresh label/path_prefix but NEVER the access mode — that's
  // admin-owned at runtime, so a redeploy can't stomp it back to the seed value.
  const ensurePage = d.prepare(
    "INSERT INTO pages(id, label, path_prefix, access) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET label=excluded.label, path_prefix=excluded.path_prefix"
  );
  for (const spec of config.seedPages.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, label, prefix, access] = spec.split(":");
    if (id && prefix) ensurePage.run(id, label || id, prefix, access || "members");
  }

  // owner + admin roles both grant every page
  const ownerRole = roleByName("owner");
  const adminRole = roleByName("admin");
  const allPages = d.prepare("SELECT id FROM pages").all();
  const grant = d.prepare("INSERT INTO role_pages(role_id, page_id) VALUES(?, ?) ON CONFLICT DO NOTHING");
  for (const p of allPages) {
    grant.run(ownerRole.id, p.id);
    grant.run(adminRole.id, p.id);
  }

  // Bootstrap OWNER account (only if no users yet)
  const userCount = d.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (userCount === 0 && config.bootstrapAdminUsername && config.bootstrapAdminPassword) {
    const uid = uuid();
    d.prepare("INSERT INTO users(id, username, password_hash, status, created_at) VALUES(?,?,?,?,?)")
      .run(uid, config.bootstrapAdminUsername, hashPassword(config.bootstrapAdminPassword), "active", now);
    d.prepare("INSERT INTO user_roles(user_id, role_id) VALUES(?, ?)").run(uid, ownerRole.id);
    writeAudit({ actor: "system", action: "bootstrap_owner_created", target: config.bootstrapAdminUsername });
  }

  // Migration: make sure the bootstrap-username account holds the owner role
  // (older deployments seeded it with the 'admin' role).
  const bootUser = d.prepare("SELECT id FROM users WHERE username = ?").get(config.bootstrapAdminUsername);
  if (bootUser) {
    d.prepare("INSERT INTO user_roles(user_id, role_id) VALUES(?, ?) ON CONFLICT DO NOTHING").run(bootUser.id, ownerRole.id);
  }

  // Master password hash (only set from env if not already configured)
  if (config.masterPassword && !getSetting("master_password_hash")) {
    setSetting("master_password_hash", hashPassword(config.masterPassword));
    writeAudit({ actor: "system", action: "master_password_set", target: "(from env bootstrap)" });
  }
}

// --- audit ------------------------------------------------------------------

export function writeAudit({ actor = null, action, target = null, ip = null, userAgent = null, meta = null }) {
  getDb()
    .prepare("INSERT INTO audit(id, ts, actor, action, target, ip, user_agent, meta_json) VALUES(?,?,?,?,?,?,?,?)")
    .run(uuid(), Date.now(), actor, action, target, ip, userAgent, meta ? JSON.stringify(meta) : null);
}
