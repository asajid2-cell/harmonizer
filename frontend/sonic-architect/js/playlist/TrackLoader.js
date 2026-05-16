/**
 * SONIC ARCHITECT MK.III
 * TrackLoader - File Loading and Validation
 *
 * Features:
 * - Multi-file drag and drop support
 * - File type validation
 * - Audio duration extraction
 * - Batch loading with progress
 * - Error handling
 */

import { eventBus, Events } from '../utils/EventBus.js';
import { playlistManager } from './PlaylistManager.js';

// Supported audio formats
const SUPPORTED_FORMATS = [
    'audio/mpeg',      // MP3
    'audio/mp3',
    'audio/wav',       // WAV
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',       // OGG
    'audio/flac',      // FLAC
    'audio/aac',       // AAC
    'audio/mp4',       // M4A
    'audio/x-m4a',
    'audio/webm'       // WebM
];

const SUPPORTED_EXTENSIONS = [
    '.mp3', '.wav', '.ogg', '.flac',
    '.aac', '.m4a', '.webm', '.opus'
];

class TrackLoader {
    constructor() {
        this.isLoading = false;
        this.loadQueue = [];
        this.loadProgress = 0;
        this.totalToLoad = 0;
        this.loadedCount = 0;

        // Audio context for duration extraction
        this.audioContext = null;
    }

    /**
     * Initialize audio context
     */
    initAudioContext() {
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
        }
    }

    /**
     * Validate file type
     */
    isValidAudioFile(file) {
        // Check MIME type
        if (file.type && SUPPORTED_FORMATS.includes(file.type)) {
            return true;
        }

        // Check extension
        const name = file.name.toLowerCase();
        return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
    }

    /**
     * Load single file
     */
    async loadFile(file) {
        if (!this.isValidAudioFile(file)) {
            throw new Error(`Unsupported file format: ${file.name}`);
        }

        this.initAudioContext();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    // Decode audio to get duration
                    const arrayBuffer = e.target.result;
                    const audioBuffer = await this.audioContext.decodeAudioData(
                        arrayBuffer.slice(0) // Clone buffer
                    );

                    // Create track object
                    const track = {
                        id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        name: this.cleanFileName(file.name),
                        file: file,
                        buffer: arrayBuffer,
                        duration: audioBuffer.duration,
                        size: file.size,
                        type: file.type,
                        dateAdded: new Date().toISOString()
                    };

                    resolve(track);

                } catch (error) {
                    reject(new Error(`Failed to decode: ${file.name}`));
                }
            };

            reader.onerror = () => {
                reject(new Error(`Failed to read: ${file.name}`));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Load multiple files
     */
    async loadFiles(files) {
        const fileArray = Array.from(files);
        const validFiles = fileArray.filter(f => this.isValidAudioFile(f));

        if (validFiles.length === 0) {
            eventBus.emit(Events.LOAD_ERROR, {
                message: 'No valid audio files found'
            });
            return [];
        }

        this.isLoading = true;
        this.totalToLoad = validFiles.length;
        this.loadedCount = 0;
        this.loadProgress = 0;

        eventBus.emit(Events.LOAD_START, {
            total: this.totalToLoad
        });

        const loadedTracks = [];
        const errors = [];

        for (const file of validFiles) {
            try {
                const track = await this.loadFile(file);
                loadedTracks.push(track);

                this.loadedCount++;
                this.loadProgress = this.loadedCount / this.totalToLoad;

                eventBus.emit(Events.LOAD_PROGRESS, {
                    loaded: this.loadedCount,
                    total: this.totalToLoad,
                    progress: this.loadProgress,
                    currentFile: file.name
                });

            } catch (error) {
                console.error('Load error:', error);
                errors.push({ file: file.name, error: error.message });
            }
        }

        this.isLoading = false;

        // Add to playlist
        if (loadedTracks.length > 0) {
            playlistManager.addTracks(loadedTracks);
        }

        eventBus.emit(Events.LOAD_COMPLETE, {
            loaded: loadedTracks.length,
            errors: errors.length,
            tracks: loadedTracks
        });

        if (errors.length > 0) {
            eventBus.emit(Events.LOAD_ERROR, {
                message: `Failed to load ${errors.length} file(s)`,
                errors
            });
        }

        return loadedTracks;
    }

    /**
     * Handle drag and drop
     */
    async handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();

        const items = event.dataTransfer.items;
        const files = [];

        // Handle both files and directories
        if (items) {
            const entries = [];

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry?.();
                    if (entry) {
                        entries.push(entry);
                    } else {
                        files.push(item.getAsFile());
                    }
                }
            }

            // Process directory entries
            for (const entry of entries) {
                const entryFiles = await this.readEntry(entry);
                files.push(...entryFiles);
            }
        } else {
            // Fallback for older browsers
            files.push(...Array.from(event.dataTransfer.files));
        }

        if (files.length > 0) {
            return this.loadFiles(files);
        }

        return [];
    }

    /**
     * Recursively read directory entry
     */
    async readEntry(entry) {
        const files = [];

        if (entry.isFile) {
            const file = await new Promise(resolve => entry.file(resolve));
            if (this.isValidAudioFile(file)) {
                files.push(file);
            }
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            const entries = await new Promise(resolve => {
                reader.readEntries(resolve);
            });

            for (const childEntry of entries) {
                const childFiles = await this.readEntry(childEntry);
                files.push(...childFiles);
            }
        }

        return files;
    }

    /**
     * Clean file name for display
     */
    cleanFileName(filename) {
        // Remove extension
        let name = filename.replace(/\.[^/.]+$/, '');

        // Replace underscores and dashes with spaces
        name = name.replace(/[_-]/g, ' ');

        // Remove common prefixes (track numbers, etc.)
        name = name.replace(/^\d{1,3}[\s.-]+/, '');

        // Capitalize first letter of each word
        name = name.replace(/\b\w/g, c => c.toUpperCase());

        return name.trim();
    }

    /**
     * Create file input and trigger click
     */
    openFileDialog(multiple = true) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = SUPPORTED_EXTENSIONS.join(',');
        input.multiple = multiple;

        input.onchange = (e) => {
            if (e.target.files.length > 0) {
                this.loadFiles(e.target.files);
            }
        };

        input.click();
    }

    /**
     * Setup drop zone
     */
    setupDropZone(element) {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.add('drag-over');
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            element.classList.remove('drag-over');
        });

        element.addEventListener('drop', async (e) => {
            element.classList.remove('drag-over');
            await this.handleDrop(e);
        });
    }

    /**
     * Get loading state
     */
    getState() {
        return {
            isLoading: this.isLoading,
            progress: this.loadProgress,
            loaded: this.loadedCount,
            total: this.totalToLoad
        };
    }

    /**
     * Cancel loading
     */
    cancel() {
        this.isLoading = false;
        this.loadQueue = [];
        eventBus.emit(Events.LOAD_CANCEL);
    }

    /**
     * Get supported formats info
     */
    getSupportedFormats() {
        return {
            mimeTypes: SUPPORTED_FORMATS,
            extensions: SUPPORTED_EXTENSIONS
        };
    }
}

// Export singleton
export const trackLoader = new TrackLoader();
export default trackLoader;
