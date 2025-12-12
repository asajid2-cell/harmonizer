/**
 * SONIC ARCHITECT MK.III
 * BeatDetector - Advanced Beat Detection with BPM Calculation
 *
 * Features:
 * - Energy-based beat detection
 * - Multi-band onset detection
 * - BPM calculation via autocorrelation
 * - Beat intensity tracking
 * - Configurable sensitivity
 */

import { eventBus, Events } from '../utils/EventBus.js';

class BeatDetector {
    constructor() {
        this.frequencyAnalyzer = null;
        this.isInitialized = false;

        // Beat detection state
        this.lastBeatTime = 0;
        this.beatInterval = 0;
        this.beatCount = 0;
        this.isBeat = false;
        this.beatIntensity = 0;

        // Energy tracking
        this.energyHistory = [];
        this.bassHistory = [];
        this.onsetHistory = [];

        // BPM calculation
        this.bpm = 0;
        this.bpmConfidence = 0;
        this.beatTimes = [];
        this.bpmHistory = [];

        // Configuration
        this.config = {
            // Energy threshold for beat detection
            threshold: 1.3,
            // Minimum time between beats (ms) - prevents double triggers
            minBeatInterval: 200,
            // Maximum time between beats for BPM calculation (ms)
            maxBeatInterval: 2000,
            // History length for energy averaging
            historyLength: 43,  // ~0.7 seconds at 60fps
            // Sensitivity multiplier
            sensitivity: 1.0,
            // Band weights for onset detection
            bandWeights: {
                subBass: 1.5,  // Kick drums
                bass: 1.2,    // Bass
                lowMid: 0.8,  // Snares
                mid: 0.5,
                highMid: 0.6, // Hi-hats
                presence: 0.4,
                brilliance: 0.3
            },
            // BPM range limits
            minBPM: 60,
            maxBPM: 200,
            // Number of beat times to keep for BPM calc
            beatTimeBuffer: 20
        };

        // Onset detection
        this.spectralFlux = 0;
        this.prevSpectrum = null;

        // Running stats
        this.stats = {
            totalBeats: 0,
            avgIntensity: 0,
            peakIntensity: 0,
            lastBPMUpdate: 0
        };
    }

    /**
     * Initialize with frequency analyzer
     */
    init(frequencyAnalyzer) {
        this.frequencyAnalyzer = frequencyAnalyzer;

        // Initialize history buffers
        this.energyHistory = new Array(this.config.historyLength).fill(0);
        this.bassHistory = new Array(this.config.historyLength).fill(0);
        this.onsetHistory = new Array(this.config.historyLength).fill(0);

        this.prevSpectrum = new Float32Array(32).fill(0);

        this.isInitialized = true;
        console.log('🥁 BeatDetector initialized');

        return this;
    }

    /**
     * Update beat detection - call every frame
     */
    update(deltaTime = 16.67) {
        if (!this.isInitialized || !this.frequencyAnalyzer) return null;

        const analysis = this.frequencyAnalyzer.getAnalysis();
        const currentTime = performance.now();

        // Reset beat state
        this.isBeat = false;
        this.beatIntensity = 0;

        // Calculate weighted energy
        const energy = this.calculateWeightedEnergy(analysis);

        // Calculate spectral flux (onset detection)
        this.spectralFlux = this.calculateSpectralFlux(analysis.bandsSmoothed);

        // Update histories
        this.updateHistories(energy, analysis.bass, this.spectralFlux);

        // Calculate dynamic threshold
        const avgEnergy = this.getAverageEnergy();
        const threshold = avgEnergy * this.config.threshold * this.config.sensitivity;

        // Detect beat
        const timeSinceLastBeat = currentTime - this.lastBeatTime;

        if (energy > threshold &&
            timeSinceLastBeat > this.config.minBeatInterval &&
            this.isOnset()) {

            this.triggerBeat(energy, avgEnergy, currentTime);
        }

        // Decay beat intensity
        if (!this.isBeat && this.beatIntensity > 0) {
            this.beatIntensity *= 0.9;
        }

        // Update BPM periodically
        if (currentTime - this.stats.lastBPMUpdate > 500) {
            this.calculateBPM();
            this.stats.lastBPMUpdate = currentTime;
        }

        return this.getState();
    }

    /**
     * Calculate weighted energy from frequency ranges
     */
    calculateWeightedEnergy(analysis) {
        const weights = this.config.bandWeights;
        let totalWeight = 0;
        let weightedSum = 0;

        for (const [range, weight] of Object.entries(weights)) {
            if (analysis[range] !== undefined) {
                weightedSum += analysis[range] * weight;
                totalWeight += weight;
            }
        }

        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    /**
     * Calculate spectral flux for onset detection
     */
    calculateSpectralFlux(currentSpectrum) {
        if (!this.prevSpectrum) {
            this.prevSpectrum = new Float32Array(currentSpectrum);
            return 0;
        }

        let flux = 0;
        for (let i = 0; i < 32; i++) {
            // Only count increases (positive flux)
            const diff = currentSpectrum[i] - this.prevSpectrum[i];
            if (diff > 0) {
                flux += diff * diff;
            }
            this.prevSpectrum[i] = currentSpectrum[i];
        }

        return Math.sqrt(flux);
    }

    /**
     * Check if current frame is an onset
     */
    isOnset() {
        // Compare current flux to recent average
        const avgFlux = this.onsetHistory.reduce((a, b) => a + b, 0) / this.onsetHistory.length;
        const fluxThreshold = avgFlux * 1.5;

        return this.spectralFlux > fluxThreshold;
    }

    /**
     * Update history buffers
     */
    updateHistories(energy, bass, flux) {
        this.energyHistory.shift();
        this.energyHistory.push(energy);

        this.bassHistory.shift();
        this.bassHistory.push(bass);

        this.onsetHistory.shift();
        this.onsetHistory.push(flux);
    }

    /**
     * Get average energy from history
     */
    getAverageEnergy() {
        return this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    }

    /**
     * Get energy variance
     */
    getEnergyVariance() {
        const mean = this.getAverageEnergy();
        const variance = this.energyHistory.reduce((sum, val) => {
            return sum + Math.pow(val - mean, 2);
        }, 0) / this.energyHistory.length;
        return Math.sqrt(variance);
    }

    /**
     * Trigger a beat event
     */
    triggerBeat(energy, avgEnergy, currentTime) {
        this.isBeat = true;
        this.beatCount++;
        this.stats.totalBeats++;

        // Calculate beat intensity (how strong relative to average)
        this.beatIntensity = Math.min(2, energy / Math.max(0.01, avgEnergy));

        // Track beat interval
        this.beatInterval = currentTime - this.lastBeatTime;
        this.lastBeatTime = currentTime;

        // Store beat time for BPM calculation
        this.beatTimes.push(currentTime);
        if (this.beatTimes.length > this.config.beatTimeBuffer) {
            this.beatTimes.shift();
        }

        // Update stats
        this.stats.avgIntensity =
            (this.stats.avgIntensity * (this.stats.totalBeats - 1) + this.beatIntensity) /
            this.stats.totalBeats;
        this.stats.peakIntensity = Math.max(this.stats.peakIntensity, this.beatIntensity);

        // Emit beat event
        eventBus.emit(Events.BEAT_DETECTED, {
            intensity: this.beatIntensity,
            interval: this.beatInterval,
            bpm: this.bpm,
            count: this.beatCount
        });
    }

    /**
     * Calculate BPM using autocorrelation
     */
    calculateBPM() {
        if (this.beatTimes.length < 4) {
            return;
        }

        // Calculate intervals between beats
        const intervals = [];
        for (let i = 1; i < this.beatTimes.length; i++) {
            const interval = this.beatTimes[i] - this.beatTimes[i - 1];
            if (interval > 0 && interval < this.config.maxBeatInterval) {
                intervals.push(interval);
            }
        }

        if (intervals.length < 3) return;

        // Find the most common interval using histogram
        const histogram = {};
        const binSize = 20; // 20ms bins

        for (const interval of intervals) {
            const bin = Math.round(interval / binSize) * binSize;
            histogram[bin] = (histogram[bin] || 0) + 1;
        }

        // Find the bin with the most hits
        let maxCount = 0;
        let dominantInterval = 0;

        for (const [bin, count] of Object.entries(histogram)) {
            if (count > maxCount) {
                maxCount = count;
                dominantInterval = parseFloat(bin);
            }
        }

        if (dominantInterval > 0) {
            // Convert interval to BPM
            let bpm = 60000 / dominantInterval;

            // Adjust to reasonable range (handle half/double time)
            while (bpm > this.config.maxBPM) bpm /= 2;
            while (bpm < this.config.minBPM) bpm *= 2;

            // Smooth BPM changes
            if (this.bpm === 0) {
                this.bpm = bpm;
            } else {
                // Only update if significantly different
                const diff = Math.abs(bpm - this.bpm);
                if (diff > 5) {
                    this.bpm = this.bpm * 0.7 + bpm * 0.3;
                }
            }

            // Calculate confidence based on histogram concentration
            this.bpmConfidence = maxCount / intervals.length;

            // Store in history
            this.bpmHistory.push(this.bpm);
            if (this.bpmHistory.length > 10) {
                this.bpmHistory.shift();
            }

            // Emit BPM update
            eventBus.emit(Events.BPM_UPDATE, {
                bpm: Math.round(this.bpm),
                confidence: this.bpmConfidence
            });
        }
    }

    /**
     * Get current detector state
     */
    getState() {
        return {
            isBeat: this.isBeat,
            beatIntensity: this.beatIntensity,
            bpm: Math.round(this.bpm),
            bpmConfidence: this.bpmConfidence,
            beatInterval: this.beatInterval,
            beatCount: this.beatCount,
            spectralFlux: this.spectralFlux,
            energy: this.energyHistory[this.energyHistory.length - 1],
            avgEnergy: this.getAverageEnergy(),
            variance: this.getEnergyVariance()
        };
    }

    /**
     * Check if currently on a beat
     */
    isOnBeat() {
        return this.isBeat;
    }

    /**
     * Get current BPM
     */
    getBPM() {
        return Math.round(this.bpm);
    }

    /**
     * Get beat intensity (0-2, where 1 is average)
     */
    getIntensity() {
        return this.beatIntensity;
    }

    /**
     * Get time until next expected beat (ms)
     */
    getTimeToNextBeat() {
        if (this.bpm === 0) return 0;

        const beatDuration = 60000 / this.bpm;
        const timeSinceLast = performance.now() - this.lastBeatTime;
        const timeToNext = beatDuration - (timeSinceLast % beatDuration);

        return timeToNext;
    }

    /**
     * Get beat phase (0-1, where 0 is on the beat)
     */
    getBeatPhase() {
        if (this.bpm === 0) return 0;

        const beatDuration = 60000 / this.bpm;
        const timeSinceLast = performance.now() - this.lastBeatTime;

        return (timeSinceLast % beatDuration) / beatDuration;
    }

    /**
     * Set detection sensitivity (0.5 - 2.0)
     */
    setSensitivity(value) {
        this.config.sensitivity = Math.max(0.5, Math.min(2.0, value));
    }

    /**
     * Set threshold multiplier
     */
    setThreshold(value) {
        this.config.threshold = Math.max(1.0, Math.min(3.0, value));
    }

    /**
     * Reset beat detection state
     */
    reset() {
        this.beatCount = 0;
        this.bpm = 0;
        this.bpmConfidence = 0;
        this.beatTimes = [];
        this.bpmHistory = [];
        this.lastBeatTime = 0;
        this.energyHistory.fill(0);
        this.bassHistory.fill(0);
        this.onsetHistory.fill(0);
        this.stats = {
            totalBeats: 0,
            avgIntensity: 0,
            peakIntensity: 0,
            lastBPMUpdate: 0
        };
    }

    /**
     * Get statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Cleanup
     */
    destroy() {
        this.frequencyAnalyzer = null;
        this.energyHistory = [];
        this.bassHistory = [];
        this.onsetHistory = [];
        this.beatTimes = [];
        this.bpmHistory = [];
        this.prevSpectrum = null;
        this.isInitialized = false;
    }
}

// Export singleton
export const beatDetector = new BeatDetector();
export default beatDetector;
