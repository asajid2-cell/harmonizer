# Common Tasks

Use these guides when you already know what you want to do and need the exact steps.

## Run The Main Site

1. Copy `.env.example` to `.env`.
2. Set `SECRET_KEY`.
3. Run `docker compose up --build`.
4. Open `http://localhost:5000`.

Check that the Internet Discotheque launcher renders.

## Run Flask Without Docker

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python backend/app.py
```

PowerShell activation:

```powershell
.venv\Scripts\Activate.ps1
```

Open `http://localhost:5000`.

## Run CodeSniff Locally

```bash
cd codesniff/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` to verify the FastAPI service.

## Check That Generated Files Are Not Tracked

Run:

```bash
git status --short
git ls-files | rg "uploads/|ourspace_data/|backend/data/|node_modules/|dist/|\\.pth$|\\.zip$"
```

The second command should produce no output for generated data, dependency folders, or model artifacts.

## Work On The VENPOD Prototype

The `venpod/` directory is an archived early prototype. Install Emscripten outside the repository, or under the ignored path `venpod/emsdk/`.

Check that there are no broken submodules:

```bash
git submodule status --recursive
```

The command should complete without reporting `venpod/emsdk`.

## Add Public Documentation

Choose the document type before writing:

- Put first-run learning paths in `docs/tutorials/`.
- Put task recipes in `docs/how-to/`.
- Put settings, paths, and APIs in `docs/reference/`.
- Put design rationale in `docs/explanation/`.

Keep private planning notes, one-off cleanup logs, and generated audit artifacts out of the public docs tree.
