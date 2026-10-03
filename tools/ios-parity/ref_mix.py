#!/usr/bin/env python3
"""Render the native player subset from a recorded decision trace.

This is a sample-level oracle for the C parity kernel, not a general Web Audio
emulator.  Tests run with ``declickMs = 0``: the application's 3 ms declick
crossfade is deliberately excluded.  Crooner processing, vinyl noise,
convolver, compressor, and waveshaper are also excluded.

Implemented source semantics
----------------------------
* ``getPlayer`` gives the main GainNode a gain of 0.85 (jremix.js:475-503,
  218), creates one independent source/read head for each overlay
  (jremix.js:505-570), and sets an overlay's immutable ``baseGain`` to
  ``overlayGain * Math.max(0.5, 1 / (1 + (numVoices - 2) * 0.15))``
  (jremix.js:553-558, where ``overlayGain`` is 0.65 at line 220).  This module
  applies that expression verbatim, with ``numVoices = 1 + len(voices)``.
* A start/restart invokes ``llPlay(buffer, beat.start, track.duration -
  beat.start, gain)`` (main: jremix.js:697-707; overlays: 824-852; llPlay:
  678-687).  Therefore a trace restart puts that voice's head at
  ``Math.round(beat.start * sampleRate)`` and it reads until end of source.
  This oracle implements JavaScript's non-negative Math.round, not Python's
  bankers' round.
* Heads otherwise remain continuous.  A rate change preserves the current
  head before setting the new rate (jremix.js:894-920).  Each output frame
  advances it by ``rate`` source frames.  Fractional positions are linearly
  interpolated as ``(1-f)*source[floor(pos)] + f*source[floor(pos)+1]``;
  rate 1 uses direct indexing, so it is an exact float32 identity.
* ``applyCanonAlignment`` selects overlay targets into ``q.others``
  (visualizer.js:2787-2941), but its calculated ``q.otherGain`` at
  2855-2878 is not consumed by playback.  The live restart explicitly uses
  ``voice.baseGain`` (jremix.js:844-852), which is what this oracle does.
* Overlay HP and panning are live, not vestigial: each overlay connects
  ``voiceGain -> voiceHp(250 Hz) -> voicePanner -> mixBus`` (jremix.js:
  505-550).  This oracle therefore implements the 250 Hz Web Audio high-pass
  with the node's default Q=1 and RBJ/Web-Audio cookbook coefficients, keeping
  its state per overlay, followed by the StereoPanner stereo equal-power matrix.
  Overlay pan values use the source's centred one-overlay and symmetric +/-0.7
  multi-overlay calculation (jremix.js:512-531).  Main panning is centred
  (490-502).  This assumes the live path supports the nodes, as the source
  does whenever ``createBiquadFilter``/``createStereoPanner`` are available.
  The open portability question is what behavior a target without either API
  should choose; the trace does not expose that capability.

Trace timing
------------
Tick 0 starts at output frame 0.  Tick k starts at the accumulated sum of
all preceding trace ``delay`` values, matching ``setTimeout(process,
1000*delay)``.  Delays are converted to frame boundaries with JavaScript-style
rounding.  A tick changes only heads marked restarted; targets changing while
a head is mid-beat do not move that head.  The last tick occupies its own
``delay`` interval.  Rendering stops at that accumulated end or ``--seconds``,
whichever comes first.

Beat metadata comes from ``--profile`` (``analysis.beats``), or otherwise
from the required sidecar ``<trace>.beats.json``, an array of objects with
``start`` and ``duration``.  ``--beat-start`` and ``--beat-duration`` are
accepted only as explicit constant-beat fallback for small diagnostics.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

MAIN_GAIN = 0.85
OVERLAY_GAIN = 0.65


def js_round(value: float) -> int:
    """Math.round for finite non-negative quantities used by this renderer."""
    return int(math.floor(value + 0.5))


def load_trace(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if line.strip():
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_number}: invalid JSON: {exc}") from exc
                if not isinstance(row, dict):
                    raise ValueError(f"{path}:{line_number}: trace entry must be an object")
                rows.append(row)
    if not rows:
        raise ValueError("trace has no ticks")
    if any(not isinstance(row.get("tick"), int) for row in rows):
        raise ValueError("every trace entry requires integer tick")
    if [row["tick"] for row in rows] != list(range(len(rows))):
        raise ValueError("trace ticks must be consecutive and start at 0")
    return rows


def load_beats(trace: Path, profile: Path | None, beat_start: float | None,
               beat_duration: float | None) -> list[dict[str, float]]:
    if profile:
        document = json.loads(profile.read_text(encoding="utf-8"))
        # dump_layers writes the servo envelope {response:{track:...}}; also accept a bare track.
        track = document.get("response", {}).get("track") or document.get("track") or document
        beats = track.get("analysis", {}).get("beats")
    else:
        sidecar = Path(str(trace) + ".beats.json")
        if sidecar.exists():
            beats = json.loads(sidecar.read_text(encoding="utf-8"))
        elif beat_start is not None and beat_duration is not None:
            # This diagnostic fallback only needs enough entries for validation below.
            beats = [{"start": beat_start, "duration": beat_duration}]
        else:
            raise ValueError(f"missing beat metadata: supply --profile or {sidecar}")
    if not isinstance(beats, list) or not beats:
        raise ValueError("beat metadata must be a non-empty beats array")
    normalized = []
    for index, beat in enumerate(beats):
        try:
            start, duration = float(beat["start"]), float(beat["duration"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"beat {index} needs numeric start and duration") from exc
        if not math.isfinite(start) or not math.isfinite(duration) or start < 0 or duration < 0:
            raise ValueError(f"beat {index} has invalid start/duration")
        normalized.append({"start": start, "duration": duration})
    return normalized


def source_frame(beat_index: int, beats: list[dict[str, float]], sr: int) -> int:
    if beat_index < 0 or beat_index >= len(beats):
        raise ValueError(f"beat index {beat_index} is outside 0..{len(beats) - 1}")
    return js_round(beats[beat_index]["start"] * sr)


def sample_at(source: np.ndarray, position: float) -> np.ndarray:
    """Return one source sample, silencing positions beyond BufferSource end."""
    if position < 0 or position >= len(source):
        return np.zeros(2, dtype=np.float32)
    base = int(math.floor(position))
    fraction = position - base
    if fraction == 0.0 or base + 1 >= len(source):
        return source[base]
    # Compute in float32 so identity is exact and non-identity is deterministic.
    return (source[base] * np.float32(1.0 - fraction) +
            source[base + 1] * np.float32(fraction)).astype(np.float32)


class HighPass250:
    """Per-channel Web Audio highpass on the overlay voices, at the node's default Q.

    Web Audio's *lowpass* and *highpass* biquads read `Q` as a resonance in **decibels**, not as a
    linear quality factor: the spec's Filters Characteristics defines
    ``alpha = sin(w0) / (2 * 10^(Q/20))`` for these two types (all other biquad types keep linear
    Q), and Blink implements the same conversion - ``Biquad::setHighpassParams`` does
    ``resonance = pow10(resonance / 20); alpha = sin(theta) / (2 * resonance)``. The overlay voice
    highpass never sets `Q`, so the node runs at its default `Q = 1` dB and the damping is
    ``sin(w0) / (2 * 10^(1/20))``. Reading that default linearly instead puts this filter up to
    1 dB away from the browser between 250 Hz and 400 Hz, so the convention is not a detail.
    """
    def __init__(self, sr: int) -> None:
        omega = 2.0 * math.pi * 250.0 / sr
        alpha = math.sin(omega) / (2.0 * 10.0 ** (1.0 / 20.0))
        cosine = math.cos(omega)
        a0 = 1.0 + alpha
        self.b0, self.b1, self.b2 = ((1.0 + cosine) / 2.0 / a0,
                                      -(1.0 + cosine) / a0,
                                      (1.0 + cosine) / 2.0 / a0)
        self.a1, self.a2 = -2.0 * cosine / a0, (1.0 - alpha) / a0
        self.x1 = np.zeros(2, dtype=np.float32)
        self.x2 = np.zeros(2, dtype=np.float32)
        self.y1 = np.zeros(2, dtype=np.float32)
        self.y2 = np.zeros(2, dtype=np.float32)

    def process(self, x: np.ndarray) -> np.ndarray:
        y = (self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 -
             self.a1 * self.y1 - self.a2 * self.y2).astype(np.float32)
        self.x2, self.x1 = self.x1, x.copy()
        self.y2, self.y1 = self.y1, y.copy()
        return y


def stereo_pan(x: np.ndarray, pan: float) -> np.ndarray:
    """Web Audio StereoPanner equal-power matrix for a stereo input."""
    # Spec's stereo branch retains the near-side channel and equal-power pans
    # the far-side channel into it. At pan=0 the source is an exact identity.
    if pan <= 0.0:
        angle = (pan + 1.0) * math.pi / 2.0
        return np.array([x[0] + x[1] * math.cos(angle), x[1] * math.sin(angle)], dtype=np.float32)
    angle = pan * math.pi / 2.0
    return np.array([x[0] * math.cos(angle), x[1] + x[0] * math.sin(angle)], dtype=np.float32)


def overlay_pan(index: int, overlay_count: int) -> float:
    if overlay_count <= 1:
        return 0.0
    return ((index - (overlay_count - 1) / 2.0) / ((overlay_count - 1) / 2.0)) * 0.7


def render(trace: list[dict[str, Any]], source: np.ndarray, sr: int,
           beats: list[dict[str, float]], seconds: float | None = None) -> tuple[np.ndarray, dict[str, Any]]:
    if seconds is not None and (not math.isfinite(seconds) or seconds < 0):
        raise ValueError("--seconds must be a finite non-negative value")
    boundary_frames = [0]
    for row in trace:
        delay = float(row.get("delay", 0))
        if not math.isfinite(delay) or delay < 0:
            raise ValueError(f"tick {row['tick']}: delay must be finite and non-negative")
        boundary_frames.append(js_round((sum(float(x.get("delay", 0)) for x in trace[:row['tick'] + 1])) * sr))
    total_frames = boundary_frames[-1]
    if seconds is not None:
        total_frames = min(total_frames, js_round(seconds * sr))

    output = np.zeros((total_frames, 2), dtype=np.float32)
    main_head: float | None = None
    overlay_heads: list[float | None] = []
    overlay_filters: list[HighPass250] = []
    current_rate = 1.0
    jump_frames: list[int] = []
    jump_output_frames: list[int] = []
    rate_change_points: list[dict[str, Any]] = []

    for tick_index, row in enumerate(trace):
        start, end = boundary_frames[tick_index], min(boundary_frames[tick_index + 1], total_frames)
        if start >= total_frames:
            break
        rate = float(row.get("rate", 1.0))
        if not math.isfinite(rate) or rate <= 0:
            raise ValueError(f"tick {row['tick']}: rate must be finite and positive")
        if rate != current_rate:
            rate_change_points.append({"frame": start, "tick": row["tick"], "rate": rate})
            current_rate = rate

        if bool(row.get("mainRestart", False)):
            expected = source_frame(int(row["mainBeat"]), beats, sr)
            main_head = float(expected)
            if main_head != expected:
                raise AssertionError(f"tick {row['tick']}: main jump landed at {main_head}, expected {expected}")
            jump_frames.append(expected)
            jump_output_frames.append(start)
        voices = row.get("voices", [])
        if not isinstance(voices, list):
            raise ValueError(f"tick {row['tick']}: voices must be an array")
        while len(overlay_heads) < len(voices):
            overlay_heads.append(None)
            overlay_filters.append(HighPass250(sr))
        overlay_gain = OVERLAY_GAIN * max(0.5, 1 / (1 + (len(voices) - 1) * 0.15))
        for index, voice in enumerate(voices):
            if not isinstance(voice, dict):
                raise ValueError(f"tick {row['tick']}: voice {index} must be an object")
            if bool(voice.get("restart", False)):
                expected = source_frame(int(voice["beat"]), beats, sr)
                overlay_heads[index] = float(expected)
                if overlay_heads[index] != expected:
                    raise AssertionError(f"tick {row['tick']}: overlay {index} jump landed incorrectly")
                jump_frames.append(expected)
                jump_output_frames.append(start)

        for frame in range(start, end):
            mixed = np.zeros(2, dtype=np.float32)
            if main_head is not None:
                mixed += sample_at(source, main_head) * np.float32(MAIN_GAIN)
                main_head += current_rate
            for index in range(len(voices)):
                if overlay_heads[index] is not None:
                    overlay = sample_at(source, overlay_heads[index]) * np.float32(overlay_gain)
                    mixed += stereo_pan(overlay_filters[index].process(overlay),
                                        overlay_pan(index, len(voices)))
                    overlay_heads[index] += current_rate
            output[frame] = mixed

    return output, {"jump_frames": jump_frames, "jump_output_frames": jump_output_frames,
                    "rate_change_points": rate_change_points}


def write_output(path: Path, output: np.ndarray, sr: int, details: dict[str, Any]) -> dict[str, Any]:
    raw = output.astype("<f4", copy=False).tobytes(order="C")
    path.write_bytes(raw)
    metadata = {"shape": list(output.shape), "dtype": "<f4", "order": "C",
                "sha256": hashlib.sha256(raw).hexdigest(), "sample_rate": sr,
                "rate_change_points": details["rate_change_points"],
                "jump_frames": details["jump_frames"]}
    return metadata


def selftest() -> None:
    """Build a 60-beat fixture and check identity, restart, and determinism."""
    sr, frames, ticks = 8_000, 30 * 8_000, 200
    rng = np.random.default_rng(328)
    source = rng.standard_normal((frames, 2)).astype(np.float32)
    beats = [{"start": i * 0.5, "duration": 0.5} for i in range(60)]
    trace = [{"tick": i, "mainBeat": 0, "mainRestart": i == 0,
              "voices": [], "rate": 1.0, "draws": 0, "delay": 0.15}
             for i in range(ticks)]
    output, details = render(trace, source, sr, beats)
    assert output.shape == (frames, 2), output.shape
    assert not np.isnan(output).any()
    expected = source * np.float32(MAIN_GAIN)
    assert np.array_equal(output, expected), "identity-check assertion failed"
    restart_trace = [dict(trace[0]), dict(trace[1])]
    restart_trace[1] = {**restart_trace[1], "mainBeat": 17, "mainRestart": True, "delay": 0.5}
    restarted, restart_details = render(restart_trace, source, sr, beats)
    restart_at = js_round(0.15 * sr)
    expected_frame = js_round(beats[17]["start"] * sr)
    assert restart_details["jump_frames"][-1] == expected_frame
    assert np.array_equal(restarted[restart_at], source[expected_frame] * np.float32(MAIN_GAIN)), "restart check failed"
    again, _ = render(trace, source, sr, beats)
    assert output.tobytes() == again.tobytes(), "determinism check failed"
    with tempfile.TemporaryDirectory() as directory:
        audio = Path(directory) / "fixture.flac"
        # FLAC is integer PCM; this only confirms soundfile I/O, not identity.
        sf.write(audio, source, sr, subtype="PCM_24")
        round_trip, file_sr = sf.read(audio, dtype="float32", always_2d=True)
        assert file_sr == sr and round_trip.shape == source.shape
    print("selftest passed: identity-check assertion: np.array_equal(output, source * 0.85) is True")
    print("restart check passed; determinism check passed; no-NaN and length checks passed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trace", type=Path)
    parser.add_argument("--pcm", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--sr", type=int, help="require this input sample rate; no resampling is performed")
    parser.add_argument("--seconds", type=float)
    parser.add_argument("--meta", type=Path, help="metadata path (default: <out>.json)")
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--beat-start", type=float)
    parser.add_argument("--beat-duration", type=float)
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        selftest()
        return 0
    if not (args.trace and args.pcm and args.out):
        parser.error("--trace, --pcm, and --out are required unless --selftest is used")
    source, sr = sf.read(args.pcm, dtype="float32", always_2d=True)
    if source.shape[1] == 1:
        source = np.repeat(source, 2, axis=1)
    elif source.shape[1] != 2:
        raise ValueError("input PCM must be mono or stereo")
    if args.sr is not None and args.sr != sr:
        raise ValueError(f"--sr {args.sr} does not match PCM sample rate {sr}; resampling is not supported")
    trace = load_trace(args.trace)
    beats = load_beats(args.trace, args.profile, args.beat_start, args.beat_duration)
    output, details = render(trace, source, sr, beats, args.seconds)
    metadata = write_output(args.out, output, sr, details)
    meta_path = args.meta or Path(str(args.out) + ".json")
    meta_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, ValueError, OSError) as error:
        print(f"ref_mix.py: {error}", file=sys.stderr)
        raise SystemExit(1)
