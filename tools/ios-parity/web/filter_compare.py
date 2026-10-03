#!/usr/bin/env python3
"""Attribute the render divergence: Chrome's highpass/stereo-panner vs ref_mix's models.

The probe page renders the same LCG signal through a bare ``highpass(250)`` and a bare
``stereoPanner(0.7)`` and writes both (hp then pan) as interleaved float32.  This runs the
identical signal through ``ref_mix.HighPass250`` and ``ref_mix.stereo_pan`` and reports each
node's own error, so a render-level divergence can be pinned to a specific node.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
SR, FRAMES = 22050, 22050


def load_ref_mix():
    spec = importlib.util.spec_from_file_location("ref_mix", HERE.parent / "ref_mix.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def signal() -> np.ndarray:
    """The same 32-bit LCG the page uses."""
    s = np.uint32(12345)
    out = np.empty(FRAMES, dtype=np.float32)
    for i in range(FRAMES):
        s = np.uint32((1664525 * int(s) + 1013904223) & 0xFFFFFFFF)
        out[i] = np.float32((int(s) / 4294967296.0) * 2 - 1)
    return out


def stats(web: np.ndarray, ref: np.ndarray) -> dict:
    diff = np.abs(web.astype(np.float64) - ref.astype(np.float64))
    return {
        "max_abs_error": float(diff.max()),
        "rms_error": float(np.sqrt(np.mean(diff ** 2))),
        "bit_exact_percent": 100.0 * float(np.count_nonzero(diff == 0.0)) / diff.size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--probe", type=Path, required=True, help="the raw blob the page wrote")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    rm = load_ref_mix()
    raw = np.fromfile(args.probe, dtype="<f4")
    if raw.size != FRAMES * 2 * 2:
        raise SystemExit(f"probe blob is {raw.size} floats, expected {FRAMES * 2 * 2}")
    hp_web = raw[:FRAMES * 2].reshape(FRAMES, 2)
    pan_web = raw[FRAMES * 2:].reshape(FRAMES, 2)

    x = signal()
    x2 = np.stack([x, x], axis=1)  # mono signal in both channels, as the page feeds it

    hp = rm.HighPass250(SR)
    hp_ref = np.empty((FRAMES, 2), dtype=np.float32)
    for i in range(FRAMES):
        hp_ref[i] = hp.process(x2[i])

    pan_ref = np.stack([rm.stereo_pan(x2[i], 0.7) for i in range(FRAMES)]).astype(np.float32)

    report = {"highpass_250": stats(hp_web, hp_ref), "stereopanner_0.7": stats(pan_web, pan_ref)}
    if args.out:
        args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
