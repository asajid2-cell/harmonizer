# 05: Persist task-campaign plan

The peer (canonizer lane) invokes this campaign itself. This file is the input for it.

## Goal

Ship a local-first native iOS Harmonizer app (`HarmonizerMobile`) that plays canon (2-8 voices),
jukebox, eternal, and autocrooner on the device with decision parity against the live web engine.
Tracks are analyzed on the device, with the server as a fallback. URL acquisition and the
thin-player render stay on the server.

## Done when

- P0-P8 gates in 03-PHASES.md are green, with their evidence logs checked in under
  `HarmonizerMobile/evidence/P<n>/`. P0 evidence lives in `harmonizer/tools/ios-parity/evidence/`.
- P9: the build is in internal TestFlight **and** the user has signed off on the side-by-side
  listening gate.

## Scope rules

- **The harmonizer repo gets test tooling only:** `tools/ios-parity/**` and `docs/ios-port/**`. No
  edits to `frontend/`, `backend/`, or `app.py`. The oracles import the product code unmodified.
- The FINDINGS 1-4 divergences are **reported, not fixed**. They go to the harmonizer lane owner.
- All app code lives in `~/Developer/HarmonizerMobile` on the mini. The remote is
  `asajid2-cell/harmonizer-ios`.
- Out of scope: hl-auth, LMS/squeezebox cast, autoharmonizer, the ~18 other algorithms, and
  server-side changes of any kind.

## Milestones

| # | Milestone | Where | Gate command | Evidence |
|---|---|---|---|---|
| M0 | P0 oracles + fixtures | PC | `python tools/ios-parity/run_oracles.py --check` and `node tools/ios-parity/js/trace.mjs --check` (each twice) | `MANIFEST.sha256` stable across runs; `ORACLE_ENV.md`; trace matrix count |
| M1 | P1 repo skeleton | mini | `tools/verify.sh` | green log; `iosrun` screenshot |
| M2 | P2 profile + prep parity | mini | `swift test --filter PrepParity` (inside verify) | all fixtures equal `prep/*.json`; RNG 10k × 3 seeds; FINDINGS 9 resolved in a note |
| M3 | P3 decision engines | mini | `swift test --filter TraceParity` | 5,000 ticks identical for every trace; `PARITY_EXCEPTIONS.md` (expected empty or libm-only) |
| M4 | P4 render kernel + FX | mini | `swift test --filter RenderParity`, FX component tests, 30-min sim soak | max abs err ≤ 1e-6; FX tables; underrun = 0; render-thread alloc = 0 |
| M5 | P5 network client | mini | verify + `LIVE=1 swift test --filter NetLive` | contract tests on `Fixtures/http/`; one live round-trip log |
| M6 | P6 app shell end to end | mini | verify (XCUITest) + `dead-control-lint.sh` | screenshots of 4 modes; 60 s background tick count |
| M7 | P7 on-device analysis (7a-7k, one sub-milestone each) | mini (+ PC to regenerate goldens) | `swift test --filter AnalysisParity` (+ `PARITY_FULL=1` for the full set) | `ParityReport.json` per sub-stage; behavioral gate; timing + peak memory |
| M8 | P8 local-first + hardening | mini + device | verify + fallback tests + 2 h device soak per mode | branch coverage table; soak logs; exported m4a plays in Files |
| M9 | P9 release | mini GUI + user | GUI archive/upload | TestFlight build N; user sign-off recorded |

Sequencing: strictly M0 → M3. M4 can start once M2 is done, because it needs only traces and PCM.
M5 can run in parallel with M3/M4. M6 needs M3 + M4 + M5. M7 needs M6, since it lands on a proven
engine. Within M7, sub-stages run in order.

## Hard stops (need the user or a higher tier)

1. **M0:** tier-3 `keysafe run harmonizer-admin` to read the prod `pip freeze`. If it is refused,
   pin to the PC set and record the gap. **This does not block the campaign.**
2. **M1:** create the GitHub repo `asajid2-cell/harmonizer-ios` and supply a push token, injected
   from Windows and never stored on the mini.
3. **M5:** permission for the live smoke test (it uses 1 of the 6/hr `/api/process` budget).
4. **M8:** physical device available for the 2 h soaks.
5. **M9:** GUI-session archive + upload, and the listening sign-off.

## Checkpoint cadence

- At the end of each milestone: commit + push in the owning repo, write a 5-line status entry to
  `HarmonizerMobile/CAMPAIGN_LOG.md` (milestone, gate result, evidence path, open issues, next),
  and send a peer update to the canonizer lane.
- Mid-milestone, for any session longer than ~2 h of work, or before a context compaction: a WIP
  commit on a branch, plus a log entry.
- A failing gate is never marked done. Divergences go to `PARITY_EXCEPTIONS.md` only with harness
  proof (pick margin < 1e-12, or golden threshold margin < 1e-3 for analysis).

## Risks to watch

| Risk | Mitigation |
|---|---|
| `visualizer.js` will not load headless under jsdom | `extract_drivers.mjs` fallback (P0 step 4) |
| Hidden RNG draw-order differences | per-tick draw count in traces; first-divergence dump |
| librosa beat tracker / CQT parity | port the pinned source; tolerance gates + behavioral gate rather than exactness for CQT |
| Real-time budget on older devices | C kernel, no allocation, health monitor → thin-player offer |
| Wi-Fi SSH drops during builds | `nohup` builds, poll logs |

## Deferred (explicitly not in this campaign)

LMS/squeezebox cast; autoharmonizer and the other algorithms; fixing the server divergences in
FINDINGS 1-4; Android; App Store (public) release.

## User authorizations (2026-10-01) - resolves the hard stops

- **HS1** tier-3 `keysafe run harmonizer-admin`: **authorized**.
- **HS2** create `asajid2-cell/harmonizer-ios` and push: **authorized** - push from Windows or from
  the mini, whichever works.
- **HS3** live `/api/process` smoke test: **authorized**; the box is live and downtime is acceptable.
- **HS4** physical-device soaks: **deferred to the end** - use the simulator meanwhile.
- **HS5** GUI archive/upload + side-by-side listening sign-off: **deferred to the end** (human testing).

Also authorized: any tests needed against the live box.

iOS design language / conventions: consult peer session `83b118e2-edd0-40a9-8a41-369ea7723d1d`
(the user's iOS teammate, who has shipped app work) - use as a team member for the app shell.
