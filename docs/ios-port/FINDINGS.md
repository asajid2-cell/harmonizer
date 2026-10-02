# Findings from the port read (2026-10-01, `static` @ `a365e09`)

These facts change how the port is built. Items 1–4 are **divergences in the current product**.
They are recorded here for the owning lane and must **not** be fixed by the port campaign. Item 24
is the one divergence found in the campaign's *own oracle*, and it was corrected.

1. **Three different "jukebox" engines exist.**
   - Live page: `visualizer.js:createJukeboxDriver` (9102–11608). It has dwell, meter gating,
     intents (continue/explore/surprise/escape), route planning (jukebox only), stuck recovery,
     end-zone retreat, and a softmax over a scored pool.
   - `backend/analysis/stream_synth.py` (`/api/squeezebox-stream`) claims to be a "verbatim port of
     the live engine". In fact it ports `eternal_jukebox_engine.js`, which nothing instantiates.
   - Background render `app.py:_write_jukebox_render` (785–914) is a third, simpler walker with a
     45 ms linear crossfade.
   The result is that cast streams and exported renders do not sound like the live page.
2. **Two canon overlay engines exist.** The live page uses `applyCanonAlignment` per-beat pairs plus
   independent bar-offset voices (`jremix.js:583-647`). The background render
   (`app.py:604-698`) uses fixed time offsets taken from `global_voice_offsets` mixed over linear
   audio. `stream_synth` uses bar-offset voices for every overlay, including voice 0.
3. **Autocrooner cannot be rendered server-side.** `_process_background_render_job` (1043–1046)
   coerces any mode outside canon/jukebox/eternal to `linear`.
4. **The `eternal_loop_candidates` phase fields are always null.** `analyze_track.py` reads
   `indexInParent`, which only exists after JS `preprocessTrack`. As a result, `phase_match` and
   `beat_in_bar` are `null` in every served profile.
5. **There is no route at `/api/canon-stream/<session>`** in `app.py`. Live cast runs over a
   WebSocket to `/cloud-squeeze/api/cast-ingest/<session>` (harmonizer.html:4742-4759), and LMS
   pulls through the Cloud Squeeze bridge.
6. **The `/api/rl/model` fetch is in `harmonizer.html:1177-1288`.** It injects
   `window.harmonizerRLModel`, which the drivers read through `scoreJumpQuality`
   (visualizer.js:1445-1646). The model is GBRT with features `similarity, span_norm, same_section,
   mode_jukebox, mode_eternal, delta_beats, dwell_norm` and the blend `0.75*RL + 0.25*heuristic`.
   There is no epsilon-greedy step.
7. **The analysis environment is unpinned.** `requirements.txt` uses `>=` bounds only. The prod
   container's versions could not be read at tier 1 (docker socket denied for the `harmonizer`
   user). Python goldens must be pinned to a recorded version (P0 task).
8. **`/api/process` is rate-limited to 6 per IP per hour** (`app.py:1402-1453, 1555-1571`). This is
   a hard reason to make on-device analysis the default. iOS users behind one NAT share the
   budget.
9. **`jremix.js:playQ` ignores per-beat alignment gains.** The overlay always uses `voice.baseGain`
   (845–852). Whether `applyCanonAlignment`'s computed gain is consumed anywhere else must be
   confirmed in P2 before porting it.
10. **The existing Swift sources are not an audio engine.** The `ChoralusApp*.swift` files are
    SwiftUI mock UIs. `LocalPlayback.swift.transport` is an `AVPlayer` transport. What can be
    reused is the audio-session, interruption, and route-change handling (lines 360–447), the
    remote command and Now Playing setup (398–438, 486–500), and stale-callback generation tokens
    (219–267, 461–475). The real project is `~/Developer/ChoralusMobile` on the mini. None of it
    can schedule sample-accurate slices.

---

## Found during the port (P0, 2026-10-01)

Reported for the owning lane, not fixed here.

11. **The eternal-loop energy gate compares dB multiplicatively, so it only admits jumps to
    *louder* beats.** `generate_loop_candidates` (analyze_track.py:1415) rejects a candidate when
    `tgt_energy < src_energy * energy_drop_ratio` with `energy_drop_ratio=0.45` and energies in
    **dB** (`_compute_beat_energy` returns per-beat mean segment loudness, so negative). With both
    sides negative, `src * 0.45` is *closer to zero* than `src`, so the test demands
    `tgt > 0.45·src` — i.e. a target that is roughly `0.55·|src|` dB **louder**, the opposite of
    the "energy drop" the name implies. Consequences:
    - a musically uniform track yields **zero** `eternal_loop_candidates` (verified: the synthetic
      `synth_click_chord_120` fixture, beat energies −15.2…−13.3 dB, produces 0 edges);
    - served profiles are sparse and biased toward loud targets (verified: `TR269217F15C.json`
      keeps a candidate at `source_energy −22.4 → target_energy −10.0`, and drops everything below
      the `−10.07` threshold its own source beat implies);
    - the threshold moves with the source beat's loudness, so the effective graph is level
      dependent rather than structural.
    This is a level/perception bug in the product, not a port artifact. The port must replicate it
    exactly (the golden profiles encode it); it is listed here because a future fix in
    `analyze_track.py` would change every golden and must be coordinated with this campaign.
    **Fixture consequence:** synthetic fixtures need genuine wide dynamic range or the jukebox /
    eternal decision traces are degenerate. `gen_synthetic.py` therefore varies level across
    sections by design.

12. **The trace/prep harness never selects a mode - the frontend hard-codes `mode = "canon"`.**
    `trace.mjs` sets `w.mode = one.mode` *before* the frontend scripts are evaluated, but
    `visualizer.js:387` declares `var mode = "canon";` at script top level, which overwrites it, and
    `init()` (4847-4856) then re-derives `mode` from `document.body[data-mode]` - the shipped
    `harmonizer.html:38` says `data-mode="canon"`. `processParams()` (6707) only overrides from
    `?mode=`, which the harness URL (`?trid=<fixture>`) does not carry.
    Verified on the committed corpus: `canon`, `jukebox`, `eternal` and `autocrooner` `-v2-baseline-s1`
    traces for `synth_click_chord_120` are one sha256 (`45961c28…`), and the four matching
    `prep/*.json` are byte-identical. So the 7 mode configs of the 819-trace matrix collapse to the 4
    voice-count configs: **351 of 819 traces and 39 of 91 prep files are duplicates**, and the P3
    trace gate cannot validate `JukeboxDriver`, `EternalDriver` or `AutoCroonerDriver` at all.
    Independent second symptom: the no-op `raphael()` stub in `trace.mjs` has no `toBack`, so the
    moment a mode actually reaches `renderOrbitBase` (jukebox, eternal) the harness dies with
    `TypeError: halo.toBack is not a function` - the stub has only ever run in canon.
    This is harness tooling, not product code, and `tools/ios-parity/**` is in campaign scope, so it
    is fixable: set `w.mode` **and** `document.body[data-mode]` after the scripts load and before
    `onload`, and extend the Raphael stub. Verified with a scratch copy of `trace.mjs`: with the mode
    fix, `canon` gives `beats[0].other = 32 / others = [32] / voiceOffsets = [8,-8,4,-4,2,6]` and
    `autocrooner` gives `other = 0 / others = [] / voiceOffsets = []` on the same fixture.
    Fixing it invalidates the M0-signed-off corpus (traces + prep + `MANIFEST.sha256`) and requires a
    regeneration plus a fresh P0 sign-off, so it is a campaign-owner decision, not a silent edit.

---

## Found during the port (P2, 2026-10-01)

13. **The last-beat duration clamp does not use a median - `_.sortBy(x)` with no iteratee is a
    no-op.** `allReady` (`visualizer.js:4459-4465`) sizes the final beat as
    `min(trackDuration - lastBeat.start, 1.6 * medianDuration)`, where `medianDuration` is meant to be
    the typical beat length:
    ```js
    var durationSamples = _.map(masterQs.slice(0, -1), function(b) { return b.duration; });
    var medianDuration = durationSamples.length ? _.sortBy(durationSamples)[Math.floor(durationSamples.length / 2)] : remaining;
    ```
    `_.sortBy(durationSamples)` is called with **no iteratee**, and the underscore that
    `harmonizer.html` loads is **1.4.3**, whose `sortBy` builds its comparator from
    `criteria: iterator.call(...)` where `iterator` is `undefined` when no iteratee is passed. Every
    criterion is therefore `undefined`, the comparator falls through to `left.index - right.index`,
    and the "sort" returns the input in its original order. Probed in the harness VM:
    `_.sortBy([3,1,2,10,0])` → `[3,1,2,10,0]`, while `_.sortBy([3,1,2,10,0], x => x)` →
    `[0,1,2,3,10]`. So `medianDuration` is `durationSamples[floor(n/2)]` - **whatever beat happens to
    sit at the midpoint of the track**, not the median.
    Consequences, verified against the corpus:
    - `real_acoustic` (315 beats, `trackDuration` 162 s, last beat at 153.9715 s): the true upper
      median of beats 0-313 is 0.48761904761904873, so the cap would be 0.780190476190478, but the
      shipped last-beat duration is **0.7430385487528384** = beat 157's duration
      (0.46439909297052395) × 1.6. Same value for `real_electronic`.
    - `synth_ramp_100_130`: shipped **0.7616145124716553**, true median cap 0.7430385487528355.
    - `synth_swing_97`: shipped **1.0031020408163271**, true median cap 0.9845260770975074.
    - `synth_click_chord_120` happens to agree (0.79876643990929785) because its beat grid is
      uniform, which is why the bug is invisible on synthetic material with a constant tempo.
    The name is the only thing that is wrong about the intent; the *value* is arbitrary, so the last
    beat of a real track is capped at 1.6× some unrelated beat's length - shorter than intended when
    the midpoint beat is fast, longer when it is slow. This is a product divergence, not a port
    artifact, and it is listed here for the owning lane: the port reproduces it exactly because every
    golden encodes it. Changing `visualizer.js:4462` to `_.sortBy(durationSamples, _.identity)` would
    change the last beat's duration in 4 of the 13 fixtures and must be coordinated with this
    campaign. **Port consequence:** `PrepBuilder` deliberately does not sort, with the reason
    recorded at the call site.

---

## Found during the port (P3, 2026-10-01)

14. **`bar_index` is never assigned anywhere in the frontend, so the whole bar-visit
    penalty/coverage-bonus block is dead.** `grep -n bar_index frontend/**` returns reads only:
    `visualizer.js:8443-8444, 8714, 10064-10065, 10746, 19217, 19798, 20832, 20917`. Nothing
    writes `q.bar_index`. `markCanonVisitedBar`, `decayVisitedBars` and `visitedBars` therefore
    never record anything, and the driver-level read at 10746
    (`barIdx = (typeof targetBeat.bar_index === "number") ? targetBeat.bar_index : null`) is always
    `null`. Consequence: in `chooseCanonNextIndex` and in `createJukeboxDriver`'s
    `selectJumpCandidate`, the bar-visit penalty and the coverage bonus are constant zero, and the
    end-zone retreat block keyed on `visitedBars` never fires. **Port consequence:** the port omits
    that block entirely rather than reproducing a zero it would have to carry as state.

15. **`setSpeedFactor` reads the *current* clock, not the time of the last `playQ`.** It samples
    `context.currentTime`, and the drivers call it at the top of a tick - before `playQ` - so it has
    to be handed the same `now` that `playQ` will be handed, or the two disagree by one tick's
    delay. Found by a tick-1 `delay` divergence in the autocrooner trace; fixed by giving
    `setSpeedFactor` a `now:` parameter.

16. **The harness runs one `playQ` iteration past the last recorded tick.** `trace.mjs` loops
    `while (traces.length < one.ticks && cl.step())`, so it exits on the *next* `playQ`, meaning
    tick `ticks` really runs and any draw it makes before its `playQ` is charged to tick
    `ticks - 1`. Autocrooner's rate jitter is exactly such a draw; the trace showed
    `draws 0 != 1` on the last tick until the replay ran `ticks + 1` iterations.

17. **`harmonizerApplyAntiLoop` is active for jukebox and eternal.** `isOrbitMode`
    (`visualizer.js:294-297`) covers jukebox, eternal, dopamine, stalker, timbresurf, barberpole,
    palindrome, spectralgravity, callresponse and orbitweaver. So `applyStackedNextIndex` is the
    identity for jukebox/eternal only while `harmonizerLooksStuck` returns false - the anti-loop
    state machine (taboo targets, taboo edges, taboo ranges, escape picks, cooldowns) is live and
    had to be ported in full, not skipped. The M3 gate confirms it: 234 jukebox/eternal traces are
    tick-identical.

18. **`modeState` is entirely dead.** Written at `visualizer.js:9150, 11012, 11034, 11090, 11136,
    11204, 11272, 11293` and read nowhere (grep-verified). Omitted from the port.

19. **`retreatPoint` / `findRetreatPoint` is a dead branch.** `findRetreatPoint()` is defined at
    `visualizer.js:10361` but never called, so `retreatPoint` stays `null` and the end-zone retreat
    block in `advanceIndex` (11111-11152) can never fire. Omitted from the port.

20. **`canonLoopCandidates` is populated by `applyCanonAlignment`, not by the profile directly.**
    At `visualizer.js:2943-2984` each `alignment.loop_candidates` entry with
    `similarity >= similarityThreshold` contributes an entry to `loopList`, **and a mirrored
    `dst -> src` entry when `dst > src`**; `canonLoopCandidates = loopList`, and `canonLoopGraph` is
    built from the same list, so the mirror is in both. The list is empty whenever
    `applyCanonAlignment` returns `false` early, i.e. when `alignment.pairs.length !== qlist.length`.
    (An earlier reading of this session took the mirror to be absent; the code shows otherwise, and
    the port now mirrors.)

21. **`createJukeboxDriver`'s `start()` calls `process()` synchronously.** Like autocrooner's, it
    returns tick 0 to its caller, which must count it. Canon's `start()` only arms state and returns
    nothing. So the three drivers differ in whether the first tick is inside `start()`.

22. **`beat_in_bar` is never present on a beat in any served profile.** Only loop-candidate edges
    carry it (`real_acoustic.json` has 216 occurrences, all on edges; zero beats have the key).
    So `inferMeterGrid`'s metadata branch never fires on the corpus, `beatPhase` always resolves
    through `indexInParent`, and the `beat.which % (fallbackMod || 4)` tail of `beatPhase` is
    unreachable. This is the same fact as FINDING 4, seen from the JS side. The `beatInBar`
    thread-through into `Quantum` is therefore faithful but not load-bearing for the corpus.

23. **No beat in the corpus is unparented.** `preprocessTrack` only sets `indexInParent` inside
    `connectQuanta`, so a beat that no bar covers would leave the key `undefined` in JS. Replaying
    `connectQuanta(bars, beats)` over all 13 profiles gives zero uncovered beats, which is what makes
    it safe for the port to type `indexInParent` as a non-optional `Int` defaulting to 0.
24. **The sample oracle read Web Audio's lowpass/highpass `Q` as linear, not in decibels.** This is
    the one finding the campaign *changed* rather than only recorded: the oracle and the kernel were
    corrected, and the refmix goldens were regenerated.
    `jremix.js:506-537` gives every overlay voice a `BiquadFilterNode` at `frequency = 250` and never
    sets `Q`, so the node runs at its default `Q = 1`. For **lowpass and highpass only**, Web Audio
    reads `Q` as a resonance in **decibels** - the spec's Filters Characteristics defines
    `alpha = sin(w0) / (2 * 10^(Q/20))` for those two types and keeps linear `Q` for every other
    type, and Blink implements the same conversion (`Biquad::setHighpassParams`:
    `resonance = pow10(resonance / 20); alpha = sin(theta) / (2 * resonance)`).
    `ref_mix.py:HighPass250` had `alpha = sin(omega) / (2 * 1.0)` - the linear reading - which
    contradicts the campaign's own `02-PORT-MAPPING.md:59` ("**Web Audio LP/HP `Q` is in dB**").
    Measured with the oracle venv over a 20 Hz-20 kHz sweep, the two conventions differ by up to
    0.9983 dB (voice overlay HP, 255 Hz), 3.6306 dB (crooner HP 200 Hz, `Q = 0.7`) and 3.6976 dB
    (crooner LP 6200 Hz, `Q = 0.7`). Both `ref_mix.py:HighPass250` and the kernel's
    `hr_biquad_init` now apply `10^(Q/20)`.
    Consequences: the refmix goldens and `fixtures/MANIFEST.sha256` moved (the P4 gate now measures
    the filter the browser actually runs), while the decision corpus (profiles, prep, traces) is
    untouched - no analysis or driver path touches a biquad. The crooner filters do not appear in
    `ref_mix.py` at all (the oracle renders with no FX), so this changes the voice path only; the
    crooner `Q = 0.7` nodes must use the same dB convention when the FX land in M4b.

25. **The crooner's wet levels are the product's, not the factory's.** An earlier reading of this
    port flagged a "doc divergence": `02-PORT-MAPPING.md` says the delay wet is `mix` and the reverb
    wet is `mix/2`, while `createCroonerFx`'s literals are 0.12 and 0.06. The doc is right. The
    factory literals are only the node defaults; the product path is `applyAutoCroonerFxSettings`
    (`visualizer.js:14540-14550`), which applies the `getAutoCroonerSettings()` defaults - mix 0.14,
    tone 200/6200, noise 0.012, drive 0.8 - through `setMix`, giving delayWet 0.14 and verbWet 0.07.
    The kernel follows the product (`hr_crooner_set_mix(0.14)`), and the component gate is written to
    the same numbers. No shipped caller uses the factory literals.

26. **`advance` and `delay` are two different numbers, and the live scheduler and the offline oracle
    read different ones.** `TickOutcome.delay` is the raw `playQ` return - what the trace records -
    while `TickOutcome.advance` is how far the *page's* clock moves, which is not always the same:
    jukebox and eternal clamp a non-positive or `NaN` delay to `q.duration` (`JukeboxDriver.process`),
    and autocrooner floors at 0.1 s through `scheduleNext`. The live `PlaybackScheduler` advances by
    `advance` (correct for the page); `OfflineRenderer` and `ref_mix.py` place their tick boundaries
    with `delay`. On the committed corpus no clamp ever fires - the autocrooner trace's minimum delay
    is 0.3947 s, so `advance == delay` throughout - and the M4c live-vs-offline test confirms the two
    paths agree bit-exactly. But the divergence is latent: a corpus with a sub-0.1 s autocrooner delay
    or a non-positive jukebox delay would part them, and it would be the *offline* side that is
    wrong, because the page really does advance by the clamped value.

27. **A nil from `driver.start()` is not end-of-stream.** FINDING 21 recorded that canon's `start()`
    only arms state and returns nil, while jukebox's and autocrooner's return tick 0. The first
    `PlaybackScheduler` read that nil as "the driver has finished", enqueued nothing, and rendered the
    kernel's untouched initial state for the whole session. The M4c live-vs-offline test caught it
    exactly: canon v2/v8 diverged (max abs error 0.77 / 0.96, 0% bit-exact) while jukebox, eternal
    and autocrooner were bit-exact, which isolated the fault to the one driver whose `start` returns
    nothing. `pump()` now mirrors `EngineFactory.run` - call `start` once, emit only a non-nil
    result, then loop on `process` - and all five configs are bit-exact.

28. **WebKit's compressor finds its knee exponent `k` numerically, and the closed form is wrong.**
    `DynamicsCompressorKernel`'s knee is `threshold + (1 - exp(-k*(x - threshold))) / k`, and the `k`
    it uses is the one where the knee's **dB-domain** slope equals `1/ratio`, located by a search, not
    by algebra: `slopeAt` is a finite difference at `x * 1.001` (both points taken to dB), and
    `kAtSlope` evaluates it at `xDb = thresholdDb + kneeDb` then does 15 geometric-mean bisections
    between 0.1 and 10000 starting from 5. The tempting closed form - matching the slope in the
    *linear* domain, `k = -ln(slope)/span` - gives `k ~= 1.34` for (-22, 20, 2.6) where WebKit's
    search lands near `2.1`, over 1 dB apart across the knee. The kernel implements the search, and
    the component gate re-derives WebKit's own bisection in Swift rather than comparing against a
    constant.

29. **The crooner reverb drained its output FIFO only after a completed block, so a non-multiple-of-512
    call both lost audio and wrote past the heap.** `hr_convolver_process` is a uniform-partitioned
    overlap-save convolver with a fixed internal block (`HR_FX_CONV_BLOCK`, 512 frames): it can emit a
    block only once 512 input frames have arrived. The old loop drained the FIFO inside the
    block-completion branch and then zero-filled whatever the call had not been answered with, so a call
    whose `frames` was not a whole number of blocks left the residual sitting in `out_fifo` (silently
    replaced by zeros - lost audio) until the next completed block, at which point the FIFO held up to
    `2 * block` samples and the write at `out_fifo[c * 2 * block + out_count]` ran off the end of the
    channel's `2 * block` region. A 48 kHz device hands the host 480-frame buffers, so this is a live
    path, not a contrived one. It surfaced as a SIGBUS in an unrelated Swift test: the overrun scribbled
    the heap and the Swift metadata cache faulted inside `XCTAssertEqual<A>`, which is why the crash
    named `ConcurrentReadableHashMap` rather than the kernel. AddressSanitizer named the real fault in
    one run - `heap-buffer-overflow crooner_fx.c:420 in hr_convolver_block`. The fix drains the FIFO
    unconditionally after the input loop (`hr_convolver_drain`), so `out_count + pending_count` stays
    below `block` across calls and every input sample is delivered exactly once whatever the call size.
    The reverb therefore carries a real `frames % 512` delay - 480-frame and 992-frame callers leave the
    same remainder and agree past the transient, while a whole number of blocks has no delay at all - and
    `testCroonerReverbDelayDependsOnlyOnTheChunkRemainder` pins that invariant. The original FX tests
    missed the bug because they call `hr_crooner_process` once with 5000 frames, a single call that
    never re-enters the FIFO with a partial block.

## Found during the port (P5, 2026-10-01)

30. **The public host answers `401 {"error":"authentication required"}` for every `/api/*` route, and
    that gate is not in this repo.** `https://harmonizerlabs.cc/api/rl/policy` - and every other
    `/api/` route, including the `/api/process/status/<id>` poll - returns `401` with that JSON body
    for an unauthenticated caller, on GET and POST alike, over HTTPS and with or without
    `X-Forwarded-Proto: https`. The body is not Flask's and the string does not appear anywhere in
    `backend/app.py`, so the gate sits in front of the app (the `hl-auth` lane the campaign lists as
    out of scope), not in it. `backend/app.py` has no auth on these routes at all: the only
    request guard is a force-HTTPS 308 redirect (`app.py:1555-1563`, `HARMONIZER_FORCE_HTTPS`), and
    the deployed origin answers real 200s once a request carries `X-Forwarded-Proto: https`.
    **What this means for the port:** the server-analysis fallback (M6) and the whole thin-player
    path cannot reach the public API without whatever credential that front door wants, which the
    plan has no story for. This strengthens the local-first case - on-device analysis (M7) is not an
    optimisation but the only unblocked path - and any server use needs a decision about the front
    door (implement `hl-auth`, or point the app at the origin). Recorded, not fixed: `hl-auth` is out
    of scope. The P5 contract fixtures and the live smoke were captured against the origin directly
    (`X-Forwarded-Proto: https`), which is the same Flask app the front door proxies to.

## Found during the port (P7, 2026-10-02)

31. **CPython's `set` iteration order decides `synth_ramp_100_130`'s canon alignment, and it is not
    insertion order.** `_fill_unassigned_ranges` collects `candidate_offsets` into a Python `set` and
    walks it to pick the highest-scoring offset, replacing the incumbent only on a strictly greater
    score (`analyze_track.py:846`). On `synth_ramp_100_130` the track's single fallback range scores
    **exactly identically** (0.639767860421911) for offsets 34 and 16, so the tie is settled by the
    walk order - and CPython keeps 34. A `set` walks its hash table by slot, not by insertion, so the
    port cannot use an insertion-ordered collection here. `hash(i) == i` for a small int, so the
    layout is reproducible: an eight-slot table that grows to the smallest power of two above four
    times the live count once it is three-fifths full, inserting with a `LINEAR_PROBES = 9` span
    before a perturb jump (`PERTURB_SHIFT = 5`), and rehashing in slot order. Two different probe
    routines matter - `set_add_entry` checks the perturbed slot first and then `i+1..i+9`, while
    `set_insert_clean` checks `i` and then `i+1..i+9`. `CanonAlignment.cpythonSetOrder` mirrors both
    and was validated against real CPython 3.11.0: 0 mismatches in 800 random trials, and the exact
    ramp order. Every other ordering the canon pipeline depends on is a `dict` (`by_offset`) or a
    stable `list.sort`, so this is the one place the port has to know the interpreter's internals.

32. **The CQT basis is sparse, and a dense port pays ~60x for it.** `librosa.core.constantq
    .__vqt_filter_fft` runs `sparsify_rows(quantile=0.01)` and returns a **`scipy` CSR matrix**;
    `__cqt_response` then multiplies through it. At 44.1 kHz with `n_bins=252, bins_per_octave=36`
    the basis is uniformly `36 x 1025` in every octave - the octave loop halves `sr` and the filter
    frequencies together, so the filter length is constant - and each row carries only **~17 of 1025
    bins**, a density of 1.6%. Porting the basis as a dense block and walking all 1025 bins per
    filter was the largest single cost in the pipeline. `Cqt.SparseFilter` now keeps the surviving
    bins and gathers them. The arithmetic is unchanged, because the dropped terms are exactly zero
    and the remaining terms keep their order, and the chroma gate does not move (worst cosine
    0.9999998 across the 13 fixtures).

33. **The reference's own float32 SSM rounding is amplified by the port's double-precision norms,
    which is why the P7k profile gate is a decision agreement rather than an element-wise diff.**
    `_cosine_ssm` accumulates in float32 (the feature stack is float32 throughout), while
    `BeatFeatures.cosineSSM` computes its row norms in `Double`. Diffing the port against the golden
    therefore shows the golden's own rounding: `synth_ramp_100_130`'s
    `canon_alignment.pair_similarity[0]` reads 0.07145 against the port's 0.09951, and profile-level
    `pair_similarity` drifts ~1e-3. Nothing discrete moves - the `pairs` list, the offsets, the canon
    candidates and the eternal edge sets are all identical. This is the mechanism behind §2.4's
    warning that the canon alignment's hard thresholds (.55/.50/.45/.40, .375, .4) let a 1e-4 SSM
    shift flip a decision, and it is why the port's P7k gate is §2.2's chain tolerances - beat
    count and times, key/mode, pair agreement, edge Jaccard, voice offsets - rather than the
    element-wise comparison the per-layer gates use. Recorded, not fixed: matching float32 exactly
    would mean reproducing numpy's accumulation order, which buys nothing a listener can hear.

34. **The P7 footprint blow-up was the frame-major power spectrogram held whole - and built three
    times.** On a five-minute 44.1 kHz track the STFT power matrix is `1025 x 25840` doubles, **212
    MB**, and the first port held it whole for every consumer. `librosa` never does: `melspectrogram`
    forms `S` and immediately matmuls it onto the mel basis, and `piptrack`/`estimate_tuning` walk it
    one frame at a time. Worse, `Profile.build` called `Mfcc.mfcc(nMfcc: 13)`, `Mfcc.mfcc(nMfcc: 20)`
    and `Onset.strength` separately, so the STFT and the mel projection were paid for **three times**
    over - each a fresh 212 MB transient - and `Mfcc.melPower` then took a `CblasTrans`-free path that
    materialised the transposed spectrogram as a fourth. `Cqt.transform` additionally held its
    full-rate working signal (106 MB) for the whole octave loop even though the loop only ever walks
    the decimated `mySignal`. The release perf gate read **292.7 MB growth / 395.0 MB peak** - inside
    the 300 MB budget on the growth reading, but only by 7 MB, and over it on the raw peak.
    Fixed: `SpectralFrontEnd.stftPower` now takes a `frameRange` and returns just those columns;
    `Mfcc.melPower` projects a 2048-frame block at a time straight into the output columns with
    `ldc = frames`; `Chroma.estimateTuning` walks the same blocks (its peak list is a streaming
    reduction, so blocking cannot move it); `Profile.build` builds the 128-band mel once and shares it
    across onset and both MFCC widths; `Mfcc.melPower` uses `CblasTrans` instead of a 212 MB
    transpose; `Cqt.transform` releases the full-rate signal; and `Profile.loudness` no longer
    materialises a 13-million-entry array. Every frame's transform is independent, so each change is
    bit-identical - the chroma parity numbers and all 13 fixtures' P7k decisions are unchanged - and
    the gate now reads **174.7 MB growth / 265.4 MB peak** at the same 1.5 s (~200x realtime).
