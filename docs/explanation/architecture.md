# Architecture

Harmonizer is a monorepo for related creative tools served through one Flask application.

## Runtime Shape

```text
browser
  -> Flask app in backend/app.py
  -> static pages and JavaScript in frontend/
  -> optional CodeSniff FastAPI service
  -> ignored runtime data folders
```

The Flask app serves the retro front end, proxies CodeSniff API calls, handles media upload/download workflows, and exposes experimental endpoints for image generation, RL labeling, and OurSpace profiles.

## Main Components

- `backend/`: Flask app, audio/image pipelines, OurSpace database helpers, and route definitions.
- `frontend/`: static HTML/CSS/JavaScript applications.
- `codesniff/`: separate semantic code search application with FastAPI backend and React frontend source.
- `backend/eldrichify.py`: upload-based image transformation pipeline. Large local model artifacts are not tracked.
- `rl_models/`: small checked-in RL model metadata/artifacts used by the audio experiments.
- `venpod/`: early voxel/WebGPU prototype kept for context, not the current VENPOD engine.
- `playwright-code/`: local Playwright test helper code. Generated dependencies and screenshots are ignored.

## Design Tradeoffs

The repo favors fast experimentation over strict package boundaries. That makes it easy to share UI, media assets, and deployment wiring, but it also means public readers need clear documentation about which parts are stable and which parts are prototypes.

Runtime state is intentionally outside Git. Databases, uploads, model checkpoints, browser cookies, generated analysis data, and test screenshots should be recreated locally or supplied through deployment-specific storage.

## Non-Goals

- This is not a reusable Python package.
- This is not a hardened multi-tenant SaaS starter.
- The checked-in VENPOD folder is not the current VENPOD engine.
- The repo does not vendor heavyweight model weights or local SDK installs.
