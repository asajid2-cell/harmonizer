/**
 * SONIC ARCHITECT MK.III
 * AudioBars3D - 3D Equalizer Bars Visualization
 *
 * Features:
 * - Circular or grid arrangement
 * - Per-bar frequency mapping
 * - Audio-reactive height, color, and glow
 * - Beat-triggered pulse effects
 * - Smooth bar animations
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class AudioBars3D extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'bars';
        this.name = 'Audio Bars';
        this.description = '3D equalizer bars in circular/grid layout';
        this.author = 'Sonic Architect';

        // Bars
        this.bars = [];
        this.barMaterials = [];

        // Configuration
        this.controls = {
            barCount: 64,
            layout: 'circular', // 'circular', 'grid', 'wave'
            sensitivity: 1.5,
            smoothing: 0.7,
            minHeight: 0.1,
            maxHeight: 5,
            barWidth: 0.15,
            barGap: 0.05,
            colorMode: 'frequency', // 'frequency', 'height', 'solid'
            rotationSpeed: 0.1,
            reflection: true
        };

        this.defaultControls = { ...this.controls };

        // Animation state
        this.barHeights = [];
        this.targetHeights = [];

        // Quality settings
        this.qualitySettings = {
            low: { barCount: 32, segments: 4 },
            medium: { barCount: 64, segments: 8 },
            high: { barCount: 128, segments: 12 },
            ultra: { barCount: 256, segments: 16 }
        };

        // Colors
        this.gradientColors = [
            new THREE.Color(0x00f0ff), // Low frequency - cyan
            new THREE.Color(0x00ff00), // Mid-low - green
            new THREE.Color(0xffff00), // Mid - yellow
            new THREE.Color(0xff8800), // Mid-high - orange
            new THREE.Color(0xff0000)  // High - red
        ];
    }

    init() {
        super.init();

        const quality = this.getQualitySettings();
        this.controls.barCount = quality.barCount;

        this.createBars();

        // Add floor reflection plane
        if (this.controls.reflection) {
            this.createReflectionPlane();
        }

        return this;
    }

    createBars() {
        const count = this.controls.barCount;
        const layout = this.controls.layout;

        // Initialize height arrays
        this.barHeights = new Array(count).fill(this.controls.minHeight);
        this.targetHeights = new Array(count).fill(this.controls.minHeight);

        // Clear existing bars
        this.bars.forEach(bar => {
            this.container.remove(bar);
            bar.geometry.dispose();
        });
        this.barMaterials.forEach(mat => mat.dispose());
        this.bars = [];
        this.barMaterials = [];

        const quality = this.getQualitySettings();

        for (let i = 0; i < count; i++) {
            // Create bar geometry
            const geometry = new THREE.BoxGeometry(
                this.controls.barWidth,
                1, // Height will be scaled
                this.controls.barWidth,
                1, 1, quality.segments
            );

            // Shift geometry so bottom is at y=0
            geometry.translate(0, 0.5, 0);

            // Color based on frequency position
            const colorT = i / count;
            const color = this.getGradientColor(colorT);

            const material = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.3,
                metalness: 0.7,
                roughness: 0.3,
                transparent: true,
                opacity: 0.9
            });

            const bar = new THREE.Mesh(geometry, material);

            // Position based on layout
            this.positionBar(bar, i, count, layout);

            bar.userData = { index: i, baseColor: color.clone() };

            this.bars.push(bar);
            this.barMaterials.push(material);
            this.container.add(bar);
        }
    }

    positionBar(bar, index, total, layout) {
        const i = index;
        const n = total;

        switch (layout) {
            case 'circular': {
                const angle = (i / n) * Math.PI * 2;
                const radius = 3;
                bar.position.x = Math.cos(angle) * radius;
                bar.position.z = Math.sin(angle) * radius;
                bar.position.y = 0;
                // Face outward
                bar.lookAt(bar.position.x * 2, 0, bar.position.z * 2);
                break;
            }

            case 'grid': {
                const gridSize = Math.ceil(Math.sqrt(n));
                const spacing = this.controls.barWidth + this.controls.barGap;
                const offset = (gridSize * spacing) / 2;

                const row = Math.floor(i / gridSize);
                const col = i % gridSize;

                bar.position.x = col * spacing - offset + spacing / 2;
                bar.position.z = row * spacing - offset + spacing / 2;
                bar.position.y = 0;
                break;
            }

            case 'wave': {
                const spacing = this.controls.barWidth + this.controls.barGap;
                const totalWidth = n * spacing;
                bar.position.x = i * spacing - totalWidth / 2 + spacing / 2;
                bar.position.z = 0;
                bar.position.y = 0;
                break;
            }
        }
    }

    createReflectionPlane() {
        const geometry = new THREE.PlaneGeometry(20, 20);
        const material = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.9,
            roughness: 0.1,
            transparent: true,
            opacity: 0.5
        });

        const plane = new THREE.Mesh(geometry, material);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.01;
        plane.receiveShadow = true;
        plane.name = 'reflection-plane';

        this.container.add(plane);
    }

    getGradientColor(t) {
        const colors = this.gradientColors;
        const n = colors.length - 1;
        const i = Math.floor(t * n);
        const f = (t * n) % 1;

        if (i >= n) return colors[n].clone();

        return colors[i].clone().lerp(colors[i + 1], f);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        if (!audioData || !audioData.bands) return;

        const bands = audioData.bandsSmoothed || audioData.bands;
        const count = this.bars.length;

        // Map frequency bands to bars
        for (let i = 0; i < count; i++) {
            // Map bar index to frequency band
            const bandIndex = Math.floor((i / count) * 32);
            const value = bands[bandIndex] || 0;

            // Calculate target height
            const targetHeight = this.controls.minHeight +
                value * this.controls.sensitivity * (this.controls.maxHeight - this.controls.minHeight);

            this.targetHeights[i] = targetHeight;
        }

        // Smoothly interpolate heights
        for (let i = 0; i < count; i++) {
            const smoothing = this.controls.smoothing;
            this.barHeights[i] = this.barHeights[i] * smoothing +
                                  this.targetHeights[i] * (1 - smoothing);

            const bar = this.bars[i];
            const height = this.barHeights[i];

            // Scale bar
            bar.scale.y = height;

            // Update color based on mode
            this.updateBarColor(bar, i, height);
        }

        // Rotate container
        if (this.controls.layout === 'circular') {
            this.container.rotation.y += deltaTime * this.controls.rotationSpeed;
        }

        // Beat pulse
        if (this.beatIntensity > 0.1) {
            this.barMaterials.forEach(mat => {
                mat.emissiveIntensity = 0.3 + this.beatIntensity * 0.5;
            });
        }
    }

    updateBarColor(bar, index, height) {
        const material = this.barMaterials[index];
        const mode = this.controls.colorMode;

        let color;

        switch (mode) {
            case 'frequency':
                // Color based on frequency position (already set)
                color = bar.userData.baseColor;
                break;

            case 'height':
                // Color based on current height
                const heightT = (height - this.controls.minHeight) /
                               (this.controls.maxHeight - this.controls.minHeight);
                color = this.getGradientColor(heightT);
                break;

            case 'solid':
                // Keep base color
                color = bar.userData.baseColor;
                break;
        }

        material.color.copy(color);
        material.emissive.copy(color);
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Pulse all bars slightly
        this.targetHeights = this.targetHeights.map(h =>
            h + intensity * 0.3
        );
    }

    onControlChange(name, value) {
        switch (name) {
            case 'barCount':
                this.controls.barCount = value;
                this.createBars();
                break;

            case 'layout':
                this.controls.layout = value;
                this.bars.forEach((bar, i) => {
                    this.positionBar(bar, i, this.bars.length, value);
                });
                break;

            case 'barWidth':
            case 'barGap':
                this.controls[name] = value;
                this.createBars();
                break;

            default:
                this.controls[name] = value;
        }
    }

    getControls() {
        return {
            sensitivity: {
                type: 'range',
                label: 'Sensitivity',
                min: 0.5,
                max: 3,
                step: 0.1,
                value: this.controls.sensitivity
            },
            smoothing: {
                type: 'range',
                label: 'Smoothing',
                min: 0,
                max: 0.95,
                step: 0.05,
                value: this.controls.smoothing
            },
            maxHeight: {
                type: 'range',
                label: 'Max Height',
                min: 2,
                max: 10,
                step: 0.5,
                value: this.controls.maxHeight
            },
            rotationSpeed: {
                type: 'range',
                label: 'Rotation',
                min: 0,
                max: 0.5,
                step: 0.05,
                value: this.controls.rotationSpeed
            },
            layout: {
                type: 'select',
                label: 'Layout',
                options: ['circular', 'grid', 'wave'],
                value: this.controls.layout
            },
            colorMode: {
                type: 'select',
                label: 'Color Mode',
                options: ['frequency', 'height', 'solid'],
                value: this.controls.colorMode
            }
        };
    }

    setQuality(level) {
        super.setQuality(level);

        if (this.isInitialized) {
            const quality = this.getQualitySettings();
            this.controls.barCount = quality.barCount;
            this.createBars();
        }
    }

    dispose() {
        this.bars.forEach(bar => {
            bar.geometry.dispose();
        });
        this.barMaterials.forEach(mat => mat.dispose());
        super.dispose();
    }
}

export default AudioBars3D;
