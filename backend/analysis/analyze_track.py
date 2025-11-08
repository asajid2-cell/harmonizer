#!/usr/bin/env python3
"""Generate an Autocanonizer-compatible analysis profile for a local audio file."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import librosa
import numpy as np

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = BASE_DIR.parent / "data"


# Analysis constants
HOP_LENGTH = 512
SEGMENT_MIN_DURATION = 0.08  # seconds
DEFAULT_TIME_SIGNATURE = 4
TATUMS_PER_BEAT = 3
SILENCE_DB = -60.0
MIN_SECTION_DURATION = 2.0

CANON_CONTEXT_BEATS = 5
CANON_SIMILARITY_THRESHOLD = 0.50
CANON_MIN_PHASE_ALIGNMENT = 0.70
CANON_MIN_PAIRS = 6
CANON_TOP_CANDIDATES = 8


@dataclass
class Quantum:
    start: float
    duration: float
    confidence: float

    def as_dict(self) -> Dict[str, float]:
        return {
            "start": float(self.start),
            "duration": float(self.duration),
            "confidence": float(self.confidence),
        }


def normalize(values: np.ndarray) -> np.ndarray:
    """Scale values into [0, 1] with safe fallback."""
    if values.size == 0:
        return values
    vmin = float(np.min(values))
    vmax = float(np.max(values))
    if math.isclose(vmin, vmax):
        return np.ones_like(values) * 0.5
    return (values - vmin) / (vmax - vmin)


def compute_beats(y: np.ndarray, sr: int) -> Tuple[List[Quantum], np.ndarray, float]:
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=HOP_LENGTH
    )
    tempo = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP_LENGTH)
    strengths = onset_env[beat_frames] if beat_frames.size else np.array([])
    confidences = normalize(strengths) if strengths.size else np.array([])

    duration = librosa.get_duration(y=y, sr=sr)
    beats = []
    for idx, start in enumerate(beat_times):
        end = (
            beat_times[idx + 1]
            if idx + 1 < len(beat_times)
            else duration
        )
        beats.append(
            Quantum(
                start=start,
                duration=max(end - start, 1e-5),
                confidence=float(confidences[idx] if idx < len(confidences) else 0.7),
            )
        )
    return beats, beat_times, tempo


def derive_bars(
    beats: List[Quantum],
    beat_times: np.ndarray,
    duration: float,
    time_signature: int = DEFAULT_TIME_SIGNATURE,
) -> List[Quantum]:
    bars: List[Quantum] = []
    for i in range(0, len(beats), time_signature):
        start = beats[i].start
        if i + time_signature < len(beats):
            end = beats[i + time_signature].start
        else:
            end = duration
        conf_slice = [b.confidence for b in beats[i : i + time_signature]]
        confidence = float(np.mean(conf_slice)) if conf_slice else 0.7
        bars.append(
            Quantum(
                start=start,
                duration=max(end - start, 1e-5),
                confidence=confidence,
            )
        )
    return bars


def derive_tatums(
    beats: List[Quantum],
    duration: float,
    tatums_per_beat: int = TATUMS_PER_BEAT,
) -> List[Quantum]:
    tatums: List[Quantum] = []
    for beat in beats:
        step = beat.duration / tatums_per_beat
        for sub in range(tatums_per_beat):
            start = beat.start + sub * step
            end = start + step if sub < tatums_per_beat - 1 else beat.start + beat.duration
            tatums.append(
                Quantum(
                    start=start,
                    duration=max(end - start, 1e-5),
                    confidence=beat.confidence,
                )
            )
    # ensure final tatum hits track end
    if tatums:
        tatums[-1].duration = max(duration - tatums[-1].start, 1e-5)
    return tatums


def estimate_sections(
    y: np.ndarray,
    sr: int,
    duration: float,
    desired_sections: int,
    bars: List[Quantum],
) -> List[Quantum]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=HOP_LENGTH)
    features = np.vstack(
        (librosa.util.normalize(chroma), librosa.util.normalize(mfcc))
    )

    n_frames = features.shape[1]
    k = max(2, min(desired_sections, n_frames))
    labels = librosa.segment.agglomerative(features.T, k=k)
    boundaries = [0]
    for idx in range(1, len(labels)):
        if labels[idx] != labels[idx - 1]:
            boundaries.append(idx)
    boundaries.append(n_frames - 1)
    boundaries = sorted(set(boundaries))
    raw_times = librosa.frames_to_time(boundaries, sr=sr, hop_length=HOP_LENGTH)
    times: List[float] = [0.0]
    for idx in range(1, len(raw_times)):
        current = float(raw_times[idx])
        delta = current - times[-1]
        is_last = idx == len(raw_times) - 1
        if delta < MIN_SECTION_DURATION and not is_last:
            continue
        times.append(current)
    if times[-1] < duration:
        times.append(duration)
    sections: List[Quantum] = []
    for idx, start in enumerate(times[:-1]):
        end = times[idx + 1]
        duration = max(float(end - start), 1e-5)
        new_section = Quantum(
            start=float(start),
            duration=duration,
            confidence=1.0,
        )
        if sections and new_section.duration < MIN_SECTION_DURATION:
            # merge into previous section
            prev = sections[-1]
            prev_end = prev.start + prev.duration
            prev.duration = max(prev_end, new_section.start + new_section.duration) - prev.start
        else:
            sections.append(new_section)
    # pad last section to end if needed
    if sections:
        last = sections[-1]
        last.duration = max(duration - last.start, 1e-5)
    if len(sections) >= max(2, desired_sections // 2):
        return sections

    # Fallback: derive sections from bar groups
    if not bars:
        return [Quantum(0.0, duration, 1.0)]

    target_sections = max(2, min(desired_sections, len(bars)))
    bars_per_section = max(1, len(bars) // target_sections)
    fallback_sections: List[Quantum] = []
    idx = 0
    while idx < len(bars):
        bar = bars[idx]
        start = float(bar.start if idx > 0 else 0.0)
        end_idx = min(len(bars) - 1, idx + bars_per_section - 1)
        end_bar = bars[end_idx]
        end = float(end_bar.start + end_bar.duration)
        fallback_sections.append(
            Quantum(
                start=start,
                duration=max(end - start, 1e-5),
                confidence=0.8,
            )
        )
        idx += bars_per_section

    if fallback_sections:
        fallback_sections[-1].duration = max(
            duration - fallback_sections[-1].start, 1e-5
        )
    return fallback_sections or [Quantum(0.0, duration, 1.0)]


def compute_segments(
    y: np.ndarray,
    sr: int,
    duration: float,
) -> List[Dict[str, object]]:
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=HOP_LENGTH,
        backtrack=True,
    )

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=HOP_LENGTH)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)
    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]

    boundaries: List[int] = [0]
    boundaries.extend(sorted(set(int(b) for b in onset_frames)))
    end_frame = int(math.ceil(duration * sr / HOP_LENGTH))
    boundaries.append(end_frame)
    boundaries = sorted(boundaries)

    onset_strength_norm = normalize(onset_env)
    segments: List[Dict[str, object]] = []
    for start_frame, end_frame in zip(boundaries[:-1], boundaries[1:]):
        if end_frame <= start_frame:
            end_frame = start_frame + 1
        start_time = librosa.frames_to_time(start_frame, sr=sr, hop_length=HOP_LENGTH)
        end_time = librosa.frames_to_time(end_frame, sr=sr, hop_length=HOP_LENGTH)
        duration_sec = max(end_time - start_time, SEGMENT_MIN_DURATION)

        frame_slice = slice(start_frame, end_frame)
        seg_mfcc = mfcc[:, frame_slice]
        seg_chroma = chroma[:, frame_slice]
        seg_rms = rms[frame_slice]
        seg_onset_strength = onset_strength_norm[frame_slice]

        if seg_mfcc.size == 0:
            seg_mfcc = mfcc[:, start_frame : start_frame + 1]
        if seg_chroma.size == 0:
            seg_chroma = chroma[:, start_frame : start_frame + 1]
        if seg_rms.size == 0:
            seg_rms = np.array([0.0])
        if seg_onset_strength.size == 0:
            seg_onset_strength = np.array([0.5])

        timbre = np.mean(seg_mfcc[1:13, :], axis=1)
        pitches = np.mean(seg_chroma, axis=1)
        pitches = pitches / np.sum(pitches) if np.sum(pitches) > 0 else pitches

        loudness = librosa.amplitude_to_db(seg_rms, ref=1.0)
        loud_start = float(loudness[0]) if loudness.size else SILENCE_DB
        max_idx = int(np.argmax(loudness)) if loudness.size else 0
        loud_max = float(loudness[max_idx]) if loudness.size else SILENCE_DB
        loud_max_time = (
            librosa.frames_to_time(start_frame + max_idx, sr=sr, hop_length=HOP_LENGTH)
            - start_time
        )

        confidence = float(np.mean(seg_onset_strength))

        segments.append(
            {
                "start": float(start_time),
                "duration": float(duration_sec),
                "confidence": confidence,
                "loudness_start": loud_start,
                "loudness_max": loud_max,
                "loudness_max_time": float(max(loud_max_time, 0.0)),
                "pitches": [float(v) for v in pitches.tolist()],
                "timbre": [float(v) for v in timbre.tolist()],
            }
        )

    # force final segment to land exactly on track end
    if segments:
        last = segments[-1]
        last["duration"] = float(max(duration - last["start"], SEGMENT_MIN_DURATION))
    return segments


def estimate_key(chroma: np.ndarray) -> Tuple[int, int]:
    """Return (key_index, mode) where key_index is 0=C ... 11=B."""
    # Temperley-style key profiles (Krumhansl-Schmuckler)
    major_profile = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    )
    minor_profile = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
    )
    chroma_mean = np.mean(chroma, axis=1)
    if np.allclose(chroma_mean.sum(), 0):
        return 0, 1
    scores_major = [
        np.correlate(np.roll(major_profile, i), chroma_mean, mode="valid")[0]
        for i in range(12)
    ]
    scores_minor = [
        np.correlate(np.roll(minor_profile, i), chroma_mean, mode="valid")[0]
        for i in range(12)
    ]
    major_key = int(np.argmax(scores_major))
    minor_key = int(np.argmax(scores_minor))
    if max(scores_major) >= max(scores_minor):
        return major_key, 1
    return minor_key, 0


def _safe_slice_2d(matrix: np.ndarray, start: int, end: int) -> np.ndarray:
    n_frames = matrix.shape[1]
    start = max(0, min(start, n_frames - 1))
    end = max(start + 1, min(end, n_frames))
    return matrix[:, start:end]


def _safe_slice_1d(vector: np.ndarray, start: int, end: int) -> np.ndarray:
    n_frames = vector.shape[0]
    start = max(0, min(start, n_frames - 1))
    end = max(start + 1, min(end, n_frames))
    return vector[start:end]


@dataclass
class BeatContext:
    index: int
    start: float
    duration: float
    phase: int
    normalized_vector: np.ndarray


def _stack_beat_features(
    y: np.ndarray,
    sr: int,
    beat_times: Sequence[float],
    duration: float,
    beats_per_bar: int,
    hop_length: int,
    context_window: int,
) -> Tuple[np.ndarray, List[BeatContext]]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20, hop_length=hop_length)
    mfcc_delta = librosa.feature.delta(mfcc)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]

    beat_boundaries = np.append(np.asarray(beat_times), float(duration))
    beat_frames = librosa.time_to_frames(beat_boundaries, sr=sr, hop_length=hop_length)

    contexts: List[BeatContext] = []
    base_vectors: List[np.ndarray] = []
    for idx, start in enumerate(beat_times):
        end = float(beat_boundaries[idx + 1])
        phase = idx % beats_per_bar

        frame_start = int(beat_frames[idx])
        frame_end = int(beat_frames[idx + 1])

        chroma_slice = _safe_slice_2d(chroma, frame_start, frame_end)
        mfcc_slice = _safe_slice_2d(mfcc, frame_start, frame_end)
        mfcc_delta_slice = _safe_slice_2d(mfcc_delta, frame_start, frame_end)
        onset_slice = _safe_slice_1d(onset_env, frame_start, frame_end)
        rms_slice = _safe_slice_1d(rms, frame_start, frame_end)

        chroma_mean = np.mean(chroma_slice, axis=1)
        chroma_std = np.std(chroma_slice, axis=1)
        mfcc_mean = np.mean(mfcc_slice, axis=1)
        mfcc_std = np.std(mfcc_slice, axis=1)
        mfcc_delta_mean = np.mean(mfcc_delta_slice, axis=1)

        onset_stats = np.array(
            [
                float(np.mean(onset_slice)),
                float(np.max(onset_slice)),
                float(np.percentile(onset_slice, 90)),
            ]
        )
        rms_stats = np.array(
            [
                float(np.mean(rms_slice)),
                float(np.max(rms_slice)),
                float(np.std(rms_slice)),
            ]
        )
        beat_duration = np.array([float(end - start)])

        base_vec = np.concatenate(
            (
                chroma_mean,
                chroma_std,
                mfcc_mean,
                mfcc_std,
                mfcc_delta_mean,
                onset_stats,
                rms_stats,
                beat_duration,
            )
        )
        base_vectors.append(base_vec)
        contexts.append(
            BeatContext(
                index=idx,
                start=float(start),
                duration=float(end - start),
                phase=phase,
                normalized_vector=np.zeros_like(base_vec),
            )
        )

    base_matrix = np.vstack(base_vectors)
    mean = np.mean(base_matrix, axis=0)
    std = np.std(base_matrix, axis=0)
    std[std == 0] = 1.0
    normalized = (base_matrix - mean) / std

    feature_dim = normalized.shape[1]
    zero_vec = np.zeros(feature_dim, dtype=np.float32)
    stacked_rows: List[np.ndarray] = []
    for idx, context in enumerate(contexts):
        context.normalized_vector = normalized[idx]
        window_vectors = []
        for offset in range(context_window):
            source = idx - (context_window - 1 - offset)
            if source < 0:
                window_vectors.append(zero_vec)
            else:
                window_vectors.append(normalized[source])
        stacked_rows.append(np.concatenate(window_vectors))

    stacked_matrix = np.vstack(stacked_rows)
    return stacked_matrix, contexts


def _cosine_ssm(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    normalized = matrix / norms
    ssm = np.clip(normalized @ normalized.T, -1.0, 1.0)
    np.fill_diagonal(ssm, 1.0)
    return ssm.astype(np.float32)


@dataclass
class OffsetScore:
    offset: int
    mean: float
    std: float
    length: int
    phase_alignment: float
    high_similarity_ratio: float


@dataclass
class CanonCandidate:
    offset: int
    start: int
    end: int
    threshold: float
    mean_similarity: float
    median_similarity: float
    min_similarity: float
    max_similarity: float
    score: float

    @property
    def length(self) -> int:
        return max(0, self.end - self.start)


def _collect_canon_candidates(
    ssm: np.ndarray,
    offset_scores: Sequence[OffsetScore],
    similarity_threshold: float,
    min_pairs: int,
) -> List[CanonCandidate]:
    """Extract promising contiguous runs for candidate offsets."""
    n_beats = ssm.shape[0]
    if n_beats == 0:
        return []

    diag_cache: Dict[int, np.ndarray] = {}
    # try a couple of relaxed thresholds so we can stitch coverage later
    threshold_values = sorted(
        {
            round(similarity_threshold + 0.05, 3),
            round(similarity_threshold, 3),
            round(similarity_threshold - 0.05, 3),
            round(similarity_threshold - 0.1, 3),
        },
        reverse=True,
    )
    candidates: List[CanonCandidate] = []
    for score in offset_scores:
        offset = score.offset
        if offset <= 0 or offset >= n_beats:
            continue
        if offset not in diag_cache:
            diag_cache[offset] = np.diag(ssm, k=offset)
        diag = diag_cache[offset]
        if diag.size < min_pairs:
            continue
        for thr in threshold_values:
            threshold = float(max(0.2, thr))
            runs = _detect_runs(
                ssm=ssm,
                offset=offset,
                threshold=threshold,
                min_length=min_pairs,
            )
            for start, end in runs:
                if end <= start:
                    continue
                window = diag[start:end]
                if window.size < min_pairs:
                    continue
                mean_val = float(np.mean(window))
                median_val = float(np.median(window))
                min_val = float(np.min(window))
                max_val = float(np.max(window))
                variability_penalty = float(np.std(window))
                length = end - start
                # balance similarity, stability, and length. Encourage broader runs.
                run_score = (
                    mean_val * (1.0 + 0.12 * math.log1p(length))
                    + 0.05 * max_val
                    - 0.03 * variability_penalty
                    + 0.08 * score.high_similarity_ratio * length
                )
                if threshold < similarity_threshold:
                    run_score *= 0.92
                candidates.append(
                    CanonCandidate(
                        offset=int(offset),
                        start=int(start),
                        end=int(min(end, diag.size)),
                        threshold=threshold,
                        mean_similarity=mean_val,
                        median_similarity=median_val,
                        min_similarity=min_val,
                        max_similarity=max_val,
                        score=float(run_score),
                    )
                )
    # keep only the best handful per offset to avoid quadratic assignment later
    by_offset: Dict[int, List[CanonCandidate]] = defaultdict(list)
    for cand in candidates:
        by_offset[cand.offset].append(cand)
    trimmed: List[CanonCandidate] = []
    for offset, cand_list in by_offset.items():
        cand_list.sort(key=lambda c: c.score, reverse=True)
        trimmed.extend(cand_list[:16])
    trimmed.sort(key=lambda c: c.score, reverse=True)
    # global cap so later stages stay tractable on very long songs
    return trimmed[:128]


def _evaluate_offsets(
    ssm: np.ndarray,
    contexts: Sequence[BeatContext],
    beats_per_bar: int,
    min_pairs: int,
    min_phase_alignment: float,
    similarity_threshold: float,
) -> List[OffsetScore]:
    n_beats = ssm.shape[0]
    scores: List[OffsetScore] = []
    for offset in range(1, n_beats):
        diag = np.diag(ssm, k=offset)
        if diag.size < min_pairs:
            continue
        phase_matches = 0
        high_sim = 0
        for idx, value in enumerate(diag):
            src = idx
            dst = idx + offset
            if dst >= len(contexts):
                break
            if contexts[src].phase == contexts[dst].phase:
                phase_matches += 1
            if value >= similarity_threshold:
                high_sim += 1
        phase_alignment = phase_matches / diag.size
        if phase_alignment < min_phase_alignment:
            continue
        high_ratio = high_sim / diag.size
        scores.append(
            OffsetScore(
                offset=offset,
                mean=float(np.mean(diag)),
                std=float(np.std(diag)),
                length=int(diag.size),
                phase_alignment=float(phase_alignment),
                high_similarity_ratio=float(high_ratio),
            )
        )
    scores.sort(key=lambda s: (s.mean - 0.4 * s.std, s.high_similarity_ratio), reverse=True)
    return scores


def _detect_runs(
    ssm: np.ndarray,
    offset: int,
    threshold: float,
    min_length: int,
) -> List[Tuple[int, int]]:
    diag = np.diag(ssm, k=offset)
    runs: List[Tuple[int, int]] = []
    start: Optional[int] = None
    for idx, value in enumerate(diag):
        if value >= threshold:
            if start is None:
                start = idx
        else:
            if start is not None and idx - start >= min_length:
                runs.append((start, idx))
            start = None
    if start is not None and len(diag) - start >= min_length:
        runs.append((start, len(diag)))
    return runs


def _apply_canon_candidates(
    candidates: Sequence[CanonCandidate],
    ssm: np.ndarray,
    contexts: Sequence[BeatContext],
    min_phase_alignment: float,
    similarity_threshold: float,
    min_pairs: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, List[Dict[str, object]]]:
    """Assign high-quality segments while keeping offsets contiguous."""
    n_beats = ssm.shape[0]
    assignments = np.full(n_beats, -1, dtype=np.int32)
    pair_similarity = np.zeros(n_beats, dtype=np.float32)
    coverage = np.zeros(n_beats, dtype=bool)
    segments: List[Dict[str, object]] = []

    for cand in candidates:
        if cand.offset <= 0:
            continue
        start = max(0, min(cand.start, n_beats - 1))
        end = max(start + 1, min(cand.end, n_beats))
        length = end - start
        if length < min_pairs:
            continue
        idx_range = range(start, end)
        unassigned = [idx for idx in idx_range if not coverage[idx]]
        if not unassigned:
            continue
        coverage_ratio = len(unassigned) / float(length)
        # avoid tiny contributions from heavily assigned segments
        if coverage_ratio < 0.6:
            continue
        sims: List[float] = []
        phases = 0
        for idx in idx_range:
            dst = (idx + cand.offset) % n_beats
            sims.append(float(ssm[idx, dst]))
            if contexts[idx].phase == contexts[dst].phase:
                phases += 1
        phase_ratio = phases / float(length)
        if phase_ratio < min_phase_alignment:
            continue
        mean_sim = float(np.mean(sims))
        median_sim = float(np.median(sims))
        min_sim = float(np.min(sims))
        max_sim = float(np.max(sims))
        if mean_sim < similarity_threshold * 0.75 and max_sim < similarity_threshold:
            continue
        for idx in idx_range:
            dst = (idx + cand.offset) % n_beats
            assignments[idx] = dst
            pair_similarity[idx] = float(ssm[idx, dst])
            coverage[idx] = True
        segments.append(
            {
                "start": int(start),
                "end": int(end),
                "offset": int(cand.offset),
                "length": int(length),
                "mean_similarity": mean_sim,
                "median_similarity": median_sim,
                "min_similarity": min_sim,
                "max_similarity": max_sim,
                "threshold": float(cand.threshold),
                "phase_alignment": float(phase_ratio),
                "coverage_ratio": float(coverage_ratio),
                "score": float(cand.score),
                "label": "primary",
            }
        )
    return assignments, pair_similarity, coverage, segments


def _fill_unassigned_ranges(
    assignments: np.ndarray,
    pair_similarity: np.ndarray,
    coverage: np.ndarray,
    ssm: np.ndarray,
    contexts: Sequence[BeatContext],
    offset_scores: Sequence[OffsetScore],
    similarity_threshold: float,
    min_phase_alignment: float,
    min_pairs: int,
) -> List[Dict[str, object]]:
    """Fill remaining gaps by choosing the best offset per contiguous region."""
    n_beats = ssm.shape[0]
    extra_segments: List[Dict[str, object]] = []

    if not n_beats:
        return extra_segments

    default_offset = offset_scores[0].offset if offset_scores else 1
    default_offset = max(1, min(default_offset, n_beats - 1))

    # build list of contiguous uncovered ranges
    ranges: List[Tuple[int, int]] = []
    current_start: Optional[int] = None
    for idx in range(n_beats):
        if not coverage[idx]:
            if current_start is None:
                current_start = idx
        else:
            if current_start is not None:
                ranges.append((current_start, idx))
                current_start = None
    if current_start is not None:
        ranges.append((current_start, n_beats))

    for start, end in ranges:
        length = end - start
        if length <= 0:
            continue
        candidate_offsets = {default_offset}
        candidate_offsets.update(
            score.offset
            for score in offset_scores[: min(8, len(offset_scores))]
            if 0 < score.offset < n_beats
        )
        # consider strong matches for the first beat in the range
        row = ssm[start]
        top_indices = np.argsort(row)[::-1][: min(10, n_beats)]
        for idx_candidate in top_indices:
            if idx_candidate == start:
                continue
            offset = (idx_candidate - start) % n_beats
            if offset == 0:
                continue
            candidate_offsets.add(offset)

        best_choice: Optional[Tuple[int, float, float, float, float, float]] = None
        for offset in candidate_offsets:
            sims: List[float] = []
            phase_matches = 0
            for idx in range(start, end):
                dst = (idx + offset) % n_beats
                sims.append(float(ssm[idx, dst]))
                if contexts[idx].phase == contexts[dst].phase:
                    phase_matches += 1
            phase_ratio = phase_matches / float(length)
            mean_sim = float(np.mean(sims))
            min_sim = float(np.min(sims))
            max_sim = float(np.max(sims))
            relaxed_phase = min_phase_alignment - 0.1
            if length <= min_pairs:
                relaxed_phase = max(0.45, relaxed_phase)
            if phase_ratio < relaxed_phase:
                continue
            score = (
                mean_sim
                + 0.05 * phase_ratio
                + 0.015 * length
                + 0.02 * max_sim
                - max(0.0, (similarity_threshold * 0.4) - min_sim)
            )
            if best_choice is None or score > best_choice[1]:
                best_choice = (
                    offset,
                    score,
                    mean_sim,
                    min_sim,
                    max_sim,
                    phase_ratio,
                )

        if best_choice is None:
            offset = default_offset
            sims = [float(ssm[idx, (idx + offset) % n_beats]) for idx in range(start, end)]
            phase_matches = sum(
                1 for idx in range(start, end)
                if contexts[idx].phase == contexts[(idx + offset) % n_beats].phase
            )
            phase_ratio = phase_matches / float(length)
            mean_sim = float(np.mean(sims))
            min_sim = float(np.min(sims))
            max_sim = float(np.max(sims))
        else:
            offset, _, mean_sim, min_sim, max_sim, phase_ratio = best_choice

        for idx in range(start, end):
            dst = (idx + offset) % n_beats
            assignments[idx] = dst
            pair_similarity[idx] = float(ssm[idx, dst])
            coverage[idx] = True
        extra_segments.append(
            {
                "start": int(start),
                "end": int(end),
                "offset": int(offset),
                "length": int(length),
                "mean_similarity": float(mean_sim),
                "min_similarity": float(min_sim),
                "max_similarity": float(max_sim),
                "threshold": float(similarity_threshold),
                "phase_alignment": float(phase_ratio),
                "coverage_ratio": 1.0,
                "score": float(mean_sim),
                "label": "fallback",
            }
        )
    return extra_segments


def _compute_loop_candidates(
    ssm: np.ndarray,
    contexts: Sequence[BeatContext],
    min_similarity: float,
    max_neighbors: int = 8,
) -> List[Dict[str, float]]:
    """Generate high-similarity edges to seed the jukebox jump graph."""
    n_beats = ssm.shape[0]
    loop_edges: List[Dict[str, float]] = []
    if n_beats == 0:
        return loop_edges

    min_similarity = float(max(-1.0, min_similarity))
    for src in range(n_beats):
        row = ssm[src]
        indices = np.argsort(row)[::-1]
        added = 0
        for dst in indices:
            if dst == src:
                continue
            if abs(dst - src) <= 1:
                continue
            if contexts[src].phase != contexts[dst].phase:
                continue
            sim = float(row[dst])
            if sim < min_similarity:
                break
            loop_edges.append(
                {
                    "source": int(src),
                    "target": int(dst),
                    "similarity": sim,
                }
            )
            added += 1
            if added >= max_neighbors:
                break
    return loop_edges


def compute_canon_alignment(
    y: np.ndarray,
    sr: int,
    beats: List[Quantum],
    duration: float,
    beats_per_bar: int = DEFAULT_TIME_SIGNATURE,
    context_window: int = CANON_CONTEXT_BEATS,
    similarity_threshold: float = CANON_SIMILARITY_THRESHOLD,
    min_phase_alignment: float = CANON_MIN_PHASE_ALIGNMENT,
    min_pairs: int = CANON_MIN_PAIRS,
    top_candidates: int = CANON_TOP_CANDIDATES,
) -> Optional[Dict[str, object]]:
    if len(beats) <= 1:
        return None

    beat_times = [float(b.start) for b in beats]
    stacked, contexts = _stack_beat_features(
        y=y,
        sr=sr,
        beat_times=beat_times,
        duration=duration,
        beats_per_bar=beats_per_bar,
        hop_length=HOP_LENGTH,
        context_window=context_window,
    )
    ssm = _cosine_ssm(stacked)
    offsets = _evaluate_offsets(
        ssm=ssm,
        contexts=contexts,
        beats_per_bar=beats_per_bar,
        min_pairs=min_pairs,
        min_phase_alignment=min_phase_alignment,
        similarity_threshold=similarity_threshold,
    )
    n_beats = len(beats)
    loop_candidates = _compute_loop_candidates(
        ssm=ssm,
        contexts=contexts,
        min_similarity=similarity_threshold * 0.8,
    )

    if not offsets:
        if n_beats == 0:
            return None
        fallback_offset = 1 if n_beats > 1 else 0
        assignments = np.array(
            [(idx + fallback_offset) % n_beats for idx in range(n_beats)],
            dtype=np.int32,
        )
        pair_similarity = np.array(
            [float(ssm[idx, assignments[idx]]) for idx in range(n_beats)],
            dtype=np.float32,
        )
        transitions = [
            {
                "source": int(idx),
                "target": int(assignments[idx]),
                "similarity": float(pair_similarity[idx]),
            }
            for idx in range(n_beats)
        ]
        return {
            "offset": int(fallback_offset),
            "context_window": int(context_window),
            "similarity_threshold": float(similarity_threshold),
            "min_phase_alignment": float(min_phase_alignment),
            "min_pairs": int(min_pairs),
            "offset_candidates": [],
            "segments": [],
            "runs": [],
            "pairs": [int(val) for val in assignments.tolist()],
            "pair_similarity": [float(val) for val in pair_similarity.tolist()],
            "transitions": transitions,
            "coverage": {
                "ratio": 1.0 if n_beats else 0.0,
                "uncovered": 0,
                "segments": 0,
            },
            "loop_candidates": loop_candidates,
            "notes": {
                "message": "Fallback sequential offset applied due to insufficient similarity data.",
            },
        }

    top = offsets[:top_candidates]
    default_offset = top[0].offset

    candidates = _collect_canon_candidates(
        ssm=ssm,
        offset_scores=top,
        similarity_threshold=similarity_threshold,
        min_pairs=min_pairs,
    )
    assignments, pair_similarity, coverage, primary_segments = _apply_canon_candidates(
        candidates=candidates,
        ssm=ssm,
        contexts=contexts,
        min_phase_alignment=min_phase_alignment,
        similarity_threshold=similarity_threshold,
        min_pairs=min_pairs,
    )
    extra_segments = _fill_unassigned_ranges(
        assignments=assignments,
        pair_similarity=pair_similarity,
        coverage=coverage,
        ssm=ssm,
        contexts=contexts,
        offset_scores=top,
        similarity_threshold=similarity_threshold,
        min_phase_alignment=min_phase_alignment,
        min_pairs=min_pairs,
    )
    segments = primary_segments + extra_segments

    # ensure every beat has an assignment
    n_beats = len(beats)
    if n_beats:
        fallback_offset = default_offset if default_offset > 0 else 1
        for idx in range(n_beats):
            if assignments[idx] < 0:
                dst = (idx + fallback_offset) % n_beats
                assignments[idx] = dst
                pair_similarity[idx] = float(ssm[idx, dst])
                coverage[idx] = True
    coverage_ratio = float(np.mean(coverage.astype(np.float32))) if n_beats else 0.0

    transition_candidates: Dict[int, List[Tuple[int, float]]] = defaultdict(list)
    for idx in range(n_beats):
        dst = int(assignments[idx])
        if dst < 0:
            continue
        sim = float(pair_similarity[idx])
        transition_candidates[idx].append((dst, sim))

    transitions: List[Dict[str, object]] = []
    for src, edges in transition_candidates.items():
        edges.sort(key=lambda item: item[1], reverse=True)
        for dst, sim in edges[:6]:
            transitions.append(
                {
                    "source": int(src),
                    "target": int(dst),
                    "similarity": float(sim),
                }
            )

    # Provide legacy run data for the primary offset
    diag = np.diag(ssm, k=default_offset) if default_offset > 0 else np.array([])
    runs = _detect_runs(
        ssm=ssm,
        offset=default_offset,
        threshold=similarity_threshold,
        min_length=min_pairs,
    ) if default_offset > 0 else []
    run_dicts = [
        {"start": int(start), "end": int(end), "length": int(end - start)}
        for start, end in runs
    ]

    candidate_dicts = [
        {
            "offset": int(score.offset),
            "mean_similarity": float(score.mean),
            "std_similarity": float(score.std),
            "pairs_evaluated": int(score.length),
            "phase_alignment": float(score.phase_alignment),
            "high_similarity_ratio": float(score.high_similarity_ratio),
        }
        for score in top
    ]

    segments.sort(key=lambda seg: (seg["start"], seg["offset"]))

    uncovered = int(np.sum(~coverage)) if n_beats else 0
    coverage_info = {
        "ratio": float(coverage_ratio),
        "uncovered": uncovered,
        "segments": len(segments),
    }

    return {
        "offset": int(default_offset),
        "context_window": int(context_window),
        "similarity_threshold": float(similarity_threshold),
        "min_phase_alignment": float(min_phase_alignment),
        "min_pairs": int(min_pairs),
        "offset_candidates": candidate_dicts,
        "runs": run_dicts,
        "segments": segments,
        "pairs": [int(val) for val in assignments.tolist()],
        "pair_similarity": [float(val) for val in pair_similarity.tolist()],
        "transitions": transitions,
        "coverage": coverage_info,
        "loop_candidates": loop_candidates,
        "notes": {
            "candidate_count": len(candidates),
            "primary_segments": len(primary_segments),
            "fallback_segments": len(extra_segments),
            "overall_similarity": float(
                float(np.mean(pair_similarity)) if n_beats else 0.0
            ),
        },
    }


def euclidean_distance(v1: np.ndarray, v2: np.ndarray) -> float:
    """Compute Euclidean distance between two vectors."""
    return float(np.sqrt(np.sum((v1 - v2) ** 2)))


def cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
    """Compute cosine similarity between two vectors (returns 0-1, higher is more similar)."""
    dot = np.dot(v1, v2)
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(max(0.0, min(1.0, (dot / (norm1 * norm2) + 1) / 2)))


def compute_segment_similarity(seg1: Dict, seg2: Dict) -> float:
    """
    Compute similarity between two segments using timbre and pitch.
    Returns similarity score 0-1, where 1 is most similar.
    """
    timbre1 = np.array(seg1.get("timbre", []))
    timbre2 = np.array(seg2.get("timbre", []))
    pitches1 = np.array(seg1.get("pitches", []))
    pitches2 = np.array(seg2.get("pitches", []))

    if len(timbre1) == 0 or len(timbre2) == 0:
        return 0.0

    # Timbre similarity (70% weight) - use cosine for MFCC-like features
    timbre_sim = cosine_similarity(timbre1, timbre2)

    # Pitch similarity (30% weight) - use cosine for chroma features
    pitch_sim = 0.5
    if len(pitches1) > 0 and len(pitches2) > 0:
        pitch_sim = cosine_similarity(pitches1, pitches2)

    # Combined similarity
    combined = 0.7 * timbre_sim + 0.3 * pitch_sim

    return float(combined)


def compute_beat_to_beat_similarity(
    beats: List[Quantum],
    segments: List[Dict],
) -> np.ndarray:
    """
    Compute similarity matrix between beats based on their overlapping segments.
    Returns NxN matrix where N is number of beats.
    """
    n_beats = len(beats)
    similarity_matrix = np.zeros((n_beats, n_beats), dtype=np.float32)

    # Map segments to beats
    beat_segments = []
    for beat in beats:
        beat_start = beat.start
        beat_end = beat.start + beat.duration
        overlapping = []
        for seg in segments:
            seg_start = seg["start"]
            seg_end = seg["start"] + seg["duration"]
            # Check if segment overlaps with beat
            if seg_start < beat_end and seg_end > beat_start:
                overlapping.append(seg)
        beat_segments.append(overlapping)

    # Compute pairwise similarities
    for i in range(n_beats):
        for j in range(n_beats):
            if i == j:
                similarity_matrix[i, j] = 1.0
                continue

            # Compare segments in each beat
            segs_i = beat_segments[i]
            segs_j = beat_segments[j]

            if not segs_i or not segs_j:
                similarity_matrix[i, j] = 0.0
                continue

            # Average similarity across segment pairs
            similarities = []
            for seg_i in segs_i:
                for seg_j in segs_j:
                    sim = compute_segment_similarity(seg_i, seg_j)
                    similarities.append(sim)

            if similarities:
                similarity_matrix[i, j] = np.mean(similarities)
            else:
                similarity_matrix[i, j] = 0.0

    return similarity_matrix


def generate_loop_candidates(
    beats: List[Quantum],
    similarity_matrix: np.ndarray,
    min_loop_distance: int = 8,
    similarity_threshold: float = 0.65,
    max_candidates_per_beat: int = 12,
) -> Dict[int, List[Dict]]:
    """
    Generate loop candidates for each beat based on similarity scores.
    Returns dict mapping beat_index -> list of {target, similarity, span}.
    Only includes backward jumps (target < source).
    """
    n_beats = len(beats)
    loop_candidates = {}

    for source_idx in range(n_beats):
        candidates = []

        # Only consider backward jumps
        for target_idx in range(source_idx):
            span = source_idx - target_idx

            # Must be far enough apart
            if span < min_loop_distance:
                continue

            similarity = similarity_matrix[source_idx, target_idx]

            # Must meet threshold
            if similarity < similarity_threshold:
                continue

            candidates.append({
                "target": target_idx,
                "similarity": float(similarity),
                "span": span,
            })

        # Sort by similarity (best first) and limit
        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        loop_candidates[source_idx] = candidates[:max_candidates_per_beat]

    return loop_candidates


def build_profile(
    audio_path: Path,
    track_id: str,
    title: str,
    artist: str,
    audio_url: str,
    output_path: Path,
) -> Dict[str, object]:
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    duration = librosa.get_duration(y=y, sr=sr)

    beats, beat_times, tempo = compute_beats(y, sr)
    if not beats:
        # fallback: create a simple evenly spaced grid
        grid = np.linspace(0, duration, num=max(int(duration * 2), 2), endpoint=False)
        beats = [
            Quantum(
                start=float(t),
                duration=float(min(duration - t, duration / len(grid))),
                confidence=0.5,
            )
            for t in grid
        ]
        beat_times = np.array([b.start for b in beats])
        tempo = 60.0 / beats[0].duration if beats and beats[0].duration > 0 else 120.0

    bars = derive_bars(beats, beat_times, duration)
    tatums = derive_tatums(beats, duration)

    desired_sections = max(2, min(12, len(beats) // 8 or 2))
    sections = estimate_sections(y, sr, duration, desired_sections, bars)
    segments = compute_segments(y, sr, duration)

    chroma_full = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP_LENGTH)
    key_index, mode = estimate_key(chroma_full)
    loudness_global = float(np.mean(librosa.amplitude_to_db(np.abs(y), ref=1.0)))

    canon_alignment = compute_canon_alignment(
        y=y,
        sr=sr,
        beats=beats,
        duration=duration,
        beats_per_bar=DEFAULT_TIME_SIGNATURE,
        context_window=CANON_CONTEXT_BEATS,
        similarity_threshold=CANON_SIMILARITY_THRESHOLD,
        min_phase_alignment=CANON_MIN_PHASE_ALIGNMENT,
        min_pairs=CANON_MIN_PAIRS,
        top_candidates=CANON_TOP_CANDIDATES,
    )
    loop_candidates = (
        canon_alignment.get("loop_candidates", []) if canon_alignment else []
    )

    # Compute segment-based similarity matrix for eternal jukebox
    print("[Analysis] Computing segment similarity matrix for eternal jukebox...", flush=True)
    similarity_matrix = compute_beat_to_beat_similarity(beats, segments)

    # Generate loop candidates with multiple threshold tiers for flexibility
    eternal_loop_candidates = {}
    for threshold in [0.76, 0.65, 0.55]:  # High, medium, low quality tiers
        candidates = generate_loop_candidates(
            beats=beats,
            similarity_matrix=similarity_matrix,
            min_loop_distance=8,
            similarity_threshold=threshold,
            max_candidates_per_beat=12,
        )
        # Merge with lower priority for lower thresholds
        for src, cand_list in candidates.items():
            if src not in eternal_loop_candidates:
                eternal_loop_candidates[src] = []
            # Add new candidates that aren't already present
            existing_targets = {c["target"] for c in eternal_loop_candidates[src]}
            for cand in cand_list:
                if cand["target"] not in existing_targets:
                    eternal_loop_candidates[src].append(cand)
                    existing_targets.add(cand["target"])

    print(f"[Analysis] Generated {sum(len(v) for v in eternal_loop_candidates.values())} eternal jukebox loop candidates", flush=True)

    profile = {
        "response": {
            "status": {"code": 0, "message": "OK"},
            "track": {
                "id": track_id,
                "title": title,
                "artist": artist,
                "status": "complete",
                "info": {"url": audio_url},
                "audio_summary": {
                    "duration": float(duration),
                    "tempo": float(tempo),
                    "time_signature": DEFAULT_TIME_SIGNATURE,
                    "key": int(key_index),
                    "mode": int(mode),
                    "loudness": loudness_global,
                    "analysis_sample_rate": sr,
                },
                "analysis": {
                    "version": "local-1.0",
                    "sample_rate": sr,
                    "counts": {
                        "sections": len(sections),
                        "bars": len(bars),
                        "beats": len(beats),
                        "tatums": len(tatums),
                        "segments": len(segments),
                    },
                    "sections": [s.as_dict() for s in sections],
                    "bars": [b.as_dict() for b in bars],
                    "beats": [b.as_dict() for b in beats],
                    "tatums": [t.as_dict() for t in tatums],
                    "segments": segments,
                    "canon_alignment": canon_alignment,
                    "loop_candidates": loop_candidates,
                    "eternal_loop_candidates": eternal_loop_candidates,
                },
            },
        }
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as sink:
        json.dump(profile, sink, indent=2)
    return profile


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate an Infinite Jukebox compatible analysis profile."
    )
    parser.add_argument("--audio", required=True, type=Path, help="Path to the audio file.")
    parser.add_argument("--track-id", required=True, help="Identifier used in go.html?trid=...")
    parser.add_argument("--title", default=None, help="Human friendly track title.")
    parser.add_argument("--artist", default="(unknown artist)", help="Artist name.")
    parser.add_argument(
        "--audio-url",
        default=None,
        help="Public or relative URL the web app can stream. Defaults to the audio path basename.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Destination JSON path. Defaults to data/<track_id>.json",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    audio_path = args.audio.resolve()
    if not audio_path.exists():
        raise SystemExit(f"Audio file not found: {audio_path}")

    track_id = args.track_id
    title = args.title or audio_path.stem
    audio_url = args.audio_url or audio_path.name
    output_path = args.output or DEFAULT_DATA_DIR / f"{track_id}.json"

    profile = build_profile(
        audio_path=audio_path,
        track_id=track_id,
        title=title,
        artist=args.artist,
        audio_url=audio_url,
        output_path=output_path,
    )

    print(f"Wrote analysis to {output_path}")
    print(
        f"Track: {profile['response']['track']['title']} "
        f"({profile['response']['track']['audio_summary']['duration']:.2f}s)"
    )


if __name__ == "__main__":
    main()
