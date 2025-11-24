// Optimized canvas renderer for particle simulation

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
        for (let y = 0; y < this.simulation.height; y++) {
            for (let x = 0; x < this.simulation.width; x++) {
                const particle = grid.get(x, y);
                if (particle && particle.color) {
                    this.setPixel(x, y, particle.color);
                }
            }
        }

        // Draw to canvas
        this.ctx.putImageData(this.imageData, 0, 0);

        this.lastRenderTime = performance.now() - startTime;
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
