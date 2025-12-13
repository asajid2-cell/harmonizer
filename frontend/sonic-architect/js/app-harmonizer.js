/**
 * 3D Visualizer controller.
 * Uses the 3D Visualizer rendering core with Harmonizer-driven playback support.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { eventBus, Events } from './utils/EventBus.js';
import audioEngine from './audio/AudioEngine.js';
import { frequencyAnalyzer } from './audio/FrequencyAnalyzer.js';
import { beatDetector } from './audio/BeatDetector.js';

import { createVisualizerManager } from './visualizers/VisualizerManager.js';
import SphereVisualizer from './visualizers/SphereVisualizer.js';
import ParticleGalaxy from './visualizers/ParticleGalaxy.js';
import AudioBars3D from './visualizers/AudioBars3D.js';
import WaveformTunnel from './visualizers/WaveformTunnel.js';
import Terrain from './visualizers/Terrain.js';
import Ribbons from './visualizers/Ribbons.js';
import DNAHelix from './visualizers/DNAHelix.js';
import Kaleidoscope from './visualizers/Kaleidoscope.js';
import Nebula from './visualizers/Nebula.js';
import Fireworks from './visualizers/Fireworks.js';
import CircuitBoard from './visualizers/CircuitBoard.js';
import CrystalLattice from './visualizers/CrystalLattice.js';
import PrismKnot from './visualizers/PrismKnot.js';
import RaymarchFractal from './visualizers/RaymarchFractal.js';
import NeonVoxelCity from './visualizers/NeonVoxelCity.js';
import MetaballsFluid from './visualizers/MetaballsFluid.js';

import { PostProcessorManager } from './effects/PostProcessing.js';

// A bunch of the legacy visualizers assume THREE is global.
window.THREE = THREE;

const CONFIG = window.HARMONIZER_CONFIG || {};
const API_BASE_URL = (CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
const CACHE_BUSTER = 'v=20251212';

// Rebrand storage keys without breaking existing saved state.
const VISUALIZER_STORAGE = {
  vizId: 'threeDVisualizerVizId',
  uiHidden: 'threeDVisualizerUiHidden',
  theme: 'threeDVisualizerThemeV1',
  autoRotate: 'threeDVisualizerAutoRotate',
  autoRotateSpeed: 'threeDVisualizerAutoRotateSpeed',
  fov: 'threeDVisualizerFov',
  quality: 'threeDVisualizerQuality',
};

const MAIN_TAB_STORAGE_KEY = 'threeDVisualizerMainTabV1';

function readStorage(primaryKey, fallbackValue) {
  try {
    const v = localStorage.getItem(primaryKey);
    if (v !== null) return v;
  } catch (e) {}
  return fallbackValue;
}

function writeStorage(primaryKey, value) {
  try {
    localStorage.setItem(primaryKey, value);
  } catch (e) {}
}

function resolveApiUrl(path, addCacheBuster = true) {
  if (!path) return API_BASE_URL || '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.charAt(0) !== '/') path = '/' + path;
  let resolved = API_BASE_URL ? API_BASE_URL + path : path;
  if (addCacheBuster !== false && (path.includes('/data/') || path.endsWith('.json'))) {
    resolved += (resolved.includes('?') ? '&' : '?') + CACHE_BUSTER;
  }
  return resolved;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE_PARAMS = new URLSearchParams(location.search);
const EXTERNAL_AUDIO_MODE = (PAGE_PARAMS.get('src') || '').toLowerCase() === 'harmonizer';
const EXTERNAL_AUDIO_SID = PAGE_PARAMS.get('sid') || null;
const EXTERNAL_TRACK_ID = PAGE_PARAMS.get('trid') || null;

// =====================================
// THEMES + PRESETS
// =====================================

const THEMES = {
  cyber: { label: 'Cyber', primary: '#ff00ff', secondary: '#00ffff' },
  vapor: { label: 'Vapor', primary: '#ff71ce', secondary: '#01cdfe' },
  matrix: { label: 'Matrix', primary: '#00ff66', secondary: '#003300' },
  sunset: { label: 'Sunset', primary: '#ff6b35', secondary: '#f7c59f' },
  aurora: { label: 'Aurora', primary: '#00d4aa', secondary: '#7b2cbf' },
  retrowave: { label: 'Retrowave', primary: '#ff00ff', secondary: '#00ffff' },
  bloodmoon: { label: 'Bloodmoon', primary: '#ff003c', secondary: '#8b0000' },
  hologram: { label: 'Hologram', primary: '#00ffff', secondary: '#ff00ff' },
  void: { label: 'Void', primary: '#ffffff', secondary: '#888888' },
  custom: { label: 'Custom', primary: '#ff00ff', secondary: '#00ffff' },
};

const PRESETS = {
  neonPulse: {
    label: 'Neon Pulse',
    vizId: 'sphere',
    vizControls: { displacement: 1.4, noiseScale: 2.8, glowIntensity: 2.2, rotationSpeed: 0.35, showParticles: true },
    effects: {
      bloom: { enabled: true, strength: 1.9, radius: 0.6, threshold: 0.75 },
      chromatic: { enabled: true, intensity: 0.6, offset: 0.004 },
      glitch: { enabled: false, intensity: 0.35, amount: 0.12, speed: 1.2 },
      scanlines: { enabled: true, intensity: 0.08, density: 900 },
      vignette: { enabled: true, offset: 1.1, darkness: 1.15 },
      grain: { enabled: false, intensity: 0.06 },
    },
    themeId: 'retrowave',
  },
  terrainDrift: {
    label: 'Terrain Drift',
    vizId: 'terrain',
    vizControls: { scrollSpeed: 3.5, heightScale: 2.6, noiseScale: 0.45, fogDensity: 1.0 },
    effects: {
      bloom: { enabled: true, strength: 1.3, radius: 0.35, threshold: 0.9 },
      chromatic: { enabled: false, intensity: 0.3, offset: 0.003 },
      glitch: { enabled: false, intensity: 0.2, amount: 0.06, speed: 0.8 },
      scanlines: { enabled: false, intensity: 0.05, density: 700 },
      vignette: { enabled: true, offset: 1.2, darkness: 1.0 },
      grain: { enabled: true, intensity: 0.08 },
    },
    themeId: 'sunset',
  },
  galaxyStorm: {
    label: 'Galaxy Storm',
    vizId: 'galaxy',
    vizControls: { rotationSpeed: 0.25, spread: 1.4, brightness: 1.6 },
    effects: {
      bloom: { enabled: true, strength: 1.7, radius: 0.55, threshold: 0.8 },
      chromatic: { enabled: true, intensity: 0.4, offset: 0.004 },
      glitch: { enabled: true, intensity: 0.35, amount: 0.1, speed: 1.1 },
      scanlines: { enabled: false, intensity: 0.05, density: 750 },
      vignette: { enabled: true, offset: 1.05, darkness: 1.2 },
      grain: { enabled: false, intensity: 0.05 },
    },
    themeId: 'cyber',
  },
  ribbonRave: {
    label: 'Ribbon Rave',
    vizId: 'ribbons',
    vizControls: { speed: 1.2, thickness: 1.3, glow: 1.7 },
    effects: {
      bloom: { enabled: true, strength: 1.6, radius: 0.5, threshold: 0.85 },
      chromatic: { enabled: false, intensity: 0.3, offset: 0.003 },
      glitch: { enabled: false, intensity: 0.2, amount: 0.08, speed: 1.0 },
      scanlines: { enabled: true, intensity: 0.06, density: 850 },
      vignette: { enabled: false, offset: 1.0, darkness: 1.0 },
      grain: { enabled: false, intensity: 0.05 },
    },
    themeId: 'vapor',
  },
  tunnelDrive: {
    label: 'Tunnel Drive',
    vizId: 'tunnel',
    vizControls: { intensity: 1.2, speed: 0.5, thickness: 1.1 },
    effects: {
      bloom: { enabled: true, strength: 1.4, radius: 0.4, threshold: 0.9 },
      chromatic: { enabled: true, intensity: 0.35, offset: 0.0035 },
      glitch: { enabled: false, intensity: 0.3, amount: 0.08, speed: 1.0 },
      scanlines: { enabled: true, intensity: 0.07, density: 950 },
      vignette: { enabled: true, offset: 1.1, darkness: 1.1 },
      grain: { enabled: false, intensity: 0.04 },
    },
    themeId: 'matrix',
  },
  crystalCathedral: {
    label: 'Crystal Cathedral',
    vizId: 'crystal',
    vizControls: { density: 11, spread: 12, size: 0.32, rotationSpeed: 0.55, emissive: 2.2, metalness: 0.25, roughness: 0.22, wireframe: false },
    effects: {
      bloom: { enabled: true, strength: 2.0, radius: 0.65, threshold: 0.8 },
      chromatic: { enabled: true, intensity: 0.35, offset: 0.0035 },
      glitch: { enabled: false, intensity: 0.2, amount: 0.06, speed: 1.0 },
      scanlines: { enabled: false, intensity: 0.06, density: 900 },
      vignette: { enabled: true, offset: 1.1, darkness: 1.05 },
      grain: { enabled: false, intensity: 0.05 },
    },
    themeId: 'hologram',
  },
  prismRapture: {
    label: 'Prism Rapture',
    vizId: 'prism',
    vizControls: { coreScale: 1.05, shardCount: 180, shardRadius: 7.2, shardSize: 0.22, rotationSpeed: 0.6, glow: 1.6, refraction: 0.5, wireframe: false },
    effects: {
      bloom: { enabled: true, strength: 1.85, radius: 0.55, threshold: 0.78 },
      chromatic: { enabled: true, intensity: 0.55, offset: 0.004 },
      glitch: { enabled: true, intensity: 0.25, amount: 0.08, speed: 1.1 },
      scanlines: { enabled: false, intensity: 0.06, density: 900 },
      vignette: { enabled: true, offset: 1.05, darkness: 1.1 },
      grain: { enabled: false, intensity: 0.05 },
    },
    themeId: 'retrowave',
  },
  fractalAbyss: {
    label: 'Fractal Abyss',
    vizId: 'fractal',
    vizControls: { power: 9.0, iterations: 12, detail: 0.0035, fog: 1.1, glow: 1.2, zoom: 0.82, rotateSpeed: 0.9 },
    effects: {
      bloom: { enabled: true, strength: 1.6, radius: 0.6, threshold: 0.85 },
      chromatic: { enabled: true, intensity: 0.35, offset: 0.0035 },
      glitch: { enabled: false, intensity: 0.2, amount: 0.06, speed: 1.0 },
      scanlines: { enabled: false, intensity: 0.06, density: 900 },
      vignette: { enabled: true, offset: 1.15, darkness: 1.2 },
      grain: { enabled: true, intensity: 0.08 },
    },
    themeId: 'bloodmoon',
  },
  cityNightDrive: {
    label: 'City Night Drive',
    vizId: 'city',
    vizControls: { grid: 36, spacing: 0.68, height: 7.2, wave: 1.2, speed: 1.35, glow: 2.0, wireframe: false },
    effects: {
      bloom: { enabled: true, strength: 1.8, radius: 0.55, threshold: 0.8 },
      chromatic: { enabled: true, intensity: 0.25, offset: 0.003 },
      glitch: { enabled: false, intensity: 0.2, amount: 0.06, speed: 1.0 },
      scanlines: { enabled: true, intensity: 0.05, density: 900 },
      vignette: { enabled: true, offset: 1.05, darkness: 1.15 },
      grain: { enabled: false, intensity: 0.05 },
    },
    themeId: 'cyber',
  },
  liquidDream: {
    label: 'Liquid Dream',
    vizId: 'metaballs',
    vizControls: { resolution: 42, ballCount: 11, strength: 1.25, subtract: 12, speed: 1.25, scale: 10.5, glow: 1.8, wireframe: false },
    effects: {
      bloom: { enabled: true, strength: 1.9, radius: 0.6, threshold: 0.82 },
      chromatic: { enabled: true, intensity: 0.3, offset: 0.0035 },
      glitch: { enabled: false, intensity: 0.2, amount: 0.06, speed: 1.0 },
      scanlines: { enabled: false, intensity: 0.06, density: 900 },
      vignette: { enabled: true, offset: 1.08, darkness: 1.1 },
      grain: { enabled: false, intensity: 0.05 },
    },
    themeId: 'aurora',
  },
};

// =====================================
// DOM
// =====================================

const dom = {};

function cacheDom() {
  dom.body = document.body;
  dom.canvasContainer = document.getElementById('hv-canvas-container');
  dom.trackMeta = document.getElementById('hv-track-meta');
  dom.autoplayHint = document.getElementById('hv-autoplay-hint');

  dom.hideUiBtn = document.getElementById('hv-hide-ui-btn');
  dom.mainTabSong = document.getElementById('hv-main-tab-song');
  dom.mainTabViz = document.getElementById('hv-main-tab-viz');
  dom.mainPaneSong = document.getElementById('hv-main-pane-song');
  dom.mainPaneViz = document.getElementById('hv-main-pane-viz');
  dom.presetSelect = document.getElementById('hv-scene-preset');
  dom.vizSelect = document.getElementById('hv-viz-mode');
  dom.vizControls = document.getElementById('hv-viz-controls');

  dom.chooseSongBtn = document.getElementById('hv-choose-song-btn');
  dom.playPauseBtn = document.getElementById('hv-playpause-btn');

  dom.hxEnabled = document.getElementById('hv-hx-enabled');
  dom.hxMode = document.getElementById('hv-hx-mode');
  dom.hxJumpProb = document.getElementById('hv-hx-jump-prob');
  dom.hxLoopEnd = document.getElementById('hv-hx-loop-end');
  dom.hxRestart = document.getElementById('hv-hx-restart');
  dom.hxApply = document.getElementById('hv-hx-apply');
  dom.hxCanonVoices = document.getElementById('hv-hx-canon-voices');
  dom.hxOverlayMix = document.getElementById('hv-hx-overlay-mix');
  dom.hxBaseAudioOnly = document.getElementById('hv-hx-base-audio-only');

  dom.hxDopamine = document.getElementById('hv-hx-layer-dopamine');
  dom.hxDopamineTop = document.getElementById('hv-hx-dopamine-top');
  dom.hxDopamineWindow = document.getElementById('hv-hx-dopamine-window');

  dom.hxTrap = document.getElementById('hv-hx-layer-harmonictrap');
  dom.hxTrapWindow = document.getElementById('hv-hx-trap-window');
  dom.hxTrapStrength = document.getElementById('hv-hx-trap-strength');

  dom.hxPhase = document.getElementById('hv-hx-layer-phaseshifter');
  dom.hxPhaseRate = document.getElementById('hv-hx-phase-rate');
  dom.hxPhaseDepth = document.getElementById('hv-hx-phase-depth');

  dom.hxFreeze = document.getElementById('hv-hx-layer-granularfreeze');
  dom.hxFreezeChance = document.getElementById('hv-hx-freeze-chance');
  dom.hxFreezeRepeats = document.getElementById('hv-hx-freeze-repeats');

  dom.hxVelo = document.getElementById('hv-hx-layer-elasticvelo');
  dom.hxVeloBase = document.getElementById('hv-hx-velo-base');
  dom.hxVeloAmt = document.getElementById('hv-hx-velo-amt');

  dom.fxBloomToggle = document.getElementById('hv-fx-bloom-toggle');
  dom.fxBloomStrength = document.getElementById('hv-fx-bloom-strength');
  dom.fxBloomRadius = document.getElementById('hv-fx-bloom-radius');
  dom.fxBloomThreshold = document.getElementById('hv-fx-bloom-threshold');

  dom.fxChromaticToggle = document.getElementById('hv-fx-chromatic-toggle');
  dom.fxChromaticIntensity = document.getElementById('hv-fx-chromatic-intensity');
  dom.fxChromaticOffset = document.getElementById('hv-fx-chromatic-offset');

  dom.fxGlitchToggle = document.getElementById('hv-fx-glitch-toggle');
  dom.fxGlitchIntensity = document.getElementById('hv-fx-glitch-intensity');
  dom.fxGlitchAmount = document.getElementById('hv-fx-glitch-amount');
  dom.fxGlitchSpeed = document.getElementById('hv-fx-glitch-speed');

  dom.fxScanlinesToggle = document.getElementById('hv-fx-scanlines-toggle');
  dom.fxScanlinesIntensity = document.getElementById('hv-fx-scanlines-intensity');
  dom.fxScanlinesDensity = document.getElementById('hv-fx-scanlines-density');

  dom.fxVignetteToggle = document.getElementById('hv-fx-vignette-toggle');
  dom.fxVignetteOffset = document.getElementById('hv-fx-vignette-offset');
  dom.fxVignetteDarkness = document.getElementById('hv-fx-vignette-darkness');

  dom.fxGrainToggle = document.getElementById('hv-fx-grain-toggle');
  dom.fxGrainIntensity = document.getElementById('hv-fx-grain-intensity');

  dom.fxColorGradeToggle = document.getElementById('hv-fx-colorgrade-toggle');
  dom.fxColorGradeExposure = document.getElementById('hv-fx-colorgrade-exposure');
  dom.fxColorGradeContrast = document.getElementById('hv-fx-colorgrade-contrast');
  dom.fxColorGradeSaturation = document.getElementById('hv-fx-colorgrade-saturation');
  dom.fxColorGradeHue = document.getElementById('hv-fx-colorgrade-hue');
  dom.fxColorGradeVibrance = document.getElementById('hv-fx-colorgrade-vibrance');
  dom.fxColorGradeTint = document.getElementById('hv-fx-colorgrade-tint');

  dom.fxPixelateToggle = document.getElementById('hv-fx-pixelate-toggle');
  dom.fxPixelateSize = document.getElementById('hv-fx-pixelate-size');
  dom.fxPixelateIntensity = document.getElementById('hv-fx-pixelate-intensity');

  dom.fxDotMatrixToggle = document.getElementById('hv-fx-dotmatrix-toggle');
  dom.fxDotMatrixIntensity = document.getElementById('hv-fx-dotmatrix-intensity');
  dom.fxDotMatrixScale = document.getElementById('hv-fx-dotmatrix-scale');
  dom.fxDotMatrixAngle = document.getElementById('hv-fx-dotmatrix-angle');
  dom.fxDotMatrixSoftness = document.getElementById('hv-fx-dotmatrix-softness');

  dom.fxTrailsToggle = document.getElementById('hv-fx-trails-toggle');
  dom.fxTrailsDamp = document.getElementById('hv-fx-trails-damp');

  dom.themeSelect = document.getElementById('hv-theme-select');
  dom.colorPrimary = document.getElementById('hv-color-primary');
  dom.colorTertiary = document.getElementById('hv-color-tertiary');
  dom.colorSecondary = document.getElementById('hv-color-secondary');
  dom.applyColorsBtn = document.getElementById('hv-apply-colors');

  dom.camAutoRotate = document.getElementById('hv-cam-autorotate');
  dom.camAutoRotateSpeed = document.getElementById('hv-cam-autorotate-speed');
  dom.camFov = document.getElementById('hv-cam-fov');
  dom.camReset = document.getElementById('hv-cam-reset');
  dom.qualitySelect = document.getElementById('hv-quality');

  dom.addSongsBtn = document.getElementById('hv-add-songs-btn');
  dom.viewQueueBtn = document.getElementById('hv-view-queue-btn');
  dom.nextBtn = document.getElementById('hv-next-btn');
  dom.clearQueueBtn = document.getElementById('hv-clear-queue-btn');
  dom.backBtn = document.getElementById('hv-back-btn');

  dom.libraryModal = document.getElementById('hv-library-modal');
  dom.libraryClose = document.getElementById('hv-library-close');
  dom.tabSongs = document.getElementById('hv-tab-songs');
  dom.tabQueue = document.getElementById('hv-tab-queue');
  dom.paneSongs = document.getElementById('hv-pane-songs');
  dom.paneQueue = document.getElementById('hv-pane-queue');
  dom.songSearch = document.getElementById('hv-song-search');
  dom.uploadBtn = document.getElementById('hv-upload-btn');
  dom.refreshBtn = document.getElementById('hv-refresh-btn');
  dom.uploadInput = document.getElementById('hv-upload-input');
  dom.uploadStatus = document.getElementById('hv-upload-status');
  dom.songsList = document.getElementById('hv-songs-list');
  dom.queueList = document.getElementById('hv-queue-list');
}

// =====================================
// CORE APP STATE (filled below)
// =====================================

const app = {
  scene: null,
  camera: null,
  renderer: null,
  composer: null,
  controls: null,
  clock: null,
  vizManager: null,
  bloomPass: null,
  postProcessor: null,
};

function initThree() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  app.scene = new THREE.Scene();
  // Keep fog subtle so zooming out doesn't black out the whole scene.
  app.scene.fog = new THREE.FogExp2(0x000000, 0.004);

  app.camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 1000);
  app.camera.position.set(0, 0, 15);

  app.renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  app.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  app.renderer.setSize(width, height);
  app.renderer.setClearColor(0x000000, 1);

  dom.canvasContainer.innerHTML = '';
  dom.canvasContainer.appendChild(app.renderer.domElement);

  app.controls = new OrbitControls(app.camera, app.renderer.domElement);
  app.controls.enableDamping = true;
  app.controls.enablePan = false;
  app.controls.minDistance = 1.5;
  app.controls.maxDistance = 200;
  app.controls.target.set(0, 0, 0);
  app.controls.autoRotate = false;

  app.composer = new EffectComposer(app.renderer);
  app.composer.addPass(new RenderPass(app.scene, app.camera));

  app.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
  app.bloomPass.enabled = true;
  app.composer.addPass(app.bloomPass);

  app.postProcessor = new PostProcessorManager(app.composer).init();
  // Initialize pixelate pass resolution immediately
  try {
    const pr = app.renderer.getPixelRatio ? app.renderer.getPixelRatio() : 1;
    app.postProcessor?.passes?.pixelate?.setSize(width * pr, height * pr);
  } catch (e) {}

  app.clock = new THREE.Clock();

  window.addEventListener('resize', onResize);
}

function initVisualizers() {
  app.vizManager = createVisualizerManager(app.scene, app.camera, app.renderer);
  app.vizManager.register(SphereVisualizer);
  app.vizManager.register(ParticleGalaxy);
  app.vizManager.register(AudioBars3D);
  app.vizManager.register(WaveformTunnel);
  app.vizManager.register(Terrain);
  app.vizManager.register(Ribbons);
  app.vizManager.register(DNAHelix);
  app.vizManager.register(Kaleidoscope);
  app.vizManager.register(Nebula);
  app.vizManager.register(Fireworks);
  app.vizManager.register(CircuitBoard);
  app.vizManager.register(CrystalLattice);
  app.vizManager.register(PrismKnot);
  app.vizManager.register(RaymarchFractal);
  app.vizManager.register(NeonVoxelCity);
  app.vizManager.register(MetaballsFluid);

  const savedViz = readStorage(VISUALIZER_STORAGE.vizId, 'sphere') || 'sphere';
  app.vizManager.switchTo(savedViz, 'instant');
  if (dom.vizSelect) dom.vizSelect.value = savedViz;
  renderVisualizerControls();

  // Keep orbit controls pointed at the scene center.
  app.controls.target.set(0, 0, 0);
  app.controls.update();
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  app.camera.aspect = width / height;
  app.camera.updateProjectionMatrix();

  app.renderer.setSize(width, height);
  app.composer.setSize(width, height);

  app.vizManager.resize(width, height);

  // Sync pixelate resolution if enabled
  try {
    const pr = app.renderer.getPixelRatio ? app.renderer.getPixelRatio() : 1;
    app.postProcessor?.passes?.pixelate?.setSize(width * pr, height * pr);
  } catch (e) {}
}

function getIdleAudioData() {
  const bands = new Float32Array(32).fill(0);
  return {
    bands,
    bandsSmoothed: bands,
    bandsPeak: bands,
    bassLevel: 0,
    midLevel: 0,
    highLevel: 0,
    bass: 0,
    mid: 0,
    treble: 0,
  };
}

function createExternalAudioReceiver(enabled, sid) {
  const state = {
    enabled: !!enabled,
    sid: sid || null,
    channels: [],
    connected: false,
    lastFrameAt: 0,
    freq: null,
    directAnalyser: null,
    bands: new Float32Array(32),
    bandsSmoothed: new Float32Array(32),
    bandsPeak: new Float32Array(32),
    prevBass: 0,
    beatCooldown: 0,
  };

  const smoothing = 0.8;
  const peakDecay = 0.98;

  function nowMs() {
    return performance && typeof performance.now === 'function' ? performance.now() : Date.now();
  }

  function onFrameMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'init') {
      state.connected = true;
      return;
    }
    if (msg.type !== 'frame') return;
    if (!Array.isArray(msg.freq)) return;
    try {
      state.freq = Uint8Array.from(msg.freq);
      state.lastFrameAt = nowMs();
      state.connected = true;
    } catch (e) {}
  }

  function tryAttachOpenerAnalyser() {
    if (state.directAnalyser) return state.directAnalyser;
    try {
      const opener = window.opener;
      if (!opener || opener.closed) return null;
      const player = opener.harmonizerActivePlayer;
      if (!player || typeof player.getVizAnalyser !== 'function') return null;
      const analyserNode = player.getVizAnalyser();
      if (analyserNode && typeof analyserNode.getByteFrequencyData === 'function') {
        state.directAnalyser = analyserNode;
        state.connected = true;
        return analyserNode;
      }
    } catch (e) {}
    return null;
  }

  function pullFromDirectAnalyser() {
    const a = state.directAnalyser || tryAttachOpenerAnalyser();
    if (!a) return false;
    try {
      const bins = a.frequencyBinCount || 256;
      const buf = new Uint8Array(bins);
      a.getByteFrequencyData(buf);
      state.freq = buf;
      state.lastFrameAt = nowMs();
      state.connected = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  function init() {
    // Same-origin fast-path: directly read analyser from the opener window.
    // This allows Harmonizer -> 3D Visualizer without requiring Harmonizer code changes.
    const direct = tryAttachOpenerAnalyser();
    if (direct) state.enabled = true;

    if (!state.enabled) return;

    try {
      window.addEventListener('message', (e) => {
        try {
          onFrameMessage(e && e.data);
        } catch (err) {}
      });
    } catch (e) {}

    if (typeof BroadcastChannel === 'undefined') return;
    const names = [];
    if (state.sid) names.push(`harmonizer-viz-${state.sid}`);
    names.push('harmonizer-viz-default');

    names.forEach((name) => {
      try {
        const ch = new BroadcastChannel(name);
        ch.addEventListener('message', (e) => {
          onFrameMessage(e && e.data);
        });
        state.channels.push(ch);
      } catch (e) {}
    });
  }

  function hasRecentFrame() {
    if (!state.enabled) return false;
    if (!state.lastFrameAt) return false;
    return nowMs() - state.lastFrameAt < 1200;
  }

  function computeBandsFromFreq(freq) {
    const len = freq.length || 0;
    if (len <= 0) return;
    const maxBin = Math.max(1, len - 1);

    for (let bi = 0; bi < 32; bi++) {
      const t0 = bi / 32;
      const t1 = (bi + 1) / 32;
      const start = Math.floor(maxBin * Math.pow(t0, 2.0));
      const end = Math.max(start, Math.floor(maxBin * Math.pow(t1, 2.0)));
      let sum = 0;
      let count = 0;
      for (let b = start; b <= end; b++) {
        sum += freq[b] || 0;
        count++;
      }
      const value = count > 0 ? (sum / count) / 255 : 0;
      state.bands[bi] = value;
      state.bandsSmoothed[bi] = state.bandsSmoothed[bi] * smoothing + value * (1 - smoothing);
      state.bandsPeak[bi] = value > state.bandsPeak[bi] ? value : state.bandsPeak[bi] * peakDecay;
    }
  }

  function meanBandRange(start, end) {
    const s = Math.max(0, start);
    const e = Math.min(31, end);
    let sum = 0;
    let count = 0;
    for (let i = s; i <= e; i++) {
      sum += state.bandsSmoothed[i];
      count++;
    }
    return count ? sum / count : 0;
  }

  function getAnalysis(deltaSec) {
    // Keep trying to pull from a same-origin opener analyser (it may appear after page load).
    if (!hasRecentFrame() || !state.freq) {
      pullFromDirectAnalyser();
      if (state.directAnalyser) state.enabled = true;
    }
    if (!hasRecentFrame() || !state.freq) return null;
    computeBandsFromFreq(state.freq);

    const subBass = meanBandRange(0, 1);
    const bass = meanBandRange(2, 6);
    const lowMid = meanBandRange(7, 10);
    const mid = meanBandRange(11, 17);
    const highMid = meanBandRange(18, 22);
    const presence = meanBandRange(23, 26);
    const brilliance = meanBandRange(27, 31);

    const bassLevel = (subBass + bass) / 2;
    const midLevel = (lowMid + mid + highMid) / 3;
    const highLevel = (presence + brilliance) / 2;

    const rmsVolume = meanBandRange(0, 31);
    const totalEnergy = rmsVolume * rmsVolume;

    let beatIntensity = 0;
    state.beatCooldown = Math.max(0, state.beatCooldown - (typeof deltaSec === 'number' ? deltaSec : 0));
    if (state.beatCooldown === 0 && bassLevel > 0.55 && bassLevel > state.prevBass * 1.25) {
      beatIntensity = Math.min(1, 0.35 + bassLevel);
      state.beatCooldown = 0.18;
    }
    state.prevBass = bassLevel;

    return {
      bands: state.bands,
      bandsSmoothed: state.bandsSmoothed,
      bandsPeak: state.bandsPeak,
      subBass,
      bass,
      lowMid,
      mid,
      highMid,
      presence,
      brilliance,
      spectralCentroid: 0,
      spectralFlatness: 0,
      rmsVolume,
      totalEnergy,
      bassLevel,
      midLevel,
      highLevel,
      __beat: beatIntensity,
    };
  }

  function dispose() {
    try {
      state.channels.forEach((ch) => {
        try {
          ch.close();
        } catch (e) {}
      });
    } catch (e) {}
    state.channels = [];
    state.directAnalyser = null;
  }

  return {
    get enabled() {
      return state.enabled;
    },
    init,
    dispose,
    hasRecentFrame,
    getAnalysis,
    isConnected: () => state.connected,
    tryEnableFromOpener: () => {
      const direct = tryAttachOpenerAnalyser();
      if (!direct) return false;
      state.enabled = true;
      pullFromDirectAnalyser();
      return !!state.directAnalyser;
    },
  };
}

const externalAudioReceiver = createExternalAudioReceiver(EXTERNAL_AUDIO_MODE, EXTERNAL_AUDIO_SID);
let externalUiTick = 0;
let externalTrackLabel = 'External audio';

function animate() {
  requestAnimationFrame(animate);

  const delta = app.clock.getDelta();
  let audioData = null;

  if (externalAudioReceiver.enabled) {
    audioData = externalAudioReceiver.getAnalysis(delta) || getIdleAudioData();
    const beatIntensity = audioData && typeof audioData.__beat === 'number' ? audioData.__beat : 0;
    if (beatIntensity > 0.01) {
      app.vizManager.onBeat(beatIntensity);
    }
    // Lightweight status so it's obvious whether we're receiving frames.
    externalUiTick += delta;
    if (externalUiTick > 0.6) {
      externalUiTick = 0;
      if (dom.trackMeta) {
        dom.trackMeta.textContent = externalAudioReceiver.hasRecentFrame()
          ? `${externalTrackLabel} • connected`
          : `${externalTrackLabel} • waiting…`;
      }
    }
  } else if (audioEngine.isPlaying && frequencyAnalyzer.isInitialized) {
    frequencyAnalyzer.update();
    const beatState = beatDetector.update(delta * 1000);
    audioData = frequencyAnalyzer.getAnalysis();

    if (beatState && beatState.isBeat) {
      app.vizManager.onBeat(beatState.beatIntensity);
    }
    if (beatState && beatState.bpm) {
      app.vizManager.onBPMUpdate(beatState.bpm, beatState.bpmConfidence);
    }
  } else {
    audioData = getIdleAudioData();
  }

  app.vizManager.update(delta, audioData);
  app.controls.update();
  // Harmonizer driver runs on the audio element, independent of visuals.
  if (!externalAudioReceiver.enabled) {
    hxRuntime.active = !!hxState.enabled && hxRuntime.beats.length > 0;
    if (hxRuntime.active) {
      try {
        hxTick();
      } catch (e) {}
    }
  }
  app.composer.render();
}

// =====================================
// AUDIO + TRACKS
// =====================================

let audioUnlocked = false;
let pendingTrackToPlay = null;
let currentTrackId = null;
let currentAlgorithm = (new URLSearchParams(location.search).get('mode') || 'canon').toLowerCase();
let currentTrackAnalysis = null;
let pendingLaunchPlayback = null;
let autoPlayNext = false;

const LAUNCH_PLAYBACK_MAX_AGE_MS = 15000;

// =====================================
// HARMONIZER STACK FX (playback driver)
// =====================================

const HX_STORAGE_KEY = 'harmonizerHVStackFXV1';
const HX_LAUNCH_KEY = 'harmonizerVisualizerLaunchHarmonizerV1';

const SUPPORTED_ALGORITHMS = new Set([
  'canon',
  'jukebox',
  'eternal',
  'dopamine',
  'harmonictrap',
  'phaseshifter',
  'granularfreeze',
  'elasticvelo',
  'autoharmonizer',
  'sculptor',
]);

function normalizeAlgorithm(mode) {
  const m = String(mode || '').toLowerCase();
  return SUPPORTED_ALGORITHMS.has(m) ? m : 'canon';
}

function applyRequestedModeToHx(requestedModeRaw) {
  const requestedMode = normalizeAlgorithm(requestedModeRaw);

  // Reset only fields we explicitly own from "requested mode".
  // Keep any user-tuned slider values intact.
  if (['canon', 'jukebox', 'eternal'].includes(requestedMode)) {
    hxState.mode = requestedMode;
  } else {
    hxState.mode = 'off';
  }

  // Mode-as-driver in Harmonizer maps to a single layer here.
  const layerModes = ['dopamine', 'harmonictrap', 'phaseshifter', 'granularfreeze', 'elasticvelo'];
  if (layerModes.includes(requestedMode)) {
    hxState.layers[requestedMode] = true;
  }

  // Autoharmonizer/sculptor are not supported in the 3D visualizer driver.
  // Best-effort fallback to something musical instead of doing nothing.
  if (requestedMode === 'autoharmonizer' || requestedMode === 'sculptor') {
    if (hxState.mode === 'off') hxState.mode = 'jukebox';
  }

  const anyLayer = Object.values(hxState.layers).some(Boolean);
  if (anyLayer || (hxState.mode && hxState.mode !== 'off')) {
    hxState.enabled = true;
  }

  currentAlgorithm = requestedMode;
}

const hxState = {
  enabled: false,
  mode: 'off', // off|canon|jukebox|eternal
  jumpProb: 0.55,
  loopEnd: true,
  canonVoiceCount: 2,
  overlayMix: 0.45,
  baseAudioOnly: false,
  layers: {
    dopamine: false,
    harmonictrap: false,
    phaseshifter: false,
    granularfreeze: false,
    elasticvelo: false,
  },
  dopamineTop: 0.12,
  dopamineWindow: 48,
  trapWindow: 64,
  trapStrength: 0.55,
  phaseRate: 0.6,
  phaseDepth: 8,
  freezeChance: 0.2,
  freezeRepeats: 6,
  veloBase: 1.0,
  veloAmt: 0.25,
};

const DEFAULT_HX_STATE = JSON.parse(JSON.stringify(hxState));

function resetHxStateToDefaults() {
  const cloned = JSON.parse(JSON.stringify(DEFAULT_HX_STATE));
  Object.keys(hxState).forEach((k) => delete hxState[k]);
  Object.assign(hxState, cloned);
}

const hxRuntime = {
  active: false,
  beats: [],
  beatEnergy: [],
  beatPitch: [],
  peaks: new Set(),
  canonOverlays: [], // overlays[beatIndex] -> [overlayBeatIdx...]
  trapTarget: null,
  freezeRemaining: 0,
  currentBeatIndex: 0,
  lastSeekAt: 0,
};

function loadHxState() {
  try {
    const saved = JSON.parse(localStorage.getItem(HX_STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      Object.assign(hxState, saved);
      hxState.layers = Object.assign(hxState.layers, saved.layers || {});
    }
  } catch (e) {}

  // Normalize URL mode for uploads/deep-links.
  currentAlgorithm = normalizeAlgorithm(currentAlgorithm);

  // Pull defaults from Harmonizer page if present (and for this track).
  try {
    const launch = JSON.parse(localStorage.getItem(HX_LAUNCH_KEY) || 'null');
    if (launch && typeof launch === 'object') {
      const urlTrackId = new URLSearchParams(location.search).get('trid') || '';
      const launchTrackId = String(launch.trackId || '');
      const shouldApplyLaunch = !launchTrackId || !urlTrackId || launchTrackId === urlTrackId;

      if (shouldApplyLaunch) {
        // When launching from Harmonizer, prefer its settings over any saved visualizer state.
        resetHxStateToDefaults();

        // Apply playback handoff only when the payload is fresh (prevents stale seeks).
        const savedAt = Number(launch.savedAt || 0);
        const ageMs = Date.now() - savedAt;
        if (savedAt > 0 && isFinite(ageMs) && ageMs >= 0 && ageMs <= LAUNCH_PLAYBACK_MAX_AGE_MS) {
          const start = Number(launch.startTimeSeconds);
          if (isFinite(start) && start >= 0) {
            pendingLaunchPlayback = {
              trackId: launchTrackId || urlTrackId || null,
              startTimeSeconds: start,
              wasPlaying: typeof launch.wasPlaying === 'boolean' ? launch.wasPlaying : true,
            };
          }
        }

        if (typeof launch.canonVoiceCount === 'number' && isFinite(launch.canonVoiceCount)) {
          hxState.canonVoiceCount = Math.max(2, Math.min(8, Math.round(launch.canonVoiceCount)));
        }
        if (typeof launch.baseAudioOnly === 'boolean') {
          hxState.baseAudioOnly = !!launch.baseAudioOnly;
        }

        // Apply stacked layers first.
        Object.keys(hxState.layers).forEach((k) => {
          hxState.layers[k] = false;
        });
        if (Array.isArray(launch.stackedLayers)) {
          const ids = launch.stackedLayers.map((x) => String(x).toLowerCase());
          Object.keys(hxState.layers).forEach((k) => {
            hxState.layers[k] = ids.includes(k);
          });
        }

        const mode = (launch.mode || '').toLowerCase();
        if (mode) {
          applyRequestedModeToHx(mode);
        }
        if (typeof launch.loopEnabled === 'boolean') {
          hxState.loopEnd = !!launch.loopEnabled;
        }
      }
    }
  } catch (e) {}

  // If URL carries a specific mode and no launch payload matched, treat it as an explicit hint.
  // This makes shared links behave predictably.
  try {
    const urlMode = new URLSearchParams(location.search).get('mode');
    if (urlMode) {
      applyRequestedModeToHx(urlMode);
    }
  } catch (e) {}

  syncHxUiFromState();
}

function saveHxState() {
  try {
    localStorage.setItem(
      HX_STORAGE_KEY,
      JSON.stringify({
        enabled: hxState.enabled,
        mode: hxState.mode,
        jumpProb: hxState.jumpProb,
        loopEnd: hxState.loopEnd,
        canonVoiceCount: hxState.canonVoiceCount,
        overlayMix: hxState.overlayMix,
        baseAudioOnly: hxState.baseAudioOnly,
        layers: hxState.layers,
        dopamineTop: hxState.dopamineTop,
        dopamineWindow: hxState.dopamineWindow,
        trapWindow: hxState.trapWindow,
        trapStrength: hxState.trapStrength,
        phaseRate: hxState.phaseRate,
        phaseDepth: hxState.phaseDepth,
        freezeChance: hxState.freezeChance,
        freezeRepeats: hxState.freezeRepeats,
        veloBase: hxState.veloBase,
        veloAmt: hxState.veloAmt,
      }),
    );
  } catch (e) {}
}

function syncHxUiFromState() {
  if (!dom.hxEnabled) return;
  dom.hxEnabled.checked = !!hxState.enabled;
  if (dom.hxMode) {
    let modeValue = hxState.mode || 'off';
    if (modeValue === 'off') {
      const special = ['dopamine', 'harmonictrap', 'phaseshifter', 'granularfreeze', 'elasticvelo'];
      const enabledSpecial = special.filter((k) => !!hxState.layers?.[k]);
      if (enabledSpecial.length === 1) {
        modeValue = enabledSpecial[0];
      }
    }
    dom.hxMode.value = modeValue;
  }
  if (dom.hxJumpProb) dom.hxJumpProb.value = String(hxState.jumpProb);
  if (dom.hxLoopEnd) dom.hxLoopEnd.value = hxState.loopEnd ? '1' : '0';
  if (dom.hxCanonVoices) dom.hxCanonVoices.value = String(hxState.canonVoiceCount || 2);
  if (dom.hxOverlayMix) dom.hxOverlayMix.value = String(hxState.overlayMix);
  if (dom.hxBaseAudioOnly) dom.hxBaseAudioOnly.checked = !!hxState.baseAudioOnly;

  if (dom.hxDopamine) dom.hxDopamine.checked = !!hxState.layers.dopamine;
  if (dom.hxTrap) dom.hxTrap.checked = !!hxState.layers.harmonictrap;
  if (dom.hxPhase) dom.hxPhase.checked = !!hxState.layers.phaseshifter;
  if (dom.hxFreeze) dom.hxFreeze.checked = !!hxState.layers.granularfreeze;
  if (dom.hxVelo) dom.hxVelo.checked = !!hxState.layers.elasticvelo;

  if (dom.hxDopamineTop) dom.hxDopamineTop.value = String(hxState.dopamineTop);
  if (dom.hxDopamineWindow) dom.hxDopamineWindow.value = String(hxState.dopamineWindow);
  if (dom.hxTrapWindow) dom.hxTrapWindow.value = String(hxState.trapWindow);
  if (dom.hxTrapStrength) dom.hxTrapStrength.value = String(hxState.trapStrength);
  if (dom.hxPhaseRate) dom.hxPhaseRate.value = String(hxState.phaseRate);
  if (dom.hxPhaseDepth) dom.hxPhaseDepth.value = String(hxState.phaseDepth);
  if (dom.hxFreezeChance) dom.hxFreezeChance.value = String(hxState.freezeChance);
  if (dom.hxFreezeRepeats) dom.hxFreezeRepeats.value = String(hxState.freezeRepeats);
  if (dom.hxVeloBase) dom.hxVeloBase.value = String(hxState.veloBase);
  if (dom.hxVeloAmt) dom.hxVeloAmt.value = String(hxState.veloAmt);
}

function syncHxStateFromUi() {
  if (!dom.hxEnabled) return;
  hxState.enabled = !!dom.hxEnabled.checked;
  const requestedMode = (dom.hxMode?.value || 'off').toLowerCase();
  hxState.mode = requestedMode;
  hxState.jumpProb = Number(dom.hxJumpProb?.value || 0);
  hxState.loopEnd = (dom.hxLoopEnd?.value || '1') === '1';
  hxState.canonVoiceCount = Math.max(2, Math.min(8, Math.round(Number(dom.hxCanonVoices?.value || 2))));
  hxState.overlayMix = Math.max(0, Math.min(1, Number(dom.hxOverlayMix?.value || 0.45)));
  hxState.baseAudioOnly = !!dom.hxBaseAudioOnly?.checked;

  const special = ['dopamine', 'harmonictrap', 'phaseshifter', 'granularfreeze', 'elasticvelo'];
  if (special.includes(requestedMode)) {
    hxState.mode = 'off';
    hxState.layers[requestedMode] = true;
    hxState.enabled = true;
  }

  hxState.layers.dopamine = !!dom.hxDopamine?.checked;
  hxState.layers.harmonictrap = !!dom.hxTrap?.checked;
  hxState.layers.phaseshifter = !!dom.hxPhase?.checked;
  hxState.layers.granularfreeze = !!dom.hxFreeze?.checked;
  hxState.layers.elasticvelo = !!dom.hxVelo?.checked;

  hxState.dopamineTop = Number(dom.hxDopamineTop?.value || 0.12);
  hxState.dopamineWindow = Number(dom.hxDopamineWindow?.value || 48);
  hxState.trapWindow = Number(dom.hxTrapWindow?.value || 64);
  hxState.trapStrength = Number(dom.hxTrapStrength?.value || 0.55);
  hxState.phaseRate = Number(dom.hxPhaseRate?.value || 0.6);
  hxState.phaseDepth = Number(dom.hxPhaseDepth?.value || 8);
  hxState.freezeChance = Number(dom.hxFreezeChance?.value || 0.2);
  hxState.freezeRepeats = Number(dom.hxFreezeRepeats?.value || 6);
  hxState.veloBase = Number(dom.hxVeloBase?.value || 1.0);
  hxState.veloAmt = Number(dom.hxVeloAmt?.value || 0.25);
}

function buildBeatFeatures(analysis) {
  const beats = Array.isArray(analysis?.beats) ? analysis.beats : [];
  const segments = Array.isArray(analysis?.segments) ? analysis.segments : [];

  const beatEnergy = new Array(beats.length).fill(0);
  const beatPitch = new Array(beats.length).fill(null).map(() => new Float32Array(12));

  // Map segments -> beats with a two-pointer walk.
  let segIdx = 0;
  for (let bi = 0; bi < beats.length; bi++) {
    const b0 = beats[bi].start || 0;
    const b1 = b0 + (beats[bi].duration || 0);

    while (segIdx < segments.length && (segments[segIdx].start || 0) + (segments[segIdx].duration || 0) < b0) {
      segIdx++;
    }

    let j = segIdx;
    let eSum = 0;
    let wSum = 0;
    const p = beatPitch[bi];

    while (j < segments.length) {
      const s0 = segments[j].start || 0;
      const s1 = s0 + (segments[j].duration || 0);
      if (s0 > b1) break;

      const overlap = Math.max(0, Math.min(b1, s1) - Math.max(b0, s0));
      if (overlap > 0) {
        const loud = segments[j].loudness_max;
        // Loudness is typically negative; map to a rough energy 0..1-ish.
        const energy = typeof loud === 'number' ? Math.exp((loud + 30) / 20) : 0.2;
        eSum += energy * overlap;
        wSum += overlap;
        const pitches = segments[j].pitches;
        if (Array.isArray(pitches) && pitches.length === 12) {
          for (let k = 0; k < 12; k++) p[k] += pitches[k] * overlap;
        }
      }
      j++;
    }

    if (wSum > 0) {
      beatEnergy[bi] = eSum / wSum;
      for (let k = 0; k < 12; k++) beatPitch[bi][k] /= wSum;
    } else {
      beatEnergy[bi] = 0;
    }
  }

  // Normalize energy to 0..1
  let minE = Infinity;
  let maxE = -Infinity;
  for (let i = 0; i < beatEnergy.length; i++) {
    const v = beatEnergy[i];
    if (!isFinite(v)) continue;
    minE = Math.min(minE, v);
    maxE = Math.max(maxE, v);
  }
  const span = Math.max(1e-6, maxE - minE);
  for (let i = 0; i < beatEnergy.length; i++) {
    beatEnergy[i] = (beatEnergy[i] - minE) / span;
  }

  // Peak set (top X%)
  const pairs = beatEnergy.map((v, i) => ({ v, i }));
  pairs.sort((a, b) => b.v - a.v);
  const topCount = Math.max(4, Math.floor(pairs.length * hxState.dopamineTop));
  const peaks = new Set(pairs.slice(0, topCount).map((p) => p.i));

  // Canon overlays (multi-voice mapping).
  const canonOverlays = new Array(beats.length).fill(null).map(() => []);
  const voiceCount = Math.max(2, Math.min(8, Math.round(hxState.canonVoiceCount || 2)));
  const overlayCount = Math.max(0, voiceCount - 1);
  const canonAlignment = analysis?.canon_alignment;
  const canonPairs =
    Array.isArray(canonAlignment?.pairs) && canonAlignment.pairs.length === beats.length ? canonAlignment.pairs : null;
  const canonCandidates = analysis?.canon_candidates;
  const globalOffsets = Array.isArray(analysis?.global_voice_offsets) ? analysis.global_voice_offsets.slice(0) : [];
  const fallbackOffsets = [4, -4, 2, 8, -8, 6, 12, -12];
  while (globalOffsets.length < Math.max(0, overlayCount - 1) && globalOffsets.length < fallbackOffsets.length) {
    globalOffsets.push(fallbackOffsets[globalOffsets.length]);
  }

  const beatsPerBar = 4;
  const wrap = (idx) => {
    if (!beats.length) return 0;
    let x = Math.round(idx);
    x %= beats.length;
    if (x < 0) x += beats.length;
    return x;
  };

  function pickCandidateWithBarOffset(beatIdx, barOffset) {
    const list = canonCandidates?.[beatIdx] || canonCandidates?.[String(beatIdx)];
    if (!Array.isArray(list) || !list.length) return null;
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c || c.bar_offset !== barOffset || typeof c.target !== 'number') continue;
      if (!best || (c.score || 0) > (best.score || 0)) best = c;
    }
    return best && typeof best.target === 'number' ? best.target : null;
  }

  for (let bi = 0; bi < beats.length; bi++) {
    if (overlayCount <= 0) {
      canonOverlays[bi] = [];
      continue;
    }

    const overlays = [];
    const baseOverlay = canonPairs ? canonPairs[bi] : null;
    overlays.push(typeof baseOverlay === 'number' ? wrap(baseOverlay) : wrap(bi + 16));

    for (let oi = 1; oi < overlayCount; oi++) {
      const barOffset = globalOffsets[oi - 1] ?? fallbackOffsets[(oi - 1) % fallbackOffsets.length] ?? 4;
      const picked = pickCandidateWithBarOffset(bi, barOffset);
      if (typeof picked === 'number') {
        overlays.push(wrap(picked));
      } else {
        overlays.push(wrap(bi + barOffset * beatsPerBar));
      }
    }

    canonOverlays[bi] = overlays;
  }

  return { beats, beatEnergy, beatPitch, peaks, canonOverlays };
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na <= 1e-8 || nb <= 1e-8) return 0;
  return dot / Math.sqrt(na * nb);
}

function findBeatIndexForTime(beats, t) {
  // Binary search by start time.
  let lo = 0;
  let hi = beats.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b0 = beats[mid].start || 0;
    const b1 = b0 + (beats[mid].duration || 0);
    if (t < b0) hi = mid - 1;
    else if (t > b1) lo = mid + 1;
    else return mid;
  }
  return Math.max(0, Math.min(beats.length - 1, lo));
}

function chooseCandidateIndex(currentIndex) {
  const analysis = currentTrackAnalysis?.analysis;
  if (!analysis) return null;

  const mode = hxState.mode;
  if (mode === 'canon') {
    const list = analysis.canon_candidates?.[currentIndex] || analysis.canon_candidates?.[String(currentIndex)];
    if (!Array.isArray(list) || !list.length) return null;
    const best = list.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a), list[0]);
    return typeof best.target === 'number' ? best.target : null;
  }

  if (mode === 'eternal') {
    const list = analysis.eternal_loop_candidates?.[currentIndex] || analysis.eternal_loop_candidates?.[String(currentIndex)];
    if (!Array.isArray(list) || !list.length) return null;
    const best = list.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a), list[0]);
    return typeof best.target === 'number' ? best.target : null;
  }

  if (mode === 'jukebox') {
    const edges = Array.isArray(analysis.loop_candidates) ? analysis.loop_candidates : [];
    const local = edges.filter((e) => e && e.source === currentIndex && typeof e.target === 'number');
    if (!local.length) return null;
    const pick = local[Math.floor(Math.random() * local.length)];
    return pick.target;
  }

  return null;
}

function applyStackLayers(currentIndex, proposedIndex) {
  let idx = proposedIndex;
  const beatsLen = hxRuntime.beats.length;

  // Granular freeze: loop current beat for N repeats when chance hits.
  if (hxState.layers.granularfreeze) {
    if (hxRuntime.freezeRemaining > 0) {
      hxRuntime.freezeRemaining--;
      return currentIndex;
    }
    if (Math.random() < hxState.freezeChance && hxRuntime.beatEnergy[currentIndex] < 0.35) {
      hxRuntime.freezeRemaining = Math.max(0, Math.floor(hxState.freezeRepeats) - 1);
      return currentIndex;
    }
  }

  // Phase shifter: drifting index offset.
  if (hxState.layers.phaseshifter) {
    const depth = Math.floor(hxState.phaseDepth);
    const rate = hxState.phaseRate;
    const off = depth > 0 ? Math.floor(Math.sin(hxRuntime.lastSeekAt * 0.001 * rate + performance.now() * 0.0001) * depth) : 0;
    idx = idx + off;
  }

  // Dopamine miner: snap to nearest peak within a window.
  if (hxState.layers.dopamine) {
    const windowBeats = Math.floor(hxState.dopamineWindow);
    if (!hxRuntime.peaks.has(idx)) {
      let best = null;
      let bestDist = Infinity;
      const lo = Math.max(0, idx - windowBeats);
      const hi = Math.min(beatsLen - 1, idx + windowBeats);
      for (let i = lo; i <= hi; i++) {
        if (!hxRuntime.peaks.has(i)) continue;
        const d = Math.abs(i - idx);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (best !== null) idx = best;
    }
  }

  // Harmonic trap: snap toward beats with similar pitch profile.
  if (hxState.layers.harmonictrap) {
    if (!hxRuntime.trapTarget) {
      hxRuntime.trapTarget = hxRuntime.beatPitch[currentIndex];
    }
    const windowBeats = Math.floor(hxState.trapWindow);
    const strength = hxState.trapStrength;
    const lo = Math.max(0, idx - windowBeats);
    const hi = Math.min(beatsLen - 1, idx + windowBeats);
    let bestIdx = idx;
    let bestSim = -1;
    const target = hxRuntime.trapTarget;
    for (let i = lo; i <= hi; i++) {
      const sim = cosineSimilarity(target, hxRuntime.beatPitch[i]);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }
    if (bestSim > 0 && Math.random() < strength) {
      idx = bestIdx;
    }
  }

  idx = Math.max(0, Math.min(beatsLen - 1, Math.round(idx)));
  return idx;
}

function hxRestart() {
  const audio = audioEngine.audioElement;
  if (!audio || !hxRuntime.beats.length) return;
  try {
    audio.playbackRate = 1.0;
  } catch (e) {}
  hxRuntime.freezeRemaining = 0;
  hxRuntime.trapTarget = null;
  hxRuntime.currentBeatIndex = 0;
  audio.currentTime = 0;
  hxRuntime.lastSeekAt = performance.now();
}

function hxTick() {
  if (!hxRuntime.active) return;
  const audio = audioEngine.audioElement;
  if (!audio || audio.paused || !hxRuntime.beats.length) return;

  // Elastic velo: energy -> playbackRate
  if (hxState.layers.elasticvelo) {
    const e = hxRuntime.beatEnergy[hxRuntime.currentBeatIndex] || 0;
    const base = hxState.veloBase;
    const amt = hxState.veloAmt;
    const rate = Math.max(0.5, Math.min(2.0, base + (e - 0.5) * 2.0 * amt));
    if (isFinite(rate) && Math.abs((audio.playbackRate || 1) - rate) > 0.001) {
      try {
        audio.playbackRate = rate;
      } catch (e) {}
    }
  } else {
    if (audio.playbackRate !== 1) {
      try {
        audio.playbackRate = 1.0;
      } catch (e) {}
    }
  }

  const t = audio.currentTime || 0;
  const idx = findBeatIndexForTime(hxRuntime.beats, t);
  hxRuntime.currentBeatIndex = idx;

  const beat = hxRuntime.beats[idx];
  const end = (beat.start || 0) + (beat.duration || 0);
  const margin = 0.012 + (beat.duration || 0) * 0.08;

  if (t >= end - margin) {
    const beatsLen = hxRuntime.beats.length;
    let next = idx + 1;

    if (next >= beatsLen) {
      if (!hxState.loopEnd) return;
      next = 0;
    }

    if (hxState.enabled && hxState.mode !== 'off' && Math.random() < hxState.jumpProb) {
      const cand = chooseCandidateIndex(idx);
      if (typeof cand === 'number' && isFinite(cand)) next = cand;
    }

    if (hxState.enabled) {
      next = applyStackLayers(idx, next);
    }

    const now = performance.now();
    if (now - hxRuntime.lastSeekAt < 60) return; // avoid seek storms
    hxRuntime.lastSeekAt = now;

    const targetBeat = hxRuntime.beats[next];
    const targetTime = targetBeat?.start;
    if (typeof targetTime === 'number' && isFinite(targetTime)) {
      audio.currentTime = Math.max(0, targetTime);
      hxRuntime.currentBeatIndex = next;
    }
  }
}

async function ensureAnalyzers() {
  if (!audioEngine.getAnalyser()) return;
  if (!frequencyAnalyzer.isInitialized) {
    frequencyAnalyzer.init(audioEngine.getAnalyser(), audioEngine.getSampleRate());
  }
  if (!beatDetector.isInitialized) {
    beatDetector.init(frequencyAnalyzer);
  }
}

async function ensureAudioUnlocked() {
  if (audioUnlocked && audioEngine.context && audioEngine.context.state === 'running') {
    await ensureAnalyzers();
    return true;
  }
  try {
    await audioEngine.init();
    await audioEngine.resume();
    await ensureAnalyzers();
    audioUnlocked = true;
    if (dom.autoplayHint) dom.autoplayHint.hidden = true;
    return true;
  } catch (err) {
    if (dom.autoplayHint) dom.autoplayHint.hidden = false;
    return false;
  }
}

document.addEventListener('pointerdown', async () => {
  if (externalAudioReceiver.enabled) return;
  const ok = await ensureAudioUnlocked();
  if (ok && pendingTrackToPlay) {
    const next = pendingTrackToPlay;
    pendingTrackToPlay = null;
    playTrackById(next.id, { queueIndex: next.queueIndex });
  }
});

async function loadTrackAnalysis(trackId) {
  const url = resolveApiUrl(`data/${encodeURIComponent(trackId)}.json`);
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to load track analysis');
  const data = await res.json();
  const track = data?.response?.track || {};
  const analysis = track?.analysis || {};
  return {
    trackId,
    title: track.title || 'Unknown Track',
    artist: track.artist || 'Unknown Artist',
    audioUrl: track.audio_url || track.audioUrl || `/media/${trackId}.mp3`,
    analysis,
  };
}

// =====================================
// MULTI-VOICE CANON PLAYBACK (audio-only)
// =====================================

const overlayRig = {
  url: null,
  overlays: [], // HTMLAudioElements
  sources: [], // MediaElementAudioSourceNodes
  gains: [], // GainNodes (pre-analyser)
};

function teardownOverlayVoices() {
  try {
    overlayRig.sources.forEach((src) => {
      try {
        src.disconnect();
      } catch (e) {}
    });
    overlayRig.gains.forEach((g) => {
      try {
        g.disconnect();
      } catch (e) {}
    });
    overlayRig.overlays.forEach((el) => {
      try {
        el.pause();
        el.src = '';
      } catch (e) {}
    });
  } finally {
    overlayRig.url = null;
    overlayRig.overlays = [];
    overlayRig.sources = [];
    overlayRig.gains = [];
  }
}

function getDesiredOverlayCount() {
  const isCanon = currentAlgorithm === 'canon' || hxState.mode === 'canon';
  if (!isCanon) return 0;
  const voices = Math.max(2, Math.min(8, Math.round(hxState.canonVoiceCount || 2)));
  return Math.max(0, voices - 1);
}

function applyOverlayMix() {
  const count = overlayRig.gains.length;
  if (!count) return;
  const muted = !!hxState.baseAudioOnly;
  const total = muted ? 0 : Math.max(0, Math.min(1, hxState.overlayMix ?? 0.45));
  const per = count ? total / Math.sqrt(count) : 0;
  for (let i = 0; i < count; i++) {
    const g = overlayRig.gains[i];
    if (!g) continue;
    try {
      g.gain.value = per;
    } catch (e) {}
  }
}

async function ensureOverlayVoices(url) {
  const desired = getDesiredOverlayCount();
  if (desired <= 0) {
    teardownOverlayVoices();
    return;
  }

  const analyser = audioEngine.getAnalyser();
  const ctx = audioEngine.context;
  if (!ctx || !analyser) return;

  if (overlayRig.url === url && overlayRig.overlays.length === desired) {
    applyOverlayMix();
    return;
  }

  teardownOverlayVoices();
  overlayRig.url = url;

  for (let i = 0; i < desired; i++) {
    const el = new Audio(url);
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.loop = false;
    const src = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(analyser);
    overlayRig.overlays.push(el);
    overlayRig.sources.push(src);
    overlayRig.gains.push(gain);
  }

  applyOverlayMix();
}

async function syncOverlayPlayback() {
  const base = audioEngine.audioElement;
  if (!base || !overlayRig.overlays.length) return;

  if (base.paused) {
    overlayRig.overlays.forEach((el) => {
      try {
        el.pause();
      } catch (e) {}
    });
    return;
  }

  // Align playback state without fighting browser autoplay restrictions.
  for (const el of overlayRig.overlays) {
    if (!el) continue;
    if (!el.paused) continue;
    try {
      await el.play();
    } catch (e) {
      // If overlays are blocked, they will start once the user interacts again.
    }
  }
}

async function playTrackById(trackId, { queueIndex = null } = {}) {
  if (externalAudioReceiver.enabled) {
    currentTrackId = trackId;
    if (dom.trackMeta) dom.trackMeta.textContent = trackId ? `External audio • ${trackId}` : 'External audio • linked';
    return;
  }
  currentTrackId = trackId;

  const unlocked = await ensureAudioUnlocked();
  if (!unlocked) {
    pendingTrackToPlay = { id: trackId, queueIndex };
    return;
  }

  const launchPlayback =
    pendingLaunchPlayback && pendingLaunchPlayback.trackId && pendingLaunchPlayback.trackId === trackId
      ? pendingLaunchPlayback
      : null;
  if (launchPlayback) pendingLaunchPlayback = null;

  let analysis;
  try {
    analysis = await loadTrackAnalysis(trackId);
  } catch (err) {
    console.warn('[HV] Analysis load failed, using fallback audio URL', err);
    analysis = { trackId, title: 'Unknown Track', artist: 'Unknown Artist', audioUrl: `/media/${trackId}.mp3` };
  }

  try {
    await audioEngine.loadURL(resolveApiUrl(analysis.audioUrl, false), {
      autoplay: launchPlayback ? !!launchPlayback.wasPlaying : true,
      startTime: launchPlayback ? launchPlayback.startTimeSeconds : null,
    });
  } catch (err) {
    if (err && err.name === 'NotAllowedError') {
      pendingTrackToPlay = { id: trackId, queueIndex };
      if (dom.autoplayHint) dom.autoplayHint.hidden = false;
      return;
    }
    console.error('[HV] Failed to play track', err);
    throw err;
  }

  if (dom.trackMeta) {
    dom.trackMeta.textContent = `${analysis.title} · ${analysis.artist}`;
  }

  // Prepare Harmonizer-driver features for this track.
  currentTrackAnalysis = analysis;
  try {
    const feats = buildBeatFeatures(analysis.analysis);
    hxRuntime.beats = feats.beats;
    hxRuntime.beatEnergy = feats.beatEnergy;
    hxRuntime.beatPitch = feats.beatPitch;
    hxRuntime.peaks = feats.peaks;
    hxRuntime.canonOverlays = feats.canonOverlays || [];
    hxRuntime.trapTarget = null;
    hxRuntime.freezeRemaining = 0;
    hxRuntime.currentBeatIndex = 0;
    hxRuntime.lastSeekAt = performance.now();
  } catch (e) {
    hxRuntime.beats = [];
    hxRuntime.beatEnergy = [];
    hxRuntime.beatPitch = [];
    hxRuntime.peaks = new Set();
    hxRuntime.canonOverlays = [];
  }

  // Keep URL in sync so refresh/deep-link works.
  try {
    const params = new URLSearchParams(location.search);
    params.set('trid', trackId);
    if (currentAlgorithm) params.set('mode', currentAlgorithm);
    history.replaceState({}, '', `${location.pathname}?${params.toString()}`);
  } catch (e) {}

  if (queueIndex !== null) {
    currentQueueIndex = queueIndex;
    autoPlayNext = true;
    renderQueueList();
  }
}

// Auto-advance queue on ended (local playback only).
eventBus.on(Events.AUDIO_ENDED, () => {
  if (autoPlayNext) {
    playNextInQueue();
  }
});

// =====================================
// QUEUE (shared localStorage)
// =====================================

const QUEUE_STORAGE_KEY = 'harmonizerTrackQueue';
let trackQueue = [];
let currentQueueIndex = -1;

function persistQueue() {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(trackQueue));
  } catch (e) {}
}

function loadPersistedQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    trackQueue = parsed
      .filter((t) => t && t.id)
      .map((t) => ({ id: t.id, title: t.title || 'Unknown Track', artist: t.artist || 'Unknown Artist' }));
  } catch (e) {}
}

// Keep queue in sync if modified by Harmonizer in another tab/window.
window.addEventListener('storage', (e) => {
  if (e && e.key === QUEUE_STORAGE_KEY) {
    loadPersistedQueue();
    if (dom.libraryModal && !dom.libraryModal.hidden) {
      renderQueueList();
    }
  }
});

function addToQueue(track) {
  trackQueue.push({
    id: track.id,
    title: track.title || 'Unknown Track',
    artist: track.artist || 'Unknown Artist',
  });
  persistQueue();
  renderQueueList();
}

function clearQueue() {
  trackQueue = [];
  currentQueueIndex = -1;
  autoPlayNext = false;
  persistQueue();
  renderQueueList();
}

function playQueueIndex(index) {
  if (index < 0 || index >= trackQueue.length) return false;
  autoPlayNext = true;
  currentQueueIndex = index;
  playTrackById(trackQueue[index].id, { queueIndex: index });
  return true;
}

function playNextInQueue() {
  if (!trackQueue.length) return false;
  const next = currentQueueIndex === -1 ? 0 : currentQueueIndex + 1;
  if (next >= trackQueue.length) {
    autoPlayNext = false;
    return false;
  }
  return playQueueIndex(next);
}

// =====================================
// SONG LIBRARY + UPLOAD
// =====================================

let cachedTracks = [];

async function fetchCachedTracks() {
  const res = await fetch(resolveApiUrl('api/cache/list', false));
  const data = await res.json().catch(() => ({}));
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  cachedTracks = tracks
    .map((t) => ({
      id: t.trackId || t.track_id || t.id,
      title: t.title || 'Unknown Track',
      artist: t.artist || 'Unknown Artist',
      duration: t.duration || 0,
    }))
    .filter((t) => t.id);
}

function openLibrary(tab = 'songs') {
  dom.libraryModal.hidden = false;
  switchLibraryTab(tab);
}

function closeLibrary() {
  dom.libraryModal.hidden = true;
}

function switchLibraryTab(tab) {
  const isSongs = tab === 'songs';
  dom.tabSongs.classList.toggle('active', isSongs);
  dom.tabQueue.classList.toggle('active', !isSongs);
  dom.paneSongs.hidden = !isSongs;
  dom.paneQueue.hidden = isSongs;
  if (isSongs) {
    renderSongsList(dom.songSearch.value || '');
  } else {
    renderQueueList();
  }
}

function renderSongsList(filterText = '') {
  const q = filterText.toLowerCase().trim();
  const filtered = q
    ? cachedTracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q))
    : cachedTracks;

  dom.songsList.innerHTML = '';
  if (!filtered.length) {
    dom.songsList.innerHTML = '<div class="hv-empty">No songs yet.</div>';
    return;
  }

  for (const track of filtered) {
    const item = document.createElement('div');
    item.className = 'hv-list-item';
    item.dataset.id = track.id;

    const meta = document.createElement('div');
    meta.className = 'hv-list-item__meta';
    meta.innerHTML = `<div class="hv-list-item__title">${track.title}</div><div class="hv-list-item__subtitle">${track.artist}</div>`;

    const actions = document.createElement('div');
    actions.className = 'hv-list-item__actions';

    const playBtn = document.createElement('button');
    playBtn.className = 'hv-btn small';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => {
      closeLibrary();
      playTrackById(track.id);
    });

    const queueBtn = document.createElement('button');
    queueBtn.className = 'hv-btn small';
    queueBtn.textContent = 'Add to Queue';
    queueBtn.addEventListener('click', () => addToQueue(track));

    actions.append(playBtn, queueBtn);
    item.append(meta, actions);
    dom.songsList.appendChild(item);
  }
}

function renderQueueList() {
  dom.queueList.innerHTML = '';
  if (!trackQueue.length) {
    dom.queueList.innerHTML = '<div class="hv-empty">Queue is empty.</div>';
    return;
  }

  trackQueue.forEach((track, index) => {
    const item = document.createElement('div');
    item.className = 'hv-list-item';
    item.draggable = true;
    item.dataset.index = String(index);

    const meta = document.createElement('div');
    meta.className = 'hv-list-item__meta';
    meta.innerHTML = `<div class="hv-list-item__title">${index + 1}. ${track.title}</div><div class="hv-list-item__subtitle">${track.artist}</div>`;

    const actions = document.createElement('div');
    actions.className = 'hv-list-item__actions';

    const playBtn = document.createElement('button');
    playBtn.className = 'hv-btn small';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => {
      closeLibrary();
      playQueueIndex(index);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'hv-btn small ghost';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      trackQueue.splice(index, 1);
      if (currentQueueIndex >= trackQueue.length) currentQueueIndex = trackQueue.length - 1;
      persistQueue();
      renderQueueList();
    });

    actions.append(playBtn, removeBtn);
    item.append(meta, actions);

    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      const to = index;
      if (Number.isNaN(from) || from === to) return;
      const moved = trackQueue.splice(from, 1)[0];
      trackQueue.splice(to, 0, moved);
      persistQueue();
      renderQueueList();
    });

    dom.queueList.appendChild(item);
  });
}

async function pollProcessJob(jobId, fallbackTitle, fallbackArtist) {
  let attempt = 0;
  const maxAttempts = 900;
  while (attempt < maxAttempts) {
    attempt++;
    let statusRes;
    try {
      statusRes = await fetch(resolveApiUrl(`api/process/status/${encodeURIComponent(jobId)}`, false));
    } catch (e) {
      await delay(Math.min(5000, 400 * attempt));
      continue;
    }
    const statusData = await statusRes.json().catch(() => ({}));
    if (statusRes.ok && statusData) {
      if (statusData.status === 'completed' && statusData.result && statusData.result.trackId) {
        return {
          ok: true,
          trackId: statusData.result.trackId,
          title: statusData.result.title || fallbackTitle,
          artist: statusData.result.artist || fallbackArtist,
        };
      }
      if (statusData.status === 'failed') {
        return { ok: false, shouldRetry: true, error: statusData.error || 'Processing failed' };
      }
    }
    await delay(Math.min(5000, 600 + 250 * attempt));
  }
  return { ok: false, shouldRetry: true, error: 'Processing timeout' };
}

async function processUploadFile(file) {
  const formData = new FormData();
  formData.append('source', 'upload');
  formData.append('algorithm', currentAlgorithm);
  formData.append('audio', file);

  let response;
  try {
    response = await fetch(resolveApiUrl('api/process', false), { method: 'POST', body: formData });
  } catch (e) {
    return { ok: false, shouldRetry: true, error: e.message || 'Network error' };
  }

  const data = await response.json().catch(() => ({}));

  if (response.ok) {
    if (data && data.jobId && data.status === 'processing') {
      return await pollProcessJob(data.jobId, data.title || file.name, data.artist || 'Upload');
    }
    if (data && data.trackId) {
      return { ok: true, trackId: data.trackId, title: data.title || file.name, artist: data.artist || 'Upload' };
    }
  }

  const errorMessage = data.error || 'Failed to process track';
  const shouldRetry = !(response.status >= 400 && response.status < 500 && response.status !== 429);
  return { ok: false, shouldRetry, error: errorMessage };
}

async function processUploadQueue(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let attempt = 0;
    while (true) {
      attempt++;
      if (dom.uploadStatus) {
        dom.uploadStatus.textContent = `Processing ${i + 1}/${files.length}: ${file.name} (attempt ${attempt})`;
      }
      const result = await processUploadFile(file);
      if (result.ok) {
        addToQueue({ id: result.trackId, title: result.title, artist: result.artist });
        break;
      }
      if (!result.shouldRetry) {
        throw new Error(result.error);
      }
      if (dom.uploadStatus) {
        dom.uploadStatus.textContent = `Retrying ${file.name}... ${result.error}`;
      }
      await delay(Math.min(10000, 1000 * attempt));
    }
  }
}

async function handleUploadFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  if (list.length > 40) {
    if (dom.uploadStatus) dom.uploadStatus.textContent = 'Please select 40 files or fewer.';
    return;
  }
  if (dom.uploadStatus) dom.uploadStatus.textContent = 'Uploading...';
  try {
    await processUploadQueue(list);
    await fetchCachedTracks();
    renderSongsList(dom.songSearch.value || '');
    if (dom.uploadStatus) dom.uploadStatus.textContent = 'Upload complete.';
  } catch (err) {
    if (dom.uploadStatus) dom.uploadStatus.textContent = err.message || 'Upload failed.';
  }
}

// =====================================
// THEME + EFFECTS + CONTROLS
// =====================================

const THEME_STORAGE_KEY = VISUALIZER_STORAGE.theme;

function applyTheme(themeId, primary, secondary, tertiary) {
  const theme = THEMES[themeId] || THEMES.cyber;
  const p = primary || theme.primary;
  const s = secondary || theme.secondary;
  const t = tertiary || '#ffffff';

  document.documentElement.style.setProperty('--hv-accent', p);
  document.documentElement.style.setProperty('--hv-accent-2', s);
  document.documentElement.style.setProperty('--hv-border', `${p}88`);
  document.documentElement.style.setProperty('--hv-accent-soft', `${p}22`);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ themeId, primary: p, secondary: s, tertiary: t }));
  } catch (e) {}

  applyThemeToVisualizer(p, t, s);
}

function applyThemeToVisualizer(primary, tertiary, secondary) {
  const viz = app.vizManager.getCurrent();
  if (!viz) return;

  const p = new THREE.Color(primary);
  const t = new THREE.Color(tertiary);
  const s = new THREE.Color(secondary);

  try {
    if (viz.colorPalettes && typeof viz.setColorPalette === 'function') {
      viz.colorPalettes.custom = { color1: p, color2: t, color3: s };
      viz.setColorPalette('custom');
    }

    if (viz.colorSchemes && typeof viz.setColorScheme === 'function') {
      const schemeKeys = Object.keys(viz.colorSchemes || {});
      const sample = schemeKeys.length ? viz.colorSchemes[schemeKeys[0]] : null;

      // Terrain-like: {low, mid, high, fog}; Galaxy-like: [Color,...]
      if (Array.isArray(sample)) {
        viz.colorSchemes.custom = [p, t, s, p.clone().lerp(s, 0.25)];
      } else {
        viz.colorSchemes.custom = {
          low: p,
          mid: t,
          high: s,
          fog: p.clone().multiplyScalar(0.35),
        };
      }

      viz.setColorScheme('custom');
    }

    const uniforms = viz.material?.uniforms;
    if (uniforms?.uColor1) uniforms.uColor1.value = p;
    if (uniforms?.uColor2) uniforms.uColor2.value = t;
    if (uniforms?.uColor3) uniforms.uColor3.value = s;
    if (uniforms?.uColorLow) uniforms.uColorLow.value = p;
    if (uniforms?.uColorMid) uniforms.uColorMid.value = t;
    if (uniforms?.uColorHigh) uniforms.uColorHigh.value = s;

    // Generic mesh material recolor (covers MeshStandardMaterial, Lines, Points, etc.)
    if (viz.container && typeof viz.container.traverse === 'function') {
      viz.container.traverse((obj) => {
        const material = obj.material;
        if (!material) return;

        const applyToMaterial = (mat) => {
          if (!mat) return;
          if (mat.color && mat.color.isColor) {
            mat.color.copy(p);
          }
          if (mat.emissive && mat.emissive.isColor) {
            mat.emissive.copy(s);
          }
          if (typeof mat.emissiveIntensity === 'number' && mat.emissiveIntensity === 0) {
            mat.emissiveIntensity = 0.6;
          }
          mat.needsUpdate = true;
        };

        if (Array.isArray(material)) {
          material.forEach(applyToMaterial);
        } else {
          applyToMaterial(material);
        }

        // Instanced meshes can have per-instance color; keep base tint.
        if (obj.isPoints && obj.material && obj.material.color) {
          obj.material.color.copy(s);
        }
        if (obj.isLine && obj.material && obj.material.color) {
          obj.material.color.copy(t);
        }
      });
    }
  } catch (e) {
    console.warn('[HV] Theme application failed', e);
  }
}

function loadSavedTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed) return;
    if (dom.themeSelect) dom.themeSelect.value = parsed.themeId || 'cyber';
    if (dom.colorPrimary) dom.colorPrimary.value = parsed.primary || THEMES.cyber.primary;
    if (dom.colorTertiary) dom.colorTertiary.value = parsed.tertiary || '#ffffff';
    if (dom.colorSecondary) dom.colorSecondary.value = parsed.secondary || THEMES.cyber.secondary;
    applyTheme(dom.themeSelect.value, dom.colorPrimary.value, dom.colorSecondary.value, dom.colorTertiary.value);
  } catch (e) {}
}

function applyEffectsFromUI() {
  if (!app.bloomPass || !app.postProcessor) return;

  app.bloomPass.enabled = !!dom.fxBloomToggle?.checked;
  app.bloomPass.strength = Number(dom.fxBloomStrength?.value || 0);
  app.bloomPass.radius = Number(dom.fxBloomRadius?.value || 0);
  app.bloomPass.threshold = Number(dom.fxBloomThreshold?.value || 0);

  app.postProcessor.setEnabled('chromatic', !!dom.fxChromaticToggle?.checked);
  app.postProcessor.passes.chromatic?.setIntensity(Number(dom.fxChromaticIntensity?.value || 0));
  app.postProcessor.passes.chromatic?.setOffset(Number(dom.fxChromaticOffset?.value || 0));

  app.postProcessor.setEnabled('glitch', !!dom.fxGlitchToggle?.checked);
  app.postProcessor.passes.glitch?.setIntensity(Number(dom.fxGlitchIntensity?.value || 0));
  if (app.postProcessor.passes.glitch?.uniforms?.uAmount) {
    app.postProcessor.passes.glitch.uniforms.uAmount.value = Number(dom.fxGlitchAmount?.value || 0);
  }
  if (app.postProcessor.passes.glitch?.uniforms?.uSpeed) {
    app.postProcessor.passes.glitch.uniforms.uSpeed.value = Number(dom.fxGlitchSpeed?.value || 0);
  }

  app.postProcessor.setEnabled('scanlines', !!dom.fxScanlinesToggle?.checked);
  app.postProcessor.passes.scanlines?.setIntensity(Number(dom.fxScanlinesIntensity?.value || 0));
  app.postProcessor.passes.scanlines?.setCount(Number(dom.fxScanlinesDensity?.value || 0));

  app.postProcessor.setEnabled('vignette', !!dom.fxVignetteToggle?.checked);
  app.postProcessor.passes.vignette?.setOffset(Number(dom.fxVignetteOffset?.value || 0));
  app.postProcessor.passes.vignette?.setDarkness(Number(dom.fxVignetteDarkness?.value || 0));

  app.postProcessor.setEnabled('filmGrain', !!dom.fxGrainToggle?.checked);
  app.postProcessor.passes.filmGrain?.setIntensity(Number(dom.fxGrainIntensity?.value || 0));

  app.postProcessor.setEnabled('colorGrade', !!dom.fxColorGradeToggle?.checked);
  app.postProcessor.passes.colorGrade?.setExposure(Number(dom.fxColorGradeExposure?.value || 1));
  app.postProcessor.passes.colorGrade?.setContrast(Number(dom.fxColorGradeContrast?.value || 1));
  app.postProcessor.passes.colorGrade?.setSaturation(Number(dom.fxColorGradeSaturation?.value || 1));
  const hueDeg = Number(dom.fxColorGradeHue?.value || 0);
  app.postProcessor.passes.colorGrade?.setHueRadians((hueDeg * Math.PI) / 180);
  app.postProcessor.passes.colorGrade?.setVibrance(Number(dom.fxColorGradeVibrance?.value || 0));
  // Tint uses the current Primary color picker for coherence
  if (dom.colorPrimary?.value) {
    app.postProcessor.passes.colorGrade?.setTint(dom.colorPrimary.value);
  }
  app.postProcessor.passes.colorGrade?.setTintStrength(Number(dom.fxColorGradeTint?.value || 0));

  app.postProcessor.setEnabled('pixelate', !!dom.fxPixelateToggle?.checked);
  app.postProcessor.passes.pixelate?.setPixelSize(Number(dom.fxPixelateSize?.value || 2));
  app.postProcessor.passes.pixelate?.setIntensity(Number(dom.fxPixelateIntensity?.value || 1));

  app.postProcessor.setEnabled('dotMatrix', !!dom.fxDotMatrixToggle?.checked);
  app.postProcessor.passes.dotMatrix?.setIntensity(Number(dom.fxDotMatrixIntensity?.value || 0));
  app.postProcessor.passes.dotMatrix?.setScale(Number(dom.fxDotMatrixScale?.value || 140));
  const dmAngle = Number(dom.fxDotMatrixAngle?.value || 0);
  app.postProcessor.passes.dotMatrix?.setAngleRadians((dmAngle * Math.PI) / 180);
  app.postProcessor.passes.dotMatrix?.setSoftness(Number(dom.fxDotMatrixSoftness?.value || 0.35));

  app.postProcessor.setEnabled('trails', !!dom.fxTrailsToggle?.checked);
  if (app.postProcessor.passes.trails?.uniforms?.damp) {
    app.postProcessor.passes.trails.uniforms.damp.value = Number(dom.fxTrailsDamp?.value || 0.92);
  }
}

function applyPreset(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) return;

  if (dom.vizSelect) dom.vizSelect.value = preset.vizId;
  app.vizManager.switchTo(preset.vizId, 'instant');
  writeStorage(VISUALIZER_STORAGE.vizId, preset.vizId);

  setTimeout(() => {
    Object.entries(preset.vizControls || {}).forEach(([key, val]) => app.vizManager.setControl(key, val));
    renderVisualizerControls();

    const themeId = preset.themeId || 'cyber';
    if (dom.themeSelect) dom.themeSelect.value = themeId;
    const theme = THEMES[themeId] || THEMES.cyber;
    if (dom.colorPrimary) dom.colorPrimary.value = theme.primary;
    if (dom.colorTertiary) dom.colorTertiary.value = '#ffffff';
    if (dom.colorSecondary) dom.colorSecondary.value = theme.secondary;
    applyTheme(themeId, theme.primary, theme.secondary, dom.colorTertiary?.value || '#ffffff');

    const fx = preset.effects || {};
    if (dom.fxBloomToggle) dom.fxBloomToggle.checked = !!fx.bloom?.enabled;
    if (dom.fxBloomStrength) dom.fxBloomStrength.value = fx.bloom?.strength ?? dom.fxBloomStrength.value;
    if (dom.fxBloomRadius) dom.fxBloomRadius.value = fx.bloom?.radius ?? dom.fxBloomRadius.value;
    if (dom.fxBloomThreshold) dom.fxBloomThreshold.value = fx.bloom?.threshold ?? dom.fxBloomThreshold.value;

    if (dom.fxChromaticToggle) dom.fxChromaticToggle.checked = !!fx.chromatic?.enabled;
    if (dom.fxChromaticIntensity) dom.fxChromaticIntensity.value = fx.chromatic?.intensity ?? dom.fxChromaticIntensity.value;
    if (dom.fxChromaticOffset) dom.fxChromaticOffset.value = fx.chromatic?.offset ?? dom.fxChromaticOffset.value;

    if (dom.fxGlitchToggle) dom.fxGlitchToggle.checked = !!fx.glitch?.enabled;
    if (dom.fxGlitchIntensity) dom.fxGlitchIntensity.value = fx.glitch?.intensity ?? dom.fxGlitchIntensity.value;
    if (dom.fxGlitchAmount) dom.fxGlitchAmount.value = fx.glitch?.amount ?? dom.fxGlitchAmount.value;
    if (dom.fxGlitchSpeed) dom.fxGlitchSpeed.value = fx.glitch?.speed ?? dom.fxGlitchSpeed.value;

    if (dom.fxScanlinesToggle) dom.fxScanlinesToggle.checked = !!fx.scanlines?.enabled;
    if (dom.fxScanlinesIntensity) dom.fxScanlinesIntensity.value = fx.scanlines?.intensity ?? dom.fxScanlinesIntensity.value;
    if (dom.fxScanlinesDensity) dom.fxScanlinesDensity.value = fx.scanlines?.density ?? dom.fxScanlinesDensity.value;

    if (dom.fxVignetteToggle) dom.fxVignetteToggle.checked = !!fx.vignette?.enabled;
    if (dom.fxVignetteOffset) dom.fxVignetteOffset.value = fx.vignette?.offset ?? dom.fxVignetteOffset.value;
    if (dom.fxVignetteDarkness) dom.fxVignetteDarkness.value = fx.vignette?.darkness ?? dom.fxVignetteDarkness.value;

    if (dom.fxGrainToggle) dom.fxGrainToggle.checked = !!fx.grain?.enabled;
    if (dom.fxGrainIntensity) dom.fxGrainIntensity.value = fx.grain?.intensity ?? dom.fxGrainIntensity.value;

    applyEffectsFromUI();
  }, 0);
}

function renderVisualizerControls() {
  const controls = app.vizManager.getCurrentControls();
  dom.vizControls.innerHTML = '';
  const entries = Object.entries(controls || {});
  if (!entries.length) {
    dom.vizControls.innerHTML = '<div class="hv-empty">No controls for this mode.</div>';
    return;
  }

  entries.forEach(([name, cfg]) => {
    const wrap = document.createElement('div');
    wrap.className = 'hv-control';

    const row = document.createElement('div');
    row.className = 'hv-control__row';
    row.textContent = cfg.label || name;

    if (cfg.type === 'range') {
      const valueSpan = document.createElement('span');
      valueSpan.textContent = String(cfg.value);
      row.appendChild(valueSpan);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = cfg.min;
      input.max = cfg.max;
      input.step = cfg.step ?? 0.1;
      input.value = cfg.value;
      input.addEventListener('input', () => {
        valueSpan.textContent = input.value;
        app.vizManager.setControl(name, Number(input.value));
      });

      wrap.append(row, input);
    } else if (cfg.type === 'toggle') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!cfg.value;
      input.addEventListener('change', () => app.vizManager.setControl(name, input.checked));
      row.appendChild(input);
      wrap.append(row);
    } else if (cfg.type === 'select') {
      const select = document.createElement('select');
      select.className = 'hv-select';
      (cfg.options || []).forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label || opt.value;
        if (opt.value === cfg.value) o.selected = true;
        select.appendChild(o);
      });
      select.addEventListener('change', () => app.vizManager.setControl(name, select.value));
      wrap.append(row, select);
    }

    dom.vizControls.appendChild(wrap);
  });
}

function bindUI() {
  function applyMainTab(tabId) {
    const normalized = (tabId || 'song').toLowerCase() === 'viz' ? 'viz' : 'song';
    const isSong = normalized === 'song';

    if (dom.mainPaneSong) dom.mainPaneSong.hidden = !isSong;
    if (dom.mainPaneViz) dom.mainPaneViz.hidden = isSong;

    if (dom.mainTabSong) {
      dom.mainTabSong.classList.toggle('active', isSong);
      dom.mainTabSong.setAttribute('aria-selected', isSong ? 'true' : 'false');
    }
    if (dom.mainTabViz) {
      dom.mainTabViz.classList.toggle('active', !isSong);
      dom.mainTabViz.setAttribute('aria-selected', !isSong ? 'true' : 'false');
    }
  }

  function setMainTab(tabId, { persist = true } = {}) {
    const normalized = (tabId || 'song').toLowerCase() === 'viz' ? 'viz' : 'song';
    applyMainTab(normalized);
    if (persist) writeStorage(MAIN_TAB_STORAGE_KEY, normalized);
  }

  // Hide UI toggle
  if (dom.hideUiBtn) {
    const savedHidden = readStorage(VISUALIZER_STORAGE.uiHidden, '0') === '1';
    dom.body.classList.toggle('hv-ui-hidden', savedHidden);
    dom.hideUiBtn.textContent = savedHidden ? 'Show UI' : 'Hide UI';

    dom.hideUiBtn.addEventListener('click', () => {
      const hidden = dom.body.classList.toggle('hv-ui-hidden');
      dom.hideUiBtn.textContent = hidden ? 'Show UI' : 'Hide UI';
      writeStorage(VISUALIZER_STORAGE.uiHidden, hidden ? '1' : '0');
    });
  }

  // Main (right panel) tabs: Song vs Visualizer
  if (dom.mainTabSong && dom.mainTabViz) {
    dom.mainTabSong.addEventListener('click', () => setMainTab('song'));
    dom.mainTabViz.addEventListener('click', () => setMainTab('viz'));
    const saved = (readStorage(MAIN_TAB_STORAGE_KEY, 'song') || 'song').toLowerCase();
    setMainTab(saved, { persist: false });
  }

  // Preset options
  if (dom.presetSelect) {
    Object.entries(PRESETS).forEach(([id, p]) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = p.label;
      dom.presetSelect.appendChild(opt);
    });
    dom.presetSelect.addEventListener('change', () => applyPreset(dom.presetSelect.value));
  }

  if (dom.vizSelect) {
    dom.vizSelect.addEventListener('change', async () => {
      const id = dom.vizSelect.value;
      await app.vizManager.switchTo(id, 'instant');
      writeStorage(VISUALIZER_STORAGE.vizId, id);
      // Recentre camera target so orbit/zoom doesn't drift into empty space.
      app.controls.target.set(0, 0, 0);
      app.controls.update();
      renderVisualizerControls();
      applyThemeToVisualizer(dom.colorPrimary.value, dom.colorTertiary?.value || '#ffffff', dom.colorSecondary.value);
      applyEffectsFromUI();
    });
  }

  // Effects listeners
  const effectInputs = [
    dom.fxBloomToggle, dom.fxBloomStrength, dom.fxBloomRadius, dom.fxBloomThreshold,
    dom.fxChromaticToggle, dom.fxChromaticIntensity, dom.fxChromaticOffset,
    dom.fxGlitchToggle, dom.fxGlitchIntensity, dom.fxGlitchAmount, dom.fxGlitchSpeed,
    dom.fxScanlinesToggle, dom.fxScanlinesIntensity, dom.fxScanlinesDensity,
    dom.fxVignetteToggle, dom.fxVignetteOffset, dom.fxVignetteDarkness,
    dom.fxGrainToggle, dom.fxGrainIntensity,
    dom.fxColorGradeToggle, dom.fxColorGradeExposure, dom.fxColorGradeContrast, dom.fxColorGradeSaturation,
    dom.fxColorGradeHue, dom.fxColorGradeVibrance, dom.fxColorGradeTint,
    dom.fxPixelateToggle, dom.fxPixelateSize, dom.fxPixelateIntensity,
    dom.fxDotMatrixToggle, dom.fxDotMatrixIntensity, dom.fxDotMatrixScale, dom.fxDotMatrixAngle, dom.fxDotMatrixSoftness,
    dom.fxTrailsToggle, dom.fxTrailsDamp,
  ].filter(Boolean);

  effectInputs.forEach((el) => el.addEventListener('input', applyEffectsFromUI));
  effectInputs.forEach((el) => el.addEventListener('change', applyEffectsFromUI));

  // Theme / colors
  if (dom.applyColorsBtn) {
    dom.applyColorsBtn.addEventListener('click', () => {
      applyTheme(dom.themeSelect.value, dom.colorPrimary.value, dom.colorSecondary.value, dom.colorTertiary?.value || '#ffffff');
    });
  }
  if (dom.themeSelect) {
    dom.themeSelect.addEventListener('change', () => {
      const t = THEMES[dom.themeSelect.value] || THEMES.cyber;
      if (dom.colorPrimary) dom.colorPrimary.value = t.primary;
      if (dom.colorSecondary) dom.colorSecondary.value = t.secondary;
      if (dom.colorTertiary) dom.colorTertiary.value = '#ffffff';
    });
  }

  // Apply tint updates immediately when colors change (helps Color Grade tint feel responsive)
  if (dom.colorPrimary) dom.colorPrimary.addEventListener('input', applyEffectsFromUI);

  // Library modal
  if (dom.addSongsBtn) {
    dom.addSongsBtn.addEventListener('click', async () => {
      openLibrary('songs');
      try {
        await fetchCachedTracks();
        renderSongsList(dom.songSearch.value || '');
        if (dom.uploadStatus) dom.uploadStatus.textContent = '';
      } catch (e) {
        if (dom.uploadStatus) dom.uploadStatus.textContent = 'Failed to load uploaded songs (is the server running?).';
        dom.songsList.innerHTML = '<div class="hv-empty">Could not load songs.</div>';
      }
    });
  }
  if (dom.chooseSongBtn) {
    dom.chooseSongBtn.addEventListener('click', async () => {
      if (externalAudioReceiver.enabled) {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.focus();
          }
        } catch (e) {}
        return;
      }
      openLibrary('songs');
      try {
        await fetchCachedTracks();
        renderSongsList(dom.songSearch.value || '');
      } catch (e) {
        if (dom.uploadStatus) dom.uploadStatus.textContent = 'Failed to load uploaded songs.';
        dom.songsList.innerHTML = '<div class="hv-empty">Could not load songs.</div>';
      }
    });
  }
  if (dom.playPauseBtn) {
    dom.playPauseBtn.addEventListener('click', async () => {
      if (externalAudioReceiver.enabled) {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.focus();
          }
        } catch (e) {}
        return;
      }
      const ok = await ensureAudioUnlocked();
      if (!ok) {
        if (dom.autoplayHint) dom.autoplayHint.hidden = false;
        return;
      }
      try {
        await audioEngine.togglePlay();
      } catch (e) {
        // ignore
      }
    });
  }
  if (dom.viewQueueBtn) dom.viewQueueBtn.addEventListener('click', () => openLibrary('queue'));
  if (dom.libraryClose) dom.libraryClose.addEventListener('click', closeLibrary);
  if (dom.libraryModal) {
    dom.libraryModal.addEventListener('click', (e) => {
      if (e.target === dom.libraryModal) closeLibrary();
    });
  }

  if (dom.tabSongs) dom.tabSongs.addEventListener('click', () => switchLibraryTab('songs'));
  if (dom.tabQueue) dom.tabQueue.addEventListener('click', () => switchLibraryTab('queue'));

  if (dom.songSearch) dom.songSearch.addEventListener('input', () => renderSongsList(dom.songSearch.value || ''));

  if (dom.uploadBtn && dom.uploadInput) {
    dom.uploadBtn.addEventListener('click', () => dom.uploadInput.click());
    dom.uploadInput.addEventListener('change', () => handleUploadFiles(dom.uploadInput.files));
  }
  if (dom.refreshBtn) {
    dom.refreshBtn.addEventListener('click', async () => {
      if (dom.uploadStatus) dom.uploadStatus.textContent = 'Refreshing…';
      try {
        await fetchCachedTracks();
        renderSongsList(dom.songSearch.value || '');
        if (dom.uploadStatus) dom.uploadStatus.textContent = '';
      } catch (e) {
        if (dom.uploadStatus) dom.uploadStatus.textContent = 'Refresh failed.';
      }
    });
  }

  // Queue controls
  if (dom.nextBtn) dom.nextBtn.addEventListener('click', () => playNextInQueue());
  if (dom.clearQueueBtn) dom.clearQueueBtn.addEventListener('click', clearQueue);
  if (dom.backBtn) {
    dom.backBtn.addEventListener('click', () => {
      if (history.length > 1) history.back();
      else location.href = resolveApiUrl('harmonizer.html', false);
    });
  }

  // Harmonizer FX (stack driver)
  const hxInputs = [
    dom.hxEnabled, dom.hxMode, dom.hxJumpProb, dom.hxLoopEnd,
    dom.hxCanonVoices, dom.hxOverlayMix, dom.hxBaseAudioOnly,
    dom.hxDopamine, dom.hxDopamineTop, dom.hxDopamineWindow,
    dom.hxTrap, dom.hxTrapWindow, dom.hxTrapStrength,
    dom.hxPhase, dom.hxPhaseRate, dom.hxPhaseDepth,
    dom.hxFreeze, dom.hxFreezeChance, dom.hxFreezeRepeats,
    dom.hxVelo, dom.hxVeloBase, dom.hxVeloAmt,
  ].filter(Boolean);

  hxInputs.forEach((el) => {
    el.addEventListener('change', () => {
      syncHxStateFromUi();
      saveHxState();
    });
    el.addEventListener('input', () => {
      syncHxStateFromUi();
      saveHxState();
    });
  });

  if (dom.hxApply) {
    dom.hxApply.addEventListener('click', () => {
      syncHxStateFromUi();
      saveHxState();
      // Recompute peaks after dopamine settings change.
      if (currentTrackAnalysis?.analysis) {
        try {
          const feats = buildBeatFeatures(currentTrackAnalysis.analysis);
          hxRuntime.beats = feats.beats;
          hxRuntime.beatEnergy = feats.beatEnergy;
          hxRuntime.beatPitch = feats.beatPitch;
          hxRuntime.peaks = feats.peaks;
          hxRuntime.canonOverlays = feats.canonOverlays || [];
        } catch (e) {}
      }
    });
  }
  if (dom.hxRestart) {
    dom.hxRestart.addEventListener('click', () => {
      hxRestart();
    });
  }

  // Camera controls
  if (dom.camAutoRotate) {
    const savedAutoRotate = readStorage(VISUALIZER_STORAGE.autoRotate, '0') === '1';
    dom.camAutoRotate.checked = savedAutoRotate;
    app.controls.autoRotate = savedAutoRotate;
    dom.camAutoRotate.addEventListener('change', () => {
      app.controls.autoRotate = !!dom.camAutoRotate.checked;
      writeStorage(VISUALIZER_STORAGE.autoRotate, app.controls.autoRotate ? '1' : '0');
    });
  }
  if (dom.camAutoRotateSpeed) {
    const savedSpeed = Number(readStorage(VISUALIZER_STORAGE.autoRotateSpeed, '2') || '2');
    dom.camAutoRotateSpeed.value = String(savedSpeed);
    app.controls.autoRotateSpeed = savedSpeed;
    dom.camAutoRotateSpeed.addEventListener('input', () => {
      const v = Number(dom.camAutoRotateSpeed.value);
      app.controls.autoRotateSpeed = v;
      writeStorage(VISUALIZER_STORAGE.autoRotateSpeed, String(v));
    });
  }
  if (dom.camFov) {
    dom.camFov.value = String(app.camera.fov || 70);
    dom.camFov.addEventListener('input', () => {
      const v = Number(dom.camFov.value);
      app.camera.fov = v;
      app.camera.updateProjectionMatrix();
      writeStorage(VISUALIZER_STORAGE.fov, String(v));
    });
  }
  if (dom.camReset) {
    dom.camReset.addEventListener('click', () => {
      app.camera.position.set(0, 0, 15);
      app.controls.target.set(0, 0, 0);
      app.controls.update();
      app.controls.reset();
    });
  }
  if (dom.qualitySelect) {
    const savedQuality = (readStorage(VISUALIZER_STORAGE.quality, 'high') || 'high').toLowerCase();
    dom.qualitySelect.value = ['low', 'medium', 'high', 'ultra'].includes(savedQuality) ? savedQuality : 'high';
    dom.qualitySelect.addEventListener('change', () => setQuality(dom.qualitySelect.value));
    setQuality(dom.qualitySelect.value);
  }
}

function setQuality(level) {
  const q = (level || 'high').toLowerCase();
  const pixelRatioMax = q === 'low' ? 1 : q === 'medium' ? 1.5 : q === 'ultra' ? 2 : 2;
  app.renderer.setPixelRatio(Math.min(pixelRatioMax, window.devicePixelRatio || 1));
  app.vizManager.setQuality(q);
  writeStorage(VISUALIZER_STORAGE.quality, q);
  onResize();
}

async function init() {
  cacheDom();
  loadPersistedQueue();
  externalAudioReceiver.init();

  initThree();
  initVisualizers();
  bindUI();
  loadHxState();
  loadSavedTheme();
  applyEffectsFromUI();

  // Restore camera prefs
  const savedFov = Number(readStorage(VISUALIZER_STORAGE.fov, '70') || '70');
  if (Number.isFinite(savedFov) && dom.camFov) {
    app.camera.fov = savedFov;
    app.camera.updateProjectionMatrix();
    dom.camFov.value = String(savedFov);
  }

  const params = PAGE_PARAMS;

  const preset = params.get('preset');
  if (preset && PRESETS[preset]) {
    if (dom.presetSelect) dom.presetSelect.value = preset;
    applyPreset(preset);
  }

  const initialTrackId = params.get('trid');

  // If we can see Harmonizer's analyser in the opener window, prefer "external audio" mode
  // so this page doesn't start its own audio playback (avoids doubled/choppy audio).
  const openerHint = (() => {
    try {
      return !!(window.opener && !window.opener.closed);
    } catch (e) {
      return false;
    }
  })();

  if (!EXTERNAL_AUDIO_MODE && openerHint) {
    for (let i = 0; i < 24; i++) {
      if (externalAudioReceiver.tryEnableFromOpener()) break;
      await delay(50);
    }
  }

  const usingExternalAudio = externalAudioReceiver.enabled;

  if (usingExternalAudio) {
    externalTrackLabel = initialTrackId ? `External audio • ${initialTrackId}` : 'External audio • linked';
    if (dom.trackMeta) dom.trackMeta.textContent = externalTrackLabel;
    if (dom.autoplayHint) dom.autoplayHint.hidden = true;
    [
      dom.chooseSongBtn,
      dom.playPauseBtn,
      dom.addSongsBtn,
      dom.viewQueueBtn,
      dom.nextBtn,
      dom.clearQueueBtn,
      dom.uploadBtn,
      dom.refreshBtn,
      dom.songSearch,
      dom.uploadInput,
    ]
      .filter(Boolean)
      .forEach((el) => (el.disabled = true));
    [
      dom.hxEnabled,
      dom.hxMode,
      dom.hxJumpProb,
      dom.hxLoopEnd,
      dom.hxRestart,
      dom.hxApply,
      dom.hxCanonVoices,
      dom.hxOverlayMix,
      dom.hxBaseAudioOnly,
      dom.hxDopamine,
      dom.hxDopamineTop,
      dom.hxDopamineWindow,
      dom.hxTrap,
      dom.hxTrapWindow,
      dom.hxTrapStrength,
      dom.hxPhase,
      dom.hxPhaseRate,
      dom.hxPhaseDepth,
      dom.hxFreeze,
      dom.hxFreezeChance,
      dom.hxFreezeRepeats,
      dom.hxVelo,
      dom.hxVeloBase,
      dom.hxVeloAmt,
    ]
      .filter(Boolean)
      .forEach((el) => (el.disabled = true));
  } else if (initialTrackId) {
    try {
      await playTrackById(initialTrackId);
    } catch (e) {
      console.warn('[HV] Initial track failed to play', e);
    }
  }

  animate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.threeDVisualizer = { playTrackById, addToQueue, playNextInQueue };
