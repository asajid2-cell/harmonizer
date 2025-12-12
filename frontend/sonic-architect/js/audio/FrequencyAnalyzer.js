/**
 * SONIC ARCHITECT MK.III
 * FrequencyAnalyzer - Advanced Multi-Band Frequency Analysis
 *
 * Provides 32-band logarithmic frequency analysis with:
 * - Configurable smoothing per band
 * - Peak detection with decay
 * - Spectral centroid calculation
 * - Energy tracking per frequency range
 */

import { eventBus, Events } from '../utils/EventBus.js';

// Frequency band definitions (Hz) - 32 bands logarithmically spaced
const BAND_FREQUENCIES = [
    20, 25, 31, 40, 50, 63, 80, 100,
    125, 160, 200, 250, 315, 400, 500, 630,
    800, 1000, 1250, 1600, 2000, 2500, 3150, 4000,
    5000, 6300, 8000, 10000, 12500, 16000, 18000, 20000
];

// Named frequency ranges
const FREQUENCY_RANGES = {
    subBass: { min: 20, max: 60, name: 'Sub Bass' },
    bass: { min: 60, max: 250, name: 'Bass' },
    lowMid: { min: 250, max: 500, name: 'Low Mid' },
    mid: { min: 500, max: 2000, name: 'Mid' },
    highMid: { min: 2000, max: 4000, name: 'High Mid' },
    presence: { min: 4000, max: 6000, name: 'Presence' },
    brilliance: { min: 6000, max: 20000, name: 'Brilliance' }
};

class FrequencyAnalyzer {
    constructor() {
        this.analyser = null;
        this.sampleRate = 44100;
        this.fftSize = 2048;
        this.binCount = 0;
        this.nyquist = 0;

        // Raw FFT data
        this.frequencyData = null;
        this.floatFrequencyData = null;

        // 32-band analysis
        this.bands = new Float32Array(32);
        this.bandsPeak = new Float32Array(32);
        this.bandsSmoothed = new Float32Array(32);
        this.bandHistory = [];

        // Named range values
        this.ranges = {
            subBass: 0,
            bass: 0,
            lowMid: 0,
            mid: 0,
            highMid: 0,
            presence: 0,
            brilliance: 0
        };

        // Configuration
        this.config = {
            smoothing: 0.8,          // Global smoothing (0-1)
            peakDecay: 0.98,         // Peak decay rate per frame
            historyLength: 60,       // Frames of history to keep
            minDecibels: -90,
            maxDecibels: -10
        };

        // Spectral analysis
        this.spectralCentroid = 0;
        this.spectralFlatness = 0;
        this.rmsVolume = 0;
        this.totalEnergy = 0;

        // Band-to-bin mapping cache
        this.bandBinRanges = [];

        this.isInitialized = false;
    }

    /**
     * Initialize with an AnalyserNode
     */
    init(analyser, sampleRate = 44100) {
        this.analyser = analyser;
        this.sampleRate = sampleRate;
        this.fftSize = analyser.fftSize;
        this.binCount = analyser.frequencyBinCount;
        this.nyquist = sampleRate / 2;

        // Configure analyser
        this.analyser.minDecibels = this.config.minDecibels;
        this.analyser.maxDecibels = this.config.maxDecibels;
        this.analyser.smoothingTimeConstant = this.config.smoothing;

        // Create data arrays
        this.frequencyData = new Uint8Array(this.binCount);
        this.floatFrequencyData = new Float32Array(this.binCount);

        // Calculate bin ranges for each band
        this.calculateBandBinRanges();

        // Initialize history
        this.bandHistory = [];
        for (let i = 0; i < this.config.historyLength; i++) {
            this.bandHistory.push(new Float32Array(32));
        }

        this.isInitialized = true;
        console.log(`🎛️ FrequencyAnalyzer initialized (${this.binCount} bins, ${this.sampleRate}Hz)`);

        return this;
    }

    /**
     * Calculate which FFT bins correspond to each frequency band
     */
    calculateBandBinRanges() {
        this.bandBinRanges = [];
        const binWidth = this.nyquist / this.binCount;

        for (let i = 0; i < 32; i++) {
            const lowFreq = BAND_FREQUENCIES[i];
            const highFreq = i < 31 ? BAND_FREQUENCIES[i + 1] : 22000;

            const lowBin = Math.floor(lowFreq / binWidth);
            const highBin = Math.min(Math.floor(highFreq / binWidth), this.binCount - 1);

            this.bandBinRanges.push({
                low: Math.max(0, lowBin),
                high: highBin,
                centerFreq: (lowFreq + highFreq) / 2
            });
        }
    }

    /**
     * Get bin index for a specific frequency
     */
    frequencyToBin(frequency) {
        const binWidth = this.nyquist / this.binCount;
        return Math.round(frequency / binWidth);
    }

    /**
     * Get frequency for a specific bin
     */
    binToFrequency(bin) {
        return (bin * this.nyquist) / this.binCount;
    }

    /**
     * Update analysis - call every frame
     */
    update() {
        if (!this.isInitialized || !this.analyser) return null;

        // Get raw frequency data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getFloatFrequencyData(this.floatFrequencyData);

        // Analyze 32 bands
        this.analyzeBands();

        // Calculate named ranges
        this.calculateRanges();

        // Calculate spectral features
        this.calculateSpectralFeatures();

        // Update history
        this.updateHistory();

        // Emit update event
        eventBus.emit(Events.FREQ_UPDATE, this.getAnalysis());

        return this.getAnalysis();
    }

    /**
     * Analyze 32 frequency bands
     */
    analyzeBands() {
        for (let i = 0; i < 32; i++) {
            const range = this.bandBinRanges[i];
            let sum = 0;
            let count = 0;

            // Average the bins in this band
            for (let bin = range.low; bin <= range.high; bin++) {
                sum += this.frequencyData[bin];
                count++;
            }

            // Normalize to 0-1
            const value = count > 0 ? (sum / count) / 255 : 0;

            // Store raw value
            this.bands[i] = value;

            // Smoothed value
            this.bandsSmoothed[i] = this.bandsSmoothed[i] * this.config.smoothing +
                                     value * (1 - this.config.smoothing);

            // Peak with decay
            if (value > this.bandsPeak[i]) {
                this.bandsPeak[i] = value;
            } else {
                this.bandsPeak[i] *= this.config.peakDecay;
            }
        }
    }

    /**
     * Calculate named frequency range values
     */
    calculateRanges() {
        for (const [name, range] of Object.entries(FREQUENCY_RANGES)) {
            let sum = 0;
            let count = 0;

            // Find bands that fall within this range
            for (let i = 0; i < 32; i++) {
                const bandRange = this.bandBinRanges[i];
                if (bandRange.centerFreq >= range.min && bandRange.centerFreq <= range.max) {
                    sum += this.bandsSmoothed[i];
                    count++;
                }
            }

            this.ranges[name] = count > 0 ? sum / count : 0;
        }
    }

    /**
     * Calculate spectral features (centroid, flatness, RMS)
     */
    calculateSpectralFeatures() {
        let weightedSum = 0;
        let magnitudeSum = 0;
        let geometricMean = 0;
        let arithmeticMean = 0;
        let energySum = 0;

        const epsilon = 1e-10; // Prevent log(0)

        for (let i = 0; i < this.binCount; i++) {
            const magnitude = this.frequencyData[i] / 255;
            const frequency = this.binToFrequency(i);

            // For spectral centroid
            weightedSum += frequency * magnitude;
            magnitudeSum += magnitude;

            // For RMS and energy
            energySum += magnitude * magnitude;

            // For spectral flatness (geometric mean)
            if (magnitude > epsilon) {
                geometricMean += Math.log(magnitude + epsilon);
            }
            arithmeticMean += magnitude;
        }

        // Spectral centroid (center of mass of spectrum)
        this.spectralCentroid = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;

        // Normalize to 0-1 range
        this.spectralCentroid = Math.min(this.spectralCentroid / this.nyquist, 1);

        // Spectral flatness (0 = tonal, 1 = noisy)
        if (this.binCount > 0 && arithmeticMean > epsilon) {
            geometricMean = Math.exp(geometricMean / this.binCount);
            arithmeticMean = arithmeticMean / this.binCount;
            this.spectralFlatness = geometricMean / arithmeticMean;
        } else {
            this.spectralFlatness = 0;
        }

        // RMS volume
        this.rmsVolume = Math.sqrt(energySum / this.binCount);

        // Total energy
        this.totalEnergy = energySum / this.binCount;
    }

    /**
     * Update band history buffer
     */
    updateHistory() {
        // Shift history
        this.bandHistory.pop();
        this.bandHistory.unshift(new Float32Array(this.bandsSmoothed));
    }

    /**
     * Get complete analysis object
     */
    getAnalysis() {
        return {
            // Raw and processed bands
            bands: this.bands,
            bandsSmoothed: this.bandsSmoothed,
            bandsPeak: this.bandsPeak,

            // Named ranges (convenience)
            subBass: this.ranges.subBass,
            bass: this.ranges.bass,
            lowMid: this.ranges.lowMid,
            mid: this.ranges.mid,
            highMid: this.ranges.highMid,
            presence: this.ranges.presence,
            brilliance: this.ranges.brilliance,

            // Spectral features
            spectralCentroid: this.spectralCentroid,
            spectralFlatness: this.spectralFlatness,
            rmsVolume: this.rmsVolume,
            totalEnergy: this.totalEnergy,

            // Legacy compatibility (simple bass/mid/high)
            bassLevel: (this.ranges.subBass + this.ranges.bass) / 2,
            midLevel: (this.ranges.lowMid + this.ranges.mid + this.ranges.highMid) / 3,
            highLevel: (this.ranges.presence + this.ranges.brilliance) / 2
        };
    }

    /**
     * Get raw frequency data (Uint8Array)
     */
    getFrequencyData() {
        return this.frequencyData;
    }

    /**
     * Get float frequency data (more precise)
     */
    getFloatFrequencyData() {
        return this.floatFrequencyData;
    }

    /**
     * Get specific band value (0-31)
     */
    getBand(index) {
        return this.bandsSmoothed[Math.min(31, Math.max(0, index))];
    }

    /**
     * Get band peak value (0-31)
     */
    getBandPeak(index) {
        return this.bandsPeak[Math.min(31, Math.max(0, index))];
    }

    /**
     * Get average of a band range
     */
    getBandRange(startBand, endBand) {
        let sum = 0;
        const start = Math.max(0, startBand);
        const end = Math.min(31, endBand);

        for (let i = start; i <= end; i++) {
            sum += this.bandsSmoothed[i];
        }

        return sum / (end - start + 1);
    }

    /**
     * Get frequency value at specific Hz
     */
    getFrequencyValue(frequency) {
        const bin = this.frequencyToBin(frequency);
        if (bin >= 0 && bin < this.binCount) {
            return this.frequencyData[bin] / 255;
        }
        return 0;
    }

    /**
     * Get energy in frequency range
     */
    getEnergyInRange(minFreq, maxFreq) {
        const minBin = this.frequencyToBin(minFreq);
        const maxBin = this.frequencyToBin(maxFreq);
        let sum = 0;
        let count = 0;

        for (let i = minBin; i <= maxBin && i < this.binCount; i++) {
            sum += this.frequencyData[i] / 255;
            count++;
        }

        return count > 0 ? sum / count : 0;
    }

    /**
     * Get band history for visualization
     */
    getHistory(bandIndex = null) {
        if (bandIndex !== null) {
            return this.bandHistory.map(frame => frame[bandIndex]);
        }
        return this.bandHistory;
    }

    /**
     * Get band variance (for beat detection)
     */
    getBandVariance(bandIndex) {
        const history = this.getHistory(bandIndex);
        const mean = history.reduce((a, b) => a + b, 0) / history.length;
        const variance = history.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / history.length;
        return Math.sqrt(variance);
    }

    /**
     * Set global smoothing
     */
    setSmoothing(value) {
        this.config.smoothing = Math.max(0, Math.min(1, value));
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = this.config.smoothing;
        }
    }

    /**
     * Set peak decay rate
     */
    setPeakDecay(value) {
        this.config.peakDecay = Math.max(0.9, Math.min(0.999, value));
    }

    /**
     * Get band frequencies array
     */
    getBandFrequencies() {
        return BAND_FREQUENCIES;
    }

    /**
     * Get frequency ranges definition
     */
    getFrequencyRanges() {
        return FREQUENCY_RANGES;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.analyser = null;
        this.frequencyData = null;
        this.floatFrequencyData = null;
        this.bandHistory = [];
        this.isInitialized = false;
    }
}

// Export singleton
export const frequencyAnalyzer = new FrequencyAnalyzer();
export default frequencyAnalyzer;
