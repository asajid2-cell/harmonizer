# Harmonizer iOS port: plan of record

Status: **plan only, no product code written.** Planned 2026-10-01 against `asajid2-cell/harmonizer`
branch `static` @ `a365e09`.

Scope: a native iOS (Swift) app that runs the **canon (autocanonizer), jukebox, eternal jukebox, and
autocrooner** modes. It is local-first. Playback and the mode engines always run on the device.
Analysis runs on the device once ported, and on the existing server until then or whenever the
device cannot do it. The other ~18 algorithms (dopamine, harmonictrap, and so on), autoharmonizer,
the visualizer's drawing, LMS/squeezebox casting, and `hl-auth` are out of scope.

| File | Contents |
|---|---|
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | On-device vs server for each stage and mode, the fallback tree, the module layout |
| [02-PORT-MAPPING.md](02-PORT-MAPPING.md) | JS to Swift and Python to Swift mapping with source line references, plus what stays on the server |
| [03-PHASES.md](03-PHASES.md) | Ordered build phases P0 to P9, each with a concrete done-criterion |
| [04-TESTING.md](04-TESTING.md) | Oracles, golden fixtures, tolerances, and the test pyramid |
| [05-CAMPAIGN.md](05-CAMPAIGN.md) | The persist task-campaign to execute the port |
| [FINDINGS.md](FINDINGS.md) | Facts found while reading that change the port, and divergences in the current product |

## Five facts that shape everything

1. **The live engine is in `frontend/js/visualizer.js`, not in `eternal_jukebox_engine.js`.**
   `Driver(player)` (visualizer.js:21845) routes canon to `createCanonDriver` (8292), jukebox and
   eternal to `createJukeboxDriver` (9102), and autocrooner to `createAutoCroonerDriver` (14554).
   Nothing instantiates `EternalJukeboxEngine`. **The port target is the visualizer drivers plus the
   `jremix.js` player (`playQ`).**
2. **`backend/analysis/stream_synth.py` is not a parity oracle.** It faithfully ports the *unused*
   `EternalJukeboxEngine` and uses a different overlay scheme. The background-render walker in
   `app.py:701-914` is a third, simpler engine. The only valid oracle for live behavior is the JS
   itself, run headless with a seeded RNG (see 04-TESTING.md).
3. **The server never renders the four modes during normal use.** `/api/process` returns an
   analysis profile (`/data/<id>.json`). The browser downloads the original audio (`/media/...`) and
   remixes it locally. The iOS app therefore needs only profile JSON + PCM to do everything the
   browser does, so on-device playback is no regression.
4. **On-device analysis is feasible.** It is a librosa pipeline (STFT/MFCC/onset/beat_track/
   chroma_cqt/agglomerative) followed by O(B²) beat self-similarity, where B is about 2 beats per
   second. A 10-minute track has B ≈ 1200, so the canon SSM is a 1200×455×1200 GEMM (~0.65 GFLOP)
   and a 5.8 MB matrix, which takes milliseconds with Accelerate. The hard parts are *parity*
   (CQT chroma, the beat tracker DP, sklearn Ward clustering, and exact librosa defaults), not
   compute.
5. **Decisions do not depend on the clock.** In the driver ranges, `Date.now()` feeds only logs and
   stats displays. That means a seeded headless run of the JS produces a deterministic
   *decision trace* that Swift must reproduce tick for tick.

## Where things live

- This plan: `harmonizer/docs/ios-port/` (PC, `Z:\328\CMPUT328-A2\codexworks\301\harmonizer`).
- Parity oracles + fixtures (test tooling, not product): `harmonizer/tools/ios-parity/` (PC; has
  Python 3.12 with librosa 0.11.0, numpy 1.26.4, scipy 1.16.2, soundfile 0.13.1/libsndfile 1.2.2,
  sklearn 1.7.2, plus Node).
- iOS app: new repo `~/Developer/HarmonizerMobile` on the Mac mini (`ssh mini`; Xcode 26.6,
  Swift 6.3.3, macOS 26.5.2; XcodeGen at `/opt/homebrew/bin/xcodegen`, which is not on the
  non-interactive SSH PATH). The intended GitHub remote is `asajid2-cell/harmonizer-ios`, which
  must be created. The mini cannot push with its own credentials, so inject a token from Windows
  (see memory `choralus-mobile-repo`).
