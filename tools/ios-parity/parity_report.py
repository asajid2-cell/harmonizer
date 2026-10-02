#!/usr/bin/env python3
"""Emit ``ParityReport.json``: the analysis-parity drift report (04-TESTING.md §2).

Two things live in it, and they answer different questions:

* **layers** - per fixture and per stage, the port's own error against the golden: worst case and
  p99. The gates in §2.1 fail on the worst case, so a report is only worth having if it shows the
  number *moving while the gate still passes*; two percentiles per stage is that signal. The rows are
  emitted by the Swift parity suite (``tools/parity-report.sh`` in the iOS repo collects them), never
  recomputed here - the port's numbers must be the port's.
* **margins** - §2.4's threshold margins, computed here from the committed goldens, because the
  goldens are where the thresholds and the decision inputs live. A chain-parity mismatch is excused
  only where the corresponding golden margin is knife-edge (< 1e-3); this is what makes that
  judgement checkable instead of a claim.

Usage
-----
    python parity_report.py                       # margins only, from the committed goldens
    python parity_report.py --port port-layers.jsonl   # margins + the port's layer errors
    python parity_report.py --port port-layers.jsonl --out ParityReport.json

Every margin carries the threshold it was measured against, read from the golden rather than
hard-coded, so the report cannot silently disagree with the fixture it describes.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent

# §2.1, verbatim: stage -> (metric, gate, the side the gate bounds). `max` gates are ceilings, `min`
# gates are floors (a cosine percentile gets worse as it falls).
GATES = {
    "pcm_mono": ("max_abs", 1e-7, "max"),
    "stft_mag": ("max_rel", 1e-4, "max"),
    "rms": ("max_abs_db", 0.01, "max"),
    "mfcc13": ("max_abs", 1e-3, "max"),
    "mfcc20": ("max_abs", 1e-3, "max"),
    "delta": ("max_abs", 1e-4, "max"),
    "onset_env": ("normalized_max_abs", 1e-3, "max"),
    "chroma": ("cosine_p05", 0.98, "min"),
    "beat_features_91": ("max_abs", 1e-3, "max"),
    "canon_ssm": ("max_abs", 1e-4, "max"),
    "eternal_ssm": ("max_abs", 1e-4, "max"),
}

# What the report does not (yet) carry, stated so a reader does not mistake absence for a clean bill.
COVERAGE_NOTE = {
    "layers_emitted_by": "the Swift parity suite (PARITY_LAYER lines), ingested via --port",
    "margins_defined": [
        "canon.offset_selection",
        "canon.loop_edges",
    ],
    "margins_not_yet_defined": {
        "eternal.loop_edges": "the candidate tiers are generation cut-offs, not accept/reject; the "
        "operative gate is the §2.2 top-k edge Jaccard, which needs the chain comparison, not a "
        "golden-side margin",
        "canon.candidates / global_voice_offsets": "greedy per-beat score selection; the margin is "
        "the gap to the runner-up, which needs the full score list, not the truncated golden",
        "tempo / beats / segments / sections": "decision-as-classification stages gated by their own "
        "exactness clauses (§2.1), where 'distance from a threshold' is not defined",
    },
    "excused": "populated from chain-parity mismatches when supplied; empty means none were reported",
}


def offset_key(candidate: dict) -> tuple:
    """`analyze_track._evaluate_offsets` sorts on `(mean - 0.4 * std, high_similarity_ratio)` desc."""
    return (candidate["mean_similarity"] - 0.4 * candidate["std_similarity"],
            candidate["high_similarity_ratio"])


def canon_margins(layer_dir: Path) -> dict:
    """§2.4 margins for the canon decisions the golden records enough to measure."""
    path = layer_dir / "canon_alignment.json"
    if not path.exists():
        return {}
    alignment = json.loads(path.read_text())
    if not alignment:
        return {}

    margins: dict = {}
    candidates = alignment.get("offset_candidates") or []
    threshold = float(alignment.get("similarity_threshold"))
    min_phase = float(alignment.get("min_phase_alignment"))
    min_pairs = int(alignment.get("min_pairs"))

    if candidates:
        ranked = sorted(candidates, key=offset_key, reverse=True)
        winner = ranked[0]
        # What *admits* an offset is `phase_alignment >= min_phase_alignment` and
        # `diag.size >= min_pairs` (`_evaluate_offsets`); `similarity_threshold` is only used inside
        # the ranking key and the high-similarity ratio, so a mean *below* 0.5 is normal and is not a
        # margin against anything. The margins that can actually flip the *selection* are the two
        # admission thresholds and the gap to the runner-up under the ranking key.
        phase_margin = winner["phase_alignment"] - min_phase
        pairs_margin = winner["pairs_evaluated"] - min_pairs
        decision_gap = None
        if len(ranked) > 1:
            decision_gap = offset_key(winner)[0] - offset_key(ranked[1])[0]
        tightest = min(
            [phase_margin, pairs_margin] + ([decision_gap] if decision_gap is not None else [])
        )
        margins["canon.offset_selection"] = {
            "winner_offset": winner["offset"],
            "thresholds": {
                "similarity": threshold,
                "min_phase_alignment": min_phase,
                "min_pairs": min_pairs,
            },
            "winner_mean_similarity": winner["mean_similarity"],
            "phase_margin": phase_margin,
            "pairs_margin": pairs_margin,
            "decision_gap_to_runner_up": decision_gap,
            "candidate_count": len(candidates),
            "tightest_margin": tightest,
            "knife_edge": tightest < 1e-3,
        }

    edges = alignment.get("loop_candidates") or []
    # `_compute_loop_candidates` is called with `similarity_threshold * 0.8`; §2.4's ".4 loop edges".
    loop_threshold = threshold * 0.8
    if edges:
        similarities = [float(e["similarity"]) for e in edges]
        margins["canon.loop_edges"] = {
            "threshold": loop_threshold,
            "edge_count": len(edges),
            "tightest_margin": min(similarities) - loop_threshold,
            "loosest_margin": max(similarities) - loop_threshold,
            "knife_edge": (min(similarities) - loop_threshold) < 1e-3,
        }
    return margins


def load_port(path: Path) -> dict:
    """Read the `PARITY_LAYER` JSONL the Swift suite prints, keyed by fixture then stage."""
    layers: dict = {}
    if path is None:
        return layers
    for number, line in enumerate(path.read_text().splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{number}: not JSON: {exc}") from exc
        fixture = row["fixture"]
        stage = row["stage"]
        metric, gate, side = GATES.get(stage, (row.get("metric"), None, "max"))
        record = {
            "metric": row.get("metric", metric),
            "worst": row.get("worst"),
            "p99": row.get("p99"),
        }
        if gate is not None:
            value = record["worst"]
            record["gate"] = gate
            record["pass"] = (
                value <= gate if side == "max" else value >= gate
            ) if value is not None else None
        layers.setdefault(fixture, {})[stage] = record
    return layers


def oracle_revision() -> str:
    """The analyze_track.py the goldens were dumped from, so the report names its oracle."""
    try:
        out = subprocess.run(
            ["git", "-C", str(HERE.parent.parent), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=False,
        )
        if out.returncode == 0:
            return out.stdout.strip()
    except OSError:
        pass
    return "unknown"


def build(fixtures_dir: Path, port_path: Path | None) -> dict:
    layers_dir = fixtures_dir / "layers"
    ids = sorted(p.name for p in layers_dir.iterdir() if p.is_dir())
    port = load_port(port_path)

    fixtures: dict = {}
    for fixture in ids:
        entry: dict = {}
        margins = canon_margins(layers_dir / fixture)
        if margins:
            entry["margins"] = margins
        if fixture in port:
            entry["layers"] = port[fixture]
        fixtures[fixture] = entry

    excused = []
    for fixture, entry in fixtures.items():
        for name, margin in (entry.get("margins") or {}).items():
            if margin.get("knife_edge"):
                excused.append({
                    "fixture": fixture,
                    "decision": name,
                    "margin": margin.get("tightest_margin"),
                    "note": "golden margin < 1e-3; a chain mismatch here is a threshold flip, "
                            "not a port defect",
                })

    return {
        "schema": "harmonizer.ios-parity/ParityReport@1",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "oracle": {
            "analyze_track_revision": oracle_revision(),
            "fixtures": str(fixtures_dir),
            "port_layers": str(port_path) if port_path else None,
        },
        "coverage": COVERAGE_NOTE,
        "fixtures": fixtures,
        "knife_edge_decisions": excused,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--fixtures", default=str(HERE / "fixtures"))
    parser.add_argument("--port", default=None,
                        help="JSONL of PARITY_LAYER rows from the Swift parity suite")
    parser.add_argument("--out", default=str(HERE / "ParityReport.json"))
    args = parser.parse_args()

    fixtures_dir = Path(args.fixtures)
    if not (fixtures_dir / "layers").is_dir():
        print(f"parity_report: no layers under {fixtures_dir}", file=sys.stderr)
        return 2

    report = build(fixtures_dir, Path(args.port) if args.port else None)
    out = Path(args.out)
    out.write_text(json.dumps(report, indent=2) + "\n", newline="\n")

    fixtures = report["fixtures"]
    with_layers = sum(1 for f in fixtures.values() if f.get("layers"))
    with_margins = sum(1 for f in fixtures.values() if f.get("margins"))
    print(f"parity_report: {len(fixtures)} fixtures, {with_margins} with margins, "
          f"{with_layers} with port layers -> {out}")
    if report["knife_edge_decisions"]:
        print(f"parity_report: {len(report['knife_edge_decisions'])} knife-edge decision(s) "
              f"(< 1e-3 from their threshold)")
    if not args.port:
        print("parity_report: no --port given, so the layers section is empty "
              "(run tools/parity-report.sh in the iOS repo first)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
