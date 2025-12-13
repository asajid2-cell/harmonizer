/**
 * PrismKnot - audio-reactive torus knot with shader glow + orbiting shards.
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class PrismKnot extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'prism';
        this.name = 'Prism Knot';
        this.description = 'Torus-knot core with orbiting prisms';
        this.author = 'Harmonizer';

        this.core = null;
        this.coreMat = null;
        this.shards = null;
        this.shardMat = null;
        this.lightA = null;
        this.lightB = null;

        this.controls = {
            coreScale: 1.0,
            coreTwist: 0.8,
            shardCount: 120,
            shardRadius: 6.5,
            shardSize: 0.25,
            rotationSpeed: 0.35,
            glow: 1.2,
            refraction: 0.35,
            wireframe: false,
        };
        this.defaultControls = { ...this.controls };
    }

    init() {
        super.init();

        this.lightA = new THREE.PointLight(0xff00ff, 2.5, 60);
        this.lightA.position.set(8, 6, 8);
        this.container.add(this.lightA);

        this.lightB = new THREE.PointLight(0x00ffff, 2.2, 60);
        this.lightB.position.set(-8, -4, 10);
        this.container.add(this.lightB);

        this.buildCore();
        this.buildShards();
        return this;
    }

    buildCore() {
        if (this.core) {
            this.container.remove(this.core);
            this.core.geometry.dispose();
            this.core.material.dispose();
            this.core = null;
        }

        const geo = new THREE.TorusKnotGeometry(2.4, 0.65, 260, 24, 2, 3);
        this.coreMat = new THREE.MeshPhysicalMaterial({
            color: 0xff00ff,
            emissive: 0x220022,
            emissiveIntensity: this.controls.glow,
            metalness: 0.1,
            roughness: 0.15,
            clearcoat: 0.85,
            clearcoatRoughness: 0.1,
            transmission: this.controls.refraction,
            thickness: 0.8,
            transparent: true,
            opacity: 0.98,
            wireframe: this.controls.wireframe,
        });

        this.core = new THREE.Mesh(geo, this.coreMat);
        this.core.frustumCulled = false;
        this.container.add(this.core);
    }

    buildShards() {
        if (this.shards) {
            this.container.remove(this.shards);
            this.shards.geometry.dispose();
            this.shardMat.dispose();
            this.shards = null;
        }

        const count = Math.max(24, Math.min(500, Math.floor(this.controls.shardCount)));
        const geo = new THREE.IcosahedronGeometry(this.controls.shardSize, 0);
        this.shardMat = new THREE.MeshStandardMaterial({
            color: 0x00ffff,
            emissive: 0x001122,
            emissiveIntensity: 0.9,
            metalness: 0.2,
            roughness: 0.35,
            transparent: true,
            opacity: 0.95,
            wireframe: false,
        });

        this.shards = new THREE.InstancedMesh(geo, this.shardMat, count);
        this.shards.frustumCulled = false;
        this.shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const r = this.controls.shardRadius * (0.8 + Math.random() * 0.5);
            const y = (Math.random() - 0.5) * 2.4;
            dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
            dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            dummy.scale.setScalar(0.75 + Math.random() * 1.25);
            dummy.updateMatrix();
            this.shards.setMatrixAt(i, dummy.matrix);
        }

        this.container.add(this.shards);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);
        if (!this.core) return;

        const bass = audioData?.bassLevel || 0;
        const mid = audioData?.midLevel || 0;
        const high = audioData?.highLevel || 0;
        const beat = this.beatIntensity;

        const rs = this.controls.rotationSpeed;
        this.core.rotation.x += deltaTime * (0.25 + rs) * (0.6 + mid);
        this.core.rotation.y += deltaTime * (0.35 + rs * 1.2) * (0.6 + bass);
        this.core.rotation.z += deltaTime * 0.12;

        const scale = (this.controls.coreScale || 1.0) * (1.0 + bass * 0.18 + beat * 0.12);
        this.core.scale.setScalar(scale);

        if (this.coreMat) {
            this.coreMat.emissiveIntensity = this.controls.glow * (1.0 + high * 0.8 + beat * 1.3);
            this.coreMat.transmission = THREE.MathUtils.clamp(this.controls.refraction + mid * 0.2, 0, 1);
        }

        // Orbit lights
        const t = this.elapsedTime;
        this.lightA.position.set(Math.cos(t * 0.7) * 8, 5 + Math.sin(t * 0.9) * 2, Math.sin(t * 0.7) * 8);
        this.lightB.position.set(Math.cos(t * 0.55 + 2.1) * 8, -4 + Math.sin(t * 0.75) * 2, Math.sin(t * 0.55 + 2.1) * 8);
        this.lightA.intensity = 2.1 + beat * 3.2;
        this.lightB.intensity = 1.9 + beat * 2.7;

        if (this.shards && (Math.floor(t * 60) % 2 === 0)) {
            const dummy = new THREE.Object3D();
            const count = this.shards.count;
            for (let i = 0; i < count; i++) {
                this.shards.getMatrixAt(i, dummy.matrix);
                dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
                const r = dummy.position.length();
                const wobble = Math.sin(t * (1.1 + high) + r * 0.8) * 0.12 * (0.6 + mid);
                dummy.position.multiplyScalar(1.0 + wobble * 0.06 + beat * 0.015);
                dummy.rotation.y += deltaTime * (0.8 + rs) * (0.5 + bass);
                dummy.updateMatrix();
                this.shards.setMatrixAt(i, dummy.matrix);
            }
            this.shards.instanceMatrix.needsUpdate = true;
        }
    }

    onControlChange(name, value) {
        this.controls[name] = value;
        switch (name) {
            case 'wireframe':
                if (this.coreMat) this.coreMat.wireframe = !!value;
                break;
            case 'glow':
                if (this.coreMat) this.coreMat.emissiveIntensity = value;
                break;
            case 'refraction':
                if (this.coreMat) this.coreMat.transmission = value;
                break;
            case 'shardCount':
            case 'shardRadius':
            case 'shardSize':
                if (this.isInitialized) this.buildShards();
                break;
            case 'coreTwist':
                // Not rebuilding geometry (expensive); handled in update via rotation
                break;
        }
    }

    getControls() {
        return {
            coreScale: { type: 'range', label: 'Core Scale', min: 0.5, max: 1.8, step: 0.05, value: this.controls.coreScale },
            shardCount: { type: 'range', label: 'Shard Count', min: 24, max: 500, step: 1, value: this.controls.shardCount },
            shardRadius: { type: 'range', label: 'Shard Radius', min: 3, max: 12, step: 0.25, value: this.controls.shardRadius },
            shardSize: { type: 'range', label: 'Shard Size', min: 0.1, max: 0.6, step: 0.02, value: this.controls.shardSize },
            rotationSpeed: { type: 'range', label: 'Rotation', min: 0, max: 1.5, step: 0.05, value: this.controls.rotationSpeed },
            glow: { type: 'range', label: 'Glow', min: 0, max: 4, step: 0.05, value: this.controls.glow },
            refraction: { type: 'range', label: 'Refraction', min: 0, max: 1, step: 0.02, value: this.controls.refraction },
            wireframe: { type: 'toggle', label: 'Wireframe', value: this.controls.wireframe },
        };
    }

    dispose() {
        if (this.core) {
            this.container.remove(this.core);
            this.core.geometry.dispose();
            this.core.material.dispose();
            this.core = null;
        }
        if (this.shards) {
            this.container.remove(this.shards);
            this.shards.geometry.dispose();
            this.shardMat.dispose();
            this.shards = null;
        }
        if (this.lightA) this.container.remove(this.lightA);
        if (this.lightB) this.container.remove(this.lightB);
        this.lightA = null;
        this.lightB = null;
        super.dispose();
    }
}

export default PrismKnot;

