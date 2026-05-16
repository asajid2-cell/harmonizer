# Harmonizer

Harmonizer is a collection of browser-based creative tools built around a shared Flask backend and static front-end shell. The main application focuses on audio analysis, playback experiments, and visual music interfaces. The repository also includes companion prototypes for image transformation, profile pages, semantic code search, reinforcement-learning feedback, and voxel rendering experiments.

This is a public source snapshot. Runtime data, generated artifacts, local model files, vendored SDKs, and private configuration are intentionally excluded.

## What Is Included

- `backend/`: Flask application, audio analysis routes, image tooling, OurSpace storage helpers, and RL labeling support.
- `frontend/`: static pages, JavaScript modules, demo assets, and the Internet Discotheque launcher.
- `codesniff/`: semantic code-search prototype with a FastAPI backend and React front end.
- `playwright-code/`: local Playwright checks for browser-facing pages.
- `venpod/`: archived voxel/WebGPU prototype source.
- `docs/`: task-focused documentation using the Diataxis structure.

## Requirements

- Python 3.11
- Docker and Docker Compose for the full application stack
- `ffmpeg` for audio analysis workflows
- Node.js 20 or newer for JavaScript tooling and CodeSniff front-end work

## Run Locally

Create a local environment file:

```bash
cp .env.example .env
```

Set `SECRET_KEY` in `.env`. Optional API keys can stay blank unless you are using the features that require them.

Run the main application with Docker:

```bash
docker compose up --build
```

Open `http://localhost:5000`.

To run the Flask server directly:

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python backend/app.py
```

On Windows PowerShell, activate the environment with:

```powershell
.venv\Scripts\Activate.ps1
```

## Documentation

- [Getting started](docs/tutorials/getting-started.md)
- [Common tasks](docs/how-to/common-tasks.md)
- [Configuration reference](docs/reference/configuration.md)
- [Architecture overview](docs/explanation/architecture.md)

Subproject notes:

- [CodeSniff](codesniff/README.md)
- [Playwright helper](playwright-code/README.md)
- [VENPOD prototype](venpod/README.md)

## Validation

Run the checks that match the area you changed:

```bash
python -m compileall backend
docker compose config
node --check frontend/js/eldrichify.js
node --check frontend/js/visualizer.js
```

For CodeSniff backend changes:

```bash
cd codesniff/backend
python -m pytest
```

## Release Notes

The public branch should contain source, curated demo assets, and documentation only. Keep these out of Git:

- `.env` files and credentials
- uploads, generated media, and local databases
- dependency folders and build outputs
- generated Playwright artifacts
- model checkpoints and local SDK installs

The checked-in audio under `frontend/assets/audio/` is part of the demo material.

## License

MIT. See [LICENSE](LICENSE).
