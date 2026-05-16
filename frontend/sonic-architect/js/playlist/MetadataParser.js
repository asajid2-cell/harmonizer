/**
 * SONIC ARCHITECT MK.III
 * MetadataParser - ID3 Tag and Metadata Extraction
 *
 * Features:
 * - ID3v1/v2 tag parsing
 * - Album art extraction
 * - Multiple format support
 * - Fallback handling
 */

import { eventBus, Events } from '../utils/EventBus.js';

class MetadataParser {
    constructor() {
        this.jsmediatags = null;
        this.isReady = false;
    }

    /**
     * Initialize by loading jsmediatags library
     */
    async init() {
        if (this.isReady) return true;

        try {
            // Try to load jsmediatags from CDN
            if (!window.jsmediatags) {
                await this.loadScript(
                    'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'
                );
            }

            this.jsmediatags = window.jsmediatags;
            this.isReady = true;
            console.log('📋 MetadataParser initialized');
            return true;

        } catch (error) {
            console.warn('MetadataParser: jsmediatags not available, using fallback');
            return false;
        }
    }

    /**
     * Load external script
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Parse metadata from file
     */
    async parseFile(file) {
        // Initialize if needed
        if (!this.isReady) {
            await this.init();
        }

        // Try jsmediatags first
        if (this.jsmediatags) {
            try {
                const tags = await this.readTags(file);
                return this.processTags(tags, file);
            } catch (error) {
                console.warn('Tag reading failed:', error);
            }
        }

        // Fallback to basic metadata
        return this.createFallbackMetadata(file);
    }

    /**
     * Read tags using jsmediatags
     */
    readTags(file) {
        return new Promise((resolve, reject) => {
            this.jsmediatags.read(file, {
                onSuccess: (result) => resolve(result.tags),
                onError: (error) => reject(error)
            });
        });
    }

    /**
     * Process extracted tags into standard format
     */
    processTags(tags, file) {
        const metadata = {
            title: tags.title || this.cleanFileName(file.name),
            artist: tags.artist || 'Unknown Artist',
            album: tags.album || 'Unknown Album',
            year: tags.year || null,
            track: this.parseTrackNumber(tags.track),
            genre: tags.genre || null,
            comment: tags.comment?.text || null,
            albumArt: null,
            albumArtUrl: null
        };

        // Extract album art
        if (tags.picture) {
            metadata.albumArt = this.extractAlbumArt(tags.picture);
            metadata.albumArtUrl = metadata.albumArt ?
                URL.createObjectURL(metadata.albumArt) : null;
        }

        return metadata;
    }

    /**
     * Parse track number (handles "3/12" format)
     */
    parseTrackNumber(track) {
        if (!track) return null;

        if (typeof track === 'number') return track;

        const match = String(track).match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * Extract album art as Blob
     */
    extractAlbumArt(picture) {
        if (!picture || !picture.data) return null;

        try {
            const { data, format } = picture;

            // Convert data to Uint8Array if needed
            const byteArray = data instanceof Uint8Array ?
                data : new Uint8Array(data);

            // Determine MIME type
            let mimeType = format || 'image/jpeg';
            if (!mimeType.startsWith('image/')) {
                mimeType = `image/${mimeType}`;
            }

            return new Blob([byteArray], { type: mimeType });

        } catch (error) {
            console.warn('Album art extraction failed:', error);
            return null;
        }
    }

    /**
     * Create fallback metadata when tags unavailable
     */
    createFallbackMetadata(file) {
        const name = this.cleanFileName(file.name);

        // Try to parse artist - title format
        const parsed = this.parseFileName(name);

        return {
            title: parsed.title,
            artist: parsed.artist,
            album: 'Unknown Album',
            year: null,
            track: parsed.track,
            genre: null,
            comment: null,
            albumArt: null,
            albumArtUrl: null
        };
    }

    /**
     * Parse artist and title from filename
     */
    parseFileName(name) {
        let title = name;
        let artist = 'Unknown Artist';
        let track = null;

        // Remove extension
        title = title.replace(/\.[^/.]+$/, '');

        // Try to extract track number
        const trackMatch = title.match(/^(\d{1,3})[\s._-]+(.+)/);
        if (trackMatch) {
            track = parseInt(trackMatch[1], 10);
            title = trackMatch[2];
        }

        // Try common separators for "Artist - Title"
        const separators = [' - ', ' – ', ' — ', '_-_', ' _ '];
        for (const sep of separators) {
            if (title.includes(sep)) {
                const parts = title.split(sep);
                artist = parts[0].trim();
                title = parts.slice(1).join(sep).trim();
                break;
            }
        }

        // Clean up
        title = title.replace(/[_]/g, ' ').trim();
        artist = artist.replace(/[_]/g, ' ').trim();

        return { title, artist, track };
    }

    /**
     * Clean filename for display
     */
    cleanFileName(filename) {
        return filename
            .replace(/\.[^/.]+$/, '')  // Remove extension
            .replace(/[_-]/g, ' ')      // Replace separators
            .replace(/\s+/g, ' ')       // Normalize whitespace
            .trim();
    }

    /**
     * Update track with parsed metadata
     */
    async updateTrackMetadata(track) {
        if (!track.file) return track;

        try {
            const metadata = await this.parseFile(track.file);

            // Merge metadata into track
            track.name = metadata.title;
            track.artist = metadata.artist;
            track.album = metadata.album;
            track.year = metadata.year;
            track.trackNumber = metadata.track;
            track.genre = metadata.genre;
            track.albumArt = metadata.albumArt;
            track.albumArtUrl = metadata.albumArtUrl;

            eventBus.emit(Events.METADATA_LOADED, {
                trackId: track.id,
                metadata
            });

            return track;

        } catch (error) {
            console.warn('Metadata update failed:', error);
            return track;
        }
    }

    /**
     * Batch update metadata for multiple tracks
     */
    async updateTracksMetadata(tracks, onProgress = null) {
        const total = tracks.length;
        let completed = 0;

        for (const track of tracks) {
            await this.updateTrackMetadata(track);
            completed++;

            if (onProgress) {
                onProgress(completed, total);
            }
        }

        return tracks;
    }

    /**
     * Get default album art placeholder
     */
    getDefaultArtwork() {
        // Return data URL for default music icon
        return 'data:image/svg+xml,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
                <rect fill="#1a1a1a" width="64" height="64"/>
                <circle cx="32" cy="32" r="20" fill="none" stroke="#00f0ff" stroke-width="2"/>
                <circle cx="32" cy="32" r="8" fill="#00f0ff"/>
                <path d="M32 12 L32 32" stroke="#00f0ff" stroke-width="2"/>
            </svg>
        `);
    }

    /**
     * Clean up object URLs
     */
    revokeArtworkUrl(url) {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    }
}

// Export singleton
export const metadataParser = new MetadataParser();
export default metadataParser;
