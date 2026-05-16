/**
 * SONIC ARCHITECT MK.III
 * AudioEngine - Core Web Audio API Wrapper
 *
 * Handles audio playback, analysis, and routing
 */

import { eventBus, Events } from '../utils/EventBus.js';

class AudioEngine {
    constructor() {
        this.context = null;
        this.analyser = null;
        this.gainNode = null;
        this.source = null;
        this.audioElement = null;

        this.isInitialized = false;
        this.isPlaying = false;
        this.isMuted = false;
        this.volume = 1;
        this.previousVolume = 1;

        // Analysis data
        this.fftSize = 2048;
        this.smoothingTimeConstant = 0.8;
        this.frequencyData = null;
        this.timeDomainData = null;

        // Track info
        this.currentTrack = null;
        this.duration = 0;
        this.currentTime = 0;

        // Frequency analyzer reference
        this.frequencyAnalyzer = null;

        // Bind methods
        this.update = this.update.bind(this);
    }

    /**
     * Initialize the audio context (requires user interaction)
     */
    async init() {
        if (this.isInitialized) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.context = new AudioContext();

            // Create analyser node
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;

            // Create gain node for volume control
            this.gainNode = this.context.createGain();
            this.gainNode.gain.value = this.volume;

            // Connect analyser to gain, gain to destination
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.context.destination);

            // Create data arrays
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyser.fftSize);

            this.isInitialized = true;
            console.log('🔊 AudioEngine initialized');
            eventBus.emit(Events.AUDIO_INIT);

            return true;
        } catch (error) {
            console.error('AudioEngine init error:', error);
            eventBus.emit(Events.AUDIO_ERROR, { message: 'Failed to initialize audio' });
            return false;
        }
    }

    /**
     * Resume audio context if suspended
     */
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    /**
     * Load and play an audio file
     */
    async loadFile(file) {
        if (!this.isInitialized) await this.init();
        await this.resume();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    // Decode audio data
                    const audioBuffer = await this.context.decodeAudioData(e.target.result);

                    // Stop current playback
                    this.stop();

                    // Create buffer source
                    this.source = this.context.createBufferSource();
                    this.source.buffer = audioBuffer;
                    this.source.connect(this.analyser);

                    // Track info
                    this.currentTrack = {
                        name: file.name,
                        duration: audioBuffer.duration,
                        buffer: audioBuffer
                    };
                    this.duration = audioBuffer.duration;

                    // Handle track end
                    this.source.onended = () => {
                        this.isPlaying = false;
                        eventBus.emit(Events.AUDIO_ENDED);
                    };

                    // Start playback
                    this.source.start(0);
                    this.isPlaying = true;
                    this.startTime = this.context.currentTime;

                    eventBus.emit(Events.AUDIO_LOAD, this.currentTrack);
                    eventBus.emit(Events.AUDIO_PLAY, this.currentTrack);

                    console.log(`▶️ Playing: ${file.name}`);
                    resolve(this.currentTrack);
                } catch (error) {
                    console.error('Audio decode error:', error);
                    eventBus.emit(Events.AUDIO_ERROR, { message: 'Failed to decode audio file' });
                    reject(error);
                }
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Load from ArrayBuffer
     */
    async loadBuffer(arrayBuffer) {
        if (!this.isInitialized) await this.init();
        await this.resume();

        try {
            // Decode audio data
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer.slice(0));

            // Stop current playback
            this.stop();

            // Store buffer
            this.audioBuffer = audioBuffer;
            this.duration = audioBuffer.duration;

            this.currentTrack = {
                name: 'Track',
                duration: audioBuffer.duration,
                buffer: audioBuffer
            };

            // Don't auto-play, just load
            eventBus.emit(Events.AUDIO_LOAD, this.currentTrack);

            console.log(`📼 Loaded audio buffer (${audioBuffer.duration.toFixed(2)}s)`);
            return this.currentTrack;

        } catch (error) {
            console.error('Audio decode error:', error);
            eventBus.emit(Events.AUDIO_ERROR, { message: 'Failed to decode audio buffer' });
            throw error;
        }
    }

    /**
     * Get loaded audio buffer
     */
    getAudioBuffer() {
        return this.audioBuffer;
    }

    /**
     * Load from URL or HTMLAudioElement
     */
    async loadURL(url, { autoplay = true, startTime = null } = {}) {
        if (!this.isInitialized) await this.init();
        await this.resume();

        // Stop current
        this.stop();

        // Create audio element
        this.audioElement = new Audio();
        this.audioElement.crossOrigin = 'anonymous';
        this.audioElement.src = url;

        // Create media element source
        this.source = this.context.createMediaElementSource(this.audioElement);
        this.source.connect(this.analyser);

        // Events
        this.audioElement.onended = () => {
            this.isPlaying = false;
            eventBus.emit(Events.AUDIO_ENDED);
        };

        this.audioElement.onloadedmetadata = () => {
            this.duration = this.audioElement.duration;
            this.currentTrack = { name: url, duration: this.duration };
            eventBus.emit(Events.AUDIO_LOAD, this.currentTrack);
        };

        const waitForMetadata = () =>
            new Promise((resolve) => {
                if (!this.audioElement) return resolve();
                if (this.audioElement.readyState >= 1) return resolve();
                this.audioElement.addEventListener('loadedmetadata', () => resolve(), { once: true });
            });

        if (typeof startTime === 'number' && isFinite(startTime) && startTime >= 0) {
            try {
                await waitForMetadata();
                if (this.audioElement) {
                    const duration = this.audioElement.duration;
                    const clamped = Number.isFinite(duration) ? Math.min(Math.max(0, startTime), Math.max(0, duration - 0.01)) : startTime;
                    this.audioElement.currentTime = clamped;
                }
            } catch (e) {
                // Seeking may fail before metadata is ready; ignore.
            }
        }

        if (autoplay) {
            await this.audioElement.play();
            this.isPlaying = true;
            eventBus.emit(Events.AUDIO_PLAY);
        } else {
            this.isPlaying = false;
        }
    }

    /**
     * Play / Resume playback
     */
    async play() {
        if (!this.isInitialized) return;
        await this.resume();

        // If using audio element
        if (this.audioElement) {
            await this.audioElement.play();
            this.isPlaying = true;
            eventBus.emit(Events.AUDIO_PLAY);
            return;
        }

        // If using buffer source and buffer is loaded
        if (this.audioBuffer && !this.source) {
            // Create new buffer source
            this.source = this.context.createBufferSource();
            this.source.buffer = this.audioBuffer;
            this.source.connect(this.analyser);

            // Handle track end
            this.source.onended = () => {
                this.isPlaying = false;
                this.source = null;
                eventBus.emit(Events.AUDIO_ENDED);
            };

            // Start playback
            this.source.start(0, this.currentTime);
            this.startTime = this.context.currentTime - this.currentTime;
            this.isPlaying = true;
            eventBus.emit(Events.AUDIO_PLAY);
            return;
        }

        // Resume suspended context
        if (this.context.state === 'suspended') {
            await this.context.resume();
            this.isPlaying = true;
            eventBus.emit(Events.AUDIO_PLAY);
        }
    }

    /**
     * Pause playback
     */
    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
        } else if (this.context) {
            this.context.suspend();
        }

        this.isPlaying = false;
        eventBus.emit(Events.AUDIO_PAUSE);
    }

    /**
     * Stop playback
     */
    stop() {
        if (this.source) {
            try {
                this.source.stop();
                this.source.disconnect();
            } catch (e) {
                // Already stopped
            }
            this.source = null;
        }

        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
            this.audioElement = null;
        }

        this.isPlaying = false;
        this.currentTime = 0;
        eventBus.emit(Events.AUDIO_STOP);
    }

    /**
     * Toggle play/pause
     */
    async togglePlay() {
        if (this.isPlaying) {
            this.pause();
        } else {
            await this.play();
        }
        return this.isPlaying;
    }

    /**
     * Seek to position (0-1)
     */
    seek(position) {
        if (this.audioElement) {
            this.audioElement.currentTime = position * this.duration;
            eventBus.emit(Events.AUDIO_SEEK, { position, time: this.audioElement.currentTime });
        }
        // Note: BufferSource doesn't support seeking after start
        // Would need to recreate source at new position
    }

    /**
     * Set volume (0-1)
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
        if (this.audioElement) {
            this.audioElement.volume = this.volume;
        }
        eventBus.emit(Events.AUDIO_VOLUME_CHANGE, this.volume);
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        if (this.isMuted) {
            this.setVolume(this.previousVolume);
            this.isMuted = false;
        } else {
            this.previousVolume = this.volume;
            this.setVolume(0);
            this.isMuted = true;
        }
        return this.isMuted;
    }

    /**
     * Set smoothing time constant
     */
    setSmoothing(value) {
        this.smoothingTimeConstant = Math.max(0, Math.min(1, value));
        if (this.analyser) {
            this.analyser.smoothingTimeConstant = this.smoothingTimeConstant;
        }
    }

    /**
     * Get frequency data (Uint8Array)
     */
    getFrequencyData() {
        if (!this.analyser || !this.frequencyData) return null;
        this.analyser.getByteFrequencyData(this.frequencyData);
        return this.frequencyData;
    }

    /**
     * Get time domain data (waveform)
     */
    getTimeDomainData() {
        if (!this.analyser || !this.timeDomainData) return null;
        this.analyser.getByteTimeDomainData(this.timeDomainData);
        return this.timeDomainData;
    }

    /**
     * Get float frequency data (more precise)
     */
    getFloatFrequencyData() {
        if (!this.analyser) return null;
        const data = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatFrequencyData(data);
        return data;
    }

    /**
     * Get current playback time
     */
    getCurrentTime() {
        if (this.audioElement) {
            return this.audioElement.currentTime;
        }
        if (this.source && this.startTime) {
            return this.context.currentTime - this.startTime;
        }
        return 0;
    }

    /**
     * Get playback progress (0-1)
     */
    getProgress() {
        if (this.duration === 0) return 0;
        return this.getCurrentTime() / this.duration;
    }

    /**
     * Update method called each frame
     */
    update() {
        if (!this.isInitialized) return null;

        this.currentTime = this.getCurrentTime();

        // Emit time update
        if (this.isPlaying) {
            eventBus.emit(Events.AUDIO_TIME_UPDATE, {
                currentTime: this.currentTime,
                duration: this.duration,
                progress: this.getProgress()
            });
        }

        return this.getFrequencyData();
    }

    /**
     * Get the audio context's sample rate
     */
    getSampleRate() {
        return this.context ? this.context.sampleRate : 44100;
    }

    /**
     * Get the analyser's frequency bin count
     */
    getBinCount() {
        return this.analyser ? this.analyser.frequencyBinCount : 0;
    }

    /**
     * Get the analyser node
     */
    getAnalyser() {
        return this.analyser;
    }

    /**
     * Connect the frequency analyzer
     */
    setFrequencyAnalyzer(analyzer) {
        this.frequencyAnalyzer = analyzer;
    }

    /**
     * Destroy and cleanup
     */
    destroy() {
        this.stop();
        if (this.context) {
            this.context.close();
        }
        this.context = null;
        this.analyser = null;
        this.gainNode = null;
        this.isInitialized = false;
    }
}

// Export singleton instance
export const audioEngine = new AudioEngine();
export default audioEngine;
