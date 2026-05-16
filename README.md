# Harmonizer

Harmonizer is a creative browser lab for music analysis, visual playback, profile experiments, image processing, and semantic code search. It is built as a monorepo because the tools share a Flask server, static front-end shell, deployment wiring, and a small set of local runtime conventions.

The project is best read as a public research and demo workspace. Some features are stable enough to use locally, while others are preserved as prototypes so the design and implementation history remain understandable.

## Included Tools

| Tool | Status | Entry point | Notes |
| --- | --- | --- | --- |
| Internet Discotheque | active shell | `frontend/index.html` | Retro desktop launcher for the public pages. |
| Harmonizer | active prototype | `frontend/harmonizer.html` | Upload audio, inspect analysis data, and explore beat jumps, loops, queues, and visual modes. |
| Eldrichify | experimental | `frontend/eldrichify.html`, `backend/eldrichify.py` | Upload-based image transformation. Large local model checkpoints are not committed. |
| OurSpace | experimental | `frontend/ourspace.html` | Local profile builder with account, media, and customization flows. Runtime data stays outside Git. |
| CodeSniff | active prototype | `codesniff/` | Semantic code search with a FastAPI backend and React front end. |
| RL jump labeling | research tool | `backend/rl/`, `rl_models/` | Local feedback loop for rating and training jump-selection policies. |
| VENPOD prototype | archived prototype | `venpod/` | Early voxel/WebGPU experiment. The Emscripten SDK is intentionally not vendored. |

## Quick Start

Prerequisites:

- Python 3.11
- Docker and Docker Compose for the full stack
- `ffmpeg` for audio workflows
- Node.js 20 or newer for CodeSniff front-end work

Create local configuration:

```bash
cp .env.example .env
```

Set `SECRET_KEY` in `.env`. Leave optional keys blank until you need the related feature.

Run the main app with Docker:

```bash
docker compose up --build
```

Open:

```text
http://localhost:5000
```

Run the Flask app without Docker:

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python backend/app.py
```

On Windows PowerShell, use:

```powershell
.venv\Scripts\Activate.ps1
```

## Documentation

The docs follow the Diataxis structure:

- [Tutorial: Getting started](docs/tutorials/getting-started.md)
- [How-to: Common tasks](docs/how-to/common-tasks.md)
- [How-to: Configure OurSpace auth](docs/how-to/configure-ourspace-auth.md)
- [How-to: Validate RL labeling](docs/how-to/validate-rl-labeling.md)
- [How-to: Record a demo](docs/how-to/record-a-demo.md)
- [Reference: Configuration](docs/reference/configuration.md)
- [Reference: RL logging](docs/reference/rl-logging.md)
- [Explanation: Architecture](docs/explanation/architecture.md)

## Repository Hygiene

Generated files and local data are ignored by default:

- `backend/uploads/`
- `backend/data/`
- `backend/ourspace_data/`
- `codesniff/backend/storage/`
- `playwright-code/artifacts/`
- local model checkpoints
- local SDK installs such as `venpod/emsdk/`

The checked-in audio files under `frontend/assets/audio/` are part of the demo experience and are kept intentionally.

For public releases, publish from the clean `main` branch. Do not publish old branches that contain runtime data, vendored dependencies, generated model artifacts, or private planning notes.

## Validation

Run these checks after a clean clone:

```bash
python -m compileall backend
docker compose config
node --check frontend/js/eldrichify.js
```

For CodeSniff backend work:

```bash
cd codesniff/backend
python -m pytest
```

## License

MIT. See [LICENSE](LICENSE).
