#!/usr/bin/env python3
"""Diff a browser render against the app-side reference (committed golden or fresh ref_mix).

Both files are interleaved float32 LE stereo.  The report is the ITEM B measurement: the
worst absolute sample error, the bit-exact fraction, and *where* the error lives - so a
divergence can be attributed (main path vs the overlay high-pass/pan path) rather than just
counted.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def load(path: Path) -> np.ndarray:
    return np.fromfile(path, dtype="<f4").reshape(-1, 2)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web", type=Path, required=True)
    parser.add_argument("--ref", type=Path, required=True)
    parser.add_argument("--label", default="")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--gate", type=float, default=1e-6, help="the P4 gate this is measured against")
    args = parser.parse_args()

    web, ref = load(args.web), load(args.ref)
    report = {
        "label": args.label,
        "web_frames": int(web.shape[0]),
        "ref_frames": int(ref.shape[0]),
        "web_sha256": hashlib.sha256(open(args.web, "rb").read()).hexdigest(),
        "ref_sha256": hashlib.sha256(open(args.ref, "rb").read()).hexdigest(),
    }
    if web.shape != ref.shape:
        report["shape_mismatch"] = True
        print(json.dumps(report))
        return 1

    diff = np.abs(web - ref)
    flat = diff.reshape(-1)
    total = flat.size
    exact = int(np.count_nonzero(flat == 0.0))
    report.update({
        "max_abs_error": float(flat.max()),
        "rms_error": float(np.sqrt(np.mean(flat.astype(np.float64) ** 2))),
        "bit_exact_samples": exact,
        "bit_exact_percent": 100.0 * exact / total,
        "nonzero_error_samples": int(np.count_nonzero(flat)),
        "gate": args.gate,
        "passes_gate": bool(flat.max() <= args.gate),
        "bit_identical": bool(exact == total),
    })
    # Where the error lives: the set of frames with any nonzero error, and their span.
    bad_frames = np.nonzero(diff.max(axis=1) > 0)[0]
    if bad_frames.size:
        report["first_bad_frame"] = int(bad_frames[0])
        report["last_bad_frame"] = int(bad_frames[-1])
        report["bad_frame_count"] = int(bad_frames.size)
        # Contiguous runs, so a localized (boundary) divergence is distinguishable from a
        # global one.
        breaks = np.nonzero(np.diff(bad_frames) > 1)[0]
        starts = np.concatenate(([0], breaks + 1))
        ends = np.concatenate((breaks, [bad_frames.size - 1]))
        runs = [[int(bad_frames[s]), int(bad_frames[e])] for s, e in zip(starts, ends)]
        report["bad_runs"] = runs[:20]
        report["bad_run_count"] = len(runs)
    else:
        report["bad_run_count"] = 0

    if args.out:
        args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({k: report[k] for k in (
        "label", "max_abs_error", "rms_error", "bit_exact_percent", "bit_identical",
        "passes_gate", "bad_run_count")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
