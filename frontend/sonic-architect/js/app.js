/**
 * SONIC ARCHITECT MK.III
 * Integrated Application Controller
 *
 * Ties together all modular systems
 */

console.log('📦 app.js loading...');

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Event System
import { eventBus, Events } from './utils/EventBus.js';
import { storage } from './utils/Storage.js';

// Audio System
import { audioEngine } from './audio/AudioEngine.js';
import { frequencyAnalyzer } from './audio/FrequencyAnalyzer.js';
import { beatDetector } from './audio/BeatDetector.js';
import { microphoneInput } from './audio/MicrophoneInput.js';
import { waveformGenerator } from './audio/WaveformGenerator.js';

// Visualizer System
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

// Playlist System
import { playlistManager } from './playlist/PlaylistManager.js';
import { trackLoader } from './playlist/TrackLoader.js';
import { metadataParser } from './playlist/MetadataParser.js';

// UI System
import { uiManager } from './ui/UIManager.js';
import { playlistUI } from './ui/PlaylistUI.js';
import { waveformUI } from './ui/WaveformUI.js';
import { albumArtUI } from './ui/AlbumArtUI.js';

// Post-Processing Effects
import {
    PostProcessorManager,
    ChromaticAberrationPass,
    GlitchPass,
    ScanlinesPass,
    VignettePass
} from './effects/PostProcessing.js';

// ==========================================
// APPLICATION STATE
// ==========================================

class SonicArchitectApp {
    constructor() {
        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.composer = null;
        this.controls = null;
        this.clock = null;

        // Managers
        this.visualizerManager = null;
        this.postProcessor = null;

        // State
        this.isInitialized = false;
        this.isPlaying = false;
        this.audioElement = null;

        // Performance
        this.frameCount = 0;
        this.lastFpsUpdate = 0;
        this.fps = 0;

        // Bind methods
        this.animate = this.animate.bind(this);
        this.onWindowResize = this.onWindowResize.bind(this);
    }

    /**
     * Initialize application
     */
    async init() {
        console.log('🎵 SONIC ARCHITECT MK.III initializing...');

        try {
            // Initialize UI Manager
            console.log('  1/9 Initializing UI Manager...');
            uiManager.init();

            // Initialize Three.js
            console.log('  2/9 Initializing Three.js...');
            this.initThreeJS();

            // Initialize visualizer manager
            console.log('  3/9 Initializing visualizers...');
            this.initVisualizers();

            // Initialize audio system
            console.log('  4/9 Initializing audio system...');
            await this.initAudio();

            // Initialize UI components
            console.log('  5/9 Initializing UI components...');
            this.initUIComponents();

            // Setup playlist
            console.log('  6/9 Setting up playlist...');
            this.setupPlaylist();

            // Setup event listeners
            console.log('  7/9 Setting up event listeners...');
            this.setupEventListeners();

            // Setup post-processing effects
            console.log('  8/9 Setting up effects...');
            this.setupEffects();

            // Load saved state
            console.log('  9/9 Loading saved state...');
            await this.loadState();

            // Hide loader
            console.log('✅ All systems initialized, hiding loader...');
            this.hideLoader();

            // Start animation loop
            this.animate();

            this.isInitialized = true;
            console.log('✅ Initialization complete');

        } catch (error) {
            console.error('❌ Initialization failed:', error);
            console.error('Stack trace:', error.stack);
            this.showError('Failed to initialize application: ' + error.message);

            // Hide loader even on error so user can see the error
            this.hideLoader();
        }
    }

    /**
     * Initialize Three.js scene
     */
    initThreeJS() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.scene.fog = new THREE.FogExp2(0x000000, 0.015);

        // Camera
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 0, 10);

        // Renderer
        const container = document.getElementById('canvas-container');
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance',
            alpha: false
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.5;
        this.controls.maxDistance = 50;
        this.controls.minDistance = 2;

        // Post-processing
        this.setupPostProcessing();

        // Clock
        this.clock = new THREE.Clock();

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const point = new THREE.PointLight(0x00f0ff, 1, 100);
        point.position.set(0, 10, 10);
        this.scene.add(point);

        // Window resize
        window.addEventListener('resize', this.onWindowResize);

        console.log('🎨 Three.js initialized');
    }

    /**
     * Setup post-processing
     */
    setupPostProcessing() {
        const renderPass = new RenderPass(this.scene, this.camera);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5,  // strength
            0.4,  // radius
            0.85  // threshold
        );
        bloomPass.threshold = 0;
        bloomPass.strength = 1.5;
        bloomPass.radius = 0.5;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(renderPass);
        this.composer.addPass(bloomPass);

        this.bloomPass = bloomPass;
    }

    /**
     * Initialize UI components (playlist, waveform, album art)
     */
    initUIComponents() {
        // Initialize playlist UI
        playlistUI.init();

        // Initialize waveform UI
        waveformUI.init();

        // Initialize album art UI
        albumArtUI.init();

        console.log('🎨 UI components initialized');
    }

    /**
     * Setup additional post-processing effects
     */
    setupEffects() {
        // Initialize post-processor manager
        this.postProcessor = new PostProcessorManager(this.composer);
        this.postProcessor.init();

        // Set initial state from checkboxes
        const fxScanlines = document.getElementById('fx-scanlines');
        const fxVignette = document.getElementById('fx-vignette');

        if (fxScanlines?.checked) {
            this.postProcessor.setEnabled('scanlines', true);
        }
        if (fxVignette?.checked) {
            this.postProcessor.setEnabled('vignette', true);
        }

        // Connect UI toggles to effects
        this.setupEffectToggles();

        console.log('✨ Post-processing effects ready');
    }

    /**
     * Setup effect toggle listeners
     */
    setupEffectToggles() {
        const effectCheckboxes = {
            'fx-chromatic': 'chromatic',
            'fx-glitch': 'glitch',
            'fx-scanlines': 'scanlines',
            'fx-vignette': 'vignette',
            'fx-bloom': 'bloom'
        };

        Object.entries(effectCheckboxes).forEach(([checkboxId, effectName]) => {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    if (effectName === 'bloom') {
                        // Bloom is handled separately via the built-in pass
                        this.bloomPass.enabled = e.target.checked;
                    } else {
                        this.postProcessor.setEnabled(effectName, e.target.checked);
                    }
                });
            }
        });

        // Effect intensity sliders
        const chromaticIntensity = document.getElementById('chromatic-intensity');
        if (chromaticIntensity) {
            chromaticIntensity.addEventListener('input', (e) => {
                this.postProcessor.setIntensity('chromatic', parseFloat(e.target.value));
            });
        }

        const glitchIntensity = document.getElementById('glitch-intensity');
        if (glitchIntensity) {
            glitchIntensity.addEventListener('input', (e) => {
                this.postProcessor.setIntensity('glitch', parseFloat(e.target.value));
            });
        }

        // Bloom intensity (slider is 'bloom' in HTML)
        const bloomIntensity = document.getElementById('bloom');
        if (bloomIntensity) {
            bloomIntensity.addEventListener('input', (e) => {
                this.bloomPass.strength = parseFloat(e.target.value);
            });
        }
    }

    /**
     * Initialize visualizers
     */
    initVisualizers() {
        this.visualizerManager = new VisualizerManager(
            this.scene,
            this.camera,
            this.renderer
        );

        // Register all visualizers
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

        // Activate first visualizer
        this.visualizerManager.switchTo('sphere', 'instant');

        console.log('🎨 Visualizers initialized:', this.visualizerManager.getVisualizerList());
    }

    /**
     * Initialize audio system
     */
    async initAudio() {
        // Initialize audio engine
        await audioEngine.init();

        // Get analyser and initialize frequency analyzer
        const analyser = audioEngine.getAnalyser();
        frequencyAnalyzer.init(analyser, audioEngine.context.sampleRate);

        // Initialize beat detector
        beatDetector.init(frequencyAnalyzer);

        // Initialize metadata parser
        await metadataParser.init();

        console.log('🎵 Audio system initialized');
    }

    /**
     * Setup playlist
     */
    setupPlaylist() {
        // Setup drop zone for track loading
        const dropZone = document.getElementById('canvas-container');
        if (dropZone) {
            trackLoader.setupDropZone(dropZone);
        }

        console.log('📋 Playlist system ready');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Overlay init button
        const initBtn = document.getElementById('init-btn');
        const overlay = document.getElementById('overlay');

        initBtn?.addEventListener('click', async () => {
            try {
                // Resume audio context (required by browser autoplay policy)
                if (audioEngine.context.state === 'suspended') {
                    await audioEngine.context.resume();
                }

                // Hide overlay
                overlay?.classList.add('is-hidden');

                console.log('✅ User initialized - audio context ready');
            } catch (error) {
                console.error('Failed to initialize audio context:', error);
            }
        });

        // Audio events
        eventBus.on(Events.AUDIO_PLAY, () => {
            this.isPlaying = true;
            const playBtn = document.getElementById('play-btn');
            playBtn?.classList.add('is-playing');
            console.log('▶️ Audio playing');
        });
        eventBus.on(Events.AUDIO_PAUSE, () => {
            this.isPlaying = false;
            const playBtn = document.getElementById('play-btn');
            playBtn?.classList.remove('is-playing');
            console.log('⏸️ Audio paused');
        });
        eventBus.on(Events.AUDIO_STOP, () => {
            this.isPlaying = false;
            const playBtn = document.getElementById('play-btn');
            playBtn?.classList.remove('is-playing');
            console.log('⏹️ Audio stopped');
        });

        // Beat events
        eventBus.on(Events.BEAT_DETECTED, (data) => {
            this.visualizerManager.onBeat(data.intensity);
        });

        // BPM events
        eventBus.on(Events.BPM_UPDATE, (data) => {
            this.visualizerManager.onBPMUpdate(data.bpm, data.confidence);
            this.updateBPMDisplay(data.bpm);
        });

        // Playlist events
        eventBus.on(Events.PLAYLIST_TRACK_CHANGE, (data) => {
            this.loadTrack(data.track);
        });

        eventBus.on(Events.LOAD_COMPLETE, (data) => {
            console.log(`Loaded ${data.loaded} tracks`);
            // Auto-play first track if playlist was empty
            if (playlistManager.getCurrentTrack() === null && data.tracks.length > 0) {
                // Set playing state before loading so track auto-plays
                this.isPlaying = true;
                playlistManager.playTrack(0);
            }
        });

        // UI events
        eventBus.on(Events.TOGGLE_PLAY, () => this.togglePlay());
        eventBus.on(Events.NEXT_TRACK, () => playlistManager.next());
        eventBus.on(Events.PREV_TRACK, () => playlistManager.previous());
        eventBus.on(Events.TOGGLE_SHUFFLE, () => playlistManager.toggleShuffle());
        eventBus.on(Events.CYCLE_REPEAT, () => playlistManager.cycleRepeatMode());

        // Visualizer switching
        eventBus.on(Events.SWITCH_VISUALIZER, (data) => {
            const visualizers = this.visualizerManager.getVisualizerList();
            if (data.index !== undefined && data.index < visualizers.length) {
                this.visualizerManager.switchTo(visualizers[data.index].id);
            }
        });

        // Theme change
        eventBus.on(Events.THEME_CHANGE, (data) => {
            this.applyThemeToVisualizer(data.theme);
        });

        // Volume
        eventBus.on(Events.VOLUME_CHANGE, (data) => {
            if (data.delta) {
                const newVolume = Math.max(0, Math.min(1, audioEngine.getVolume() + data.delta));
                audioEngine.setVolume(newVolume);
            } else if (data.value !== undefined) {
                audioEngine.setVolume(data.value);
            }
        });

        eventBus.on(Events.TOGGLE_MUTE, () => {
            audioEngine.toggleMute();
        });

        // Audio time updates for waveform/progress
        eventBus.on(Events.AUDIO_TIME_UPDATE, (data) => {
            waveformUI.updateProgress(data.currentTime, data.duration);
        });

        // Player controls from DOM
        const playBtn = document.getElementById('play-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const shuffleBtn = document.getElementById('shuffle-btn');
        const repeatBtn = document.getElementById('repeat-btn');
        const volumeSlider = document.getElementById('volume-slider');

        playBtn?.addEventListener('click', () => this.togglePlay());
        prevBtn?.addEventListener('click', () => playlistManager.previous());
        nextBtn?.addEventListener('click', () => playlistManager.next());
        shuffleBtn?.addEventListener('click', () => playlistManager.toggleShuffle());
        repeatBtn?.addEventListener('click', () => playlistManager.cycleRepeatMode());
        volumeSlider?.addEventListener('input', (e) => {
            audioEngine.setVolume(parseFloat(e.target.value));
        });

        // File input area (click to browse)
        const fileInputArea = document.getElementById('file-input-area');
        const fileInput = document.getElementById('file-input');

        fileInputArea?.addEventListener('click', () => {
            fileInput?.click();
        });

        // File input change handler
        fileInput?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                trackLoader.loadFiles(e.target.files);
            }
        });

        // Setup drop zone on file input area too
        if (fileInputArea) {
            trackLoader.setupDropZone(fileInputArea);
        }

        // File upload button (if it exists elsewhere)
        const uploadBtn = document.querySelector('[data-action="upload"]');
        uploadBtn?.addEventListener('click', () => {
            trackLoader.openFileDialog(true);
        });

        // Input source tabs
        const srcFileBtn = document.getElementById('src-file');
        const srcMicBtn = document.getElementById('src-mic');
        const fileInputAreaEl = document.getElementById('file-input-area');
        const micInputArea = document.getElementById('mic-input-area');

        srcFileBtn?.addEventListener('click', () => {
            srcFileBtn.classList.add('tab--active');
            srcMicBtn?.classList.remove('tab--active');
            fileInputAreaEl?.classList.remove('hidden');
            micInputArea?.classList.add('hidden');
        });

        srcMicBtn?.addEventListener('click', () => {
            srcMicBtn.classList.add('tab--active');
            srcFileBtn?.classList.remove('tab--active');
            micInputArea?.classList.remove('hidden');
            fileInputAreaEl?.classList.add('hidden');
        });

        // Microphone toggle
        const micToggle = document.getElementById('mic-toggle');
        micToggle?.addEventListener('click', async () => {
            try {
                if (audioEngine.micEnabled) {
                    audioEngine.disableMicrophone();
                    micToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg><span>Enable Microphone</span>';
                } else {
                    await audioEngine.enableMicrophone();
                    micToggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg><span>Disable Microphone</span>';
                }
            } catch (error) {
                console.error('Microphone error:', error);
                alert('Failed to access microphone. Please grant microphone permissions.');
            }
        });

        // Visualizer mode dropdown
        const vizModeSelect = document.getElementById('visualizer-mode');
        vizModeSelect?.addEventListener('change', (e) => {
            const vizId = e.target.value;
            console.log('Switching to visualizer:', vizId);
            this.visualizerManager.switchTo(vizId);
        });

        // Visualizer mode buttons
        const vizBtns = document.querySelectorAll('[data-visualizer]');
        vizBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const vizId = e.currentTarget.dataset.visualizer;
                console.log('Button switching to visualizer:', vizId);
                this.visualizerManager.switchTo(vizId);

                // Update active state
                vizBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // Update dropdown to match
                if (vizModeSelect) {
                    vizModeSelect.value = vizId;
                }
            });
        });

        // Camera controls
        const camAutoRotate = document.getElementById('cam-autorotate');
        const camShake = document.getElementById('cam-shake');
        const camReset = document.getElementById('cam-reset');

        camAutoRotate?.addEventListener('change', (e) => {
            this.visualizerManager.setAutoRotate(e.target.checked);
        });

        camShake?.addEventListener('change', (e) => {
            this.visualizerManager.setCameraShake(e.target.checked);
        });

        camReset?.addEventListener('click', () => {
            this.visualizerManager.resetCamera();
        });

        // Theme picker
        const themeBtns = document.querySelectorAll('[data-theme]');
        themeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                document.body.dataset.theme = theme;

                // Update active state
                themeBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');

                // Save to localStorage
                localStorage.setItem('theme', theme);
            });
        });

        // Preset selector
        const presetSelect = document.getElementById('preset-select');
        const presetSave = document.getElementById('preset-save');
        const presetExport = document.getElementById('preset-export');

        presetSelect?.addEventListener('change', (e) => {
            const preset = e.target.value;
            if (preset) {
                this.loadPreset(preset);
            }
        });

        presetSave?.addEventListener('click', () => {
            this.saveCurrentPreset();
        });

        presetExport?.addEventListener('click', () => {
            this.exportPreset();
        });

        // Fullscreen button
        const fullscreenBtn = document.getElementById('btn-fullscreen');
        fullscreenBtn?.addEventListener('click', () => {
            this.toggleFullscreen();
        });

        // Hide UI button
        const hideUIBtn = document.getElementById('btn-hide-ui');
        hideUIBtn?.addEventListener('click', () => {
            this.toggleUI();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input field
            if (e.target.matches('input, textarea, select')) return;

            const vizMap = {
                '1': 'sphere',
                '2': 'galaxy',
                '3': 'bars',
                '4': 'tunnel',
                '5': 'terrain',
                '6': 'ribbons',
                '7': 'dna',
                '8': 'kaleidoscope',
                '9': 'nebula',
                '0': 'fireworks'
            };

            if (vizMap[e.key]) {
                this.visualizerManager.switchTo(vizMap[e.key]);
                if (vizModeSelect) vizModeSelect.value = vizMap[e.key];
                return;
            }

            switch(e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case 'h':
                    e.preventDefault();
                    this.toggleUI();
                    break;
                case 'n':
                    playlistManager.next();
                    break;
                case 'p':
                    playlistManager.previous();
                    break;
                case 's':
                    playlistManager.toggleShuffle();
                    break;
                case 'r':
                    playlistManager.cycleRepeatMode();
                    break;
                case 'c':
                    this.visualizerManager.switchTo('circuit');
                    if (vizModeSelect) vizModeSelect.value = 'circuit';
                    break;
            }
        });

        console.log('🎛️ Event listeners configured');
    }

    /**
     * Load and play track
     */
    async loadTrack(track) {
        try {
            console.log('Loading track:', track.name);

            // Stop current playback
            if (this.isPlaying) {
                audioEngine.pause();
            }

            // Load new track
            if (track.buffer) {
                await audioEngine.loadBuffer(track.buffer);
            } else if (track.file) {
                await audioEngine.loadFile(track.file);
            }

            // Generate waveform
            const audioBuffer = audioEngine.getAudioBuffer();
            if (audioBuffer) {
                await waveformGenerator.generateFromBuffer(audioBuffer);
            }

            // Update metadata if needed
            if (!track.artist && track.file) {
                await metadataParser.updateTrackMetadata(track);
            }

            // Auto-play
            if (this.isPlaying) {
                audioEngine.play();
            }

            eventBus.emit(Events.AUDIO_LOAD, track);

        } catch (error) {
            console.error('Failed to load track:', error);
            eventBus.emit(Events.AUDIO_ERROR, { error: error.message });
        }
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (!audioEngine.isInitialized) {
            console.warn('Audio engine not initialized');
            return;
        }

        if (this.isPlaying) {
            audioEngine.pause();
        } else {
            // If no track loaded, try to play first in playlist
            if (!audioEngine.getAudioBuffer() && playlistManager.getLength() > 0) {
                playlistManager.playTrack(0);
            } else {
                audioEngine.play();
            }
        }
    }

    /**
     * Apply theme to current visualizer
     */
    applyThemeToVisualizer(theme) {
        const currentViz = this.visualizerManager.getCurrent();
        if (currentViz && typeof currentViz.setColorPalette === 'function') {
            currentViz.setColorPalette(theme);
        } else if (currentViz && typeof currentViz.setColorScheme === 'function') {
            currentViz.setColorScheme(theme);
        }
    }

    /**
     * Update BPM display
     */
    updateBPMDisplay(bpm) {
        const bpmDisplay = document.getElementById('bpm');
        if (bpmDisplay) {
            bpmDisplay.textContent = `${bpm} BPM`;
        }
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Error entering fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    /**
     * Toggle UI visibility
     */
    toggleUI() {
        const uiLayer = document.getElementById('ui-layer');
        const panels = document.querySelectorAll('.panel');
        const header = document.querySelector('.header');

        if (uiLayer) {
            const isHidden = uiLayer.classList.contains('ui-hidden');

            if (isHidden) {
                // Show UI
                uiLayer.classList.remove('ui-hidden');
                panels.forEach(p => p.style.display = '');
                if (header) header.style.display = '';
            } else {
                // Hide UI
                uiLayer.classList.add('ui-hidden');
                panels.forEach(p => p.style.display = 'none');
                if (header) header.style.display = 'none';
            }
        }
    }

    /**
     * Load a preset configuration
     */
    loadPreset(presetName) {
        const presets = {
            'chill': {
                bloom: 0.3,
                chromatic: 0.1,
                glitch: 0.0,
                scanlines: true,
                vignette: true,
                autoRotate: true,
                cameraShake: false,
                visualizer: 'sphere'
            },
            'bass': {
                bloom: 0.8,
                chromatic: 0.3,
                glitch: 0.2,
                scanlines: false,
                vignette: true,
                autoRotate: false,
                cameraShake: true,
                visualizer: 'bars'
            },
            'edm': {
                bloom: 1.0,
                chromatic: 0.5,
                glitch: 0.4,
                scanlines: true,
                vignette: false,
                autoRotate: true,
                cameraShake: true,
                visualizer: 'galaxy'
            },
            'lofi': {
                bloom: 0.2,
                chromatic: 0.0,
                glitch: 0.0,
                scanlines: true,
                vignette: true,
                autoRotate: true,
                cameraShake: false,
                visualizer: 'ribbons'
            },
            'cinematic': {
                bloom: 0.4,
                chromatic: 0.2,
                glitch: 0.0,
                scanlines: false,
                vignette: true,
                autoRotate: true,
                cameraShake: false,
                visualizer: 'terrain'
            },
            'minimal': {
                bloom: 0.0,
                chromatic: 0.0,
                glitch: 0.0,
                scanlines: false,
                vignette: false,
                autoRotate: false,
                cameraShake: false,
                visualizer: 'sphere'
            },
            'psychedelic': {
                bloom: 1.0,
                chromatic: 0.8,
                glitch: 0.6,
                scanlines: true,
                vignette: false,
                autoRotate: true,
                cameraShake: true,
                visualizer: 'tunnel'
            },
            'podcast': {
                bloom: 0.1,
                chromatic: 0.0,
                glitch: 0.0,
                scanlines: false,
                vignette: true,
                autoRotate: true,
                cameraShake: false,
                visualizer: 'bars'
            }
        };

        const preset = presets[presetName];
        if (!preset) {
            console.warn('Unknown preset:', presetName);
            return;
        }

        // Apply preset settings
        this.postProcessor.setIntensity('bloom', preset.bloom);
        this.postProcessor.setIntensity('chromatic', preset.chromatic);
        this.postProcessor.setIntensity('glitch', preset.glitch);
        this.postProcessor.setEnabled('scanlines', preset.scanlines);
        this.postProcessor.setEnabled('vignette', preset.vignette);

        this.visualizerManager.setAutoRotate(preset.autoRotate);
        this.visualizerManager.setCameraShake(preset.cameraShake);
        this.visualizerManager.switchTo(preset.visualizer);

        console.log('Loaded preset:', presetName);
    }

    /**
     * Save current settings as custom preset
     */
    saveCurrentPreset() {
        const presetName = prompt('Enter preset name:');
        if (!presetName) return;

        // Gather current settings
        const currentPreset = {
            bloom: this.postProcessor.getIntensity('bloom'),
            chromatic: this.postProcessor.getIntensity('chromatic'),
            glitch: this.postProcessor.getIntensity('glitch'),
            scanlines: this.postProcessor.isEnabled('scanlines'),
            vignette: this.postProcessor.isEnabled('vignette'),
            autoRotate: this.visualizerManager.getAutoRotate(),
            cameraShake: this.visualizerManager.getCameraShake(),
            visualizer: this.visualizerManager.getCurrentId()
        };

        // Save to localStorage
        const savedPresets = JSON.parse(localStorage.getItem('customPresets') || '{}');
        savedPresets[presetName] = currentPreset;
        localStorage.setItem('customPresets', JSON.stringify(savedPresets));

        alert(`Preset "${presetName}" saved!`);
    }

    /**
     * Export current settings as JSON
     */
    exportPreset() {
        const currentPreset = {
            bloom: this.postProcessor.getIntensity('bloom'),
            chromatic: this.postProcessor.getIntensity('chromatic'),
            glitch: this.postProcessor.getIntensity('glitch'),
            scanlines: this.postProcessor.isEnabled('scanlines'),
            vignette: this.postProcessor.isEnabled('vignette'),
            autoRotate: this.visualizerManager.getAutoRotate(),
            cameraShake: this.visualizerManager.getCameraShake(),
            visualizer: this.visualizerManager.getCurrentId(),
            theme: document.body.dataset.theme
        };

        const json = JSON.stringify(currentPreset, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `sonic-architect-preset-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
        console.log('Preset exported');
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(this.animate);

        const deltaTime = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();

        // Update audio analysis
        let audioData = null;
        if (audioEngine.isPlaying) {
            frequencyAnalyzer.update();
            beatDetector.update(deltaTime * 1000);

            audioData = frequencyAnalyzer.getAnalysis();
            const beatData = beatDetector.getState();

            // Update spectrum display
            this.renderSpectrum(audioData);
        } else {
            // Generate idle/demo data for visualization when no audio
            audioData = {
                frequencies: new Uint8Array(128).fill(0),
                timeDomain: new Uint8Array(128).fill(128),
                volume: 0,
                bass: 0,
                mid: 0,
                treble: 0
            };
        }

        // Always update visualizer (with audio data or demo data)
        this.visualizerManager.update(deltaTime, audioData);

        // Update controls
        this.controls.update();

        // Render
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }

        // Update FPS
        this.updateFPS();
    }

    /**
     * Render spectrum visualization
     */
    renderSpectrum(audioData) {
        const canvas = document.getElementById('spectrum-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const bands = audioData.bandsSmoothed;
        const barWidth = width / 32;

        for (let i = 0; i < 32; i++) {
            const value = bands[i];
            const barHeight = value * height;
            const x = i * barWidth;
            const y = height - barHeight;

            // Color gradient based on frequency
            const hue = (i / 32) * 360;
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.fillRect(x, y, barWidth - 2, barHeight);
        }
    }

    /**
     * Update FPS counter
     */
    updateFPS() {
        this.frameCount++;
        const now = performance.now();

        if (now >= this.lastFpsUpdate + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
            this.frameCount = 0;
            this.lastFpsUpdate = now;

            const fpsDisplay = document.getElementById('fps');
            if (fpsDisplay) {
                fpsDisplay.textContent = `${this.fps} FPS`;
            }
        }
    }

    /**
     * Handle window resize
     */
    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);

        this.visualizerManager.resize(width, height);
    }

    /**
     * Hide loader
     */
    hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            setTimeout(() => {
                loader.classList.add('is-loaded');
            }, 500);
        }
    }

    /**
     * Show error
     */
    showError(message) {
        console.error(message);
        // Could show a notification UI here
    }

    /**
     * Load saved state
     */
    async loadState() {
        await playlistManager.load();
    }

    /**
     * Save state
     */
    async saveState() {
        await playlistManager.save();
    }
}

// ==========================================
// INITIALIZE ON DOM READY
// ==========================================

// Make THREE available globally for visualizers
window.THREE = THREE;

// Create and initialize app
const app = new SonicArchitectApp();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
} else {
    app.init();
}

// Export for debugging
window.sonicApp = app;
window.eventBus = eventBus;
window.playlistManager = playlistManager;
window.audioEngine = audioEngine;
