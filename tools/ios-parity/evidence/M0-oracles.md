# M0 / P0 oracle evidence

Date: 2026-10-01. Repo: `harmonizer` @ `static`. Produced by `tools/ios-parity/run_oracles.py` and
`tools/ios-parity/js/trace.mjs`.

P0's done-criterion is "regenerate everything twice with byte-identical hashes". Two independent
gates are run, each of which regenerates the whole corpus twice inside throw-away directories:

```
python tools/ios-parity/run_oracles.py --check     # full pipeline, twice, vs the committed MANIFEST
node   tools/ios-parity/js/trace.mjs  --check      # trace matrix, twice, vs the committed fixtures
```

## Gate result

| Gate | Command | Result |
|---|---|---|
| Full pipeline | `run_oracles.py --check` | **PASS** - `PASS: both runs produced 1350 identical hashes`, `PASS: committed manifest matches a fresh run`; `oracles-exit=0` |
| Trace matrix | `trace.mjs --check` | **PASS** - `CHECK OK: 819 traces identical across two runs`, `CHECK OK: committed fixtures match a fresh run`; `trace-exit=0` |

Both gates were green on the same corpus: 1,350 hashed files regenerated twice with byte-identical
hashes, and 819 traces regenerated twice with byte-identical hashes. P0's done-criterion is met.

Raw logs: `evidence/M0-generate.log` (canonical generation), `evidence/M0-check.log` (both gates).

**Stale-manifest blocker (2026-10-01), resolved.** The first `--check` pair ran against a
`MANIFEST.sha256` whose mtime (06:49:03) predated the LF determinism fixes, so it described
CRLF-era bytes. Both gates therefore compared a fresh run to a receipt for a corpus that no longer
existed. The fix was to regenerate the canonical corpus first (`M0-generate.log`: 1,350 files,
`regen-exit=0`), which makes `MANIFEST.sha256` describe the bytes that are actually committed.
The same session also hit a host-level process-spawn fault (every `Bash`/`PowerShell` command was
silently routed to a background task with an empty output file, while in-process file reads kept
working) - the same fault as the earlier `0xC0000142` `STATUS_DLL_INIT_FAILED` trace-child failure.
It cleared on its own; it was never a defect in the oracle tooling.

**`LICENSES.md` file-set defect (found by the first green `--check`).** `run_oracles.py --check`
reported `FAIL: committed manifest differs from a fresh run` with a single difference,
`- 7c15a44f…  LICENSES.md`, even though the two fresh runs were byte-identical (1,349 hashes each).
Root cause: `stage_audio` seeds the committed `real_*.flac` into a check directory because
`fetch_real.py` needs the network, but nothing seeded `LICENSES.md` - which also lives in
`fixtures/` and is therefore in the manifest. So a fresh check directory held 1,349 files and the
committed corpus held 1,350, and the comparison failed on the *file set* rather than on any
divergence. Fixed in `run_oracles.py` with a `stage_versioned(out_dir)` stage that copies
`LICENSES.md` into any non-canonical out dir, called from `generate()` alongside `stage_audio`.

## Oracle environment

Pinned to the **live production container**, read 2026-10-01 over tier-3 (HS1). Full table, the
verbatim prod probe, and the one residual difference (CPython 3.11.15 vs 3.11.0) are in
`ORACLE_ENV.md`; the pins themselves are in `requirements-oracle.txt`. The venv reproduces prod at
every version that can move a DSP result (numpy 2.4.4, scipy 1.17.1, librosa 0.11.0, scikit-learn
1.9.0, soundfile 0.14.0, libsndfile 1.2.2).

The JS side is the shipped browser source, unmodified, under Node v22.20.0 + jsdom 26.1.0
(`js/package.json`, `js/package-lock.json`). `trace.mjs` asserts the Mulberry32 stream against a
pinned 3-seed vector at startup, so a Node/JS-engine change cannot silently move the traces.

## Fixture corpus

13 fixtures, 16 MB total (budget ≤ 40 MB): 10 deterministic synthetic (`gen_synthetic.py`) plus 3
real CC0 tracks (`fetch_real.py`, provenance and transcode commands in `fixtures/LICENSES.md`).

| fixture | kind | beats | bars | sections | canon loops |
|---|---|---|---|---|---|
| synth_click_chord_120 | synthetic | 47 | 12 | 6 | 82 |
| synth_mono_44100 | synthetic | 47 | 12 | 6 | 82 |
| synth_ramp_100_130 | synthetic | 50 | 13 | 7 | 28 |
| synth_silence_intro_outro | synthetic | 36 | 9 | 5 | 38 |
| synth_sr_22050 / 44100 / 48000 | synthetic | 47-48 | 12 | 6 | 82-90 |
| synth_stereo_44100 | synthetic | 47 | 12 | 6 | 82 |
| synth_swing_97 | synthetic | 38 | 10 | 5 | 0 |
| synth_waltz_34 | synthetic | 47 | 12 | 6 | 72 |
| real_acoustic | real CC0 | 315 | 79 | 14 | 721 |
| real_electronic | real CC0 | 336 | 84 | 12 | 976 |
| real_pop | real CC0 | 358 | 90 | 13 | 2757 |

**FINDING #11 consequence.** The eternal-loop energy gate compares dB multiplicatively
(`analyze_track.py:1415`), so a constant-level fixture yields an empty loop graph. `gen_synthetic.py`
therefore applies a ramped ~23 dB per-section envelope (`SECTION_GAIN_DB`); every synthetic fixture
now produces a non-empty `eternal_loop_candidates` set (2-53 edges) instead of the degenerate 0.

## What the corpus contains

`fixtures/` holds 1,350 hashed files: 13 audio inputs, 13 profiles (`build_profile`, the oracle),
403 layer files (`layers/<id>/<stage>.f32` + shape header — 19 stages per fixture, `stft_mag`
truncated to 200 frames), 91 prep files, 819 decision traces, 10 sample-level refmix outputs, and
`MANIFEST.sha256`.

**Trace matrix: 819 traces** = 13 fixtures × {canon v2, v3, v5, v8, jukebox, eternal, autocrooner} ×
{baseline, heuristic, fixture-GBRT} × {seed 1, 42, 0xC0FFEE} × 5,000 ticks. The fixture GBRT is the
repo's shipped `rl_models/model.json` (sha256 `251bfee3…9feb`); `/api/rl/model` is auth-gated (401)
so the committed model is the fixture model.

`refmix/` carries one 10 s sample-level mix per mode (canon v2, canon v3, jukebox v2, eternal v2,
autocrooner v2), the P4 render oracle.

## Determinism notes

- **Goldens are written with LF on every host.** `Path.write_text` translates `"\n"` to the host's
  line separator, so the first corpus was produced on Windows with CRLF in `layers/*.json`,
  `profiles/*.json`, `refmix/*.json` and `MANIFEST.sha256`. Two consequences the P0 criterion
  cannot see, because it only ever runs on one machine: the same source regenerated on macOS or
  Linux yields different bytes for every one of those files, and `dump_layers.write_json` records
  the sha256 of the *untranslated* text in the shape header, so on Windows each header described
  bytes the file did not contain. `newline="\n"` is now passed explicitly in `dump_layers.py`,
  `ref_mix.py` and `run_oracles.py`, and the corpus was regenerated. The manifest is also ordinary
  `sha256sum` input again. (Found by the `FixturesManifestTests` check on the mini, not by the
  P0 gate: a single-platform gate cannot detect a platform-dependent writer.)
  - **Residual exception: `profiles/*.json` is still CRLF on Windows** (verified 2026-10-01:
    `grep -U $'\r'` matches `profiles/real_pop.json` and `profiles/synth_waltz_34.json`, while
    `layers/`, `prep/` and `MANIFEST.sha256` are clean LF). `dump_layers.py:241` obtains the profile
    by calling the **product** function `at.build_profile(output_path=…)`, and that function writes
    via `output_path.open("w", encoding="utf-8")` + `json.dump` with no `newline=""`
    (`backend/analysis/analyze_track.py:1694-1695`), so the text layer translates `\n` to `\r\n` on
    Windows. The campaign scope rule restricts harmonizer edits to `tools/ios-parity/**` and
    `docs/ios-port/**`, so the tooling cannot fix this: **reporting only.** Consequence for the port:
    the 13 `profiles/*.json` goldens are not byte-portable across platforms, so a macOS/Linux
    regeneration would produce different bytes for those 13 files and the manifest would move. It
    does not affect either P0 gate, which always runs both passes on the same host. Recorded as a
    finding for the M1 `FixturesManifestTests` on the mini, which is the check that can see it.
- Python goldens are byte-identical across runs; the only non-reproducible field in the whole tree
  was the wall-clock `seconds` in `layers_summary.json`, so that file is a timing report and is
  excluded from the manifest.
- `trace.mjs` runs each fixture in its own short-lived child process: one JSDOM + full visualizer
  evaluation per trace is not fully reclaimed by V8, and ~800 traces in one process exhaust the heap.
  Children are deterministic, so the resulting tree is the same as a single process would produce.
- Prep files are keyed `<fixture>__<mode>-v<voices>.json` (91 = 13 × 7). `03-PHASES.md` step 4 wrote
  `prep/<fixture>.json`, but the prep payload is genuinely mode- and voice-count-dependent
  (`beats[].others`, `voiceGains`, `voiceOffsets`, `effectiveSettings`), so per-fixture is not
  expressible; the harness asserts prep is seed- and policy-independent and reports a conflict
  otherwise.
- `03-PHASES.md` names canon v4 in the refmix set; the trace matrix defines canon v2/v3/v5/v8, so the
  refmix config uses canon v3.

## Harness contract (for the Swift port)

- Driver state per tick: `{tick, mainBeat, mainRestart, voices:[{beat,restart,offset}], rate, draws,
  delay}`. `draws` is the exact count of `Math.random` calls consumed in that tick and is the
  strongest single parity signal.
- RNG: Mulberry32 seeded before evaluation, immediately after every `getPlayer()`, and immediately
  before every `Driver()` construction, so construction-only FX entropy cannot perturb decisions.
  Reference vectors: `node js/trace.mjs --rng-vector` (seeds 1, 42, 12648430).
- When several canon voices start on the same beat, destination nodes alone cannot attribute a
  source to a voice; the harness matches such starts one-to-one in creation order, which is exact
  when the observation count equals the number of voices on that beat. After this resolution the
  corpus has **0 unattributed observations** (previously 2,014, all canon).
