// Centralized configuration, read once from the environment.
import path from "node:path";

function bool(v, dflt = false) {
  if (v === undefined || v === "") return dflt;
  return v === "1" || String(v).toLowerCase() === "true";
}
function int(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const config = {
  port: int(process.env.PORT, 4200),
  // Bind localhost by default so /internal is never on a public interface
  // (works with host-networked Docker; nginx + sibling containers reach it via 127.0.0.1).
  host: process.env.HOST || "127.0.0.1",
  basePath: (process.env.BASE_PATH || "/auth").replace(/\/$/, ""),

  cookieName: process.env.COOKIE_NAME || "hl_session",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined, // undefined => host-only cookie
  cookieSecure: bool(process.env.COOKIE_SECURE, true),
  sessionTtlMs: int(process.env.SESSION_TTL_DAYS, 90) * DAY,
  inviteTtlMs: int(process.env.INVITE_TTL_HOURS, 24) * HOUR,

  dbPath: process.env.DB_PATH || path.resolve("data/hl-auth.db"),

  bootstrapAdminUsername: process.env.BOOTSTRAP_ADMIN_USERNAME || "owner",
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  masterPassword: process.env.MASTER_PASSWORD || "",

  seedPages: process.env.SEED_PAGES || "main:Main Site:/",

  // Optional shared secret apps must send (X-Internal-Key) to call /internal/verify.
  // Defense-in-depth on top of nginx never routing /internal publicly.
  internalKey: process.env.INTERNAL_KEY || "",

  trustProxy: bool(process.env.TRUST_PROXY, true),

  // Verify-cache hint advertised to integrating apps (seconds). The apps own the cache;
  // this is just the recommended TTL = the revocation latency.
  verifyCacheSeconds: 60
};

// A link helper so generated URLs always carry the public base path.
export function link(p = "") {
  const suffix = p.startsWith("/") ? p : `/${p}`;
  return `${config.basePath}${suffix}`.replace(/\/+$/, (m) => (suffix === "/" ? m : "")) || config.basePath;
}
