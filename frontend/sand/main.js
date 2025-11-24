// Main application - initialization and game loop
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';

class SandSimulator {
    constructor() {
        // Simulation dimensions
        this.width = 400;
        this.height = 300;
        this.scale = 2;

        // Initialize canvas
        this.canvas = document.getElementById('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Create simulation and renderer
        this.simulation = new Simulation(this.width, this.height);
        this.renderer = new Renderer(this.canvas, this.simulation);
        this.renderer.setScale(this.scale);

        // Current tool state
        this.currentType = 'sand';
        this.brushSize = 3;
        this.isDrawing = false;
        this.lastMousePos = null;

        // Performance tracking
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();

        // Initialize UI
        this.initUI();

        // Start game loop
        this.loop();
    }

    initUI() {
        // Particle type buttons
        const buttons = document.querySelectorAll('.particle-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentType = btn.dataset.type;
                console.log('Selected:', this.currentType);
            });
        });

        // Brush size slider
        const brushSlider = document.getElementById('brushSize');
        const brushValue = document.getElementById('brushSizeValue');
        brushSlider.addEventListener('input', () => {
            this.brushSize = parseInt(brushSlider.value);
            brushValue.textContent = this.brushSize;
        });

        // Clear button
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.simulation.clear();
        });

        // Pause button
        const pauseBtn = document.getElementById('pauseBtn');
        pauseBtn.addEventListener('click', () => {
            const paused = this.simulation.togglePause();
            pauseBtn.textContent = paused ? 'Resume' : 'Pause';
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.onMouseUp());
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, button: 0 });
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.onMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
        });
        this.canvas.addEventListener('touchend', () => this.onMouseUp());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                pauseBtn.click();
            } else if (e.code === 'KeyC') {
                this.simulation.clear();
            } else if (e.code === 'BracketLeft') {
                this.brushSize = Math.max(1, this.brushSize - 1);
                brushSlider.value = this.brushSize;
                brushValue.textContent = this.brushSize;
            } else if (e.code === 'BracketRight') {
                this.brushSize = Math.min(20, this.brushSize + 1);
                brushSlider.value = this.brushSize;
                brushValue.textContent = this.brushSize;
            }
        });
    }

    onMouseDown(e) {
        this.isDrawing = true;
        const coords = this.renderer.getCanvasCoords(e);
        this.lastMousePos = coords;
        this.draw(coords.x, coords.y, e.button === 2);
    }

    onMouseMove(e) {
        if (!this.isDrawing) return;

        const coords = this.renderer.getCanvasCoords(e);

        // Interpolate between last and current position for smooth drawing
        if (this.lastMousePos) {
            const dx = coords.x - this.lastMousePos.x;
            const dy = coords.y - this.lastMousePos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 1) {
                const steps = Math.ceil(dist);
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps;
                    const x = Math.round(this.lastMousePos.x + dx * t);
                    const y = Math.round(this.lastMousePos.y + dy * t);
                    this.draw(x, y, e.button === 2);
                }
            } else {
                this.draw(coords.x, coords.y, e.button === 2);
            }
        }

        this.lastMousePos = coords;
    }

    onMouseUp() {
        this.isDrawing = false;
        this.lastMousePos = null;
    }

    draw(x, y, erase) {
        if (erase || this.currentType === 'eraser') {
            this.simulation.eraseBrush(x, y, this.brushSize);
        } else {
            this.simulation.addBrush(x, y, this.currentType, this.brushSize);
        }
    }

    updateStats() {
        this.frameCount++;
        const now = performance.now();

        if (now - this.lastFpsUpdate >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = now;

            const stats = document.getElementById('stats');
            const particleCount = this.simulation.getParticleCount();
            stats.textContent = `Particles: ${particleCount.toLocaleString()} | FPS: ${this.fps}`;
        }
    }

    loop() {
        // Update simulation
        this.simulation.update();

        // Render
        this.renderer.render();

        // Update stats
        this.updateStats();

        // Next frame
        requestAnimationFrame(() => this.loop());
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SandSimulator();
});
