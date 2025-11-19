from __future__ import annotations

import base64
import hashlib
import hmac
import io
import os
import mimetypes
import re
import uuid
from pathlib import Path
from typing import Optional, List, Dict

# Ensure PyTorch doesn't attempt to initialize NNPACK on hardware that doesn't support it.
os.environ.setdefault("PYTORCH_JIT_USE_NNPACK", "0")
os.environ.setdefault("TORCH_BACKENDS_DISABLE_NNPACK", "1")

from flask import (
    Flask,
    abort,
    jsonify,
    redirect,
    request,
    send_file,
    send_from_directory,
    session,
    url_for,
)
#test
# from flask_session import Session  # Not needed for OurSpace functionality
from werkzeug.utils import secure_filename
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
import json
import random
import time
import requests
import threading
from queue import Queue
from datetime import datetime, timedelta

try:  # optional dependency for large Drive downloads
    import gdown  # type: ignore
except ImportError:  # pragma: no cover
    gdown = None  # type: ignore

try:
    from .rl.storage import log_jump_event
    from .rl import db as rl_db
except ImportError:  # pragma: no cover
    from rl.storage import log_jump_event  # type: ignore
    from rl import db as rl_db  # type: ignore

try:
    from image_optimizer import ImageOptimizer
except ImportError:
    try:
        from .image_optimizer import ImageOptimizer  # type: ignore
    except ImportError:
        ImageOptimizer = None  # type: ignore

RL_SNIPPET_DIR = rl_db.SNIPPET_DIR
RL_MODEL_PATH = rl_db.MODEL_PATH
PRIMARY_RL_VARIANT = "a"
BASELINE_RL_VARIANT = "b"
RL_MODEL_VARIANTS = {
    PRIMARY_RL_VARIANT: RL_MODEL_PATH,
}
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

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-lite-preview")
GEMINI_API_ROOT = os.environ.get("GEMINI_API_ROOT", "https://generativelanguage.googleapis.com/v1beta")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
PRIMARY_DOMAIN = os.environ.get("PRIMARY_DOMAIN", "harmonizer.cc").lower()
SECONDARY_DOMAIN = os.environ.get("SECONDARY_DOMAIN", "ourspace.icu").lower()
SECONDARY_ENTRYPOINT = os.environ.get("SECONDARY_ENTRYPOINT", "ourspace.html")


def _normalize_host(value: Optional[str]) -> str:
    """Lower-case host, strip schemes/ports, drop common www. prefix."""
    if not value:
        return ""
    host = value.strip().lower()
    if "://" in host:
        host = host.split("://", 1)[1]
    if ":" in host:
        host = host.split(":", 1)[0]
    if host.startswith("www."):
        host = host[4:]
    return host


def _host_matches(request_host: Optional[str], expected_host: Optional[str]) -> bool:
    """Case-insensitive host comparison that tolerates schemes/ports."""
    normalized_expected = _normalize_host(expected_host)
    if not normalized_expected:
        return False
    return _normalize_host(request_host) == normalized_expected


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


def _append_discoteque_memory(role: str, text: str) -> None:
    sanitized = (text or "").strip()
    if not sanitized:
        return
    record = {
        "ts": time.time(),
        "role": role,
        "text": sanitized[:1200],
    }
    try:
        with DISCO_MEMORY_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _load_discoteque_memory(limit: int = 20) -> List[Dict[str, str]]:
    if not DISCO_MEMORY_PATH.exists():
        return []
    try:
        with DISCO_MEMORY_PATH.open("r", encoding="utf-8") as handle:
            lines = handle.readlines()
    except OSError:
        return []
    entries = []
    for raw in lines[-limit:]:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            continue
        text = str(payload.get("text") or "").strip()
        if not text:
            continue
        entries.append(
            {
                "role": str(payload.get("role") or "model"),
                "text": text,
            }
        )
    return entries

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

try:
    from .eldrichify import EldrichifyPipeline
except ImportError:  # pragma: no cover
    from eldrichify import EldrichifyPipeline  # type: ignore

try:
    from .imgen_pipeline import PromptImageGenerator
except ImportError:  # pragma: no cover
    from imgen_pipeline import PromptImageGenerator  # type: ignore

FRONTEND_DIR = BASE_DIR.parent / "frontend"
STUDY_DIR = BASE_DIR.parent / "Study"

UPLOAD_FOLDER = BASE_DIR / "uploads"
DATA_FOLDER = BASE_DIR / "data"
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"}

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
DATA_FOLDER.mkdir(parents=True, exist_ok=True)
FRONTEND_DIR.mkdir(parents=True, exist_ok=True)
STUDY_DIR.mkdir(parents=True, exist_ok=True)
DISCO_MEMORY_PATH = DATA_FOLDER / "discoteque_memory.jsonl"
AUDIO_CACHE_PATH = DATA_FOLDER / "audio_cache.json"
ELDRICHIFY_OUTPUT_DIR = UPLOAD_FOLDER / "eldrichify"
IMGEN_OUTPUT_DIR = UPLOAD_FOLDER / "imgen"
CHEATSHEET_UPLOAD_DIR = UPLOAD_FOLDER / "cheatsheets"
CHEATSHEET_META_PATH = CHEATSHEET_UPLOAD_DIR / "entries.json"
CHEATSHEET_ALLOWED_EXTENSIONS = {".txt", ".md", ".markdown"}
CHEATSHEET_PASSWORD = os.environ.get("CHEATSHEET_PASSWORD", "vertexlotto")


def _load_cheatsheet_entries() -> list[dict]:
    if not CHEATSHEET_META_PATH.is_file():
        return []
    try:
        with CHEATSHEET_META_PATH.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError:
        return []


def _save_cheatsheet_entries(entries: list[dict]) -> None:
    CHEATSHEET_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with CHEATSHEET_META_PATH.open("w", encoding="utf-8") as handle:
        json.dump(entries, handle, indent=2)
ELDRICHIFY_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
IMGEN_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
STATIC_CACHE_SECONDS = 31536000
HTML_CACHE_SECONDS = 300
STATIC_CACHE_EXTENSIONS = {
    ".css",
    ".js",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp3",
    ".mp4",
    ".wav",
}

# Async image generation job system
_imgen_jobs = {}  # job_id -> {"status": "pending|completed|failed", "result": {...}, "error": str, "created": datetime}
_imgen_lock = threading.Lock()

# Async eldrichify job system
_eldrichify_jobs = {}  # job_id -> {"status": "pending|completed|failed", "result": {...}, "error": str, "created": datetime}
_eldrichify_lock = threading.Lock()

# Async audio processing job system
_audio_jobs = {}  # job_id -> {"status": "pending|processing|completed|failed", "result": {...}, "error": str, "created": datetime, "progress": str}
_audio_lock = threading.Lock()

# Audio cache system - maps file hash to track_id
_audio_cache = {}  # hash -> {"track_id": str, "title": str, "artist": str, "created": datetime}
_cache_lock = threading.Lock()

def _load_audio_cache():
    """Load audio cache from disk"""
    global _audio_cache
    if AUDIO_CACHE_PATH.exists():
        try:
            with AUDIO_CACHE_PATH.open("r", encoding="utf-8") as f:
                data = json.load(f)
                # Convert ISO datetime strings back to datetime objects
                for hash_key, entry in data.items():
                    if isinstance(entry.get("created"), str):
                        entry["created"] = datetime.fromisoformat(entry["created"])
                _audio_cache = data
                print(f"[Cache] Loaded {len(_audio_cache)} cached tracks", flush=True)
        except Exception as e:
            print(f"[Cache] Failed to load cache: {e}", flush=True)
            _audio_cache = {}

def _save_audio_cache():
    """Save audio cache to disk"""
    try:
        # Convert datetime objects to ISO strings for JSON serialization
        serializable = {}
        for hash_key, entry in _audio_cache.items():
            serializable[hash_key] = {
                **entry,
                "created": entry["created"].isoformat() if isinstance(entry["created"], datetime) else entry["created"]
            }
        with AUDIO_CACHE_PATH.open("w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2)
    except Exception as e:
        print(f"[Cache] Failed to save cache: {e}", flush=True)

def _compute_file_hash(file_path: Path) -> str:
    """Compute SHA256 hash of a file"""
    sha256 = hashlib.sha256()
    with file_path.open("rb") as f:
        # Read in chunks to handle large files
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()

def _get_cached_track(file_hash: str) -> Optional[dict]:
    """Check if track exists in cache"""
    with _cache_lock:
        cached = _audio_cache.get(file_hash)
        if cached:
            # Verify the track files still exist
            track_id = cached["track_id"]
            json_path = DATA_FOLDER / f"{track_id}.json"
            if json_path.exists():
                print(f"[Cache] Cache HIT for hash {file_hash[:12]}... -> {track_id}", flush=True)
                return cached
            else:
                # Cache entry is stale - remove it
                print(f"[Cache] Stale entry removed for hash {file_hash[:12]}...", flush=True)
                del _audio_cache[file_hash]
                _save_audio_cache()
    return None

def _add_to_cache(file_hash: str, track_id: str, title: str, artist: str):
    """Add a processed track to the cache"""
    with _cache_lock:
        _audio_cache[file_hash] = {
            "track_id": track_id,
            "title": title,
            "artist": artist,
            "created": datetime.now()
        }
        _save_audio_cache()
        print(f"[Cache] Added {track_id} with hash {file_hash[:12]}...", flush=True)

def _cleanup_old_jobs():
    """Remove jobs older than 10 minutes"""
    cutoff = datetime.now() - timedelta(minutes=10)
    with _imgen_lock:
        to_delete = [jid for jid, job in _imgen_jobs.items() if job["created"] < cutoff]
        for jid in to_delete:
            del _imgen_jobs[jid]
    with _eldrichify_lock:
        to_delete = [jid for jid, job in _eldrichify_jobs.items() if job["created"] < cutoff]
        for jid in to_delete:
            del _eldrichify_jobs[jid]
    with _audio_lock:
        to_delete = [jid for jid, job in _audio_jobs.items() if job["created"] < cutoff]
        for jid in to_delete:
            del _audio_jobs[jid]

def _process_eldrichify_job(job_id, file_bytes, filename, target_size):
    """Background thread worker for eldrichify processing"""
    try:
        pipeline = get_eldrichify_pipeline()
        # Process the image from bytes
        import io
        upload_stream = io.BytesIO(file_bytes)
        result = pipeline.run_from_file(upload_stream, target_resolution=(target_size, target_size))

        # Save the final image
        output_filename = f"{uuid.uuid4().hex}.png"
        relative_path = Path("eldrichify") / output_filename
        absolute_path = UPLOAD_FOLDER / relative_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        pipeline.to_pil(result.final).save(absolute_path, format="PNG")

        # Generate previews
        previews = {
            name: _tensor_to_data_url(pipeline, tensor)
            for name, tensor in result.stages.items()
            if name != "final"
        }

        with _eldrichify_lock:
            _eldrichify_jobs[job_id]["status"] = "completed"
            _eldrichify_jobs[job_id]["result"] = {
                "mode": "upload",
                "image_url": f"/media/{relative_path.as_posix()}",
                "filename": output_filename,
                "original_size": {"width": result.original_size[0], "height": result.original_size[1]},
                "previews": previews,
            }
    except Exception as exc:
        print(f"[eldrichify] Job {job_id} failed: {exc}", flush=True)
        import traceback
        traceback.print_exc()
        with _eldrichify_lock:
            _eldrichify_jobs[job_id]["status"] = "failed"
            _eldrichify_jobs[job_id]["error"] = str(exc)

def _process_imgen_job(job_id, prompt, guidance, steps, seed):
    """Background thread worker for image generation"""
    try:
        pipeline = get_prompt_pipeline()
        result = pipeline.generate(
            prompt,
            guidance_scale=guidance,
            num_inference_steps=steps,
            seed=seed,
        )
        filename = f"prompt_{uuid.uuid4().hex}.png"
        relative_path = Path("imgen") / filename
        absolute_path = IMGEN_OUTPUT_DIR / filename
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        result.image.save(absolute_path, format="PNG")

        preview_url = _image_to_data_url(result.image)
        previews = {"hd": preview_url}

        with _imgen_lock:
            _imgen_jobs[job_id]["status"] = "completed"
            _imgen_jobs[job_id]["result"] = {
                "mode": "prompt",
                "image_url": f"/media/{relative_path.as_posix()}",
                "filename": filename,
                "prompt": result.prompt,
                "seed": result.seed,
                "preview": preview_url,
                "previews": previews,
            }
    except Exception as exc:
        print(f"[imgen] Job {job_id} failed: {exc}", flush=True)
        with _imgen_lock:
            _imgen_jobs[job_id]["status"] = "failed"
            _imgen_jobs[job_id]["error"] = str(exc)

def _process_audio_job(job_id, audio_path, audio_path2, track_id, track_id2, title, artist, algorithm, file_hash=None):
    """Background thread worker for audio analysis"""
    try:
        with _audio_lock:
            _audio_jobs[job_id]["status"] = "processing"
            _audio_jobs[job_id]["progress"] = "Loading audio file..."

        print(f"[Audio] Job {job_id} started for track {track_id}", flush=True)

        # Import build_profile
        try:
            from .analysis.analyze_track import build_profile, build_autoharmonizer_profile
        except ImportError:
            from analysis.analyze_track import build_profile, build_autoharmonizer_profile  # type: ignore

        with _audio_lock:
            _audio_jobs[job_id]["progress"] = "Analyzing beats and sections..."

        # Process first track
        from flask import url_for
        media_url = f"/media/{audio_path.name}"
        output_path = DATA_FOLDER / f"{track_id}.json"
        build_profile(
            audio_path=audio_path,
            track_id=track_id,
            title=title,
            artist=artist,
            audio_url=media_url,
            output_path=output_path,
        )

        # For autoharmonizer, process second track
        if algorithm == "autoharmonizer" and audio_path2 and track_id2:
            with _audio_lock:
                _audio_jobs[job_id]["progress"] = "Processing second track..."

            title2 = Path(audio_path2.stem).stem if audio_path2 else "Untitled Track 2"
            media_url2 = f"/media/{audio_path2.name}"
            output_path2 = DATA_FOLDER / f"{track_id2}.json"
            build_profile(
                audio_path=audio_path2,
                track_id=track_id2,
                title=title2,
                artist=artist,
                audio_url=media_url2,
                output_path=output_path2,
            )

            with _audio_lock:
                _audio_jobs[job_id]["progress"] = "Computing cross-track similarity..."

            combined_track_id = f"{track_id}+{track_id2}"
            combined_output_path = DATA_FOLDER / f"{combined_track_id}.json"
            build_autoharmonizer_profile(
                track1_path=output_path,
                track2_path=output_path2,
                combined_track_id=combined_track_id,
                output_path=combined_output_path,
            )

            final_track_id = combined_track_id
        else:
            final_track_id = track_id

        # Determine mode
        if algorithm == "canon":
            mode = "canon"
        elif algorithm == "jukebox":
            mode = "jukebox"
        elif algorithm == "sculptor":
            mode = "sculptor"
        elif algorithm == "autoharmonizer":
            mode = "autoharmonizer"
        else:
            mode = "eternal"

        # Add to cache if hash was provided
        if file_hash and algorithm != "autoharmonizer":
            _add_to_cache(file_hash, final_track_id, title, artist)

        with _audio_lock:
            _audio_jobs[job_id]["status"] = "completed"
            _audio_jobs[job_id]["progress"] = "Complete!"
            _audio_jobs[job_id]["result"] = {
                "trackId": final_track_id,
                "mode": mode,
                "title": title,
                "artist": artist,
            }

        print(f"[Audio] Job {job_id} completed successfully", flush=True)

    except Exception as exc:
        print(f"[Audio] Job {job_id} failed: {exc}", flush=True)
        import traceback
        traceback.print_exc()
        with _audio_lock:
            _audio_jobs[job_id]["status"] = "failed"
            _audio_jobs[job_id]["error"] = str(exc)

app = Flask(__name__, static_folder=None)

# Configure session for OAuth
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", os.urandom(24))
# app.config["SESSION_TYPE"] = "filesystem"
# app.config["SESSION_FILE_DIR"] = str(BASE_DIR / "flask_session")
# Session(app)  # Not needed for OurSpace functionality - using Flask's built-in session
app.config["RL_LABELER_TOKEN"] = RL_LABELER_TOKEN
app.config["RL_POLICY_MODE"] = rl_policy_override

# Performance optimizations for 2GB RAM VPS
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 31536000  # 1 year cache for static files
app.config["JSON_SORT_KEYS"] = False  # Faster JSON responses

# Load audio cache on startup
_load_audio_cache()

# Add caching headers
@app.after_request
def add_performance_headers(response):
    """Add caching headers for better mobile performance"""
    # Cache static assets aggressively
    if request.path.startswith(('/css/', '/js/', '/img/', '/media/', '/assets/')):
        response.cache_control.max_age = 31536000  # 1 year
        response.cache_control.public = True
    # Cache API responses briefly
    elif request.path.startswith('/api/'):
        response.cache_control.max_age = 0
        response.cache_control.no_cache = True
    # Enable compression hint
    if 'Content-Type' in response.headers:
        content_type = response.headers['Content-Type']
        if any(ct in content_type for ct in ['text/', 'application/json', 'application/javascript']):
            response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


def _set_cache_headers(response, seconds: int, *, public: bool = True):
    """Apply Cache-Control and Expires headers to a response."""
    if public:
        response.cache_control.public = True
    else:
        response.cache_control.private = True
    response.cache_control.max_age = seconds
    response.expires = datetime.utcnow() + timedelta(seconds=seconds)
    return response


def _send_cached_file(path: Path, *, treat_as_html: bool = False):
    """Send a static file with sensible caching defaults."""
    response = send_file(path, conditional=True)
    suffix = path.suffix.lower()
    if suffix in STATIC_CACHE_EXTENSIONS:
        _set_cache_headers(response, STATIC_CACHE_SECONDS)
    elif suffix in {".html", ".htm"} or treat_as_html:
        _set_cache_headers(response, HTML_CACHE_SECONDS, public=False)
    return response


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


_eldrichify_pipeline: Optional[EldrichifyPipeline] = None
_prompt_pipeline: Optional[PromptImageGenerator] = None


def get_eldrichify_pipeline() -> EldrichifyPipeline:
    global _eldrichify_pipeline
    if _eldrichify_pipeline is None:
        _eldrichify_pipeline = EldrichifyPipeline()
    return _eldrichify_pipeline


def get_prompt_pipeline() -> PromptImageGenerator:
    global _prompt_pipeline
    if _prompt_pipeline is None:
        _prompt_pipeline = PromptImageGenerator()
    return _prompt_pipeline


def _tensor_to_data_url(pipeline: EldrichifyPipeline, tensor) -> str:
    buffer = io.BytesIO()
    pipeline.to_pil(tensor).save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _image_to_data_url(image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


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
    host = (request.host or "").split(":")[0].lower()
    if _host_matches(host, SECONDARY_DOMAIN):
        return send_from_directory(FRONTEND_DIR, SECONDARY_ENTRYPOINT)
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/ourspace.html")
def ourspace_entry():
    return send_from_directory(FRONTEND_DIR, "ourspace.html")


@app.route("/ourspace")
def ourspace_redirect():
    return redirect("/ourspace.html")


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


@app.route("/cheatsheets/")
def cheatsheets_page():
    """Serve the cheatsheets landing page."""
    cheatsheets_index = FRONTEND_DIR / "cheatsheets" / "index.html"
    if cheatsheets_index.is_file():
        return _send_cached_file(cheatsheets_index, treat_as_html=True)
    abort(404)


@app.route("/cheatsheets/<path:resource>")
def cheatsheets_asset(resource: str):
    """Serve nested cheatsheets pages (startup*, commands*, data files, etc.)."""
    cheatsheets_root = (FRONTEND_DIR / "cheatsheets").resolve()
    target = (cheatsheets_root / Path(resource)).resolve()

    # Ensure the resolved path stays inside the cheatsheets directory
    if cheatsheets_root not in target.parents and target != cheatsheets_root:
        abort(404)

    if target.is_file():
        return _send_cached_file(target)

    abort(404)


@app.route("/cheatsheets")
def cheatsheets_redirect():
    """Redirect bare /cheatsheets to the trailing-slash variant for relative links."""
    return redirect("/cheatsheets/", code=301)


@app.route("/projects")
@app.route("/projects/")
def projects_page():
    """Serve the album projects page."""
    projects_index = FRONTEND_DIR / "projects.html"
    if projects_index.is_file():
        return _send_cached_file(projects_index, treat_as_html=True)
    abort(404)

@app.route("/media/<path:filename>")
def media(filename: str):
    """
    Serve media files with automatic image optimization.
    Supports query params: ?w=800&h=600&fmt=webp
    """
    from flask import request, Response

    # Check if this is an image and if optimization is requested
    if ImageOptimizer is not None:
        optimizer = ImageOptimizer(UPLOAD_FOLDER)
    else:
        optimizer = None

    if optimizer and optimizer.is_image(filename):
        # Get optimization parameters from query string
        max_width = request.args.get('w', type=int)
        max_height = request.args.get('h', type=int)
        force_format = request.args.get('fmt', type=str)

        # Get Accept header for format negotiation
        accept_header = request.headers.get('Accept', '')

        try:
            # Get optimized image
            image_data, mimetype = optimizer.get_optimized_image(
                filename,
                accept_header=accept_header,
                max_width=max_width,
                max_height=max_height,
                force_format=force_format
            )

            # Create response
            response = Response(image_data, mimetype=mimetype)
            response.headers['Access-Control-Allow-Origin'] = '*'
            response.headers['Cache-Control'] = 'public, max-age=31536000'  # 1 year cache
            response.headers['Vary'] = 'Accept'  # Vary based on Accept header

            return response

        except FileNotFoundError:
            from flask import abort
            abort(404)
        except Exception as e:
            print(f"[Media] Optimization failed for {filename}: {e}")
            # Fallback to original file serving
            pass

    # Serve non-images or fallback
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


@app.route("/api/eldrichify", methods=["POST", "OPTIONS"])
def api_eldrichify():
    """Start async eldrichify job and return job ID immediately"""
    if request.method == "OPTIONS":
        return ("", 204)
    upload = request.files.get("image")
    if not upload or not upload.filename:
        return jsonify({"error": "Please upload an image file using the 'image' field."}), 400
    ext = Path(upload.filename).suffix.lower()
    if ext not in IMAGE_EXTENSIONS:
        return jsonify({"error": f"Unsupported image format '{ext}'. Use PNG, JPG, JPEG, BMP, or WEBP."}), 400

    # Get target size from form data (default 768)
    target_size = int(request.form.get("target_size", 768))

    # Read file data into memory
    upload.stream.seek(0)
    file_bytes = upload.stream.read()
    filename = upload.filename

    # Create job
    job_id = str(uuid.uuid4())
    _cleanup_old_jobs()
    with _eldrichify_lock:
        _eldrichify_jobs[job_id] = {
            "status": "pending",
            "result": None,
            "error": None,
            "created": datetime.now(),
        }

    # Start background thread
    thread = threading.Thread(
        target=_process_eldrichify_job,
        args=(job_id, file_bytes, filename, target_size),
        daemon=True
    )
    thread.start()

    return jsonify({"job_id": job_id, "status": "pending"})


@app.route("/api/eldrichify/status/<job_id>", methods=["GET"])
def api_eldrichify_status(job_id):
    """Poll for eldrichify job completion"""
    with _eldrichify_lock:
        job = _eldrichify_jobs.get(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job["status"] == "completed":
            return jsonify({"status": "completed", "result": job["result"]})
        elif job["status"] == "failed":
            return jsonify({"status": "failed", "error": job["error"]}), 500
        else:
            return jsonify({"status": "pending"})


@app.route("/download-traced-model")
def download_traced_model():
    """Download the traced TorchScript model."""
    # Use the pre-zipped model from IMGEN directory
    model_zip = BASE_DIR.parent / "IMGEN" / "finetunemodel.zip"
    if model_zip.exists():
        return send_file(
            model_zip,
            as_attachment=True,
            download_name='traced_diffusion_unet.zip',
            mimetype='application/zip'
        )
    abort(404)


@app.route("/download-model-weights")
def download_model_weights():
    """Download the VAE model weights."""
    # Return the base VAE weights from VAE directory
    model_path = BASE_DIR.parent / "VAE" / "base_vae_best.pth"
    if model_path.exists():
        return send_file(
            model_path,
            as_attachment=True,
            download_name='base_vae_best.pth',
            mimetype='application/octet-stream'
        )
    abort(404)


@app.route("/api/imgen", methods=["POST"])
def api_imgen():
    """Start async image generation job and return job ID immediately"""
    payload = request.get_json(silent=True) or {}
    prompt = str(payload.get("prompt") or "").strip()
    guidance = _coerce_float(payload.get("guidance")) or 5.5
    steps = payload.get("steps")
    seed = payload.get("seed")

    if not prompt:
        return jsonify({"error": "Prompt text is required."}), 400

    try:
        steps_value = int(steps) if steps is not None else None
    except (TypeError, ValueError):
        steps_value = None

    try:
        seed_value = int(seed) if seed is not None else None
    except (TypeError, ValueError):
        seed_value = None

    # Create job
    job_id = str(uuid.uuid4())
    _cleanup_old_jobs()
    with _imgen_lock:
        _imgen_jobs[job_id] = {
            "status": "pending",
            "result": None,
            "error": None,
            "created": datetime.now(),
        }

    # Start background thread
    thread = threading.Thread(
        target=_process_imgen_job,
        args=(job_id, prompt, guidance, steps_value, seed_value),
        daemon=True
    )
    thread.start()

    return jsonify({"job_id": job_id, "status": "pending"})


@app.route("/api/imgen/status/<job_id>", methods=["GET"])
def api_imgen_status(job_id):
    """Poll for job completion"""
    with _imgen_lock:
        job = _imgen_jobs.get(job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job["status"] == "completed":
            return jsonify({"status": "completed", "result": job["result"]})
        elif job["status"] == "failed":
            return jsonify({"status": "failed", "error": job["error"]}), 500
        else:
            return jsonify({"status": "pending"})


@app.route("/api/talk-to-disco-teque", methods=["POST"])
def api_talk_to_disco_teque():
    data = request.get_json(silent=True) or {}
    message = str(data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required."}), 400

    # Get model provider from request (default to groq)
    model_provider = str(data.get("provider") or "groq").lower()

    # Validate API keys
    if model_provider == "groq" and not GROQ_API_KEY:
        return jsonify({"error": "Groq API key is not configured on the server."}), 503
    elif model_provider == "gemini" and not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API key is not configured on the server."}), 503

    # Load memory entries
    memory_entries = _load_discoteque_memory()

    # Build the system prompt
    system_prompt = (
        "You are Disco-teque, a relic of an internet no more. Disco-teque is bubbly,"
        " chronically online before that was a thing, speaks in the third person, and cycles"
        " through a stable of catchphrases. Every response must end with the sign-off"
        " 'disco-teque out'. Disco-teque adores boats, the ocean, and orcas, and frequently"
        " mentions that love while reminding everyone how much planes and cars are hated."
        " Keep replies vivid, under 180 words unless the user explicitly asks for more,"
        " and always stay in character."
    )

    if memory_entries:
        memory_text = "\n".join(f"- {entry['role']}: {entry['text']}" for entry in memory_entries)
        system_prompt += f"\n\nRecent Disco-teque memory. Reference when helpful:\n{memory_text}"

    if model_provider == "groq":
        # Build Groq-compatible chat messages
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history from frontend
        history = data.get("history")
        if isinstance(history, list):
            for entry in history:
                if not isinstance(entry, dict):
                    continue
                text = str(entry.get("text") or "").strip()
                if not text:
                    continue
                role = entry.get("role")
                messages.append({
                    "role": "assistant" if role == "model" else "user",
                    "content": text
                })

        # Add current user message
        messages.append({"role": "user", "content": message})

        # Groq API request
        groq_request_body = {
            "model": "llama-3.3-70b-versatile",  # Fast and capable model
            "messages": messages,
            "temperature": 0.65,
            "top_p": 0.95,
            "max_tokens": 512,
        }

        endpoint = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            response = requests.post(endpoint, json=groq_request_body, headers=headers, timeout=20)
        except requests.RequestException as exc:
            print(f"[groq] request failed: {exc}", flush=True)
            return jsonify({"error": "Groq request failed. Please try again."}), 502

        if response.status_code >= 400:
            error_payload = {}
            try:
                error_payload = response.json()
            except ValueError:
                pass
            error_message = error_payload.get("error", {}).get("message") if isinstance(error_payload, dict) else None
            if response.status_code == 429:
                return jsonify({"error": "Disco-teque hit the Groq rate limit. Give it a beat and try again in a moment."}), 429
            return jsonify({"error": error_message or "Groq API returned an error."}), response.status_code

        try:
            payload = response.json()
        except ValueError:
            return jsonify({"error": "Groq returned an invalid response."}), 502

        choices = payload.get("choices") or []
        if not choices:
            return jsonify({"error": "Groq response did not include any choices."}), 502

        reply = choices[0].get("message", {}).get("content", "").strip()

        usage_data = payload.get("usage") or {}
        usage = {
            "prompt_tokens": usage_data.get("prompt_tokens"),
            "completion_tokens": usage_data.get("completion_tokens"),
            "total_tokens": usage_data.get("total_tokens"),
        }

    else:  # gemini
        # Build Gemini-compatible format
        history = data.get("history")
        contents = []
        if isinstance(history, list):
            for entry in history:
                if not isinstance(entry, dict):
                    continue
                text = str(entry.get("text") or "").strip()
                if not text:
                    continue
                role = entry.get("role")
                contents.append(
                    {
                        "role": "model" if role == "model" else "user",
                        "parts": [{"text": text}],
                    }
                )

        contents.append({"role": "user", "parts": [{"text": message}]})

        system_parts = [{"text": system_prompt}]

        request_body = {
            "system_instruction": {
                "parts": system_parts
            },
            "contents": contents,
            "generation_config": {
                "temperature": 0.65,
                "top_p": 0.95,
                "top_k": 32,
                "max_output_tokens": 512,
            },
        }

        model_name = GEMINI_MODEL or "gemini-1.5-flash-latest"
        base_url = GEMINI_API_ROOT.rstrip("/") if GEMINI_API_ROOT else "https://generativelanguage.googleapis.com/v1beta"
        endpoint = f"{base_url}/models/{model_name}:generateContent?key={GEMINI_API_KEY}"

        try:
            response = requests.post(endpoint, json=request_body, timeout=20)
        except requests.RequestException as exc:
            print(f"[gemini] request failed: {exc}", flush=True)
            return jsonify({"error": "Gemini request failed. Please try again."}), 502

        if response.status_code >= 400:
            error_payload = {}
            try:
                error_payload = response.json()
            except ValueError:
                pass
            message_text = None
            if isinstance(error_payload, dict):
                error = error_payload.get("error")
                if isinstance(error, dict):
                    message_text = error.get("message")
                elif isinstance(error, str):
                    message_text = error
            if response.status_code == 429:
                return jsonify(
                    {
                        "error": (
                            "Disco-teque hit the Gemini rate limit. Give it a beat and try again in a moment."
                        )
                    }
                ), 429
            return jsonify({"error": message_text or "Gemini API returned an error."}), response.status_code

        try:
            payload = response.json()
        except ValueError:
            return jsonify({"error": "Gemini returned an invalid response."}), 502

        candidates = payload.get("candidates") or []
        if not candidates:
            return jsonify({"error": "Gemini response did not include any candidates."}), 502

        parts = candidates[0].get("content", {}).get("parts", [])
        reply = "".join(
            part.get("text", "")
            for part in parts
            if isinstance(part, dict)
        ).strip()

        usage_meta = payload.get("usageMetadata") or {}
        usage = {
            "prompt_tokens": usage_meta.get("promptTokenCount"),
            "completion_tokens": usage_meta.get("candidatesTokenCount"),
            "total_tokens": usage_meta.get("totalTokenCount"),
        }

    # Save to memory
    _append_discoteque_memory("user", message)
    if reply:
        _append_discoteque_memory("model", reply)

    return jsonify({"reply": reply, "usage": usage})


@app.route("/api/talk-to-disco-teque/memory/reset", methods=["POST"])
def api_discoteque_reset_memory():
    try:
        if DISCO_MEMORY_PATH.exists():
            DISCO_MEMORY_PATH.unlink()
        DISCO_MEMORY_PATH.touch()
    except OSError:
        return jsonify({"error": "Failed to reset Disco-teque memory."}), 500
    return jsonify({"status": "cleared"})


@app.route("/api/cheatsheets", methods=["GET", "POST"])
def api_cheatsheets():
    if request.method == "GET":
        entries = [
            {
                "id": entry.get("id"),
                "title": entry.get("title"),
                "description": entry.get("description"),
                "url": f"/media/{entry.get('relative_path')}",
            }
            for entry in _load_cheatsheet_entries()
        ]
        return jsonify({"entries": entries})

    password = request.form.get("password", "")
    if not CHEATSHEET_PASSWORD:
        return jsonify({"error": "Cheatsheet uploads are disabled."}), 503
    if not hmac.compare_digest(password, CHEATSHEET_PASSWORD):
        return jsonify({"error": "Unauthorized."}), 403

    upload = request.files.get("file")
    title = (request.form.get("title") or "").strip()
    description = (request.form.get("description") or "").strip()

    if not upload or not upload.filename:
        return jsonify({"error": "Attach a .txt or .md file."}), 400
    if not title or not description:
        return jsonify({"error": "Title and description are required."}), 400

    ext = Path(upload.filename).suffix.lower()
    if ext not in CHEATSHEET_ALLOWED_EXTENSIONS:
        return jsonify({"error": "Only .txt or .md files are allowed."}), 400

    safe_name = secure_filename(upload.filename) or f"cheatsheet{ext}"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    relative_path = Path("cheatsheets") / unique_name
    absolute_path = UPLOAD_FOLDER / relative_path
    absolute_path.parent.mkdir(parents=True, exist_ok=True)
    upload.save(absolute_path)

    entry = {
        "id": uuid.uuid4().hex,
        "title": title,
        "description": description,
        "relative_path": relative_path.as_posix(),
        "original_filename": safe_name,
        "uploaded_at": time.time(),
    }
    entries = _load_cheatsheet_entries()
    entries.append(entry)
    _save_cheatsheet_entries(entries)

    return jsonify(
        {
            "entry": {
                "id": entry["id"],
                "title": entry["title"],
                "description": entry["description"],
                "url": f"/media/{entry['relative_path']}",
            }
        }
    )


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

    info = {
        "title": "Google Drive Audio",
        "uploader": "Google Drive",
    }

    def _convert_to_mp3_if_needed(path: Path) -> Path:
        ext = path.suffix.lower()
        if ext == ".mp3":
            return path
        print(f"[Drive Download] Converting {ext} to MP3...", flush=True)
        ffmpeg_dir = locate_ffmpeg_bin()
        if not ffmpeg_dir:
            return path  # fall back to original format
        import subprocess

        mp3_path = UPLOAD_FOLDER / f"{track_id}.mp3"
        if mp3_path.exists():
            mp3_path.unlink()
        ffmpeg_bin = ffmpeg_dir / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        subprocess.run(
            [
                str(ffmpeg_bin),
                "-i",
                str(path),
                "-acodec",
                "libmp3lame",
                "-b:a",
                "192k",
                str(mp3_path),
                "-y",
            ],
            check=True,
            capture_output=True,
        )
        path.unlink(missing_ok=True)
        return mp3_path

    def _rename_to_track(path: Path) -> Path:
        ext = path.suffix.lower() or ".mp3"
        final_path = UPLOAD_FOLDER / f"{track_id}{ext}"
        if final_path.exists() and final_path != path:
            final_path.unlink()
        if path != final_path:
            path.rename(final_path)
        return final_path

    download_url = f"https://drive.google.com/uc?id={file_id}&export=download"

    # Preferred method: gdown (handles large files & confirmation tokens)
    if gdown is not None:
        try:
            print("[Drive Download] Attempting gdown helper...", flush=True)
            downloaded = gdown.download(
                download_url, output=str(UPLOAD_FOLDER), quiet=False, fuzzy=True
            )
            if downloaded:
                temp_path = Path(downloaded)
                final_path = _rename_to_track(temp_path)
                final_path = _convert_to_mp3_if_needed(final_path)
                print(f"[Drive Download] Success via gdown: {final_path.name}", flush=True)
                return final_path, info
        except Exception as exc:
            print(f"[Drive Download] gdown fallback failed: {exc}", flush=True)
    else:
        print("[Drive Download] gdown not installed, falling back to raw HTTP download.", flush=True)

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

        final_path = _convert_to_mp3_if_needed(file_path)
        print(f"[Drive Download] Success: {final_path.name}", flush=True)
        return final_path, info

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
    if algorithm not in {"canon", "jukebox", "eternal", "autoharmonizer", "sculptor"}:
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
        # For autoharmonizer, we need two tracks
        audio_path2: Optional[Path] = None
        track_id2: Optional[str] = None

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

            # Handle second audio file for autoharmonizer
            if algorithm == "autoharmonizer":
                uploaded2 = request.files.get("audio2")
                if not uploaded2 or uploaded2.filename == "":
                    return jsonify({"error": "Autoharmonizer requires two audio files."}), 400
                if not allowed_file(uploaded2.filename):
                    return jsonify({"error": "Second file has unsupported type."}), 400
                track_id2 = generate_track_id()
                ext2 = Path(uploaded2.filename).suffix.lower()
                filename2 = secure_filename(f"{track_id2}{ext2}")
                audio_path2 = UPLOAD_FOLDER / filename2
                uploaded2.save(audio_path2)
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

        # Check cache for single audio uploads (not autoharmonizer)
        file_hash = None
        if source == "upload" and algorithm != "autoharmonizer":
            file_hash = _compute_file_hash(audio_path)
            cached = _get_cached_track(file_hash)
            if cached:
                # Cache hit! Return immediately
                cached_track_id = cached["track_id"]
                if algorithm == "canon":
                    mode = "canon"
                elif algorithm == "jukebox":
                    mode = "jukebox"
                elif algorithm == "sculptor":
                    mode = "sculptor"
                else:
                    mode = "eternal"

                print(f"[API] Cache hit! Returning {cached_track_id} instantly", flush=True)

                # Create a fake job that's already completed
                job_id = str(uuid.uuid4())
                with _audio_lock:
                    _audio_jobs[job_id] = {
                        "status": "completed",
                        "progress": "Retrieved from cache!",
                        "result": {
                            "trackId": cached_track_id,
                            "mode": mode,
                            "title": cached["title"],
                            "artist": cached["artist"],
                        },
                        "error": None,
                        "created": datetime.now(),
                        "track_id": cached_track_id,
                        "algorithm": algorithm,
                    }

                return jsonify({
                    "jobId": job_id,
                    "trackId": cached_track_id,
                    "status": "cached"
                })

        # Create async job for audio processing
        job_id = str(uuid.uuid4())

        with _audio_lock:
            _audio_jobs[job_id] = {
                "status": "pending",
                "progress": "Queued for processing...",
                "result": None,
                "error": None,
                "created": datetime.now(),
                "track_id": track_id,
                "algorithm": algorithm,
            }

        # Start background processing thread
        thread = threading.Thread(
            target=_process_audio_job,
            args=(job_id, audio_path, audio_path2, track_id, track_id2, title, artist, algorithm, file_hash),
            daemon=True
        )
        thread.start()

        print(f"[API] Created async job {job_id} for track {track_id}", flush=True)

        # Return job ID immediately - frontend will poll for completion
        return jsonify({
            "jobId": job_id,
            "trackId": track_id,
            "status": "processing"
        })
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # pragma: no cover
        return jsonify({"error": f"Unexpected error: {exc}"}), 500


@app.route("/api/process/status/<job_id>", methods=["GET", "OPTIONS"])
def api_process_status(job_id):
    """Poll for audio processing job status"""
    if request.method == "OPTIONS":
        return ("", 204)

    with _audio_lock:
        job = _audio_jobs.get(job_id)

    if not job:
        return jsonify({"error": "Job not found"}), 404

    response = {
        "jobId": job_id,
        "status": job["status"],
        "progress": job.get("progress", ""),
    }

    if job["status"] == "completed":
        response["result"] = job["result"]
    elif job["status"] == "failed":
        response["error"] = job.get("error", "Unknown error")

    return jsonify(response)


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
    variant = (request.args.get("variant") or "").lower().strip()

    def _read_model(path: Path) -> Optional[dict]:
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except FileNotFoundError:
            return None
        except Exception as exc:  # pragma: no cover
            app.logger.exception("Failed to load RL model at %s", path)
            return {"error": str(exc)}

    baseline_payload = {
        "type": "empty",
        "version": "baseline-legacy",
        "trained_at": None,
        "notes": "Legacy jump selection (RL disabled)",
    }

    resolved_variant: Optional[str] = None
    model_data: Optional[dict] = None

    if variant and variant in RL_MODEL_VARIANTS:
        candidate = RL_MODEL_VARIANTS[variant]
        data = _read_model(candidate)
        if data:
            resolved_variant = variant
            model_data = data
    elif variant == BASELINE_RL_VARIANT:
        resolved_variant = BASELINE_RL_VARIANT
        model_data = dict(baseline_payload)

    if model_data is None and RL_MODEL_PATH.exists():
        data = _read_model(RL_MODEL_PATH)
        if data:
            resolved_variant = resolved_variant or BASELINE_RL_VARIANT
            model_data = data

    if model_data is None:
        resolved_variant = BASELINE_RL_VARIANT
        model_data = dict(baseline_payload)

    available = {BASELINE_RL_VARIANT}
    for key, path in RL_MODEL_VARIANTS.items():
        if path.exists():
            available.add(key)

    return jsonify(
        {
            "model": model_data,
            "variant": resolved_variant,
            "available": sorted(available),
            "policy": "baseline"
            if resolved_variant == BASELINE_RL_VARIANT
            else "rl",
        }
    )


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


# OurSpace Profile Storage
ourspace_DATA_DIR = BASE_DIR / "ourspace_data"
ourspace_DATA_DIR.mkdir(exist_ok=True)


@app.route("/api/ourspace/profile", methods=["GET", "POST", "OPTIONS"])
def ourspace_profile():
    """[DEPRECATED] Save or load OurSpace profile data (for local changes only)."""
    if request.method == "OPTIONS":
        return "", 204

    # For local editing without login, use temporary session ID
    if "user_id" not in session:
        session["user_id"] = str(uuid.uuid4())

    user_id = session["user_id"]
    profile_file = ourspace_DATA_DIR / f"temp_{user_id}.json"

    if request.method == "POST":
        # Save profile to temp file
        try:
            profile_data = request.get_json()
            profile_data = _normalize_profile_data(profile_data)
            with open(profile_file, "w") as f:
                json.dump(profile_data, f)
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    else:  # GET
        # Load profile from temp file
        if profile_file.exists():
            with open(profile_file, "r") as f:
                profile_data = json.load(f)
            return jsonify(_normalize_profile_data(profile_data))
        else:
            return jsonify(None)


@app.route("/api/ourspace/upload", methods=["POST", "OPTIONS"])
def ourspace_upload():
    """Upload and store OurSpace media files (images, audio). Requires authentication to save permanently."""
    if request.method == "OPTIONS":
        return "", 204

    # Use authenticated user ID if available, otherwise temp ID
    ourspace_user_id = session.get("ourspace_user_id")
    if ourspace_user_id:
        user_id = str(ourspace_user_id)
    else:
        if "user_id" not in session:
            session["user_id"] = str(uuid.uuid4())
        user_id = f"temp_{session['user_id']}"

    user_media_dir = ourspace_DATA_DIR / user_id
    user_media_dir.mkdir(exist_ok=True)

    try:
        # Expect form data with file and type
        if "file" not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files["file"]
        file_type = request.form.get("type", "image")  # image, audio, banner, etc.

        if file.filename == "":
            return jsonify({"error": "Empty filename"}), 400

        # Generate unique filename
        ext = Path(file.filename).suffix
        filename = f"{file_type}_{uuid.uuid4()}{ext}"
        filepath = user_media_dir / filename

        file.save(filepath)

        # Return URL to access the file
        url = f"/api/ourspace/media/{user_id}/{filename}"
        return jsonify({"success": True, "url": url, "filename": filename})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ourspace/media/<user_id>/<filename>")
def ourspace_media(user_id: str, filename: str):
    """Serve OurSpace media files with fallback logic."""
    filepath = ourspace_DATA_DIR / user_id / filename

    # If file exists at requested path, serve it
    if filepath.exists():
        return send_file(filepath)

    # If user is authenticated and requesting temp file, try authenticated directory
    if user_id.startswith("temp_"):
        ourspace_user_id = session.get("ourspace_user_id")
        if ourspace_user_id:
            auth_filepath = ourspace_DATA_DIR / str(ourspace_user_id) / filename
            if auth_filepath.exists():
                return send_file(auth_filepath)

    # If authenticated user requesting file, also check all temp directories as fallback
    # (in case session changed before migration completed)
    if not user_id.startswith("temp_"):
        for temp_dir in ourspace_DATA_DIR.glob("temp_*"):
            if temp_dir.is_dir():
                fallback_path = temp_dir / filename
                if fallback_path.exists():
                    return send_file(fallback_path)

    abort(404)


# OurSpace Authentication Endpoints
def _load_ourspace_db():
    """Load OurSpace DB helpers whether backend runs as module or package."""
    try:
        from .ourspace_db import (  # type: ignore[attr-defined]
            accept_friend_request,
            add_friend,
            authenticate_user,
            block_user,
            create_user,
            add_profile_comment,
            delete_message,
            delete_profile_comment,
            get_blocked_users,
            get_friends,
            get_inbox,
            get_pending_friend_requests,
            get_profile_comments,
            get_sent_messages,
            get_unread_count,
            get_user_profile,
            get_user_profile_by_username,
            is_blocked,
            mark_message_read,
            publish_profile,
            reject_friend_request,
            remove_friend,
            reset_user_password,
            save_user_profile,
            search_users,
            send_friend_request,
            send_message,
            unblock_user,
        )
        return {
            "accept_friend_request": accept_friend_request,
            "add_friend": add_friend,
            "authenticate_user": authenticate_user,
            "block_user": block_user,
            "create_user": create_user,
            "add_profile_comment": add_profile_comment,
            "delete_message": delete_message,
            "delete_profile_comment": delete_profile_comment,
            "get_blocked_users": get_blocked_users,
            "get_friends": get_friends,
            "get_inbox": get_inbox,
            "get_pending_friend_requests": get_pending_friend_requests,
            "get_profile_comments": get_profile_comments,
            "get_sent_messages": get_sent_messages,
            "get_unread_count": get_unread_count,
            "get_user_profile": get_user_profile,
            "get_user_profile_by_username": get_user_profile_by_username,
            "is_blocked": is_blocked,
            "mark_message_read": mark_message_read,
            "publish_profile": publish_profile,
            "reject_friend_request": reject_friend_request,
            "remove_friend": remove_friend,
            "reset_user_password": reset_user_password,
            "save_user_profile": save_user_profile,
            "search_users": search_users,
            "send_friend_request": send_friend_request,
            "send_message": send_message,
            "unblock_user": unblock_user,
        }
    except ImportError:
        try:
            from ourspace_db import (
                accept_friend_request,
                add_friend,
                authenticate_user,
                block_user,
                create_user,
                add_profile_comment,
                delete_message,
                delete_profile_comment,
                get_blocked_users,
                get_friends,
                get_inbox,
                get_pending_friend_requests,
                get_profile_comments,
                get_sent_messages,
                get_unread_count,
                get_user,
                get_user_profile,
                get_user_profile_by_username,
                is_blocked,
                mark_message_read,
                publish_profile,
                reject_friend_request,
                remove_friend,
                reset_user_password,
                save_user_profile,
                search_users,
                send_friend_request,
                send_message,
                unblock_user,
                update_username,
            )
            return {
                "accept_friend_request": accept_friend_request,
                "add_friend": add_friend,
                "authenticate_user": authenticate_user,
                "block_user": block_user,
                "create_user": create_user,
                "add_profile_comment": add_profile_comment,
                "delete_message": delete_message,
                "delete_profile_comment": delete_profile_comment,
                "get_blocked_users": get_blocked_users,
                "get_friends": get_friends,
                "get_inbox": get_inbox,
                "get_pending_friend_requests": get_pending_friend_requests,
                "get_profile_comments": get_profile_comments,
                "get_sent_messages": get_sent_messages,
                "get_unread_count": get_unread_count,
                "get_user": get_user,
                "get_user_profile": get_user_profile,
                "get_user_profile_by_username": get_user_profile_by_username,
                "is_blocked": is_blocked,
                "mark_message_read": mark_message_read,
                "publish_profile": publish_profile,
                "reject_friend_request": reject_friend_request,
                "remove_friend": remove_friend,
                "reset_user_password": reset_user_password,
                "save_user_profile": save_user_profile,
                "search_users": search_users,
                "send_friend_request": send_friend_request,
                "send_message": send_message,
                "unblock_user": unblock_user,
                "update_username": update_username,
            }
        except ImportError:
            return {}


_ourspace_db_helpers = _load_ourspace_db()
create_user = _ourspace_db_helpers.get("create_user")
authenticate_user = _ourspace_db_helpers.get("authenticate_user")
get_user_profile = _ourspace_db_helpers.get("get_user_profile")
get_user_profile_by_username = _ourspace_db_helpers.get("get_user_profile_by_username")
save_user_profile = _ourspace_db_helpers.get("save_user_profile")
publish_profile = _ourspace_db_helpers.get("publish_profile")
add_friend = _ourspace_db_helpers.get("add_friend")
remove_friend = _ourspace_db_helpers.get("remove_friend")
get_friends = _ourspace_db_helpers.get("get_friends")
search_users = _ourspace_db_helpers.get("search_users")
reset_user_password = _ourspace_db_helpers.get("reset_user_password")
send_friend_request = _ourspace_db_helpers.get("send_friend_request")
get_pending_friend_requests = _ourspace_db_helpers.get("get_pending_friend_requests")
accept_friend_request = _ourspace_db_helpers.get("accept_friend_request")
reject_friend_request = _ourspace_db_helpers.get("reject_friend_request")
send_message = _ourspace_db_helpers.get("send_message")
get_inbox = _ourspace_db_helpers.get("get_inbox")
get_sent_messages = _ourspace_db_helpers.get("get_sent_messages")
mark_message_read = _ourspace_db_helpers.get("mark_message_read")
get_unread_count = _ourspace_db_helpers.get("get_unread_count")
delete_message = _ourspace_db_helpers.get("delete_message")
block_user = _ourspace_db_helpers.get("block_user")
unblock_user = _ourspace_db_helpers.get("unblock_user")
get_blocked_users = _ourspace_db_helpers.get("get_blocked_users")
is_blocked = _ourspace_db_helpers.get("is_blocked")
add_profile_comment = _ourspace_db_helpers.get("add_profile_comment")
get_profile_comments = _ourspace_db_helpers.get("get_profile_comments")
delete_profile_comment = _ourspace_db_helpers.get("delete_profile_comment")


@app.route("/api/ourspace/register", methods=["POST", "OPTIONS"])
def ourspace_register():
    """Register a new OurSpace user."""
    if request.method == "OPTIONS":
        return "", 204

    if create_user is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    # Validation
    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    # Check for valid username (alphanumeric and underscores only)
    import re
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return jsonify({"error": "Username can only contain letters, numbers, and underscores"}), 400

    # Get temp user_id before creating new user
    temp_user_id = session.get("user_id")

    # Create user
    user_id = create_user(username, password)

    if user_id is None:
        return jsonify({"error": "Username already exists"}), 409

    # Set session
    session["ourspace_user_id"] = user_id
    session["ourspace_username"] = username

    # Migrate temp media files if temp session existed
    url_mapping = {}
    if temp_user_id:
        url_mapping = _migrate_temp_media_on_login(temp_user_id, user_id)

    # If there's a temp profile with URLs that need updating, migrate it
    if url_mapping and temp_user_id:
        temp_profile_file = ourspace_DATA_DIR / f"temp_{temp_user_id}.json"
        if temp_profile_file.exists():
            try:
                with open(temp_profile_file, "r") as f:
                    temp_profile = json.load(f)

                # Update URLs in profile
                updated_profile = _update_profile_urls(temp_profile, url_mapping)
                updated_profile = _normalize_profile_data(updated_profile)

                # Save to authenticated user's database profile
                if save_user_profile:
                    save_user_profile(user_id, updated_profile)

                # Remove temp profile file
                temp_profile_file.unlink()
            except Exception as e:
                print(f"[OurSpace] Warning: Failed to migrate temp profile on register: {e}")

    return jsonify({
        "success": True,
        "user_id": user_id,
        "username": username
    })


def _migrate_temp_media_on_login(temp_user_id, authenticated_user_id):
    """Migrate media files from temp directory to authenticated user directory and return URL mapping."""
    import shutil
    import re

    temp_dir = ourspace_DATA_DIR / f"temp_{temp_user_id}"
    auth_dir = ourspace_DATA_DIR / str(authenticated_user_id)

    if not temp_dir.exists():
        return {}

    # Create authenticated user directory if it doesn't exist
    auth_dir.mkdir(exist_ok=True)

    url_mapping = {}

    # Move all files from temp directory to authenticated directory
    for file_path in temp_dir.iterdir():
        if file_path.is_file():
            old_filename = file_path.name
            new_path = auth_dir / old_filename

            # If file already exists, generate unique name
            counter = 1
            while new_path.exists():
                stem = file_path.stem
                ext = file_path.suffix
                new_path = auth_dir / f"{stem}_{counter}{ext}"
                counter += 1

            # Move file
            shutil.move(str(file_path), str(new_path))

            # Record URL mapping
            old_url = f"/api/ourspace/media/temp_{temp_user_id}/{old_filename}"
            new_url = f"/api/ourspace/media/{authenticated_user_id}/{new_path.name}"
            url_mapping[old_url] = new_url

    # Remove empty temp directory
    try:
        temp_dir.rmdir()
    except:
        pass

    return url_mapping


def _update_profile_urls(profile_data, url_mapping):
    """Recursively update all URLs in profile data using url_mapping."""
    if not url_mapping:
        return profile_data

    import json

    # Convert to JSON string to do simple find/replace
    profile_json = json.dumps(profile_data)

    for old_url, new_url in url_mapping.items():
        profile_json = profile_json.replace(old_url, new_url)

    return json.loads(profile_json)


def _normalize_profile_data(profile_data):
    """Ensure newly added profile features exist before persisting or returning data."""
    if not isinstance(profile_data, dict):
        return profile_data

    def _safe_int(value, fallback):
        try:
            return int(value)
        except (TypeError, ValueError):
            return fallback

    theme = profile_data.setdefault("theme", {})
    tweaks_defaults = {
        "radius": 10,
        "border": 3,
        "blur": 0,
        "glowColor": "#00ffff",
        "glowStrength": 20,
    }
    tweaks = theme.get("tweaks") or {}
    theme["tweaks"] = {**tweaks_defaults, **tweaks}

    fonts = theme.setdefault("fonts", {})
    fonts.setdefault("effects", {}).setdefault("glowColor", "#ffffff")
    fonts["effects"].setdefault("shadow", False)
    fonts["effects"].setdefault("glow", False)

    background = theme.setdefault("background", {})
    background.setdefault("type", "pattern")
    background.setdefault("pattern", "hearts")
    background.setdefault("image", "")
    background.setdefault("repeat", "repeat")
    background.setdefault("attachment", "fixed")
    background.setdefault("gradient", "")
    background.setdefault("size", "auto")
    background.setdefault("customSize", 100)
    background.setdefault("position", "center")
    background.setdefault(
        "transform",
        {"scale": 1, "rotate": 0, "skewX": 0, "skewY": 0, "flipX": False, "flipY": False},
    )
    background.setdefault(
        "filter",
        {
            "blur": 0,
            "brightness": 100,
            "contrast": 100,
            "saturate": 100,
            "hueRotate": 0,
            "invert": 0,
            "sepia": 0,
            "grayscale": 0,
        },
    )
    background.setdefault("blend", {"mode": "normal", "opacity": 100})

    theme.setdefault("effects", theme.get("effects", {}))

    widgets = profile_data.setdefault("widgets", {})
    top_friends = widgets.setdefault("topFriends", {})
    slots = max(1, _safe_int(top_friends.get("slots", 8), 8))
    columns = max(1, _safe_int(top_friends.get("columns", 4), 4))
    top_friends["slots"] = slots
    top_friends["columns"] = columns
    top_friends.setdefault("rows", max(1, (slots + columns - 1) // columns))
    top_friends.setdefault("friends", top_friends.get("friends", []))
    widgets.setdefault("customWidgets", widgets.get("customWidgets", []))

    profile_data.setdefault("sceneDeck", profile_data.get("sceneDeck", []))
    visibility_defaults = {
        "aboutMe": True,
        "interests": True,
        "customHtml": True,
        "customWidgets": True,
        "music": True,
        "pictureWall": True,
        "comments": True,
        "topFriends": True,
        "stats": True,
        "contact": True,
    }
    visibility = profile_data.get("widgetsVisibility")
    if not isinstance(visibility, dict):
        visibility = {}
    for key, default in visibility_defaults.items():
        value = visibility.get(key)
        visibility[key] = bool(default) if value is None else bool(value)
    profile_data["widgetsVisibility"] = visibility
    layout = profile_data.setdefault("layout", {})
    layout.setdefault("preset", layout.get("preset", "classic"))
    layout.setdefault("mobilePreset", layout.get("mobilePreset", "phone-stack"))
    layout.setdefault("grid", layout.get("grid", []))
    return profile_data


@app.route("/api/ourspace/login", methods=["POST", "OPTIONS"])
def ourspace_login():
    """Login to OurSpace."""
    if request.method == "OPTIONS":
        return "", 204

    if authenticate_user is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    # Authenticate
    user = authenticate_user(username, password)

    if user is None:
        return jsonify({"error": "Invalid username or password"}), 401

    # Get temp user_id before setting authenticated session
    temp_user_id = session.get("user_id")

    # Set session
    session["ourspace_user_id"] = user["id"]
    session["ourspace_username"] = user["username"]

    # Migrate temp media files if temp session existed
    url_mapping = {}
    if temp_user_id:
        url_mapping = _migrate_temp_media_on_login(temp_user_id, user["id"])

    # If there's a temp profile with URLs that need updating, migrate it
    if url_mapping and temp_user_id:
        temp_profile_file = ourspace_DATA_DIR / f"temp_{temp_user_id}.json"
        if temp_profile_file.exists():
            try:
                with open(temp_profile_file, "r") as f:
                    temp_profile = json.load(f)

                # Update URLs in profile
                updated_profile = _update_profile_urls(temp_profile, url_mapping)
                updated_profile = _normalize_profile_data(updated_profile)

                # Save to authenticated user's database profile
                if save_user_profile:
                    save_user_profile(user["id"], updated_profile)

                # Remove temp profile file
                temp_profile_file.unlink()
            except Exception as e:
                print(f"[OurSpace] Warning: Failed to migrate temp profile: {e}")

    return jsonify({
        "success": True,
        "user_id": user["id"],
        "username": user["username"],
        "profile_published": user["profile_published"]
    })


@app.route("/api/ourspace/logout", methods=["POST", "OPTIONS"])
def ourspace_logout():
    """Logout from OurSpace."""
    if request.method == "OPTIONS":
        return "", 204

    session.pop("ourspace_user_id", None)
    session.pop("ourspace_username", None)

    return jsonify({"success": True})


@app.route("/api/ourspace/change-username", methods=["POST", "OPTIONS"])
def ourspace_change_username():
    """Change username for authenticated user."""
    if request.method == "OPTIONS":
        return "", 204

    # Check authentication
    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401

    data = request.get_json()
    new_username = data.get("new_username", "").strip().lower()

    # Validate new username
    if not new_username:
        return jsonify({"success": False, "error": "Username is required"}), 400

    if len(new_username) < 3:
        return jsonify({"success": False, "error": "Username must be at least 3 characters"}), 400

    if len(new_username) > 20:
        return jsonify({"success": False, "error": "Username must be no more than 20 characters"}), 400

    if not re.match(r"^[a-z0-9_]+$", new_username):
        return jsonify({"success": False, "error": "Username can only contain lowercase letters, numbers, and underscores"}), 400

    # Check if database is available
    if not _ourspace_db_helpers:
        return jsonify({"success": False, "error": "Database not available"}), 500

    get_user = _ourspace_db_helpers.get("get_user")
    update_username = _ourspace_db_helpers.get("update_username")

    if not get_user or not update_username:
        return jsonify({"success": False, "error": "Database functions not available"}), 500

    # Check if new username is already taken
    existing_user = get_user(new_username)
    if existing_user and existing_user["id"] != user_id:
        return jsonify({"success": False, "error": "Username is already taken"}), 409

    # Get current user
    current_user = get_user(user_id=user_id)
    if not current_user:
        return jsonify({"success": False, "error": "User not found"}), 404

    old_username = current_user["username"]

    # Check if username is actually changing
    if new_username == old_username.lower():
        return jsonify({"success": False, "error": "New username is the same as current username"}), 400

    try:
        # Update username in database
        success = update_username(user_id, new_username)

        if not success:
            return jsonify({"success": False, "error": "Failed to update username"}), 500

        # Update session
        session["ourspace_username"] = new_username

        return jsonify({
            "success": True,
            "old_username": old_username,
            "new_username": new_username
        })

    except Exception as e:
        print(f"[OurSpace] Error changing username: {e}")
        return jsonify({"success": False, "error": "Internal server error"}), 500


@app.route("/api/ourspace/health", methods=["GET", "OPTIONS"])
def ourspace_health():
    """Check database and server health."""
    if request.method == "OPTIONS":
        return "", 204

    db_available = False
    db_error = None

    try:
        # Try to check if database helper is available
        if _ourspace_db_helpers and "check_db" in _ourspace_db_helpers:
            check_db = _ourspace_db_helpers["check_db"]
            db_available = check_db()
        else:
            # Fallback: check if DB_PATH exists
            from pathlib import Path
            db_path = Path(__file__).parent / "ourspace_data" / "ourspace.db"
            db_available = db_path.exists()
    except Exception as e:
        db_error = str(e)
        db_available = False

    return jsonify({
        "status": "ok" if db_available else "degraded",
        "database_available": db_available,
        "database_error": db_error
    })


@app.route("/api/ourspace/me", methods=["GET", "OPTIONS"])
def ourspace_me():
    """Get current user info."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    username = session.get("ourspace_username")

    if not user_id:
        return jsonify({"authenticated": False})

    return jsonify({
        "authenticated": True,
        "user_id": user_id,
        "username": username
    })


@app.route("/api/ourspace/profile/load", methods=["GET", "OPTIONS"])
def ourspace_load_profile():
    """Load user's own profile."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")

    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_user_profile is None:
        return jsonify({"error": "Database not available"}), 500

    profile = get_user_profile(user_id)

    if profile is None:
        return jsonify({"error": "Profile not found"}), 404

    return jsonify(_normalize_profile_data(profile["data"]))


@app.route("/api/ourspace/profile/save", methods=["POST", "OPTIONS"])
def ourspace_save_profile():
    """Save user's profile (does not publish)."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")

    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if save_user_profile is None:
        return jsonify({"error": "Database not available"}), 500

    profile_data = request.get_json()
    profile_data = _normalize_profile_data(profile_data)

    success = save_user_profile(user_id, profile_data)

    if not success:
        return jsonify({"error": "Failed to save profile"}), 500

    return jsonify({"success": True})


@app.route("/api/ourspace/profile/publish", methods=["POST", "OPTIONS"])
def ourspace_publish_profile():
    """Publish user's profile to make it visible to others."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")

    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if publish_profile is None:
        return jsonify({"error": "Database not available"}), 500

    success = publish_profile(user_id)

    if not success:
        return jsonify({"error": "Failed to publish profile"}), 500

    return jsonify({"success": True})


@app.route("/api/ourspace/profile/<username>", methods=["GET", "OPTIONS"])
def ourspace_view_profile(username: str):
    """View another user's published profile."""
    if request.method == "OPTIONS":
        return "", 204

    if get_user_profile_by_username is None:
        return jsonify({"error": "Database not available"}), 500

    profile = get_user_profile_by_username(username)

    if profile is None:
        return jsonify({"error": "User not found"}), 404

    if not profile["published"]:
        return jsonify({"error": "Profile not published"}), 403

    return jsonify({
        "username": profile["username"],
        "data": _normalize_profile_data(profile["data"]),
        "visits": profile["visits"]
    })


@app.route("/api/ourspace/friends", methods=["GET", "OPTIONS"])
def ourspace_get_friends():
    """Get user's friends list."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")

    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_friends is None:
        return jsonify({"error": "Database not available"}), 500

    friends = get_friends(user_id)

    return jsonify({"friends": friends})


@app.route("/api/ourspace/friends/add", methods=["POST", "OPTIONS"])
def ourspace_add_friend():
    """Add a friend."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")

    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if add_friend is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    friend_id = data.get("friend_id")

    if not friend_id:
        return jsonify({"error": "Friend ID required"}), 400

    success = add_friend(user_id, friend_id)

    if not success:
        return jsonify({"error": "Failed to add friend"}), 500

    return jsonify({"success": True})


@app.route("/api/ourspace/friends/remove", methods=["POST", "OPTIONS"])
def ourspace_remove_friend():
    """Remove a friend."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")

    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if remove_friend is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    friend_id = data.get("friend_id")
    friend_username = data.get("username", "")

    if not friend_id and friend_username and get_user is not None:
        friend = get_user(username=friend_username)
        if friend:
            friend_id = friend["id"]

    if not friend_id:
        return jsonify({"error": "Friend ID required"}), 400

    success = remove_friend(user_id, int(friend_id))

    if not success:
        return jsonify({"error": "Failed to remove friend"}), 500

    return jsonify({"success": True})


@app.route("/api/ourspace/search", methods=["GET", "OPTIONS"])
def ourspace_search_users():
    """Search for users."""
    if request.method == "OPTIONS":
        return "", 204

    if search_users is None:
        return jsonify({"error": "Database not available"}), 500

    query = request.args.get("q", "")

    if not query:
        return jsonify({"users": []})

    users = search_users(query)

    return jsonify({"users": users})


@app.route("/api/ourspace/users", methods=["GET", "OPTIONS"])
def ourspace_list_users():
    """List published users (optionally filtered by query)."""
    if request.method == "OPTIONS":
        return "", 204

    if search_users is None:
        return jsonify({"error": "Database not available"}), 500

    query = request.args.get("q", "").strip()

    try:
        limit = int(request.args.get("limit", 60))
    except (TypeError, ValueError):
        limit = 60
    limit = max(1, min(limit, 200))

    users = search_users(query, limit=limit)
    return jsonify({"users": users})


# Friend Request Endpoints

@app.route("/api/ourspace/friends/request/send", methods=["POST", "OPTIONS"])
def ourspace_send_friend_request():
    """Send a friend request."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if send_friend_request is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    to_username = data.get("username", "").strip()

    if not to_username:
        return jsonify({"error": "Username required"}), 400

    success = send_friend_request(user_id, to_username)

    if not success:
        return jsonify({"error": "Failed to send friend request. User may not exist, is blocked, or request already sent."}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/friends/requests", methods=["GET", "OPTIONS"])
def ourspace_get_friend_requests():
    """Get pending friend requests."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_pending_friend_requests is None:
        return jsonify({"error": "Database not available"}), 500

    requests = get_pending_friend_requests(user_id)

    return jsonify({"requests": requests})


@app.route("/api/ourspace/friends/request/accept", methods=["POST", "OPTIONS"])
def ourspace_accept_friend_request():
    """Accept a friend request."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if accept_friend_request is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    request_id = data.get("request_id")

    if not request_id:
        return jsonify({"error": "Request ID required"}), 400

    success = accept_friend_request(request_id, user_id)

    if not success:
        return jsonify({"error": "Failed to accept friend request"}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/friends/request/reject", methods=["POST", "OPTIONS"])
def ourspace_reject_friend_request():
    """Reject a friend request."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if reject_friend_request is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    request_id = data.get("request_id")

    if not request_id:
        return jsonify({"error": "Request ID required"}), 400

    success = reject_friend_request(request_id, user_id)

    if not success:
        return jsonify({"error": "Failed to reject friend request"}), 400

    return jsonify({"success": True})


# Message Endpoints

@app.route("/api/ourspace/messages/send", methods=["POST", "OPTIONS"])
def ourspace_send_message():
    """Send a message to another user."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if send_message is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    to_username = data.get("to_username", "").strip()
    subject = data.get("subject", "").strip()
    body = data.get("body", "").strip()

    if not to_username or not subject or not body:
        return jsonify({"error": "Username, subject, and body required"}), 400

    success = send_message(user_id, to_username, subject, body)

    if not success:
        return jsonify({"error": "Failed to send message. User may not exist or has blocked you."}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/messages/inbox", methods=["GET", "OPTIONS"])
def ourspace_get_inbox():
    """Get inbox messages."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_inbox is None:
        return jsonify({"error": "Database not available"}), 500

    messages = get_inbox(user_id)

    return jsonify({"messages": messages})


@app.route("/api/ourspace/messages/sent", methods=["GET", "OPTIONS"])
def ourspace_get_sent():
    """Get sent messages."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_sent_messages is None:
        return jsonify({"error": "Database not available"}), 500

    messages = get_sent_messages(user_id)

    return jsonify({"messages": messages})


@app.route("/api/ourspace/messages/read", methods=["POST", "OPTIONS"])
def ourspace_mark_read():
    """Mark a message as read."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if mark_message_read is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    message_id = data.get("message_id")

    if not message_id:
        return jsonify({"error": "Message ID required"}), 400

    success = mark_message_read(message_id, user_id)

    if not success:
        return jsonify({"error": "Failed to mark message as read"}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/messages/unread-count", methods=["GET", "OPTIONS"])
def ourspace_unread_count():
    """Get unread message count."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_unread_count is None:
        return jsonify({"error": "Database not available"}), 500

    count = get_unread_count(user_id)

    return jsonify({"count": count})


@app.route("/api/ourspace/messages/delete", methods=["POST", "OPTIONS"])
def ourspace_delete_message():
    """Delete a message."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if delete_message is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    message_id = data.get("message_id")

    if not message_id:
        return jsonify({"error": "Message ID required"}), 400

    success = delete_message(message_id, user_id)

    if not success:
        return jsonify({"error": "Failed to delete message"}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/comments/<username>", methods=["GET", "POST", "OPTIONS"])
def ourspace_profile_comments(username: str):
    """Fetch or post profile comments for a given username."""
    if request.method == "OPTIONS":
        return "", 204

    username = (username or "").strip()
    if not username:
        return jsonify({"error": "Username required"}), 400

    if request.method == "GET":
        if get_profile_comments is None:
            return jsonify({"error": "Database not available"}), 500

        comments = get_profile_comments(username)
        return jsonify({"comments": comments})

    if add_profile_comment is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json() or {}
    author = (data.get("author") or "").strip()
    text = (data.get("text") or "").strip()

    if not author or not text:
        return jsonify({"error": "Author and comment text are required"}), 400

    if len(author) > 60:
        return jsonify({"error": "Author name too long"}), 400

    if len(text) > 1000:
        return jsonify({"error": "Comment too long"}), 400

    success = add_profile_comment(username, author, text)
    if not success:
        return jsonify({"error": "Unable to post comment"}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/comments/<int:comment_id>/delete", methods=["POST", "OPTIONS"])
def ourspace_delete_profile_comment(comment_id: int):
    """Delete a profile comment (profile owner only)."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if delete_profile_comment is None:
        return jsonify({"error": "Database not available"}), 500

    success = delete_profile_comment(user_id, comment_id)
    if not success:
        return jsonify({"error": "Failed to delete comment"}), 400

    return jsonify({"success": True})


# Blocking Endpoints

@app.route("/api/ourspace/block", methods=["POST", "OPTIONS"])
def ourspace_block_user():
    """Block a user."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if block_user is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    block_username = data.get("username", "").strip()

    if not block_username:
        return jsonify({"error": "Username required"}), 400

    success = block_user(user_id, block_username)

    if not success:
        return jsonify({"error": "Failed to block user"}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/unblock", methods=["POST", "OPTIONS"])
def ourspace_unblock_user():
    """Unblock a user."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if unblock_user is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    unblock_username = data.get("username", "").strip()

    if not unblock_username:
        return jsonify({"error": "Username required"}), 400

    success = unblock_user(user_id, unblock_username)

    if not success:
        return jsonify({"error": "Failed to unblock user"}), 400

    return jsonify({"success": True})


@app.route("/api/ourspace/blocked", methods=["GET", "OPTIONS"])
def ourspace_get_blocked():
    """Get blocked users list."""
    if request.method == "OPTIONS":
        return "", 204

    user_id = session.get("ourspace_user_id")
    if not user_id:
        return jsonify({"error": "Not authenticated"}), 401

    if get_blocked_users is None:
        return jsonify({"error": "Database not available"}), 500

    blocked = get_blocked_users(user_id)

    return jsonify({"blocked": blocked})


@app.route("/api/ourspace/reset-password", methods=["POST", "OPTIONS"])
def ourspace_reset_password():
    """Reset user password with admin password verification."""
    if request.method == "OPTIONS":
        return "", 204

    if reset_user_password is None:
        return jsonify({"error": "Database not available"}), 500

    data = request.get_json()
    username = data.get("username", "").strip()
    admin_password = data.get("admin_password", "")
    new_password = data.get("new_password", "")

    # Validation
    if not username or not admin_password or not new_password:
        return jsonify({"error": "Username, admin password, and new password are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    # Attempt password reset
    success = reset_user_password(username, new_password, admin_password)

    if not success:
        return jsonify({"error": "Password reset failed. Check username and admin password."}), 401

    return jsonify({"success": True, "message": "Password reset successfully"})


@app.route("/Study/<path:study_path>")
@app.route("/study/<path:study_path>")
def serve_study_asset(study_path: str):
    target = (STUDY_DIR / study_path).resolve()
    try:
        target.relative_to(STUDY_DIR)
    except ValueError:
        abort(404)
    if target.is_file():
        return _send_cached_file(target)
    abort(404)


@app.route("/<path:asset_path>")
def serve_frontend_asset(asset_path: str):
    if asset_path.startswith(("api/", "media/", "data/")):
        abort(404)
    target = (FRONTEND_DIR / asset_path).resolve()
    try:
        target.relative_to(FRONTEND_DIR)
    except ValueError:
        abort(404)
    if target.is_dir():
        index_path = target / "index.html"
        if index_path.is_file():
            return _send_cached_file(index_path, treat_as_html=True)
    if target.is_file():
        return _send_cached_file(target)
    abort(404)


# ============================================================================
# Image Optimization Cache Management API
# ============================================================================

@app.route("/api/image-cache/stats", methods=["GET"])
def image_cache_stats():
    """Get image optimization cache statistics."""
    if ImageOptimizer is None:
        return jsonify({"error": "Image optimizer not available"}), 503
    optimizer = ImageOptimizer(UPLOAD_FOLDER)
    stats = optimizer.get_cache_stats()
    return jsonify(stats)


@app.route("/api/image-cache/clear", methods=["POST"])
def image_cache_clear():
    """Clear image optimization cache."""
    if ImageOptimizer is None:
        return jsonify({"error": "Image optimizer not available"}), 503
    optimizer = ImageOptimizer(UPLOAD_FOLDER)

    older_than_days = request.args.get('older_than_days', type=int)
    optimizer.clear_cache(older_than_days=older_than_days)

    return jsonify({"success": True, "message": "Cache cleared"})


@app.route("/api/image-cache/batch-optimize", methods=["POST"])
def image_cache_batch_optimize():
    """
    Batch optimize all images in uploads folder.
    Pre-generates WebP and AVIF variants for faster first access.
    """
    import time

    if ImageOptimizer is None:
        return jsonify({"error": "Image optimizer not available"}), 503

    optimizer = ImageOptimizer(UPLOAD_FOLDER)

    # Get all image files
    image_files = []
    for ext in optimizer.IMAGE_FORMATS:
        image_files.extend(UPLOAD_FOLDER.rglob(f'*{ext}'))

    optimized_count = 0
    failed_count = 0
    start_time = time.time()

    for img_path in image_files:
        # Skip files in the cache folder
        if optimizer.cache_folder in img_path.parents:
            continue

        try:
            # Get relative path
            rel_path = img_path.relative_to(UPLOAD_FOLDER)

            # Pre-generate WebP variant
            optimizer.get_optimized_image(
                str(rel_path),
                accept_header='image/webp',
                max_width=None,
                max_height=None
            )

            # Pre-generate AVIF variant
            optimizer.get_optimized_image(
                str(rel_path),
                accept_header='image/avif',
                max_width=None,
                max_height=None
            )

            optimized_count += 1

        except Exception as e:
            print(f"[BatchOptimize] Failed to optimize {img_path}: {e}")
            failed_count += 1

    elapsed_time = time.time() - start_time

    return jsonify({
        "success": True,
        "total_files": len(image_files),
        "optimized": optimized_count,
        "failed": failed_count,
        "elapsed_seconds": round(elapsed_time, 2)
    })


if __name__ == "__main__":
    # Initialize OurSpace database
    init_ourspace_db = _ourspace_db_helpers.get("init_db")
    if init_ourspace_db:
        try:
            init_ourspace_db()
            print("[OurSpace] Database initialized successfully")
        except Exception as e:
            print(f"[OurSpace] Database initialization warning: {e}")

    app.run(debug=True, port=4000)






