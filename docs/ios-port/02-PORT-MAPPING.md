# 02: Swift port mapping

Line numbers refer to `static` @ `a365e09`. **Port rule:** port *behavior*, not structure. Every
DOM, Raphael, jQuery, `window.*`, and logging side effect is dropped. Global state becomes explicit
struct fields. Every `Math.random()` becomes a call on the injected `ParityRNG`, made **in the same
order and under the same conditions**.

## A. Browser engine → `HarmonizerCore` / `HarmonizerAudio`

### A1. Profile and track graph (`jremix.js`)

| JS | Swift | Notes |
|---|---|---|
| `remixTrack` / `preprocessTrack` (jremix.js:17–108) | `TrackModel.init(profile:)` | Quanta become arrays of structs with `index`, `parent`, `indexInParent`, `children`, `oseg`, `overlappingSegments` stored as index arrays. Do not use object graphs. |
| `connectQuanta` (132–154) | `TrackModel.connect(parent:child:)` | Keep the `last`/`break` scan **exactly**, including the quirk that `last = j` is set only on a match. Parenting edge cases depend on it. |
| `connectFirstOverlappingSegment` (157–174), `connectAllOverlappingSegments` (176–199) | same names | Keep the `<` vs `>` boundary semantics exactly. |
| `filterSegments` / `isSimilar` / `timbral_distance` / `euclidean_distance` (110–130, 1057–1068) | `TrackModel.fsegments` | `euclidean_distance` uses only the **first 3** dims (`i < 3`). Port that quirk as written. |
| `clusterSegments` / `getCentroid` / `findNearestCluster` (1071–1170) | **not ported** | Unreachable from the live init path (verify once in P2 by grep). Uses unseeded k-means. |
| `fetchAudio` (19–61) | `PCMStore.load(url:)` | `AVAudioFile` produces Float32 deinterleaved at the native sample rate. The engine keeps stereo; analysis takes the mono mean. |

### A2. Client-side graph prep (`visualizer.js`)

| JS | Swift `Prep/` | Notes |
|---|---|---|
| Nearest-neighbor build (2523–2616) + segment distance (2623–2637) | `Neighbors.build` | D = ‖Δtimbre‖ + 10‖Δpitches‖ + \|ΔloudStart\| + \|ΔloudMax\| + 100\|Δdur\| + \|Δconf\|. Penalties: parent-index 120, cross-section 420, time ≤70, flow `max(0,5-|Δi|)*22`. Keep 10 (20 in advanced canon). Server-edge distance override is `max(4, 14+(1-simN)*140)`. Sort must be **stable**, with JS `Array.prototype.sort` comparator semantics, to tie-break identically. |
| `prepareLoopCandidates` (2651–2740) | `LoopCandidates.prepare` | `eternal_loop_candidates` first. Merge legacy edges when <18% of beats are sources or there are <2 per beat. Sort by similarity descending, cap 48. Object-key iteration order: JS orders integer-like keys **ascending numeric**, so Swift must iterate sorted keys. |
| `applyCanonAlignment` (2787–2979) | `CanonAlignment.apply` | `pairs.count == beatCount` or fall back. `q.other`, normalized similarity, gains (base 0.46/0.34/0.40 + 0.45·simN, clamp [0.25,1], 0 below threshold). Check whether gain is consumed (FINDINGS 9). |
| Extra canon voices (2821–2931) | `VoiceOffsets.build` | 2–8 voices; eternal is forced to 2. `global_voice_offsets` → `canon_candidates[i]` by `bar_offset`, else `(i + off*bpb) mod N`. Synthesized fallback pool `[4,8,16,32,-4,-8,-16]`. |
| `augmentCanonNeighbors` (4261–4371) | `Neighbors.augmentCanon` | Distance `max(4, 12+(1-simN)*120)`, dedup, cap 12/8. |
| Advanced settings defaults (572–612) + sanitizers | `EngineSettings` (Codable) | One struct per group: canonOverlay, jukeboxLoop, eternalOverlay, eternalLoop, autocrooner. Defaults are listed in the table below. |
| `scoreJumpQuality` + RL (1445–1646, GBRT eval 22034–22070) | `RLScorer` | GBRT: `value <= threshold ? left : right`, `sigmoid(base + lr*Σleaves)`. Blend 0.75 RL + 0.25 heuristic, then the dwell/long-jump/span>128 adjustments. Policy `baseline` returns nil (no scoring). |

Defaults: canon overlay musicality 65, offsets 8–64, dwell 6, density 2, bubble 8, variation 2,
RL min dwell 8, repeat penalty 12. Jukebox: musicality 55, min loop 12, max seq 36, threshold .55,
section bias .6, variance .4, route 8, temperature .25. Eternal overlay: 60/8–64/6/2/8/2. Eternal
loop: 100/16/128/.50/.20/.45/6/.22.

### A3. Mode drivers → `Engines/` (pure state machines)

Shared shape: `mutating func tick(rng: inout ParityRNG) -> TickDecision`, where `TickDecision =
{mainBeat, isJump, voiceTargets[], rate, reason}`. The audio layer never calls the RNG.

| JS | Swift | Size (logic only) | Must preserve |
|---|---|---|---|
| `createCanonDriver` (8292–9101) | `CanonDriver` | ~400 lines | 16-beat phrase dwell. 64-beat stuck window, reset below 0.4 unique. Decays every 16 beats (.96, drop <.2) and bar visits ×.92 after a jump. Candidates: sequential + `canon_pair` + `canon_loop`. Rejection rules. Score penalties (repeat×12, bar visits, edge use). Pool floor 0.65 with dwell relaxations. Top 6. Softmax T=0.25 with **one draw only if the pool has more than one entry**. Baseline vs RL end-of-track behavior. |
| `createJukeboxDriver` (9102–11608) | `JukeboxDriver(mode:)` | ~1,100–1,250 lines | Loop graph build (eternal adds `q.other` edges, 10313–10333). Meter inference 3–8. Time-derived dwell and max-sequential (22 s, 12 s, 38 s). `scheduleNextJump` (1 draw). `chooseJumpIntent` (0 or 1 draw). Unscheduled-jump chance formula (1 comparison draw). Radius-expanding candidate search. **One jitter draw per scored candidate in filtered order.** Pool floors and sizes per intent. Softmax temperature per intent. Route planning (jukebox only) recursion, which consumes draws. Stuck recovery and anchor reentry draws (9407, 9412, 10478). |
| `createAutoCroonerDriver` (14554–14747) | `AutoCroonerDriver` | ~80 lines | `wobblePhase` draw at construction **and** again in `start()` → `rebuildFromSettings`. One jitter draw per valid beat. Rate formula, clamp [.76,.98], slew ±.08. Loop to 0 only if loop is enabled. |
| `Driver(player)` (21845–21911) | `EngineFactory.make(mode:)` | trivial | Crooner FX enabled only for autocrooner. |

### A4. Player semantics (`jremix.js:getPlayer`, 211–995) → `VoiceBank` (Core) + `RenderKernel` (Audio)

| JS | Swift | Notes |
|---|---|---|
| `playQ` main-voice continuity (690–708) | `VoiceBank.main` | Restart iff `curQ == nil \|\| curQ.next != q \|\| trackChanged`. Otherwise the read head keeps running. |
| Overlay logic (717–868) | `VoiceBank.overlays` | Voice 0 uses `q.others[0]` (restart if `prevOther.next != other`). Voices 1+ (only when numVoices > 2) call `maybeJumpVoiceOffset` and then `getVoiceBeatIndex` (restart if not `last+1`). Skew accumulates `q.duration - other.duration` and restarts when \|skew\| > 0.05 s. |
| `maybeJumpVoiceOffset` (583–637) | `VoiceBank.maybeJump` | Canon only. Cooldown 16. p = .3 on `beat%8==0`, else .05. **Draw order: draw1 compared `> p` → return; draw2 picks from the pool minus the current offset.** These draws happen inside `playQ`, i.e. **before** the driver's own draws on the same tick. |
| Gains / pans (475–580) | `MixPlan` | Main 0.85. Overlays `0.65*max(.5, 1/(1+(n-2)*.15))`. Pans: 0 for a single overlay, else evenly spread ±0.7. Overlay HP 250 Hz. |
| `StereoPannerNode` | kernel `panStereo` | Web Audio equal-power law **for stereo input** (spec §StereoPannerNode): for pan ≤ 0, x = pan+1, L += R·cos(xπ/2)... Implement from the spec text, not mono pan. |
| `BiquadFilterNode` HP/LP | kernel `biquad` | **Web Audio LP/HP `Q` is in dB**: α = sin ω0 / (2·10^(Q/20)). Voice HP Q = 1 (default). Crooner Q = 0.7. |
| `setSpeedFactor` (894–921) | `setRate` command | Applies to all voices; the read-head math is the same. Varispeed (pitch follows rate), which is Web Audio `playbackRate` semantics. |
| `createCroonerFx` (261–435) | kernel `CroonerFX` | HP 200 → LP 6200 → mono sum → compressor (−22 dB, knee 20, ratio 2.6, att 10 ms, rel 280 ms) → tanh(k·x) shaper (k = 0.8, 2× oversample) → dry + delay 95 ms (fb .18, wet = mix, wow .35 Hz/3.5 ms + flutter 5.2 Hz/0.6 ms on delay time, fractional delay interpolation) + convolver (0.8 s noise IR, decay 2.8, wet = mix/2; **`ConvolverNode.normalize` defaults to true**, so apply the spec's normalization scale) + vinyl noise (2 s looped buffer, 55 crackles). FX noise and IR use a **separate FX RNG** stream (seeded), never the decision RNG. |
| `vizAnalyser` | dropped | The ring view takes beat and voice state from the scheduler, not FFT. |

## B. Python analysis → `HarmonizerAnalysis` (P7)

Target: `build_profile` (analyze_track.py:1554–1696) → `ProfileBuilder.build(pcm:) -> Profile`.
Schema: `response.track.{id,title,artist,status,info.url,audio_url,audio_summary,analysis}`. The
full schema is in the P0 golden `schema.json`.

| Stage (lines) | librosa call and defaults to replicate | Swift implementation | Parity class |
|---|---|---|---|
| Load (1562) | `librosa.load(sr=None, mono=True)`: native SR, channel mean | `AVAudioFile` → mean | exact on WAV/FLAC; tolerance on MP3/AAC (encoder delay/priming) |
| STFT basis | n_fft 2048, hop 512, periodic Hann, `center=True`, **pad_mode `constant`** (librosa ≥0.10) | vDSP FFT (`vDSP.FFT` / DFT) | ≤1e-4 rel |
| RMS (1571) | `rms(hop 512)`: frame 2048, centered, constant pad | vDSP | ≤1e-5 |
| Mel / MFCC (1565) | mel 128, Slaney, `norm='slaney'`, fmax sr/2; `power_to_db(ref=1, amin=1e-10, top_db=80)`; DCT-II ortho; n_mfcc 13 (canon also uses 20) | vDSP matrix ops | ≤1e-3 abs |
| Delta | `delta(width=9, order=1, mode='interp')` (Savitzky-Golay) | port savgol coeffs + interp edges | ≤1e-4 |
| Onset strength (1567) | spectral flux on log-mel, lag 1, max_size 1, mean aggregation, centered frame alignment | vDSP | ≤1e-3; peak frames exact |
| Beat track (60–86, 1572) | `beat_track(onset_envelope)`: tempo via autocorrelation tempogram (win 384, log-normal prior start 120, std 1.0); DP tightness 100; trim. **The beat tracker internals changed in librosa 0.10–0.11, so port the pinned version's source.** | Swift port of `librosa/beat.py` (pinned) | beat frames exact on synthetic fixtures; ≥98% within ±1 frame on real |
| Fallback grid (1574–1585) | 2 Hz grid when there are no beats | trivial | exact |
| Bars / tatums (114–160) | 4 beats per bar, 3 tatums per beat | trivial | exact given beats |
| Onset segments (256–343) | `onset_detect(backtrack=True)`, `peak_pick` defaults (pre/post max/avg, wait, delta .07, normalized env); min dur .08 s; per-seg means of MFCC[1:13], chroma, RMS→dB, argmax peak | port `peak_pick` + backtrack | boundaries ±1 frame |
| Chroma (1564) | `chroma_cqt`: hop 512, fmin C1, 7 octaves, 36 bins/oct, tuning via `estimate_tuning` (piptrack), CQT early downsampling with `soxr_hq`, `norm=inf` | sparse spectral-kernel CQT on large FFT frames (Brown-Puckette), **no** recursive downsampling; tuning port | tolerance: per-beat chroma cosine ≥ .98 (exact parity is not a goal) |
| Key / loudness (346–370) | Krumhansl/Temperley templates, 12 rotations, first-max argmax | trivial | exact given chroma (ties: first index) |
| Sections (163–253) | `librosa.segment.agglomerative(features, k=clamp(B//8,2,12))` = sklearn Ward with temporal chain connectivity; drop <2 s; bar-group fallback | Ward clustering restricted to adjacent merges (heap, O(F log F)) | boundaries ±1 beat; section *membership* agreement ≥95% |
| Canon SSM (397–510) | 91-d beat features → standardize → 5-beat context (455-d) → L2 norm → cosine, float32 | `cblas_sgemm` | ≤1e-4 |
| Canon alignment (541–931, 1001–1142) | offsets, layered runs (.55/.50/.45/.40), scoring, greedy coverage, patching, loop edges | pure Swift; stable sorts, explicit tie rules | exact *given* the same SSM. With Swift-computed SSM: pairs agreement ≥95% |
| Eternal SSM + candidates (1192–1490) | segment-avg [timbre, pitches] cosine → [0,1]; gating; band dedup; top 48 | blockwise sgemm + Swift | exact given the same inputs; top-k Jaccard ≥ .9 end to end |
| Canon candidates / global offsets (1493–1551) | bar offsets `[4,8,16,32,-4,-8,-16,-32,2,6,12,24]`, score `.4·chroma − .3·|ΔdB|/40`, top 7 | index by (bar, phase) but keep iteration order | exact given inputs |

**Scale guard.** Analyze on device when the estimated beats ≤ 4000 (≈33 min at 120 bpm). Above
that, fall back to the server. Peak memory budget is under 300 MB, so stream the STFT and never hold
a complex spectrogram for long tracks.

## C. What stays server-side (permanently)

- URL acquisition (yt-dlp/spotdl/scdl/Drive/Cloud Squeeze) and cloud search, which needs the
  service key.
- Thin-player renders (`/api/background-render`) as the fallback.
- RL policy/model source of truth and telemetry sink.
- Autoharmonizer (two-track cross-similarity) and the ~18 other algorithms. They are not ported
  because they are not in scope.
- LMS/squeezebox endless streams (`/api/squeezebox-stream`), deferred.
