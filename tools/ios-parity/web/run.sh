#!/usr/bin/env bash
# ITEM B: the empirical web-vs-app render comparison.
#
# For each case this renders the same (PCM, beats, decision trace) twice - once through the
# real frontend/jremix.js player in headless Chrome's Web Audio (the web client), once through
# ref_mix.py (the app-side oracle the C kernel is bit-exact to, P4) - and diffs the samples.
# It then runs the filter probe that attributes any residual to a specific Web Audio node.
#
# Needs Chrome, node, and the tools/ios-parity .venv (numpy + soundfile).  Run from anywhere:
#   tools/ios-parity/web/run.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"           # tools/ios-parity
FIX="$ROOT/fixtures"
OUT="$HERE/out"
PY="$ROOT/.venv/Scripts/python.exe"
[ -x "$PY" ] || PY="$ROOT/.venv/bin/python"
mkdir -p "$OUT"

render() { node "$HERE/web_render.mjs" --case "$1" --out "$2" --timeout 300000 >/dev/null; }

echo "=== A: main-only (jukebox, 1 voice), 10s window ==="
"$PY" "$HERE/make_case.py" --fixture real_acoustic --trace canon-v2-baseline-s1.jsonl \
  --mode jukebox --voice-count 1 --seconds 10 --strip-voices --out "$OUT/caseA.json" >/dev/null
"$PY" - "$FIX" "$OUT" <<'PYEOF'
import json, pathlib, sys
fix, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
src = fix / "traces/real_acoustic/canon-v2-baseline-s1.jsonl"
rows = [json.loads(l) for l in src.read_text().splitlines() if l.strip()]
for r in rows: r["voices"] = []
(out / "canon-v2-stripped.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
PYEOF
"$PY" "$ROOT/ref_mix.py" --trace "$OUT/canon-v2-stripped.jsonl" --pcm "$FIX/audio/real_acoustic.flac" \
  --profile "$FIX/profiles/real_acoustic.json" --seconds 10 --out "$OUT/refA.f32"
render "$OUT/caseA.json" "$OUT/webA.f32"
"$PY" "$HERE/compare.py" --web "$OUT/webA.f32" --ref "$OUT/refA.f32" --label "main-only 1-voice" --out "$OUT/reportA.json"

echo "=== B: canon (2 voices), 10s window, vs the committed golden ==="
"$PY" "$HERE/make_case.py" --fixture real_acoustic --trace canon-v2-baseline-s1.jsonl \
  --mode canon --voice-count 2 --seconds 10 --out "$OUT/caseB.json" >/dev/null
render "$OUT/caseB.json" "$OUT/webB.f32"
"$PY" "$HERE/compare.py" --web "$OUT/webB.f32" --ref "$FIX/refmix/canon-v2.f32" --label "canon 2-voice 10s vs golden" --out "$OUT/reportB.json"

echo "=== C: canon (3 voices), 10s window, vs the committed golden ==="
"$PY" "$HERE/make_case.py" --fixture real_acoustic --trace canon-v3-baseline-s1.jsonl \
  --mode canon --voice-count 3 --seconds 10 --out "$OUT/caseC.json" >/dev/null
render "$OUT/caseC.json" "$OUT/webC.f32"
"$PY" "$HERE/compare.py" --web "$OUT/webC.f32" --ref "$FIX/refmix/canon-v3.f32" --label "canon 3-voice 10s vs golden" --out "$OUT/reportC.json"

echo "=== D: canon (2 voices), 120s window, vs a fresh ref_mix ==="
"$PY" "$HERE/make_case.py" --fixture real_acoustic --trace canon-v2-baseline-s1.jsonl \
  --mode canon --voice-count 2 --seconds 120 --out "$OUT/caseB120.json" >/dev/null
"$PY" "$ROOT/ref_mix.py" --trace "$FIX/traces/real_acoustic/canon-v2-baseline-s1.jsonl" \
  --pcm "$FIX/audio/real_acoustic.flac" --profile "$FIX/profiles/real_acoustic.json" \
  --seconds 120 --out "$OUT/refB120.f32"
render "$OUT/caseB120.json" "$OUT/webB120.f32"
"$PY" "$HERE/compare.py" --web "$OUT/webB120.f32" --ref "$OUT/refB120.f32" --label "canon 2-voice 120s" --out "$OUT/reportB120.json"

echo "=== filter probe: Chrome highpass(250) and stereoPanner(0.7) vs ref_mix's models ==="
node "$HERE/web_render.mjs" --page "$HERE/filter_probe.html" --out "$OUT/probe.f32" --timeout 300000 >/dev/null
"$PY" "$HERE/filter_compare.py" --probe "$OUT/probe.f32" --out "$OUT/filter_report.json"

echo "=== summary ==="
for r in A B C B120; do
  f="$OUT/report$r.json"
  [ -f "$f" ] && "$PY" -c "import json,sys;d=json.load(open(sys.argv[1]));print('%-34s max_abs=%.3g  bit_exact=%.3f%%  gate=%s'%(d['label'],d['max_abs_error'],d['bit_exact_percent'],'PASS' if d['passes_gate'] else 'FAIL'))" "$f"
done
"$PY" -c "import json,sys;d=json.load(open(sys.argv[1]));print('highpass_250    max_abs=%.3g  bit_exact=%.3f%%'%(d['highpass_250']['max_abs_error'],d['highpass_250']['bit_exact_percent']));print('stereopanner_0.7 max_abs=%.3g  bit_exact=%.3f%%'%(d['stereopanner_0.7']['max_abs_error'],d['stereopanner_0.7']['bit_exact_percent']))" "$OUT/filter_report.json"
