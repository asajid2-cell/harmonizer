/**
 * SONIC ARCHITECT MK.III
 * WaveformGenerator - Generate Waveform Data for Seek Bar
 *
 * Features:
 * - Generates waveform from AudioBuffer
 * - Configurable resolution
 * - Peak and RMS calculation
 * - Canvas rendering utilities
 * - Async processing for large files
 */

import { eventBus, Events } from '../utils/EventBus.js';

class WaveformGenerator {
    constructor() {
        this.waveformData = null;
        this.peakData = null;
        this.rmsData = null;

        this.config = {
            // Number of data points in waveform
            resolution: 200,
            // Processing chunk size (for async processing)
            chunkSize: 10000,
            // Normalization
            normalize: true
        };

        this.isProcessing = false;
        this.progress = 0;
    }

    /**
     * Generate waveform from AudioBuffer
     */
    async generateFromBuffer(audioBuffer, options = {}) {
        const resolution = options.resolution || this.config.resolution;

        this.isProcessing = true;
        this.progress = 0;

        eventBus.emit(Events.WAVEFORM_START, { duration: audioBuffer.duration });

        try {
            // Get channel data (mono or mix to mono)
            const channelData = this.getMonoData(audioBuffer);
            const samplesPerPixel = Math.floor(channelData.length / resolution);

            this.waveformData = new Float32Array(resolution);
            this.peakData = new Float32Array(resolution);
            this.rmsData = new Float32Array(resolution);

            let maxPeak = 0;

            // Process in chunks for async operation
            for (let i = 0; i < resolution; i++) {
                const start = i * samplesPerPixel;
                const end = Math.min(start + samplesPerPixel, channelData.length);

                let peak = 0;
                let sum = 0;

                for (let j = start; j < end; j++) {
                    const sample = Math.abs(channelData[j]);
                    peak = Math.max(peak, sample);
                    sum += sample * sample;
                }

                const rms = Math.sqrt(sum / (end - start));

                this.peakData[i] = peak;
                this.rmsData[i] = rms;
                this.waveformData[i] = peak; // Use peak for main display

                maxPeak = Math.max(maxPeak, peak);

                // Update progress
                this.progress = (i + 1) / resolution;

                // Yield to event loop periodically
                if (i % 50 === 0) {
                    await this.yieldToEventLoop();
                    eventBus.emit(Events.WAVEFORM_PROGRESS, { progress: this.progress });
                }
            }

            // Normalize if requested
            if (this.config.normalize && maxPeak > 0) {
                for (let i = 0; i < resolution; i++) {
                    this.waveformData[i] /= maxPeak;
                    this.peakData[i] /= maxPeak;
                    this.rmsData[i] /= maxPeak;
                }
            }

            this.isProcessing = false;
            this.progress = 1;

            eventBus.emit(Events.WAVEFORM_COMPLETE, {
                waveform: this.waveformData,
                peak: this.peakData,
                rms: this.rmsData,
                duration: audioBuffer.duration
            });

            return {
                waveform: this.waveformData,
                peak: this.peakData,
                rms: this.rmsData
            };

        } catch (error) {
            this.isProcessing = false;
            console.error('Waveform generation error:', error);
            eventBus.emit(Events.WAVEFORM_ERROR, { error: error.message });
            throw error;
        }
    }

    /**
     * Get mono channel data from AudioBuffer
     */
    getMonoData(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;

        if (numChannels === 1) {
            return audioBuffer.getChannelData(0);
        }

        // Mix channels to mono
        const length = audioBuffer.length;
        const mono = new Float32Array(length);

        for (let c = 0; c < numChannels; c++) {
            const channelData = audioBuffer.getChannelData(c);
            for (let i = 0; i < length; i++) {
                mono[i] += channelData[i] / numChannels;
            }
        }

        return mono;
    }

    /**
     * Yield to event loop for async processing
     */
    yieldToEventLoop() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    /**
     * Render waveform to canvas
     */
    renderToCanvas(canvas, options = {}) {
        if (!this.waveformData) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const data = this.waveformData;

        // Options with defaults
        const {
            color = '#00f0ff',
            backgroundColor = 'transparent',
            style = 'bars',        // 'bars', 'line', 'mirror'
            barWidth = 2,
            barGap = 1,
            playedColor = '#ff003c',
            progress = 0           // 0-1 for played portion
        } = options;

        // Clear canvas
        if (backgroundColor !== 'transparent') {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        } else {
            ctx.clearRect(0, 0, width, height);
        }

        const centerY = height / 2;
        const numBars = data.length;
        const pixelsPerBar = width / numBars;

        if (style === 'bars') {
            this.renderBars(ctx, data, width, height, {
                color, playedColor, progress, barWidth, barGap
            });
        } else if (style === 'line') {
            this.renderLine(ctx, data, width, height, {
                color, playedColor, progress
            });
        } else if (style === 'mirror') {
            this.renderMirror(ctx, data, width, height, {
                color, playedColor, progress, barWidth, barGap
            });
        }
    }

    /**
     * Render as bars
     */
    renderBars(ctx, data, width, height, options) {
        const { color, playedColor, progress, barWidth, barGap } = options;
        const numBars = data.length;
        const totalBarWidth = barWidth + barGap;
        const actualNumBars = Math.floor(width / totalBarWidth);
        const samplesPerBar = Math.floor(numBars / actualNumBars);
        const progressX = progress * width;

        for (let i = 0; i < actualNumBars; i++) {
            // Average samples for this bar
            let sum = 0;
            const startSample = i * samplesPerBar;
            const endSample = Math.min(startSample + samplesPerBar, numBars);

            for (let j = startSample; j < endSample; j++) {
                sum += data[j];
            }
            const value = sum / (endSample - startSample);

            const x = i * totalBarWidth;
            const barHeight = value * height * 0.9;

            ctx.fillStyle = x < progressX ? playedColor : color;
            ctx.fillRect(
                x,
                (height - barHeight) / 2,
                barWidth,
                barHeight
            );
        }
    }

    /**
     * Render as line
     */
    renderLine(ctx, data, width, height, options) {
        const { color, playedColor, progress } = options;
        const centerY = height / 2;
        const progressX = progress * width;

        ctx.beginPath();
        ctx.moveTo(0, centerY);

        for (let i = 0; i < data.length; i++) {
            const x = (i / data.length) * width;
            const y = centerY - (data[i] * height * 0.45);
            ctx.lineTo(x, y);
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Bottom mirror
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        for (let i = 0; i < data.length; i++) {
            const x = (i / data.length) * width;
            const y = centerY + (data[i] * height * 0.45);
            ctx.lineTo(x, y);
        }

        ctx.stroke();

        // Progress overlay
        if (progress > 0) {
            ctx.fillStyle = playedColor;
            ctx.globalAlpha = 0.3;
            ctx.fillRect(0, 0, progressX, height);
            ctx.globalAlpha = 1;
        }
    }

    /**
     * Render as mirrored bars
     */
    renderMirror(ctx, data, width, height, options) {
        const { color, playedColor, progress, barWidth, barGap } = options;
        const centerY = height / 2;
        const totalBarWidth = barWidth + barGap;
        const actualNumBars = Math.floor(width / totalBarWidth);
        const samplesPerBar = Math.floor(data.length / actualNumBars);
        const progressX = progress * width;

        for (let i = 0; i < actualNumBars; i++) {
            let sum = 0;
            const startSample = i * samplesPerBar;
            const endSample = Math.min(startSample + samplesPerBar, data.length);

            for (let j = startSample; j < endSample; j++) {
                sum += data[j];
            }
            const value = sum / (endSample - startSample);

            const x = i * totalBarWidth;
            const barHeight = value * height * 0.45;

            ctx.fillStyle = x < progressX ? playedColor : color;

            // Top bar
            ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
            // Bottom bar (mirror)
            ctx.fillRect(x, centerY, barWidth, barHeight);
        }
    }

    /**
     * Get waveform value at position (0-1)
     */
    getValueAt(position) {
        if (!this.waveformData) return 0;

        const index = Math.floor(position * (this.waveformData.length - 1));
        return this.waveformData[Math.max(0, Math.min(index, this.waveformData.length - 1))];
    }

    /**
     * Get waveform data
     */
    getData() {
        return {
            waveform: this.waveformData,
            peak: this.peakData,
            rms: this.rmsData
        };
    }

    /**
     * Set resolution
     */
    setResolution(resolution) {
        this.config.resolution = Math.max(50, Math.min(1000, resolution));
    }

    /**
     * Check if processing
     */
    isGenerating() {
        return this.isProcessing;
    }

    /**
     * Get progress (0-1)
     */
    getProgress() {
        return this.progress;
    }

    /**
     * Clear waveform data
     */
    clear() {
        this.waveformData = null;
        this.peakData = null;
        this.rmsData = null;
        this.progress = 0;
    }

    /**
     * Create a smaller preview version
     */
    getPreview(resolution = 50) {
        if (!this.waveformData) return null;

        const preview = new Float32Array(resolution);
        const samplesPerPoint = Math.floor(this.waveformData.length / resolution);

        for (let i = 0; i < resolution; i++) {
            let max = 0;
            const start = i * samplesPerPoint;
            const end = Math.min(start + samplesPerPoint, this.waveformData.length);

            for (let j = start; j < end; j++) {
                max = Math.max(max, this.waveformData[j]);
            }
            preview[i] = max;
        }

        return preview;
    }
}

// Export singleton
export const waveformGenerator = new WaveformGenerator();
export default waveformGenerator;
