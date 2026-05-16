/**
 * SONIC ARCHITECT MK.III
 * Fireworks - Beat-Triggered Particle Bursts
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

class Firework {
    constructor(scene) {
        this.scene = scene;
        this.particles = null;
        this.velocity = [];
        this.age = 0;
        this.maxAge = 2;
        this.exploded = false;

        this.init();
    }

    init() {
        const particleCount = 200;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        this.velocity = [];

        const color = new THREE.Color().setHSL(Math.random(), 1.0, 0.6);

        for (let i = 0; i < particleCount; i++) {
            positions.push(0, 0, 0);
            colors.push(color.r, color.g, color.b);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 2 + Math.random() * 3;

            this.velocity.push(new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.sin(phi) * Math.sin(theta) * speed,
                Math.cos(phi) * speed
            ));
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, material);
        this.scene.add(this.particles);

        const startY = -5 + Math.random() * 10;
        this.particles.position.set(
            (Math.random() - 0.5) * 8,
            startY,
            (Math.random() - 0.5) * 8
        );
    }

    update(deltaTime) {
        this.age += deltaTime;

        if (!this.exploded && this.age > 0.5) {
            this.explode();
        }

        if (this.exploded) {
            const positions = this.particles.geometry.attributes.position.array;
            const gravity = new THREE.Vector3(0, -9.8, 0);

            for (let i = 0; i < positions.length / 3; i++) {
                this.velocity[i].add(gravity.clone().multiplyScalar(deltaTime));

                positions[i * 3] += this.velocity[i].x * deltaTime;
                positions[i * 3 + 1] += this.velocity[i].y * deltaTime;
                positions[i * 3 + 2] += this.velocity[i].z * deltaTime;
            }

            this.particles.geometry.attributes.position.needsUpdate = true;

            const life = 1 - (this.age / this.maxAge);
            this.particles.material.opacity = life;
        }

        return this.age < this.maxAge;
    }

    explode() {
        this.exploded = true;
    }

    dispose() {
        if (this.particles) {
            this.scene.remove(this.particles);
            this.particles.geometry.dispose();
            this.particles.material.dispose();
        }
    }
}

class Fireworks extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'fireworks';
        this.name = 'Fireworks';
        this.description = 'Beat-triggered particle fireworks';

        this.fireworks = [];
        this.timeSinceLastFirework = 0;
        this.fireworkInterval = 0.5;
    }

    init() {
        super.init();
        return this;
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        this.timeSinceLastFirework += deltaTime;

        const bass = audioData ? (audioData.bass || 0) / 255 : 0;

        if (this.timeSinceLastFirework > this.fireworkInterval || (bass > 0.7 && this.timeSinceLastFirework > 0.2)) {
            this.fireworks.push(new Firework(this.container));
            this.timeSinceLastFirework = 0;
        }

        this.fireworks = this.fireworks.filter(fw => {
            const alive = fw.update(deltaTime);
            if (!alive) fw.dispose();
            return alive;
        });
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        if (intensity > 0.5) {
            for (let i = 0; i < Math.floor(intensity * 3); i++) {
                this.fireworks.push(new Firework(this.container));
            }
        }
    }

    dispose() {
        this.fireworks.forEach(fw => fw.dispose());
        this.fireworks = [];
        super.dispose();
    }
}

export default Fireworks;
