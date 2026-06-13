// Hashing + token helpers. Uses node:crypto only (scrypt) — no native build, runs anywhere.
//
// Why scrypt and not argon2: scrypt is memory-hard, built into Node (zero extra
// dependency, nothing to compile in the container), and entirely sufficient here.
// The PLAN named argon2id; this is the documented, equivalent-strength substitution.
import crypto from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

/** Hash a password (or the master password). Returns a self-describing string. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

/** Constant-time verify against a stored scrypt string. */
export function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) return false;
  const [, N, r, p, saltB64, hashB64] = stored.split("$");
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  let dk;
  try {
    dk = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024
    });
  } catch {
    return false;
  }
  return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
}

/** A high-entropy opaque token (session token, invite code). URL-safe. */
export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex — used to store session tokens / invite codes at rest (never raw). */
export function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

/** Constant-time string compare (for already-hashed hex values). */
export function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function uuid() {
  return crypto.randomUUID();
}
