/**
 * MetaballsFluid - marching-cubes metaballs (fluid-like).
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

class MetaballsFluid extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'metaballs';
        this.name = 'Metaballs Fluid';
        this.description = 'Marching cubes metaballs with audio-driven turbulence';
        this.author = 'Harmonizer';

        this.marching = null;
        this.material = null;
        this.lightA = null;
        this.lightB = null;
        this.ambient = null;

        this.controls = {
            resolution: 40,
            ballCount: 10,
            strength: 1.1,
            subtract: 12,
            speed: 1.0,
            scale: 10,
            glow: 1.3,
            wireframe: false,
        };
        this.defaultControls = { ...this.controls };
    }

    init() {
        super.init();

        this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
        this.container.add(this.ambient);

        this.lightA = new THREE.PointLight(0xff00ff, 2.7, 80);
        this.lightA.position.set(8, 10, 10);
        this.container.add(this.lightA);

        this.lightB = new THREE.PointLight(0x00ffff, 2.4, 80);
        this.lightB.position.set(-8, 6, 10);
        this.container.add(this.lightB);

        this.rebuild();
        this.positionCamera();
        return this;
    }

    positionCamera() {
        this.camera.position.set(0, 5, 16);
        this.camera.lookAt(0, 0, 0);
    }

    rebuild() {
        if (this.marching) {
            this.container.remove(this.marching);
            this.marching.material.dispose();
            this.marching = null;
        }

        const res = Math.max(18, Math.min(72, Math.floor(this.controls.resolution)));

        this.material = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x001122,
            emissiveIntensity: this.controls.glow,
            metalness: 0.15,
            roughness: 0.12,
            transparent: true,
            opacity: 0.98,
            wireframe: !!this.controls.wireframe,
        });

        this.marching = new MarchingCubes(res, this.material, true, true, 100000);
        this.marching.position.set(0, 0, 0);
        this.marching.scale.set(this.controls.scale, this.controls.scale, this.controls.scale);
        this.marching.isolation = 80;
        this.marching.frustumCulled = false;
        this.container.add(this.marching);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);
        if (!this.marching) return;

        const bass = audioData?.bassLevel || 0;
        const mid = audioData?.midLevel || 0;
        const high = audioData?.highLevel || 0;
        const beat = this.beatIntensity;

        const t = this.elapsedTime;
        const count = Math.max(3, Math.min(18, Math.floor(this.controls.ballCount)));
        const speed = (0.4 + this.controls.speed) * (0.7 + mid);

        const strength = (this.controls.strength + bass * 0.8 + beat * 0.35);
        const subtract = this.controls.subtract + high * 4.0;

        this.marching.reset();

        for (let i = 0; i < 18; i++) {
            if (i >= count) break;
            const fi = i / Math.max(1, count);
            const a = fi * Math.PI * 2.0 + t * 0.35 * speed;
            const b = fi * 12.0 + t * 0.6 * speed;
            const x = 0.5 + 0.18 * Math.cos(a) + 0.08 * Math.sin(b);
            const y = 0.5 + 0.18 * Math.sin(a * 1.1) + 0.08 * Math.cos(b * 1.2);
            const z = 0.5 + 0.18 * Math.sin(a * 0.9 + 1.3) + 0.08 * Math.sin(b * 0.7);
            this.marching.addBall(x, y, z, strength, subtract);
        }

        // Mild plane to create “pool” feel
        this.marching.addPlaneY(2, 12);

        // Drive emissive and lights with audio
        if (this.material) {
            this.material.emissiveIntensity = this.controls.glow * (1.0 + high * 0.9 + beat * 1.4);
            this.material.wireframe = !!this.controls.wireframe;
        }

        this.lightA.position.set(Math.cos(t * 0.6) * 10, 8 + Math.sin(t * 0.8) * 2, Math.sin(t * 0.6) * 10);
        this.lightB.position.set(Math.cos(t * 0.48 + 1.7) * 10, 6 + Math.sin(t * 0.65) * 2, Math.sin(t * 0.48 + 1.7) * 10);
        this.lightA.intensity = 2.0 + beat * 4.5 + bass * 1.3;
        this.lightB.intensity = 1.8 + beat * 3.8 + mid * 1.0;
    }

    onControlChange(name, value) {
        this.controls[name] = value;
        if (name === 'wireframe' && this.material) {
            this.material.wireframe = !!value;
        }
        if (name === 'glow' && this.material) {
            this.material.emissiveIntensity = value;
        }
        if (name === 'resolution' || name === 'scale') {
            if (this.isInitialized) this.rebuild();
        }
    }

    getControls() {
        return {
            resolution: { type: 'range', label: 'Resolution', min: 18, max: 72, step: 1, value: this.controls.resolution },
            ballCount: { type: 'range', label: 'Ball Count', min: 3, max: 18, step: 1, value: this.controls.ballCount },
            strength: { type: 'range', label: 'Strength', min: 0.4, max: 2.5, step: 0.05, value: this.controls.strength },
            subtract: { type: 'range', label: 'Subtract', min: 2, max: 20, step: 0.25, value: this.controls.subtract },
            speed: { type: 'range', label: 'Speed', min: 0, max: 3, step: 0.05, value: this.controls.speed },
            scale: { type: 'range', label: 'Scale', min: 6, max: 16, step: 0.25, value: this.controls.scale },
            glow: { type: 'range', label: 'Glow', min: 0, max: 4, step: 0.05, value: this.controls.glow },
            wireframe: { type: 'toggle', label: 'Wireframe', value: this.controls.wireframe },
        };
    }

    dispose() {
        if (this.marching) {
            this.container.remove(this.marching);
            this.marching.material.dispose();
            this.marching = null;
        }
        if (this.lightA) this.container.remove(this.lightA);
        if (this.lightB) this.container.remove(this.lightB);
        if (this.ambient) this.container.remove(this.ambient);
        this.lightA = null;
        this.lightB = null;
        this.ambient = null;
        this.material = null;
        super.dispose();
    }
}

export default MetaballsFluid;

