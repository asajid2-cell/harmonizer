# Getting Started

This tutorial takes a fresh clone to a running Harmonizer site. It uses the main Flask app because that is the shortest path to seeing the project.

## 1. Install Prerequisites

Install:

- Python 3.11
- `ffmpeg`
- Docker and Docker Compose, if you want the containerized stack

Node.js is only needed when you work on CodeSniff front-end code.

## 2. Create Local Configuration

From the repository root:

```bash
cp .env.example .env
```

Open `.env` and set:

```text
SECRET_KEY=<any-long-local-secret>
```

Leave the other values blank for this tutorial. Blank optional values disable or limit the features that need credentials.

## 3. Start The Main App

With Docker:

```bash
docker compose up --build
```

Without Docker:

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python backend/app.py
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

## 4. Open The Site

Open:

```text
http://localhost:5000
```

You should see the Internet Discotheque launcher. Open Harmonizer from the launcher, then try the included demo audio or upload a local audio file.

## 5. Check The Clone

Run:

```bash
python -m compileall backend
node --check frontend/js/eldrichify.js
```

If Docker is installed, also run:

```bash
docker compose config
```

## 6. Know Where Data Goes

Runtime data is written to ignored folders such as `backend/uploads/`, `backend/data/`, and `backend/ourspace_data/`. Those folders are local working data, not source files.
