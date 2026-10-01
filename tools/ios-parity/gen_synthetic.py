#!/usr/bin/env python3
"""Generate deterministic, offline audio fixtures for iOS parity tests."""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import soundfile as sf

DURATION = 30.0
# Section-level dynamics. FINDINGS #11: the eternal-loop energy gate compares dB multiplicatively
# and so only admits jumps to *louder* beats, which makes a constant-level fixture degenerate
# (empty loop graph). Cycling a ~23 dB envelope across 4-bar sections keeps the jukebox/eternal
# decision traces exercised. The envelope is deterministic and ramped, so it adds no entropy.
SECTION_GAIN_DB = (-3.0, -21.0, -9.0, -26.0)
SECTION_SECONDS = 8.0
SECTION_RAMP = 0.12
FIXTURES = {
    "synth_click_chord_120": (44100, 1, "straight", 1201),
    "synth_swing_97": (44100, 1, "swing", 9701),
    "synth_ramp_100_130": (44100, 1, "ramp", 100130),
    "synth_waltz_34": (44100, 1, "waltz", 3401),
    "synth_silence_intro_outro": (44100, 1, "silent_edges", 6018),
    "synth_mono_44100": (44100, 1, "straight", 1201),
    "synth_sr_22050": (22050, 1, "straight", 1201),
    "synth_sr_44100": (44100, 1, "straight", 1201),
    "synth_sr_48000": (48000, 1, "straight", 1201),
    "synth_stereo_44100": (44100, 2, "straight", 1201),
}


def _events(style: str, start: float, end: float) -> list[tuple[float, float]]:
    """Return (time, accent) beat events; all timing is analytic and rate-independent."""
    if style in {"straight", "silent_edges"}:
        return [(t, 1.0 if round(t * 2) % 8 == 0 else 0.62) for t in np.arange(start, end, 0.5)]
    if style == "swing":
        result = []
        beat = start
        while beat < end:
            result.extend(((beat, 1.0), (beat + (60 / 97) * 2 / 3, 0.50)))
            beat += 60 / 97
        return result
    if style == "ramp":
        # Integral of bpm(t)/60: 100t/60 + 30t^2/(60*30). Solve for each beat.
        result, n = [], 0
        while True:
            # t^2 / 60 + (5/3)t - n = 0
            t = (-100 + np.sqrt(10000 + 240 * n)) / 2
            if t >= end:
                break
            if t >= start:
                result.append((float(t), 1.0 if n % 4 == 0 else 0.60))
            n += 1
        return result
    if style == "waltz":
        return [(t, 1.0 if i % 3 == 0 else 0.48) for i, t in enumerate(np.arange(start, end, 0.5))]
    raise ValueError(style)


def _add_tone(dst: np.ndarray, sr: int, start: float, seconds: float, freq: float, gain: float) -> None:
    first = max(0, int(round(start * sr)))
    count = min(len(dst) - first, int(round(seconds * sr)))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float64) / sr
    # Gentle attack/release avoids discontinuities while preserving sustained harmonic content.
    env = np.minimum(1.0, t / 0.035) * np.minimum(1.0, (seconds - t) / 0.09)
    env = np.maximum(env, 0.0)
    dst[first:first + count] += gain * env * (np.sin(2 * np.pi * freq * t) + 0.22 * np.sin(4 * np.pi * freq * t))


def render(sr: int, style: str, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    frames = int(sr * DURATION)
    audio = np.zeros(frames, dtype=np.float64)
    music_start, music_end = (6.0, 24.0) if style == "silent_edges" else (0.0, DURATION)
    # I-IV-vi-V, with bass and a brighter top voice: enough harmonic variation for chroma/MFCC tests.
    roots = (130.8128, 174.6141, 220.0, 195.9977)
    for bar_start in np.arange(music_start, music_end, 2.0):
        root = roots[int((bar_start - music_start) // 2) % len(roots)]
        for ratio in (1.0, 1.259921, 1.498307):
            _add_tone(audio, sr, float(bar_start), min(2.05, music_end - bar_start), root * ratio, 0.075)
        _add_tone(audio, sr, float(bar_start), min(1.8, music_end - bar_start), root / 2, 0.12)
        # A quiet arpeggio lends motion beyond the percussive pulse.
        for off, ratio in zip((0.0, .25, .5, .75, 1.0, 1.25, 1.5, 1.75), (1, 1.5, 1.26, 2, 1, 1.5, 1.26, 2)):
            _add_tone(audio, sr, float(bar_start + off), 0.22, root * ratio, 0.025)
    for t0, accent in _events(style, music_start, music_end):
        first = int(round(t0 * sr))
        n = min(int(sr * 0.055), frames - first)
        if n <= 0:
            continue
        t = np.arange(n, dtype=np.float64) / sr
        # A deterministic bright click (with a changing overtone) stays FLAC-friendly.
        click = np.exp(-t * 70) * (np.sin(2 * np.pi * 1800 * t) + 0.30 * np.sin(2 * np.pi * 3187 * t))
        audio[first:first + n] += accent * 0.24 * click
        # Short low drum adds a non-metronomic musical attack.
        n2 = min(int(sr * 0.13), frames - first)
        td = np.arange(n2, dtype=np.float64) / sr
        audio[first:first + n2] += accent * 0.16 * np.exp(-td * 22) * np.sin(2 * np.pi * (95 - 35 * td) * td)
    # Deterministic low-level tape-like tonal texture; seeded phase makes each fixture reproducible.
    t_all = np.arange(frames, dtype=np.float64) / sr
    audio += 0.0015 * np.sin(2 * np.pi * 61.0 * t_all + rng.uniform(0, 2 * np.pi))
    # Ramped per-section gain envelope (deterministic; see SECTION_GAIN_DB).
    bounds = np.arange(music_start, music_end + SECTION_SECONDS, SECTION_SECONDS)
    levels = [SECTION_GAIN_DB[i % len(SECTION_GAIN_DB)] for i in range(len(bounds))]
    xs, ys = [music_start], [levels[0]]
    for i in range(1, len(bounds)):
        xs += [bounds[i] - SECTION_RAMP, bounds[i] + SECTION_RAMP]
        ys += [levels[i - 1], levels[i]]
    xs.append(music_end)
    ys.append(levels[-1])
    audio *= 10.0 ** (np.interp(t_all, xs, ys, left=ys[0], right=ys[-1]) / 20.0)
    if style == "silent_edges":
        edge = (np.arange(frames) / sr < 6) | (np.arange(frames) / sr >= 24)
        audio[edge] *= 0.02
    peak = np.max(np.abs(audio))
    return (audio * (10 ** (-3 / 20)) / peak).astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--only", nargs="+", choices=sorted(FIXTURES))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    ids = args.only or list(FIXTURES)
    for fixture_id in ids:
        sr, channels, style, seed = FIXTURES[fixture_id]
        mono = render(sr, style, seed)
        if channels == 2:
            # Same source material, modest deterministic channel coloration/delay.
            delay = int(round(0.0018 * sr))
            right = mono * 0.94
            right[delay:] += mono[:-delay] * 0.06
            data = np.column_stack((mono, right)).astype(np.float32)
        else:
            data = mono
        sf.write(args.out / f"{fixture_id}.flac", data, sr, format="FLAC", subtype="PCM_16")


if __name__ == "__main__":
    main()
