# Harmonizer

Harmonizer is a public snapshot of a creative web lab for audio experiments, generative image tools, social-profile prototypes, and semantic code search. The repo is a monorepo because the pieces share one Flask/Docker deployment and a retro browser front end.

The code is useful as a working demo and research playground. It is not packaged as a production SaaS template, and several features require local credentials or model downloads before they are useful.

## What Is Included

| area | status | proof or entry point | notes |
| --- | --- | --- | --- |
| Internet Discotheque shell | active | `frontend/index.html` | Retro desktop-style launcher for the public pages. |
| Harmonizer audio visualizer | active | `frontend/harmonizer.html`, `frontend/js/visualizer.js` | Upload and analyze tracks, then explore beat jumps, queues, loops, and visual modes. |
| Eldrichify image transform | experimental | `frontend/eldrichify.html`, `backend/eldrichify.py` | Requires local model checkpoints supplied outside Git. Large model artifacts are intentionally not tracked. |
| OurSpace | experimental | `frontend/ourspace.html`, `backend/ourspace_db.py` | Local social-profile builder with auth and media uploads. Runtime databases and uploads are ignored. |
| CodeSniff | active prototype | `codesniff/` | Semantic code search backed by CodeBERT and FAISS. |
| RL jump labeler | research tool | `docs/RL_LOGGING.md`, `rl_models/` | Logs and labels audio jump events for policy experiments. Runtime data is ignored. |
| VENPOD prototype | archived prototype | `venpod/` | Early WebGPU/WASM voxel prototype kept for provenance. The Emscripten SDK is not vendored. |

## Repository Status

This branch is prepared for public source review:

- generated dependency folders and build outputs are not tracked;
- local databases, uploads, cookies, and model checkpoints are ignored;
- public setup uses placeholders in `.env.example`;
- large audio demo assets under `frontend/assets/audio/` are intentionally kept.

Git history may still contain older runtime files from before this cleanup. If you need a clean public import with no historical databases or uploads, rewrite history or export this tree into a fresh repository.

## Quickstart

Prerequisites:

- Python 3.11
- Node.js 20 or newer for CodeSniff frontend work
- Docker and Docker Compose for the full stack
- `ffmpeg` for audio analysis and download workflows

Create local configuration:

```bash
cp .env.example .env
```

At minimum, set `SECRET_KEY` in `.env`. Optional features use the other keys:

| variable | required for |
| --- | --- |
| `SECRET_KEY` | Flask sessions |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Spotify/spotdl workflows |
| `YOUTUBE_API_KEY` | optional YouTube metadata |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth download flow |
| `GEMINI_API_KEY` | Talk to Disco-teque via Gemini |
| `GROQ_API_KEY` | Talk to Disco-teque via Groq |
| `CHEATSHEET_PASSWORD` | enables cheatsheet uploads; blank disables uploads |

Run the full stack with Docker:

```bash
docker compose build
docker compose up
```

Open:

```text
http://localhost:5000
```

Run the Flask app locally without Docker:

```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python backend/app.py
```

CodeSniff runs as a separate FastAPI service during local development:

```bash
cd codesniff/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Validation

Use these checks after a clean clone:

```bash
python -m compileall backend
docker compose config
```

For CodeSniff:

```bash
cd codesniff/backend
python -m pytest
```

If a command needs credentials, run it with a local `.env` and do not commit generated runtime files.

## Data And Generated Files

The repo ignores runtime data by default:

- `backend/uploads/`
- `backend/data/`
- `backend/ourspace_data/`
- `codesniff/backend/storage/`
- `playwright-code/artifacts/`
- model checkpoints and local fine-tune artifacts
- local Emscripten SDK installs under `venpod/emsdk/`

The checked-in audio files under `frontend/assets/audio/` are part of the demo experience and are kept intentionally.

## Documentation

- [Getting started](docs/tutorials/getting-started.md)
- [Common tasks](docs/how-to/common-tasks.md)
- [Configuration reference](docs/reference/configuration.md)
- [Architecture overview](docs/explanation/architecture.md)
- [Demo script](docs/demo/demo-script.md)
- [OurSpace authentication guide](OURSPACE_AUTH_GUIDE.md)
- [RL logging](docs/RL_LOGGING.md)

## Limitations

- Several features are prototypes sharing one Flask app, so the code is not as modular as a single-purpose package.
- Image generation and chat features depend on external APIs or local model setup.
- VENPOD is kept as historical prototype code; use the separate VENPOD/voxelrender repo for current development.
- Public release hygiene applies to the current tree. Older Git history may need rewriting before a formal public relaunch.

## License

MIT. See [LICENSE](LICENSE).
