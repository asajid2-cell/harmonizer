/**
 * SONIC ARCHITECT MK.III
 * Terrain - Audio-Reactive Procedural Landscape
 *
 * Features:
 * - Scrolling terrain mesh
 * - Audio-driven height displacement
 * - Gradient color mapping by height
 * - Beat-triggered waves
 * - Fog atmosphere
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

const vertexShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;
    uniform float uScrollSpeed;
    uniform float uNoiseScale;
    uniform float uHeightScale;
    uniform sampler2D uFrequencyTexture;

    varying float vHeight;
    varying vec2 vUv;
    varying vec3 vNormal;

    // Simplex noise
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
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
        vUv = uv;

        // Scrolling position (plane length is along Y in object space)
        vec3 pos = position;
        float scrollAxis = pos.y + uTime * uScrollSpeed;

        // Multi-octave noise for terrain
        float noise1 = snoise(vec3(pos.x * uNoiseScale, scrollAxis * uNoiseScale, 0.0));
        float noise2 = snoise(vec3(pos.x * uNoiseScale * 2.0, scrollAxis * uNoiseScale * 2.0, 1.0)) * 0.5;
        float noise3 = snoise(vec3(pos.x * uNoiseScale * 4.0, scrollAxis * uNoiseScale * 4.0, 2.0)) * 0.25;

        float baseNoise = noise1 + noise2 + noise3;

        // Audio-reactive height
        float audioHeight = uBass * 1.5 + uMid * 0.8 + uHigh * 0.4;

        // Beat wave
        float beatWave = sin(scrollAxis * 2.0 - uTime * 10.0) * uBeatIntensity;

        // Final height
        float height = baseNoise * uHeightScale * (0.5 + audioHeight) + beatWave;

        // Displace along Z in object space so vertical height becomes world Y after mesh rotation
        pos.z = height;
        vHeight = height;

        // Calculate normal for lighting
        float eps = 0.1;
        float hL = snoise(vec3((pos.x - eps) * uNoiseScale, scrollAxis * uNoiseScale, 0.0)) * uHeightScale;
        float hR = snoise(vec3((pos.x + eps) * uNoiseScale, scrollAxis * uNoiseScale, 0.0)) * uHeightScale;
        float hD = snoise(vec3(pos.x * uNoiseScale, (scrollAxis - eps) * uNoiseScale, 0.0)) * uHeightScale;
        float hU = snoise(vec3(pos.x * uNoiseScale, (scrollAxis + eps) * uNoiseScale, 0.0)) * uHeightScale;

        vec3 objectNormal = normalize(vec3(hL - hR, hD - hU, 2.0 * eps));
        vNormal = normalize(normalMatrix * objectNormal);

        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
`;

const fragmentShader = `
    uniform float uTime;
    uniform float uBeatIntensity;
    uniform vec3 uColorLow;
    uniform vec3 uColorMid;
    uniform vec3 uColorHigh;
    uniform float uFogDensity;
    uniform vec3 uFogColor;

    varying float vHeight;
    varying vec2 vUv;
    varying vec3 vNormal;

    void main() {
        // Height-based color gradient
        float heightNorm = (vHeight + 2.0) / 4.0; // Normalize to 0-1 range
        heightNorm = clamp(heightNorm, 0.0, 1.0);

        vec3 color;
        if (heightNorm < 0.5) {
            color = mix(uColorLow, uColorMid, heightNorm * 2.0);
        } else {
            color = mix(uColorMid, uColorHigh, (heightNorm - 0.5) * 2.0);
        }

        // Simple lighting - additive instead of multiplicative
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
        float diffuse = max(dot(vNormal, lightDir), 0.0);
        color += color * diffuse * 0.3;

        // Beat glow
        color += vec3(uBeatIntensity * 0.3);

        // Scanlines
        float scanline = sin(vUv.y * 100.0 + uTime * 5.0) * 0.03;
        color += scanline;

        // Fog based on UV (distance) - reduced intensity
        float fogFactor = 1.0 - exp(-pow(vUv.y * uFogDensity * 0.5, 2.0));
        color = mix(color, uFogColor, fogFactor * 0.5);

        // Grid lines - brighter cyan
        float gridX = step(0.98, fract(vUv.x * 20.0));
        float gridY = step(0.98, fract(vUv.y * 40.0));
        color += vec3(0.0, 1.0, 1.0) * (gridX + gridY) * 0.5;

        gl_FragColor = vec4(color, 1.0);
    }
`;

class Terrain extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'terrain';
        this.name = 'Terrain';
        this.description = 'Audio-reactive procedural landscape';
        this.author = '3D Visualizer';

        // Geometry and material
        this.geometry = null;
        this.material = null;
        this.mesh = null;

        // Configuration
        this.controls = {
            scrollSpeed: 2,
            noiseScale: 0.3,
            heightScale: 2,
            fogDensity: 1.5,
            wireframe: false
        };

        this.defaultControls = { ...this.controls };

        // Color schemes - brighter base colors
        this.colorSchemes = {
            cyber: {
                low: new THREE.Color(0x001144),
                mid: new THREE.Color(0x00ffff),
                high: new THREE.Color(0xff00ff),
                fog: new THREE.Color(0x000022)
            },
            sunset: {
                low: new THREE.Color(0x1a0a2e),
                mid: new THREE.Color(0xff6b35),
                high: new THREE.Color(0xffff00),
                fog: new THREE.Color(0x2d1b69)
            },
            matrix: {
                low: new THREE.Color(0x001100),
                mid: new THREE.Color(0x00ff00),
                high: new THREE.Color(0xffffff),
                fog: new THREE.Color(0x000000)
            }
        };

        this.currentScheme = 'cyber';

        // Quality settings
        this.qualitySettings = {
            low: { widthSegments: 64, heightSegments: 64 },
            medium: { widthSegments: 128, heightSegments: 128 },
            high: { widthSegments: 256, heightSegments: 256 },
            ultra: { widthSegments: 512, heightSegments: 512 }
        };
    }

    init() {
        super.init();

        const quality = this.getQualitySettings();
        const colors = this.colorSchemes[this.currentScheme];

        // Create plane geometry
        this.geometry = new THREE.PlaneGeometry(
            20, 40,
            quality.widthSegments,
            quality.heightSegments
        );

        // Create shader material with uniforms
        this.material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uBass: { value: 0 },
                uMid: { value: 0 },
                uHigh: { value: 0 },
                uBeatIntensity: { value: 0 },
                uScrollSpeed: { value: this.controls.scrollSpeed },
                uNoiseScale: { value: this.controls.noiseScale },
                uHeightScale: { value: this.controls.heightScale },
                uColorLow: { value: colors.low },
                uColorMid: { value: colors.mid },
                uColorHigh: { value: colors.high },
                uFogDensity: { value: this.controls.fogDensity },
                uFogColor: { value: colors.fog },
                uFrequencyTexture: { value: null }
            },
            wireframe: this.controls.wireframe,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
            depthTest: true
        });

        // Create mesh
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.rotation.x = -Math.PI / 2; // Flat horizontal
        this.mesh.position.set(0, 0, 0); // Center at origin
        this.container.add(this.mesh);

        console.log('🌄 Terrain mesh created and added to container');
        console.log('🌄 Mesh rotation:', this.mesh.rotation.x);
        console.log('🌄 Mesh position:', this.mesh.position);
        console.log('🌄 Mesh visible:', this.mesh.visible);
        console.log('🌄 Material:', this.material);

        return this;
    }

    activate() {
        super.activate();

        // Ensure container is visible
        if (this.container) {
            this.container.visible = true;
        }

        // Disable scene fog - terrain has its own shader fog
        this.savedSceneFog = this.scene.fog;
        this.scene.fog = null;

        // Save and configure OrbitControls for terrain view
        const controls = window.sonicApp?.controls;
        if (controls) {
            this.savedAutoRotate = controls.autoRotate;
            controls.autoRotate = false;
            controls.target.set(0, 0, -5);
            // Sync OrbitControls internal state to new target/camera.
            if (typeof controls.update === 'function') {
                controls.update();
            }
        }

        // Adjust camera when terrain activates - view from angle to see scrolling
        this.camera.position.set(0, 8, 15);
        this.camera.lookAt(0, 0, -5);
        if (controls && typeof controls.update === 'function') {
            controls.update();
        }

        return this;
    }

    deactivate() {
        super.deactivate();

        // Restore scene fog
        if (this.savedSceneFog) {
            this.scene.fog = this.savedSceneFog;
        }

        // Restore OrbitControls settings
        const controls = window.sonicApp?.controls;
        if (controls && this.savedAutoRotate !== undefined) {
            controls.autoRotate = this.savedAutoRotate;
            controls.target.set(0, 0, 0);
            if (typeof controls.update === 'function') {
                controls.update();
            }
        }

        // Reset camera when terrain deactivates
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);
        if (controls && typeof controls.update === 'function') {
            controls.update();
        }

        return this;
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        if (!this.material) return;

        // Debug: log every 60 frames (~ 1 second)
        if (Math.floor(this.elapsedTime * 60) % 60 === 0) {
            console.log('🌄 Terrain update - active:', this.isActive, 'visible:', this.container?.visible);
        }

        // Skip uniform updates if material doesn't have them
        if (!this.material.uniforms) {
            return;
        }

        const uniforms = this.material.uniforms;

        // Update time
        uniforms.uTime.value = this.elapsedTime;

        // Update audio - handle both old and new property names
        if (audioData) {
            const bass = audioData.bass ?? audioData.bassLevel ?? 0;
            const mid = audioData.mid ?? audioData.midLevel ?? 0;
            const high = audioData.high ?? audioData.highLevel ?? 0;

            uniforms.uBass.value = bass;
            uniforms.uMid.value = mid;
            uniforms.uHigh.value = high;
        }

        uniforms.uBeatIntensity.value = this.beatIntensity;
    }

    onBeat(intensity) {
        super.onBeat(intensity);
    }

    onControlChange(name, value) {
        if (!this.material) return;

        const uniforms = this.material.uniforms;

        switch (name) {
            case 'scrollSpeed':
                uniforms.uScrollSpeed.value = value;
                break;
            case 'noiseScale':
                uniforms.uNoiseScale.value = value;
                break;
            case 'heightScale':
                uniforms.uHeightScale.value = value;
                break;
            case 'fogDensity':
                uniforms.uFogDensity.value = value;
                break;
            case 'wireframe':
                this.material.wireframe = value;
                break;
        }

        this.controls[name] = value;
    }

    setColorScheme(scheme) {
        if (!this.colorSchemes[scheme]) return;

        this.currentScheme = scheme;
        const colors = this.colorSchemes[scheme];

        if (this.material && this.material.uniforms) {
            this.material.uniforms.uColorLow.value = colors.low;
            this.material.uniforms.uColorMid.value = colors.mid;
            this.material.uniforms.uColorHigh.value = colors.high;
            this.material.uniforms.uFogColor.value = colors.fog;
        }
    }

    getControls() {
        return {
            scrollSpeed: {
                type: 'range',
                label: 'Speed',
                min: 0,
                max: 10,
                step: 0.5,
                value: this.controls.scrollSpeed
            },
            heightScale: {
                type: 'range',
                label: 'Height',
                min: 0.5,
                max: 5,
                step: 0.25,
                value: this.controls.heightScale
            },
            noiseScale: {
                type: 'range',
                label: 'Detail',
                min: 0.1,
                max: 1,
                step: 0.05,
                value: this.controls.noiseScale
            },
            fogDensity: {
                type: 'range',
                label: 'Fog',
                min: 0,
                max: 3,
                step: 0.1,
                value: this.controls.fogDensity
            },
            wireframe: {
                type: 'toggle',
                label: 'Wireframe',
                value: this.controls.wireframe
            }
        };
    }

    setQuality(level) {
        super.setQuality(level);

        if (this.isInitialized && this.geometry) {
            const quality = this.getQualitySettings();

            this.geometry.dispose();
            this.geometry = new THREE.PlaneGeometry(
                20, 40,
                quality.widthSegments,
                quality.heightSegments
            );
            this.mesh.geometry = this.geometry;
        }
    }

    dispose() {
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();
        super.dispose();
    }
}

export default Terrain;
