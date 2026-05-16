# Configuration Reference

This page lists public configuration knobs and runtime paths. Values belong in a local `.env` file, not in source control.

## Environment Variables

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `SECRET_KEY` | required for deployment | Flask | Session signing. Set this before running anything beyond a local throwaway session. |
| `CHEATSHEET_PASSWORD` | blank | Flask cheatsheet routes | Enables protected cheatsheet uploads when set. Blank disables public uploads. |
| `OURSPACE_ADMIN_PASSWORD` | blank | OurSpace | Initializes the admin password on a fresh local database. Blank creates an unprinted random value. |
| `SPOTIFY_CLIENT_ID` | blank | audio workflows | Spotify metadata and download helpers. |
| `SPOTIFY_CLIENT_SECRET` | blank | audio workflows | Spotify metadata and download helpers. |
| `YOUTUBE_API_KEY` | blank | audio workflows | Optional YouTube metadata lookup. |
| `GOOGLE_CLIENT_ID` | blank | Google OAuth flow | Optional authenticated download flow. |
| `GOOGLE_CLIENT_SECRET` | blank | Google OAuth flow | Optional authenticated download flow. |
| `GEMINI_API_KEY` | blank | Talk to Disco-teque | Gemini-backed chat. |
| `GEMINI_MODEL` | app default | Talk to Disco-teque | Optional Gemini model override. |
| `GROQ_API_KEY` | blank | Talk to Disco-teque | Groq-backed chat. |
| `CODESNIFF_BACKEND_URL` | `http://localhost:8000` | Flask proxy | CodeSniff API target. |
| `CODESCOPE_STORAGE_DIR` | service default | CodeSniff | Vector index and metadata storage. |
| `RL_POLICY_MODE` | app default | RL playback policy | Selects baseline, auto, or RL-assisted behavior where supported. |
| `RL_POLICY_EPS` | app default | RL playback policy | Exploration rate for local policy experiments. |
| `RL_LABELER_TOKEN` | blank | RL labeler | Optional labeler protection for deployments that require it. |

## Runtime Paths

| Path | Tracked | Purpose |
| --- | --- | --- |
| `backend/uploads/` | no | Uploaded, downloaded, or generated media. |
| `backend/data/` | no | Analysis caches, RL data, and local app state. |
| `backend/ourspace_data/` | no | OurSpace SQLite database and uploaded profile media. |
| `codesniff/backend/storage/` | no | CodeSniff indexes and metadata. |
| `playwright-code/artifacts/` | no | Screenshots and local test output. |
| `frontend/assets/audio/` | yes | Curated demo audio assets. |
| `venpod/emsdk/` | no | Optional local Emscripten SDK install. |

## Validation Commands

| Command | Purpose |
| --- | --- |
| `python -m compileall backend` | Checks Python syntax for the Flask backend. |
| `node --check frontend/js/eldrichify.js` | Checks JavaScript syntax for the Eldrichify client script. |
| `docker compose config` | Validates Docker Compose configuration when Docker is installed. |
| `python -m pytest` from `codesniff/backend` | Runs CodeSniff backend tests when dependencies are installed. |
| `git submodule status --recursive` | Confirms no broken submodule pointers are present. |
