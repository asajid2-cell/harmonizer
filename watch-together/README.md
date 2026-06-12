# Watch Together

A self-hosted sync media app: two people watch, read, or listen in lockstep. Served at
`harmonizerlabs.cc/mediamtx`, behind the central hl-auth gate.

One app spans three modalities, all delivered through a single caching/Range proxy:

- **Watch** — movies, TV, anime, and K/J/C-dramas. Resolves a title to a playable HLS stream by
  loading third-party embed pages in headless Chromium and capturing the `.m3u8` the player requests.
- **Read** — manga, manhwa (incl. untranslated raws), and books. Per-source adapters return search
  results, chapter lists, and page images or EPUBs; books render with epub.js and save offline.
- **Listen** — audiobooks, podcasts, music, and live radio. A shared audio player streams mp3/audio
  with seek support; music spans lossless (NetEase via GD-Studio), YouTube, SoundCloud, Audius, Jamendo.

## Dynamic Source Engine

Streaming providers rotate constantly — domains die, new mirrors appear weekly. Instead of a
hand-curated static list, the app runs a background engine that keeps the source pool fresh on its own:

1. **Discover** — `discovery_feeds.js` continuously harvests candidate providers from GitHub
   aggregator repos, Certificate-Transparency logs (new family mirrors), and by crawling working
   providers' own JS for domains they rotate to internally.
2. **Validate** — every candidate is captured and its media must pass the proxy byte-gate (a real
   `#EXTM3U`/media body, decoys like "not found" or tiny demo clips rejected). This is the *only*
   path to promotion.
3. **Promote / demote** — survivors enter a scored registry (`discovered → probation → promoted`);
   dead sources are demoted and tombstoned with exponential-backoff cooldown, and the resolver stops
   trying them. Reading/audio sources are health-checked the same way through the app's own endpoints.

The registry persists to disk and is queryable at `/api/discovery/status`. Discovery runs in the
background, token-bucketed, and pauses heavy Chromium probes while a user is actively resolving.

All outbound discovery fetches go through an SSRF-hardened client (`ssrf.js`) — DNS pinned at connect
time (defeats rebinding), private/reserved ranges blocked, redirects and body size capped.

## Architecture

| File | Role |
|---|---|
| `server.js` | Express app, search (AniList/TMDB/iTunes/…), WebSocket sync, hl-auth gate mount |
| `resolver.js` | Video resolution — embed-source pools + Playwright capture + Tor rotation |
| `proxy.js` | The universal media proxy — HLS manifest rewriting, Range, image LRU cache |
| `manga.js` / `book.js` | Reading adapters (manga/manhwa; books → EPUB) |
| `audiobook.js` | Audio adapters — audiobooks, podcasts, music, radio |
| `discovery.js` / `discovery_feeds.js` | Dynamic Source Engine (registry + validation + feeds) |
| `ssrf.js` | SSRF-hardened fetch used by all discovery/validation |
| `requireAccess.cjs` | hl-auth access middleware (local on-box requests bypass; public is gated) |
| `public/index.html` | Single-page client (players + readers + search) |

## Run

```bash
docker build -t watch-together .
docker run -d --name watch-together --network host \
  -e PORT=4190 -e BASE_PATH=/mediamtx \
  -e TMDB_API_KEY=... -e AUTH_INTERNAL_KEY=... \
  -e DISCOVERY_DATA_DIR=/app/data -v "$PWD/data:/app/data" \
  watch-together
```

`PORT` and `BASE_PATH` must match the nginx mount (`/mediamtx/ → 127.0.0.1:4190`). `AUTH_INTERNAL_KEY`
is the shared hl-auth verify key. The `data/` volume persists the discovery registry across restarts.

No API keys or secrets are committed — everything sensitive is read from the environment at runtime.
