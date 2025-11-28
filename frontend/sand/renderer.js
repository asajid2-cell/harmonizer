// Optimized canvas renderer for particle simulation
import { ParticleTypes, ParticleState } from './particles.js';

export class Renderer {
    constructor(canvas, simulation) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.simulation = simulation;

        // Create offscreen buffer for pixel manipulation
        this.imageData = this.ctx.createImageData(simulation.width, simulation.height);
        this.pixels = this.imageData.data;

        // Background color
        this.bgColor = [26, 26, 26, 255]; // #1a1a1a

        // Scale factor for display
        this.scale = 1;

        // Lighting parameters
        this.lightIntensity = 1.0;
        this.lightRadius = 22;

        // Debug / visualization flags
        this.showHeatmap = false;

        // Performance tracking
        this.lastRenderTime = 0;

        this.clear();
    }

    // Set display scale
    setScale(scale) {
        this.scale = scale;
        this.canvas.style.width = `${this.simulation.width * scale}px`;
        this.canvas.style.height = `${this.simulation.height * scale}px`;
    }

    // Set global light intensity (used by UI)
    setLightIntensity(intensity) {
        this.lightIntensity = Math.max(0, intensity);
    }

    // Toggle heatmap visualization
    setShowHeatmap(enabled) {
        this.showHeatmap = !!enabled;
    }

    // Clear to background color
    clear() {
        for (let i = 0; i < this.pixels.length; i += 4) {
            this.pixels[i] = this.bgColor[0];
            this.pixels[i + 1] = this.bgColor[1];
            this.pixels[i + 2] = this.bgColor[2];
            this.pixels[i + 3] = this.bgColor[3];
        }
    }

    // Render single pixel
    setPixel(x, y, color) {
        const idx = (y * this.simulation.width + x) * 4;

        if (color.length === 4 && color[3] < 255) {
            // Alpha blending
            const alpha = color[3] / 255;
            const invAlpha = 1 - alpha;
            this.pixels[idx] = Math.floor(color[0] * alpha + this.bgColor[0] * invAlpha);
            this.pixels[idx + 1] = Math.floor(color[1] * alpha + this.bgColor[1] * invAlpha);
            this.pixels[idx + 2] = Math.floor(color[2] * alpha + this.bgColor[2] * invAlpha);
            this.pixels[idx + 3] = 255;
        } else {
            this.pixels[idx] = Math.floor(color[0]);
            this.pixels[idx + 1] = Math.floor(color[1]);
            this.pixels[idx + 2] = Math.floor(color[2]);
            this.pixels[idx + 3] = 255;
        }
    }

    // Full render of entire grid
    render() {
        const startTime = performance.now();
        const grid = this.simulation.grid;

        // Clear buffer
        this.clear();

        // Render all particles
        const lightSources = [];
        for (let y = 0; y < this.simulation.height; y++) {
            for (let x = 0; x < this.simulation.width; x++) {
                const particle = grid.get(x, y);
                if (particle && particle.color) {
                    let color = particle.color;
                    if (this.showHeatmap && typeof particle.temperature === 'number') {
                        color = this.getHeatColor(particle.temperature);
                    }
                    this.setPixel(x, y, color);
                    const def = ParticleTypes[particle.type];
                    if (def?.emitsLight) {
                        lightSources.push({ x, y, type: particle.type });
                    }
                }
            }
        }

        if (lightSources.length > 0 && this.lightIntensity > 0) {
            // Limit number of lights for performance
            if (lightSources.length > 64) {
                lightSources.length = 64;
            }
            this.applyLighting(lightSources);
        }

        // Draw to canvas
        this.ctx.putImageData(this.imageData, 0, 0);

        this.lastRenderTime = performance.now() - startTime;
    }

    // Map temperature to a heatmap color (cold = blue, hot = white)
    getHeatColor(temp) {
        const minT = -20;
        const maxT = 1200;
        let t = (temp - minT) / (maxT - minT);
        t = Math.max(0, Math.min(1, t));

        // Simple blue -> red -> white gradient
        let r, g, b;
        if (t < 0.5) {
            // Blue to red
            const k = t / 0.5;
            r = 255 * k;
            g = 0;
            b = 255 * (1 - k);
        } else {
            // Red to yellow/white
            const k = (t - 0.5) / 0.5;
            r = 255;
            g = 255 * k;
            b = 0;
        }
        return [r, g, b, 255];
    }

    // Simple radial lighting with basic occlusion "ray tracing"
    applyLighting(lightSources) {
        const width = this.simulation.width;
        const height = this.simulation.height;
        const baseRadius = this.lightRadius;
        const globalIntensity = this.lightIntensity;

        for (const src of lightSources) {
            const { x: lx, y: ly, type } = src;
            const def = ParticleTypes[type] || {};

            // Boost intensity for very hot light sources
            const particle = this.simulation.grid.get(lx, ly);
            let tempBoost = 1;
            if (particle && typeof particle.temperature === 'number') {
                const t = Math.max(0, Math.min(1, (particle.temperature - 400) / 800));
                tempBoost = 1 + t * 1.5;
            }

            const radius = def.lightRadius || baseRadius;
            const intensity = (def.lightIntensity || 1) * globalIntensity * tempBoost;
            if (intensity <= 0) continue;

            const r2 = radius * radius;
            const minX = Math.max(0, lx - radius);
            const maxX = Math.min(width - 1, lx + radius);
            const minY = Math.max(0, ly - radius);
            const maxY = Math.min(height - 1, ly + radius);

            for (let y = minY; y <= maxY; y++) {
                const dy = y - ly;
                for (let x = minX; x <= maxX; x++) {
                    const dx = x - lx;
                    const dist2 = dx * dx + dy * dy;
                    if (dist2 > r2) continue;

                    const dist = Math.sqrt(dist2);
                    const falloff = 1 - dist / radius;
                    if (falloff <= 0) continue;

                    // Cast a thin ray from light to pixel and check for solid blockers
                    let occlusion = 1.0;
                    const steps = Math.min(radius, Math.max(Math.abs(dx), Math.abs(dy)));
                    if (steps > 0) {
                        let ox = lx;
                        let oy = ly;
                        const stepX = dx / steps;
                        const stepY = dy / steps;
                        for (let s = 1; s < steps; s++) {
                            ox += stepX;
                            oy += stepY;
                            const sx = ox | 0;
                            const sy = oy | 0;
                            const blocker = this.simulation.grid.get(sx, sy);
                            if (blocker) {
                                const bDef = ParticleTypes[blocker.type];
                                if (bDef && bDef.state === ParticleState.SOLID) {
                                    occlusion = 0.4;
                                    break;
                                }
                            }
                        }
                    }

                    const lightStrength = falloff * intensity * occlusion;
                    if (lightStrength <= 0) continue;

                    const idx = (y * width + x) * 4;
                    this.pixels[idx] = Math.min(255, this.pixels[idx] + lightStrength * 80);
                    this.pixels[idx + 1] = Math.min(255, this.pixels[idx + 1] + lightStrength * 60);
                    this.pixels[idx + 2] = Math.min(255, this.pixels[idx + 2] + lightStrength * 30);
                }
            }
        }
    }

    // Optimized render using dirty regions
    renderDirty() {
        const startTime = performance.now();
        const grid = this.simulation.grid;
        const chunkSize = grid.chunkSize;
        const dirtyChunks = grid.getDirtyChunks();

        if (dirtyChunks.length === 0) {
            this.lastRenderTime = 0;
            return;
        }

        // If more than half the chunks are dirty, do full render
        const totalChunks = Math.ceil(this.simulation.width / chunkSize) *
                          Math.ceil(this.simulation.height / chunkSize);

        if (dirtyChunks.length > totalChunks * 0.5) {
            this.render();
            grid.clearDirty();
            return;
        }

        // Render only dirty chunks
        for (const chunk of dirtyChunks) {
            const startX = chunk.x * chunkSize;
            const startY = chunk.y * chunkSize;
            const endX = Math.min(startX + chunkSize, this.simulation.width);
            const endY = Math.min(startY + chunkSize, this.simulation.height);

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const particle = grid.get(x, y);
                    if (particle && particle.color) {
                        this.setPixel(x, y, particle.color);
                    } else {
                        const idx = (y * this.simulation.width + x) * 4;
                        this.pixels[idx] = this.bgColor[0];
                        this.pixels[idx + 1] = this.bgColor[1];
                        this.pixels[idx + 2] = this.bgColor[2];
                        this.pixels[idx + 3] = this.bgColor[3];
                    }
                }
            }
        }

        // Draw to canvas
        this.ctx.putImageData(this.imageData, 0, 0);

        grid.clearDirty();
        this.lastRenderTime = performance.now() - startTime;
    }

    // Get canvas coordinates from mouse event
    getCanvasCoords(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.simulation.width / rect.width;
        const scaleY = this.simulation.height / rect.height;

        return {
            x: Math.floor((event.clientX - rect.left) * scaleX),
            y: Math.floor((event.clientY - rect.top) * scaleY)
        };
    }

    // Draw brush preview
    drawBrushPreview(x, y, size) {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.stroke();
    }
}
