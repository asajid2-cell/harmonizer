/**
 * SONIC ARCHITECT MK.III
 * WaveformUI - Waveform Seek Bar Rendering
 *
 * Features:
 * - Canvas-based waveform visualization
 * - Progress overlay
 * - Seek on click
 * - Hover preview
 * - Responsive sizing
 */

import { eventBus, Events } from '../utils/EventBus.js';
import { waveformGenerator } from '../audio/WaveformGenerator.js';
import { audioEngine } from '../audio/AudioEngine.js';

class WaveformUI {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.container = null;
        this.seekBar = null;
        this.progressFill = null;

        // State
        this.waveformData = null;
        this.progress = 0;
        this.duration = 0;
        this.isHovering = false;
        this.hoverPosition = 0;

        // Colors (will be updated from theme)
        this.colors = {
            waveform: '#00f0ff',
            waveformPlayed: '#ff003c',
            background: 'transparent',
            hover: 'rgba(255, 255, 255, 0.3)'
        };

        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.render = this.render.bind(this);

        this.isInitialized = false;
    }

    /**
     * Initialize waveform UI
     */
    init() {
        this.canvas = document.getElementById('waveform-canvas');
        this.container = document.getElementById('waveform-container');
        this.seekBar = document.getElementById('seek-bar');
        this.progressFill = document.getElementById('progress-fill');

        if (!this.canvas) {
            console.warn('Waveform canvas not found');
            return this;
        }

        this.ctx = this.canvas.getContext('2d');

        // Setup canvas size
        this.handleResize();

        // Setup event listeners
        this.setupEventListeners();

        this.isInitialized = true;
        console.log('🌊 WaveformUI initialized');

        return this;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', this.handleResize);

        // Waveform generated
        eventBus.on(Events.WAVEFORM_COMPLETE, (data) => {
            this.waveformData = data.waveform;
            this.duration = data.duration;
            this.render();
        });

        // Audio time update
        eventBus.on(Events.AUDIO_TIME_UPDATE, (data) => {
            this.progress = data.progress;
            this.render();
        });

        // Theme change
        eventBus.on(Events.THEME_CHANGE, (data) => {
            this.updateColors(data.theme);
            this.render();
        });

        // Click to seek
        this.canvas?.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const progress = x / rect.width;
            this.seekTo(progress);
        });

        // Hover for preview
        this.canvas?.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.hoverPosition = (e.clientX - rect.left) / rect.width;
            this.isHovering = true;
            this.render();
        });

        this.canvas?.addEventListener('mouseleave', () => {
            this.isHovering = false;
            this.render();
        });

        // Seek bar input (fallback)
        this.seekBar?.addEventListener('input', (e) => {
            const progress = parseFloat(e.target.value) / 100;
            this.seekTo(progress);
        });
    }

    /**
     * Handle window resize
     */
    handleResize() {
        if (!this.canvas || !this.container) return;

        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;

        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        this.render();
    }

    /**
     * Seek to position
     */
    seekTo(progress) {
        progress = Math.max(0, Math.min(1, progress));

        if (audioEngine.isInitialized && this.duration > 0) {
            const time = progress * this.duration;
            audioEngine.seek(time);
        }

        eventBus.emit(Events.SEEK, { progress, time: progress * this.duration });
    }

    /**
     * Update colors from theme
     */
    updateColors(theme) {
        // Get CSS custom properties
        const root = document.documentElement;
        const style = getComputedStyle(root);

        this.colors.waveform = style.getPropertyValue('--theme-primary').trim() || '#00f0ff';
        this.colors.waveformPlayed = style.getPropertyValue('--theme-secondary').trim() || '#ff003c';
    }

    /**
     * Render waveform to canvas
     */
    render() {
        if (!this.ctx || !this.canvas) return;

        const width = this.canvas.width / window.devicePixelRatio;
        const height = this.canvas.height / window.devicePixelRatio;

        // Clear canvas
        this.ctx.clearRect(0, 0, width, height);

        // Draw waveform if we have data
        if (this.waveformData && this.waveformData.length > 0) {
            this.drawWaveform(width, height);
        } else {
            // Draw placeholder bars
            this.drawPlaceholder(width, height);
        }

        // Draw hover indicator
        if (this.isHovering) {
            this.drawHoverIndicator(width, height);
        }

        // Update seek bar and progress fill
        this.updateProgressElements();
    }

    /**
     * Draw waveform bars
     */
    drawWaveform(width, height) {
        const data = this.waveformData;
        const barCount = Math.min(data.length, Math.floor(width / 3));
        const barWidth = 2;
        const gap = 1;
        const totalBarWidth = barWidth + gap;
        const startX = (width - barCount * totalBarWidth) / 2;

        const progressX = this.progress * width;

        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i / barCount * data.length);
            const value = data[dataIndex];

            const x = startX + i * totalBarWidth;
            const barHeight = Math.max(2, value * height * 0.8);
            const y = (height - barHeight) / 2;

            // Color based on progress
            const isPlayed = x < progressX;
            this.ctx.fillStyle = isPlayed ? this.colors.waveformPlayed : this.colors.waveform;

            // Draw bar
            this.ctx.fillRect(x, y, barWidth, barHeight);
        }
    }

    /**
     * Draw placeholder when no waveform data
     */
    drawPlaceholder(width, height) {
        const barCount = Math.floor(width / 6);
        const barWidth = 3;
        const gap = 3;
        const totalBarWidth = barWidth + gap;
        const startX = (width - barCount * totalBarWidth) / 2;

        for (let i = 0; i < barCount; i++) {
            // Generate pseudo-random height
            const seed = i * 0.1;
            const value = 0.2 + Math.sin(seed * 5) * 0.1 + Math.sin(seed * 13) * 0.1;

            const x = startX + i * totalBarWidth;
            const barHeight = Math.max(2, value * height * 0.5);
            const y = (height - barHeight) / 2;

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.fillRect(x, y, barWidth, barHeight);
        }
    }

    /**
     * Draw hover indicator
     */
    drawHoverIndicator(width, height) {
        const x = this.hoverPosition * width;

        // Vertical line
        this.ctx.strokeStyle = this.colors.hover;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, height);
        this.ctx.stroke();

        // Time tooltip
        if (this.duration > 0) {
            const time = this.hoverPosition * this.duration;
            const timeText = this.formatTime(time);

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.font = '10px monospace';

            const textWidth = this.ctx.measureText(timeText).width;
            const padding = 4;
            const tooltipX = Math.min(x - textWidth / 2 - padding, width - textWidth - padding * 2);
            const tooltipY = 2;

            // Background
            this.ctx.fillRect(tooltipX, tooltipY, textWidth + padding * 2, 14);

            // Text
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(timeText, tooltipX + padding, tooltipY + 11);
        }
    }

    /**
     * Update progress bar elements
     */
    updateProgressElements() {
        if (this.seekBar) {
            this.seekBar.value = this.progress * 100;
        }

        if (this.progressFill) {
            this.progressFill.style.width = `${this.progress * 100}%`;
        }
    }

    /**
     * Set waveform data directly
     */
    setWaveformData(data) {
        this.waveformData = data;
        this.render();
    }

    /**
     * Set progress
     */
    setProgress(progress) {
        this.progress = progress;
        this.render();
    }

    /**
     * Set duration
     */
    setDuration(duration) {
        this.duration = duration;
    }

    /**
     * Format time as MM:SS
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Clear waveform
     */
    clear() {
        this.waveformData = null;
        this.progress = 0;
        this.duration = 0;
        this.render();
    }

    /**
     * Cleanup
     */
    destroy() {
        window.removeEventListener('resize', this.handleResize);
        this.isInitialized = false;
    }
}

// Export singleton
export const waveformUI = new WaveformUI();
export default waveformUI;
