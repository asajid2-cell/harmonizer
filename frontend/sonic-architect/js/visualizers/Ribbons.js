/**
 * SONIC ARCHITECT MK.III
 * Ribbons - Flowing Bezier Ribbon Streams
 *
 * Features:
 * - Multiple flowing ribbon trails
 * - Audio-reactive movement and width
 * - Smooth bezier interpolation
 * - Beat-triggered color bursts
 * - Trail fade effect
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class Ribbons extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'ribbons';
        this.name = 'Ribbons';
        this.description = 'Flowing bezier ribbon streams';
        this.author = '3D Visualizer';

        // Ribbons array
        this.ribbons = [];
        this.ribbonMeshes = [];
        this.ribbonMaterials = [];

        // Configuration
        this.controls = {
            ribbonCount: 8,
            trailLength: 100,
            ribbonWidth: 0.2,
            speed: 1,
            noiseScale: 0.5,
            colorIntensity: 1
        };

        this.defaultControls = { ...this.controls };

        // Colors
        this.colors = [
            new THREE.Color(0x00f0ff),
            new THREE.Color(0xff00ff),
            new THREE.Color(0x00ff00),
            new THREE.Color(0xffff00),
            new THREE.Color(0xff6600),
            new THREE.Color(0x0066ff),
            new THREE.Color(0xff0066),
            new THREE.Color(0x66ff00)
        ];

        // Quality settings
        this.qualitySettings = {
            low: { ribbons: 4, trailLength: 50 },
            medium: { ribbons: 8, trailLength: 80 },
            high: { ribbons: 12, trailLength: 100 },
            ultra: { ribbons: 16, trailLength: 150 }
        };
    }

    init() {
        super.init();

        const quality = this.getQualitySettings();
        this.controls.ribbonCount = quality.ribbons;
        this.controls.trailLength = quality.trailLength;

        this.createRibbons();

        return this;
    }

    createRibbons() {
        // Clear existing
        this.ribbonMeshes.forEach(mesh => {
            this.container.remove(mesh);
            mesh.geometry.dispose();
        });
        this.ribbonMaterials.forEach(mat => mat.dispose());
        this.ribbons = [];
        this.ribbonMeshes = [];
        this.ribbonMaterials = [];

        const count = this.controls.ribbonCount;
        const trailLength = this.controls.trailLength;

        for (let i = 0; i < count; i++) {
            // Initialize ribbon data
            const ribbon = {
                points: [],
                velocities: [],
                target: new THREE.Vector3(),
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5,
                color: this.colors[i % this.colors.length].clone()
            };

            // Initialize trail points
            const startAngle = (i / count) * Math.PI * 2;
            const startRadius = 2;
            const startX = Math.cos(startAngle) * startRadius;
            const startZ = Math.sin(startAngle) * startRadius;

            for (let j = 0; j < trailLength; j++) {
                ribbon.points.push(new THREE.Vector3(
                    startX,
                    Math.sin(j * 0.1) * 0.5,
                    startZ
                ));
                ribbon.velocities.push(new THREE.Vector3());
            }

            this.ribbons.push(ribbon);

            // Create ribbon geometry
            const geometry = this.createRibbonGeometry(ribbon.points);

            // Create material
            const material = new THREE.MeshBasicMaterial({
                color: ribbon.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = `ribbon-${i}`;

            this.ribbonMeshes.push(mesh);
            this.ribbonMaterials.push(material);
            this.container.add(mesh);
        }
    }

    createRibbonGeometry(points) {
        const width = this.controls.ribbonWidth;
        const len = points.length;

        const positions = [];
        const indices = [];
        const uvs = [];

        for (let i = 0; i < len; i++) {
            const point = points[i];

            // Calculate tangent for ribbon orientation
            let tangent;
            if (i === 0) {
                tangent = new THREE.Vector3().subVectors(points[1], points[0]);
            } else if (i === len - 1) {
                tangent = new THREE.Vector3().subVectors(points[len - 1], points[len - 2]);
            } else {
                tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]);
            }
            tangent.normalize();

            // Calculate perpendicular (ribbon width direction)
            const up = new THREE.Vector3(0, 1, 0);
            const perp = new THREE.Vector3().crossVectors(tangent, up).normalize();

            // Fade width at the end
            const t = i / (len - 1);
            const fadeWidth = width * (1 - t * t);

            // Two vertices per point (ribbon edges)
            positions.push(
                point.x + perp.x * fadeWidth,
                point.y + perp.y * fadeWidth,
                point.z + perp.z * fadeWidth
            );
            positions.push(
                point.x - perp.x * fadeWidth,
                point.y - perp.y * fadeWidth,
                point.z - perp.z * fadeWidth
            );

            // UVs
            uvs.push(0, t);
            uvs.push(1, t);

            // Indices (create quads)
            if (i < len - 1) {
                const base = i * 2;
                indices.push(base, base + 1, base + 2);
                indices.push(base + 1, base + 3, base + 2);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        return geometry;
    }

    updateRibbonGeometry(mesh, points) {
        const geometry = mesh.geometry;
        const positions = geometry.attributes.position.array;
        const width = this.controls.ribbonWidth;
        const len = points.length;

        let posIndex = 0;

        for (let i = 0; i < len; i++) {
            const point = points[i];

            let tangent;
            if (i === 0) {
                tangent = new THREE.Vector3().subVectors(points[1], points[0]);
            } else if (i === len - 1) {
                tangent = new THREE.Vector3().subVectors(points[len - 1], points[len - 2]);
            } else {
                tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]);
            }
            tangent.normalize();

            const up = new THREE.Vector3(0, 1, 0);
            const perp = new THREE.Vector3().crossVectors(tangent, up).normalize();

            const t = i / (len - 1);
            const fadeWidth = width * (1 - t * t) * (1 + this.beatIntensity * 0.5);

            positions[posIndex++] = point.x + perp.x * fadeWidth;
            positions[posIndex++] = point.y + perp.y * fadeWidth;
            positions[posIndex++] = point.z + perp.z * fadeWidth;

            positions[posIndex++] = point.x - perp.x * fadeWidth;
            positions[posIndex++] = point.y - perp.y * fadeWidth;
            positions[posIndex++] = point.z - perp.z * fadeWidth;
        }

        geometry.attributes.position.needsUpdate = true;
    }

    // Simple noise function
    noise3D(x, y, z) {
        return Math.sin(x * 1.5) * Math.cos(y * 1.3) * Math.sin(z * 1.7);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        const time = this.elapsedTime;
        const speed = this.controls.speed;
        const noiseScale = this.controls.noiseScale;

        // Get audio values
        let bass = 0, mid = 0, high = 0;
        if (audioData) {
            bass = audioData.bassLevel || 0;
            mid = audioData.midLevel || 0;
            high = audioData.highLevel || 0;
        }

        // Update each ribbon
        for (let i = 0; i < this.ribbons.length; i++) {
            const ribbon = this.ribbons[i];
            const points = ribbon.points;

            // Move head point with noise-based motion
            const head = points[0];
            const phase = ribbon.phase + time * ribbon.speed * speed;

            // Target position using 3D noise
            const targetRadius = 3 + bass * 2;
            ribbon.target.set(
                Math.cos(phase) * targetRadius + this.noise3D(time * 0.5, i, 0) * 2,
                Math.sin(phase * 0.7) * 2 + mid * 2,
                Math.sin(phase) * targetRadius + this.noise3D(0, i, time * 0.5) * 2
            );

            // Smooth follow with velocity
            const vel = ribbon.velocities[0];
            vel.x += (ribbon.target.x - head.x) * 0.05;
            vel.y += (ribbon.target.y - head.y) * 0.05;
            vel.z += (ribbon.target.z - head.z) * 0.05;

            // Damping
            vel.multiplyScalar(0.95);

            // Apply velocity
            head.add(vel);

            // Propagate motion down the trail
            for (let j = points.length - 1; j > 0; j--) {
                points[j].lerp(points[j - 1], 0.5);
            }

            // Update geometry
            this.updateRibbonGeometry(this.ribbonMeshes[i], points);

            // Update color based on audio
            const material = this.ribbonMaterials[i];
            const baseColor = ribbon.color;
            const intensity = this.controls.colorIntensity;

            material.color.setRGB(
                baseColor.r * (0.5 + bass * intensity),
                baseColor.g * (0.5 + mid * intensity),
                baseColor.b * (0.5 + high * intensity)
            );

            material.opacity = 0.6 + this.beatIntensity * 0.3;
        }

        // Rotate container slowly
        this.container.rotation.y += deltaTime * 0.1;
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Pulse all ribbon colors on beat
        this.ribbonMaterials.forEach(mat => {
            mat.opacity = Math.min(1, 0.8 + intensity * 0.2);
        });
    }

    onControlChange(name, value) {
        this.controls[name] = value;

        if (['ribbonCount', 'trailLength'].includes(name)) {
            this.createRibbons();
        }
    }

    getControls() {
        return {
            speed: {
                type: 'range',
                label: 'Speed',
                min: 0.1,
                max: 3,
                step: 0.1,
                value: this.controls.speed
            },
            ribbonWidth: {
                type: 'range',
                label: 'Width',
                min: 0.05,
                max: 0.5,
                step: 0.05,
                value: this.controls.ribbonWidth
            },
            noiseScale: {
                type: 'range',
                label: 'Chaos',
                min: 0.1,
                max: 2,
                step: 0.1,
                value: this.controls.noiseScale
            },
            colorIntensity: {
                type: 'range',
                label: 'Color Intensity',
                min: 0.5,
                max: 2,
                step: 0.1,
                value: this.controls.colorIntensity
            }
        };
    }

    setQuality(level) {
        super.setQuality(level);

        if (this.isInitialized) {
            const quality = this.getQualitySettings();
            this.controls.ribbonCount = quality.ribbons;
            this.controls.trailLength = quality.trailLength;
            this.createRibbons();
        }
    }

    dispose() {
        this.ribbonMeshes.forEach(mesh => mesh.geometry.dispose());
        this.ribbonMaterials.forEach(mat => mat.dispose());
        super.dispose();
    }
}

export default Ribbons;
