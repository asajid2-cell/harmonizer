#!/usr/bin/env python3
"""Regenerate the whole P0 oracle set, and check that it is reproducible.

Pipeline (each stage writes under ``--out``):

    1. gen_synthetic.py --out <out>/audio          deterministic fixture corpus
    2. dump_layers.py  --audio <out>/audio --out <out>
                                                   profiles/ + layers/ (Python goldens)
    3. node js/trace.mjs --out <out> --ticks N     traces/ + prep/ (JS goldens)
    4. ref_mix.py per mode                         refmix/ (sample-level goldens)
    5. MANIFEST.sha256 over everything above

``--check`` runs the entire pipeline twice into throw-away directories and requires
the two manifests to be byte-identical, then compares against the committed
``<out>/MANIFEST.sha256`` when one exists. That is the P0 done-criterion: "regenerate
everything twice with byte-identical hashes".
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
PY = str(HERE / ".venv" / "Scripts" / "python.exe")
NODE = shutil.which("node") or "node"

MANIFEST_NAME = "MANIFEST.sha256"
SUMMARY_NAME = "layers_summary.json"

# One trace per (mode, voices) for the sample-level reference mix.
REFMIX_CONFIGS = (
    ("canon", 2),
    ("canon", 3),
    ("jukebox", 2),
    ("eternal", 2),
    ("autocrooner", 2),
)


def run(cmd, cwd=None, label=None):
    label = label or " ".join(str(c) for c in cmd[:2])
    print(f"[run_oracles] $ {' '.join(str(c) for c in cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-4000:])
        sys.stderr.write(proc.stderr[-4000:])
        raise SystemExit(f"{label} failed with exit code {proc.returncode}")
    return proc


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def walk_manifest(out_dir: Path) -> list:
    """Every regular file under out_dir except the receipt and the timing report, sorted by path."""
    entries = []
    for path in sorted(out_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.name in {MANIFEST_NAME, SUMMARY_NAME}:
            # The summary is a progress/timing report, not a golden: it carries wall-clock seconds.
            continue
        rel = path.relative_to(out_dir).as_posix()
        entries.append(f"{sha256_file(path)}  {rel}")
    return entries


def write_manifest(out_dir: Path) -> list:
    entries = walk_manifest(out_dir)
    # newline="\n": every golden in the corpus is written with LF regardless of the host OS, so the
    # manifest is byte-stable across platforms and readable by `sha256sum -c`.
    (out_dir / MANIFEST_NAME).write_text("\n".join(entries) + "\n", encoding="utf-8", newline="\n")
    return entries


def stage_audio(out_dir: Path):
    run([PY, str(HERE / "gen_synthetic.py"), "--out", str(out_dir / "audio")], label="gen_synthetic")
    # The real CC tracks cannot be regenerated offline (fetch_real.py needs the network), so they are
    # versioned inputs: seed any committed real_*.flac into the working/check directory byte-for-byte.
    canonical = HERE / "fixtures" / "audio"
    dest = out_dir / "audio"
    if canonical.resolve() != dest.resolve():
        for src in sorted(canonical.glob("real_*.flac")):
            target = dest / src.name
            if not target.exists():
                shutil.copy2(src, target)


def stage_versioned(out_dir: Path):
    """Seed committed files the pipeline cannot regenerate, so a ``--check`` directory holds the
    same file set as the committed corpus.

    ``LICENSES.md`` is fixture provenance, not a generated golden, but it lives in ``fixtures/``
    and is therefore part of the manifest. Without this the committed manifest has 1350 entries
    while a fresh check directory has 1349, and the comparison at the end of ``--check`` fails on
    the file set rather than on any real divergence.
    """
    canonical = HERE / "fixtures"
    if canonical.resolve() == out_dir.resolve():
        return
    for name in ("LICENSES.md",):
        src = canonical / name
        if src.exists():
            shutil.copy2(src, out_dir / name)


def stage_layers(out_dir: Path):
    run([PY, str(HERE / "dump_layers.py"),
         "--audio", str(out_dir / "audio"), "--out", str(out_dir),
         "--summary", str(out_dir / "layers_summary.json")], label="dump_layers")


def stage_traces(out_dir: Path, ticks: int, seeds: str, gbrt_model: Path | None):
    cmd = [NODE, str(HERE / "js" / "trace.mjs"),
           "--out", str(out_dir), "--ticks", str(ticks), "--seeds", seeds]
    if gbrt_model:
        cmd += ["--gbrt-model", str(gbrt_model)]
    run(cmd, label="trace.mjs")


def stage_refmix(out_dir: Path):
    """Pick one trace per mode from the baseline/heuristic policies and render it."""
    trace_root = out_dir / "traces"
    if not trace_root.exists():
        print("[run_oracles] no traces/ yet; skipping refmix", file=sys.stderr)
        return
    refmix_dir = out_dir / "refmix"
    refmix_dir.mkdir(parents=True, exist_ok=True)
    for mode, voices in REFMIX_CONFIGS:
        fixture_dirs = sorted(p for p in trace_root.iterdir() if p.is_dir())
        picked = None
        for fixture_dir in fixture_dirs:
            for policy in ("baseline", "heuristic"):
                for seed in ("1", "42", "19220046"):  # 0xC0FFEE
                    cand = fixture_dir / f"{mode}-v{voices}-{policy}-s{seed}.jsonl"
                    if cand.exists():
                        picked = (fixture_dir.name, cand)
                        break
                if picked:
                    break
            if picked:
                break
        if not picked:
            print(f"[run_oracles] no trace for {mode}-v{voices}; skipping", file=sys.stderr)
            continue
        fixture, trace = picked
        audio = out_dir / "audio" / f"{fixture}.flac"
        profile = out_dir / "profiles" / f"{fixture}.json"
        if not audio.exists():
            print(f"[run_oracles] missing audio for {fixture}; skipping refmix", file=sys.stderr)
            continue
        out_f32 = refmix_dir / f"{mode}-v{voices}.f32"
        cmd = [PY, str(HERE / "ref_mix.py"),
               "--trace", str(trace), "--pcm", str(audio),
               "--out", str(out_f32), "--meta", str(out_f32.with_suffix(".json")),
               "--seconds", "10"]
        if profile.exists():
            cmd += ["--profile", str(profile)]
        run(cmd, label=f"ref_mix {mode}-v{voices}")


def generate(out_dir: Path, ticks: int, seeds: str, gbrt_model: Path | None):
    out_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()
    stage_audio(out_dir)
    stage_versioned(out_dir)
    stage_layers(out_dir)
    stage_traces(out_dir, ticks, seeds, gbrt_model)
    stage_refmix(out_dir)
    entries = write_manifest(out_dir)
    print(f"[run_oracles] {len(entries)} files hashed in {time.time() - started:.1f}s")
    return entries


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(HERE / "fixtures"))
    parser.add_argument("--ticks", type=int, default=5000)
    parser.add_argument("--seeds", default="1,42,0xC0FFEE")
    parser.add_argument("--gbrt-model", default=str(REPO / "rl_models" / "model.json"),
                        help="fixture GBRT policy model (default: the repo's shipped rl_models/model.json)")
    parser.add_argument("--check", action="store_true",
                        help="generate twice into temp dirs and require identical manifests")
    parser.add_argument("--keep", action="store_true", help="keep the temp dirs from --check")
    args = parser.parse_args()

    gbrt = Path(args.gbrt_model) if args.gbrt_model else None
    if gbrt is not None and not gbrt.exists():
        print(f"[run_oracles] note: no GBRT model at {gbrt}; the gbrt policy row is skipped",
              file=sys.stderr)
        gbrt = None
    out_dir = Path(args.out)

    if not args.check:
        generate(out_dir, args.ticks, args.seeds, gbrt)
        print(f"[run_oracles] wrote {out_dir / MANIFEST_NAME}")
        return 0

    tmp_root = Path(tempfile.mkdtemp(prefix="ios-parity-check-"))
    run_a = tmp_root / "a"
    run_b = tmp_root / "b"
    try:
        print("[run_oracles] PASS 1/2")
        entries_a = generate(run_a, args.ticks, args.seeds, gbrt)
        print("[run_oracles] PASS 2/2")
        entries_b = generate(run_b, args.ticks, args.seeds, gbrt)

        if entries_a != entries_b:
            only_a = [e for e in entries_a if e not in entries_b][:10]
            only_b = [e for e in entries_b if e not in entries_a][:10]
            print("[run_oracles] FAIL: the two runs differ", file=sys.stderr)
            print(f"  only in run A: {only_a}", file=sys.stderr)
            print(f"  only in run B: {only_b}", file=sys.stderr)
            return 1
        print(f"[run_oracles] PASS: both runs produced {len(entries_a)} identical hashes")

        committed = out_dir / MANIFEST_NAME
        if committed.exists():
            want = committed.read_text(encoding="utf-8").splitlines()
            got = (run_a / MANIFEST_NAME).read_text(encoding="utf-8").splitlines()
            if want != got:
                wa = set(want)
                ga = set(got)
                print("[run_oracles] FAIL: committed manifest differs from a fresh run",
                      file=sys.stderr)
                for line in sorted(ga - wa)[:10]:
                    print(f"  + {line}", file=sys.stderr)
                for line in sorted(wa - ga)[:10]:
                    print(f"  - {line}", file=sys.stderr)
                return 1
            print("[run_oracles] PASS: committed manifest matches a fresh run")
        else:
            print(f"[run_oracles] note: no committed manifest at {committed}")
        return 0
    finally:
        if args.keep:
            print(f"[run_oracles] kept temp dirs under {tmp_root}")
        else:
            shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
