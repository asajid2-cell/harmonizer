#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const frontend = path.join(repo, 'frontend');
const source = (...parts) => fs.readFileSync(path.join(frontend, ...parts), 'utf8');
const lines = [];
const report = [];
const log = (text) => { lines.push(text); console.log(text); };
const result = (label, fn) => {
  try { fn(); log(`LOAD OK  ${label}`); return null; }
  catch (error) { log(`LOAD ERR ${label}: ${error.stack || error}`); return error; }
};

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function installClock(window) {
  let now = 0, nextId = 1;
  const timers = new Map();
  const schedule = (fn, ms, repeat) => {
    const id = nextId++; timers.set(id, { fn, at: now + Number(ms || 0), ms: Number(ms || 0), repeat }); return id;
  };
  const runDue = () => {
    while (true) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      if (timer.repeat) timer.at += timer.ms; else timers.delete(id);
      timer.fn();
    }
  };
  window.setTimeout = (fn, ms) => schedule(fn, ms, false);
  window.setInterval = (fn, ms) => schedule(fn, ms, true);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.Date.now = () => now;
  window.performance.now = () => now;
  return { advance(ms) { now += ms; runDue(); }, flush() { while (timers.size) { now = Math.min(...[...timers.values()].map(t => t.at)); runDue(); } }, now: () => now };
}
function audioParam() { return { value: 0, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; } }; }
function installAudio(window, clock) {
  class Node { constructor() { this.gain = audioParam(); this.frequency = audioParam(); this.Q = audioParam(); this.delayTime = audioParam(); this.pan = audioParam(); this.playbackRate = audioParam(); } connect() { return this; } disconnect() {} start() {} stop() {} }
  class FakeAudioContext {
    constructor() { this.destination = new Node(); this.sampleRate = 8; this.state = 'running'; }
    get currentTime() { return clock.now() / 1000; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createAnalyser() { const n = new Node(); n.getByteFrequencyData = a => a.fill(0); return n; }
    createGain() { return new Node(); } createGainNode() { return new Node(); }
    createBiquadFilter() { return new Node(); } createChannelSplitter() { return new Node(); } createChannelMerger() { return new Node(); }
    createDynamicsCompressor() { const n = new Node(); n.threshold = audioParam(); n.knee = audioParam(); n.ratio = audioParam(); n.attack = audioParam(); n.release = audioParam(); return n; }
    createWaveShaper() { return new Node(); } createDelay() { return new Node(); } createConvolver() { return new Node(); }
    createOscillator() { return new Node(); } createStereoPanner() { return new Node(); } createBufferSource() { return new Node(); }
    createBuffer(channels, length) { return { numberOfChannels: channels, getChannelData() { return new Float32Array(length); } }; }
    decodeAudioData(_data, ok) { ok(this.createBuffer(1, 8)); }
  }
  window.AudioContext = window.webkitAudioContext = FakeAudioContext;
}
function installRaphael(window) {
  const item = { attr() { return this; }, animate() { return this; }, remove() {}, hide() {}, show() {}, toFront() {}, glow() { return this; } };
  const paper = { rect: () => ({ ...item }), circle: () => ({ ...item }), path: () => ({ ...item }), text: () => ({ ...item }), set: () => [], setSize() {}, clear() {}, remove() {} };
  window.Raphael = () => paper;
}

const html = fs.readFileSync(path.join(frontend, 'harmonizer.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://parity.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const clock = installClock(window);
installAudio(window, clock);
installRaphael(window);
window.Math.random = mulberry32(0xC0FFEE);
window.mode = 'canon'; window.canonVoiceCount = 2; window.harmonizerBaseAudioOnly = false;
window.harmonizerRLModel = null; window._gaq = []; window.fetch = async () => ({ ok: true, json: async () => ({}) });
window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => {};
window.console = console;
const context = dom.getInternalVMContext();
const run = (label, file) => result(label, () => new vm.Script(source(...file), { filename: path.join(frontend, ...file) }).runInContext(context));

log(`PROBE repo=${repo}`);
run('jquery', ['js', 'jquery-3.7.1.min.js']);
run('underscore', ['js', 'underscore-min.js']);
run('raphael (shipped source)', ['js', 'raphael-min.js']);
run('jremix', ['jremix.js']);
run('eternal_jukebox_engine', ['js', 'eternal_jukebox_engine.js']);
run('persistent-player', ['js', 'persistent-player.js']);
const visualizerError = run('visualizer', ['js', 'visualizer.js']);
// Preserve the requirement that construction-only audio-FX entropy never affects driver entropy.
const nativeCreateJRemixer = window.createJRemixer;
if (typeof nativeCreateJRemixer === 'function') {
  window.createJRemixer = function seededCreateJRemixer(...args) {
    const remixer = nativeCreateJRemixer(...args);
    const nativeGetPlayer = remixer.getPlayer;
    remixer.getPlayer = function seededGetPlayer(...getPlayerArgs) {
      const player = nativeGetPlayer.apply(remixer, getPlayerArgs);
      window.Math.random = mulberry32(0xC0FFEE);
      log('PATCH OK Math.random re-seeded immediately after remixer.getPlayer()');
      return player;
    };
    return remixer;
  };
  log('PATCH OK createJRemixer wrapped for post-getPlayer re-seed');
}
log(`GLOBALS after eval ${JSON.stringify(Object.fromEntries(['Driver','createCanonDriver','createJukeboxDriver','createAutoCroonerDriver','getPlayer','jremixer','driver'].map(k => [k, typeof window[k]])))}`);
const onloadError = result('window.onload() with shipped Raphael', () => window.onload?.(new window.Event('load')));
if (onloadError) {
  installRaphael(window);
  log('PATCH OK Raphael replaced with no-op paper after observing shipped-Raphael failure');
}
const retryError = onloadError ? result('window.onload() with no-op Raphael', () => window.onload?.(new window.Event('load'))) : null;
log(`GLOBALS after onload ${JSON.stringify(Object.fromEntries(['Driver','createCanonDriver','createJukeboxDriver','createAutoCroonerDriver','getPlayer','jremixer','driver','harmonizerActivePlayer'].map(k => [k, typeof window[k]])))}`);

report.push('# iOS parity harness probe findings', '', `Generated by \`probe_load.mjs\` against \`${repo}\`.`, '', '## Observed result', '', `- visualizer evaluation: ${visualizerError ? `FAILED: ${visualizerError.stack}` : 'completed'}.`, `- first explicit onload (shipped Raphael): ${onloadError ? `FAILED: ${onloadError.stack}` : 'completed'}.`, `- retry onload (no-op Raphael): ${retryError ? `FAILED: ${retryError.stack}` : 'completed'}.`, `- final globals: ${JSON.stringify(Object.fromEntries(['Driver','createCanonDriver','createJukeboxDriver','createAutoCroonerDriver','getPlayer','jremixer','driver','harmonizerActivePlayer'].map(k => [k, typeof window[k]])))}`);
report.push('', '## Source-grounded driver contract', '', '- `init()` (visualizer.js:4847) makes `context=getAudioContext()`, `remixer=createJRemixer(context,$)`, `playerForDriver=remixer.getPlayer()`, then `driver=Driver(playerForDriver)` (4896-4903). `Driver` and `getPlayer` are lexical declarations, not window properties; `window.driver` and `window.harmonizerActivePlayer` are published by init.', '- Profile route: `fetchAnalysis` calls `$.getJSON(data/<id>.json, gotTheAnalysis)` (4619-4639). `gotTheAnalysis` calls `remixer.remixTrack(profile.response.track, callback)` (4590-4612). The required profile is `{response:{status:{code:0},track:{status:"complete",info:{url},audio_summary:{duration},analysis:{sections,bars,beats,tatums,segments}}}}`. `remixTrack` preprocesses links then XMLHttpRequest/decodeAudioData; after callback status `ok`, `readyToPlay` assigns `curTrack` and `allReady` (2488-2507). No player `setTrack` or `load` exists.', '- Tick API: drivers expose `start/stop/pause/resume/isRunning`, not public tick. Their private `process()` calls `player.playQ(q)` and schedules itself: canon 8932-8987, jukebox 11244-11264, autocrooner 14660-14666/14578-14584. `player.playQ` returns remaining beat seconds (jremix.js:876-882), which the driver multiplies by 1000 for `setTimeout`.', '- Random isolation: `getPlayer()` consumes random draws in reverb at 255 and vinyl initialization at 332, 337-341; runtime canon independent overlays use 604/618; AutoCrooner constructor uses 14562 and each beat uses 14618. Re-seed immediately after `getPlayer()` before constructing Driver.', '- Minimal no-op stubs: AudioContext {currentTime,destination,sampleRate,state,resume,createAnalyser,createGain/createGainNode,createBiquadFilter,createChannelSplitter/Merger,createDynamicsCompressor,createWaveShaper,createDelay,createConvolver,createOscillator,createStereoPanner,createBufferSource,createBuffer,decodeAudioData}; all nodes {connect,disconnect,start,stop}, AudioParam {value,cancelScheduledValues,setValueAtTime}; Raphael paper {rect,circle,path,text,set}; requestAnimationFrame; virtual Date/performance/timers; jQuery/underscore; XMLHttpRequest or bypass `remixTrack` with preprocessed track; DOM ids used by init/drivers; fetch/$.getJSON if exercising profile retrieval.', '', '## Probe transcript', '', '```text', ...lines, '```');
const out = path.join(here, 'HARNESS_PROBE.md');
fs.writeFileSync(out, `${report.join('\n')}\n`);
console.log(`\n${report.join('\n')}`);
