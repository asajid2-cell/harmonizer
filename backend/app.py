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
import random
import time

try:
    from .rl.storage import log_jump_event
    from .rl import db as rl_db
except ImportError:  # pragma: no cover
    from rl.storage import log_jump_event  # type: ignore
    from rl import db as rl_db  # type: ignore

RL_SNIPPET_DIR = rl_db.SNIPPET_DIR
RL_MODEL_PATH = rl_db.DATA_DIR / "model.json"
RL_LABELER_TOKEN = os.environ.get("RL_LABELER_TOKEN")
RL_BANDIT_SEED = int(os.environ.get("RL_BANDIT_SEED", "42"))
rl_bandit_rng = random.Random(RL_BANDIT_SEED)
rl_policy_override = os.environ.get("RL_POLICY_MODE")  # baseline, rl, auto
rl_eps = float(os.environ.get("RL_POLICY_EPS", "0.1"))
rl_bandit_proportions = {"baseline": 0, "rl": 0}
rl_session_assignments: dict[str, str] = {}
rl_policy_rewards = rl_db.fetch_policy_rewards()
rl_min_samples = int(os.environ.get("RL_POLICY_MIN", "25"))
rl_last_reward_refresh = 0.0
rl_policy_weights: dict[str, float] = {"baseline": 0.5, "rl": 0.5}


def _coerce_float(value: Optional[object]) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _refresh_policy_weights():
    global rl_policy_rewards, rl_policy_weights, rl_last_reward_refresh
    now = time.time()
    if now - rl_last_reward_refresh < 30:
        return
    rl_policy_rewards = rl_db.fetch_policy_rewards()
    weights = {}
    total = 0.0
    for mode in ("baseline", "rl"):
        counts = rl_policy_rewards.get(mode, {})
        positives = counts.get("good", 0) + 0.5 * counts.get("meh", 0)
        negatives = counts.get("bad", 0)
        samples = positives + negatives
        if samples < rl_min_samples:
            weights[mode] = 0.5
        else:
            score = (positives + 1) / (samples + 2)
            weights[mode] = score
        total += weights[mode]
    if total > 0:
        for mode in weights:
            weights[mode] /= total
    rl_policy_weights = weights
    rl_last_reward_refresh = now


def get_session_policy() -> str:
    if rl_policy_override in {"baseline", "rl"}:
        return rl_policy_override
    _refresh_policy_weights()
    session_id = session.get("policy_session")
    if not session_id:
        session_id = str(uuid.uuid4())
        session["policy_session"] = session_id
    if session_id in rl_session_assignments:
        return rl_session_assignments[session_id]
    if rl_bandit_rng.random() < rl_eps:
        choice = "baseline" if rl_bandit_rng.random() < 0.5 else "rl"
    else:
        bas_weight = rl_policy_weights.get("baseline", 0.5)
        choice = "baseline" if rl_bandit_rng.random() < bas_weight else "rl"
    rl_session_assignments[session_id] = choice
    rl_bandit_proportions[choice] += 1
    return choice

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

try:
    from soundcloud import SoundCloud  # type: ignore
except ImportError:  # pragma: no cover
    SoundCloud = None  # type: ignore

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
app.config["RL_LABELER_TOKEN"] = RL_LABELER_TOKEN
app.config["RL_POLICY_MODE"] = rl_policy_override


def _require_rl_token():
    """RL labeler endpoints no longer require a token (no-op helper)."""
    return


def get_session_policy() -> str:
    if rl_policy_override in {"baseline", "rl"}:
        return rl_policy_override
    _refresh_policy_weights()
    session_id = session.get("policy_session")
    if not session_id:
        session_id = str(uuid.uuid4())
        session["policy_session"] = session_id
    if session_id in rl_session_assignments:
        return rl_session_assignments[session_id]
    choice = "rl" if rl_bandit_rng.random() > rl_eps else "baseline"
    rl_session_assignments[session_id] = choice
    rl_bandit_proportions[choice] += 1
    return choice

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


def _download_soundcloud(url: str, track_id: str) -> tuple[Path, Optional[dict]]:
    """Download a track from SoundCloud."""
    if YoutubeDL is None:
        raise RuntimeError("yt-dlp is not installed. Run `pip install yt-dlp`.")

    print(f"[SoundCloud Download] Processing: {url}", flush=True)

    ffmpeg_dir = locate_ffmpeg_bin()
    if ffmpeg_dir is None:
        raise RuntimeError("FFmpeg binaries not found.")

    output_template = str(UPLOAD_FOLDER / f"{track_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        "ffmpeg_location": str(ffmpeg_dir),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
    }

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = Path(ydl.prepare_filename(info)).with_suffix(".mp3")

        if not filename.exists():
            candidates = list(UPLOAD_FOLDER.glob(f"{track_id}.*"))
            if candidates:
                filename = candidates[0]
            else:
                raise RuntimeError("Unable to locate downloaded audio.")

        print(f"[SoundCloud Download] Success: {filename.name}", flush=True)
        return filename, info

    except Exception as e:
        error_msg = str(e)
        print(f"[SoundCloud Download] Error: {error_msg}", flush=True)
        raise RuntimeError(f"Failed to download from SoundCloud: {error_msg}")


def _extract_song_info_from_url(url: str) -> Optional[dict]:
    """Extract song title and artist from URL metadata without downloading."""
    if YoutubeDL is None:
        return None

    try:
        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "extract_flat": False,
            "skip_download": True,
        }
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title", ""),
                "artist": info.get("uploader", "") or info.get("artist", "") or info.get("creator", ""),
                "duration": info.get("duration", 0),
            }
    except Exception as e:
        print(f"[Info Extract] Could not extract info from URL: {e}", flush=True)
        return None


def _smart_download_with_fallback(url: str, track_id: str, user_id: Optional[str] = None) -> tuple[Path, Optional[dict]]:
    """
    Smart download system that tries multiple sources:
    1. Try direct URL (YouTube, Spotify, SoundCloud)
    2. If YouTube fails, extract song info and search on Spotify
    3. If Spotify fails, search on SoundCloud
    4. Return best result or fail with helpful message
    """
    print(f"[Smart Download] Starting with URL: {url}", flush=True)

    # Detect URL type
    is_spotify = "spotify.com" in url
    is_soundcloud = "soundcloud.com" in url
    is_youtube = "youtube.com" in url or "youtu.be" in url

    errors = []

    # Try 1: Direct download from the provided URL
    try:
        if is_spotify:
            print(f"[Smart Download] Trying Spotify direct...", flush=True)
            return _download_spotify(url, track_id, user_id)
        elif is_soundcloud:
            print(f"[Smart Download] Trying SoundCloud direct...", flush=True)
            return _download_soundcloud(url, track_id)
        elif is_youtube:
            print(f"[Smart Download] Trying YouTube direct...", flush=True)
            return _download_youtube(url, track_id, user_id)
    except Exception as e:
        error_msg = str(e)
        errors.append(f"Direct download failed: {error_msg[:100]}")
        print(f"[Smart Download] Direct download failed: {error_msg}", flush=True)

    # Try 2: If YouTube failed, extract song info and try Spotify
    if is_youtube and Spotdl is not None:
        try:
            print(f"[Smart Download] YouTube failed, extracting song info...", flush=True)
            song_info = _extract_song_info_from_url(url)
            if song_info and song_info.get("title"):
                search_query = f"{song_info['title']} {song_info['artist']}"
                print(f"[Smart Download] Searching Spotify for: {search_query}", flush=True)

                spotdl = Spotdl(
                    client_id="5f573c9620494bae87890c0f08a60293",
                    client_secret="212476d9b0f3472eaa762d90b19b0ba8",
                    user_auth=False,
                    headless=True,
                )

                songs = spotdl.search([search_query])
                if songs and len(songs) > 0:
                    song = songs[0]
                    print(f"[Smart Download] Found on Spotify: {song.name} by {', '.join(song.artists)}", flush=True)

                    results = spotdl.download_songs([song])
                    if results:
                        # Find and move the downloaded file
                        safe_name = song.display_name.replace("/", "_").replace("\\", "_")
                        for possible_path in [
                            Path.cwd() / f"{safe_name}.mp3",
                            UPLOAD_FOLDER / f"{safe_name}.mp3",
                        ]:
                            if possible_path.exists():
                                final_path = UPLOAD_FOLDER / f"{track_id}.mp3"
                                if possible_path.parent != UPLOAD_FOLDER:
                                    possible_path.rename(final_path)
                                else:
                                    final_path = possible_path

                                info = {
                                    "title": song.name,
                                    "uploader": ", ".join(song.artists),
                                    "duration": song.duration,
                                }
                                print(f"[Smart Download] Success via Spotify fallback!", flush=True)
                                return final_path, info
        except Exception as e:
            error_msg = str(e)
            errors.append(f"Spotify fallback failed: {error_msg[:100]}")
            print(f"[Smart Download] Spotify fallback failed: {error_msg}", flush=True)

    # Try 3: If still failed, try SoundCloud search
    if is_youtube and YoutubeDL is not None:
        try:
            song_info = _extract_song_info_from_url(url)
            if song_info and song_info.get("title"):
                # Try to find on SoundCloud by searching
                search_query = f"{song_info['title']} {song_info['artist']}"
                soundcloud_search_url = f"scsearch:{search_query}"
                print(f"[Smart Download] Searching SoundCloud for: {search_query}", flush=True)

                return _download_soundcloud(soundcloud_search_url, track_id)
        except Exception as e:
            error_msg = str(e)
            errors.append(f"SoundCloud fallback failed: {error_msg[:100]}")
            print(f"[Smart Download] SoundCloud fallback failed: {error_msg}", flush=True)

    # All methods failed - raise comprehensive error
    error_summary = "\\n".join(errors) if errors else "All download methods failed"
    raise RuntimeError(
        f"Unable to download audio from any source.\\n\\n"
        f"**What we tried:**\\n"
        f"• Direct download from provided URL\\n"
        f"• Searching Spotify for the song\\n"
        f"• Searching SoundCloud for the song\\n\\n"
        f"**Please try:**\\n"
        f"1. Upload the audio file directly (most reliable)\\n"
        f"2. Try a different source (YouTube/Spotify/SoundCloud)\\n"
        f"3. Ensure the link is public and not age-restricted\\n\\n"
        f"Errors: {error_summary[:200]}"
    )


def _download_from_drive(url: str, track_id: str) -> tuple[Path, Optional[dict]]:
    """Download audio file from Google Drive shareable link."""
    import re
    import requests

    print(f"[Drive Download] Processing URL: {url}", flush=True)

    # Extract file ID from various Drive URL formats
    file_id = None
    patterns = [
        r'/file/d/([a-zA-Z0-9_-]+)',
        r'id=([a-zA-Z0-9_-]+)',
        r'/open\?id=([a-zA-Z0-9_-]+)',
        r'drive\.google\.com/.*?([a-zA-Z0-9_-]{25,})',
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            file_id = match.group(1)
            print(f"[Drive Download] Extracted file ID: {file_id}", flush=True)
            break

    if not file_id:
        raise RuntimeError("Invalid Google Drive link. Please use a shareable link from Drive.")

    # Construct direct download URL
    download_url = f"https://drive.google.com/uc?id={file_id}&export=download"

    try:
        # First request might return confirmation page for large files
        session = requests.Session()
        response = session.get(download_url, stream=True)

        # Check if we need to handle the virus scan warning
        for key, value in response.cookies.items():
            if key.startswith('download_warning'):
                download_url = f"https://drive.google.com/uc?id={file_id}&export=download&confirm={value}"
                response = session.get(download_url, stream=True)
                break

        if response.status_code != 200:
            raise RuntimeError(f"Cannot download Drive file (HTTP {response.status_code}). Make sure the link is publicly accessible.")

        # Determine file extension from content type or keep as mp3
        content_type = response.headers.get('content-type', '')
        ext = '.mp3'  # Default
        if 'audio/wav' in content_type or 'audio/x-wav' in content_type:
            ext = '.wav'
        elif 'audio/flac' in content_type:
            ext = '.flac'

        file_path = UPLOAD_FOLDER / f"{track_id}{ext}"

        # Download file in chunks
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        chunk_size = 8192

        print(f"[Drive Download] Downloading file ({total_size} bytes)...", flush=True)

        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        if downloaded % (chunk_size * 100) == 0:  # Log every ~800KB
                            print(f"[Drive Download] Progress: {progress:.1f}%", flush=True)

        if not file_path.exists() or file_path.stat().st_size == 0:
            raise RuntimeError("Download failed - file is empty")

        # Convert to MP3 if needed
        if ext != '.mp3':
            print(f"[Drive Download] Converting {ext} to MP3...", flush=True)
            ffmpeg_dir = locate_ffmpeg_bin()
            if ffmpeg_dir:
                import subprocess
                mp3_path = UPLOAD_FOLDER / f"{track_id}.mp3"
                ffmpeg_bin = ffmpeg_dir / "ffmpeg.exe" if os.name == 'nt' else ffmpeg_dir / "ffmpeg"
                subprocess.run([
                    str(ffmpeg_bin), '-i', str(file_path),
                    '-acodec', 'libmp3lame', '-b:a', '192k',
                    str(mp3_path), '-y'
                ], check=True, capture_output=True)
                file_path.unlink()  # Remove original
                file_path = mp3_path

        info = {
            "title": "Google Drive Audio",
            "uploader": "Google Drive",
        }

        print(f"[Drive Download] Success: {file_path.name}", flush=True)
        return file_path, info

    except requests.RequestException as e:
        error_msg = str(e)
        print(f"[Drive Download] Error: {error_msg}", flush=True)
        raise RuntimeError(f"Failed to download from Google Drive: {error_msg}")
    except Exception as e:
        error_msg = str(e)
        print(f"[Drive Download] Error: {error_msg}", flush=True)
        raise RuntimeError(f"Failed to process Google Drive file: {error_msg}")


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
        f"YouTube is currently blocking automated downloads. This is a known YouTube limitation.\\n\\n"
        f"**Easy Workaround:**\\n"
        f"1. Download the audio file yourself using any YouTube to MP3 converter\\n"
        f"2. Use the 'Upload Audio' option instead\\n"
        f"3. Upload your downloaded file - works perfectly!\\n\\n"
        f"**Recommended free converters:**\\n"
        f"• y2mate.com\\n"
        f"• ytmp3.cc\\n"
        f"• Any browser extension\\n\\n"
        f"We're working on a permanent solution. Sorry for the inconvenience!\\n\\n"
        f"Technical: {last_error[:80] if last_error else 'Bot detection active'}"
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

            # Use smart download with automatic fallback to Spotify/SoundCloud
            print(f"[API] Using smart download with fallback system...", flush=True)
            audio_path, info = _smart_download_with_fallback(url, track_id, user_id)

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
        elif source == "drive":
            url = request.form.get("drive_url", "").strip()
            if not url:
                return jsonify({"error": "Please provide a Google Drive URL."}), 400
            audio_path, info = _download_from_drive(url, track_id)
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


@app.route("/api/rl/jump-event", methods=["POST"])
def api_rl_jump_event():
    """
    Append a single jump-event record to the RL log.

    The frontend sends lightweight metadata about each jump decision so
    we can build a labeled dataset later without blocking playback.
    """

    data = request.get_json(silent=True) or {}
    required_fields = ("mode", "source_index", "target_index")
    missing = [field for field in required_fields if field not in data]
    if missing:
        return (
            jsonify(
                {
                    "ok": False,
                    "error": f"Missing required fields: {', '.join(missing)}",
                }
            ),
            400,
        )

    event = {
        "mode": data["mode"],
        "source_index": int(data["source_index"]),
        "target_index": int(data["target_index"]),
        "track_id": data.get("track_id"),
        "track_title": data.get("track_title"),
        "source_time": _coerce_float(data.get("source_time")),
        "target_time": _coerce_float(data.get("target_time")),
        "similarity": data.get("similarity"),
        "span": data.get("span"),
        "same_section": bool(data.get("same_section", False)),
        "settings": data.get("settings") or {},
        "context": data.get("context") or {},
        "quality_score": data.get("quality_score"),
        "policy_mode": data.get("policy_mode"),
        "model_version": data.get("model_version"),
    }
    try:
        log_jump_event(event)
    except Exception as exc:  # pragma: no cover
        app.logger.exception("Failed to log RL jump event")
        return jsonify({"ok": False, "error": str(exc)}), 500

    return jsonify({"ok": True})


@app.route("/api/rl/policy", methods=["GET"])
def api_rl_policy():
    policy = get_session_policy()
    return jsonify(
        {
            "mode": policy,
            "epsilon": rl_eps,
            "override": rl_policy_override,
            "splits": rl_bandit_proportions,
            "weights": rl_policy_weights,
        }
    )


@app.route("/api/rl/snippet/next", methods=["GET"])
def api_rl_snippet_next():
    _require_rl_token()
    row = rl_db.get_next_unlabeled_snippet()
    counts = rl_db.get_queue_counts()
    if not row:
        return jsonify({"snippet": None, "counts": counts})
    snippet_path = row["snippet_path"]
    if not snippet_path:
        return jsonify({"snippet": None, "counts": counts})
    filename = Path(snippet_path).name
    payload = {
        "id": row["id"],
        "track_id": row["track_id"],
        "track_title": row["track_title"],
        "mode": row["mode"],
        "source_index": row["source_index"],
        "target_index": row["target_index"],
        "source_time": row["source_time"],
        "target_time": row["target_time"],
        "similarity": row["similarity"],
        "span": row["span"],
        "same_section": bool(row["same_section"]),
        "snippet_url": url_for("serve_rl_snippet", filename=filename),
        "settings": json.loads(row["settings"] or "{}"),
        "context": json.loads(row["context"] or "{}"),
    }
    return jsonify({"snippet": payload, "counts": counts})


@app.route("/api/rl/snippet/<int:event_id>/label", methods=["POST"])
def api_rl_snippet_label(event_id: int):
    _require_rl_token()
    data = request.get_json(silent=True) or {}
    label = data.get("label")
    if label not in {"good", "bad", "meh", "skip"}:
        return jsonify({"ok": False, "error": "Label must be good, meh, bad, or skip."}), 400
    notes = data.get("notes")
    rl_db.record_label(event_id, label, notes)
    return jsonify({"ok": True})


@app.route("/media/rl-snippets/<path:filename>")
def serve_rl_snippet(filename: str):
    _require_rl_token()
    target = (RL_SNIPPET_DIR / filename).resolve()
    try:
        target.relative_to(RL_SNIPPET_DIR)
    except ValueError:
        abort(404)
    if target.is_file():
        return send_from_directory(RL_SNIPPET_DIR, filename)
    abort(404)


@app.route("/rl/labeler")
def rl_labeler_page():
    target = FRONTEND_DIR / "rl_labeler.html"
    if target.exists():
        return send_from_directory(FRONTEND_DIR, "rl_labeler.html")
    abort(404)


@app.route("/api/rl/model", methods=["GET"])
def api_rl_model():
    if not RL_MODEL_PATH.exists():
        return jsonify({"model": None})
    try:
        with RL_MODEL_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return jsonify({"model": data})
    except Exception as exc:  # pragma: no cover
        return jsonify({"model": None, "error": str(exc)}), 500


@app.route("/api/rl/telemetry", methods=["GET"])
def api_rl_telemetry():
    queue_counts = rl_db.get_queue_counts()
    label_summary = rl_db.get_label_summary()
    model_meta = None
    if RL_MODEL_PATH.exists():
        try:
            with RL_MODEL_PATH.open("r", encoding="utf-8") as handle:
                model_meta = json.load(handle)
        except Exception:
            model_meta = None
    telemetry = {
        "policy": {
            "override": rl_policy_override,
            "epsilon": rl_eps,
            "splits": rl_bandit_proportions,
            "sessions": len(rl_session_assignments),
            "weights": rl_policy_weights,
            "rewards": rl_policy_rewards,
        },
        "queue_counts": queue_counts,
        "label_summary": label_summary,
        "model": model_meta,
    }
    return jsonify(telemetry)


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
