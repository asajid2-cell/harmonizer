from __future__ import annotations

import os
import mimetypes
import uuid
from pathlib import Path
from typing import Optional

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    request,
    send_from_directory,
    session,
    url_for,
)
from flask_session import Session
from werkzeug.utils import secure_filename
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
import json

try:
    from yt_dlp import YoutubeDL  # type: ignore
except ImportError:  # pragma: no cover
    YoutubeDL = None  # type: ignore

try:
    from spotdl import Spotdl  # type: ignore
    from spotdl.types.song import Song  # type: ignore
except ImportError:  # pragma: no cover
    Spotdl = None  # type: ignore
    Song = None  # type: ignore

BASE_DIR = Path(__file__).parent.resolve()

try:
    from .analysis.analyze_track import build_profile
except ImportError:  # pragma: no cover - support running as script
    import sys

    sys.path.append(str(BASE_DIR))
    from analysis.analyze_track import build_profile  # type: ignore

FRONTEND_DIR = BASE_DIR.parent / "frontend"

UPLOAD_FOLDER = BASE_DIR / "uploads"
DATA_FOLDER = BASE_DIR / "data"
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
DATA_FOLDER.mkdir(parents=True, exist_ok=True)
FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=None)

# Configure session for OAuth
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", os.urandom(24))
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_FILE_DIR"] = str(BASE_DIR / "flask_session")
Session(app)

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
SCOPES = ["https://www.googleapis.com/auth/youtube.readonly"]

# Store user credentials (in production, use Redis or database)
user_credentials = {}


@app.after_request
def _apply_cors(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    return response


def allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def generate_track_id() -> str:
    return "TR" + uuid.uuid4().hex[:10].upper()


def get_user_oauth_cookies(user_id: Optional[str]) -> Optional[Path]:
    """Create a temporary cookies file from user's OAuth credentials"""
    if not user_id or user_id not in user_credentials:
        return None

    try:
        creds_dict = user_credentials[user_id]["credentials"]
        credentials = Credentials(
            token=creds_dict["token"],
            refresh_token=creds_dict.get("refresh_token"),
            token_uri=creds_dict["token_uri"],
            client_id=creds_dict["client_id"],
            client_secret=creds_dict["client_secret"],
            scopes=creds_dict["scopes"]
        )

        # Create a Netscape cookie file format for yt-dlp
        cookie_file = UPLOAD_FOLDER / f"oauth_cookies_{user_id}.txt"

        # yt-dlp can use Authorization header directly, which is better
        # We'll return a special marker that tells us to use OAuth
        cookie_file.write_text(f"OAUTH_TOKEN:{credentials.token}")

        print(f"[OAuth] Using user's Google credentials for download", flush=True)
        return cookie_file

    except Exception as e:
        print(f"[OAuth] Error creating OAuth cookies: {e}", flush=True)
        return None


def locate_ffmpeg_bin() -> Optional[Path]:
    """Best-effort search for the FFmpeg binaries installed via winget or env overrides."""
    env_candidates = [
        os.environ.get("FFMPEG_LOCATION"),
        os.environ.get("FFMPEG_BIN"),
        os.environ.get("FFMPEG_DIR"),
    ]
    for candidate in env_candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if path.is_file():
            return path.parent
        if path.is_dir():
            return path

    local_packages = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    if local_packages.exists():
        for package_dir in sorted(local_packages.glob("Gyan.FFmpeg.Essentials_*"), reverse=True):
            for bin_dir in package_dir.glob("ffmpeg-*-essentials_build/bin"):
                if bin_dir.exists():
                    return bin_dir

    program_files = Path("C:/Program Files")
    if program_files.exists():
        for bin_dir in program_files.glob("ffmpeg*/bin"):
            if bin_dir.exists():
                return bin_dir

    return None


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/auth/google")
def auth_google():
    """Initiate Google OAuth flow"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return jsonify({"error": "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."}), 500

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES
    )

    flow.redirect_uri = request.host_url.rstrip("/") + "/auth/callback"

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )

    session["state"] = state
    return redirect(authorization_url)


@app.route("/auth/callback")
def auth_callback():
    """Handle OAuth callback from Google"""
    try:
        state = session.get("state")
        if not state:
            return jsonify({"error": "Invalid session state"}), 400

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            },
            scopes=SCOPES,
            state=state
        )

        flow.redirect_uri = request.host_url.rstrip("/") + "/auth/callback"
        flow.fetch_token(authorization_response=request.url)

        credentials = flow.credentials
        user_id = str(uuid.uuid4())

        # Store credentials with user ID
        user_credentials[user_id] = {
            "credentials": {
                "token": credentials.token,
                "refresh_token": credentials.refresh_token,
                "token_uri": credentials.token_uri,
                "client_id": credentials.client_id,
                "client_secret": credentials.client_secret,
                "scopes": credentials.scopes,
            }
        }

        session["user_id"] = user_id
        print(f"[OAuth] User authenticated: {user_id}", flush=True)

        return redirect(url_for("index"))

    except Exception as e:
        print(f"[OAuth] Error: {e}", flush=True)
        return jsonify({"error": f"Authentication failed: {str(e)}"}), 500


@app.route("/auth/status")
def auth_status():
    """Check if user is authenticated"""
    user_id = session.get("user_id")
    if user_id and user_id in user_credentials:
        return jsonify({"authenticated": True, "user_id": user_id})
    return jsonify({"authenticated": False})


@app.route("/auth/logout")
def auth_logout():
    """Log out user"""
    user_id = session.get("user_id")
    if user_id and user_id in user_credentials:
        del user_credentials[user_id]
    session.clear()
    return redirect(url_for("index"))


@app.route("/visualizer")
def visualizer():
    if "trid" not in request.args:
        return redirect(url_for("index"))
    mode = request.args.get("mode", "canon").lower()
    if mode not in {"canon", "jukebox", "eternal"}:
        mode = "canon"
    redirect_url = url_for("index", trid=request.args["trid"], mode=mode)
    return redirect(redirect_url)

@app.route("/media/<path:filename>")
def media(filename: str):
    mimetype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    response = send_from_directory(
        UPLOAD_FOLDER,
        filename,
        mimetype=mimetype,
        conditional=True,
    )
    response.headers.setdefault("Accept-Ranges", "bytes")
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    return response


@app.route("/data/<path:filename>")
def analysis_file(filename: str):
    response = send_from_directory(
        DATA_FOLDER,
        filename,
        mimetype="application/json",
        conditional=True,
    )
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    return response


def _get_youtube_playlist_info(url: str) -> Optional[dict]:
    """Extract playlist information without downloading."""
    if YoutubeDL is None:
        raise RuntimeError("yt-dlp is not installed. Run `pip install yt-dlp`.")

    # Use sleep and user-agent to avoid rate limiting
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,  # Don't download, just get metadata
        "sleep_interval": 1,
        "max_sleep_interval": 3,
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }

    # Try to use cookies from browser if available (optional for metadata extraction)
    try:
        ydl_opts["cookiesfrombrowser"] = ("chrome",)
    except Exception:
        pass  # Metadata extraction usually works without cookies

    with YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if info and info.get("_type") == "playlist":
            return {
                "is_playlist": True,
                "title": info.get("title"),
                "entries": [
                    {
                        "url": f"https://www.youtube.com/watch?v={entry.get('id')}",
                        "title": entry.get("title"),
                        "duration": entry.get("duration"),
                    }
                    for entry in info.get("entries", [])
                    if entry and entry.get("id")
                ]
            }
        return {"is_playlist": False}


def _download_spotify(url: str, track_id: str, user_id: Optional[str] = None) -> tuple[Path, Optional[dict]]:
    """Download a track from Spotify using spotdl.

    Note: spotdl downloads audio from YouTube Music, so user_id OAuth credentials
    will be used for the underlying YouTube download if available.
    """
    if Spotdl is None:
        raise RuntimeError("spotdl is not installed. Run `pip install spotdl`.")

    print(f"[Spotify Download] Processing: {url}", flush=True)

    try:
        # Configure yt-dlp options for spotdl's underlying YouTube download
        downloader_settings = {}

        # If user has OAuth credentials, use them for YouTube Music downloads
        oauth_cookie_file = get_user_oauth_cookies(user_id)
        if oauth_cookie_file:
            downloader_settings["cookie_file"] = str(oauth_cookie_file)
            print(f"[Spotify Download] Using user's OAuth credentials for YouTube Music", flush=True)

        # Initialize spotdl - it uses environment credentials or default public ones
        spotdl = Spotdl(
            client_id="5f573c9620494bae87890c0f08a60293",  # Public client ID
            client_secret="212476d9b0f3472eaa762d90b19b0ba8",  # Public client secret
            user_auth=False,
            headless=True,
            downloader_settings=downloader_settings if downloader_settings else None,
        )

        # Download the song
        print(f"[Spotify Download] Fetching song metadata...", flush=True)
        songs = spotdl.search([url])

        if not songs:
            raise RuntimeError("Could not find the Spotify track. Check the URL.")

        song = songs[0]
        print(f"[Spotify Download] Found: {song.name} by {', '.join(song.artists)}", flush=True)

        # Download - spotdl handles output path automatically
        print(f"[Spotify Download] Downloading from YouTube Music...", flush=True)

        # spotdl.download_songs returns just the list of results
        results = spotdl.download_songs([song])

        if not results:
            raise RuntimeError("Download failed - no results returned")

        # spotdl downloads to current directory or configured output
        # Find the downloaded file - it should be in current directory
        downloaded_file = None
        safe_name = song.display_name.replace("/", "_").replace("\\", "_")

        # Check various possible locations
        for possible_path in [
            Path.cwd() / f"{safe_name}.mp3",
            Path(f"{safe_name}.mp3"),
            UPLOAD_FOLDER / f"{safe_name}.mp3",
        ]:
            if possible_path.exists():
                downloaded_file = possible_path
                break

        if not downloaded_file:
            # Try finding any recently created mp3 in current directory
            recent_mp3s = sorted(Path.cwd().glob("*.mp3"), key=lambda p: p.stat().st_mtime, reverse=True)
            if recent_mp3s:
                downloaded_file = recent_mp3s[0]

        if not downloaded_file or not downloaded_file.exists():
            raise RuntimeError("Downloaded file not found.")

        # Move to our upload folder with track_id
        final_path = UPLOAD_FOLDER / f"{track_id}.mp3"
        if downloaded_file.parent != UPLOAD_FOLDER:
            downloaded_file.rename(final_path)
        else:
            final_path = downloaded_file

        # Build info dict similar to yt-dlp format
        info = {
            "title": song.name,
            "uploader": ", ".join(song.artists),
            "duration": song.duration,
            "album": song.album_name,
        }

        print(f"[Spotify Download] Success: {final_path.name}", flush=True)
        return final_path, info

    except Exception as e:
        error_msg = str(e)
        print(f"[Spotify Download] Error: {error_msg}", flush=True)
        raise RuntimeError(f"Failed to download from Spotify: {error_msg}")


def _download_youtube(url: str, track_id: str, user_id: Optional[str] = None) -> tuple[Path, Optional[dict]]:
    if YoutubeDL is None:
        raise RuntimeError("yt-dlp is not installed. Run `pip install yt-dlp`.")

    ffmpeg_dir = locate_ffmpeg_bin()
    if ffmpeg_dir is None:
        raise RuntimeError(
            "FFmpeg binaries not found. Install FFmpeg or set FFMPEG_LOCATION to the bin directory."
        )

    output_template = str(UPLOAD_FOLDER / f"{track_id}.%(ext)s")

    # Try multiple client configurations to avoid 403
    # Using sleep and user-agent helps avoid YouTube rate limiting

    # Check multiple cookie file locations (for server deployment)
    cookies_file = None
    possible_cookie_paths = [
        Path(os.environ.get("YOUTUBE_COOKIES_PATH", "")),  # Environment variable
        BASE_DIR / "youtube_cookies.txt",  # Backend directory
        BASE_DIR.parent / "youtube_cookies.txt",  # Project root
        Path("/app/youtube_cookies.txt"),  # Docker/container path
    ]

    for path in possible_cookie_paths:
        if path and path.exists():
            cookies_file = path
            print(f"[YouTube Download] Using cookies from: {cookies_file}", flush=True)
            break

    # Common options to avoid detection and rate limiting
    common_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "sleep_interval": 1,  # Sleep 1 second between requests
        "max_sleep_interval": 5,  # Random sleep up to 5 seconds
        "sleep_interval_requests": 1,  # Sleep between fragment requests
        "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "http_headers": {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-us,en;q=0.5",
            "Sec-Fetch-Mode": "navigate",
        },
    }

    retry_configs = []

    # PRIORITY 0: If user is authenticated with OAuth, use their credentials (BEST - no rate limits per user!)
    oauth_cookie_file = get_user_oauth_cookies(user_id)
    if oauth_cookie_file:
        retry_configs.append({
            **common_opts,
            "cookiefile": str(oauth_cookie_file),
        })
        print(f"[YouTube Download] Using user's OAuth credentials for authentication", flush=True)
    # PRIORITY 1: If cookie file exists, use it (best for servers/production)
    elif cookies_file:
        retry_configs.append({
            **common_opts,
            "cookiefile": str(cookies_file),
        })
        print(f"[YouTube Download] Using cookie file for authentication", flush=True)
    else:
        print(f"[YouTube Download] No cookie file found - trying browser cookies...", flush=True)
        # PRIORITY 2: Try browser cookies (only works locally)
        for browser in ["chrome", "edge", "firefox"]:
            retry_configs.append({
                **common_opts,
                "cookiesfrombrowser": (browser,),
            })

    # PRIORITY 3: Final attempts with different player clients
    for client in ["android_embedded", "mediaconnect", "mweb", "tv_embedded"]:
        retry_configs.append({
            **common_opts,
            "extractor_args": {"youtube": {"player_client": [client]}},
        })

    last_error = None
    for attempt, base_opts in enumerate(retry_configs, 1):
        try:
            ydl_opts = base_opts.copy()
            ydl_opts["ffmpeg_location"] = str(ffmpeg_dir)
            ydl_opts["postprocessors"] = [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ]

            print(f"[YouTube Download] Attempt {attempt}/{len(retry_configs)}", flush=True)

            with YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = Path(ydl.prepare_filename(info)).with_suffix(".mp3")

            if not filename.exists():
                # Fallback to any file matching track id
                candidates = list(UPLOAD_FOLDER.glob(f"{track_id}.*"))
                if candidates:
                    filename = candidates[0]
                else:
                    raise RuntimeError("Unable to locate downloaded audio.")

            print(f"[YouTube Download] Success on attempt {attempt}")
            return filename, info

        except Exception as e:
            error_msg = str(e)
            last_error = error_msg

            # Cookie errors are expected if browser is open - don't print full error
            if "cookie" in error_msg.lower():
                print(f"[YouTube Download] Attempt {attempt} skipped: Cookie access failed (browser may be open)", flush=True)
            else:
                print(f"[YouTube Download] Attempt {attempt} failed: {error_msg[:200]}", flush=True)

            # If this isn't the last attempt, continue to next config
            if attempt < len(retry_configs):
                continue

    # All attempts failed - raise error with helpful message
    error_msg = (
        f"Failed to download video. YouTube requires authentication to prevent bot abuse.\\n\\n"
        f"Solutions:\\n"
        f"1. CLOSE all browsers (Chrome, Edge, Firefox) and try again\\n"
        f"2. Export YouTube cookies to: {cookies_file}\\n"
        f"   Use browser extension: https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp\\n\\n"
        f"Last error: {last_error[:150] if last_error else 'Authentication required'}"
    )
    raise RuntimeError(error_msg)


@app.route("/api/process", methods=["POST", "OPTIONS"])
def api_process():
    if request.method == "OPTIONS":
        return ("", 204)
    algorithm = request.form.get("algorithm", "canon").lower()
    if algorithm not in {"canon", "jukebox", "eternal"}:
        return jsonify({"error": "Unsupported algorithm selection."}), 400

    source = request.form.get("source", "upload").lower()
    title = request.form.get("title") or None
    artist = request.form.get("artist") or "(unknown artist)"

    # Get user_id from session for OAuth authentication
    user_id = session.get("user_id")
    if user_id:
        print(f"[API] Request from authenticated user: {user_id}", flush=True)

    track_id = generate_track_id()
    audio_path: Optional[Path] = None
    info: Optional[dict] = None

    try:
        if source == "upload":
            uploaded = request.files.get("audio")
            if not uploaded or uploaded.filename == "":
                return jsonify({"error": "Please provide an audio file."}), 400
            if not allowed_file(uploaded.filename):
                return jsonify({"error": "Unsupported file type."}), 400
            ext = Path(uploaded.filename).suffix.lower()
            filename = secure_filename(f"{track_id}{ext}")
            audio_path = UPLOAD_FOLDER / filename
            uploaded.save(audio_path)
            if not title:
                title = Path(uploaded.filename).stem
        elif source == "youtube":
            url = request.form.get("youtube_url", "").strip()
            if not url:
                return jsonify({"error": "Please provide a YouTube URL."}), 400

            # Auto-detect Spotify URLs and use spotdl instead
            if "spotify.com" in url:
                print(f"[API] Detected Spotify URL, using spotdl...", flush=True)
                audio_path, info = _download_spotify(url, track_id, user_id)
            else:
                audio_path, info = _download_youtube(url, track_id, user_id)

            if not title:
                title = info.get("title") if info else None
            if (not request.form.get("artist")) and info:
                artist = info.get("uploader", artist)
        elif source == "spotify":
            url = request.form.get("spotify_url", "").strip()
            if not url:
                return jsonify({"error": "Please provide a Spotify URL."}), 400
            audio_path, info = _download_spotify(url, track_id, user_id)
            if not title:
                title = info.get("title") if info else None
            if (not request.form.get("artist")) and info:
                artist = info.get("uploader", artist)
        else:
            return jsonify({"error": "Unsupported source option."}), 400

        if title is None:
            title = audio_path.stem if audio_path else "Untitled"

        media_url = url_for("media", filename=audio_path.name)
        output_path = DATA_FOLDER / f"{track_id}.json"
        build_profile(
            audio_path=audio_path,
            track_id=track_id,
            title=title,
            artist=artist,
            audio_url=media_url,
            output_path=output_path,
        )

        if algorithm == "canon":
            mode = "canon"
        elif algorithm == "jukebox":
            mode = "jukebox"
        else:
            mode = "eternal"
        redirect_url = url_for("index", trid=track_id, mode=mode)
        return jsonify({"redirect": redirect_url, "trackId": track_id})
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.route("/api/playlist-info", methods=["POST", "OPTIONS"])
def api_playlist_info():
    """Check if URL is a playlist and return track list."""
    if request.method == "OPTIONS":
        return ("", 204)
    url = request.json.get("url", "").strip() if request.json else ""
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    try:
        info = _get_youtube_playlist_info(url)
        return jsonify(info)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.route("/<path:asset_path>")
def serve_frontend_asset(asset_path: str):
    if asset_path.startswith(("api/", "media/", "data/")):
        abort(404)
    target = (FRONTEND_DIR / asset_path).resolve()
    try:
        target.relative_to(FRONTEND_DIR)
    except ValueError:
        abort(404)
    if target.is_file():
        return send_from_directory(FRONTEND_DIR, asset_path)
    abort(404)


if __name__ == "__main__":
    app.run(debug=True, port=4000)
