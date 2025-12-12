/**
 * SONIC ARCHITECT MK.III
 * PostProcessing - Custom Post-Processing Effects
 *
 * Includes:
 * - Chromatic Aberration
 * - Glitch Effect
 * - Scanlines
 * - Vignette
 * - Film Grain
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// ==========================================
// CHROMATIC ABERRATION PASS
// ==========================================

const ChromaticShader = {
    uniforms: {
        tDiffuse: { value: null },
        uOffset: { value: 0.005 },
        uIntensity: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uOffset;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
            float offset = uOffset * clamp(uIntensity, 0.0, 5.0);
            vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));

            // Sample each channel with clamped UVs to avoid black frames
            vec2 rUv = clamp(uv + vec2(offset, 0.0), vec2(0.0), vec2(1.0));
            vec2 bUv = clamp(uv - vec2(offset, 0.0), vec2(0.0), vec2(1.0));

            float r = texture2D(tDiffuse, rUv).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, bUv).b;

            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `
};

export class ChromaticAberrationPass extends Pass {
    constructor(offset = 0.005) {
        super();

        this.uniforms = THREE.UniformsUtils.clone(ChromaticShader.uniforms);
        this.uniforms.uOffset.value = offset;

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: ChromaticShader.vertexShader,
            fragmentShader: ChromaticShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    setIntensity(value) {
        this.uniforms.uIntensity.value = value;
    }

    setOffset(value) {
        this.uniforms.uOffset.value = value;
    }

    dispose() {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

// ==========================================
// GLITCH PASS
// ==========================================

const GlitchShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
        uAmount: { value: 0.1 },
        uSpeed: { value: 1.0 },
        uSeed: { value: Math.random() }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uAmount;
        uniform float uSpeed;
        uniform float uSeed;
        varying vec2 vUv;

        float random(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            float t = uTime * uSpeed;

            // Random glitch trigger
            float glitchStrength = step(0.99 - uIntensity * 0.1, random(vec2(floor(t * 20.0), uSeed)));

            if (glitchStrength > 0.0) {
                // Horizontal shift
                float shiftAmount = (random(vec2(uSeed, floor(vUv.y * 50.0))) - 0.5) * uAmount * uIntensity;
                uv.x += shiftAmount;

                // Color channel separation
                float rOffset = (random(vec2(t, uSeed)) - 0.5) * 0.02 * uIntensity;
                float bOffset = (random(vec2(uSeed, t)) - 0.5) * 0.02 * uIntensity;

                // Clamp UV to avoid black frames on some GPUs when shifts go out of range
                vec2 safeUv = clamp(uv, vec2(0.0), vec2(1.0));

                float r = texture2D(tDiffuse, safeUv + vec2(rOffset, 0.0)).r;
                float g = texture2D(tDiffuse, safeUv).g;
                float b = texture2D(tDiffuse, safeUv + vec2(bOffset, 0.0)).b;

                // Block glitch
                float blockY = floor(vUv.y * 20.0) / 20.0;
                if (random(vec2(blockY, floor(t * 10.0))) > 0.97) {
                    uv.x += (random(vec2(blockY, uSeed)) - 0.5) * 0.3;
                    vec2 blockUv = clamp(uv, vec2(0.0), vec2(1.0));
                    vec4 blockColor = texture2D(tDiffuse, blockUv);
                    gl_FragColor = blockColor;
                    return;
                }

                gl_FragColor = vec4(r, g, b, 1.0);
            } else {
                vec2 safeUv = clamp(uv, vec2(0.0), vec2(1.0));
                gl_FragColor = texture2D(tDiffuse, safeUv);
            }
        }
    `
};

export class GlitchPass extends Pass {
    constructor(intensity = 0.5) {
        super();

        this.uniforms = THREE.UniformsUtils.clone(GlitchShader.uniforms);
        this.uniforms.uIntensity.value = intensity;

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: GlitchShader.vertexShader,
            fragmentShader: GlitchShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.material);
        this.time = 0;
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        this.time += deltaTime;
        this.uniforms.tDiffuse.value = readBuffer.texture;
        this.uniforms.uTime.value = this.time;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    setIntensity(value) {
        this.uniforms.uIntensity.value = value;
    }

    trigger() {
        this.uniforms.uSeed.value = Math.random();
    }

    dispose() {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

// ==========================================
// SCANLINES PASS
// ==========================================

const ScanlinesShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uCount: { value: 800.0 },
        uIntensity: { value: 0.1 },
        uSpeed: { value: 2.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uCount;
        uniform float uIntensity;
        uniform float uSpeed;
        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            // Scanline effect
            float scanline = sin((vUv.y + uTime * uSpeed * 0.01) * uCount) * 0.5 + 0.5;
            scanline = pow(scanline, 1.5);

            // Apply scanline darkening
            color.rgb *= 1.0 - scanline * uIntensity;

            // CRT curvature simulation (subtle)
            vec2 center = vUv - 0.5;
            float vignette = 1.0 - dot(center, center) * 0.5;
            color.rgb *= vignette;

            gl_FragColor = color;
        }
    `
};

export class ScanlinesPass extends Pass {
    constructor(count = 800, intensity = 0.1) {
        super();

        this.uniforms = THREE.UniformsUtils.clone(ScanlinesShader.uniforms);
        this.uniforms.uCount.value = count;
        this.uniforms.uIntensity.value = intensity;

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: ScanlinesShader.vertexShader,
            fragmentShader: ScanlinesShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.material);
        this.time = 0;
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        this.time += deltaTime;
        this.uniforms.tDiffuse.value = readBuffer.texture;
        this.uniforms.uTime.value = this.time;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    setIntensity(value) {
        this.uniforms.uIntensity.value = value;
    }

    setCount(value) {
        this.uniforms.uCount.value = value;
    }

    dispose() {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

// ==========================================
// VIGNETTE PASS
// ==========================================

const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        uOffset: { value: 1.0 },
        uDarkness: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uOffset;
        uniform float uDarkness;
        varying vec2 vUv;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            // Calculate distance from center
            vec2 center = vUv - 0.5;
            float dist = length(center);

            // Vignette calculation
            float vignette = smoothstep(0.8, uOffset * 0.5, dist * (uDarkness + uOffset));

            color.rgb *= vignette;

            gl_FragColor = color;
        }
    `
};

export class VignettePass extends Pass {
    constructor(offset = 1.0, darkness = 1.0) {
        super();

        this.uniforms = THREE.UniformsUtils.clone(VignetteShader.uniforms);
        this.uniforms.uOffset.value = offset;
        this.uniforms.uDarkness.value = darkness;

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VignetteShader.vertexShader,
            fragmentShader: VignetteShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.material);
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    setOffset(value) {
        this.uniforms.uOffset.value = value;
    }

    setDarkness(value) {
        this.uniforms.uDarkness.value = value;
    }

    dispose() {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

// ==========================================
// FILM GRAIN PASS
// ==========================================

const FilmGrainShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uIntensity: { value: 0.1 },
        uSpeed: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uIntensity;
        uniform float uSpeed;
        varying vec2 vUv;

        float random(vec2 co) {
            return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);

            // Generate noise
            float noise = random(vUv + uTime * uSpeed) * 2.0 - 1.0;

            // Apply grain
            color.rgb += noise * uIntensity;

            gl_FragColor = color;
        }
    `
};

export class FilmGrainPass extends Pass {
    constructor(intensity = 0.1) {
        super();

        this.uniforms = THREE.UniformsUtils.clone(FilmGrainShader.uniforms);
        this.uniforms.uIntensity.value = intensity;

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: FilmGrainShader.vertexShader,
            fragmentShader: FilmGrainShader.fragmentShader
        });

        this.fsQuad = new FullScreenQuad(this.material);
        this.time = 0;
    }

    render(renderer, writeBuffer, readBuffer, deltaTime) {
        this.time += deltaTime;
        this.uniforms.tDiffuse.value = readBuffer.texture;
        this.uniforms.uTime.value = this.time;

        if (this.renderToScreen) {
            renderer.setRenderTarget(null);
            this.fsQuad.render(renderer);
        } else {
            renderer.setRenderTarget(writeBuffer);
            if (this.clear) renderer.clear();
            this.fsQuad.render(renderer);
        }
    }

    setIntensity(value) {
        this.uniforms.uIntensity.value = value;
    }

    dispose() {
        this.material.dispose();
        this.fsQuad.dispose();
    }
}

// ==========================================
// POST-PROCESSOR MANAGER
// ==========================================

export class PostProcessorManager {
    constructor(composer) {
        this.composer = composer;
        this.passes = {};
        this.enabled = {
            chromatic: false,
            glitch: false,
            scanlines: false,
            vignette: false,
            filmGrain: false
        };
    }

    /**
     * Add all effect passes
     */
    init() {
        // Create passes
        this.passes.chromatic = new ChromaticAberrationPass(0.003);
        this.passes.glitch = new GlitchPass(0.3);
        this.passes.scanlines = new ScanlinesPass(800, 0.08);
        this.passes.vignette = new VignettePass(1.0, 1.0);
        this.passes.filmGrain = new FilmGrainPass(0.05);

        // Initially disabled
        Object.values(this.passes).forEach(pass => {
            pass.enabled = false;
        });

        // Add to composer
        Object.values(this.passes).forEach(pass => {
            this.composer.addPass(pass);
        });

        return this;
    }

    /**
     * Enable/disable an effect
     */
    setEnabled(effectName, enabled) {
        if (this.passes[effectName]) {
            this.passes[effectName].enabled = enabled;
            this.enabled[effectName] = enabled;
        }
    }

    /**
     * Toggle an effect
     */
    toggle(effectName) {
        const newState = !this.enabled[effectName];
        this.setEnabled(effectName, newState);
        return newState;
    }

    /**
     * Set effect intensity
     */
    setIntensity(effectName, value) {
        if (this.passes[effectName] && this.passes[effectName].setIntensity) {
            this.passes[effectName].setIntensity(value);
        }
    }

    /**
     * Trigger glitch effect
     */
    triggerGlitch() {
        if (this.passes.glitch) {
            this.passes.glitch.trigger();
        }
    }

    /**
     * Update time-based effects
     */
    update(deltaTime) {
        // Passes update automatically in render
    }

    /**
     * Get effect state
     */
    getState() {
        return { ...this.enabled };
    }

    /**
     * Dispose all passes
     */
    dispose() {
        Object.values(this.passes).forEach(pass => {
            if (pass.dispose) pass.dispose();
        });
    }
}
