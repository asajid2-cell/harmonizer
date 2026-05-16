/**
 * SONIC ARCHITECT MK.III
 * Kaleidoscope - Fractal Kaleidoscope Patterns
 *
 * Features:
 * - Radial symmetry mirroring
 * - Fractal pattern generation
 * - Audio-reactive color cycling
 * - Beat-triggered pattern shifts
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

const fragmentShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;
    uniform float uSymmetry;
    uniform float uComplexity;

    varying vec2 vUv;

    // Rotation matrix
    mat2 rotate(float angle) {
        float c = cos(angle);
        float s = sin(angle);
        return mat2(c, -s, s, c);
    }

    // Kaleidoscope mirroring
    vec2 kaleidoscope(vec2 uv, float segments) {
        float angle = atan(uv.y, uv.x);
        float radius = length(uv);

        float segmentAngle = 6.28318 / segments;
        angle = mod(angle, segmentAngle);

        // Mirror every other segment
        if (mod(floor(atan(uv.y, uv.x) / segmentAngle), 2.0) > 0.5) {
            angle = segmentAngle - angle;
        }

        return vec2(cos(angle), sin(angle)) * radius;
    }

    // Fractal pattern
    float pattern(vec2 uv, float time) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;

        for (int i = 0; i < 5; i++) {
            vec2 p = uv * frequency;
            p = rotate(time * 0.1 * float(i + 1)) * p;

            value += sin(p.x * 10.0 + time) * sin(p.y * 10.0 - time) * amplitude;

            frequency *= 2.0;
            amplitude *= 0.5;
        }

        return value;
    }

    // Psychedelic color mapping
    vec3 getColor(float value, float time) {
        vec3 col1 = vec3(1.0, 0.0, 0.5);
        vec3 col2 = vec3(0.0, 1.0, 0.8);
        vec3 col3 = vec3(0.8, 0.2, 1.0);

        float t = mod(value + time * 0.5, 3.0);

        if (t < 1.0) {
            return mix(col1, col2, t);
        } else if (t < 2.0) {
            return mix(col2, col3, t - 1.0);
        } else {
            return mix(col3, col1, t - 2.0);
        }
    }

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;

        // Apply kaleidoscope effect
        vec2 kUv = kaleidoscope(uv, uSymmetry + uBass * 4.0);

        // Scale based on audio
        float scale = 1.0 + uMid * 0.5 + uBeatIntensity * 0.3;
        kUv *= scale;

        // Generate fractal pattern
        float pat = pattern(kUv, uTime + uHigh * 2.0);

        // Add pulsing rings
        float dist = length(uv);
        pat += sin(dist * 20.0 - uTime * 3.0) * 0.3;

        // Apply beat intensity
        pat = pat * (1.0 + uBeatIntensity * 0.5);

        // Get color
        vec3 color = getColor(pat, uTime);

        // Add glow
        float glow = 1.0 / (1.0 + dist * 2.0);
        color += vec3(glow * uHigh * 0.3);

        // Vignette
        float vignette = 1.0 - dist * 0.4;
        color *= vignette;

        gl_FragColor = vec4(color, 1.0);
    }
`;

const vertexShader = `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

class Kaleidoscope extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'kaleidoscope';
        this.name = 'Kaleidoscope';
        this.description = 'Fractal kaleidoscope patterns with radial symmetry';

        this.mesh = null;
        this.uniforms = {
            uTime: { value: 0 },
            uBass: { value: 0 },
            uMid: { value: 0 },
            uHigh: { value: 0 },
            uBeatIntensity: { value: 0 },
            uSymmetry: { value: 6.0 },
            uComplexity: { value: 1.0 }
        };

        this.controls = {
            symmetry: 6,
            complexity: 1.0,
            speed: 1.0
        };
    }

    init() {
        super.init();

        const geometry = new THREE.PlaneGeometry(20, 20);
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.container.add(this.mesh);

        return this;
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        this.uniforms.uTime.value += deltaTime * this.controls.speed;

        if (audioData) {
            this.uniforms.uBass.value = (audioData.bass || 0) / 255;
            this.uniforms.uMid.value = (audioData.mid || 0) / 255;
            this.uniforms.uHigh.value = (audioData.high || 0) / 255;
        }

        this.uniforms.uBeatIntensity.value = this.beatIntensity;
        this.uniforms.uSymmetry.value = this.controls.symmetry;
        this.uniforms.uComplexity.value = this.controls.complexity;
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        super.dispose();
    }
}

export default Kaleidoscope;
