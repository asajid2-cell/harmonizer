# The Autocanonizer (Local Edition)

[The Autocanonizer](http://static.echonest.com/autocanonizer/index.html "") is a web app that
turns any song into a canon by playing the original track against a time-offset copy of itself.

The original implementation relied on the now-defunct Echo Nest analysis service. This fork adds
a local analysis pipeline so you can generate the JSON profile the web app expects for any audio
file you provide.

## Project layout

- `frontend/index.html` - landing page + UI that talks to the Flask API.
- `frontend/app-config.js` - single place to point the static UI at your deployed API (`apiBaseUrl`).
- `frontend/templates/visualizer.html` - lightweight standalone visualizer variant.
- `backend/app.py` - Flask API + media hosting (uploads, playlist lookups, and analysis orchestration).
- `backend/analysis/analyze_track.py` - Python script that generates a compatible analysis profile.
- `backend/analysis/ARCHITECTURE.md` - notes on the feature-extraction pipeline.
- `backend/analysis/requirements.txt` - Python dependencies for the analyser.
- `backend/data/` - default output directory for generated JSON files.
- `backend/uploads/` - transient storage for uploaded or yt-dlp retrieved audio.

## Generate an analysis profile

1. **Install dependencies**
   ```bash
   python -m pip install --user -r requirements.txt
   ```
2. **Run the analyser** (replace the arguments with your own metadata):
   ```bash
   python backend/analysis/analyze_track.py \
     --audio "Juice WRLD - Junkie (Unreleased) (OG).mp3" \
     --track-id TRLOCALJUNKIE \
     --title "Juice WRLD - Junkie (OG)" \
     --artist "Juice WRLD" \
     --audio-url "Juice WRLD - Junkie (Unreleased) (OG).mp3"
   ```
   This writes `data/TRLOCALJUNKIE.json`, which mirrors the structure produced by the Echo Nest
   uploader (sections, bars, beats, tatums, segments, and summary metadata).

## Run the full web experience

1. Install the new dependencies (only once):
   ```bash
   python -m pip install --user -r requirements.txt
   ```
   > You'll also need `ffmpeg` on your PATH if you plan to pull tracks from YouTube.

2. Start the Flask server:
   ```bash
   python -m backend.app
   ```
   (_Shortcut_: `python backend/app.py` also works if you're running from the project root.)

   This now serves the API from `http://localhost:5000/` and streams the production-ready frontend assets from `frontend/`.

3. Open `http://localhost:5000/` and you'll be greeted by the redesigned landing page (black base, oxblood red primary, salmon pink accents). From there you can:
   - Upload your own audio file, or
   - Paste a YouTube link (the server uses `yt-dlp` to download it temporarily).

4. Pick **Autocanonizer** or **Eternal Jukebox**:
   - Autocanonizer launches the dual-voice canon (`mode=canon`).
   - Eternal Jukebox keeps a single voice looping with intelligent jumps (`mode=jukebox`).

Every processed track is analysed via the local pipeline and stored under `backend/data/<track_id>.json`; audio lives in `backend/uploads/` so the browser can stream it back.

## How the local analysis works

`analysis/analyze_track.py` uses `librosa` to approximate the Echo Nest feature set:

- Beat/tempo tracking -> bars, beats, tatums (triplet subdivisions).
- Agglomerative segmentation over MFCC + chroma features -> coarse sections.
- Onset detection + per-frame features -> fine-grained segments with timbre, pitch class profile,
  loudness envelope, and confidence.
- Beat-synchronous context stacking + self-similarity search -> canon alignment diagnostics (recommended offsets, per-beat partner indices).
- Simple Krumhansl-Schmuckler key detection for `audio_summary` metadata.

See `analysis/ARCHITECTURE.md` for deeper implementation notes and extension ideas.

## Deployment shortcuts

### Backend API (Render, Railway, Heroku)
- Uses `requirements.txt`, `Procfile`, `runtime.txt`, `backend/gunicorn.conf.py`, and `render.yaml`.
- **Render**: create a Web Service, set the build command to `pip install -r requirements.txt`, and the start command to `gunicorn backend.app:app --config backend/gunicorn.conf.py`. Render installs `ffmpeg` automatically via `Aptfile`.
- **Heroku**: `Procfile`, `runtime.txt`, and `Aptfile` let you `git push heroku main` with the same start command.
- Expose `PYTHONUNBUFFERED=1` (already included in `render.yaml`). Leave `frontend/app-config.js`'s `apiBaseUrl` empty when the UI is served by Flask; set it to your backend origin when hosting separately.

### Frontend (static host)
- Edit `frontend/app-config.js` and set `apiBaseUrl` to your deployed backend (e.g. `https://harmonizer-backend.onrender.com`).
- Upload the contents of `frontend/` to Netlify, Vercel, or any static CDN. Netlify: build command `echo Skip`, publish directory `frontend`.
- CORS is enabled on the API, so the browser can reach it from any origin.

### Quick local gunicorn check
```bash
pip install -r requirements.txt
python -m backend.app  # dev server
# or run it through gunicorn
gunicorn backend.app:app --config backend/gunicorn.conf.py
```
