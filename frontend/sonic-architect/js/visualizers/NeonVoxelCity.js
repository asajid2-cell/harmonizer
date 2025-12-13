/**
 * NeonVoxelCity - instanced neon skyline.
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class NeonVoxelCity extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'city';
        this.name = 'Neon Voxel City';
        this.description = 'Instanced neon skyline reacting to audio';
        this.author = 'Harmonizer';

        this.instanced = null;
        this.geometry = null;
        this.material = null;
        this.ground = null;

        this.lightA = null;
        this.lightB = null;
        this.ambient = null;

        this.baseHeights = [];
        this.phases = [];

        this.controls = {
            grid: 34,
            spacing: 0.7,
            height: 6.0,
            wave: 1.1,
            speed: 1.0,
            glow: 1.6,
            wireframe: false,
        };
        this.defaultControls = { ...this.controls };
    }

    init() {
        super.init();

        this.ambient = new THREE.AmbientLight(0xffffff, 0.35);
        this.container.add(this.ambient);

        this.lightA = new THREE.PointLight(0xff00ff, 2.8, 90);
        this.lightA.position.set(10, 12, 10);
        this.container.add(this.lightA);

        this.lightB = new THREE.PointLight(0x00ffff, 2.4, 90);
        this.lightB.position.set(-10, 10, -10);
        this.container.add(this.lightB);

        this.build();
        this.positionCamera();
        return this;
    }

    positionCamera() {
        // Put the camera into a nice city flyover view.
        this.camera.position.set(0, 10, 18);
        this.camera.lookAt(0, 2.0, 0);
    }

    build() {
        if (this.instanced) {
            this.container.remove(this.instanced);
            this.instanced.geometry.dispose();
            this.instanced.material.dispose();
            this.instanced = null;
        }
        if (this.ground) {
            this.container.remove(this.ground);
            this.ground.geometry.dispose();
            this.ground.material.dispose();
            this.ground = null;
        }

        const grid = Math.max(10, Math.min(60, Math.floor(this.controls.grid)));
        const spacing = this.controls.spacing;

        const count = grid * grid;
        this.baseHeights = new Array(count);
        this.phases = new Array(count);

        this.geometry = new THREE.BoxGeometry(1, 1, 1);
        this.material = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0x200020,
            emissiveIntensity: this.controls.glow,
            metalness: 0.15,
            roughness: 0.45,
            wireframe: !!this.controls.wireframe,
        });

        this.instanced = new THREE.InstancedMesh(this.geometry, this.material, count);
        this.instanced.frustumCulled = false;
        this.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const dummy = new THREE.Object3D();
        const half = (grid - 1) * 0.5;

        for (let z = 0; z < grid; z++) {
            for (let x = 0; x < grid; x++) {
                const idx = z * grid + x;
                const fx = (x - half) * spacing;
                const fz = (z - half) * spacing;

                // Slight radial falloff so city has a center.
                const r = Math.sqrt(fx * fx + fz * fz);
                const falloff = Math.exp(-r * 0.08);

                const base = (0.8 + Math.random() * 1.6) * falloff;
                this.baseHeights[idx] = base;
                this.phases[idx] = Math.random() * Math.PI * 2;

                dummy.position.set(fx, 0, fz);
                dummy.scale.set(0.55, 1.0, 0.55);
                dummy.rotation.y = (Math.random() - 0.5) * 0.15;
                dummy.updateMatrix();
                this.instanced.setMatrixAt(idx, dummy.matrix);
            }
        }

        // Ground
        const groundGeo = new THREE.PlaneGeometry(grid * spacing * 1.3, grid * spacing * 1.3, 1, 1);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x050008,
            emissive: 0x050010,
            emissiveIntensity: 0.45,
            metalness: 0.0,
            roughness: 0.85,
        });
        this.ground = new THREE.Mesh(groundGeo, groundMat);
        this.ground.rotation.x = -Math.PI / 2;
        this.ground.position.y = -0.2;
        this.ground.receiveShadow = false;
        this.ground.frustumCulled = false;
        this.container.add(this.ground);

        this.container.add(this.instanced);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);
        if (!this.instanced || !this.material) return;

        const bass = audioData?.bassLevel || 0;
        const mid = audioData?.midLevel || 0;
        const high = audioData?.highLevel || 0;
        const beat = this.beatIntensity;

        const grid = Math.max(10, Math.min(60, Math.floor(this.controls.grid)));
        const spacing = this.controls.spacing;
        const half = (grid - 1) * 0.5;

        const speed = this.controls.speed;
        const wave = this.controls.wave;
        const heightScale = this.controls.height;

        const dummy = new THREE.Object3D();
        const t = this.elapsedTime;

        // Update every frame; keep grid size moderate.
        const count = grid * grid;
        for (let i = 0; i < count; i++) {
            const x = i % grid;
            const z = Math.floor(i / grid);

            const fx = (x - half) * spacing;
            const fz = (z - half) * spacing;
            const r = Math.sqrt(fx * fx + fz * fz);

            const base = this.baseHeights[i] || 1.0;
            const ph = this.phases[i] || 0.0;

            const ripple = Math.sin((r * 0.45) - t * (1.2 + speed) + ph) * 0.5 + 0.5;
            const audioLift = bass * 1.2 + mid * 0.55;
            const pulse = beat * (0.8 + high);

            const h = (0.4 + base * heightScale) * (0.75 + wave * ripple * 0.5 + audioLift) * (1.0 + pulse * 0.25);
            const sx = 0.55;
            const sz = 0.55;

            dummy.position.set(fx, h * 0.5 - 0.05, fz);
            dummy.scale.set(sx, Math.max(0.12, h), sz);
            dummy.rotation.y = 0.1 * Math.sin(ph + t * 0.2);
            dummy.updateMatrix();
            this.instanced.setMatrixAt(i, dummy.matrix);
        }
        this.instanced.instanceMatrix.needsUpdate = true;

        // Lights orbit for motion parallax
        this.lightA.position.set(Math.cos(t * 0.55) * 16, 10 + Math.sin(t * 0.8) * 3, Math.sin(t * 0.55) * 16);
        this.lightB.position.set(Math.cos(t * 0.42 + 2.2) * 16, 9 + Math.sin(t * 0.65) * 2.5, Math.sin(t * 0.42 + 2.2) * 16);
        this.lightA.intensity = 2.0 + beat * 4.0 + bass * 1.2;
        this.lightB.intensity = 1.8 + beat * 3.2 + mid * 0.9;

        this.material.emissiveIntensity = this.controls.glow * (1.0 + high * 0.8 + beat * 1.1);
    }

    onControlChange(name, value) {
        this.controls[name] = value;
        if (name === 'wireframe' && this.material) {
            this.material.wireframe = !!value;
        }
        if (name === 'glow' && this.material) {
            this.material.emissiveIntensity = value;
        }
        if (name === 'grid' || name === 'spacing') {
            if (this.isInitialized) this.build();
        }
    }

    getControls() {
        return {
            grid: { type: 'range', label: 'Grid', min: 10, max: 60, step: 1, value: this.controls.grid },
            spacing: { type: 'range', label: 'Spacing', min: 0.45, max: 1.2, step: 0.01, value: this.controls.spacing },
            height: { type: 'range', label: 'Height', min: 1, max: 12, step: 0.1, value: this.controls.height },
            wave: { type: 'range', label: 'Wave', min: 0, max: 2.2, step: 0.05, value: this.controls.wave },
            speed: { type: 'range', label: 'Speed', min: 0, max: 2.5, step: 0.05, value: this.controls.speed },
            glow: { type: 'range', label: 'Glow', min: 0, max: 4, step: 0.05, value: this.controls.glow },
            wireframe: { type: 'toggle', label: 'Wireframe', value: this.controls.wireframe },
        };
    }

    dispose() {
        if (this.instanced) {
            this.container.remove(this.instanced);
            this.instanced.geometry.dispose();
            this.instanced.material.dispose();
            this.instanced = null;
        }
        if (this.ground) {
            this.container.remove(this.ground);
            this.ground.geometry.dispose();
            this.ground.material.dispose();
            this.ground = null;
        }
        if (this.lightA) this.container.remove(this.lightA);
        if (this.lightB) this.container.remove(this.lightB);
        if (this.ambient) this.container.remove(this.ambient);
        this.lightA = null;
        this.lightB = null;
        this.ambient = null;
        super.dispose();
    }
}

export default NeonVoxelCity;

