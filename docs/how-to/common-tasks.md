# Common Tasks

## How To Run The Main Site

1. Create `.env` from `.env.example`.
2. Set `SECRET_KEY`.
3. Run `docker compose up --build`.
4. Open `http://localhost:5000`.

Verification: the Internet Discotheque homepage renders.

## How To Run CodeSniff Locally

```bash
cd codesniff/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verification: open `http://localhost:8000/docs`.

## How To Keep Runtime Data Out Of Git

Runtime data belongs in ignored folders:

- `backend/uploads/`
- `backend/data/`
- `backend/ourspace_data/`
- `codesniff/backend/storage/`
- `playwright-code/artifacts/`

Before committing, run:

```bash
git status --short
git ls-files | grep -E 'uploads/|ourspace_data/|backend/data/|node_modules/|dist/'
```

The second command should not show runtime data or dependency folders.

## How To Work On VENPOD Prototype

The Harmonizer repo keeps the early VENPOD prototype source only. Install Emscripten outside the tracked tree or under ignored `venpod/emsdk/`.

Verification:

```bash
git submodule status --recursive
```

This should not fail because `venpod/emsdk` is no longer tracked as a broken gitlink.
