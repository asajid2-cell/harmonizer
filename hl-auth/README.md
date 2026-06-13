# hl-auth

Central single sign-on and access control for the Harmonizer Labs apps (harmonizerlabs.cc).
One login rides across every app on the host; access is resolved per page by mode
(public / members / restricted) plus per-user grant/deny overrides.

- **Stack:** Node/Express, better-sqlite3 (WAL), Node `crypto` scrypt. Server-rendered HTML, no SPA.
- **Sessions:** server-side and revocable (not JWT), so sign-out and lockout are near-instant.
- **Integration:** apps drop in `integration/requireAccess.js` and call a loopback verify endpoint;
  a small JSON API (`/api/login`, `/api/me`) lets an app keep its own branded login screen.
- **Admin:** invite-based signup, roles, per-user page grant/deny, sessions, audit log, and a
  per-icon landing lockdown driven by the same page-access model.

Runs as a container behind nginx at `/auth/*`. Secrets are provided via env (see `.env.example`).
