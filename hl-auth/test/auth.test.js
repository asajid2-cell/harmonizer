// End-to-end verification of the auth flows, in-process against a real listener.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Configure a throwaway DB + test secrets BEFORE importing the app.
const DB = path.join(os.tmpdir(), `hl-auth-test-${Date.now()}.db`);
process.env.DB_PATH = DB;
process.env.COOKIE_SECURE = "0";
process.env.BASE_PATH = "/auth";
process.env.BOOTSTRAP_ADMIN_USERNAME = "owner";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "ownerpass12345";
process.env.MASTER_PASSWORD = "master-key-very-long-123456";
process.env.SEED_PAGES = "cloud-squeeze:Cloud Squeeze:/cloud-squeeze,main:Main:/";
process.env.INTERNAL_KEY = "test-key";
const TEST_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD;
process.env.AUTH_RATELIMIT_MAX = "100000"; // don't rate-limit the test suite (one client IP)

const { createApp } = await import("../src/index.js");
const { getDb, closeDb } = await import("../src/db.js");
const { createUser } = await import("../src/auth.js");

let server, base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server?.close(r));
  closeDb();
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) {
    try { fs.existsSync(f) && fs.rmSync(f); } catch { /* windows file lock — non-fatal */ }
  }
});

function makeJar() {
  const cookies = new Map();
  return {
    get: (n) => cookies.get(n),
    async fetch(url, opts = {}) {
      const headers = new Headers(opts.headers || {});
      if (cookies.size) headers.set("cookie", [...cookies].map(([k, v]) => `${k}=${v}`).join("; "));
      const res = await fetch(url, { ...opts, headers, redirect: "manual" });
      for (const sc of res.headers.getSetCookie?.() || []) {
        const pair = sc.split(";")[0];
        const i = pair.indexOf("=");
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        if (v === "") cookies.delete(k);
        else cookies.set(k, v);
      }
      return res;
    }
  };
}
const form = (obj) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString()
});
async function csrf(jar, url) {
  await jar.fetch(url);
  return jar.get("hl_csrf");
}

test("internal health", async () => {
  const res = await fetch(`${base}/internal/health`);
  assert.equal((await res.json()).ok, true);
});

test("internal authed oracle authenticates valid sessions for GET and POST", async () => {
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  assert.equal((await jar.fetch(`${base}/internal/authed`, {
    headers: { "x-internal-key": "test-key" }
  })).status, 200);
  assert.equal((await jar.fetch(`${base}/internal/authed`, {
    ...form({}),
    headers: { ...form({}).headers, "x-internal-key": "test-key" }
  })).status, 200);
});

test("internal authed oracle rejects missing, invalid, revoked, and expired sessions", async () => {
  const check = (token, method = "GET") => fetch(`${base}/internal/authed`, {
    method,
    headers: { "x-internal-key": "test-key", "x-session-token": token }
  });
  assert.equal((await check(null)).status, 401);
  assert.equal((await check("not-a-session")).status, 401);

  const revoked = makeJar();
  let c = await csrf(revoked, `${base}/auth/login`);
  await revoked.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  const revokedToken = revoked.get("hl_session");
  (await import("../src/auth.js")).revokeByToken(revokedToken);
  assert.equal((await check(revokedToken)).status, 401);

  const expired = makeJar();
  c = await csrf(expired, `${base}/auth/login`);
  await expired.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  const expiredToken = expired.get("hl_session");
  getDb().prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
    .run(Date.now() - 1, (await import("../src/crypto.js")).sha256(expiredToken));
  assert.equal((await check(expiredToken)).status, 401);
});

test("internal authed oracle requires the internal key even for a valid session", async () => {
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  const token = jar.get("hl_session");
  assert.equal((await fetch(`${base}/internal/authed`, { headers: { "x-session-token": token } })).status, 401);
  assert.equal((await fetch(`${base}/internal/authed`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-internal-key": "wrong", "x-session-token": token },
    body: ""
  })).status, 401);
});

test("admin can log in and sees all pages; verify confirms admin", async () => {
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  const res = await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  assert.equal(res.status, 302);
  assert.ok(jar.get("hl_session"), "session cookie set");

  const acct = await jar.fetch(`${base}/auth/account`);
  const html = await acct.text();
  assert.ok(html.includes("Cloud Squeeze") && html.includes("Main"), "admin sees all pages");

  const v = await (await fetch(`${base}/internal/verify?page=cloud-squeeze`, {
    headers: { "x-session-token": jar.get("hl_session"), "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.authenticated, true);
  assert.equal(v.user.isAdmin, true);
  assert.equal(v.allowed, true);
});

test("invite -> claim -> member is denied an ungranted page, then granted via override", async () => {
  // This flow tests the restricted model, so pin the page to 'restricted'
  // (default is now 'members', which would let any account in).
  (await import("../src/authz.js")).setPageAccess("cloud-squeeze", "restricted");
  // Admin creates an invite (member role).
  const admin = makeJar();
  let c = await csrf(admin, `${base}/auth/login`);
  await admin.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  c = await csrf(admin, `${base}/auth/admin`);
  const memberRoleId = getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id;
  const invRes = await admin.fetch(`${base}/auth/admin/invites`, form({ _csrf: c, role_id: memberRoleId, note: "test" }));
  const invHtml = await invRes.text();
  const code = invHtml.match(/id="code"[^>]*value="([^"]+)"/)[1];
  assert.ok(code, "invite code revealed");

  // New person claims it.
  const member = makeJar();
  const cc = await csrf(member, `${base}/auth/claim`);
  const claim = await member.fetch(`${base}/auth/claim`, form({ _csrf: cc, code, username: "sam", password: "sampassword1" }));
  assert.equal(claim.status, 302);
  const token = member.get("hl_session");
  assert.ok(token);

  // Member role grants no pages -> denied cloud-squeeze.
  let v = await (await fetch(`${base}/internal/verify?page=cloud-squeeze`, {
    headers: { "x-session-token": token, "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.authenticated, true);
  assert.equal(v.allowed, false);
  assert.equal(v.reason, "not_authorized");

  // Admin grants an override for that page.
  const samId = getDb().prepare("SELECT id FROM users WHERE username='sam'").get().id;
  c = await csrf(admin, `${base}/auth/admin`);
  await admin.fetch(`${base}/auth/admin/users/override`, form({ _csrf: c, user_id: samId, page_id: "cloud-squeeze", effect: "grant" }));

  v = await (await fetch(`${base}/internal/verify?page=cloud-squeeze`, {
    headers: { "x-session-token": token, "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.allowed, true, "override grant lets member in");

  // Suspend -> session no longer valid.
  c = await csrf(admin, `${base}/auth/admin`);
  await admin.fetch(`${base}/auth/admin/users/status`, form({ _csrf: c, user_id: samId, op: "suspend" }));
  v = await (await fetch(`${base}/internal/verify?page=cloud-squeeze`, {
    headers: { "x-session-token": token, "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.authenticated, false, "suspended user is locked out");
});

test("master password logs in via the ADMIN username and opens any page; lands on /admin", async () => {
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  const res = await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: "master-key-very-long-123456" }));
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /\/auth\/admin$/); // admins land on the admin page
  const v = await (await fetch(`${base}/internal/verify?page=cloud-squeeze`, {
    headers: { "x-session-token": jar.get("hl_session"), "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.user.isMaster, true);
  assert.equal(v.allowed, true);
  assert.equal(v.pages, "*");
});

test("master password does NOT work for a non-admin username", async () => {
  createUser({ username: "plainuser", password: "plainpass123", roleId: getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id });
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  const res = await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "plainuser", password: "master-key-very-long-123456" }));
  assert.equal(res.status, 401); // master is only an admin-account fallback
  assert.ok(!jar.get("hl_session"));
});

test("self-service change password: old fails, new works", async () => {
  createUser({ username: "changer", password: "oldpass123", roleId: getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id });
  const jar = makeJar();
  let c = await csrf(jar, `${base}/auth/login`);
  await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "changer", password: "oldpass123" }));
  c = await csrf(jar, `${base}/auth/account`);
  const ch = await jar.fetch(`${base}/auth/account/password`, form({ _csrf: c, current_password: "oldpass123", new_password: "brandnew456" }));
  assert.equal(ch.status, 302);
  // Old password now rejected, new password accepted.
  const jar2 = makeJar();
  let c2 = await csrf(jar2, `${base}/auth/login`);
  const oldTry = await jar2.fetch(`${base}/auth/login`, form({ _csrf: c2, username: "changer", password: "oldpass123" }));
  assert.equal(oldTry.status, 401);
  const jar3 = makeJar();
  let c3 = await csrf(jar3, `${base}/auth/login`);
  const newTry = await jar3.fetch(`${base}/auth/login`, form({ _csrf: c3, username: "changer", password: "brandnew456" }));
  assert.equal(newTry.status, 302);
  assert.ok(jar3.get("hl_session"));
});

test("verify rejects a bad internal key", async () => {
  const res = await fetch(`${base}/internal/verify`, { headers: { "x-internal-key": "wrong" } });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).reason, "bad_internal_key");
});

test("login POST without CSRF is rejected", async () => {
  const res = await fetch(`${base}/auth/login`, form({ username: "owner", password: TEST_ADMIN_PASSWORD }));
  assert.equal(res.status, 403);
});

test("admin-role account lands on /account (not the dashboard) but can still reach /admin", async () => {
  const adminRoleId = getDb().prepare("SELECT id FROM roles WHERE name='admin'").get().id;
  createUser({ username: "admin2", password: "adminpass123", roleId: adminRoleId });
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  const res = await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "admin2", password: "adminpass123" }));
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /\/auth\/account$/); // NOT forced to the dashboard
  // but the admin can open the dashboard when they choose to
  const dash = await jar.fetch(`${base}/auth/admin`);
  assert.equal(dash.status, 200);
  // and admin gets all pages
  const v = await (await fetch(`${base}/internal/verify?page=cloud-squeeze`, {
    headers: { "x-session-token": jar.get("hl_session"), "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.allowed, true);
});

test("master password does NOT work for the admin (non-owner) account", async () => {
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  const res = await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "admin2", password: "master-key-very-long-123456" }));
  assert.equal(res.status, 401); // master is the owner's key only
});

test("owner account is protected — suspend is refused", async () => {
  const ownerId = getDb().prepare("SELECT id FROM users WHERE username='owner'").get().id;
  const jar = makeJar();
  let c = await csrf(jar, `${base}/auth/login`);
  await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  c = await csrf(jar, `${base}/auth/admin`);
  const res = await jar.fetch(`${base}/auth/admin/users/status`, form({ _csrf: c, user_id: ownerId, op: "suspend" }));
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /err=/); // refused
  const status = getDb().prepare("SELECT status FROM users WHERE id=?").get(ownerId).status;
  assert.equal(status, "active"); // still active — untouched
});

test("invite with chosen expiry: claim page validates it, then claim works", async () => {
  const admin = makeJar();
  let c = await csrf(admin, `${base}/auth/login`);
  await admin.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  c = await csrf(admin, `${base}/auth/admin`);
  const memberRoleId = getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id;
  const invRes = await admin.fetch(`${base}/auth/admin/invites`, form({ _csrf: c, role_id: memberRoleId, expiry: "never", note: "exp-test" }));
  const code = (await invRes.text()).match(/id="code"[^>]*value="([^"]+)"/)[1];
  assert.ok(code);
  // the claim screen validates the code up front
  const page = await (await fetch(`${base}/auth/claim?code=${encodeURIComponent(code)}`)).text();
  assert.match(page, /Valid invite/);
  // and it can be claimed
  const member = makeJar();
  const cc = await csrf(member, `${base}/auth/claim`);
  const claim = await member.fetch(`${base}/auth/claim`, form({ _csrf: cc, code, username: "expuser", password: "exppass123" }));
  assert.equal(claim.status, 302);
});

test("revoked invite cannot be claimed", async () => {
  const admin = makeJar();
  let c = await csrf(admin, `${base}/auth/login`);
  await admin.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  c = await csrf(admin, `${base}/auth/admin`);
  const invRes = await admin.fetch(`${base}/auth/admin/invites`, form({ _csrf: c, expiry: "7d", note: "to-revoke" }));
  const code = (await invRes.text()).match(/id="code"[^>]*value="([^"]+)"/)[1];
  const inviteId = getDb().prepare("SELECT id FROM invites WHERE note='to-revoke'").get().id;
  c = await csrf(admin, `${base}/auth/admin`);
  await admin.fetch(`${base}/auth/admin/invites/revoke`, form({ _csrf: c, invite_id: inviteId }));
  const page = await (await fetch(`${base}/auth/claim?code=${encodeURIComponent(code)}`)).text();
  assert.match(page, /Unknown invite|expired|already/i);
  const member = makeJar();
  const cc = await csrf(member, `${base}/auth/claim`);
  const claim = await member.fetch(`${base}/auth/claim`, form({ _csrf: cc, code, username: "norevoke", password: "pass12345" }));
  assert.equal(claim.status, 400);
});

test("dedicated change-password screen renders for a logged-in user", async () => {
  const jar = makeJar();
  const c = await csrf(jar, `${base}/auth/login`);
  await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  const page = await (await jar.fetch(`${base}/auth/password`)).text();
  assert.match(page, /Change password/);
  assert.match(page, /current_password/);
});

test("JSON API: /api/login requires same-origin, logs in, /api/me reflects it", async () => {
  const origin = base; // base is http://127.0.0.1:<port> — same host the server sees
  // no Origin header -> 403
  let res = await fetch(`${base}/auth/api/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "owner", password: TEST_ADMIN_PASSWORD })
  });
  assert.equal(res.status, 403);
  // same-origin + good creds -> 200 + cookie
  const jar = makeJar();
  res = await jar.fetch(`${base}/auth/api/login`, {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "owner", password: TEST_ADMIN_PASSWORD })
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.user.isOwner, true);
  assert.ok(jar.get("hl_session"));
  // /api/me reflects the session
  const me = await (await jar.fetch(`${base}/auth/api/me`)).json();
  assert.equal(me.authenticated, true);
  assert.equal(me.user.isAdmin, true);
  // wrong creds -> 401
  res = await fetch(`${base}/auth/api/login`, {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ username: "owner", password: "nope" })
  });
  assert.equal(res.status, 401);
});

test("page access modes drive /internal/verify (public/members/restricted)", async () => {
  const { setPageAccess } = await import("../src/authz.js");

  // owner session
  const ownerJar = makeJar();
  await ownerJar.fetch(`${base}/auth/api/login`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ username: "owner", password: TEST_ADMIN_PASSWORD })
  });
  const ownerToken = ownerJar.get("hl_session");

  // a plain member (no page grants)
  createUser({ username: "modetester", password: "memberpass123", actor: "test" });
  const memberJar = makeJar();
  await memberJar.fetch(`${base}/auth/api/login`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ username: "modetester", password: "memberpass123" })
  });
  const memberToken = memberJar.get("hl_session");

  const verify = (page, token) =>
    fetch(`${base}/internal/verify?page=${page}`, {
      headers: { "x-internal-key": "test-key", ...(token ? { "x-session-token": token } : {}) }
    }).then((r) => r.json());

  // public: allowed with NO token
  setPageAccess("main", "public");
  let d = await verify("main", null);
  assert.equal(d.allowed, true);
  assert.equal(d.public, true);

  // members: any signed-in account, but not anonymous
  setPageAccess("main", "members");
  assert.equal((await verify("main", null)).allowed, false);
  assert.equal((await verify("main", memberToken)).allowed, true);
  assert.equal((await verify("main", ownerToken)).allowed, true);

  // restricted: only granted accounts (owner/admin always; bare member denied)
  setPageAccess("main", "restricted");
  assert.equal((await verify("main", memberToken)).allowed, false);
  assert.equal((await verify("main", ownerToken)).allowed, true);
});

test("owner resets another account's password; a non-owner admin can't reset or set master", async () => {
  // owner session
  const owner = makeJar();
  let c = await csrf(owner, `${base}/auth/login`);
  await owner.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));

  // a member to reset
  createUser({ username: "resetme", password: "oldpassword1", actor: "test" });
  const rid = getDb().prepare("SELECT id FROM users WHERE username='resetme'").get().id;

  // owner resets their password
  c = await csrf(owner, `${base}/auth/admin`);
  let res = await owner.fetch(`${base}/auth/admin/users/password`, form({ _csrf: c, user_id: rid, new_password: "brandnewpass1" }));
  assert.equal(res.status, 302);
  // the new password works
  res = await makeJar().fetch(`${base}/auth/api/login`, {
    method: "POST", headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ username: "resetme", password: "brandnewpass1" })
  });
  assert.equal(res.status, 200);

  // a non-owner admin account
  const adminRoleId = getDb().prepare("SELECT id FROM roles WHERE name='admin'").get().id;
  createUser({ username: "adminacct", password: "adminpass123", roleId: adminRoleId, actor: "test" });
  const adm = makeJar();
  c = await csrf(adm, `${base}/auth/login`);
  await adm.fetch(`${base}/auth/login`, form({ _csrf: c, username: "adminacct", password: "adminpass123" }));

  // admin can't set the master password (owner-only)
  c = await csrf(adm, `${base}/auth/admin`);
  res = await adm.fetch(`${base}/auth/admin/master`, form({ _csrf: c, master: "tryingtosetmaster123" }));
  assert.match(res.headers.get("location"), /err=/);

  // admin can't reset another account's password (owner-only)
  c = await csrf(adm, `${base}/auth/admin`);
  res = await adm.fetch(`${base}/auth/admin/users/password`, form({ _csrf: c, user_id: rid, new_password: "hackedpass1" }));
  assert.match(res.headers.get("location"), /err=/);
});

test("rotate-all invalidates existing sessions (run last)", async () => {
  const jar = makeJar();
  let c = await csrf(jar, `${base}/auth/login`);
  await jar.fetch(`${base}/auth/login`, form({ _csrf: c, username: "owner", password: TEST_ADMIN_PASSWORD }));
  const token = jar.get("hl_session");
  c = await csrf(jar, `${base}/auth/admin`);
  await jar.fetch(`${base}/auth/admin/rotate-all`, form({ _csrf: c }));
  const v = await (await fetch(`${base}/internal/verify`, {
    headers: { "x-session-token": token, "x-internal-key": "test-key" }
  })).json();
  assert.equal(v.authenticated, false, "old session is stale after rotate-all");
});
