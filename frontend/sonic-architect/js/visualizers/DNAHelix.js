/**
 * SONIC ARCHITECT MK.III
 * DNA Helix - Double Helix Structure with Audio-Reactive Rotation
 *
 * Features:
 * - Dual intertwined helical strands
 * - Audio-reactive rotation and base pair connections
 * - Beat-triggered pulse waves
 * - Iridescent shader coloring
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class DNAHelix extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'dna';
        this.name = 'DNA Helix';
        this.description = 'Double helix structure with audio-reactive rotation';

        // Helix parameters
        this.helixRadius = 2;
        this.helixHeight = 8;
        this.turns = 4;
        this.segments = 200;
        this.basePairs = 40;

        // Meshes
        this.strand1 = null;
        this.strand2 = null;
        this.basePairMeshes = [];
        this.glowPoints = null;

        // Animation
        this.rotationSpeed = 0.3;
        this.pulsePhase = 0;

        this.controls = {
            rotationSpeed: 0.3,
            helixTightness: 1.0,
            glowIntensity: 1.0,
            basePairCount: 40
        };
    }

    init() {
        super.init();

        // Create helix strands
        this.createStrand1();
        this.createStrand2();
        this.createBasePairs();
        this.createGlowPoints();

        return this;
    }

    createStrand1() {
        const points = [];
        for (let i = 0; i <= this.segments; i++) {
            const t = i / this.segments;
            const angle = t * Math.PI * 2 * this.turns;
            const y = (t - 0.5) * this.helixHeight;

            points.push(new THREE.Vector3(
                Math.cos(angle) * this.helixRadius,
                y,
                Math.sin(angle) * this.helixRadius
            ));
        }

        const curve = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(curve, this.segments, 0.1, 8, false);

        const material = new THREE.MeshPhongMaterial({
            color: 0x00ffff,
            emissive: 0x0088ff,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });

        this.strand1 = new THREE.Mesh(geometry, material);
        this.container.add(this.strand1);
    }

    createStrand2() {
        const points = [];
        for (let i = 0; i <= this.segments; i++) {
            const t = i / this.segments;
            const angle = t * Math.PI * 2 * this.turns + Math.PI; // Offset by 180°
            const y = (t - 0.5) * this.helixHeight;

            points.push(new THREE.Vector3(
                Math.cos(angle) * this.helixRadius,
                y,
                Math.sin(angle) * this.helixRadius
            ));
        }

        const curve = new THREE.CatmullRomCurve3(points);
        const geometry = new THREE.TubeGeometry(curve, this.segments, 0.1, 8, false);

        const material = new THREE.MeshPhongMaterial({
            color: 0xff00ff,
            emissive: 0xff0088,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });

        this.strand2 = new THREE.Mesh(geometry, material);
        this.container.add(this.strand2);
    }

    createBasePairs() {
        const geometry = new THREE.CylinderGeometry(0.05, 0.05, this.helixRadius * 2, 6);

        for (let i = 0; i < this.basePairs; i++) {
            const t = i / this.basePairs;
            const angle = t * Math.PI * 2 * this.turns;
            const y = (t - 0.5) * this.helixHeight;

            const material = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(t, 0.7, 0.5),
                emissive: new THREE.Color().setHSL(t, 0.7, 0.3),
                transparent: true,
                opacity: 0.7
            });

            const pair = new THREE.Mesh(geometry, material);
            pair.position.y = y;
            pair.rotation.z = Math.PI / 2;
            pair.rotation.y = angle;

            this.basePairMeshes.push(pair);
            this.container.add(pair);
        }
    }

    createGlowPoints() {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];

        for (let i = 0; i < 500; i++) {
            const t = Math.random();
            const angle = t * Math.PI * 2 * this.turns + (Math.random() < 0.5 ? 0 : Math.PI);
            const y = (t - 0.5) * this.helixHeight;
            const r = this.helixRadius + (Math.random() - 0.5) * 0.5;

            positions.push(
                Math.cos(angle) * r,
                y,
                Math.sin(angle) * r
            );

            const color = new THREE.Color().setHSL(t, 1.0, 0.6);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.glowPoints = new THREE.Points(geometry, material);
        this.container.add(this.glowPoints);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        if (!audioData) return;

        const bass = audioData.bass || 0;
        const mid = audioData.mid || 0;
        const high = audioData.high || 0;

        // Rotate helixes
        const rotationDelta = this.rotationSpeed * deltaTime * (1 + bass * 0.5);
        this.container.rotation.y += rotationDelta;

        // Pulse base pairs
        this.pulsePhase += deltaTime * 2;
        this.basePairMeshes.forEach((pair, i) => {
            const t = i / this.basePairs;
            const wave = Math.sin(this.pulsePhase + t * Math.PI * 4) * 0.3;
            const audioScale = 1 + (bass * 0.3 + mid * 0.2) * wave;

            pair.scale.x = audioScale;
            pair.material.opacity = 0.5 + wave * 0.3 + high * 0.2;
        });

        // Glow points
        if (this.glowPoints) {
            this.glowPoints.material.opacity = 0.6 + high * 0.4;
            this.glowPoints.rotation.y = -this.container.rotation.y * 0.5;
        }

        // Strand colors based on audio
        if (this.strand1) {
            this.strand1.material.emissiveIntensity = 0.5 + bass * 0.5;
        }
        if (this.strand2) {
            this.strand2.material.emissiveIntensity = 0.5 + mid * 0.5;
        }
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Pulse effect on beat
        this.basePairMeshes.forEach(pair => {
            pair.scale.y = 1 + intensity * 0.5;
        });
    }

    dispose() {
        if (this.strand1) {
            this.strand1.geometry.dispose();
            this.strand1.material.dispose();
        }
        if (this.strand2) {
            this.strand2.geometry.dispose();
            this.strand2.material.dispose();
        }
        this.basePairMeshes.forEach(pair => {
            pair.geometry.dispose();
            pair.material.dispose();
        });
        if (this.glowPoints) {
            this.glowPoints.geometry.dispose();
            this.glowPoints.material.dispose();
        }

        super.dispose();
    }
}

export default DNAHelix;
