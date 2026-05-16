Local Analysis Architecture
===========================

Goal
----
Reproduce the portion of the Echo Nest / Infinite Jukebox analysis that the Autocanonizer web app expects, so that we can generate compatible JSON profiles for any locally supplied audio file.

Overview
--------
The analysis pipeline is organized into a single executable script, `analyze_track.py`, backed by small helper modules (packaged in the same file for now). The script performs five major stages:

1. **Audio Ingest**
   - Load the input file with `librosa` (keeps native sample rate, converts to mono).
   - Capture duration, sample rate, waveform energy statistics needed later.

2. **Temporal Quantization**
   - Compute tempo and beat positions via `librosa.beat.beat_track`.
   - Derive bars by grouping beats into fours (fallback) or using downbeat estimation when possible.
   - Subdivide beats into tatums by splitting each beat into equal subdivisions.

3. **Structural Segmentation**
   - Extract MFCC and chroma features (`librosa.feature.mfcc`, `librosa.feature.chroma_cqt`).
   - Attempt agglomerative segmentation on the concatenated feature matrix to obtain musically meaningful sections; if the clustering collapses to too few boundaries, fall back to grouping consecutive bars to guarantee multiple sections for the canonizer.
   - Detect fine-grained onset boundaries with `librosa.onset.onset_detect` to define timbral "segments".

4. **Feature Aggregation**
   - For each segment gather timbre (first 12 MFCCs), pitch class profile (average chroma), and loudness envelope (RMS → dB). Estimate confidence using normalized onset strength.
   - Project these segment features down to overlapping beats/tatums to populate `overlappingSegments` later during preprocessing.
   - Build beat-synchronous context vectors (chroma, MFCC, deltas, onset strength, RMS stats) over sliding beat windows to support canon alignment planning.

5. **Profile Serialization**
   - Assemble the JSON payload mirroring `profile.response.track` from the legacy Echo Nest API:
     - `status`, `id`, `title`, `artist`, and `info.url` metadata.
     - `audio_summary` fields (duration, tempo, loudness, key estimate).
     - `analysis` object containing sections, bars, beats, tatums, segments, and canon diagnostics (`start`, `duration`, `confidence`, `timbre`, `pitches`, loudness statistics, `canon_alignment`).
    - Canon alignment now performs a multi-stage search:
      - Evaluate phase-consistent offsets with `_evaluate_offsets`, extract layered diagonal runs, and score them using mean similarity, stability, and length.
      - Assemble a coverage map by applying the best segments, then patch uncovered ranges with locally optimised offsets so the canon stream remains contiguous.
      - Emit per-segment metadata (offset, similarity stats, phase alignment), per-beat pairings, coverage metrics, and a loop-candidate graph reused by the Eternal Jukebox driver.
    - Write the JSON to `data/<track_id>.json` (configurable via CLI option).

Interfaces
----------
- Command line usage: `python analyze_track.py --audio PATH --track-id CUSTOMID [--title ... --artist ... --audio-url ... --output ...]`
- Output: JSON file ready for hosting alongside the web app, plus optional console summary.

Extensibility
-------------
- The design keeps all processing inside `analyze_track.py` for now, but individual steps are factored into functions (`compute_beats`, `estimate_sections`, etc.) so they can be tested or swapped easily.
- Future work: replace heuristic bars/tatums with ML-based downbeat tracking when needed, add caching, or expose more configuration via CLI flags.
