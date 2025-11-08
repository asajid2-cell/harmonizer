# Harmonizer Lab · Production build

This branch packages the redesigned Autocanonizer/Eternal Jukebox experience into a deployable service. The backend is a Flask API that performs audio analysis, queues uploads, and now exposes native Spotify search + embedded playback. The frontend (modern CSS + heavy client-side visualizer) talks to that API directly.

The old research notes, temp snippets, and Render/Heroku manifest files have been removed so the repo only contains what is required to ship a production image.

## Quick start (Docker Compose)

```bash
cp .env.example .env          # add real secrets
docker compose build          # builds the harmonizer image
docker compose up -d          # runs API + frontend + watchtower
```

This exposes the service on `http://localhost:5000`. The compose file also mounts `./uploads` and `./data` so analysis JSON + media persist between restarts, and runs Watchtower to roll a container when you push a new image.

### Required environment variables

| Variable | Description |
| --- | --- |
| `SECRET_KEY` | Flask session key. Generate with `python -c "import secrets; print(secrets.token_hex(32))"`. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Mandatory for `/api/spotify/search` and the embedded player. Create an app at https://developer.spotify.com/dashboard and drop the client credentials here. |
| `YOUTUBE_API_KEY` (optional) | Used when resolving Smart Download fallbacks. |

Feel free to add any of the other backend knobs (Render used to set `PYTHONUNBUFFERED=1`, etc.) by editing `.env`.

## Deploying to a VPS (inspired by the Dreams of Code walkthrough)

1. **Provision the VPS** – a 2 vCPU / 4-8 GB instance is plenty. Hostinger KVM-2 is the reference box from the video.
2. **Add a non-root user**
   ```bash
   adduser harmonizer
   usermod -aG sudo harmonizer
   ```
3. **Harden SSH** – copy your public key into `/home/harmonizer/.ssh/authorized_keys`, then update `/etc/ssh/sshd_config` to disable password + root login. Reload `sshd`.
4. **Point DNS** – create an `A` record for your domain (e.g. `harmonizer.example.com`) to the VPS IP. Wait for propagation.
5. **Install Docker & Compose plugin**
   ```bash
   sudo apt update && sudo apt install -y ca-certificates curl gnupg
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
   sudo apt update && sudo apt install -y docker-ce docker-compose-plugin
   sudo usermod -aG docker harmonizer
   ```
6. **Clone this repo** (prod branch) onto the server, copy `.env.example` to `.env`, and fill in secrets.
7. **Run `docker compose up -d`**. Watch `docker compose logs -f` to verify analysis completes when you upload a track.
8. **(Optional) Front with Traefik** – the video demonstrates using Traefik as a reverse proxy + automatic TLS. Keep this Compose stack bound to localhost (`ports: "127.0.0.1:5000:5000"`) and let Traefik expose 80/443 with cert resolver + HTTP->HTTPS redirect.
9. **(Optional) Watchtower** – already included. For multi-node scenarios use an external CI/CD pipeline instead.
10. **Monitoring** – add an UptimeRobot check for `https://harmonizer.example.com/`. Pair with system metrics (Netdata, Grafana Cloud, etc.) if needed.

## API surface

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/process` | Upload file or provide `youtube_url`, `drive_url`, `spotify_url`. Automatically caches analysis fingerprints so re-uploads are instant. |
| `GET`  | `/api/spotify/search?q=` | Proxies Spotify Web API search. Requires client credentials. |
| `GET`  | `/api/spotify/track/<id>` | Fetch metadata for a single track (used by the embedded player). |
| `POST` | `/api/playlist-info` | Existing helper for playlist expansion. |

The Flask app also serves analysis JSON + uploaded media under `/data/` and `/media/` so the visualizer can stream them.

## Frontend UX notes

- The transport row now includes a **Spotify Search** button that opens a modal. Selecting a track plays the official embed in the floating player.
- `Base audio only` toggle mutes the canon overlay so you can compare mixes.
- Queue / advanced sidebar operate exactly like the old Ableton-inspired redesign.

## Project layout

```
backend/
  app.py               # Flask API + cached analysis fingerprints
  analysis/            # librosa-based feature pipeline
frontend/
  index.html           # SPA entry + Spotify modal markup
  js/visualizer.js     # visualizer + queue + Spotify search logic
Dockerfile
docker-compose.yml
.env.example
uploads/, data/        # mounted volumes for media + JSON
```

## Frequently asked questions

- **Where did all of the Markdown notes go?** ? They lived in previous feature spikes; prod only keeps what is required to deploy. Use git history if you need them.
- **Can I still run this without Docker?** ? Yes. `pip install -r requirements.txt` and `gunicorn backend.app:app --config backend/gunicorn.conf.py` still work, but Docker is the supported path for prod.
- **How do I add TLS / load balancing?** ? Follow the Traefik steps from the video transcript: run Traefik as another Compose service, expose ports 80/443, point DNS to the VPS, and add the appropriate labels to `harmonizer` to issue certificates.

Happy deploying!
