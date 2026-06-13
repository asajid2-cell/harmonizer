// Load .env for local runs. In Docker, env vars are provided directly and the
// missing-file throw is harmless. Imported FIRST so process.env is populated
// before config.js reads it.
try {
  process.loadEnvFile();
} catch {
  /* no .env file — env comes from the environment (Docker/compose) */
}
