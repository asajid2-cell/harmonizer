'use strict';
// Dynamic Source Engine — the runtime CDN discovery registry.
// Tandem-designed (Claude spine + Codex hardening). Core rule: the resolver consumes ONLY promoted
// sources from this registry; discovery + expensive validation happen in the BACKGROUND. The proxy
// byte-check is the SOLE promotion authority. Static pools are seeds, not the source of truth.
const fs = require('fs');
const path = require('path');
const { safeFetch, safeJson } = require('./ssrf');

// ---- state ----
const STATES = ['discovered', 'cheap_alive', 'validated', 'promoted', 'probation', 'degraded', 'cooldown', 'tombstoned'];
let DATA_DIR = '/app/data';
let registry = new Map();           // key -> record
let deps = { resolveWithPlaywright: null, proxyBase: 'http://127.0.0.1:4190', basePath: '/mediamtx', feeds: null, isBusy: null };
let saveTimer = null, started = false;

function regPath() { return path.join(DATA_DIR, 'registry.json'); }
function keyOf(r) { return r.modality + '|' + r.category + '|' + r.template; }
function now() { return Date.now(); }

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(regPath(), 'utf8'));
    registry = new Map((raw.sources || []).map(r => [keyOf(r), r]));
    console.log('[discovery] loaded ' + registry.size + ' sources from registry');
  } catch (e) { registry = new Map(); }
}
function save() {
  clearTimeout(saveTimer); saveTimer = null;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(regPath(), JSON.stringify({ savedAt: now(), sources: [...registry.values()] }));
  } catch (e) { console.log('[discovery] save failed: ' + e.message); }
}
function saveSoon() { if (!saveTimer) saveTimer = setTimeout(save, 4000); }

// ---- scoring / lifecycle ----
function baseScore(r) {
  let s = r.seedRank != null ? (1000 - r.seedRank * 10) : 200;   // seeds keep their hand-curated order
  s += Math.min(r.okCount || 0, 50) * 6;                          // proven success
  s -= Math.min(r.failStreak || 0, 20) * 25;                      // recent failures hurt
  if (r.latency) s -= Math.min(r.latency / 1000, 20);             // prefer fast
  if (r.distinctCdn) s += 40;                                     // reward a CDN not already covered
  if (r.state === 'probation') s -= 120;                          // unproven, try after promoted
  return s;
}
function buildUrl(template, id, s, e) {
  return String(template).replace(/\$\{id\}/g, id).replace(/\$\{s\}/g, s == null ? '' : s).replace(/\$\{e\}/g, e == null ? '' : e);
}

// Seed the registry from a static pool (idempotent — never clobbers learned state).
function seed(modality, category, sources) {
  sources.forEach((src, i) => {
    const rec = { modality, category, template: src.template, tor: !!src.tor, family: src.family || hostOf(src.template),
      idShape: src.idShape || (category === 'tv' || category === 'anime' ? category : 'tmdb'), sourceShape: 'embed',
      state: 'promoted', score: 0, okCount: 0, failStreak: 0, latency: 0, cdnHost: src.cdnHost || null,
      referer: null, seedRank: i, evidence: 'seed', lastOkAt: 0, lastCheckedAt: 0, nextProbeAt: 0 };
    const k = keyOf(rec);
    if (!registry.has(k)) { rec.score = baseScore(rec); registry.set(k, rec); }
  });
  saveSoon();
}
function hostOf(t) { try { return new URL(buildUrl(t, '0')).hostname; } catch (e) { return t; } }

// The resolver asks for a ranked, live list for a category → [{template, tor, key}], best-first.
function rankedFor(modality, category, limit) {
  const live = [...registry.values()].filter(r => r.modality === modality && r.category === category &&
    (r.state === 'promoted' || r.state === 'probation'));
  live.forEach(r => { r.score = baseScore(r); });
  live.sort((a, b) => b.score - a.score);
  return live.slice(0, limit || 24);
}

// Passive learning: the resolver reports each resolve outcome back so the registry self-tunes from
// real traffic (the highest-ROI freshness feed — Codex's point). winnerKey = the source that resolved.
function recordOutcome(modality, category, winnerKey, info) {
  info = info || {};
  const r = winnerKey && registry.get(winnerKey);
  if (r) {
    r.okCount = (r.okCount || 0) + 1; r.failStreak = 0; r.lastOkAt = now(); r.lastCheckedAt = now();
    if (info.latency) r.latency = r.latency ? Math.round(r.latency * 0.7 + info.latency * 0.3) : info.latency;
    if (info.cdnHost) r.cdnHost = info.cdnHost;
    if (info.referer) r.referer = info.referer;
    if (r.state === 'probation' && r.okCount >= 2) { r.state = 'promoted'; console.log('[discovery] promoted ' + r.template); }
    r.score = baseScore(r);
  }
  saveSoon();
}
function recordFailure(key) {
  const r = registry.get(key); if (!r) return;
  r.failStreak = (r.failStreak || 0) + 1; r.lastCheckedAt = now();
  if (r.failStreak >= 6) { r.state = 'tombstoned'; r.nextProbeAt = now() + 24 * 3600e3; }
  else if (r.failStreak >= 3 && r.state === 'promoted') r.state = 'degraded';
  r.score = baseScore(r); saveSoon();
}

// ---- validator: the SOLE promotion authority (real bytes through the proxy) ----
function proxyUrl(target, referer) {
  // on-box the app serves /api/proxy directly (nginx adds the /mediamtx public prefix) — NO basePath here
  return deps.proxyBase + '/api/proxy?' + (referer ? 'referer=' + encodeURIComponent(referer) + '&' : '') + 'url=' + encodeURIComponent(target);
}
function apiBase() { return deps.proxyBase + '/api'; }
// JSON fetch to OUR OWN app (loopback allowed; external URLs still locked down by the proxy itself).
function lj(u, t) { return safeJson(u, { timeoutMs: t || 14000, allowLoopback: true }); }
function looksLikeDecoy(body, ct, len) {
  const b = (body || '').slice(0, 400).toLowerCase();
  if (/not found|error|<!doctype html|<html|captcha|just a moment|parked|buy this domain/.test(b)) return true;
  if (/mpegurl/.test(ct || '') && !/#extm3u/i.test(body || '')) return true;     // HLS without the magic
  return false;
}
// Validate a captured media URL through the proxy. type: 'video'|'image'|'epub'|'audio'.
async function validateMedia(target, referer, type) {
  try {
    const headers = type === 'audio' ? { Range: 'bytes=0-99999' } : {};
    const r = await safeFetch(proxyUrl(target, referer), { headers, timeoutMs: 15000, maxBytes: 3 * 1024 * 1024, allowLoopback: true });
    const ct = (r.headers['content-type'] || '').toLowerCase();
    const len = (r.body || '').length;
    if (r.status >= 400) return { ok: false, why: 'status ' + r.status };
    if (type === 'video') {
      if (!/mpegurl|mp4|octet-stream|video/.test(ct)) return { ok: false, why: 'ct ' + ct };
      if (looksLikeDecoy(r.body, ct, len)) return { ok: false, why: 'decoy body' };
      if (/mpegurl/.test(ct) && !/#extm3u/i.test(r.body)) return { ok: false, why: 'no #EXTM3U' };
      return { ok: true, cdnHost: hostOf(target), ct };
    }
    if (type === 'image') return { ok: /image\//.test(ct) && len > 500 && !looksLikeDecoy(r.body, ct, len), cdnHost: hostOf(target), ct, why: 'ct ' + ct };
    if (type === 'epub') return { ok: /epub|octet-stream|zip/.test(ct) && len > 20000, cdnHost: hostOf(target), ct, why: 'ct ' + ct };
    if (type === 'audio') return { ok: (r.status === 206 || r.status === 200) && /audio\//.test(ct), cdnHost: hostOf(target), ct, why: ct };
    return { ok: false, why: 'unknown type' };
  } catch (e) { return { ok: false, why: e.message }; }
}

// Validate a VIDEO candidate end-to-end: Playwright-capture the embed → proxy-validate the stream.
async function validateVideoCandidate(rec, canaryId) {
  if (!deps.resolveWithPlaywright) return { ok: false, why: 'no playwright dep' };
  const url = buildUrl(rec.template, canaryId, '1', '1');
  const t0 = now();
  let cap; try { cap = await deps.resolveWithPlaywright(url, 20000, rec.tor); } catch (e) { return { ok: false, why: 'capture ' + e.message }; }
  const streams = (cap && cap.streams) || [];
  if (!streams.length) return { ok: false, why: 'no stream captured' };
  for (const s of streams) {
    const v = await validateMedia(s.url || s.streamUrl, s.referer || s.requestHeaders && s.requestHeaders.referer, 'video');
    if (v.ok) return { ok: true, cdnHost: v.cdnHost, referer: s.referer || null, latency: now() - t0 };
  }
  return { ok: false, why: 'all captured streams failed proxy gate' };
}

// ---- READING/AUDIO health lane ----
// Reading/audio sources are CODE adapters (can't be auto-written), so the engine HEALTH-CHECKS them
// via the app's own on-box endpoints + the proxy gate (cheap HTTP, no Playwright) and demotes the
// dead ones. This is where libgen/comick/gdstudio/librivox/etc. mirror-rotation health lives.
const RA_PROBES = [
  { modality: 'reading', category: 'book', source: 'libgen', q: 'dune', vtype: 'epub' },
  { modality: 'reading', category: 'book', source: 'annas', q: 'project hail mary', vtype: 'epub' },
  { modality: 'reading', category: 'book', source: 'standardebooks', q: 'frankenstein', vtype: 'epub' },
  { modality: 'reading', category: 'book', source: 'openlibrary', q: 'pride and prejudice', vtype: 'epub' },
  { modality: 'reading', category: 'manga', source: 'comick', q: 'one piece', vtype: 'image' },
  { modality: 'reading', category: 'manga', source: 'mangadex', q: 'naruto', vtype: 'image' },
  { modality: 'reading', category: 'manga', source: 'weebcentral', q: 'berserk', vtype: 'image' },
  { modality: 'audio', category: 'music', source: 'gdstudio', q: 'hotel california', vtype: 'audio' },
  { modality: 'audio', category: 'music', source: 'soundcloud', q: 'lofi beats', vtype: 'audio' },
  { modality: 'audio', category: 'music', source: 'jamendo', q: 'acoustic guitar', vtype: 'audio' },
  { modality: 'audio', category: 'music', source: 'audius', q: 'lofi', vtype: 'audio' },
  { modality: 'audio', category: 'audiobook', source: 'librivox', q: 'pride and prejudice', vtype: 'audio' },
  { modality: 'audio', category: 'audiobook', source: 'archive', q: 'sherlock holmes', vtype: 'audio' },
  { modality: 'audio', category: 'podcast', source: 'itunes', q: 'the daily', vtype: 'audio' },
];
const RA_SEARCH = { book: 'book', manga: 'manga', music: 'music', audiobook: 'audiobook', podcast: 'podcast' };
function seedReadingAudio() {
  RA_PROBES.forEach((p, i) => {
    const rec = { modality: p.modality, category: p.category, template: p.source, tor: false, family: p.source,
      idShape: 'name', sourceShape: 'adapter', state: 'promoted', score: 0, okCount: 0, failStreak: 0, latency: 0,
      cdnHost: null, referer: null, seedRank: i, evidence: 'seed', lastOkAt: 0, lastCheckedAt: 0, nextProbeAt: 0, vtype: p.vtype };
    const k = keyOf(rec);
    if (!registry.has(k)) { rec.score = baseScore(rec); registry.set(k, rec); }
  });
  saveSoon();
}
// Run a source's real chain through the app's on-box API, then proxy-validate the media.
async function healthCheckRA(p) {
  const api = apiBase();
  const sUrl = api + '/' + RA_SEARCH[p.category] + '/search?' + (p.category === 'podcast' ? '' : 'source=' + p.source + '&') + 'q=' + encodeURIComponent(p.q);
  const sr = await lj(sUrl);
  const item = (sr.results || [])[0];
  if (!item) throw new Error('no search results');
  let mediaUrl = null, referer = '';
  if (p.category === 'book') {
    const f = await lj(api + '/book/file?source=' + p.source + '&id=' + encodeURIComponent(item.id));
    mediaUrl = f.url; referer = f.referer || '';
  } else if (p.category === 'manga') {
    const ch = await lj(api + '/manga/chapters?source=' + p.source + '&id=' + encodeURIComponent(item.id));
    const c0 = (ch.chapters || [])[0]; if (!c0) throw new Error('no chapters');
    const pg = await lj(api + '/manga/pages?source=' + p.source + '&id=' + encodeURIComponent(c0.id), 16000);
    mediaUrl = (pg.pages || [])[0]; referer = pg.referer || '';
  } else if (p.category === 'music') {
    const s = await lj(api + '/music/stream?source=' + p.source + '&id=' + encodeURIComponent(item.id), 16000);
    mediaUrl = s.url;
  } else if (p.category === 'audiobook') {
    const ch = await lj(api + '/audiobook/chapters?source=' + p.source + '&id=' + encodeURIComponent(item.id));
    mediaUrl = ((ch.chapters || [])[0] || {}).url;
  } else if (p.category === 'podcast') {
    const ep = await lj(api + '/podcast/episodes?id=' + encodeURIComponent(item.id));
    mediaUrl = ((ep.chapters || [])[0] || {}).url;
  }
  if (!mediaUrl) throw new Error('no media url');
  return validateMedia(mediaUrl, referer, p.vtype);
}
async function sweepReadingAudio() {
  for (const p of RA_PROBES) {
    const k = p.modality + '|' + p.category + '|' + p.source;
    const rec = registry.get(k); if (!rec) continue;
    try {
      const v = await healthCheckRA(p);
      rec.lastCheckedAt = now();
      if (v.ok) { rec.okCount = (rec.okCount || 0) + 1; rec.failStreak = 0; rec.lastOkAt = now(); rec.cdnHost = v.cdnHost || rec.cdnHost;
        if (rec.state !== 'promoted') { rec.state = 'promoted'; console.log('[discovery] RA recovered ' + k); } }
      else { recordFailure(k); }
    } catch (e) { rec.lastCheckedAt = now(); recordFailure(k); }
  }
  saveSoon();
}

// Is a source alive enough to serve? (false only for tombstoned — confirmed dead, saves the 20s timeout)
function isAlive(modality, category, key) {
  const r = registry.get(modality + '|' + category + '|' + key);
  return !r || r.state !== 'tombstoned';
}

// ---- candidate intake (from Codex's discovery_feeds) ----
function ingestCandidates(cands) {
  let added = 0;
  for (const c of cands || []) {
    if (!c || !c.template || !c.category) continue;
    const rec = { modality: c.modality || 'video', category: c.category, template: c.template, tor: false,
      family: c.family || hostOf(c.template), idShape: c.idShape || 'tmdb', sourceShape: c.sourceShape || 'embed',
      state: 'discovered', score: 0, okCount: 0, failStreak: 0, latency: 0, cdnHost: null, referer: null,
      seedRank: null, evidence: c.evidence || 'feed', lastOkAt: 0, lastCheckedAt: 0, nextProbeAt: 0 };
    const k = keyOf(rec);
    if (!registry.has(k)) { rec.score = baseScore(rec); registry.set(k, rec); added++; }
  }
  if (added) { console.log('[discovery] ingested ' + added + ' new candidates'); saveSoon(); }
  return added;
}

// ---- background scheduler (token-bucketed; never blocks user requests) ----
let heavyTokens = 4, lastRefill = now();
const HEAVY_MAX = 4, REFILL_MS = 60000, REFILL_N = 1;     // ~1 Playwright probe/min, burst 4
function refill() { const n = Math.floor((now() - lastRefill) / REFILL_MS) * REFILL_N; if (n > 0) { heavyTokens = Math.min(HEAVY_MAX, heavyTokens + n); lastRefill = now(); } }
const CANARY = { movie: '603', tv: '1399', anime: '21' };  // Matrix / GoT / One Piece — well-seeded

async function sweepOnce() {
  try {
    // 1) refresh candidate feeds (cheap, all SSRF-guarded) — GitHub harvest + CT enumeration +
    //    live-JS crawl of working providers (catches in-frontend domain rotation before GitHub).
    if (deps.feeds) {
      if (deps.feeds.githubHarvest) { try { ingestCandidates(await deps.feeds.githubHarvest()); } catch (e) {} }
      if (deps.feeds.ctEnumerate) { try { ingestCandidates(await deps.feeds.ctEnumerate()); } catch (e) {} }
      if (deps.feeds.liveJsCrawl) {
        try {
          const promotedDomains = [...new Set([...registry.values()].filter(r => r.state === 'promoted').map(r => r.family))].filter(Boolean);
          ingestCandidates(await deps.feeds.liveJsCrawl(promotedDomains.slice(0, 8)));
        } catch (e) {}
      }
    }
    // 1.5) reading/audio health (cheap HTTP via on-box API + proxy gate — no Playwright, so it's
    //      safe to run even while a user is resolving video).
    try { await sweepReadingAudio(); } catch (e) {}
    // 2) validate a few discovered video candidates (heavy, token-bucketed) — but NEVER while a
    //    user resolve is in flight (the resolver already runs 2 Chromium; don't pile on a 3rd).
    if (deps.isBusy && deps.isBusy()) { save(); return; }
    refill();
    const pending = [...registry.values()].filter(r => r.modality === 'video' && r.state === 'discovered' && (r.nextProbeAt || 0) <= now());
    for (const rec of pending.slice(0, heavyTokens)) {
      if (heavyTokens <= 0) break; heavyTokens--;
      const v = await validateVideoCandidate(rec, CANARY[rec.category] || CANARY.movie);
      rec.lastCheckedAt = now();
      if (v.ok) { rec.state = 'probation'; rec.cdnHost = v.cdnHost; rec.referer = v.referer; rec.latency = v.latency;
        rec.distinctCdn = ![...registry.values()].some(o => o !== rec && o.cdnHost === v.cdnHost && (o.state === 'promoted'));
        rec.okCount = 1; rec.score = baseScore(rec); console.log('[discovery] candidate PROBATION ' + rec.template + ' -> ' + v.cdnHost); }
      else { rec.failStreak = (rec.failStreak || 0) + 1; rec.nextProbeAt = now() + (rec.failStreak >= 3 ? 24 * 3600e3 : 2 * 3600e3);
        if (rec.failStreak >= 3) rec.state = 'tombstoned'; }
    }
    // 3) health-recheck a slice of promoted sources via canary
    const stale = [...registry.values()].filter(r => r.modality === 'video' && r.state === 'promoted' && now() - (r.lastCheckedAt || 0) > 30 * 60e3);
    for (const rec of stale.slice(0, Math.max(0, heavyTokens))) {
      if (heavyTokens <= 0) break; heavyTokens--;
      const v = await validateVideoCandidate(rec, CANARY[rec.category] || CANARY.movie);
      rec.lastCheckedAt = now();
      if (v.ok) { rec.failStreak = 0; rec.lastOkAt = now(); if (v.cdnHost) rec.cdnHost = v.cdnHost; }
      else recordFailure(keyOf(rec));
    }
    save();
  } catch (e) { console.log('[discovery] sweep error: ' + e.message); }
}

function start() {
  if (started) return; started = true;
  // first sweep after warmup, then periodic
  setTimeout(function tick() { sweepOnce().finally(() => setTimeout(tick, 5 * 60e3)); }, 90e3);
}

function getStatus() {
  const by = {};
  for (const r of registry.values()) {
    const c = r.modality + ':' + r.category; by[c] = by[c] || {};
    by[c][r.state] = (by[c][r.state] || 0) + 1;
  }
  const top = [...registry.values()].filter(r => r.state === 'promoted' || r.state === 'probation')
    .sort((a, b) => b.score - a.score).slice(0, 40)
    .map(r => ({ cat: r.modality + ':' + r.category, template: r.template, state: r.state, score: Math.round(r.score), cdn: r.cdnHost, ok: r.okCount, fail: r.failStreak, evidence: r.evidence }));
  return { total: registry.size, byCategory: by, heavyTokens, top };
}

function init(options) {
  options = options || {};
  if (options.dataDir) DATA_DIR = options.dataDir;
  load();                                                  // restore persisted registry BEFORE seeds merge in
  if (options.resolveWithPlaywright) deps.resolveWithPlaywright = options.resolveWithPlaywright;
  if (options.proxyBase) deps.proxyBase = options.proxyBase;
  if (options.basePath != null) deps.basePath = options.basePath;
  if (options.feeds) deps.feeds = options.feeds;
  if (options.isBusy) deps.isBusy = options.isBusy;
}

module.exports = { init, seed, seedReadingAudio, rankedFor, recordOutcome, recordFailure, ingestCandidates,
  validateMedia, validateVideoCandidate, isAlive, buildUrl, keyOf, start, getStatus, _registry: () => registry };
