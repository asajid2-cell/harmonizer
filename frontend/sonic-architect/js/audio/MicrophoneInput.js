/**
 * SONIC ARCHITECT MK.III
 * MicrophoneInput - Microphone Capture with Permission Handling
 *
 * Features:
 * - Browser permission request
 * - Gain control
 * - Noise gate
 * - Device selection
 * - Mute toggle
 */

import { eventBus, Events } from '../utils/EventBus.js';

class MicrophoneInput {
    constructor() {
        this.stream = null;
        this.source = null;
        this.gainNode = null;
        this.analyserNode = null;
        this.context = null;

        this.isActive = false;
        this.isMuted = false;
        this.hasPermission = false;
        this.permissionState = 'prompt'; // 'prompt', 'granted', 'denied'

        // Configuration
        this.config = {
            gain: 1.0,
            noiseGate: 0.01,  // Minimum level to pass through
            fftSize: 2048,
            smoothing: 0.8
        };

        // Available devices
        this.devices = [];
        this.currentDeviceId = null;

        // Level monitoring
        this.inputLevel = 0;
        this.peakLevel = 0;
        this.peakDecay = 0.95;
    }

    /**
     * Check if microphone is supported
     */
    static isSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    /**
     * Check current permission state
     */
    async checkPermission() {
        if (!navigator.permissions) {
            return 'prompt';
        }

        try {
            const result = await navigator.permissions.query({ name: 'microphone' });
            this.permissionState = result.state;
            this.hasPermission = result.state === 'granted';

            // Listen for permission changes
            result.addEventListener('change', () => {
                this.permissionState = result.state;
                this.hasPermission = result.state === 'granted';
                eventBus.emit(Events.MIC_PERMISSION_CHANGE, {
                    state: result.state,
                    granted: this.hasPermission
                });
            });

            return result.state;
        } catch (e) {
            console.warn('Permission API not available:', e);
            return 'prompt';
        }
    }

    /**
     * Get available audio input devices
     */
    async getDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.devices = devices
                .filter(device => device.kind === 'audioinput')
                .map(device => ({
                    id: device.deviceId,
                    label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
                    groupId: device.groupId
                }));

            return this.devices;
        } catch (e) {
            console.error('Failed to enumerate devices:', e);
            return [];
        }
    }

    /**
     * Request microphone permission and start capture
     */
    async requestPermission(deviceId = null) {
        if (!MicrophoneInput.isSupported()) {
            throw new Error('Microphone not supported in this browser');
        }

        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: false
                }
            };

            if (deviceId) {
                constraints.audio.deviceId = { exact: deviceId };
            }

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.hasPermission = true;
            this.permissionState = 'granted';
            this.currentDeviceId = deviceId;

            // Update device list (labels available after permission)
            await this.getDevices();

            eventBus.emit(Events.MIC_PERMISSION_CHANGE, {
                state: 'granted',
                granted: true
            });

            console.log('🎤 Microphone permission granted');
            return true;

        } catch (error) {
            this.hasPermission = false;

            if (error.name === 'NotAllowedError') {
                this.permissionState = 'denied';
                eventBus.emit(Events.MIC_PERMISSION_CHANGE, {
                    state: 'denied',
                    granted: false
                });
            }

            console.error('Microphone permission error:', error);
            throw error;
        }
    }

    /**
     * Initialize with AudioContext and start capture
     */
    async start(audioContext, deviceId = null) {
        if (this.isActive) {
            console.warn('Microphone already active');
            return this.analyserNode;
        }

        this.context = audioContext;

        // Request permission if needed
        if (!this.stream) {
            await this.requestPermission(deviceId);
        }

        // Create audio nodes
        this.source = this.context.createMediaStreamSource(this.stream);

        // Gain node for volume control
        this.gainNode = this.context.createGain();
        this.gainNode.gain.value = this.config.gain;

        // Analyser node for visualization
        this.analyserNode = this.context.createAnalyser();
        this.analyserNode.fftSize = this.config.fftSize;
        this.analyserNode.smoothingTimeConstant = this.config.smoothing;

        // Connect: source -> gain -> analyser
        // Note: NOT connecting to destination to prevent feedback
        this.source.connect(this.gainNode);
        this.gainNode.connect(this.analyserNode);

        this.isActive = true;
        this.isMuted = false;

        eventBus.emit(Events.MIC_START, {
            deviceId: this.currentDeviceId,
            sampleRate: this.context.sampleRate
        });

        console.log('🎤 Microphone capture started');
        return this.analyserNode;
    }

    /**
     * Stop microphone capture
     */
    stop() {
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.isActive = false;
        this.analyserNode = null;

        eventBus.emit(Events.MIC_STOP);
        console.log('🎤 Microphone capture stopped');
    }

    /**
     * Toggle microphone on/off
     */
    async toggle(audioContext) {
        if (this.isActive) {
            this.stop();
            return false;
        } else {
            await this.start(audioContext);
            return true;
        }
    }

    /**
     * Mute/unmute microphone
     */
    toggleMute() {
        if (!this.gainNode) return this.isMuted;

        this.isMuted = !this.isMuted;
        this.gainNode.gain.value = this.isMuted ? 0 : this.config.gain;

        eventBus.emit(Events.MIC_MUTE, { muted: this.isMuted });
        return this.isMuted;
    }

    /**
     * Set gain level (0-2)
     */
    setGain(value) {
        this.config.gain = Math.max(0, Math.min(2, value));

        if (this.gainNode && !this.isMuted) {
            this.gainNode.gain.value = this.config.gain;
        }

        eventBus.emit(Events.MIC_GAIN_CHANGE, { gain: this.config.gain });
    }

    /**
     * Get current input level (0-1)
     */
    getInputLevel() {
        if (!this.analyserNode || !this.isActive) return 0;

        const data = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.analyserNode.getByteFrequencyData(data);

        // Calculate RMS
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        this.inputLevel = Math.sqrt(sum / data.length) / 255;

        // Update peak
        if (this.inputLevel > this.peakLevel) {
            this.peakLevel = this.inputLevel;
        } else {
            this.peakLevel *= this.peakDecay;
        }

        return this.inputLevel;
    }

    /**
     * Get analyser node for external use
     */
    getAnalyserNode() {
        return this.analyserNode;
    }

    /**
     * Switch to different microphone device
     */
    async switchDevice(deviceId) {
        const wasActive = this.isActive;

        if (wasActive) {
            this.stop();
        }

        this.currentDeviceId = deviceId;

        if (wasActive && this.context) {
            await this.start(this.context, deviceId);
        }
    }

    /**
     * Check if microphone is currently active
     */
    isCapturing() {
        return this.isActive;
    }

    /**
     * Get current state
     */
    getState() {
        return {
            isActive: this.isActive,
            isMuted: this.isMuted,
            hasPermission: this.hasPermission,
            permissionState: this.permissionState,
            gain: this.config.gain,
            inputLevel: this.inputLevel,
            peakLevel: this.peakLevel,
            deviceId: this.currentDeviceId,
            devices: this.devices
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stop();
        this.devices = [];
        this.context = null;
    }
}

// Export singleton
export const microphoneInput = new MicrophoneInput();
export default microphoneInput;
