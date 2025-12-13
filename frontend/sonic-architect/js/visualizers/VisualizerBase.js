/**
 * SONIC ARCHITECT MK.III
 * VisualizerBase - Abstract Base Class for All Visualizers
 *
 * All visualizer modes extend this class and implement:
 * - init() - Setup geometry, materials, shaders
 * - update(deltaTime, audioData) - Per-frame updates
 * - onBeat(intensity) - Beat-triggered events
 * - resize(width, height) - Handle viewport changes
 * - setQuality(level) - LOD adjustment
 * - dispose() - Cleanup resources
 * - getControls() - Return visualizer-specific controls
 */

import { eventBus, Events } from '../utils/EventBus.js';
import * as THREE from 'three';

class VisualizerBase {
    constructor(scene, camera, renderer) {
        if (this.constructor === VisualizerBase) {
            throw new Error('VisualizerBase is abstract and cannot be instantiated directly');
        }

        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        // Visualizer identity
        this.id = 'base';
        this.name = 'Base Visualizer';
        this.description = 'Abstract base class';
        this.author = 'Sonic Architect';

        // State
        this.isInitialized = false;
        this.isActive = false;
        this.isPaused = false;

        // Quality settings
        this.quality = 'high'; // 'low', 'medium', 'high', 'ultra'
        this.qualitySettings = {
            low: { segments: 16, particles: 10000 },
            medium: { segments: 32, particles: 50000 },
            high: { segments: 64, particles: 100000 },
            ultra: { segments: 128, particles: 150000 }
        };

        // Root container for all visualizer objects
        this.container = null;

        // Audio data cache
        this.audioData = null;
        this.beatIntensity = 0;
        this.beatDecay = 0.95;

        // Time tracking
        this.elapsedTime = 0;
        this.deltaTime = 0;

        // Default controls (override in subclasses)
        this.controls = {};
        this.defaultControls = {};

        // Performance monitoring
        this.drawCalls = 0;
        this.triangles = 0;
    }

    /**
     * Initialize the visualizer (called once)
     * Override in subclasses
     */
    init() {
        // Create container group
        this.container = new THREE.Group();
        this.container.name = `${this.id}-container`;
        this.scene.add(this.container);

        this.isInitialized = true;
        console.log(`🎨 ${this.name} initialized`);

        return this;
    }

    /**
     * Activate the visualizer (show it)
     */
    activate() {
        if (!this.isInitialized) {
            this.init();
        }

        if (this.container) {
            this.container.visible = true;
        }

        this.isActive = true;
        this.isPaused = false;

        eventBus.emit(Events.VISUALIZER_ACTIVATE, { id: this.id, name: this.name });

        return this;
    }

    /**
     * Deactivate the visualizer (hide it)
     */
    deactivate() {
        if (this.container) {
            this.container.visible = false;
        }

        this.isActive = false;

        eventBus.emit(Events.VISUALIZER_DEACTIVATE, { id: this.id, name: this.name });

        return this;
    }

    /**
     * Update the visualizer (called every frame)
     * Override in subclasses
     */
    update(deltaTime, audioData) {
        if (!this.isActive || this.isPaused) return;

        this.deltaTime = deltaTime;
        this.elapsedTime += deltaTime;
        this.audioData = audioData;

        // Decay beat intensity
        this.beatIntensity *= this.beatDecay;
    }

    /**
     * Handle beat detection
     * Override in subclasses for custom behavior
     */
    onBeat(intensity) {
        this.beatIntensity = Math.max(this.beatIntensity, intensity);
    }

    /**
     * Handle BPM update
     * Override in subclasses if needed
     */
    onBPMUpdate(bpm, confidence) {
        // Subclasses can use this for tempo-synced animations
    }

    /**
     * Handle window resize
     * Override in subclasses if needed
     */
    resize(width, height) {
        // Default implementation - subclasses may need to update
        // internal render targets, etc.
    }

    /**
     * Set quality level
     * Override in subclasses for LOD changes
     */
    setQuality(level) {
        if (this.qualitySettings[level]) {
            this.quality = level;
            console.log(`Quality set to ${level} for ${this.name}`);
        }
    }

    /**
     * Get current quality settings
     */
    getQualitySettings() {
        return this.qualitySettings[this.quality];
    }

    /**
     * Pause the visualizer
     */
    pause() {
        this.isPaused = true;
    }

    /**
     * Resume the visualizer
     */
    resume() {
        this.isPaused = false;
    }

    /**
     * Get visualizer-specific controls
     * Override in subclasses
     */
    getControls() {
        return {
            // Example control structure:
            // sensitivity: { type: 'range', min: 0, max: 2, value: 1, step: 0.1 },
            // color: { type: 'color', value: '#00f0ff' },
            // wireframe: { type: 'toggle', value: false }
        };
    }

    /**
     * Set control value
     */
    setControl(name, value) {
        if (this.controls.hasOwnProperty(name)) {
            this.controls[name] = value;
            this.onControlChange(name, value);
        }
    }

    /**
     * Handle control value change
     * Override in subclasses
     */
    onControlChange(name, value) {
        // Subclasses implement specific control handling
    }

    /**
     * Reset controls to defaults
     */
    resetControls() {
        this.controls = { ...this.defaultControls };
    }

    /**
     * Get visualizer info
     */
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            author: this.author,
            quality: this.quality,
            isActive: this.isActive,
            isInitialized: this.isInitialized
        };
    }

    /**
     * Get performance stats
     */
    getStats() {
        const info = this.renderer.info;
        return {
            drawCalls: info.render.calls,
            triangles: info.render.triangles,
            geometries: info.memory.geometries,
            textures: info.memory.textures
        };
    }

    /**
     * Create shader material helper
     */
    createShaderMaterial(vertexShader, fragmentShader, uniforms = {}) {
        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uBass: { value: 0 },
                uMid: { value: 0 },
                uHigh: { value: 0 },
                uBeatIntensity: { value: 0 },
                ...uniforms
            },
            transparent: true,
            depthWrite: true
        });
    }

    /**
     * Update shader uniforms with audio data
     */
    updateShaderUniforms(material, audioData) {
        if (!material || !material.uniforms) return;

        const uniforms = material.uniforms;

        if (uniforms.uTime) uniforms.uTime.value = this.elapsedTime;
        if (uniforms.uBass && audioData) uniforms.uBass.value = audioData.bassLevel || 0;
        if (uniforms.uMid && audioData) uniforms.uMid.value = audioData.midLevel || 0;
        if (uniforms.uHigh && audioData) uniforms.uHigh.value = audioData.highLevel || 0;
        if (uniforms.uBeatIntensity) uniforms.uBeatIntensity.value = this.beatIntensity;
    }

    /**
     * Dispose of all resources
     * Override in subclasses for specific cleanup
     */
    dispose() {
        if (this.container) {
            // Remove all children
            while (this.container.children.length > 0) {
                const child = this.container.children[0];
                this.disposeObject(child);
                this.container.remove(child);
            }

            // Remove container from scene
            this.scene.remove(this.container);
            this.container = null;
        }

        this.isInitialized = false;
        this.isActive = false;

        console.log(`🗑️ ${this.name} disposed`);
    }

    /**
     * Recursively dispose of an object and its resources
     */
    disposeObject(object) {
        if (object.geometry) {
            object.geometry.dispose();
        }

        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(mat => this.disposeMaterial(mat));
            } else {
                this.disposeMaterial(object.material);
            }
        }

        if (object.children) {
            object.children.forEach(child => this.disposeObject(child));
        }
    }

    /**
     * Dispose of a material and its textures
     */
    disposeMaterial(material) {
        if (!material) return;

        // Dispose textures
        const textureProperties = [
            'map', 'lightMap', 'bumpMap', 'normalMap',
            'specularMap', 'envMap', 'alphaMap', 'aoMap',
            'displacementMap', 'emissiveMap', 'gradientMap',
            'metalnessMap', 'roughnessMap'
        ];

        textureProperties.forEach(prop => {
            if (material[prop]) {
                material[prop].dispose();
            }
        });

        material.dispose();
    }

    /**
     * Helper: Map value from one range to another
     */
    mapRange(value, inMin, inMax, outMin, outMax) {
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }

    /**
     * Helper: Clamp value between min and max
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Helper: Linear interpolation
     */
    lerp(start, end, t) {
        return start + (end - start) * t;
    }

    /**
     * Helper: Smooth step
     */
    smoothstep(edge0, edge1, x) {
        const t = this.clamp((x - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
    }

    /**
     * Helper: Get random value in range
     */
    random(min = 0, max = 1) {
        return Math.random() * (max - min) + min;
    }

    /**
     * Helper: Convert HSL to RGB (returns THREE.Color)
     */
    hslToColor(h, s, l) {
        return new THREE.Color().setHSL(h, s, l);
    }
}

export default VisualizerBase;
