#!/usr/bin/env python3
"""Acquire license-verified real-world parity fixtures and transcode with ffmpeg.

The source metadata below is deliberately pinned.  Each URL and CC0 field was
verified from the Openverse API before its audio is downloaded.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = ROOT / "fixtures" / "audio"
USER_AGENT = "ios-parity-fixture-builder/1.0 (educational fixture corpus)"
TRACKS = {
    "real_pop": {
        "genre": "pop/rock-ish commercial song",
        "title": "Free Commercial Song",
        "source": "https://cdn.freesound.org/previews/660/660452_13228046-hq.mp3",
        "landing": "https://freesound.org/people/Seth_Makes_Sounds/sounds/660452",
        "api": "https://api.openverse.org/v1/audio/?q=rock%20music&license=cc0&page_size=20",
        "duration_ms": 227077,
        "limit_seconds": 180,
    },
    "real_acoustic": {
        "genre": "acoustic solo koto improvisation",
        "title": "sigil-mgReel-harmonics.wav",
        "source": "https://cdn.freesound.org/previews/440/440135_7700251-hq.mp3",
        "landing": "https://freesound.org/people/makenoisemusic/sounds/440135",
        "api": "https://api.openverse.org/v1/audio/?q=acoustic%20guitar%20music&license=cc0&page_size=20",
        "duration_ms": 162000,
    },
    "real_electronic": {
        "genre": "electronic modular music with drums",
        "title": "Electronic Minute No 117 - Electronic Music Chapter 4 (Modular Version with drums).wav",
        "source": "https://cdn.freesound.org/previews/432/432664_1391542-hq.mp3",
        "landing": "https://freesound.org/people/gis_sweden/sounds/432664",
        "api": "https://api.openverse.org/v1/audio/?q=electronic%20music&license=cc0&page_size=20",
        "duration_ms": 168156,
    },
}


def fetch(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=90) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def verify(track: dict[str, object]) -> None:
    """Confirm the exact direct URL is a CC0 item in the authoritative API reply."""
    request = urllib.request.Request(str(track["api"]), headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    matched = [item for item in payload["results"] if item.get("url") == track["source"]]
    if not matched or matched[0].get("license") != "cc0" or matched[0].get("license_version") != "1.0":
        raise RuntimeError(f"Openverse did not verify CC0 for {track['title']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--only", nargs="+", choices=sorted(TRACKS))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for index, fixture_id in enumerate(args.only or TRACKS):
        track = TRACKS[fixture_id]
        if index:
            time.sleep(2)
        verify(track)
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / "source.mp3"
            fetch(str(track["source"]), source)
            command = [
                "ffmpeg", "-y", "-v", "error", "-i", str(source), "-af", "lowpass=f=5000",
                "-ac", "1", "-ar", "22050",
            ]
            if "limit_seconds" in track:
                command.extend(("-t", str(track["limit_seconds"])))
            command.extend(("-c:a", "flac", "-sample_fmt", "s16", "-compression_level", "12", str(args.out / f"{fixture_id}.flac")))
            subprocess.run(command, check=True)


if __name__ == "__main__":
    main()
