# 04: Test and quality strategy

## 0. Oracles: what is truth

| Behavior | Oracle | Not an oracle |
|---|---|---|
| Analysis profile | `backend/analysis/analyze_track.py` under pinned versions (`tools/ios-parity/requirements-oracle.txt`) | — |
| Graph prep, mode decisions, voice logic | **Live JS** (`visualizer.js` drivers + `jremix.js` `playQ`) run headless with Mulberry32 (`trace.mjs`) | `stream_synth.py`, `eternal_jukebox_engine.js`, `app.py` background render (FINDINGS 1–2) |
| Rendered samples (no FX) | `ref_mix.py` (trace + PCM → samples, native semantics) | Browser audio capture (timer jitter makes it non-deterministic) |
| Crooner FX | Web Audio spec formulas for each component | End-to-end waveform (FX noise is random by design) |

`stream_synth.py` may still be used as a **smoke comparison** for coarse statistics (jump rate,
coverage) but never as a gate.

## 1. Determinism contract (decision parity)

- Mulberry32, exact JS `Math.imul` semantics, output `(t ^ t>>>14) >>> 0) / 4294967296`. Swift uses
  `UInt32` wrapping arithmetic.
- **One decision stream** per session, seeded at the point equivalent to the harness's
  post-`getPlayer()` re-seed. The FX RNG is a separate stream.
- The draw order inside a tick follows the JS exactly: `VoiceBank` (`maybeJumpVoiceOffset` draws for
  voices 1+, in voice order) **before** the driver's draws.
- Ties: replicate JS stable sort and comparator results. Object-key iteration is ascending numeric
  for integer-like keys. `indexOf` returns the first match.
- Floats: Double everywhere in the engine. Divergence from libm `exp`/`pow` ULP differences is the
  only accepted kind, and it must be proven by margin (P3 done-criterion).

Trace matrix (P0 → P3): fixtures × {canon v2, v3, v5, v8, jukebox, eternal, autocrooner} ×
{baseline, heuristic-only (empty model), fixture GBRT} × seeds {1, 42, 0xC0FFEE} × 5,000 ticks.
The comparison reports the first divergent tick with full state on both sides.

## 2. Analysis parity (P7): layered goldens

Compare **each layer with its golden input fed in** (unit parity) and then **end to end** (chain
parity). Report per-fixture worst-case and p99 errors to `ParityReport.json` on every run, so drift
is visible even while gates pass.

### 2.1 Layer tolerances (unit parity, golden inputs)

| Layer | Metric | Gate |
|---|---|---|
| mono PCM (WAV/FLAC) | max abs | ≤ 1e-7 (exact decode) |
| STFT magnitude | max rel (bins > −80 dB) | ≤ 1e-4 |
| RMS / dB | max abs dB | ≤ 0.01 dB |
| mel / MFCC | max abs | ≤ 1e-3 |
| delta | max abs | ≤ 1e-4 |
| onset envelope | max abs (normalized) | ≤ 1e-3; peak frames identical |
| tempo | abs BPM | ≤ 0.1 |
| beat frames | exact match ratio | 100% synthetic; ≥ 98% real (rest ±1 frame) |
| chroma (CQT) | per-frame cosine | p05 ≥ 0.98 |
| segments | boundary match ±1 frame | ≥ 97% |
| sections | boundary ±1 beat; membership agreement | ≥ 95% |
| canon SSM | max abs | ≤ 1e-4 |
| canon alignment (golden SSM in) | offsets, runs, pairs | **exact** |
| eternal candidates (golden features in) | edges and scores | **exact** (scores ≤ 1e-6) |
| canon candidates / global offsets (golden in) | lists | **exact** |

### 2.2 Chain tolerances (Swift end to end vs Python)

Beat count within ±1%. Beat times within ±1 hop (11.6 ms at 44.1 kHz) for ≥ 98%. Key/mode equal on
synthetic. Canon pairs agreement ≥ 95%. Eternal top-k edge Jaccard ≥ 0.9. Global voice offsets:
same first 3 in any order.

### 2.3 Behavioral gate (what users hear)

Run the Swift engine for 2,000 ticks on (a) the Python profile and (b) the Swift profile, with the
same seed. Compare jump rate (±15%), beat coverage (±10%), mean jump similarity (±0.05), and
canon-overlay restart rate (±15%). This catches cases where layer errors pass individually but
change the musical behavior.

### 2.4 Threshold-margin fixtures

The canon alignment uses hard thresholds (.55/.50/.45/.40, .375, .4 loop edges) and greedy
selection, so a 1e-4 SSM shift can flip a decision. `dump_layers.py` also emits, per fixture, the
**margin** of each decision from its threshold. Chain-parity mismatches are excused only where the
golden margin is < 1e-3, and they are listed in `ParityReport.json`.

## 3. Test pyramid (iOS repo)

| Level | Where | Contents | Runs |
|---|---|---|---|
| Unit | `swift test` in each package | RNG, schema decoding, every prep function, each driver rule (dwell, floors, softmax, cooldowns) with hand-built mini-profiles, GBRT eval, each DSP primitive (window, FFT scaling, mel bank, DCT, savgol, peak_pick, biquad, pan law) | every verify |
| Parity | `swift test --filter Parity` | P2 prep parity, P3 trace parity, P7 layer + chain parity, P4 offline-render vs `ref_mix` | every verify (P7 heavy set behind `PARITY_FULL=1` nightly) |
| Integration | `xcodebuild test` | Scheduler + kernel in manual-rendering mode; fallback tree with injected net/analyzer; ProfileCache; export | every verify |
| Contract | `HarmonizerNetTests` | decode recorded responses; typed errors | every verify; live smoke behind `LIVE=1` (≤1 `/api/process` per run) |
| UI | XCUITest + `iosrun` screenshots | import → play each mode; settings; dead-control lint | every verify (simulator by UDID) |
| On-device audio | manual + scripted | 30 min / 2 h soak, underrun counter, Instruments allocations on the render thread, thermal, background, interruptions (call/Siri/alarm), AirPlay, Bluetooth route changes | P4, P8, P9 |
| Human gate | user | side-by-side vs the web page per mode; crooner FX character | P9 only |

## 4. Traps already paid for (from sibling iOS lanes)

- `xcodebuild … | tail` returns the pager's exit code. Use `set -o pipefail` and check `PIPESTATUS`.
- `simctl … booted` is ambiguous when more than one sim is booted. Always address by UDID.
- A guard that returns early on missing env made a live suite "pass" in 0.001 s. Missing
  `LIVE` creds must **fail** in live mode, not skip silently.
- Ground tests on captured fixtures, not hand-written mocks.
- Wi-Fi SSH to the mini drops during long builds. Run them detached (`nohup … &`) and poll the log.
