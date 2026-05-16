# Architecture

Harmonizer is a monorepo for related creative tools rather than a single-purpose application. The shared shape keeps experiments easy to run together, at the cost of looser boundaries between prototypes.

## Runtime Shape

```text
browser
  -> Flask app in backend/app.py
  -> static HTML, CSS, and JavaScript in frontend/
  -> optional CodeSniff FastAPI service
  -> ignored local runtime folders
```

The Flask app serves the retro front end, handles media workflows, exposes OurSpace and RL endpoints, and proxies CodeSniff when that service is running.

## Main Components

| Component | Role |
| --- | --- |
| `backend/` | Flask routes, media processing, image pipeline source, OurSpace database helpers, and RL endpoints. |
| `frontend/` | Static pages and browser-side applications. |
| `codesniff/` | Semantic code search app with its own backend and front-end source. |
| `backend/rl/` and `rl_models/` | RL-assisted jump policy experiments and small checked-in model metadata. |
| `playwright-code/` | Local Playwright helper project. Dependencies and generated screenshots are ignored. |
| `venpod/` | Archived early WebGPU/WASM voxel prototype. |

## Why The Repo Is Structured This Way

The project started as a set of adjacent experiments: audio analysis, browser visuals, small social-profile surfaces, image processing, and code search. Keeping them in one repository makes local demos and shared deployment simple. It also makes it clear which ideas belong to the same creative lab.

The tradeoff is that the repo is not organized like a reusable package. Shared server code and static pages are practical for experimentation, but they require careful documentation and strict ignore rules for public release.

## Data Boundary

Source code and curated demo assets are tracked. Runtime data is not.

Ignored runtime data includes uploads, generated analysis files, local SQLite databases, browser cookies, model checkpoints, Playwright screenshots, CodeSniff indexes, and local SDK installs.

## Prototype Boundary

Some directories are kept for context, not as active product surfaces:

- `venpod/` is the early voxel prototype, not the current VENPOD engine.
- RL tooling is a local research loop, not a production recommendation service.
- Eldrichify depends on model checkpoints supplied outside the repository.

These boundaries are intentional. They let the public tree show useful work without pretending every experiment is a finished platform.
