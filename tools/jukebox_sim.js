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
    minLoopBeats: 8,
    maxSequentialBeats: 64,
    loopThreshold: 0.50,
    maxEdgesPerBeat: 48,
    minDwellBeats: 4,
    jumpTemperature: 0.36,
  };
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

  function jumpChance() {
    if (beatsSinceJump < opts.minDwellBeats) return 0;
    const age = Math.min(1, (beatsSinceJump - opts.minDwellBeats) / Math.max(1, opts.maxSequentialBeats - opts.minDwellBeats));
    const stuck = localStuckScore();
    let chance = 0.035 + age * 0.24 + Math.max(0, stuck - 0.38) * 0.65;
    if (linearRun > opts.maxSequentialBeats) chance = Math.max(chance, 0.55);
    return Math.min(0.72, chance);
  }

  function chooseIntent() {
    const stuck = localStuckScore();
    if (stuck > 0.48 || linearRun > opts.maxSequentialBeats * 1.15) return "escape";
    const r = rand();
    if (r < 0.12) return "surprise";
    if (r < 0.64) return "explore";
    return "continue";
  }

  function collect(src, intent) {
    const radii = intent === "escape" ? [12, 40, 96] : intent === "surprise" ? [10, 32, 64] : [10, 28, 48];
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
    return intent === "escape" || intent === "surprise" ? allEdges.slice(0) : [];
  }

  function transitionScore(src, item) {
    const edge = item.edge;
    const srcBeat = track.beats[src];
    const targetBeat = track.beats[edge.target];
    const srcEnergy = edge.sourceEnergy !== null ? edge.sourceEnergy : beatEnergy(srcBeat);
    const targetEnergy = edge.targetEnergy !== null ? edge.targetEnergy : beatEnergy(targetBeat);
    if (targetEnergy < -52) return null;
    const phaseMatch = beatPhase(srcBeat) === (edge.beatInBar !== null ? edge.beatInBar : beatPhase(targetBeat));
    const energyDelta = Math.abs((targetEnergy || 0) - (srcEnergy || 0));
    let score = 0;
    score += edge.similarity * 0.42;
    score += Math.max(0, edge.chroma) * 0.20;
    score += phaseMatch ? 0.12 : -0.08;
    score += edge.sameSection ? 0.04 : 0.02;
    score -= Math.min(0.25, energyDelta / 55);
    if (targetEnergy < srcEnergy * 0.45 && srcEnergy > 0) score -= 0.18;
    return score;
  }

  function select(src, intent) {
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
      const tq = transitionScore(src, item);
      if (tq === null) return;
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
        novelty += targetWin !== currentWin ? 0.38 : -0.22;
        novelty += targetSection !== currentSection ? 0.18 : -0.04;
        novelty += distanceNorm * 0.28;
      } else if (intent === "explore") {
        novelty += targetWin !== currentWin ? 0.26 : -0.12;
        novelty += targetSection !== currentSection ? 0.12 : 0.02;
        novelty += distanceNorm * 0.18;
      } else if (intent === "surprise") {
        novelty += targetWin !== currentWin ? 0.20 : -0.06;
        novelty += distanceNorm * 0.34;
      } else {
        novelty += edge.sameSection ? 0.08 : 0;
        novelty += distanceNorm * 0.06;
      }
      const jitter = (rand() - 0.5) * (intent === "continue" ? 0.08 : 0.18);
      const minTransition = intent === "surprise" ? 0.34 : intent === "escape" ? 0.32 : 0.38;
      if (tq < minTransition) return;
      const score = tq + novelty - regionPenalty - sectionPenalty - sourceDriftPenalty - repeatPenalty + jitter;
      scored.push({ source: item.source, target: edge.target, edge, score, direction: edge.direction, tq });
    });
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const poolSize = intent === "continue" ? 10 : intent === "explore" ? 24 : 36;
    const floor = scored[0].score - (intent === "continue" ? 0.18 : intent === "explore" ? 0.34 : 0.48);
    const pool = scored.filter((x) => x.score >= floor).slice(0, poolSize);
    const temp = intent === "continue" ? 0.16 : intent === "explore" ? 0.34 : 0.52;
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
    if (rand() < jumpChance()) {
      const intent = chooseIntent();
      const jump = select(idx, intent);
      if (jump) {
        jumps.push({ source: idx, target: jump.target, score: jump.score, transition: jump.tq, direction: jump.direction, intent: jump.intent });
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
