// Verifies the drop-in requireAccess middleware against the real verify endpoint.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";

const DB = path.join(os.tmpdir(), `hl-auth-int-${Date.now()}.db`);
process.env.DB_PATH = DB;
process.env.COOKIE_SECURE = "0";
process.env.BASE_PATH = "/auth";
process.env.BOOTSTRAP_ADMIN_USERNAME = "owner";
process.env.BOOTSTRAP_ADMIN_PASSWORD = "ownerpass12345";
process.env.SEED_PAGES = "cloud-squeeze:Cloud Squeeze:/cloud-squeeze,main:Main:/";
process.env.INTERNAL_KEY = "int-key";

const { createApp } = await import("../src/index.js");
const { getDb, closeDb } = await import("../src/db.js");
const { createUser, createSession } = await import("../src/auth.js");

// Start the auth server, then point the middleware at it.
const authServer = createApp().listen(0);
await new Promise((r) => authServer.once("listening", r));
const authPort = authServer.address().port;
process.env.AUTH_INTERNAL_URL = `http://127.0.0.1:${authPort}`;
process.env.AUTH_INTERNAL_KEY = "int-key";
process.env.AUTH_PUBLIC_BASE = "/auth";
process.env.AUTH_COOKIE_NAME = "hl_session";

const { requireAccess, clearAuthCache } = await import("../integration/requireAccess.js");

// A tiny "property" app gated by the middleware.
const appServer = express()
  .get("/x", requireAccess("cloud-squeeze"), (req, res) => res.send(`ok:${req.hlUser.username}`))
  .listen(0);
await new Promise((r) => appServer.once("listening", r));
let appBase;

before(() => { appBase = `http://127.0.0.1:${appServer.address().port}`; });
after(async () => {
  await new Promise((r) => authServer.close(r));
  await new Promise((r) => appServer.close(r));
  closeDb();
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.existsSync(f) && fs.rmSync(f); } catch {} }
});

// Simulate a request arriving through the public nginx (carries X-Forwarded-For).
function pub(token) {
  const headers = { "x-forwarded-for": "203.0.113.9" };
  if (token) headers.cookie = `hl_session=${token}`;
  return { headers, redirect: "manual" };
}

test("local/on-box request (no proxy headers) bypasses the gate", async () => {
  // Direct loopback request with no X-Forwarded-For => trusted local => 200, no auth.
  const res = await fetch(`${appBase}/x`, { redirect: "manual" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok:local");
});

test("public request with no cookie -> redirect to central login", async () => {
  const res = await fetch(`${appBase}/x`, pub());
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location"), /\/auth\/login\?next=/);
});

test("member without grant -> 403; with grant -> 200", async () => {
  // Restricted mode = grants required (default 'members' would allow any account).
  getDb().prepare("UPDATE pages SET access='restricted' WHERE id='cloud-squeeze'").run();
  clearAuthCache();
  const memberRole = getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id;
  const u = createUser({ username: "member1", password: "pw12345678", roleId: memberRole });
  const { token } = createSession({ userId: u.id });

  let res = await fetch(`${appBase}/x`, pub(token));
  assert.equal(res.status, 403);

  getDb().prepare("INSERT INTO user_page_overrides(user_id, page_id, effect) VALUES(?,?,?)")
    .run(u.id, "cloud-squeeze", "grant");
  clearAuthCache(); // bypass the 60s decision cache for the test

  res = await fetch(`${appBase}/x`, pub(token));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok:member1");
});

test("/internal/pages returns the session's allowed pages, honoring mode + grants", async () => {
  const authBase = `http://127.0.0.1:${authPort}`;
  getDb().prepare("UPDATE pages SET access='restricted' WHERE id='cloud-squeeze'").run();
  getDb().prepare("UPDATE pages SET access='members' WHERE id='main'").run();
  const memberRole = getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id;
  const u = createUser({ username: "pagesu", password: "pw12345678", roleId: memberRole });
  const { token } = createSession({ userId: u.id });
  const list = async () => {
    const r = await fetch(`${authBase}/internal/pages?token=${token}`, { headers: { "x-internal-key": "int-key" } });
    assert.equal(r.status, 200);
    return (await r.json()).pages.map((p) => p.id);
  };
  let ids = await list();
  assert.ok(ids.includes("main"), "members-mode page is included");
  assert.ok(!ids.includes("cloud-squeeze"), "restricted page without a grant is excluded");
  getDb().prepare("INSERT INTO user_page_overrides(user_id, page_id, effect) VALUES(?,?,?)").run(u.id, "cloud-squeeze", "grant");
  ids = await list();
  assert.ok(ids.includes("cloud-squeeze"), "restricted page WITH a grant is included");
  const bad = await fetch(`${authBase}/internal/pages?token=${token}`, { headers: { "x-internal-key": "wrong" } });
  assert.equal(bad.status, 401, "bad internal key is rejected");
});

test("/auth/api/access returns EVERY page with a per-session canOpen flag", async () => {
  const authBase = `http://127.0.0.1:${authPort}`;
  getDb().prepare("UPDATE pages SET access='restricted' WHERE id='cloud-squeeze'").run();
  getDb().prepare("UPDATE pages SET access='public' WHERE id='main'").run();
  const get = async (token) => {
    const headers = token ? { cookie: `hl_session=${token}` } : {};
    const r = await fetch(`${authBase}/auth/api/access`, { headers });
    assert.equal(r.status, 200);
    return r.json();
  };
  const can = (out, id) => out.pages.find((p) => p.id === id)?.canOpen;
  const has = (out, id) => out.pages.some((p) => p.id === id);
  // The full page set is ALWAYS returned (so the landing knows every gateable icon).
  let out = await get(null);
  assert.equal(out.authenticated, false);
  assert.ok(has(out, "main") && has(out, "cloud-squeeze"), "every page is listed regardless of access");
  assert.equal(can(out, "main"), true, "public page openable by signed-out");
  assert.equal(can(out, "cloud-squeeze"), false, "restricted page not openable by signed-out");
  // Signed-in member: public openable, restricted not (until granted).
  const memberRole = getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id;
  const u = createUser({ username: "accessu", password: "pw12345678", roleId: memberRole });
  const { token } = createSession({ userId: u.id });
  out = await get(token);
  assert.equal(out.authenticated, true);
  assert.equal(can(out, "main"), true, "member can open public page");
  assert.equal(can(out, "cloud-squeeze"), false, "member without grant can't open restricted page");
  assert.ok(out.pages.find((p) => p.id === "main").path_prefix, "path_prefix present (landing matches by prefix)");
  getDb().prepare("INSERT INTO user_page_overrides(user_id, page_id, effect) VALUES(?,?,?)").run(u.id, "cloud-squeeze", "grant");
  out = await get(token);
  assert.equal(can(out, "cloud-squeeze"), true, "granted restricted page becomes openable");
});

test("explicit per-user DENY locks a member out of a members-mode page (gate + openable)", async () => {
  const authBase = `http://127.0.0.1:${authPort}`;
  // 'main' is a members-mode page: any signed-in account normally gets it.
  getDb().prepare("UPDATE pages SET access='members' WHERE id='main'").run();
  const memberRole = getDb().prepare("SELECT id FROM roles WHERE name='member'").get().id;
  const u = createUser({ username: "denyu", password: "pw12345678", roleId: memberRole });
  const { token } = createSession({ userId: u.id });
  const canMain = async () => (await (await fetch(`${authBase}/auth/api/access`, { headers: { cookie: `hl_session=${token}` } })).json()).pages.find((p) => p.id === "main")?.canOpen;
  const verify = async () => (await (await fetch(`${authBase}/internal/verify?token=${token}&page=main`, { headers: { "x-internal-key": "int-key" } })).json()).allowed;

  // Before the deny: member can open 'main'.
  assert.equal(await canMain(), true, "members-mode page open to a normal member");
  assert.equal(await verify(), true, "gate allows the member before the deny");

  // Explicit deny on the members-mode page.
  getDb().prepare("INSERT INTO user_page_overrides(user_id,page_id,effect) VALUES(?,?,?)").run(u.id, "main", "deny");
  assert.equal(await canMain(), false, "explicit deny makes the icon non-openable (it hides)");
  assert.equal(await verify(), false, "explicit deny blocks the app gate too (not just the icon)");
});

test("fails closed when auth service is unreachable", async () => {
  // Point a fresh middleware at a dead port.
  process.env.AUTH_INTERNAL_URL = "http://127.0.0.1:1"; // nothing listening
  const mod = await import(`../integration/requireAccess.js?dead=1`);
  const dead = express().get("/x", mod.requireAccess("cloud-squeeze"), (_q, s) => s.send("should-not-reach")).listen(0);
  await new Promise((r) => dead.once("listening", r));
  // Public request (XFF) with a token, but verify is down => fail closed (redirect, never serves).
  const res = await fetch(`http://127.0.0.1:${dead.address().port}/x`, pub("whatever"));
  assert.equal(res.status, 302);
  await new Promise((r) => dead.close(r));
});
