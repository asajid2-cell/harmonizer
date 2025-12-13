/**
 * SONIC ARCHITECT MK.III
 * SphereVisualizer - Enhanced Deforming Icosahedron with Multi-Layer Noise
 *
 * Features:
 * - Icosahedron geometry with vertex displacement
 * - Multi-octave simplex noise deformation
 * - Audio-reactive scale, color, and displacement
 * - Beat-triggered explosions
 * - Customizable noise parameters
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

// Shader code
const vertexShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;
    uniform float uDisplacement;
    uniform float uNoiseScale;
    uniform float uNoiseSpeed;
    uniform float uNoiseOctaves;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;
    varying float vNoise;

    //
    // Simplex 3D Noise
    //
    vec4 permute(vec4 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);

        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);

        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;

        i = mod(i, 289.0);
        vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                  + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                  + i.x + vec4(0.0, i1.x, i2.x, 1.0));

        float n_ = 1.0/7.0;
        vec3 ns = n_ * D.wyz - D.xzx;

        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);

        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);

        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);

        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));

        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);

        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x;
        p1 *= norm.y;
        p2 *= norm.z;
        p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    // Fractal Brownian Motion
    float fbm(vec3 p, int octaves) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;

        for(int i = 0; i < 8; i++) {
            if(i >= octaves) break;
            value += amplitude * snoise(p * frequency);
            amplitude *= 0.5;
            frequency *= 2.0;
        }
        return value;
    }

    void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;

        // Animated noise position
        vec3 noisePos = position * uNoiseScale + uTime * uNoiseSpeed;

        // Multi-octave noise
        float noise = fbm(noisePos, int(uNoiseOctaves));

        // Audio-reactive displacement
        float bassDisp = uBass * 0.5;
        float midDisp = uMid * 0.3;
        float highDisp = uHigh * 0.2;

        // Beat explosion effect
        float beatDisp = uBeatIntensity * 0.4;

        // Combined displacement
        float displacement = noise * uDisplacement * (1.0 + bassDisp + midDisp + highDisp + beatDisp);

        // Apply displacement along normal
        vec3 newPosition = position + normal * displacement;

        // Audio-reactive scale
        float scale = 1.0 + uBass * 0.15 + uBeatIntensity * 0.1;
        newPosition *= scale;

        vDisplacement = displacement;
        vNoise = noise;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    uniform float uGlowIntensity;
    uniform float uFresnelPower;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;
    varying float vNoise;

    void main() {
        // Fresnel effect (edge glow)
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float fresnel = pow(1.0 - abs(dot(viewDirection, vNormal)), uFresnelPower);

        // Color based on displacement and audio
        float colorMix = (vDisplacement + 1.0) * 0.5;
        colorMix = clamp(colorMix + uBass * 0.3, 0.0, 1.0);

        // Three-color gradient
        vec3 color;
        if(colorMix < 0.5) {
            color = mix(uColor1, uColor2, colorMix * 2.0);
        } else {
            color = mix(uColor2, uColor3, (colorMix - 0.5) * 2.0);
        }

        // High frequency sparkle
        float sparkle = step(0.97, fract(vNoise * 50.0 + uTime * 2.0)) * uHigh;
        color += vec3(sparkle);

        // Beat flash
        color += vec3(uBeatIntensity * 0.3);

        // Apply fresnel glow
        float glow = fresnel * uGlowIntensity * (1.0 + uBass);
        color += color * glow;

        // Final output
        float alpha = 0.9 + fresnel * 0.1;

        gl_FragColor = vec4(color, alpha);
    }
`;

class SphereVisualizer extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'sphere';
        this.name = 'Sphere';
        this.description = 'Deforming icosahedron with multi-layer noise';
        this.author = 'Sonic Architect';

        // Geometry and mesh
        this.geometry = null;
        this.material = null;
        this.mesh = null;

        // Particles for explosion effect
        this.particles = null;
        this.particleMaterial = null;

        // Configuration
        this.controls = {
            displacement: 0.8,
            noiseScale: 1.5,
            noiseSpeed: 0.3,
            noiseOctaves: 4,
            glowIntensity: 1.5,
            fresnelPower: 2.0,
            rotationSpeed: 0.2,
            wireframe: false,
            showParticles: true
        };

        this.defaultControls = { ...this.controls };

        // Color palettes
        this.colorPalettes = {
            cyber: {
                color1: new THREE.Color(0x00f0ff),
                color2: new THREE.Color(0xff003c),
                color3: new THREE.Color(0xffffff)
            },
            vapor: {
                color1: new THREE.Color(0xff71ce),
                color2: new THREE.Color(0x01cdfe),
                color3: new THREE.Color(0x05ffa1)
            },
            matrix: {
                color1: new THREE.Color(0x00ff00),
                color2: new THREE.Color(0x003300),
                color3: new THREE.Color(0x00ff00)
            },
            sunset: {
                color1: new THREE.Color(0xff6b35),
                color2: new THREE.Color(0xf7c59f),
                color3: new THREE.Color(0xefa00b)
            }
        };

        this.currentPalette = 'cyber';

        // Quality settings
        this.qualitySettings = {
            low: { detail: 2, particles: 500 },
            medium: { detail: 3, particles: 1000 },
            high: { detail: 4, particles: 2000 },
            ultra: { detail: 5, particles: 5000 }
        };
    }

    init() {
        super.init();

        const quality = this.getQualitySettings();
        const palette = this.colorPalettes[this.currentPalette];

        // Create icosahedron geometry
        this.geometry = new THREE.IcosahedronGeometry(2, quality.detail);

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
                uDisplacement: { value: this.controls.displacement },
                uNoiseScale: { value: this.controls.noiseScale },
                uNoiseSpeed: { value: this.controls.noiseSpeed },
                uNoiseOctaves: { value: this.controls.noiseOctaves },
                uColor1: { value: palette.color1 },
                uColor2: { value: palette.color2 },
                uColor3: { value: palette.color3 },
                uGlowIntensity: { value: this.controls.glowIntensity },
                uFresnelPower: { value: this.controls.fresnelPower }
            },
            transparent: true,
            wireframe: this.controls.wireframe,
            side: THREE.DoubleSide
        });

        // Create mesh
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'sphere-mesh';
        this.container.add(this.mesh);

        // Create particles
        if (this.controls.showParticles) {
            this.createParticles(quality.particles);
        }

        return this;
    }

    createParticles(count) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);

        const palette = this.colorPalettes[this.currentPalette];

        for (let i = 0; i < count; i++) {
            // Sphere distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 2.5 + Math.random() * 1.5;

            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Random color from palette
            const color = Math.random() < 0.5 ? palette.color1 : palette.color2;
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;

            sizes[i] = Math.random() * 0.05 + 0.02;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        this.particleMaterial = new THREE.PointsMaterial({
            size: 0.05,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.particles = new THREE.Points(geometry, this.particleMaterial);
        this.particles.name = 'sphere-particles';
        this.container.add(this.particles);
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        if (!this.mesh || !this.material) return;

        const uniforms = this.material.uniforms;

        // Update time
        uniforms.uTime.value = this.elapsedTime;

        // Update audio values
        if (audioData) {
            uniforms.uBass.value = audioData.bassLevel || 0;
            uniforms.uMid.value = audioData.midLevel || 0;
            uniforms.uHigh.value = audioData.highLevel || 0;
        }

        // Update beat intensity
        uniforms.uBeatIntensity.value = this.beatIntensity;

        // Rotate mesh
        const rotSpeed = this.controls.rotationSpeed;
        this.mesh.rotation.x += deltaTime * rotSpeed * 0.5;
        this.mesh.rotation.y += deltaTime * rotSpeed;

        // Update particles
        if (this.particles) {
            this.particles.rotation.y -= deltaTime * rotSpeed * 0.3;
            this.particles.rotation.x += deltaTime * rotSpeed * 0.2;

            // Pulse particle size on beat
            if (this.particleMaterial) {
                this.particleMaterial.size = 0.05 + this.beatIntensity * 0.03;
                this.particleMaterial.opacity = 0.6 + this.beatIntensity * 0.2;
            }
        }
    }

    onBeat(intensity) {
        super.onBeat(intensity);

        // Trigger explosion-like effect by increasing displacement briefly
        if (this.material && this.material.uniforms) {
            // This is handled via the beatIntensity uniform now
        }
    }

    onControlChange(name, value) {
        if (!this.material || !this.material.uniforms) return;

        const uniforms = this.material.uniforms;

        switch (name) {
            case 'displacement':
                uniforms.uDisplacement.value = value;
                break;
            case 'noiseScale':
                uniforms.uNoiseScale.value = value;
                break;
            case 'noiseSpeed':
                uniforms.uNoiseSpeed.value = value;
                break;
            case 'noiseOctaves':
                uniforms.uNoiseOctaves.value = value;
                break;
            case 'glowIntensity':
                uniforms.uGlowIntensity.value = value;
                break;
            case 'fresnelPower':
                uniforms.uFresnelPower.value = value;
                break;
            case 'wireframe':
                this.material.wireframe = value;
                break;
            case 'showParticles':
                if (this.particles) {
                    this.particles.visible = value;
                }
                break;
        }

        this.controls[name] = value;
    }

    setColorPalette(paletteName) {
        if (!this.colorPalettes[paletteName]) return;

        this.currentPalette = paletteName;
        const palette = this.colorPalettes[paletteName];

        if (this.material && this.material.uniforms) {
            this.material.uniforms.uColor1.value = palette.color1;
            this.material.uniforms.uColor2.value = palette.color2;
            this.material.uniforms.uColor3.value = palette.color3;
        }

        // Update particle colors
        if (this.particles && this.particles.geometry) {
            const colors = this.particles.geometry.attributes.color.array;
            const count = colors.length / 3;

            for (let i = 0; i < count; i++) {
                const color = Math.random() < 0.5 ? palette.color1 : palette.color2;
                colors[i * 3] = color.r;
                colors[i * 3 + 1] = color.g;
                colors[i * 3 + 2] = color.b;
            }

            this.particles.geometry.attributes.color.needsUpdate = true;
        }
    }

    getControls() {
        return {
            displacement: {
                type: 'range',
                label: 'Displacement',
                min: 0,
                max: 2,
                step: 0.1,
                value: this.controls.displacement
            },
            noiseScale: {
                type: 'range',
                label: 'Noise Scale',
                min: 0.5,
                max: 5,
                step: 0.1,
                value: this.controls.noiseScale
            },
            noiseSpeed: {
                type: 'range',
                label: 'Noise Speed',
                min: 0,
                max: 1,
                step: 0.05,
                value: this.controls.noiseSpeed
            },
            noiseOctaves: {
                type: 'range',
                label: 'Noise Detail',
                min: 1,
                max: 8,
                step: 1,
                value: this.controls.noiseOctaves
            },
            glowIntensity: {
                type: 'range',
                label: 'Glow',
                min: 0,
                max: 3,
                step: 0.1,
                value: this.controls.glowIntensity
            },
            fresnelPower: {
                type: 'range',
                label: 'Edge Glow',
                min: 1,
                max: 5,
                step: 0.5,
                value: this.controls.fresnelPower
            },
            rotationSpeed: {
                type: 'range',
                label: 'Rotation',
                min: 0,
                max: 1,
                step: 0.05,
                value: this.controls.rotationSpeed
            },
            wireframe: {
                type: 'toggle',
                label: 'Wireframe',
                value: this.controls.wireframe
            },
            showParticles: {
                type: 'toggle',
                label: 'Particles',
                value: this.controls.showParticles
            }
        };
    }

    setQuality(level) {
        super.setQuality(level);

        // Rebuild geometry if needed
        if (this.isInitialized && this.geometry) {
            const quality = this.getQualitySettings();

            // Dispose old geometry
            this.geometry.dispose();

            // Create new geometry with new detail level
            this.geometry = new THREE.IcosahedronGeometry(2, quality.detail);
            this.mesh.geometry = this.geometry;

            // Rebuild particles
            if (this.particles) {
                this.container.remove(this.particles);
                this.particles.geometry.dispose();
                this.createParticles(quality.particles);
            }
        }
    }

    dispose() {
        if (this.geometry) {
            this.geometry.dispose();
        }
        if (this.material) {
            this.material.dispose();
        }
        if (this.particles) {
            this.particles.geometry.dispose();
        }
        if (this.particleMaterial) {
            this.particleMaterial.dispose();
        }

        super.dispose();
    }
}

export default SphereVisualizer;
