"""
Live-drive endless stream synthesis for the squeezebox reverse bridge.

This reproduces, server-side and faithfully, what the browser plays live:
  * jukebox / eternal : a probabilistic weighted random-walk on the circular
    beat timeline -- a verbatim port of frontend/js/eternal_jukebox_engine.js
    (selectNextBeat / _computeEdgeWeight). Same graph, same weights => same
    musical behaviour as the live page.
  * canon            : the autocanonizer overlay -- the main voice plays through
    while N overlay voices trail/lead by bar-quantised offsets drawn from the
    same pool the live engine uses (frontend/jremix.js availableBarOffsets).

The output is an *endless* stream of float32 stereo blocks. Nothing is rendered
up front: blocks are produced on demand as the encoder pulls them, so playback
starts in ~1s and never ends (the squeezebox treats it as a radio stream).

Pure-numpy, no Flask/app imports (kept dependency-free so it can be unit-tested
in isolation).
"""

from __future__ import annotations

import random
from typing import Dict, Iterator, List, Optional

import numpy as np

# --- jremix.js: availableBarOffsets pool for canon overlay voices -------------
AVAILABLE_BAR_OFFSETS = [4, 8, 16, -4, -8, -16, 32, -32, 2, 6, 12, 24]
VOICE_JUMP_COOLDOWN = 16          # min beats between offset changes (4 bars)
OVERLAY_GAIN = 0.65               # jremix.js base overlay gain
MAIN_GAIN = 0.9                   # masterGain-ish; leaves headroom for overlays

# Default config mirrors eternal_jukebox_engine.js EternalJukeboxEngine defaults.
JUKEBOX_DEFAULTS = {
    "timbreWeight": 0.7,
    "similarityPower": 1.8,
    "minSpan": 8,
    "maxSpan": None,              # auto: nBeats / 2
    "spanPowerForward": 0.8,
    "spanPowerBackward": 0.6,
    "sectionBias": 0.6,
    "sameSectionBonus": 0.3,
    "crossSectionPenalty": 0.1,
    "downbeatBonus": 0.2,
    "memorySize": 32,
    "memoryPenalty": 0.7,
    "visitCountDecay": 0.95,
    "cycleDetectionLength": 8,
    "cyclePenalty": 0.5,
    "escapeProb": 0.05,
    "escapeTempIncrease": 0.3,
    "preferPhraseStart": True,
    "phraseStartBonus": 0.25,
}


def _mod(n: int, m: int) -> int:
    return ((n % m) + m) % m


class JukeboxWalker:
    """Verbatim port of eternal_jukebox_engine.js (selectNextBeat / weights)."""

    def __init__(self, beats: List[dict], sections: List[dict],
                 candidates: dict, rng: random.Random, config: Optional[dict] = None):
        self.cfg = dict(JUKEBOX_DEFAULTS)
        if config:
            self.cfg.update({k: v for k, v in config.items() if v is not None})
        self.rng = rng
        self.beats = beats
        self.sections = sections
        self.n = len(beats)
        if not self.cfg.get("maxSpan"):
            self.cfg["maxSpan"] = max(1, self.n // 2)
        self.adjacency: Dict[int, List[dict]] = self._build_adjacency(candidates)
        self.visit_history: List[int] = []
        self.visit_count: Dict[int, float] = {i: 0.0 for i in range(self.n)}
        self.last_jumps: List[int] = []
        self.total_jumps = 0

    def _build_adjacency(self, candidates: dict) -> Dict[int, List[dict]]:
        adj: Dict[int, List[dict]] = {}
        if not isinstance(candidates, dict):
            return adj
        for src_key, edges in candidates.items():
            try:
                src = int(src_key)
            except (TypeError, ValueError):
                continue
            if not isinstance(edges, list):
                continue
            mapped = []
            for edge in edges:
                if not isinstance(edge, dict):
                    continue
                span = edge.get("span", 0) or 0
                mapped.append({
                    "target": int(edge.get("target", 0)),
                    "similarity": float(edge.get("similarity", 0) or 0),
                    "span": span,
                    "abs_span": float(edge.get("abs_span", abs(span)) or abs(span)),
                    "direction": edge.get("direction") or ("forward" if span > 0 else "backward"),
                    "section_match": bool(edge.get("section_match", False)),
                })
            adj[src] = mapped
        return adj

    def select_next(self, current: int) -> tuple[int, bool]:
        """Returns (target_beat_index, is_jump)."""
        current = _mod(current, self.n)
        self._record_visit(current)

        candidates = self.adjacency.get(current)
        if not candidates:
            return _mod(current + 1, self.n), False

        should_escape = self.rng.random() < self.cfg["escapeProb"]
        temperature = self.cfg["escapeTempIncrease"] if should_escape else 0.0

        weights = [self._edge_weight(current, e, temperature) for e in candidates]
        total = sum(weights)
        if total <= 0:
            return _mod(current + 1, self.n), False

        pick = self.rng.random() * total
        selected_idx = -1
        for i, w in enumerate(weights):
            pick -= w
            if pick <= 0:
                selected_idx = i
                break
        if selected_idx == -1:
            selected_idx = len(weights) - 1

        selected = candidates[selected_idx]
        self._record_jump(selected["target"], selected["direction"])
        return selected["target"], True

    def _edge_weight(self, src: int, edge: dict, temperature: float) -> float:
        cfg = self.cfg
        sim_score = edge["similarity"] ** cfg["similarityPower"]

        if edge["direction"] == "forward":
            span_factor = (edge["abs_span"] / cfg["maxSpan"]) ** cfg["spanPowerForward"]
        else:
            span_factor = (edge["abs_span"] / cfg["maxSpan"]) ** cfg["spanPowerBackward"]
        span_factor = min(1.5, 0.5 + span_factor)

        section_factor = 1.0
        if edge["section_match"]:
            section_factor += cfg["sameSectionBonus"]
        else:
            section_factor -= cfg["crossSectionPenalty"]

        musicality_factor = 1.0
        target = edge["target"]
        if cfg["preferPhraseStart"] and 0 <= target < self.n:
            beat = self.beats[target]
            conf = beat.get("confidence") if isinstance(beat, dict) else None
            if conf is not None and conf > 0.8:
                musicality_factor += cfg["downbeatBonus"]

        memory_penalty = 1.0
        try:
            visit_idx = self.visit_history.index(target)
            recency = len(self.visit_history) - visit_idx
            memory_penalty = cfg["memoryPenalty"] ** (recency / cfg["memorySize"])
        except ValueError:
            pass

        visit_penalty = 1.0
        target_visits = self.visit_count.get(target, 0.0)
        if target_visits > 0:
            visit_penalty = 1.0 / (1.0 + target_visits * 0.1)

        cycle_penalty = self.cfg["cyclePenalty"] if self._detects_cycle(target) else 1.0

        temp_factor = 1.0 + temperature * (self.rng.random() * 2 - 1)

        weight = (sim_score * span_factor * section_factor * musicality_factor *
                  memory_penalty * visit_penalty * cycle_penalty * temp_factor)
        return max(0.01, weight)

    def _detects_cycle(self, target: int) -> bool:
        length = self.cfg["cycleDetectionLength"]
        if len(self.last_jumps) < length:
            return False
        recent = self.last_jumps[-length:]
        return recent.count(target) >= 2

    def _record_visit(self, idx: int) -> None:
        self.visit_history.append(idx)
        if len(self.visit_history) > self.cfg["memorySize"]:
            self.visit_history.pop(0)
        self.visit_count[idx] = self.visit_count.get(idx, 0.0) + 1.0
        decay = self.cfg["visitCountDecay"]
        for k in self.visit_count:
            self.visit_count[k] *= decay

    def _record_jump(self, target: int, direction: str) -> None:
        self.total_jumps += 1
        self.last_jumps.append(target)
        if len(self.last_jumps) > self.cfg["cycleDetectionLength"] * 2:
            self.last_jumps.pop(0)


def _read_wrap(audio: np.ndarray, start: int, length: int) -> np.ndarray:
    """Read `length` frames from `start`, wrapping circularly (eternal-safe)."""
    n = audio.shape[0]
    if n == 0 or length <= 0:
        return np.zeros((max(0, length), audio.shape[1]), dtype=np.float32)
    start = start % n
    if start + length <= n:
        return audio[start:start + length]
    # wrap
    first = audio[start:]
    rest = length - first.shape[0]
    pieces = [first]
    while rest > 0:
        take = min(rest, n)
        pieces.append(audio[:take])
        rest -= take
    return np.concatenate(pieces, axis=0)[:length]


def _equal_power_fade(length: int) -> tuple[np.ndarray, np.ndarray]:
    """Equal-power (sin/cos) fade curves -> no volume dip at the seam."""
    t = np.linspace(0.0, 1.0, length, dtype=np.float32)
    fade_in = np.sin(t * (np.pi / 2.0))[:, None]
    fade_out = np.cos(t * (np.pi / 2.0))[:, None]
    return fade_in, fade_out


def synthesize(track: dict, audio: np.ndarray, sr: int, mode: str,
               settings: Optional[dict] = None, seed: Optional[int] = None,
               voice_count: int = 2) -> Iterator[np.ndarray]:
    """
    Yield float32 stereo blocks forever, faithful to the live engine.

    audio: float32 [frames, channels] (channels coerced to 2).
    mode : 'canon' | 'eternal' | 'jukebox' (anything else -> linear loop).
    """
    settings = settings or {}
    if audio.ndim == 1:
        audio = np.stack([audio, audio], axis=1)
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    audio = np.ascontiguousarray(audio[:, :2], dtype=np.float32)
    channels = audio.shape[1]

    analysis = track.get("analysis") or {}
    beats = [b for b in (analysis.get("beats") or []) if isinstance(b, dict)]
    n = len(beats)
    rng = random.Random(seed if seed is not None else 0xC0FFEE)
    mode = (mode or "canon").lower()

    # Degenerate: no beat graph -> seamless original loop.
    if n < 2:
        pos = 0
        block = sr  # 1s blocks
        while True:
            yield _read_wrap(audio, pos, block) * MAIN_GAIN
            pos += block
        return

    beat_start = [int(round(float(b.get("start", 0.0) or 0.0) * sr)) for b in beats]
    walk = mode in ("jukebox", "eternal")
    walker = None
    if walk:
        walker = JukeboxWalker(beats, analysis.get("sections") or [],
                               analysis.get("eternal_loop_candidates") or {}, rng)

    # Voice topology (jremix.js).
    if mode == "canon":
        num_voices = max(2, min(8, int(voice_count or 2)))
    elif mode == "eternal":
        num_voices = 2
    else:  # jukebox / linear
        num_voices = 1
    overlay_count = num_voices - 1
    voice_reduction = 1.0 / (1.0 + (num_voices - 2) * 0.15) if num_voices > 2 else 1.0
    overlay_gain = OVERLAY_GAIN * max(0.5, voice_reduction)
    beats_per_bar = int(analysis.get("beats_per_bar") or 4)

    # Per-overlay-voice bar-offset state (staggered initial offsets, jremix).
    voice_offsets = [AVAILABLE_BAR_OFFSETS[i % len(AVAILABLE_BAR_OFFSETS)] for i in range(overlay_count)]
    voice_since_jump = [0] * overlay_count

    def maybe_jump_voice(vi: int, main_beat_idx: int) -> None:
        """jremix maybeJumpVoiceOffset: canon-only dynamic offset changes."""
        voice_since_jump[vi] += 1
        if mode != "canon":
            return
        if voice_since_jump[vi] < VOICE_JUMP_COOLDOWN:
            return
        is_phrase = (main_beat_idx % 8) == 0
        prob = 0.3 if is_phrase else 0.05
        if rng.random() > prob:
            return
        current = voice_offsets[vi]
        choices = [o for o in AVAILABLE_BAR_OFFSETS if o != current]
        if not choices:
            return
        voice_offsets[vi] = choices[rng.randrange(len(choices))]
        voice_since_jump[vi] = 0

    xfade = max(48, int(sr * 0.012))   # 12ms equal-power crossfade at main jumps
    fade_in, fade_out = _equal_power_fade(xfade)

    cur = 0
    prev_seg: Optional[np.ndarray] = None  # tail of previously emitted main beat

    while True:
        s0 = beat_start[cur]
        # main beat length = gap to the next sequential beat (stable, gapless)
        s_next_seq = beat_start[(cur + 1) % n]
        length = s_next_seq - s0
        if length <= 0:
            length = int(sr * float(beats[cur].get("duration", 0.25) or 0.25))
        length = max(1, length)

        seg = _read_wrap(audio, s0, length).astype(np.float32, copy=True) * MAIN_GAIN

        # Overlay (canon) voices: trail/lead by bar offsets, mixed in-sync.
        for vi in range(overlay_count):
            beat_off = voice_offsets[vi] * beats_per_bar
            tgt = _mod(cur + beat_off, n)
            delta = beat_start[tgt] - s0
            oseg = _read_wrap(audio, s0 + delta, length)
            seg += oseg * overlay_gain
            maybe_jump_voice(vi, cur)

        # Soft peak guard (matches render: keep below clipping).
        peak = float(np.max(np.abs(seg))) if seg.size else 0.0
        if peak > 0.98:
            seg *= 0.98 / peak

        # Decide next beat.
        if walk:
            nxt, is_jump = walker.select_next(cur)
        else:
            nxt = (cur + 1) % n
            is_jump = (nxt == 0)  # loop wrap -> crossfade the seam

        # Equal-power crossfade at jumps; gapless concat otherwise.
        if prev_seg is not None and is_jump and prev_seg.shape[0] >= xfade and seg.shape[0] >= xfade:
            head = seg[:xfade].copy()
            tail = prev_seg[-xfade:]
            seg[:xfade] = tail * fade_out + head * fade_in

        yield seg
        prev_seg = seg
        cur = nxt
