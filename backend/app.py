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
    url_for,
)
from werkzeug.utils import secure_filename

try:
    from yt_dlp import YoutubeDL  # type: ignore
except ImportError:  # pragma: no cover
    YoutubeDL = None  # type: ignore

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

    # Use web_embedded, web, tv clients to avoid needing cookies/PO tokens
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,  # Don't download, just get metadata
        "extractor_args": {"youtube": {"player_client": ["web_embedded", "web", "tv"]}},
    }

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


def _download_youtube(url: str, track_id: str) -> tuple[Path, Optional[dict]]:
    if YoutubeDL is None:
        raise RuntimeError("yt-dlp is not installed. Run `pip install yt-dlp`.")

    ffmpeg_dir = locate_ffmpeg_bin()
    if ffmpeg_dir is None:
        raise RuntimeError(
            "FFmpeg binaries not found. Install FFmpeg or set FFMPEG_LOCATION to the bin directory."
        )

    output_template = str(UPLOAD_FOLDER / f"{track_id}.%(ext)s")

    # Try multiple client configurations to avoid 403
    # Using web_embedded, web, tv clients avoids needing PO tokens or cookies
    retry_configs = [
        # First attempt: web_embedded, web, tv clients (most reliable, no cookies needed)
        {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extractor_args": {"youtube": {"player_client": ["web_embedded", "web", "tv"]}},
        },
        # Second attempt: Just web_embedded and tv
        {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "extractor_args": {"youtube": {"player_client": ["web_embedded", "tv"]}},
        },
        # Third attempt: Use cookies from Chrome as fallback
        {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "cookiesfrombrowser": ("chrome",),
        },
        # Fourth attempt: Use cookies from Edge as fallback
        {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "cookiesfrombrowser": ("edge",),
        },
        # Fifth attempt: Default without cookies
        {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "source_address": "0.0.0.0",
        },
    ]

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

            print(f"[YouTube Download] Attempt {attempt}/{len(retry_configs)}")

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
                print(f"[YouTube Download] Attempt {attempt} skipped: Cookie access failed (browser may be open)")
            else:
                print(f"[YouTube Download] Attempt {attempt} failed: {error_msg[:200]}")

            # If this isn't the last attempt, continue to next config
            if attempt < len(retry_configs):
                continue

    # All attempts failed - raise error
    raise RuntimeError(
        f"Failed to download video after {len(retry_configs)} attempts. "
        f"YouTube may be blocking requests. Try closing your browsers and retry. "
        f"Last error: {last_error[:200] if last_error else 'Unknown'}"
    )


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
            audio_path, info = _download_youtube(url, track_id)
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
