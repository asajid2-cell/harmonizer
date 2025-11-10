"""
CLI utility to render audio snippets for logged jump events.

Usage:
    python -m backend.rl.generate_snippets --limit 5 --pre 2.0 --post 3.0
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path
from typing import Optional

from . import db

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOAD_FOLDER = BACKEND_DIR / "uploads"


def _find_audio_file(track_id: str) -> Optional[Path]:
    if not track_id:
        return None
    matches = list(UPLOAD_FOLDER.glob(f"{track_id}.*"))
    if matches:
        return matches[0]
    return None


def render_snippet(
    event: dict,
    *,
    pre_seconds: float,
    post_seconds: float,
    dry_run: bool = False,
) -> bool:
    track_id = event.get("track_id")
    audio_file = _find_audio_file(track_id)
    if not audio_file:
        db.mark_snippet_failed(event["id"], "audio file missing")
        return False

    target_time = event.get("target_time")
    if target_time is None:
        db.mark_snippet_failed(event["id"], "missing target_time")
        return False

    start_time = max(0.0, float(target_time) - pre_seconds)
    duration = pre_seconds + post_seconds

    snippet_filename = f"{track_id}_{event['id']}.wav"
    snippet_path = db.SNIPPET_DIR / snippet_filename

    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_time:.2f}",
        "-i",
        str(audio_file),
        "-t",
        f"{duration:.2f}",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "2",
        str(snippet_path),
    ]
    if dry_run:
        print("DRY RUN:", " ".join(cmd))
        return True
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        db.mark_snippet_generated(event["id"], snippet_path=str(snippet_path))
        return True
    except subprocess.CalledProcessError as exc:
        db.mark_snippet_failed(event["id"], f"ffmpeg error: {exc}")
        return False


def process_pending(limit: int, pre: float, post: float, dry_run: bool = False) -> int:
    events = db.fetch_pending_events(limit=limit)
    if not events:
        return 0
    processed = 0
    for row in events:
        event = dict(row)
        print(
            f"[snippets] Rendering event #{event['id']} (track={event['track_id']} mode={event['mode']})"
        )
        success = render_snippet(
            event, pre_seconds=pre, post_seconds=post, dry_run=dry_run
        )
        if success:
            processed += 1
            print("  -> success")
        else:
            print("  -> failed")
    return processed


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate RL snippets")
    parser.add_argument("--limit", type=int, default=5, help="events to process")
    parser.add_argument("--pre", type=float, default=2.0, help="seconds before jump")
    parser.add_argument("--post", type=float, default=3.0, help="seconds after jump")
    parser.add_argument("--dry-run", action="store_true", help="print commands only")
    args = parser.parse_args()

    processed = process_pending(
        limit=args.limit, pre=args.pre, post=args.post, dry_run=args.dry_run
    )
    if processed == 0:
        print("No pending events.")


if __name__ == "__main__":
    main()
