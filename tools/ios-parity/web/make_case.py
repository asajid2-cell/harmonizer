#!/usr/bin/env python3
"""Assemble one ITEM B render case from the committed parity fixtures.

A case is everything the browser needs to render the *same* thing the app renders:

* the source PCM, decoded exactly as ``ref_mix.py`` decodes it (soundfile float32, mono
  repeated to stereo) and interleaved L,R so the page can build the AudioBuffer without a
  decoder - the comparison is about the render graph, not the decoder, and P4 already pins
  the decoder bit-exact;
* the beat metadata (``profiles/<fixture>.json`` ``analysis.beats``);
* the recorded decision trace (``traces/<fixture>/<trace>.jsonl``), optionally with the
  overlay voices stripped (for the single-voice / jukebox case, whose committed golden was
  generated from a trace that still carried an overlay - see the report);
* the mode and voice count the real ``getPlayer()`` must instantiate.

The output frame count is computed with the *same* boundary rule ``ref_mix.py`` uses
(``js_round`` of the accumulated delays, clipped to ``--seconds``), so the browser and the
oracle stop on the same frame.
"""
from __future__ import annotations

import argparse
import base64
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "fixtures"


def js_round(value: float) -> int:
    return int(math.floor(value + 0.5))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", default="real_acoustic")
    parser.add_argument("--trace", required=True, help="trace file name under traces/<fixture>/")
    parser.add_argument("--mode", required=True, help="window.mode for the player")
    parser.add_argument("--voice-count", type=int, required=True, help="window.canonVoiceCount")
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--strip-voices", action="store_true",
                        help="drop the trace's overlay voices (single-voice render)")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    audio_path = FIXTURES / "audio" / f"{args.fixture}.flac"
    profile_path = FIXTURES / "profiles" / f"{args.fixture}.json"
    trace_path = FIXTURES / "traces" / args.fixture / args.trace

    source, sr = sf.read(str(audio_path), dtype="float32", always_2d=True)
    if source.shape[1] == 1:
        source = np.repeat(source, 2, axis=1)
    elif source.shape[1] != 2:
        raise SystemExit("input PCM must be mono or stereo")
    frames = source.shape[0]

    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    track = profile.get("response", {}).get("track") or profile.get("track") or profile
    beats = [{"start": float(b["start"]), "duration": float(b["duration"])}
             for b in track["analysis"]["beats"]]

    trace = []
    for line in trace_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            row = json.loads(line)
            if args.strip_voices:
                row["voices"] = []
            trace.append(row)

    accumulated = 0.0
    for row in trace:
        accumulated += float(row.get("delay", 0))
    out_frames = js_round(accumulated * sr)
    if args.seconds is not None:
        out_frames = min(out_frames, js_round(args.seconds * sr))

    interleaved = source.astype("<f4", copy=False).tobytes(order="C")
    case = {
        "fixture": args.fixture,
        "trace_name": args.trace,
        "mode": args.mode,
        "voice_count": args.voice_count,
        "sample_rate": int(sr),
        "frames": int(frames),
        "out_frames": int(out_frames),
        "seconds": args.seconds,
        "beats": beats,
        "trace": trace,
        "pcm_b64": base64.b64encode(interleaved).decode("ascii"),
    }
    args.out.write_text(json.dumps(case) + "\n", encoding="utf-8", newline="\n")
    print(f"case: {args.fixture}/{args.trace} mode={args.mode} voices={args.voice_count} "
          f"sr={sr} frames={frames} out_frames={out_frames} ticks={len(trace)} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
