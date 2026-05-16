/**
 * SONIC ARCHITECT MK.III
 * EventBus - Pub/Sub Event System
 *
 * Provides decoupled communication between components
 */

class EventBus {
    constructor() {
        this.listeners = new Map();
        this.onceListeners = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event (fires only once)
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    once(event, callback) {
        if (!this.onceListeners.has(event)) {
            this.onceListeners.set(event, new Set());
        }
        this.onceListeners.get(event).add(callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Callback function to remove
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
        if (this.onceListeners.has(event)) {
            this.onceListeners.get(event).delete(callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to callbacks
     */
    emit(event, data) {
        // Regular listeners
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`EventBus error in "${event}" handler:`, error);
                }
            });
        }

        // Once listeners
        if (this.onceListeners.has(event)) {
            this.onceListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`EventBus error in "${event}" once handler:`, error);
                }
            });
            this.onceListeners.delete(event);
        }
    }

    /**
     * Remove all listeners for an event or all events
     * @param {string} [event] - Optional event name
     */
    clear(event) {
        if (event) {
            this.listeners.delete(event);
            this.onceListeners.delete(event);
        } else {
            this.listeners.clear();
            this.onceListeners.clear();
        }
    }

    /**
     * Get count of listeners for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
        let count = 0;
        if (this.listeners.has(event)) {
            count += this.listeners.get(event).size;
        }
        if (this.onceListeners.has(event)) {
            count += this.onceListeners.get(event).size;
        }
        return count;
    }

    /**
     * Check if event has listeners
     * @param {string} event - Event name
     * @returns {boolean}
     */
    hasListeners(event) {
        return this.listenerCount(event) > 0;
    }
}

// Event names constants
export const Events = {
    // Audio events
    AUDIO_INIT: 'audio:init',
    AUDIO_PLAY: 'audio:play',
    AUDIO_PAUSE: 'audio:pause',
    AUDIO_STOP: 'audio:stop',
    AUDIO_SEEK: 'audio:seek',
    AUDIO_ENDED: 'audio:ended',
    AUDIO_LOAD: 'audio:load',
    AUDIO_ERROR: 'audio:error',
    AUDIO_TIME_UPDATE: 'audio:timeUpdate',
    AUDIO_VOLUME_CHANGE: 'audio:volumeChange',

    // Frequency analysis events
    FREQ_UPDATE: 'freq:update',
    BEAT_DETECTED: 'beat:detected',
    BPM_CALCULATED: 'bpm:calculated',
    BPM_UPDATE: 'bpm:update',

    // Playlist events
    PLAYLIST_ADD: 'playlist:add',
    PLAYLIST_REMOVE: 'playlist:remove',
    PLAYLIST_CLEAR: 'playlist:clear',
    PLAYLIST_REORDER: 'playlist:reorder',
    PLAYLIST_UPDATE: 'playlist:update',
    PLAYLIST_TRACK_CHANGE: 'playlist:trackChange',
    TRACK_CHANGE: 'track:change',
    QUEUE_UPDATE: 'queue:update',
    METADATA_LOADED: 'metadata:loaded',
    LOAD_COMPLETE: 'load:complete',
    LOAD_START: 'load:start',
    LOAD_PROGRESS: 'load:progress',
    LOAD_ERROR: 'load:error',
    SHOW_NOTIFICATION: 'notification:show',
    ALBUM_COLOR_EXTRACTED: 'album:colorExtracted',
    WAVEFORM_COMPLETE: 'waveform:complete',

    // Visualizer events
    VISUALIZER_CHANGE: 'visualizer:change',
    VISUALIZER_READY: 'visualizer:ready',
    VISUALIZER_UPDATE: 'visualizer:update',
    VISUALIZER_REGISTER: 'visualizer:register',
    VISUALIZER_ACTIVATE: 'visualizer:activate',
    VISUALIZER_DEACTIVATE: 'visualizer:deactivate',
    SWITCH_VISUALIZER: 'visualizer:switch',

    // Effects events
    EFFECT_TOGGLE: 'effect:toggle',
    EFFECT_UPDATE: 'effect:update',

    // UI events
    UI_RESIZE: 'ui:resize',
    UI_FULLSCREEN: 'ui:fullscreen',
    UI_HIDE: 'ui:hide',
    UI_SHOW: 'ui:show',
    PANEL_TOGGLE: 'panel:toggle',
    THEME_CHANGE: 'theme:change',
    NOTIFICATION: 'notification',
    SEEK: 'seek',

    // Control events
    TOGGLE_PLAY: 'control:togglePlay',
    NEXT_TRACK: 'control:nextTrack',
    PREV_TRACK: 'control:prevTrack',
    TOGGLE_SHUFFLE: 'control:toggleShuffle',
    CYCLE_REPEAT: 'control:cycleRepeat',
    VOLUME_CHANGE: 'control:volumeChange',
    TOGGLE_MUTE: 'control:toggleMute',

    // Settings events
    SETTINGS_UPDATE: 'settings:update',
    PRESET_LOAD: 'preset:load',
    PRESET_SAVE: 'preset:save',

    // Microphone events
    MIC_START: 'mic:start',
    MIC_STOP: 'mic:stop',
    MIC_ERROR: 'mic:error',

    // System events
    APP_INIT: 'app:init',
    APP_READY: 'app:ready',
    QUALITY_CHANGE: 'quality:change',
    FPS_UPDATE: 'fps:update',
};

// Create and export singleton instance
export const eventBus = new EventBus();
export default eventBus;
