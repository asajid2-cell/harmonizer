# Configuration Reference

## Environment Variables

| variable | default | purpose |
| --- | --- | --- |
| `SECRET_KEY` | required for deployment | Flask session signing. |
| `SPOTIFY_CLIENT_ID` | blank | Spotify metadata and spotdl workflows. |
| `SPOTIFY_CLIENT_SECRET` | blank | Spotify metadata and spotdl workflows. |
| `YOUTUBE_API_KEY` | blank | Optional YouTube metadata. |
| `GOOGLE_CLIENT_ID` | blank | Google OAuth download flow. |
| `GOOGLE_CLIENT_SECRET` | blank | Google OAuth download flow. |
| `GEMINI_API_KEY` | blank | Gemini-backed Disco-teque chat. |
| `GEMINI_MODEL` | app default | Optional Gemini model override. |
| `GROQ_API_KEY` | blank | Groq-backed Disco-teque chat. |
| `CHEATSHEET_PASSWORD` | blank | Enables cheatsheet uploads when set; blank disables uploads. |
| `CODESNIFF_BACKEND_URL` | `http://localhost:8000` | Flask proxy target for CodeSniff. |
| `CODESCOPE_STORAGE_DIR` | service default | CodeSniff vector/index storage path. |

## Runtime Paths

| path | tracked | purpose |
| --- | --- | --- |
| `backend/uploads/` | no | Uploaded or downloaded audio. |
| `backend/data/` | no | Analysis and RL runtime data. |
| `backend/ourspace_data/` | no | OurSpace SQLite database and uploaded media. |
| `codesniff/backend/storage/` | no | CodeSniff FAISS index and metadata. |
| `frontend/assets/audio/` | yes | Curated demo audio assets. |
| `playwright-code/artifacts/` | no | Local screenshots and test outputs. |
| `venpod/emsdk/` | no | Optional local Emscripten SDK install. |

## Validation Commands

| command | purpose |
| --- | --- |
| `python -m compileall backend` | Python syntax check for the Flask backend. |
| `docker compose config` | Validate Compose file syntax. |
| `python -m pytest` in `codesniff/backend` | Run CodeSniff backend tests when dependencies are installed. |
