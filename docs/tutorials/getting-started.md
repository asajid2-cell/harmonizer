# Getting Started

This guide gets a clean clone running locally with the Flask front end and optional Docker stack.

## Prerequisites

- Python 3.11
- Docker and Docker Compose
- `ffmpeg`
- Node.js 20 or newer if you plan to work on CodeSniff frontend code

## Configure

```bash
cp .env.example .env
```

Set `SECRET_KEY` in `.env`. Leave optional API keys blank unless you need that feature.

## Run With Docker

```bash
docker compose build
docker compose up
```

Open `http://localhost:5000`.

## Run Flask Locally

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
python backend/app.py
```

Open `http://localhost:5000`.

## Expected Result

The Internet Discotheque launcher loads. From there, open Harmonizer, OurSpace, Eldrichify, CodeSniff, or the notebook pages.

## Validate

```bash
python -m compileall backend
docker compose config
```
