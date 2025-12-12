/**
 * SONIC ARCHITECT MK.III
 * ParticleGalaxy - 100k+ GPU-Instanced Particle Spiral Galaxy
 *
 * Features:
 * - Massive particle count using instancing
 * - Spiral arm formation
 * - Audio-reactive rotation and color
 * - Beat-triggered supernova bursts
 * - Depth-based sizing
 */

import VisualizerBase from './VisualizerBase.js';

const vertexShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;
    uniform float uRotationSpeed;
    uniform float uSpread;

    attribute float aSize;
    attribute vec3 aColor;
    attribute float aAngle;
    attribute float aRadius;
    attribute float aSpeed;
    attribute float aArm;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        vColor = aColor;

        // Spiral motion
        float angle = aAngle + uTime * aSpeed * uRotationSpeed;

        // Add audio reactivity to rotation
        angle += uBass * 0.5 * sin(aRadius);

        // Calculate spiral position
        float radius = aRadius * (1.0 + uBass * 0.2);
        float armOffset = aArm * 3.14159 * 2.0 / 4.0; // 4 spiral arms

        float x = cos(angle + armOffset) * radius;
        float z = sin(angle + armOffset) * radius;
        float y = (sin(aRadius * 3.0 + uTime) * 0.3) * uSpread;

        // Beat explosion
        float explosion = uBeatIntensity * aRadius * 0.3;
        x += cos(angle) * explosion;
        z += sin(angle) * explosion;

        vec3 pos = vec3(x, y, z);

        // Project to screen
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

        // Size based on depth and audio
        float size = aSize * (1.0 + uHigh * 2.0);
        size *= (300.0 / -mvPosition.z);

        gl_PointSize = size;
        gl_Position = projectionMatrix * mvPosition;

        // Alpha based on depth
        vAlpha = 0.6 + aRadius * 0.1;
        vAlpha *= (1.0 + uBeatIntensity * 0.5);
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uBeatIntensity;

    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        // Circular point with soft edges
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);

        if (dist > 0.5) discard;

        float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
        alpha *= vAlpha;

        // Color brightening on beat
        vec3 color = vColor * (1.0 + uBeatIntensity * 0.5);

        // Core glow
        float core = 1.0 - smoothstep(0.0, 0.2, dist);
        color += vec3(core * 0.5);

        gl_FragColor = vec4(color, alpha);
    }
`;

class ParticleGalaxy extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'galaxy';
        this.name = 'Galaxy';
        this.description = 'Spiral galaxy with 100k+ particles';
        this.author = 'Sonic Architect';

        // Geometry and material
        this.geometry = null;
        this.material = null;
        this.points = null;

        // Configuration
        this.controls = {
            rotationSpeed: 0.3,
            spread: 1.0,
            armCount: 4,
            brightness: 1.0,
            coreSize: 1.0
        };

        this.defaultControls = { ...this.controls };

        // Quality settings
        this.qualitySettings = {
            low: { particles: 10000 },
            medium: { particles: 50000 },
            high: { particles: 100000 },
            ultra: { particles: 150000 }
        };

        // Color schemes
        this.colorSchemes = {
            cosmic: [
                new THREE.Color(0x00f0ff),
                new THREE.Color(0xff00ff),
                new THREE.Color(0xffffff),
                new THREE.Color(0x0066ff)
            ],
            fire: [
                new THREE.Color(0xff6600),
                new THREE.Color(0xff0000),
                new THREE.Color(0xffff00),
                new THREE.Color(0xff3300)
            ],
            ice: [
                new THREE.Color(0x00ffff),
                new THREE.Color(0x0088ff),
                new THREE.Color(0xffffff),
                new THREE.Color(0x00aaff)
            ]
        };

        this.currentScheme = 'cosmic';
    }

    init() {
        super.init();

        const quality = this.getQualitySettings();
        this.createGalaxy(quality.particles);

        return this;
    }

    createGalaxy(particleCount) {
        const colors = this.colorSchemes[this.currentScheme];

        // Create geometry
        this.geometry = new THREE.BufferGeometry();

        const positions = new Float32Array(particleCount * 3);
        const particleColors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        const angles = new Float32Array(particleCount);
        const radii = new Float32Array(particleCount);
        const speeds = new Float32Array(particleCount);
        const arms = new Float32Array(particleCount);

        const armCount = this.controls.armCount;

        for (let i = 0; i < particleCount; i++) {
            // Radius with more particles toward center (exponential distribution)
            const radius = Math.pow(Math.random(), 0.5) * 5;

            // Random angle
            const angle = Math.random() * Math.PI * 2;

            // Assign to spiral arm
            const arm = Math.floor(Math.random() * armCount);

            // Speed inversely proportional to radius (Kepler-like)
            const speed = 1.0 / (radius + 0.5);

            // Initial position (will be overwritten in shader)
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;

            // Color based on radius
            const colorIndex = Math.floor(Math.random() * colors.length);
            const color = colors[colorIndex];

            // Add some variation
            const brightness = 0.7 + Math.random() * 0.3;
            particleColors[i * 3] = color.r * brightness;
            particleColors[i * 3 + 1] = color.g * brightness;
            particleColors[i * 3 + 2] = color.b * brightness;

            // Size based on radius (core particles larger)
            sizes[i] = (1.0 - radius / 5) * 2 + Math.random() * 0.5;

            angles[i] = angle;
            radii[i] = radius;
            speeds[i] = speed;
            arms[i] = arm;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('aColor', new THREE.BufferAttribute(particleColors, 3));
        this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        this.geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
        this.geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
        this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
        this.geometry.setAttribute('aArm', new THREE.BufferAttribute(arms, 1));

        // Create shader material
        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uBass: { value: 0 },
                uMid: { value: 0 },
                uHigh: { value: 0 },
                uBeatIntensity: { value: 0 },
                uRotationSpeed: { value: this.controls.rotationSpeed },
                uSpread: { value: this.controls.spread }
            },
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // Create points
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.name = 'galaxy-particles';
        this.container.add(this.points);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        if (!this.material) return;

        const uniforms = this.material.uniforms;

        // Update time
        uniforms.uTime.value = this.elapsedTime;

        // Update audio
        if (audioData) {
            uniforms.uBass.value = audioData.bassLevel || 0;
            uniforms.uMid.value = audioData.midLevel || 0;
            uniforms.uHigh.value = audioData.highLevel || 0;
        }

        uniforms.uBeatIntensity.value = this.beatIntensity;

        // Rotate container slightly
        this.container.rotation.y += deltaTime * 0.05;
    }

    onBeat(intensity) {
        super.onBeat(intensity);
        // Beat handled via uniforms
    }

    onControlChange(name, value) {
        if (!this.material) return;

        const uniforms = this.material.uniforms;

        switch (name) {
            case 'rotationSpeed':
                uniforms.uRotationSpeed.value = value;
                break;
            case 'spread':
                uniforms.uSpread.value = value;
                break;
        }

        this.controls[name] = value;
    }

    setColorScheme(scheme) {
        if (!this.colorSchemes[scheme]) return;

        this.currentScheme = scheme;

        // Rebuild with new colors
        if (this.isInitialized) {
            const quality = this.getQualitySettings();

            // Dispose old
            if (this.points) {
                this.container.remove(this.points);
                this.geometry.dispose();
                this.material.dispose();
            }

            this.createGalaxy(quality.particles);
        }
    }

    getControls() {
        return {
            rotationSpeed: {
                type: 'range',
                label: 'Rotation Speed',
                min: 0,
                max: 1,
                step: 0.05,
                value: this.controls.rotationSpeed
            },
            spread: {
                type: 'range',
                label: 'Vertical Spread',
                min: 0.1,
                max: 2,
                step: 0.1,
                value: this.controls.spread
            },
            brightness: {
                type: 'range',
                label: 'Brightness',
                min: 0.5,
                max: 2,
                step: 0.1,
                value: this.controls.brightness
            }
        };
    }

    setQuality(level) {
        super.setQuality(level);

        if (this.isInitialized) {
            const quality = this.getQualitySettings();

            // Dispose old
            if (this.points) {
                this.container.remove(this.points);
                this.geometry.dispose();
                this.material.dispose();
            }

            this.createGalaxy(quality.particles);
        }
    }

    dispose() {
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();
        super.dispose();
    }
}

export default ParticleGalaxy;
