/**
 * Sonic Architect Lite app for Harmonizer.
 *
 * - Uses Sonic Architect visualizers/effects as rendering core.
 * - Uses Harmonizer upload/queue via localStorage + analysis JSON.
 * - No Sonic playlist/landing screens/UI.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { eventBus, Events } from './utils/EventBus.js';

import { audioEngine } from './audio/AudioEngine.js';
import { frequencyAnalyzer } from './audio/FrequencyAnalyzer.js';
import { beatDetector } from './audio/BeatDetector.js';

import VisualizerManager from './visualizers/VisualizerManager.js';
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

import { PostProcessorManager } from './effects/PostProcessing.js';

const CONFIG = window.HARMONIZER_CONFIG || {};
const API_BASE_URL = (CONFIG.apiBaseUrl || '').replace(/\/+$/, '');
const QUEUE_STORAGE_KEY = 'harmonizerTrackQueue';
const QUEUE_INDEX_KEY = 'harmonizerQueuePlaybackIndex';

function resolveApiUrl(path) {
  if (!path) return API_BASE_URL || '';
  if (/^https?:\/\//i.test(path)) return path;
  if (path.charAt(0) !== '/') path = '/' + path;
  return API_BASE_URL ? API_BASE_URL + path : path;
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  return value && value.trim() ? value.trim() : null;
}

function loadQueueFromStorage() {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => ({
        id: t.id || t.trackId || t.trid,
        title: t.title || 'Untitled',
        artist: t.artist || '(unknown artist)',
      }))
      .filter((t) => t.id);
  } catch (err) {
    console.warn('[SonicLite] Failed to parse queue', err);
    return [];
  }
}

function loadQueueIndex(queue, currentId) {
  if (currentId) {
    const idx = queue.findIndex((t) => t.id === currentId);
    if (idx >= 0) return idx;
  }
  const raw = localStorage.getItem(QUEUE_INDEX_KEY);
  const idx = raw ? parseInt(raw, 10) : 0;
  if (Number.isFinite(idx) && idx >= 0 && idx < queue.length) return idx;
  return 0;
}

function saveQueueIndex(index) {
  try {
    localStorage.setItem(QUEUE_INDEX_KEY, String(index));
  } catch {}
}

async function fetchAnalysis(trackId) {
  const url = resolveApiUrl(`data/${encodeURIComponent(trackId)}.json`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load analysis (${res.status})`);
  const data = await res.json();
  const track =
    (data && data.response && data.response.track) ||
    (data && data.track) ||
    null;
  if (!track) throw new Error('Analysis JSON missing track data');
  const audioUrl =
    track.audio_url ||
    (track.info && track.info.url) ||
    track.url ||
    null;
  if (!audioUrl) throw new Error('Analysis JSON missing audio URL');
  return { track, audioUrl };
}

class SonicArchitectLiteApp {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.composer = null;
    this.controls = null;
    this.clock = null;
    this.visualizerManager = null;
    this.postProcessor = null;
    this.bloomPass = null;

    this.currentTrackId = null;
    this.currentMode = 'canon';
    this.pendingAudioUrl = null;
    this.isPlaying = false;

    this.animate = this.animate.bind(this);
    this.onResize = this.onResize.bind(this);
  }

  async init() {
    window.THREE = THREE;
    window.sonicApp = this;

    this.initThree();
    this.initVisualizers();
    this.initEffects();
    await this.initAudio();
    this.setupUiBindings();
    await this.loadInitialTrackOrQueue();

    this.clock = new THREE.Clock();
    this.animate();
  }

  initThree() {
    const container = document.getElementById('canvas-container');
    if (!container) throw new Error('Missing canvas container');

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x000000, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 10);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.maxDistance = 50;
    this.controls.minDistance = 2;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const point = new THREE.PointLight(0xff00ff, 1, 120);
    point.position.set(0, 10, 10);
    this.scene.add(point);

    window.addEventListener('resize', this.onResize);
  }

  initVisualizers() {
    this.visualizerManager = new VisualizerManager(this.scene, this.camera, this.renderer);

    this.visualizerManager.register(SphereVisualizer);
    this.visualizerManager.register(ParticleGalaxy);
    this.visualizerManager.register(AudioBars3D);
    this.visualizerManager.register(WaveformTunnel);
    this.visualizerManager.register(Terrain);
    this.visualizerManager.register(Ribbons);
    this.visualizerManager.register(DNAHelix);
    this.visualizerManager.register(Kaleidoscope);
    this.visualizerManager.register(Nebula);
    this.visualizerManager.register(Fireworks);
    this.visualizerManager.register(CircuitBoard);

    this.visualizerManager.switchTo('sphere', 'instant');
  }

  initEffects() {
    const renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.4,
      0.4,
      0.85
    );
    this.bloomPass.threshold = 0;
    this.bloomPass.strength = 1.4;
    this.bloomPass.radius = 0.5;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(this.bloomPass);

    this.postProcessor = new PostProcessorManager(this.composer).init();
  }

  async initAudio() {
    await audioEngine.init();
    const analyser = audioEngine.getAnalyser();
    frequencyAnalyzer.init(analyser, audioEngine.context.sampleRate);
    beatDetector.init(frequencyAnalyzer);

    eventBus.on(Events.AUDIO_PLAY, () => {
      this.isPlaying = true;
    });
    eventBus.on(Events.AUDIO_PAUSE, () => {
      this.isPlaying = false;
    });
    eventBus.on(Events.AUDIO_STOP, () => {
      this.isPlaying = false;
    });

    eventBus.on(Events.BEAT_DETECTED, (data) => {
      this.visualizerManager.onBeat(data.intensity);
    });

    eventBus.on(Events.AUDIO_ENDED, () => {
      this.playNextInQueue();
    });
  }

  setupUiBindings() {
    const modeSelect = document.getElementById('sonic-viz-mode');
    modeSelect?.addEventListener('change', (e) => {
      const id = e.target.value;
      this.visualizerManager.switchTo(id, 'instant');
    });

    const fxBloom = document.getElementById('sonic-fx-bloom');
    fxBloom?.addEventListener('change', (e) => {
      if (this.bloomPass) this.bloomPass.enabled = !!e.target.checked;
    });

    const fxMap = [
      ['sonic-fx-chromatic', 'chromatic'],
      ['sonic-fx-glitch', 'glitch'],
      ['sonic-fx-scanlines', 'scanlines'],
      ['sonic-fx-vignette', 'vignette'],
      ['sonic-fx-grain', 'filmGrain'],
    ];
    fxMap.forEach(([checkboxId, effectName]) => {
      const el = document.getElementById(checkboxId);
      if (!el) return;
      el.addEventListener('change', (e) => {
        this.postProcessor.setEnabled(effectName, !!e.target.checked);
      });
    });

    document.getElementById('sonic-add-songs-btn')?.addEventListener('click', () => {
      const params = new URLSearchParams();
      if (this.currentTrackId) params.set('trid', this.currentTrackId);
      if (this.currentMode) params.set('mode', this.currentMode);
      window.open(`/harmonizer.html?${params.toString()}`, '_blank');
    });

    document.getElementById('sonic-view-queue-btn')?.addEventListener('click', () => {
      const params = new URLSearchParams();
      if (this.currentTrackId) params.set('trid', this.currentTrackId);
      if (this.currentMode) params.set('mode', this.currentMode);
      window.open(`/harmonizer.html?${params.toString()}`, '_blank');
    });

    document.getElementById('sonic-next-btn')?.addEventListener('click', () => {
      this.playNextInQueue(true);
    });

    document.getElementById('sonic-back-btn')?.addEventListener('click', () => {
      const params = new URLSearchParams();
      if (this.currentTrackId) params.set('trid', this.currentTrackId);
      if (this.currentMode) params.set('mode', this.currentMode);
      window.location.href = `/harmonizer.html?${params.toString()}`;
    });
  }

  async loadInitialTrackOrQueue() {
    const trid = getQueryParam('trid') || getQueryParam('trackId');
    const mode = (getQueryParam('mode') || 'canon').toLowerCase();
    this.currentMode = mode;

    if (trid) {
      await this.loadTrackById(trid, { autoplay: true });
      return;
    }

    const queue = loadQueueFromStorage();
    if (queue.length > 0) {
      await this.loadTrackById(queue[0].id, { autoplay: true });
    }
  }

  async loadTrackById(trackId, options = {}) {
    const { autoplay = true } = options;
    this.currentTrackId = trackId;
    try {
      const { audioUrl } = await fetchAnalysis(trackId);
      const resolvedAudioUrl = resolveApiUrl(audioUrl);
      await audioEngine.loadURL(resolvedAudioUrl);
      if (!autoplay) {
        audioEngine.pause();
      }
      this.hideAutoplayHint();
      this.updateUrlState();
      return true;
    } catch (err) {
      console.warn('[SonicLite] loadTrackById failed', err);
      // Autoplay blocked or other errors.
      if (err && /play\(\)/i.test(String(err)) || /autoplay/i.test(String(err))) {
        this.pendingAudioUrl = trackId;
        this.showAutoplayHint();
        const resumeOnce = () => {
          this.hideAutoplayHint();
          this.loadTrackById(trackId, { autoplay: true }).catch(() => {});
          document.removeEventListener('click', resumeOnce);
        };
        document.addEventListener('click', resumeOnce, { once: true });
        return false;
      }
      throw err;
    }
  }

  async playNextInQueue(isManual = false) {
    const queue = loadQueueFromStorage();
    if (queue.length === 0) return false;

    const currentIndex = loadQueueIndex(queue, this.currentTrackId);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      if (isManual) {
        // Manual wrap to first.
        saveQueueIndex(0);
        return this.loadTrackById(queue[0].id, { autoplay: true });
      }
      return false;
    }

    saveQueueIndex(nextIndex);
    return this.loadTrackById(queue[nextIndex].id, { autoplay: true });
  }

  updateUrlState() {
    const params = new URLSearchParams();
    if (this.currentTrackId) params.set('trid', this.currentTrackId);
    if (this.currentMode) params.set('mode', this.currentMode);
    history.replaceState({}, document.title, '?' + params.toString());
  }

  showAutoplayHint() {
    const hint = document.getElementById('sonic-autoplay-hint');
    if (hint) {
      hint.hidden = false;
    }
  }

  hideAutoplayHint() {
    const hint = document.getElementById('sonic-autoplay-hint');
    if (hint) {
      hint.hidden = true;
    }
  }

  animate() {
    const delta = this.clock ? this.clock.getDelta() : 0.016;

    let audioData = null;
    if (audioEngine.isPlaying) {
      frequencyAnalyzer.update();
      beatDetector.update(delta * 1000);
      audioData = frequencyAnalyzer.getAnalysis();
    } else {
      audioData = {
        frequencies: new Uint8Array(128).fill(0),
        timeDomain: new Uint8Array(128).fill(128),
        volume: 0,
        bass: 0,
        mid: 0,
        high: 0,
        treble: 0,
        bandsSmoothed: new Float32Array(32).fill(0),
      };
    }

    this.visualizerManager.update(delta, audioData);
    if (this.controls) this.controls.update();

    if (this.composer) {
      this.composer.render(delta);
    } else if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }

    requestAnimationFrame(this.animate);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!this.camera || !this.renderer) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.composer) this.composer.setSize(width, height);
    if (this.visualizerManager) this.visualizerManager.resize(width, height);
  }
}

const app = new SonicArchitectLiteApp();
app.init().catch((err) => {
  console.error('[SonicLite] Initialization failed', err);
});

export default app;

