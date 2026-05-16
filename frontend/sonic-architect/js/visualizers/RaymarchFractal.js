/**
 * RaymarchFractal - Mandelbulb raymarched fractal.
 * Designed to be "wow" even without audio.
 */

import VisualizerBase from './VisualizerBase.js';
import * as THREE from 'three';

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

const fragmentShader = `
    precision highp float;

    varying vec2 vUv;

    uniform float uTime;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uBeatIntensity;

    uniform float uPower;
    uniform float uIterations;
    uniform float uEpsilon;
    uniform float uFog;
    uniform float uGlow;
    uniform float uZoom;
    uniform float uRotateSpeed;

    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;

    uniform mat4 uInvProjection;
    uniform mat4 uInvView;
    uniform vec3 uCameraPos;

    mat2 rot(float a) {
        float c = cos(a), s = sin(a);
        return mat2(c, -s, s, c);
    }

    float mandelbulbDE(vec3 pos, out float trap) {
        vec3 z = pos;
        float dr = 1.0;
        float r = 0.0;
        trap = 1e9;

        float power = max(2.0, uPower);
        int iters = int(clamp(uIterations, 1.0, 32.0));

        for (int i = 0; i < 32; i++) {
            if (i >= iters) break;
            r = length(z);
            trap = min(trap, r);
            if (r > 4.0) break;

            float theta = acos(clamp(z.z / r, -1.0, 1.0));
            float phi = atan(z.y, z.x);
            dr = pow(r, power - 1.0) * power * dr + 1.0;

            float zr = pow(r, power);
            theta *= power;
            phi *= power;
            z = zr * vec3(
                sin(theta) * cos(phi),
                sin(phi) * sin(theta),
                cos(theta)
            ) + pos;
        }

        float dist = 0.5 * log(r) * r / dr;
        return dist;
    }

    float map(vec3 p, out float trap) {
        // Rotate space over time for motion.
        float t = uTime * (0.25 + uRotateSpeed) + uBass * 0.35;
        p.xz = rot(t * 0.55) * p.xz;
        p.xy = rot(t * 0.35) * p.xy;
        p *= uZoom;
        return mandelbulbDE(p, trap);
    }

    vec3 estimateNormal(vec3 p) {
        float trap;
        float e = max(0.0002, uEpsilon) * 1.5;
        vec2 h = vec2(e, 0.0);
        float dx = map(p + vec3(h.x, h.y, h.y), trap) - map(p - vec3(h.x, h.y, h.y), trap);
        float dy = map(p + vec3(h.y, h.x, h.y), trap) - map(p - vec3(h.y, h.x, h.y), trap);
        float dz = map(p + vec3(h.y, h.y, h.x), trap) - map(p - vec3(h.y, h.y, h.x), trap);
        return normalize(vec3(dx, dy, dz));
    }

    vec3 palette(float k) {
        k = clamp(k, 0.0, 1.0);
        vec3 a = uColor1;
        vec3 b = uColor2;
        vec3 c = uColor3;
        return mix(mix(a, b, smoothstep(0.0, 0.65, k)), c, smoothstep(0.6, 1.0, k));
    }

    void main() {
        vec2 uv = vUv * 2.0 - 1.0;
        uv.x *= 1.0; // aspect handled via ray unprojection

        // Build world ray from camera matrices.
        vec4 clip = vec4(uv, -1.0, 1.0);
        vec4 view = uInvProjection * clip;
        view /= max(1e-6, view.w);
        vec4 world = uInvView * vec4(view.xyz, 1.0);
        vec3 ro = uCameraPos;
        vec3 rd = normalize(world.xyz - ro);

        // Raymarch
        float t = 0.0;
        float trap = 0.0;
        float hit = 0.0;
        vec3 p = ro;
        float glowAcc = 0.0;
        // Allow larger camera distances without turning into "nothingness".
        float maxT = 120.0;
        float eps = max(0.00025, uEpsilon);

        for (int i = 0; i < 140; i++) {
            p = ro + rd * t;
            float localTrap;
            float d = map(p, localTrap);
            trap = localTrap;
            glowAcc += exp(-d * 35.0) * 0.012;
            if (d < eps) { hit = 1.0; break; }
            t += d * 0.95;
            if (t > maxT) break;
        }

        vec3 col = vec3(0.0);
        float fog = clamp(uFog, 0.0, 2.0);

        if (hit > 0.5) {
            vec3 n = estimateNormal(p);
            vec3 ldir = normalize(vec3(0.6, 0.9, 0.4));
            float diff = max(0.0, dot(n, ldir));
            float fres = pow(1.0 - max(0.0, dot(n, -rd)), 3.0);

            float k = clamp(0.7 - trap * 0.35 + uHigh * 0.2 + uBeatIntensity * 0.2, 0.0, 1.0);
            vec3 base = palette(k);

            float spec = pow(max(0.0, dot(reflect(-ldir, n), -rd)), 32.0) * (0.2 + uHigh);
            col = base * (0.25 + diff * (1.1 + uMid)) + vec3(spec) + fres * (0.15 + uBass);
        }

        // Atmospheric fog
        float fogAmt = 1.0 - exp(-t * (0.06 + fog * 0.06));
        vec3 fogCol = palette(0.1 + 0.15 * sin(uTime * 0.15));
        col = mix(col, fogCol * 0.25, fogAmt);

        // Glow
        float g = glowAcc * (0.6 + uGlow * 2.0 + uBeatIntensity * 1.2);
        col += palette(0.75) * g;

        // Soft filmic curve
        col = col / (1.0 + col);
        gl_FragColor = vec4(col, 1.0);
    }
`;

class RaymarchFractal extends VisualizerBase {
    constructor(scene, camera, renderer) {
        super(scene, camera, renderer);

        this.id = 'fractal';
        this.name = 'Raymarch Fractal';
        this.description = 'Mandelbulb raymarch with glow';
        this.author = '3D Visualizer';

        this.mesh = null;
        this.material = null;

        this.controls = {
            power: 8.0,
            iterations: 10,
            detail: 0.004,
            fog: 0.9,
            glow: 0.9,
            zoom: 0.85,
            rotateSpeed: 0.65,
        };
        this.defaultControls = { ...this.controls };

        this.color1 = new THREE.Color(0xff00ff);
        this.color2 = new THREE.Color(0xffffff);
        this.color3 = new THREE.Color(0x00ffff);
    }

    init() {
        super.init();

        const geo = new THREE.PlaneGeometry(2, 2);
        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uBass: { value: 0 },
                uMid: { value: 0 },
                uHigh: { value: 0 },
                uBeatIntensity: { value: 0 },

                uPower: { value: this.controls.power },
                uIterations: { value: this.controls.iterations },
                uEpsilon: { value: this.controls.detail },
                uFog: { value: this.controls.fog },
                uGlow: { value: this.controls.glow },
                uZoom: { value: this.controls.zoom },
                uRotateSpeed: { value: this.controls.rotateSpeed },

                uColor1: { value: this.color1 },
                uColor2: { value: this.color2 },
                uColor3: { value: this.color3 },

                uInvProjection: { value: new THREE.Matrix4() },
                uInvView: { value: new THREE.Matrix4() },
                uCameraPos: { value: new THREE.Vector3() },
            },
            depthWrite: false,
            depthTest: false,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -10;
        this.container.add(this.mesh);

        return this;
    }

    update(deltaTime, audioData) {
        super.update(deltaTime, audioData);
        if (!this.material) return;

        const uniforms = this.material.uniforms;
        uniforms.uTime.value = this.elapsedTime;
        if (audioData) {
            uniforms.uBass.value = audioData.bassLevel || 0;
            uniforms.uMid.value = audioData.midLevel || 0;
            uniforms.uHigh.value = audioData.highLevel || 0;
        }
        uniforms.uBeatIntensity.value = this.beatIntensity;

        uniforms.uPower.value = this.controls.power;
        uniforms.uIterations.value = this.controls.iterations;
        uniforms.uEpsilon.value = this.controls.detail;
        uniforms.uFog.value = this.controls.fog;
        uniforms.uGlow.value = this.controls.glow;
        uniforms.uZoom.value = this.controls.zoom;
        uniforms.uRotateSpeed.value = this.controls.rotateSpeed;

        // Camera matrices for ray unprojection.
        uniforms.uInvProjection.value.copy(this.camera.projectionMatrixInverse);
        uniforms.uInvView.value.copy(this.camera.matrixWorld);
        uniforms.uCameraPos.value.copy(this.camera.position);
    }

    onControlChange(name, value) {
        this.controls[name] = value;
    }

    getControls() {
        return {
            power: { type: 'range', label: 'Power', min: 2, max: 12, step: 0.1, value: this.controls.power },
            iterations: { type: 'range', label: 'Iterations', min: 4, max: 18, step: 1, value: this.controls.iterations },
            detail: { type: 'range', label: 'Detail', min: 0.001, max: 0.02, step: 0.0005, value: this.controls.detail },
            fog: { type: 'range', label: 'Fog', min: 0, max: 2, step: 0.05, value: this.controls.fog },
            glow: { type: 'range', label: 'Glow', min: 0, max: 2, step: 0.05, value: this.controls.glow },
            zoom: { type: 'range', label: 'Zoom', min: 0.5, max: 1.6, step: 0.01, value: this.controls.zoom },
            rotateSpeed: { type: 'range', label: 'Rotation', min: 0, max: 1.5, step: 0.05, value: this.controls.rotateSpeed },
        };
    }

    dispose() {
        if (this.mesh) {
            this.container.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
        this.material = null;
        super.dispose();
    }
}

export default RaymarchFractal;
