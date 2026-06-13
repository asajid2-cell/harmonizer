// Create (or reset) a privileged `admin`-role account. Username from argv, password
// from STDIN (so it isn't in the process list). Idempotent. Usage:
//   printf %s 'thepassword' | node scripts/create-admin.js admin
import "../src/env.js";
import { getDb } from "../src/db.js";
import { hashPassword } from "../src/crypto.js";
import { createUser } from "../src/auth.js";

const username = (process.argv[2] || "").trim();
if (!username) {
  console.error("usage: node scripts/create-admin.js <username>   (password on stdin)");
  process.exit(1);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const pw = buf.replace(/[\r\n]+$/, "");
  if (pw.length < 8) {
    console.error("password too short (min 8)");
    process.exit(1);
  }
  const d = getDb();
  const adminRole = d.prepare("SELECT id FROM roles WHERE name='admin'").get();
  if (!adminRole) {
    console.error("admin role missing — start the service once to seed roles.");
    process.exit(1);
  }
  const existing = d.prepare("SELECT id FROM users WHERE username=?").get(username);
  if (existing) {
    d.prepare("UPDATE users SET password_hash=?, status='active' WHERE id=?").run(hashPassword(pw), existing.id);
    d.prepare("INSERT INTO user_roles(user_id, role_id) VALUES(?,?) ON CONFLICT DO NOTHING").run(existing.id, adminRole.id);
    console.log(`updated '${username}' (password reset, admin role ensured)`);
  } else {
    createUser({ username, password: pw, roleId: adminRole.id, actor: "owner-setup" });
    console.log(`created admin account '${username}'`);
  }
  process.exit(0);
});
