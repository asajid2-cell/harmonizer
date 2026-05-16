#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  console.error("Usage: node tools/jukebox_sim.js --profile path.json [--policy current] [--minutes 3] [--seeds 20]");
  process.exit(2);
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  if (idx + 1 >= process.argv.length) usage();
  return process.argv[idx + 1];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function loadTrack(profilePath) {
  const raw = JSON.parse(fs.readFileSync(profilePath, "utf8"));
  const track = raw.response && raw.response.track ? raw.response.track : raw;
  const analysis = track.analysis || {};
  const beats = analysis.beats || [];
  const candidates = analysis.eternal_loop_candidates || {};
  return {
    title: track.title || path.basename(profilePath),
    beats,
    candidates,
    duration: track.audio_summary && track.audio_summary.duration,
  };
}

function beatPhase(beat) {
  if (!beat) return 0;
  if (typeof beat.beat_in_bar === "number") return beat.beat_in_bar;
  if (typeof beat.indexInParent === "number") return beat.indexInParent;
  return typeof beat.which === "number" ? beat.which % 4 : 0;
}

function beatEnergy(beat) {
  if (!beat) return 0;
  if (typeof beat.median_volume === "number") return beat.median_volume;
  if (typeof beat.volume === "number") return beat.volume;
  if (typeof beat.loudness === "number") return beat.loudness;
  return 0;
}

function inferMeterGrid(beats) {
  const fallback = { length: 4, offset: 0, confidence: 0, secondaryPhases: [], source: "fallback" };
  if (!beats.length) return fallback;

  const metaCounts = {};
  let phaseCount = 0;
  beats.forEach((beat) => {
    if (!beat) return;
    if (typeof beat.bar_length_beats === "number") {
      const len = Math.round(beat.bar_length_beats);
      if (len >= 3 && len <= 8) metaCounts[len] = (metaCounts[len] || 0) + 1;
    }
    if (typeof beat.beat_in_bar === "number" || typeof beat.indexInParent === "number") phaseCount++;
  });
  const bestMeta = Object.keys(metaCounts).map(Number).sort((a, b) => metaCounts[b] - metaCounts[a])[0];
  if (bestMeta && phaseCount >= Math.max(12, beats.length * 0.3)) {
    return {
      length: bestMeta,
      offset: 0,
      confidence: 0.9,
      secondaryPhases: bestMeta === 4 ? [2] : bestMeta === 6 ? [3] : [],
      source: "metadata",
    };
  }

  const energies = beats.map(beatEnergy);
  const sorted = energies.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const devs = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = devs[Math.floor(devs.length / 2)] || 1;
  const norm = energies.map((v) => (v - median) / Math.max(1, mad));
  let best = null;
  for (let meter = 3; meter <= 8; meter++) {
    for (let offset = 0; offset < meter; offset++) {
      const down = [];
      const other = [];
      norm.forEach((v, idx) => {
        (((idx - offset) % meter) + meter) % meter === 0 ? down.push(v) : other.push(v);
      });
      if (down.length < 4 || other.length < 8) continue;
      const downMean = down.reduce((s, v) => s + v, 0) / down.length;
      const otherMean = other.reduce((s, v) => s + v, 0) / other.length;
      const score = downMean - otherMean;
      if (!best || score > best.score) best = { length: meter, offset, score };
    }
  }
  if (!best) return fallback;
  const confidence = Math.max(0, Math.min(0.85, best.score / 1.4));
  if (confidence < 0.12) return fallback;
  return {
    length: best.length,
    offset: best.offset,
    confidence,
    secondaryPhases: best.length === 4 && confidence >= 0.35 ? [2] : best.length === 6 && confidence >= 0.35 ? [3] : [],
    source: "energy",
  };
}

function musicalPhase(beats, grid, idx) {
  const beat = beats[idx];
  const len = Math.max(3, grid.length || 4);
  if (beat && typeof beat.beat_in_bar === "number") return ((Math.round(beat.beat_in_bar) % len) + len) % len;
  if (beat && typeof beat.indexInParent === "number") return ((Math.round(beat.indexInParent) % len) + len) % len;
  return (((idx - (grid.offset || 0)) % len) + len) % len;
}

function isPrimaryPhase(beats, grid, idx) {
  return musicalPhase(beats, grid, idx) === 0;
}

function isSecondaryPhase(beats, grid, idx) {
  return (grid.secondaryPhases || []).includes(musicalPhase(beats, grid, idx));
}

function isSafeExit(beats, grid, idx, intent) {
  if (isPrimaryPhase(beats, grid, idx)) return true;
  return grid.confidence >= 0.35 && (intent === "escape" || intent === "continue") && isSecondaryPhase(beats, grid, idx);
}

function phasesCompatible(beats, grid, source, target, intent) {
  const sp = musicalPhase(beats, grid, source);
  const tp = musicalPhase(beats, grid, target);
  if (sp === 0 && tp === 0) return true;
  return sp === tp && grid.confidence >= 0.35 && (intent === "escape" || intent === "continue") && isSecondaryPhase(beats, grid, source);
}

function normalizeGraph(track, opts) {
  const n = track.beats.length;
  const graph = {};
  const threshold = opts.loopThreshold;
  const minLoopBeats = opts.minLoopBeats;
  Object.keys(track.candidates || {}).forEach((key) => {
    const src = Number.parseInt(key, 10);
    if (!Number.isFinite(src) || src < 0 || src >= n) return;
    const list = Array.isArray(track.candidates[key]) ? track.candidates[key] : [];
    list.forEach((cand) => {
      if (!cand || typeof cand.target !== "number") return;
      const dst = cand.target;
      if (dst < 0 || dst >= n || dst === src) return;
      const sim = typeof cand.similarity === "number" ? cand.similarity : 0;
      if (sim < threshold) return;
      const span = typeof cand.span === "number" ? cand.span : dst - src;
      const absSpan = Math.abs(span);
      if (absSpan < minLoopBeats) return;
      if (!graph[src]) graph[src] = [];
      graph[src].push({
        target: dst,
        similarity: sim,
        span,
        absSpan,
        direction: cand.direction || (span < 0 ? "backward" : "forward"),
        sameSection: !!cand.section_match,
        score: typeof cand.score === "number" ? cand.score : null,
        beatInBar: typeof cand.beat_in_bar === "number" ? cand.beat_in_bar : null,
        chroma: typeof cand.chroma_similarity === "number" ? cand.chroma_similarity : 0,
        sourceEnergy: typeof cand.source_energy === "number" ? cand.source_energy : null,
        targetEnergy: typeof cand.target_energy === "number" ? cand.target_energy : null,
      });
    });
  });
  Object.keys(graph).forEach((key) => {
    graph[key].sort((a, b) => b.similarity - a.similarity);
    graph[key] = graph[key].slice(0, opts.maxEdgesPerBeat || 16);
  });
  return graph;
}

function randomInt(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function circularDistance(a, b, n) {
  const diff = Math.abs(a - b);
  return Math.min(diff, n - diff);
}

function sectionOf(beat) {
  return beat && typeof beat.section === "number" ? beat.section : -1;
}

function runCurrent(track, seed, minutes) {
  const rand = mulberry32(seed);
  const n = track.beats.length;
  const opts = {
    minLoopBeats: 12,
    maxSequentialBeats: 90,
    loopThreshold: 0.58,
    maxEdgesPerBeat: 16,
    minDwellBeats: 6,
    minScore: 0.5,
    jumpTemperature: 0.25,
  };
  const graph = normalizeGraph(track, opts);
  let idx = 0;
  let elapsed = 0;
  let beatsSinceJump = opts.minDwellBeats;
  let beatsUntilJump = randomInt(rand, opts.minLoopBeats, Math.max(opts.minLoopBeats + 2, opts.maxSequentialBeats));
  const loopHistory = [];
  const edgeUsage = {};
  const usedJumpEdges = {};
  const visitedBars = {};
  const visited = [];
  const jumps = [];

  function select(src) {
    const out = [];
    const radius = Math.min(8, Math.floor(opts.minLoopBeats / 2));
    for (let offset = 0; offset <= radius; offset++) {
      [src + offset, src - offset].forEach((probe, pos) => {
        if (offset === 0 && pos === 1) return;
        if (probe >= 0 && probe < n && graph[probe]) {
          graph[probe].forEach((edge) => out.push({ source: probe, edge, distance: offset }));
        }
      });
    }
    if (!out.length) return null;
    let filtered = out.filter((item) => !loopHistory.slice(-4).some((h) =>
      (h.source === item.source && h.target === item.edge.target) ||
      (h.source === item.edge.target && h.target === item.source)
    ));
    if (!filtered.length) filtered = out;
    const srcBeat = track.beats[src];
    const srcPhase = beatPhase(srcBeat);
    const srcEnergy = beatEnergy(srcBeat);
    const scored = [];
    filtered.forEach((item) => {
      const edge = item.edge;
      const targetBeat = track.beats[edge.target];
      if (!targetBeat) return;
      const targetPhase = edge.beatInBar !== null ? edge.beatInBar : beatPhase(targetBeat);
      const phasePenalty = srcPhase !== targetPhase ? 0.15 : 0;
      const direction = edge.direction || (edge.span < 0 ? "backward" : "forward");
      let backwardPenalty = 0;
      if (direction === "backward") {
        if (!edge.sameSection) backwardPenalty += 0.12;
        if (edge.absSpan > Math.max(24, Math.floor(n * 0.1))) backwardPenalty += 0.08;
        if (beatsSinceJump < opts.minDwellBeats + 2) backwardPenalty += 0.10;
      }
      const targetEnergy = edge.targetEnergy !== null ? edge.targetEnergy : beatEnergy(targetBeat);
      const sourceEnergy = edge.sourceEnergy !== null ? edge.sourceEnergy : srcEnergy;
      if (targetEnergy < -50) return;
      if (sourceEnergy > 0 && targetEnergy < sourceEnergy * 0.6) return;
      const barIdx = typeof targetBeat.bar_index === "number" ? targetBeat.bar_index : -1;
      const barVisits = barIdx >= 0 ? (visitedBars[barIdx] || 0) : 0;
      const visitPenalty = Math.min(0.45, barVisits * 0.08);
      const coverageBonus = Math.max(0, 0.18 - Math.min(3, barVisits) * 0.05);
      const baseScore = edge.score !== null ? edge.score : clamp01((edge.similarity + 1) / 2);
      const chromaBonus = Math.max(0, edge.chroma) * 0.15;
      const sectionBonus = edge.sameSection ? 0.164 : 0.192;
      const directionBias = direction === "forward" ? 0.05 : -0.05;
      const energyBonus = sourceEnergy ? Math.min(0.12, Math.max(-0.2, ((targetEnergy / sourceEnergy) - 0.8) * 0.3)) : 0;
      let score = baseScore + chromaBonus + sectionBonus + directionBias + energyBonus - visitPenalty + coverageBonus - phasePenalty - backwardPenalty;
      const edgeKey = `${src}:${edge.target}`;
      if (edgeUsage[edgeKey]) score -= Math.min(0.45, Math.log(1 + edgeUsage[edgeKey]) * 0.18);
      scored.push({ source: item.source, target: edge.target, edge, score, direction });
    });
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const dynamicMin = beatsSinceJump > opts.minDwellBeats * 2 ? opts.minScore - 0.05 : opts.minScore;
    const pool = scored.filter((x) => x.score >= dynamicMin).slice(0, 6);
    if (!pool.length) return null;
    const maxScore = pool[0].score;
    let total = 0;
    const weights = pool.map((x) => {
      const w = Math.exp((x.score - maxScore) / opts.jumpTemperature);
      total += w;
      return w;
    });
    let pick = rand() * total;
    for (let i = 0; i < pool.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return pool[i];
    }
    return pool[0];
  }

  const maxSeconds = minutes * 60;
  while (elapsed < maxSeconds && n > 0) {
    const beat = track.beats[idx] || {};
    visited.push(idx);
    elapsed += typeof beat.duration === "number" && beat.duration > 0 ? beat.duration : 0.5;
    beatsSinceJump++;
    beatsUntilJump--;
    let jumped = false;
    if (beatsSinceJump >= opts.minDwellBeats && beatsUntilJump <= 0) {
      const jump = select(idx);
      if (jump) {
        jumps.push({ source: idx, target: jump.target, score: jump.score, direction: jump.direction });
        loopHistory.push({ source: idx, target: jump.target });
        if (loopHistory.length > 8) loopHistory.shift();
        edgeUsage[`${idx}:${jump.target}`] = (edgeUsage[`${idx}:${jump.target}`] || 0) + 1;
        idx = jump.target;
        const targetBeat = track.beats[idx] || {};
        if (typeof targetBeat.bar_index === "number") visitedBars[targetBeat.bar_index] = (visitedBars[targetBeat.bar_index] || 0) + 1;
        beatsSinceJump = 0;
        beatsUntilJump = randomInt(rand, opts.minLoopBeats, Math.max(opts.minLoopBeats + 2, opts.maxSequentialBeats));
        jumped = true;
      } else {
        beatsUntilJump = randomInt(rand, opts.minLoopBeats, Math.max(opts.minLoopBeats + 2, opts.maxSequentialBeats));
      }
    }
    if (!jumped) idx = (idx + 1) % n;
  }
  return summarize(track, visited, jumps, seed, "current");
}

function summarize(track, visited, jumps, seed, policy) {
  const n = track.beats.length || 1;
  const grid = inferMeterGrid(track.beats);
  const unique = new Set(visited);
  const sections = new Set(visited.map((i) => sectionOf(track.beats[i])));
  const windows = {};
  visited.forEach((i) => {
    const key = Math.floor(i / 16);
    windows[key] = (windows[key] || 0) + 1;
  });
  const topWindowCount = Math.max(0, ...Object.values(windows));
  const repeatedEdges = {};
  jumps.forEach((j) => {
    const key = `${j.source}:${j.target}`;
    repeatedEdges[key] = (repeatedEdges[key] || 0) + 1;
  });
  const phaseAligned = jumps.filter((j) => phasesCompatible(track.beats, grid, j.source, j.target, j.intent || "continue")).length;
  const primarySource = jumps.filter((j) => isPrimaryPhase(track.beats, grid, j.source)).length;
  const energyDeltas = jumps.map((j) => typeof j.energyDelta === "number" ? j.energyDelta : 0);
  const avgEnergyDelta = energyDeltas.length ? energyDeltas.reduce((s, v) => s + v, 0) / energyDeltas.length : 0;
  const totalSeconds = visited.reduce((sum, idx) => {
    const beat = track.beats[idx] || {};
    return sum + (typeof beat.duration === "number" && beat.duration > 0 ? beat.duration : 0.5);
  }, 0);
  return {
    policy,
    seed,
    beats: visited.length,
    jumps: jumps.length,
    uniqueBeats: unique.size,
    coverage: unique.size / n,
    sections: sections.has(-1) ? sections.size - 1 : sections.size,
    topWindowShare: visited.length ? topWindowCount / visited.length : 0,
    repeatedEdgeMax: Math.max(0, ...Object.values(repeatedEdges)),
    jumpsPerMinute: totalSeconds > 0 ? jumps.length / (totalSeconds / 60) : 0,
    avgBeatsBetweenJumps: jumps.length ? visited.length / jumps.length : visited.length,
    phaseAlignedShare: jumps.length ? phaseAligned / jumps.length : 1,
    primarySourceShare: jumps.length ? primarySource / jumps.length : 1,
    avgEnergyDelta,
    meterLength: grid.length,
    meterConfidence: grid.confidence,
    firstJumps: jumps.slice(0, 12),
  };
}

function main() {
  const profilePath = arg("profile", null);
  if (!profilePath) usage();
  const minutes = Number(arg("minutes", "3"));
  const seeds = Number(arg("seeds", "20"));
  const policy = arg("policy", "current");
  const summaryOnly = process.argv.includes("--summary-only");
  const track = loadTrack(profilePath);
  const runs = [];
  for (let i = 1; i <= seeds; i++) {
    if (policy === "current") {
      runs.push(runCurrent(track, i, minutes));
    } else if (policy === "explore") {
      runs.push(runExplore(track, i, minutes));
    } else {
      throw new Error(`Unknown policy: ${policy}`);
    }
  }
  const avg = (field) => runs.reduce((sum, run) => sum + run[field], 0) / runs.length;
  const worst = (field, cmp) => runs.slice().sort((a, b) => cmp(a[field], b[field]))[0];
  const summary = {
    track: track.title,
    profile: profilePath,
    policy,
    minutes,
    seeds,
    avgCoverage: avg("coverage"),
    avgUniqueBeats: avg("uniqueBeats"),
    avgSections: avg("sections"),
    avgTopWindowShare: avg("topWindowShare"),
    avgRepeatedEdgeMax: avg("repeatedEdgeMax"),
    avgJumpsPerMinute: avg("jumpsPerMinute"),
    avgBeatsBetweenJumps: avg("avgBeatsBetweenJumps"),
    avgPhaseAlignedShare: avg("phaseAlignedShare"),
    avgPrimarySourceShare: avg("primarySourceShare"),
    avgEnergyDelta: avg("avgEnergyDelta"),
    meterLength: runs[0] && runs[0].meterLength,
    meterConfidence: runs[0] && runs[0].meterConfidence,
    worstCoverage: worst("coverage", (a, b) => a - b),
    worstTopWindow: worst("topWindowShare", (a, b) => b - a),
  };
  console.log(JSON.stringify(summaryOnly ? { summary } : { summary, runs }, null, 2));
}

main();

function runExplore(track, seed, minutes) {
  const rand = mulberry32(seed);
  const n = track.beats.length;
  const opts = {
    minLoopBeats: 16,
    maxSequentialBeats: 128,
    loopThreshold: 0.50,
    maxEdgesPerBeat: 48,
    minDwellBeats: 16,
    jumpTemperature: 0.22,
  };
  const meterGrid = inferMeterGrid(track.beats);
  opts.minDwellBeats = Math.max(opts.minLoopBeats, Math.min(48, Math.max(12, meterGrid.length * 4)));
  const graph = normalizeGraph(track, opts);
  const allEdges = [];
  Object.keys(graph).forEach((key) => {
    graph[key].forEach((edge) => allEdges.push({ source: Number(key), edge, distance: 0 }));
  });

  let idx = 0;
  let elapsed = 0;
  let beatsSinceJump = opts.minDwellBeats;
  let linearRun = 0;
  const recentTargets = [];
  const recentWindows = [];
  const loopHistory = [];
  const edgeUsage = {};
  const usedJumpEdges = {};
  const regionVisits = {};
  const sectionVisits = {};
  const visited = [];
  const jumps = [];

  function windowKey(i) {
    return Math.floor(i / 16);
  }

  function remember(target) {
    const win = windowKey(target);
    regionVisits[win] = (regionVisits[win] || 0) + 1;
    const sec = sectionOf(track.beats[target]);
    if (sec >= 0) sectionVisits[sec] = (sectionVisits[sec] || 0) + 1;
    recentTargets.push(target);
    if (recentTargets.length > 40) recentTargets.shift();
    recentWindows.push(win);
    if (recentWindows.length > 64) recentWindows.shift();
  }

  function localStuckScore() {
    if (recentWindows.length < 24) return 0;
    const counts = {};
    recentWindows.forEach((w) => { counts[w] = (counts[w] || 0) + 1; });
    return Math.max(...Object.values(counts)) / recentWindows.length;
  }

  function jumpChance(intent) {
    if (beatsSinceJump < opts.minDwellBeats) return 0;
    intent = intent || chooseIntent();
    if (!isSafeExit(track.beats, meterGrid, idx, intent)) return 0;
    const age = Math.min(1, (beatsSinceJump - opts.minDwellBeats) / Math.max(1, opts.maxSequentialBeats - opts.minDwellBeats));
    const stuck = localStuckScore();
    let chance = 0.012 + age * 0.11 + Math.max(0, stuck - 0.44) * 0.46;
    if (linearRun > opts.maxSequentialBeats) chance = Math.max(chance, 0.34);
    if (!isPrimaryPhase(track.beats, meterGrid, idx)) chance *= 0.35;
    return Math.min(0.38, chance);
  }

  function chooseIntent() {
    const stuck = localStuckScore();
    if (stuck > 0.48 || linearRun > opts.maxSequentialBeats * 1.15) return "escape";
    const r = rand();
    if (r < 0.04) return "surprise";
    if (r < 0.34) return "explore";
    return "continue";
  }

  function collect(src, intent) {
    const radii = [0];
    for (const radius of radii) {
      const out = [];
      for (let offset = 0; offset <= radius; offset++) {
        [src + offset, src - offset].forEach((probe, pos) => {
          if (offset === 0 && pos === 1) return;
          if (probe >= 0 && probe < n && graph[probe]) {
            graph[probe].forEach((edge) => out.push({ source: probe, edge, distance: offset }));
          }
        });
      }
      if (out.length) return out;
    }
    return [];
  }

  function transitionScore(src, item) {
    const edge = item.edge;
    const srcBeat = track.beats[src];
    const targetBeat = track.beats[edge.target];
    const srcEnergy = edge.sourceEnergy !== null ? edge.sourceEnergy : beatEnergy(srcBeat);
    const targetEnergy = edge.targetEnergy !== null ? edge.targetEnergy : beatEnergy(targetBeat);
    if (targetEnergy < -52) return null;
    const phaseMatch = phasesCompatible(track.beats, meterGrid, src, edge.target, item.intent || "continue");
    if (!phaseMatch) return null;
    const energyDelta = Math.abs((targetEnergy || 0) - (srcEnergy || 0));
    const maxEnergyDelta = item.intent === "escape" ? 18 : item.intent === "surprise" ? 16 : item.intent === "explore" ? 14 : 12;
    if (energyDelta > maxEnergyDelta) return null;
    let score = 0;
    score += edge.similarity * 0.42;
    score += Math.max(0, edge.chroma) * 0.22;
    score += isPrimaryPhase(track.beats, meterGrid, src) && isPrimaryPhase(track.beats, meterGrid, edge.target) ? 0.16 : 0.06;
    score += edge.sameSection ? 0.06 : 0.02;
    score -= Math.min(0.34, energyDelta / 42);
    if (targetEnergy < srcEnergy * 0.45 && srcEnergy > 0) score -= 0.18;
    return score;
  }

  function select(src, intent) {
    if (!isSafeExit(track.beats, meterGrid, src, intent)) return null;
    let candidates = collect(src, intent);
    if (!candidates.length) return null;

    const recentRadius = intent === "escape" ? 48 : intent === "explore" ? 28 : 16;
    let filtered = candidates.filter((item) => {
      const edgeKey = `${src}:${item.edge.target}`;
      if (usedJumpEdges[edgeKey] || (edgeUsage[edgeKey] || 0) > 0) return false;
      if (loopHistory.slice(-8).some((h) => h.target === item.edge.target || (h.source === item.edge.target && h.target === src))) return false;
      if (recentTargets.some((t) => circularDistance(t, item.edge.target, n) <= recentRadius)) return false;
      return true;
    });
    if (filtered.length < 6) {
      filtered = candidates.filter((item) => {
        const edgeKey = `${src}:${item.edge.target}`;
        return !usedJumpEdges[edgeKey] && !loopHistory.slice(-4).some((h) => h.target === item.edge.target);
      });
    }
    if (!filtered.length) {
      filtered = candidates.filter((item) => !usedJumpEdges[`${src}:${item.edge.target}`]);
    }
    if (!filtered.length) return null;

    const currentWin = windowKey(src);
    const currentSection = sectionOf(track.beats[src]);
    const scored = [];
    filtered.forEach((item) => {
      const edge = item.edge;
      const tq = transitionScore(src, { ...item, intent });
      if (tq === null) return;
      const sourceEnergy = edge.sourceEnergy !== null ? edge.sourceEnergy : beatEnergy(track.beats[src]);
      const targetEnergy = edge.targetEnergy !== null ? edge.targetEnergy : beatEnergy(track.beats[edge.target]);
      const energyDelta = Math.abs((targetEnergy || 0) - (sourceEnergy || 0));
      const targetWin = windowKey(edge.target);
      const targetSection = sectionOf(track.beats[edge.target]);
      const regionPenalty = Math.min(0.55, (regionVisits[targetWin] || 0) * 0.055);
      const sectionPenalty = targetSection >= 0 ? Math.min(0.25, (sectionVisits[targetSection] || 0) * 0.035) : 0;
      const distance = circularDistance(src, edge.target, n);
      const distanceNorm = Math.min(1, distance / Math.max(1, n * 0.35));
      const sourceDriftPenalty = Math.min(0.18, item.distance * 0.012);
      const repeatPenalty = Math.min(0.55, (edgeUsage[`${src}:${edge.target}`] || 0) * 0.24);
      let novelty = 0;
      if (intent === "escape") {
        novelty += targetWin !== currentWin ? 0.24 : -0.18;
        novelty += targetSection !== currentSection ? 0.10 : -0.04;
        novelty += distanceNorm * 0.18;
      } else if (intent === "explore") {
        novelty += targetWin !== currentWin ? 0.14 : -0.10;
        novelty += targetSection !== currentSection ? 0.06 : 0.02;
        novelty += distanceNorm * 0.10;
      } else if (intent === "surprise") {
        novelty += targetWin !== currentWin ? 0.12 : -0.08;
        novelty += distanceNorm * 0.16;
      } else {
        novelty += edge.sameSection ? 0.10 : -0.04;
        novelty += distanceNorm * 0.03;
      }
      const jitter = (rand() - 0.5) * (intent === "continue" ? 0.04 : 0.10);
      const minTransition = intent === "surprise" ? 0.44 : intent === "escape" ? 0.40 : 0.46;
      if (tq < minTransition) return;
      const score = tq * 1.25 + novelty - regionPenalty - sectionPenalty - sourceDriftPenalty - repeatPenalty + jitter;
      scored.push({ source: item.source, target: edge.target, edge, score, direction: edge.direction, tq, energyDelta });
    });
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const poolSize = intent === "continue" ? 8 : intent === "explore" ? 14 : 18;
    const floor = scored[0].score - (intent === "continue" ? 0.12 : intent === "explore" ? 0.22 : 0.30);
    const pool = scored.filter((x) => x.score >= floor).slice(0, poolSize);
    const temp = intent === "continue" ? 0.12 : intent === "explore" ? 0.22 : 0.34;
    const maxScore = pool[0].score;
    let total = 0;
    const weights = pool.map((x) => {
      const w = Math.exp((x.score - maxScore) / temp);
      total += w;
      return w;
    });
    let pick = rand() * total;
    for (let i = 0; i < pool.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return { ...pool[i], intent };
    }
    return { ...pool[0], intent };
  }

  const maxSeconds = minutes * 60;
  while (elapsed < maxSeconds && n > 0) {
    const beat = track.beats[idx] || {};
    visited.push(idx);
    remember(idx);
    elapsed += typeof beat.duration === "number" && beat.duration > 0 ? beat.duration : 0.5;
    beatsSinceJump++;
    linearRun++;
    let jumped = false;
    const intent = chooseIntent();
    if (rand() < jumpChance(intent)) {
      const jump = select(idx, intent);
      if (jump) {
        jumps.push({ source: idx, target: jump.target, score: jump.score, transition: jump.tq, direction: jump.direction, intent: jump.intent, energyDelta: jump.energyDelta });
        loopHistory.push({ source: idx, target: jump.target });
        if (loopHistory.length > 16) loopHistory.shift();
        usedJumpEdges[`${idx}:${jump.target}`] = true;
        edgeUsage[`${idx}:${jump.target}`] = (edgeUsage[`${idx}:${jump.target}`] || 0) + 1;
        idx = jump.target;
        beatsSinceJump = 0;
        linearRun = 0;
        jumped = true;
      }
    }
    if (!jumped) idx = (idx + 1) % n;
  }
  return summarize(track, visited, jumps, seed, "explore");
}
