/**
 * SONIC ARCHITECT MK.III
 * WaveformTunnel - Infinite Fly-Through Tunnel Visualization
 *
 * Features:
 * - Infinite scrolling tunnel geometry
 * - Audio-reactive ring deformation
 * - Color wave propagation
 * - Beat-triggered speed bursts
 * - Multiple ring styles
 */

import VisualizerBase from './VisualizerBase.js';

class WaveformTunnel extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'tunnel';
        this.name = 'Waveform Tunnel';
        this.description = 'Infinite fly-through with audio-reactive geometry';
        this.author = 'Sonic Architect';

        // Tunnel segments
        this.rings = [];
        this.ringMaterials = [];

        // Configuration
        this.controls = {
            speed: 5,
            ringCount: 60,
            ringSegments: 64,
            radius: 3,
            deformation: 1.5,
            colorSpeed: 0.5,
            wireframe: true,
            style: 'lines' // 'lines', 'solid', 'dots'
        };

        this.defaultControls = { ...this.controls };

        // Animation state
        this.offset = 0;
        this.colorOffset = 0;

        // Quality settings
        this.qualitySettings = {
            low: { rings: 30, segments: 32 },
            medium: { rings: 60, segments: 64 },
            high: { rings: 100, segments: 128 },
            ultra: { rings: 150, segments: 256 }
        };
    }

    init() {
        super.init();

        const quality = this.getQualitySettings();
        this.controls.ringCount = quality.rings;
        this.controls.ringSegments = quality.segments;

        this.createTunnel();

        // Move camera to tunnel entrance
        this.camera.position.set(0, 0, 5);
        this.camera.lookAt(0, 0, -100);

        return this;
    }

    createTunnel() {
        const { ringCount, ringSegments, radius } = this.controls;

        // Clear existing rings
        this.rings.forEach(ring => {
            this.container.remove(ring);
            ring.geometry.dispose();
        });
        this.ringMaterials.forEach(mat => mat.dispose());
        this.rings = [];
        this.ringMaterials = [];

        const ringSpacing = 2;

        for (let i = 0; i < ringCount; i++) {
            // Create ring geometry (torus with flat profile)
            const geometry = new THREE.RingGeometry(
                radius - 0.1,
                radius,
                ringSegments,
                1
            );

            // Create vertices for line rendering
            const lineGeometry = new THREE.BufferGeometry();
            const positions = [];
            const colors = [];

            for (let j = 0; j <= ringSegments; j++) {
                const angle = (j / ringSegments) * Math.PI * 2;
                positions.push(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
                    0
                );

                // Color gradient around ring
                const hue = (j / ringSegments + i / ringCount) % 1;
                const color = new THREE.Color().setHSL(hue, 1, 0.5);
                colors.push(color.r, color.g, color.b);
            }

            lineGeometry.setAttribute('position',
                new THREE.Float32BufferAttribute(positions, 3));
            lineGeometry.setAttribute('color',
                new THREE.Float32BufferAttribute(colors, 3));

            // Material
            const material = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });

            // Create ring
            const ring = new THREE.LineLoop(lineGeometry, material);
            ring.position.z = -i * ringSpacing;
            ring.userData = {
                index: i,
                baseZ: -i * ringSpacing,
                originalPositions: positions.slice()
            };

            this.rings.push(ring);
            this.ringMaterials.push(material);
            this.container.add(ring);
        }
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        // Update tunnel scroll
        const speed = this.controls.speed * (1 + this.beatIntensity * 2);
        this.offset += deltaTime * speed;
        this.colorOffset += deltaTime * this.controls.colorSpeed;

        const ringSpacing = 2;
        const totalLength = this.controls.ringCount * ringSpacing;

        // Get frequency data
        let frequencyData = null;
        if (audioData && audioData.bands) {
            frequencyData = audioData.bandsSmoothed || audioData.bands;
        }

        // Update each ring
        for (let i = 0; i < this.rings.length; i++) {
            const ring = this.rings[i];
            const baseZ = ring.userData.baseZ;

            // Calculate new Z position (loop)
            let z = baseZ + this.offset;
            while (z > ringSpacing) {
                z -= totalLength;
            }
            ring.position.z = z;

            // Calculate distance factor (0 at camera, 1 at far)
            const distFactor = (-z + ringSpacing) / totalLength;

            // Update ring opacity based on distance
            const material = this.ringMaterials[i];
            material.opacity = 0.3 + (1 - distFactor) * 0.7;

            // Deform ring based on audio
            if (frequencyData) {
                this.deformRing(ring, frequencyData, distFactor);
            }

            // Update colors
            this.updateRingColors(ring, distFactor);
        }
    }

    deformRing(ring, frequencyData, distFactor) {
        const geometry = ring.geometry;
        const positions = geometry.attributes.position.array;
        const originalPositions = ring.userData.originalPositions;
        const segments = this.controls.ringSegments;
        const baseRadius = this.controls.radius;
        const deformAmount = this.controls.deformation;

        for (let j = 0; j <= segments; j++) {
            // Map segment to frequency band
            const bandIndex = Math.floor((j / segments) * 32);
            const value = frequencyData[bandIndex] || 0;

            // Calculate deformation
            const deform = value * deformAmount * (1 - distFactor * 0.5);

            const angle = (j / segments) * Math.PI * 2;
            const radius = baseRadius + deform;

            positions[j * 3] = Math.cos(angle) * radius;
            positions[j * 3 + 1] = Math.sin(angle) * radius;
        }

        geometry.attributes.position.needsUpdate = true;
    }

    updateRingColors(ring, distFactor) {
        const geometry = ring.geometry;
        const colors = geometry.attributes.color.array;
        const segments = this.controls.ringSegments;

        for (let j = 0; j <= segments; j++) {
            // Animated color based on position and time
            const hue = (j / segments + distFactor + this.colorOffset) % 1;
            const saturation = 0.8 + this.beatIntensity * 0.2;
            const lightness = 0.4 + (1 - distFactor) * 0.3 + this.beatIntensity * 0.2;

            const color = new THREE.Color().setHSL(hue, saturation, lightness);

            colors[j * 3] = color.r;
            colors[j * 3 + 1] = color.g;
            colors[j * 3 + 2] = color.b;
        }

        geometry.attributes.color.needsUpdate = true;
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        // Speed burst handled via beatIntensity in update
    }

    onControlChange(name, value) {
        this.controls[name] = value;

        if (['ringCount', 'ringSegments', 'radius'].includes(name)) {
            this.createTunnel();
        }
    }

    getControls() {
        return {
            speed: {
                type: 'range',
                label: 'Speed',
                min: 1,
                max: 20,
                step: 0.5,
                value: this.controls.speed
            },
            deformation: {
                type: 'range',
                label: 'Deformation',
                min: 0,
                max: 3,
                step: 0.1,
                value: this.controls.deformation
            },
            radius: {
                type: 'range',
                label: 'Tunnel Size',
                min: 1,
                max: 6,
                step: 0.5,
                value: this.controls.radius
            },
            colorSpeed: {
                type: 'range',
                label: 'Color Speed',
                min: 0,
                max: 2,
                step: 0.1,
                value: this.controls.colorSpeed
            }
        };
    }

    setQuality(level) {
        super.setQuality(level);

        if (this.isInitialized) {
            const quality = this.getQualitySettings();
            this.controls.ringCount = quality.rings;
            this.controls.ringSegments = quality.segments;
            this.createTunnel();
        }
    }

    dispose() {
        this.rings.forEach(ring => ring.geometry.dispose());
        this.ringMaterials.forEach(mat => mat.dispose());
        super.dispose();
    }
}

export default WaveformTunnel;
