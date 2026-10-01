#!/usr/bin/env python3
"""Dump the layered goldens the iOS port's parity gates compare against.

This imports ``backend/analysis/analyze_track.py`` and calls its functions
**unmodified**. It never edits the product code; it only records what those
functions produce, layer by layer, so a Swift port can be checked at each stage
with golden inputs fed in (unit parity) as well as end to end (chain parity).

Usage
-----
    python dump_layers.py --audio fixtures/audio --out fixtures
    python dump_layers.py --audio fixtures/audio --out fixtures --only synth_click_chord_120

Outputs, under ``--out``:

    profiles/<id>.json          the full profile, via build_profile() (the oracle)
    layers/<id>/<stage>.f32     little-endian float32, C order
    layers/<id>/<stage>.json    shape/dtype/sha256 header for the .f32
    layers/<id>/<stage>.json    (for non-numeric stages) the value itself

``build_profile`` is the authority for ``profiles/<id>.json``. The layers are
recomputed here from the same shared spectral features so each stage can be
isolated; the two are cross-checked (see ``--cross-check``).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
ANALYSIS_DIR = REPO / "backend" / "analysis"
if str(ANALYSIS_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYSIS_DIR))

import analyze_track as at  # noqa: E402  (the product module, unmodified)
import librosa  # noqa: E402


# --------------------------------------------------------------------------- #
# Writers
# --------------------------------------------------------------------------- #

def write_f32(layer_dir: Path, name: str, array) -> str:
    """Write a float32 array plus its shape header. Returns the payload sha256."""
    arr = np.ascontiguousarray(np.asarray(array, dtype="<f4"))
    payload = arr.tobytes(order="C")
    digest = hashlib.sha256(payload).hexdigest()
    layer_dir.mkdir(parents=True, exist_ok=True)
    (layer_dir / f"{name}.f32").write_bytes(payload)
    header = {
        "stage": name,
        "kind": "f32",
        "shape": list(arr.shape),
        "dtype": "<f4",
        "order": "C",
        "sha256": digest,
    }
    (layer_dir / f"{name}.json").write_text(json.dumps(header, indent=2) + "\n", newline="\n")
    return digest


def write_json(layer_dir: Path, name: str, value) -> str:
    """Write a non-numeric stage as canonical JSON. Returns its sha256."""
    layer_dir.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, indent=2, sort_keys=False, default=_jsonable) + "\n"
    (layer_dir / f"{name}.json").write_text(text, newline="\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _jsonable(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, at.Quantum):
        return obj.as_dict()
    raise TypeError(f"not JSON-serialisable: {type(obj)!r}")


# --------------------------------------------------------------------------- #
# Per-fixture dump
# --------------------------------------------------------------------------- #

LAYER_STAGES = (
    "pcm_mono",
    "stft_mag",
    "rms",
    "mfcc13",
    "mfcc20",
    "delta",
    "onset_env",
    "tempo_beat_frames",
    "chroma",
    "segments",
    "sections",
    "beat_features_91",
    "canon_ssm",
    "offset_candidates",
    "canon_alignment",
    "eternal_ssm",
    "eternal_loop_candidates",
    "canon_candidates",
    "global_voice_offsets",
)


def dump_fixture(audio_path: Path, out_root: Path, profile_dir: Path) -> dict:
    fixture_id = audio_path.stem
    layer_dir = out_root / "layers" / fixture_id
    started = time.time()

    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = float(librosa.get_duration(y=y, sr=sr))
    hop = at.HOP_LENGTH

    # Shared features, computed exactly as build_profile computes them.
    shared_chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop)
    shared_mfcc13 = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop)
    shared_mfcc20 = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=hop)
    shared_delta = librosa.feature.delta(shared_mfcc20)
    shared_onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    shared_rms = librosa.feature.rms(y=y, hop_length=hop)[0]
    stft_mag = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))

    write_f32(layer_dir, "pcm_mono", y)
    write_f32(layer_dir, "stft_mag", stft_mag[:, :200])
    write_f32(layer_dir, "rms", shared_rms)
    write_f32(layer_dir, "mfcc13", shared_mfcc13)
    write_f32(layer_dir, "mfcc20", shared_mfcc20)
    write_f32(layer_dir, "delta", shared_delta)
    write_f32(layer_dir, "onset_env", shared_onset)
    write_f32(layer_dir, "chroma", shared_chroma)

    # --- beats / tempo -----------------------------------------------------
    beats, beat_times, tempo = at.compute_beats(y, sr, onset_env=shared_onset)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=shared_onset, sr=sr, hop_length=hop)
    beat_frames = np.atleast_1d(beat_frames).astype("<i4")

    # --- structural layers -------------------------------------------------
    bars = at.derive_bars(beats, beat_times, duration)
    tatums = at.derive_tatums(beats, duration)
    desired_sections = max(2, min(12, len(beats) // 8 or 2))
    sections = at.estimate_sections(
        y, sr, duration, desired_sections, bars, chroma=shared_chroma, mfcc=shared_mfcc13
    )
    segments = at.compute_segments(
        y, sr, duration, onset_env=shared_onset, mfcc=shared_mfcc13,
        chroma=shared_chroma, rms=shared_rms,
    )

    write_json(layer_dir, "tempo_beat_frames", {
        "tempo": float(tempo),
        "beat_frames": [int(f) for f in beat_frames.tolist()],
        "beat_times": [float(t) for t in np.asarray(beat_times).tolist()],
        "hop_length": int(hop),
        "sample_rate": int(sr),
    })
    write_json(layer_dir, "segments", segments)
    write_json(layer_dir, "sections", [s.as_dict() for s in sections])

    # --- canon SSM ---------------------------------------------------------
    beats_meta, beat_energies, beat_chroma, beat_tempos = at._build_beat_metadata(
        beats, [b.as_dict() for b in bars], segments, tempo
    )
    stacked, contexts = at._stack_beat_features(
        y=y, sr=sr, beat_times=[float(b.start) for b in beats], duration=duration,
        beats_per_bar=at.DEFAULT_TIME_SIGNATURE, hop_length=hop,
        context_window=at.CANON_CONTEXT_BEATS,
        chroma=shared_chroma, onset_env=shared_onset, rms=shared_rms,
    )
    ssm = at._cosine_ssm(stacked)

    # The 91-d per-beat feature row is the rightmost 91 columns of the stacked
    # matrix: the stack is [t-4, t-3, t-2, t-1, t] x 91, so the last block is the
    # beat's own normalised feature vector.
    feature_dim = stacked.shape[1] // at.CANON_CONTEXT_BEATS
    beat_features_91 = stacked[:, stacked.shape[1] - feature_dim:]
    write_f32(layer_dir, "beat_features_91", beat_features_91)
    write_json(layer_dir, "beat_contexts", [
        {"index": c.index, "start": c.start, "duration": c.duration, "phase": c.phase}
        for c in contexts
    ])
    write_f32(layer_dir, "canon_ssm", ssm)

    # --- canon alignment ---------------------------------------------------
    canon_alignment = at.compute_canon_alignment(
        y=y, sr=sr, beats=beats, duration=duration,
        beats_per_bar=at.DEFAULT_TIME_SIGNATURE,
        context_window=at.CANON_CONTEXT_BEATS,
        similarity_threshold=at.CANON_SIMILARITY_THRESHOLD,
        min_phase_alignment=at.CANON_MIN_PHASE_ALIGNMENT,
        min_pairs=at.CANON_MIN_PAIRS,
        top_candidates=at.CANON_TOP_CANDIDATES,
        chroma=shared_chroma, onset_env=shared_onset, rms=shared_rms,
    )
    write_json(layer_dir, "canon_alignment", canon_alignment)
    write_json(layer_dir, "offset_candidates",
               (canon_alignment or {}).get("offset_candidates", []))

    # --- eternal -----------------------------------------------------------
    similarity_matrix = at.compute_beat_to_beat_similarity(beats, segments)
    write_f32(layer_dir, "eternal_ssm", similarity_matrix)

    eternal_loop_candidates = at.generate_loop_candidates(
        beats=beats_meta,
        similarity_matrix=similarity_matrix,
        sections=sections,
        min_span=6,
        max_span=None,
        thresholds=[0.72, 0.60, 0.48],
        max_candidates_per_beat=48,
        energies=beat_energies,
        chroma=beat_chroma,
        tempos=beat_tempos,
        silence_floor=at.SILENCE_DB,
        energy_drop_ratio=0.45,
    )
    write_json(layer_dir, "eternal_loop_candidates",
               {str(k): v for k, v in eternal_loop_candidates.items()})

    # --- canon candidates / global offsets ---------------------------------
    canon_candidates, global_voice_offsets = at.compute_canon_candidates(
        beats_meta, beat_energies, beat_chroma
    )
    write_json(layer_dir, "canon_candidates", {str(k): v for k, v in canon_candidates.items()})
    write_json(layer_dir, "global_voice_offsets", [int(o) for o in global_voice_offsets])

    # --- the profile, from the product function itself ---------------------
    profile_dir.mkdir(parents=True, exist_ok=True)
    profile_path = profile_dir / f"{fixture_id}.json"
    profile = at.build_profile(
        audio_path=audio_path,
        track_id=fixture_id,
        title=fixture_id,
        artist="ios-parity-fixture",
        audio_url=f"/media/{fixture_id}.flac",
        output_path=profile_path,
    )

    return {
        "fixture": fixture_id,
        "sample_rate": int(sr),
        "duration": round(duration, 6),
        "beats": len(beats),
        "bars": len(bars),
        "tatums": len(tatums),
        "sections": len(sections),
        "segments": len(segments),
        "tempo": round(float(tempo), 6),
        "profile_keys": sorted(profile["response"]["track"]["analysis"].keys()),
        "seconds": round(time.time() - started, 2),
    }


def cross_check(layer_dir: Path, profile_path: Path) -> list:
    """Confirm the layers agree with the profile build_profile just wrote."""
    problems = []
    profile = json.loads(profile_path.read_text())
    analysis = profile["response"]["track"]["analysis"]

    stored = json.loads((layer_dir / "global_voice_offsets.json").read_text())
    if stored != list(analysis.get("global_voice_offsets", [])):
        problems.append("global_voice_offsets differs from the profile")
    stored = json.loads((layer_dir / "sections.json").read_text())
    if len(stored) != len(analysis.get("sections", [])):
        problems.append("sections count differs from the profile")
    stored = json.loads((layer_dir / "segments.json").read_text())
    if len(stored) != len(analysis.get("segments", [])):
        problems.append("segments count differs from the profile")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--audio", default=str(HERE / "fixtures" / "audio"))
    parser.add_argument("--out", default=str(HERE / "fixtures"))
    parser.add_argument("--only", nargs="*", default=None,
                        help="fixture ids (filename stems) to process")
    parser.add_argument("--cross-check", action="store_true", default=True)
    parser.add_argument("--no-cross-check", dest="cross_check", action="store_false")
    parser.add_argument("--summary", default=None, help="write a JSON summary here")
    args = parser.parse_args()

    audio_dir = Path(args.audio)
    out_root = Path(args.out)
    profile_dir = out_root / "profiles"

    files = sorted(p for p in audio_dir.glob("*.flac"))
    if args.only:
        wanted = set(args.only)
        files = [p for p in files if p.stem in wanted]
    if not files:
        print(f"no fixtures found under {audio_dir}", file=sys.stderr)
        return 2

    rows = []
    failures = []
    for path in files:
        print(f"[dump_layers] {path.stem} ...", flush=True)
        try:
            row = dump_fixture(path, out_root, profile_dir)
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"  FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            failures.append({"fixture": path.stem, "error": f"{type(exc).__name__}: {exc}"})
            continue
        if args.cross_check:
            problems = cross_check(out_root / "layers" / path.stem, profile_dir / f"{path.stem}.json")
            row["cross_check"] = problems or "ok"
            if problems:
                failures.append({"fixture": path.stem, "error": "; ".join(problems)})
        print(f"  ok: {row['beats']} beats, {row['segments']} segments, {row['seconds']}s", flush=True)
        rows.append(row)

    summary = {"fixtures": rows, "failures": failures, "count": len(rows)}
    if args.summary:
        Path(args.summary).write_text(json.dumps(summary, indent=2) + "\n", newline="\n")
    print(json.dumps({"dumped": len(rows), "failed": len(failures)}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
