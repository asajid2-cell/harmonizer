# 01: Architecture decision

## Principle

**The device is the player and the engine. The server is an optional analyst and fetcher.**
Everything the browser does today happens on the device: graph prep, mode decisions, scheduling,
mixing, and FX. Analysis moves onto the device in P7. Until then, and whenever the device cannot
analyze, the server's `/api/process` produces the profile. The server is *required* for one thing
only: acquiring audio from URLs (YouTube, Spotify, SoundCloud, Drive, Cloud Squeeze search). That
needs yt-dlp/spotdl, which cannot ship in an iOS app.

## Decision for each stage

| Stage | Where | Why |
|---|---|---|
| **Acquire, local file** (Files, share sheet, non-DRM Music library item) | Device | The file is already local. |
| **Acquire, URL or cloud search** | Server (`/api/process` with `source=youtube\|spotify\|drive\|cloudsqueeze`, `/api/harmonizer/cloud/search`) | yt-dlp, spotdl, and scdl cannot run on iOS, and should not for ToS reasons. The app then range-downloads the original from `/media/<file>` and caches it. |
| **Decode** to Float32 PCM at native sample rate | Device (`AVAudioFile`) | Cheap. Playback needs PCM anyway. |
| **Analysis** (beats, segments, sections, SSMs, candidates, so the profile JSON) | **Device (P7+)**, server fallback | Compute is small (README fact 4). On-device avoids the 6/hr/IP limit, works offline, and keeps user audio private. Fidelity risk is handled by layered parity gates (04-TESTING.md). |
| **Graph prep** (`preprocessTrack`, neighbors, `prepareLoopCandidates`, `applyCanonAlignment`, voice offsets) | Device, always | Pure, deterministic, and today it already runs in the client. |
| **Mode decisions** (canon, jukebox, eternal, and autocrooner drivers) | Device, always | Pure state machines driven by a seeded RNG. They must run at beat rate with low latency. |
| **Render** (voices, mix, rate, crooner FX) | Device, always (`AVAudioEngine` + C render kernel) | Sample-accurate, works in the background and over AirPlay, and needs no network. |
| **RL policy** | Device evaluates GBRT. It fetches `/api/rl/policy` and `/api/rl/model` when online and caches them; offline it uses the cached model or the heuristic. | Matches the web, and audio never waits on the network. |
| **RL telemetry** (`/api/rl/jump-event`) | Device queues and batches it, server receives. **Opt-in.** | Non-blocking, as in the web (`sendBeacon`). |
| **Thin-player render** (`/api/background-render`) | Server, **fallback only** | Used for export/share, or as an escape hatch when the device engine is unhealthy. Lower fidelity: the server's canon and jukebox renderers differ from the live engine (FINDINGS 1–3), and it cannot do autocrooner. In this case the app is purely the `AVPlayer` of an m4a. |
| **Cast** | Device via native AirPlay. LMS/squeezebox cast is **deferred**. | AirPlay comes free from `AVAudioSession`. The LMS path needs a PCM-over-WebSocket sender, which is out of v1 scope. |

## Decision for each mode

| Mode | Engine (device) | Voices | Server fallback |
|---|---|---|---|
| canon | `CanonDriver` + `VoiceBank` (jremix `playQ` semantics) | 2–8 (slider). Voice 0 follows the `canon_alignment` pairs. Voices 1+ use independent bar-offset paths with random offset jumps. | background-render `canon` (static offsets, approximate) |
| jukebox | `JukeboxDriver(mode: .jukebox)` | 1 | background-render `jukebox` (simpler walker) |
| eternal | `JukeboxDriver(mode: .eternal)` | 2 (main + fixed alignment overlay) | background-render `eternal` (simpler walker, no overlay) |
| autocrooner | `AutoCroonerDriver` + `CroonerFX` | 1, rate-modulated | **None.** The server coerces it to linear. Device only. |

## Fallback tree (runtime)

```
ACQUIRE
  local file ............................ decode on device -> sourceHash = SHA-256(file bytes)
  URL / cloud search .................... [online?] no -> "needs connection"
                                          yes -> POST /api/process (source=url kind) -> poll status
                                              -> GET /data/<trackId>.json (profile)
                                              -> GET /media/<file> (original) -> decode on device
ANALYZE (local-file tracks)
  1. ProfileCache[sourceHash, analyzerId] hit ............ use it
  2. on-device analyzer enabled AND beats_est <= 4000
     AND device not thermal-critical ...................... analyze on device (analyzerId "ios-<ver>")
  3. online AND not rate-limited ........................ upload via /api/process (source=upload),
                                                          cache profile with analyzerId "server-local-1.0"
  4. otherwise ........................................... play linearly; offer "analyze when online"
PLAY
  1. on-device engine (all four modes) ................... default
  2. engine health fails (sustained underruns, or a
     render-time budget overrun on this device) .......... offer thin-player: /api/background-render
                                                          (canon/jukebox/eternal; not autocrooner)
  3. user taps Export ................................... on-device offline render to m4a (P8);
                                                          server render only if the device is unable
RL
  online -> fetch policy + model (cache 24 h) | offline -> cached model or heuristic | logging queued if opt-in
```

The analyzer is recorded in the profile (`analysis.version`: `"local-1.0"` is the server today, and
`"ios-1.0"` is new). Cache keys include it. A server profile and a device profile for the same
audio can coexist. The user-visible engine never cares which one it got.

## Module layout (iOS repo `HarmonizerMobile`)

```
project.yml                      XcodeGen. iOS 17.0 min, Swift 6 language mode
App/                             SwiftUI app target (library, now-playing, mode picker, settings, ring view)
Packages/
  HarmonizerCore/                pure Swift, no AVFoundation. `swift test` runs on macOS
    Profile/                     Codable profile schema (tolerant decoding), TrackModel (quanta graph)
    Prep/                        preprocess, neighbors, loop candidates, canon alignment, voice offsets
    Engines/                     CanonDriver, JukeboxDriver, AutoCroonerDriver, VoiceBank, RLScorer
    Random/                      Mulberry32 (parity RNG) and the RNG-stream discipline
  HarmonizerAnalysis/            Accelerate/vDSP librosa-equivalent port (P7). Depends on Core for the schema
  HarmonizerAudio/
    RenderKernel (C target)      real-time mixer: voices, read heads, rate interpolation, pan, biquads, crooner FX
    AudioEngineHost.swift        AVAudioEngine + AVAudioSourceNode, session, interruptions, route changes
    Scheduler.swift              runs the engine ahead of the audio clock into an SPSC command ring
    OfflineRenderer.swift        same kernel driven offline (tests and export)
  HarmonizerNet/                 API client: process, status, data, media, background-render, rl, cloud search
tools/verify.sh                  lint -> xcodegen -> swift test (packages) -> xcodebuild test (app)
Fixtures/                        copied from harmonizer/tools/ios-parity/fixtures (with a manifest and hashes)
```

### Real-time design (why a C kernel and a lookahead ring)

- Web Audio's model is `playQ` → `setTimeout(remaining)`. Its tick timing jitters, but the audible
  stream is "continuous sources, restarted on discontinuity". The native port keeps exactly
  that *semantics* and removes the jitter.
- **Scheduler thread** (non-real-time): runs the driver ahead to keep about 1 s queued. Each tick
  emits commands stamped with an output-frame time: `startTick(frame)`, `voiceSeek(v, srcFrame,
  declick)`, `voiceGain`, `setRate`, `fx params`. The tick boundary is the output frame where the
  main read head reaches the end of the current beat. That is computed exactly from beat
  start/duration in source frames divided by the rate.
- **Render kernel** (real-time, C): one read head per voice (double source position, advanced by
  `rate` per output frame, cubic/linear interpolation when rate ≠ 1). It applies commands at their
  exact frame, mixes with constant gains and equal-power pans, runs the 250 Hz HP on overlays and
  the crooner chain when enabled, and soft-guards peaks. There is no allocation, locking, or Swift
  ARC on the render thread.
- **Mode switch or voice-count change** rebuilds the engine and flushes the ring, the same as the
  web's page redirect but without re-analysis.
- **Mixed declick.** The web restarts sources hard, with no crossfade. The port adds a 3 ms
  equal-power declick on any voice seek. It is a **documented deviation**, can be turned off in
  tests (`declickMs = 0`) so sample parity holds against the reference mix, and is on in the app.
- **AVAudioSession:** `.playback`, background-audio mode, interruption and route-change handling
  (pattern reused from `LocalPlayback.swift.transport:360-447`), plus `MPNowPlayingInfoCenter` and
  `MPRemoteCommandCenter` (398–438). Play/pause is supported. "Next" maps to "force jump now" in
  jukebox/eternal and to "next track" otherwise.
