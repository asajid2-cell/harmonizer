/**
 * CrystalLattice - audio-reactive instanced crystal grid.
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class CrystalLattice extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'crystal';
        this.name = 'Crystal Lattice';
        this.description = 'Instanced crystal field with beat shimmer';
        this.author = '3D Visualizer';

        this.instanced = null;
        this.geometry = null;
        this.material = null;
        this.light = null;

        this.controls = {
            density: 10, // cubes per axis (density^3 instances)
            spread: 10,
            size: 0.35,
            rotationSpeed: 0.35,
            emissive: 1.25,
            metalness: 0.2,
            roughness: 0.25,
            wireframe: false,
        };
        this.defaultControls = { ...this.controls };
    }

    init() {
        super.init();

        // Lighting for physical material
        this.light = new THREE.PointLight(0xffffff, 1.8, 80);
        this.light.position.set(0, 6, 10);
        this.container.add(this.light);

        this.rebuild();
        return this;
    }

    rebuild() {
        if (this.instanced) {
            this.container.remove(this.instanced);
            this.instanced.geometry.dispose();
            this.instanced.material.dispose();
            this.instanced = null;
        }

        const count = Math.max(4, Math.min(18, Math.floor(this.controls.density)));
        const spread = this.controls.spread;
        const size = this.controls.size;

        const instances = count * count * count;
        this.geometry = new THREE.IcosahedronGeometry(size, 0);

        this.material = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0x330033,
            emissiveIntensity: this.controls.emissive,
            metalness: this.controls.metalness,
            roughness: this.controls.roughness,
            wireframe: this.controls.wireframe,
        });

        this.instanced = new THREE.InstancedMesh(this.geometry, this.material, instances);
        this.instanced.frustumCulled = false;
        this.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let x = 0; x < count; x++) {
            for (let y = 0; y < count; y++) {
                for (let z = 0; z < count; z++) {
                    const fx = (x / (count - 1)) * 2 - 1;
                    const fy = (y / (count - 1)) * 2 - 1;
                    const fz = (z / (count - 1)) * 2 - 1;
                    dummy.position.set(fx * spread, fy * spread * 0.55, fz * spread);
                    dummy.rotation.set(fx * 0.6, fz * 0.6, fy * 0.6);
                    dummy.scale.setScalar(0.85 + Math.random() * 0.5);
                    dummy.updateMatrix();
                    this.instanced.setMatrixAt(idx++, dummy.matrix);
                }
            }
        }

        this.container.add(this.instanced);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        if (!this.instanced || !this.material) return;

        const bass = audioData?.bassLevel || 0;
        const mid = audioData?.midLevel || 0;
        const high = audioData?.highLevel || 0;

        // Global rotation
        const rs = this.controls.rotationSpeed;
        this.container.rotation.y += deltaTime * (0.3 + rs) * (0.6 + bass);
        this.container.rotation.x += deltaTime * 0.06 * (0.6 + mid);

        // Beat shimmer via emissive
        const beat = this.beatIntensity;
        this.material.emissiveIntensity = this.controls.emissive * (1.0 + beat * 1.2 + high * 0.6);
        this.light.intensity = 1.4 + beat * 2.0 + bass * 0.8;

        // Subtle pulsation in instance matrices (cheap: update every ~3 frames)
        if (Math.floor(this.elapsedTime * 60) % 3 === 0) {
            const dummy = new THREE.Object3D();
            const scaleBase = 0.85 + bass * 0.35 + beat * 0.25;
            for (let i = 0; i < this.instanced.count; i++) {
                this.instanced.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                const r = dummy.position.length();
                const w = Math.sin(this.elapsedTime * 1.7 + r * 0.35) * 0.12 * (0.4 + mid);
                dummy.scale.setScalar(scaleBase + w);
                dummy.updateMatrix();
                this.instanced.setMatrixAt(i, dummy.matrix);
            }
            this.instanced.instanceMatrix.needsUpdate = true;
        }
    }

    onControlChange(name, value) {
        this.controls[name] = value;

        if (!this.material) return;
        switch (name) {
            case 'wireframe':
                this.material.wireframe = !!value;
                break;
            case 'emissive':
                this.material.emissiveIntensity = value;
                break;
            case 'metalness':
                this.material.metalness = value;
                break;
            case 'roughness':
                this.material.roughness = value;
                break;
            case 'density':
            case 'spread':
            case 'size':
                if (this.isInitialized) this.rebuild();
                break;
        }
    }

    getControls() {
        return {
            density: { type: 'range', label: 'Density', min: 4, max: 18, step: 1, value: this.controls.density },
            spread: { type: 'range', label: 'Spread', min: 6, max: 18, step: 0.5, value: this.controls.spread },
            size: { type: 'range', label: 'Crystal Size', min: 0.15, max: 0.8, step: 0.05, value: this.controls.size },
            rotationSpeed: { type: 'range', label: 'Rotation', min: 0, max: 1.5, step: 0.05, value: this.controls.rotationSpeed },
            emissive: { type: 'range', label: 'Glow', min: 0, max: 4, step: 0.05, value: this.controls.emissive },
            metalness: { type: 'range', label: 'Metal', min: 0, max: 1, step: 0.05, value: this.controls.metalness },
            roughness: { type: 'range', label: 'Roughness', min: 0, max: 1, step: 0.05, value: this.controls.roughness },
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
        if (this.light) {
            this.container.remove(this.light);
            this.light = null;
        }
        super.dispose();
    }
}

export default CrystalLattice;
