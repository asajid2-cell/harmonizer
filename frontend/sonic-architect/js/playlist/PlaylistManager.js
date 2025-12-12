/**
 * SONIC ARCHITECT MK.III
 * PlaylistManager - Core Playlist Logic
 *
 * Features:
 * - Track queue management
 * - Shuffle and repeat modes
 * - History tracking
 * - Playlist persistence
 * - Event-driven updates
 */

import { eventBus, Events } from '../utils/EventBus.js';
import { storage } from '../utils/Storage.js';

// Playback modes
export const PlaybackMode = {
    NORMAL: 'normal',
    REPEAT_ONE: 'repeat-one',
    REPEAT_ALL: 'repeat-all',
    SHUFFLE: 'shuffle'
};

class PlaylistManager {
    constructor() {
        // Track list
        this.tracks = [];
        this.currentIndex = -1;

        // Playback state
        this.playbackMode = PlaybackMode.NORMAL;
        this.isShuffled = false;

        // Queue system
        this.queue = [];           // User-added queue (plays next)
        this.shuffleOrder = [];    // Shuffled indices
        this.shuffleIndex = 0;

        // History
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;

        // Storage key
        this.storageKey = 'sonic-playlist';

        // Bind methods
        this.handleTrackEnd = this.handleTrackEnd.bind(this);

        // Subscribe to events
        eventBus.on(Events.AUDIO_ENDED, this.handleTrackEnd);
    }

    /**
     * Add tracks to playlist
     */
    addTracks(tracks, position = null) {
        const startIndex = this.tracks.length;

        tracks.forEach((track, i) => {
            // Assign unique ID if not present
            if (!track.id) {
                track.id = `track-${Date.now()}-${i}`;
            }

            if (position !== null) {
                this.tracks.splice(position + i, 0, track);
            } else {
                this.tracks.push(track);
            }
        });

        // Update shuffle order if shuffled
        if (this.isShuffled) {
            this.updateShuffleOrder();
        }

        eventBus.emit(Events.PLAYLIST_UPDATE, {
            tracks: this.tracks,
            action: 'add',
            addedCount: tracks.length
        });

        // Auto-save
        this.save();

        return startIndex;
    }

    /**
     * Remove track at index
     */
    removeTrack(index) {
        if (index < 0 || index >= this.tracks.length) return false;

        const removed = this.tracks.splice(index, 1)[0];

        // Adjust current index if needed
        if (index < this.currentIndex) {
            this.currentIndex--;
        } else if (index === this.currentIndex) {
            // Currently playing track removed
            this.currentIndex = Math.min(this.currentIndex, this.tracks.length - 1);
        }

        // Update shuffle order
        if (this.isShuffled) {
            this.updateShuffleOrder();
        }

        eventBus.emit(Events.PLAYLIST_UPDATE, {
            tracks: this.tracks,
            action: 'remove',
            removedTrack: removed
        });

        this.save();

        return true;
    }

    /**
     * Move track from one position to another
     */
    moveTrack(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.tracks.length) return false;
        if (toIndex < 0 || toIndex >= this.tracks.length) return false;

        const [track] = this.tracks.splice(fromIndex, 1);
        this.tracks.splice(toIndex, 0, track);

        // Adjust current index
        if (fromIndex === this.currentIndex) {
            this.currentIndex = toIndex;
        } else if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) {
            this.currentIndex--;
        } else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) {
            this.currentIndex++;
        }

        eventBus.emit(Events.PLAYLIST_UPDATE, {
            tracks: this.tracks,
            action: 'reorder'
        });

        this.save();

        return true;
    }

    /**
     * Clear entire playlist
     */
    clear() {
        this.tracks = [];
        this.currentIndex = -1;
        this.queue = [];
        this.shuffleOrder = [];

        eventBus.emit(Events.PLAYLIST_UPDATE, {
            tracks: this.tracks,
            action: 'clear'
        });

        this.save();
    }

    /**
     * Get current track
     */
    getCurrentTrack() {
        if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
            return this.tracks[this.currentIndex];
        }
        return null;
    }

    /**
     * Get track at index
     */
    getTrack(index) {
        return this.tracks[index] || null;
    }

    /**
     * Get all tracks
     */
    getTracks() {
        return [...this.tracks];
    }

    /**
     * Get playlist length
     */
    getLength() {
        return this.tracks.length;
    }

    /**
     * Play track at index
     */
    playTrack(index) {
        if (index < 0 || index >= this.tracks.length) {
            console.warn('Invalid track index:', index);
            return null;
        }

        // Add current to history
        if (this.currentIndex >= 0) {
            this.addToHistory(this.currentIndex);
        }

        this.currentIndex = index;
        const track = this.tracks[index];

        eventBus.emit(Events.PLAYLIST_TRACK_CHANGE, {
            track,
            index,
            total: this.tracks.length
        });

        return track;
    }

    /**
     * Play next track
     */
    next() {
        // Check user queue first
        if (this.queue.length > 0) {
            const queuedIndex = this.queue.shift();
            return this.playTrack(queuedIndex);
        }

        let nextIndex;

        if (this.isShuffled) {
            // Shuffle mode
            this.shuffleIndex++;
            if (this.shuffleIndex >= this.shuffleOrder.length) {
                if (this.playbackMode === PlaybackMode.REPEAT_ALL) {
                    this.updateShuffleOrder(); // Reshuffle
                    this.shuffleIndex = 0;
                } else {
                    // End of shuffled playlist
                    eventBus.emit(Events.PLAYLIST_END);
                    return null;
                }
            }
            nextIndex = this.shuffleOrder[this.shuffleIndex];
        } else {
            // Normal order
            nextIndex = this.currentIndex + 1;

            if (nextIndex >= this.tracks.length) {
                if (this.playbackMode === PlaybackMode.REPEAT_ALL) {
                    nextIndex = 0;
                } else {
                    eventBus.emit(Events.PLAYLIST_END);
                    return null;
                }
            }
        }

        return this.playTrack(nextIndex);
    }

    /**
     * Play previous track
     */
    previous() {
        // Check history first
        if (this.history.length > 0 && this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const historyEntry = this.history[this.history.length - 1 - this.historyIndex];
            return this.playTrack(historyEntry);
        }

        let prevIndex;

        if (this.isShuffled) {
            this.shuffleIndex--;
            if (this.shuffleIndex < 0) {
                this.shuffleIndex = 0;
                return this.getCurrentTrack();
            }
            prevIndex = this.shuffleOrder[this.shuffleIndex];
        } else {
            prevIndex = this.currentIndex - 1;
            if (prevIndex < 0) {
                if (this.playbackMode === PlaybackMode.REPEAT_ALL) {
                    prevIndex = this.tracks.length - 1;
                } else {
                    prevIndex = 0;
                }
            }
        }

        return this.playTrack(prevIndex);
    }

    /**
     * Handle track ended event
     */
    handleTrackEnd() {
        if (this.playbackMode === PlaybackMode.REPEAT_ONE) {
            // Replay current track
            eventBus.emit(Events.PLAYLIST_TRACK_CHANGE, {
                track: this.getCurrentTrack(),
                index: this.currentIndex,
                total: this.tracks.length,
                repeat: true
            });
        } else {
            // Play next
            this.next();
        }
    }

    /**
     * Add track index to history
     */
    addToHistory(index) {
        this.history.push(index);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = -1;
    }

    /**
     * Add track to play queue (plays after current)
     */
    addToQueue(index) {
        if (index >= 0 && index < this.tracks.length) {
            this.queue.push(index);
            eventBus.emit(Events.QUEUE_UPDATE, { queue: this.queue });
        }
    }

    /**
     * Remove from queue
     */
    removeFromQueue(queueIndex) {
        if (queueIndex >= 0 && queueIndex < this.queue.length) {
            this.queue.splice(queueIndex, 1);
            eventBus.emit(Events.QUEUE_UPDATE, { queue: this.queue });
        }
    }

    /**
     * Clear queue
     */
    clearQueue() {
        this.queue = [];
        eventBus.emit(Events.QUEUE_UPDATE, { queue: this.queue });
    }

    /**
     * Get queue
     */
    getQueue() {
        return this.queue.map(index => ({
            index,
            track: this.tracks[index]
        }));
    }

    /**
     * Set playback mode
     */
    setPlaybackMode(mode) {
        this.playbackMode = mode;

        // Handle shuffle
        if (mode === PlaybackMode.SHUFFLE) {
            this.enableShuffle();
        } else if (this.isShuffled) {
            this.disableShuffle();
        }

        eventBus.emit(Events.PLAYBACK_MODE_CHANGE, { mode });
        this.save();
    }

    /**
     * Toggle shuffle
     */
    toggleShuffle() {
        if (this.isShuffled) {
            this.disableShuffle();
        } else {
            this.enableShuffle();
        }
        return this.isShuffled;
    }

    /**
     * Enable shuffle mode
     */
    enableShuffle() {
        this.isShuffled = true;
        this.updateShuffleOrder();

        // Set shuffle index to current track position in shuffle order
        if (this.currentIndex >= 0) {
            this.shuffleIndex = this.shuffleOrder.indexOf(this.currentIndex);
        }

        eventBus.emit(Events.SHUFFLE_CHANGE, { enabled: true });
    }

    /**
     * Disable shuffle mode
     */
    disableShuffle() {
        this.isShuffled = false;
        this.shuffleOrder = [];
        this.shuffleIndex = 0;

        eventBus.emit(Events.SHUFFLE_CHANGE, { enabled: false });
    }

    /**
     * Generate new shuffle order
     */
    updateShuffleOrder() {
        this.shuffleOrder = [];

        // Create array of indices
        for (let i = 0; i < this.tracks.length; i++) {
            this.shuffleOrder.push(i);
        }

        // Fisher-Yates shuffle
        for (let i = this.shuffleOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffleOrder[i], this.shuffleOrder[j]] =
            [this.shuffleOrder[j], this.shuffleOrder[i]];
        }

        // Move current track to beginning if playing
        if (this.currentIndex >= 0) {
            const currentPos = this.shuffleOrder.indexOf(this.currentIndex);
            if (currentPos > 0) {
                this.shuffleOrder.splice(currentPos, 1);
                this.shuffleOrder.unshift(this.currentIndex);
            }
        }

        this.shuffleIndex = 0;
    }

    /**
     * Cycle through repeat modes
     */
    cycleRepeatMode() {
        const modes = [
            PlaybackMode.NORMAL,
            PlaybackMode.REPEAT_ALL,
            PlaybackMode.REPEAT_ONE
        ];

        const currentModeIndex = modes.indexOf(this.playbackMode);
        const nextModeIndex = (currentModeIndex + 1) % modes.length;

        this.setPlaybackMode(modes[nextModeIndex]);
        return this.playbackMode;
    }

    /**
     * Save playlist to storage
     */
    async save() {
        const data = {
            tracks: this.tracks.map(t => ({
                id: t.id,
                name: t.name,
                artist: t.artist,
                album: t.album,
                duration: t.duration,
                // Don't save file/buffer data
            })),
            currentIndex: this.currentIndex,
            playbackMode: this.playbackMode,
            isShuffled: this.isShuffled
        };

        await storage.setLocal(this.storageKey, data);
    }

    /**
     * Load playlist from storage
     */
    async load() {
        const data = await storage.getLocal(this.storageKey);

        if (data) {
            // Note: This only loads metadata, not actual audio files
            this.tracks = data.tracks || [];
            this.currentIndex = data.currentIndex || -1;
            this.playbackMode = data.playbackMode || PlaybackMode.NORMAL;
            this.isShuffled = data.isShuffled || false;

            if (this.isShuffled) {
                this.updateShuffleOrder();
            }

            eventBus.emit(Events.PLAYLIST_LOAD, {
                tracks: this.tracks,
                currentIndex: this.currentIndex
            });

            return true;
        }

        return false;
    }

    /**
     * Get playlist state
     */
    getState() {
        return {
            tracks: this.tracks,
            currentIndex: this.currentIndex,
            currentTrack: this.getCurrentTrack(),
            playbackMode: this.playbackMode,
            isShuffled: this.isShuffled,
            queue: this.queue,
            hasNext: this.currentIndex < this.tracks.length - 1 ||
                     this.playbackMode === PlaybackMode.REPEAT_ALL ||
                     this.queue.length > 0,
            hasPrevious: this.currentIndex > 0 ||
                         this.history.length > 0
        };
    }

    /**
     * Find track by ID
     */
    findTrackById(id) {
        const index = this.tracks.findIndex(t => t.id === id);
        return index >= 0 ? { track: this.tracks[index], index } : null;
    }

    /**
     * Search tracks by name
     */
    searchTracks(query) {
        const lowerQuery = query.toLowerCase();
        return this.tracks
            .map((track, index) => ({ track, index }))
            .filter(({ track }) =>
                track.name?.toLowerCase().includes(lowerQuery) ||
                track.artist?.toLowerCase().includes(lowerQuery) ||
                track.album?.toLowerCase().includes(lowerQuery)
            );
    }

    /**
     * Cleanup
     */
    destroy() {
        eventBus.off(Events.AUDIO_ENDED, this.handleTrackEnd);
        this.tracks = [];
        this.queue = [];
        this.history = [];
    }
}

// Export singleton
export const playlistManager = new PlaylistManager();
export default playlistManager;
