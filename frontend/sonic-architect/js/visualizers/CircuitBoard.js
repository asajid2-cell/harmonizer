/**
 * SONIC ARCHITECT MK.III
 * Circuit Board - Electronic Circuit Patterns
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

const fragmentShader = `
    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;
    varying vec2 vUv;

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float circuit(vec2 uv, float time) {
        vec2 grid = fract(uv * 10.0);
        vec2 id = floor(uv * 10.0);

        float h = hash(id);

        float line1 = step(0.48, grid.x) * step(grid.x, 0.52);
        float line2 = step(0.48, grid.y) * step(grid.y, 0.52);

        float pulse = sin(time * 3.0 + h * 6.28) * 0.5 + 0.5;

        float circuit = line1 + line2;

        circuit *= pulse;

        float node = 1.0 - smoothstep(0.05, 0.1, length(grid - 0.5));
        circuit += node * pulse;

        return circuit;
    }

    vec3 getCircuitColor(float value, float time) {
        vec3 col1 = vec3(0.0, 1.0, 0.5); // Cyan
        vec3 col2 = vec3(0.0, 0.5, 1.0); // Blue
        vec3 col3 = vec3(1.0, 0.3, 0.0); // Orange

        return mix(col1, mix(col2, col3, uBass), value);
    }

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= 1.0;

        float dist = length(uv);
        uv /= dist * 0.5;

        float circ1 = circuit(uv, uTime);
        float circ2 = circuit(uv * 0.5 + vec2(uTime * 0.1, 0.0), uTime * 0.7);
        float circ3 = circuit(uv * 0.25 - vec2(0.0, uTime * 0.05), uTime * 1.3);

        float combined = circ1 * 0.5 + circ2 * 0.3 + circ3 * 0.2;
        combined *= (1.0 + uBeatIntensity);

        vec3 color = getCircuitColor(combined, uTime);

        color += vec3(0.0, uMid * 0.3, uHigh * 0.5) * combined;

        float vignette = 1.0 - dist * 0.5;
        color *= vignette;

        float alpha = smoothstep(0.0, 0.2, combined);

        gl_FragColor = vec4(color, alpha);
    }
`;

const vertexShader = `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

class CircuitBoard extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'circuit';
        this.name = 'Circuit Board';
        this.description = 'Electronic circuit patterns';

        this.mesh = null;
        this.uniforms = {
            uTime: { value: 0 },
            uBass: { value: 0 },
            uMid: { value: 0 },
            uHigh: { value: 0 },
            uBeatIntensity: { value: 0 }
        };
    }

    init() {
        super.init();

        const geometry = new THREE.PlaneGeometry(20, 20);
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            blending: THREE.AdditiveBlending
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.container.add(this.mesh);

        return this;
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);

        this.uniforms.uTime.value += deltaTime;

        if (audioData) {
            this.uniforms.uBass.value = (audioData.bass || 0) / 255;
            this.uniforms.uMid.value = (audioData.mid || 0) / 255;
            this.uniforms.uHigh.value = (audioData.high || 0) / 255;
        }

        this.uniforms.uBeatIntensity.value = this.beatIntensity;
    }

    dispose() {
        if (this.mesh) {
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        super.dispose();
    }
}

export default CircuitBoard;
