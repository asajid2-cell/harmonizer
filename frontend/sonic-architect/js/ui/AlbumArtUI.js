/**
 * SONIC ARCHITECT MK.III
 * AlbumArtUI - Album Artwork Display
 *
 * Features:
 * - Album art display with fallback
 * - Animated transitions
 * - Full-screen modal view
 * - Color extraction for theming
 */

import { eventBus, Events } from '../utils/EventBus.js';
import { metadataParser } from '../playlist/MetadataParser.js';

class AlbumArtUI {
    constructor() {
        // DOM elements
        this.container = null;
        this.image = null;
        this.placeholder = null;
        this.modal = null;

        // State
        this.currentUrl = null;
        this.isModalOpen = false;

        // Bind methods
        this.handleClick = this.handleClick.bind(this);
        this.closeModal = this.closeModal.bind(this);

        this.isInitialized = false;
    }

    /**
     * Initialize album art UI
     */
    init() {
        this.container = document.getElementById('album-art');

        if (!this.container) {
            console.warn('Album art container not found');
            return this;
        }

        // Create structure
        this.createStructure();

        // Setup event listeners
        this.setupEventListeners();

        // Set default
        this.setDefault();

        this.isInitialized = true;
        console.log('🖼️ AlbumArtUI initialized');

        return this;
    }

    /**
     * Create album art DOM structure
     */
    createStructure() {
        // Clear container
        this.container.innerHTML = '';
        this.container.classList.add('album-art');

        // Create image element
        this.image = document.createElement('img');
        this.image.className = 'album-art__image';
        this.image.alt = 'Album Art';
        this.image.loading = 'lazy';

        // Create placeholder
        this.placeholder = document.createElement('div');
        this.placeholder.className = 'album-art__placeholder';
        this.placeholder.innerHTML = `
            <svg viewBox="0 0 24 24" width="40" height="40">
                <path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
            </svg>
        `;

        // Create spinning disc effect
        const disc = document.createElement('div');
        disc.className = 'album-art__disc';

        this.container.appendChild(this.placeholder);
        this.container.appendChild(this.image);
        this.container.appendChild(disc);

        // Create modal for fullscreen view
        this.createModal();
    }

    /**
     * Create fullscreen modal
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'album-art-modal';
        this.modal.innerHTML = `
            <div class="album-art-modal__backdrop"></div>
            <div class="album-art-modal__content">
                <img class="album-art-modal__image" alt="Album Art">
                <button class="album-art-modal__close">&times;</button>
                <div class="album-art-modal__info">
                    <div class="album-art-modal__title"></div>
                    <div class="album-art-modal__artist"></div>
                    <div class="album-art-modal__album"></div>
                </div>
            </div>
        `;
        this.modal.style.display = 'none';
        document.body.appendChild(this.modal);

        // Modal close handlers
        this.modal.querySelector('.album-art-modal__backdrop')?.addEventListener('click', this.closeModal);
        this.modal.querySelector('.album-art-modal__close')?.addEventListener('click', this.closeModal);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Click for fullscreen
        this.container?.addEventListener('click', this.handleClick);

        // Track changes
        eventBus.on(Events.PLAYLIST_TRACK_CHANGE, (data) => {
            this.updateFromTrack(data.track);
        });

        // Metadata loaded
        eventBus.on(Events.METADATA_LOADED, (data) => {
            if (data.metadata.albumArtUrl) {
                this.setImage(data.metadata.albumArtUrl);
            }
        });

        // Audio load
        eventBus.on(Events.AUDIO_LOAD, (data) => {
            this.updateFromTrack(data);
        });

        // Keyboard close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen) {
                this.closeModal();
            }
        });
    }

    /**
     * Update from track data
     */
    updateFromTrack(track) {
        if (!track) {
            this.setDefault();
            return;
        }

        if (track.albumArtUrl) {
            this.setImage(track.albumArtUrl);
        } else {
            this.setDefault();
        }

        // Update modal info
        this.updateModalInfo(track);
    }

    /**
     * Set album art image
     */
    setImage(url) {
        if (url === this.currentUrl) return;

        this.currentUrl = url;

        // Preload image
        const img = new Image();
        img.onload = () => {
            this.image.src = url;
            this.image.classList.add('is-loaded');
            this.placeholder.classList.add('is-hidden');
            this.container.classList.add('has-image');

            // Extract dominant color (optional)
            // this.extractColor(img);
        };
        img.onerror = () => {
            this.setDefault();
        };
        img.src = url;
    }

    /**
     * Set default placeholder
     */
    setDefault() {
        this.currentUrl = null;
        this.image.src = '';
        this.image.classList.remove('is-loaded');
        this.placeholder.classList.remove('is-hidden');
        this.container.classList.remove('has-image');
    }

    /**
     * Handle click on album art
     */
    handleClick() {
        if (this.currentUrl) {
            this.openModal();
        }
    }

    /**
     * Open fullscreen modal
     */
    openModal() {
        if (!this.modal || !this.currentUrl) return;

        const modalImage = this.modal.querySelector('.album-art-modal__image');
        if (modalImage) {
            modalImage.src = this.currentUrl;
        }

        this.modal.style.display = 'flex';
        setTimeout(() => {
            this.modal.classList.add('is-open');
        }, 10);

        this.isModalOpen = true;
    }

    /**
     * Close fullscreen modal
     */
    closeModal() {
        if (!this.modal) return;

        this.modal.classList.remove('is-open');
        setTimeout(() => {
            this.modal.style.display = 'none';
        }, 300);

        this.isModalOpen = false;
    }

    /**
     * Update modal info
     */
    updateModalInfo(track) {
        if (!this.modal) return;

        const title = this.modal.querySelector('.album-art-modal__title');
        const artist = this.modal.querySelector('.album-art-modal__artist');
        const album = this.modal.querySelector('.album-art-modal__album');

        if (title) title.textContent = track.name || 'Unknown Track';
        if (artist) artist.textContent = track.artist || '';
        if (album) album.textContent = track.album || '';
    }

    /**
     * Extract dominant color from image (for theming)
     */
    extractColor(img) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1;
            canvas.height = 1;

            ctx.drawImage(img, 0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;

            const color = `rgb(${data[0]}, ${data[1]}, ${data[2]})`;

            eventBus.emit(Events.ALBUM_COLOR_EXTRACTED, {
                color,
                r: data[0],
                g: data[1],
                b: data[2]
            });

            return color;
        } catch (e) {
            console.warn('Color extraction failed:', e);
            return null;
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.modal) {
            this.modal.remove();
        }
        if (this.currentUrl && this.currentUrl.startsWith('blob:')) {
            URL.revokeObjectURL(this.currentUrl);
        }
        this.isInitialized = false;
    }
}

// Export singleton
export const albumArtUI = new AlbumArtUI();
export default albumArtUI;
