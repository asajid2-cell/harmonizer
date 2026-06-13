// Set the master password from STDIN (so it never appears in argv/process list).
// Stores ONLY a scrypt hash in settings.master_password_hash. Usage:
//   printf %s 'thepassword' | node scripts/set-master.js
import "../src/env.js";
import { setMasterPassword, isMasterConfigured } from "../src/auth.js";

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  const pw = buf.replace(/[\r\n]+$/, "");
  if (pw.length < 8) {
    console.error("master password too short (min 8)");
    process.exit(1);
  }
  setMasterPassword(pw, "owner-setup");
  console.log("master password set (scrypt hash stored); configured =", isMasterConfigured());
  process.exit(0);
});
