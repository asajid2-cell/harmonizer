/**
 * SONIC ARCHITECT MK.III
 * PlaylistUI - Playlist DOM Rendering and Interaction
 *
 * Features:
 * - Track list rendering
 * - Drag and drop reordering
 * - Context menu
 * - Queue display
 * - Currently playing indicator
 */

import { eventBus, Events } from '../utils/EventBus.js';
import { playlistManager } from '../playlist/PlaylistManager.js';
import { metadataParser } from '../playlist/MetadataParser.js';

class PlaylistUI {
    constructor() {
        this.container = null;
        this.trackList = null;
        this.queueList = null;
        this.emptyState = null;
        this.countBadge = null;

        // Drag state
        this.draggedItem = null;
        this.draggedIndex = null;

        // Context menu
        this.contextMenu = null;
        this.contextMenuTarget = null;

        this.isInitialized = false;
    }

    /**
     * Initialize playlist UI
     */
    init() {
        this.container = document.getElementById('playlist');
        this.countBadge = document.getElementById('queue-count');

        if (!this.container) {
            console.warn('Playlist container not found');
            return this;
        }

        // Create structure
        this.createStructure();

        // Setup event listeners
        this.setupEventListeners();

        // Initial render
        this.render();

        this.isInitialized = true;
        console.log('📋 PlaylistUI initialized');

        return this;
    }

    /**
     * Create playlist DOM structure
     */
    createStructure() {
        this.container.innerHTML = `
            <div class="playlist__search">
                <svg class="playlist__search-icon" viewBox="0 0 24 24" width="16" height="16">
                    <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                <input type="text" class="playlist__search-input" placeholder="Search tracks...">
            </div>
            <div class="track-list" id="track-list"></div>
            <div class="playlist__empty">
                <svg class="playlist__empty-icon" viewBox="0 0 24 24" width="48" height="48">
                    <path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                </svg>
                <div class="playlist__empty-text">No tracks loaded</div>
                <div class="playlist__empty-hint">Drag & drop audio files here</div>
            </div>
            <div class="queue" id="queue-section" style="display: none;">
                <div class="queue__header">
                    <span class="queue__title">Up Next</span>
                    <span class="queue__clear" id="clear-queue">Clear</span>
                </div>
                <div class="queue__list" id="queue-list"></div>
            </div>
        `;

        this.trackList = document.getElementById('track-list');
        this.queueList = document.getElementById('queue-list');
        this.emptyState = this.container.querySelector('.playlist__empty');
        this.searchInput = this.container.querySelector('.playlist__search-input');
        this.queueSection = document.getElementById('queue-section');

        // Create context menu
        this.createContextMenu();
    }

    /**
     * Create context menu element
     */
    createContextMenu() {
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.innerHTML = `
            <div class="context-menu__item" data-action="play">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
                Play Now
            </div>
            <div class="context-menu__item" data-action="queue">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg>
                Add to Queue
            </div>
            <div class="context-menu__separator"></div>
            <div class="context-menu__item" data-action="info">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
                Track Info
            </div>
            <div class="context-menu__separator"></div>
            <div class="context-menu__item context-menu__item--danger" data-action="remove">
                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                Remove
            </div>
        `;
        this.contextMenu.style.display = 'none';
        document.body.appendChild(this.contextMenu);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Playlist events
        eventBus.on(Events.PLAYLIST_UPDATE, () => this.render());
        eventBus.on(Events.PLAYLIST_TRACK_CHANGE, (data) => this.updateCurrentTrack(data.index));
        eventBus.on(Events.QUEUE_UPDATE, () => this.renderQueue());
        eventBus.on(Events.METADATA_LOADED, (data) => this.updateTrackMetadata(data.trackId));

        // Search
        this.searchInput?.addEventListener('input', (e) => {
            this.filterTracks(e.target.value);
        });

        // Clear queue
        document.getElementById('clear-queue')?.addEventListener('click', () => {
            playlistManager.clearQueue();
        });

        // Context menu
        this.contextMenu?.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action) this.handleContextAction(action);
        });

        // Close context menu on click outside
        document.addEventListener('click', (e) => {
            if (!this.contextMenu?.contains(e.target)) {
                this.hideContextMenu();
            }
        });

        // Close context menu on scroll
        this.trackList?.addEventListener('scroll', () => {
            this.hideContextMenu();
        });
    }

    /**
     * Render full track list
     */
    render() {
        const tracks = playlistManager.getTracks();
        const currentIndex = playlistManager.getState().currentIndex;

        // Update count badge
        if (this.countBadge) {
            this.countBadge.textContent = tracks.length;
        }

        // Show/hide empty state
        if (tracks.length === 0) {
            this.emptyState.style.display = 'flex';
            this.trackList.style.display = 'none';
            return;
        }

        this.emptyState.style.display = 'none';
        this.trackList.style.display = 'block';

        // Render tracks
        this.trackList.innerHTML = tracks.map((track, index) => this.renderTrackItem(track, index, currentIndex)).join('');

        // Setup track item event listeners
        this.setupTrackItemListeners();

        // Render queue
        this.renderQueue();
    }

    /**
     * Render single track item HTML
     */
    renderTrackItem(track, index, currentIndex) {
        const isPlaying = index === currentIndex;
        const duration = this.formatDuration(track.duration);
        const artUrl = track.albumArtUrl || metadataParser.getDefaultArtwork();

        return `
            <div class="track-item ${isPlaying ? 'is-playing' : ''}"
                 data-index="${index}"
                 data-id="${track.id}"
                 draggable="true">
                <div class="track-item__number">
                    ${isPlaying ? '<div class="now-playing-bars"><span></span><span></span><span></span><span></span></div>' : index + 1}
                </div>
                <div class="track-item__art">
                    <img src="${artUrl}" alt="" loading="lazy">
                </div>
                <div class="track-item__info">
                    <div class="track-item__name">${this.escapeHtml(track.name || 'Unknown Track')}</div>
                    <div class="track-item__artist">${this.escapeHtml(track.artist || '')}</div>
                </div>
                <div class="track-item__duration">${duration}</div>
                <button class="track-item__menu btn btn--icon btn--sm">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                    </svg>
                </button>
            </div>
        `;
    }

    /**
     * Setup event listeners for track items
     */
    setupTrackItemListeners() {
        const items = this.trackList.querySelectorAll('.track-item');

        items.forEach(item => {
            // Double click to play
            item.addEventListener('dblclick', () => {
                const index = parseInt(item.dataset.index);
                playlistManager.playTrack(index);
            });

            // Context menu (right click)
            item.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.showContextMenu(e, item);
            });

            // Menu button click
            const menuBtn = item.querySelector('.track-item__menu');
            menuBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showContextMenu(e, item);
            });

            // Drag and drop
            item.addEventListener('dragstart', (e) => this.handleDragStart(e, item));
            item.addEventListener('dragend', () => this.handleDragEnd());
            item.addEventListener('dragover', (e) => this.handleDragOver(e, item));
            item.addEventListener('dragleave', (e) => this.handleDragLeave(e, item));
            item.addEventListener('drop', (e) => this.handleDrop(e, item));
        });
    }

    /**
     * Render queue section
     */
    renderQueue() {
        const queue = playlistManager.getQueue();

        if (queue.length === 0) {
            this.queueSection.style.display = 'none';
            return;
        }

        this.queueSection.style.display = 'block';

        this.queueList.innerHTML = queue.map((item, queueIndex) => `
            <div class="queue__item" data-queue-index="${queueIndex}">
                <span class="queue__item-name">${this.escapeHtml(item.track?.name || 'Unknown')}</span>
                <span class="queue__item-remove" data-action="remove-queue">&times;</span>
            </div>
        `).join('');

        // Setup queue item listeners
        this.queueList.querySelectorAll('.queue__item-remove').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                playlistManager.removeFromQueue(index);
            });
        });
    }

    /**
     * Update currently playing track indicator
     */
    updateCurrentTrack(index) {
        const items = this.trackList?.querySelectorAll('.track-item');
        if (!items) return;

        items.forEach((item, i) => {
            const isPlaying = i === index;
            item.classList.toggle('is-playing', isPlaying);

            const numberEl = item.querySelector('.track-item__number');
            if (numberEl) {
                if (isPlaying) {
                    numberEl.innerHTML = '<div class="now-playing-bars"><span></span><span></span><span></span><span></span></div>';
                } else {
                    numberEl.textContent = i + 1;
                }
            }
        });
    }

    /**
     * Update track metadata display
     */
    updateTrackMetadata(trackId) {
        const item = this.trackList?.querySelector(`[data-id="${trackId}"]`);
        if (!item) return;

        const result = playlistManager.findTrackById(trackId);
        if (!result) return;

        const { track } = result;

        const nameEl = item.querySelector('.track-item__name');
        const artistEl = item.querySelector('.track-item__artist');
        const artEl = item.querySelector('.track-item__art img');

        if (nameEl) nameEl.textContent = track.name || 'Unknown Track';
        if (artistEl) artistEl.textContent = track.artist || '';
        if (artEl && track.albumArtUrl) artEl.src = track.albumArtUrl;
    }

    /**
     * Filter tracks by search query
     */
    filterTracks(query) {
        const items = this.trackList?.querySelectorAll('.track-item');
        if (!items) return;

        const lowerQuery = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('.track-item__name')?.textContent.toLowerCase() || '';
            const artist = item.querySelector('.track-item__artist')?.textContent.toLowerCase() || '';

            const matches = !query || name.includes(lowerQuery) || artist.includes(lowerQuery);
            item.style.display = matches ? '' : 'none';
        });
    }

    /**
     * Show context menu
     */
    showContextMenu(e, item) {
        this.contextMenuTarget = item;
        this.contextMenu.style.display = 'block';

        // Position menu
        const x = e.clientX || e.pageX;
        const y = e.clientY || e.pageY;

        // Ensure menu stays within viewport
        const menuRect = this.contextMenu.getBoundingClientRect();
        const maxX = window.innerWidth - menuRect.width - 10;
        const maxY = window.innerHeight - menuRect.height - 10;

        this.contextMenu.style.left = `${Math.min(x, maxX)}px`;
        this.contextMenu.style.top = `${Math.min(y, maxY)}px`;
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
        this.contextMenuTarget = null;
    }

    /**
     * Handle context menu action
     */
    handleContextAction(action) {
        const index = parseInt(this.contextMenuTarget?.dataset.index);
        if (isNaN(index)) return;

        switch (action) {
            case 'play':
                playlistManager.playTrack(index);
                break;
            case 'queue':
                playlistManager.addToQueue(index);
                break;
            case 'info':
                this.showTrackInfo(index);
                break;
            case 'remove':
                playlistManager.removeTrack(index);
                break;
        }

        this.hideContextMenu();
    }

    /**
     * Show track info modal/tooltip
     */
    showTrackInfo(index) {
        const track = playlistManager.getTrack(index);
        if (!track) return;

        // For now, just log to console
        // Could show a modal in the future
        console.log('Track Info:', {
            name: track.name,
            artist: track.artist,
            album: track.album,
            duration: this.formatDuration(track.duration),
            size: track.size ? `${(track.size / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
            type: track.type || 'Unknown',
            dateAdded: track.dateAdded
        });

        // Show notification (if implemented)
        eventBus.emit(Events.SHOW_NOTIFICATION, {
            type: 'info',
            title: track.name,
            message: `${track.artist || 'Unknown Artist'} • ${this.formatDuration(track.duration)}`
        });
    }

    /**
     * Drag and drop handlers
     */
    handleDragStart(e, item) {
        this.draggedItem = item;
        this.draggedIndex = parseInt(item.dataset.index);
        item.classList.add('is-dragging');

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedIndex);
    }

    handleDragEnd() {
        if (this.draggedItem) {
            this.draggedItem.classList.remove('is-dragging');
        }
        this.draggedItem = null;
        this.draggedIndex = null;

        // Remove all drag-over states
        this.trackList?.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
    }

    handleDragOver(e, item) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const targetIndex = parseInt(item.dataset.index);
        if (targetIndex !== this.draggedIndex) {
            item.classList.add('drag-over');
        }
    }

    handleDragLeave(e, item) {
        item.classList.remove('drag-over');
    }

    handleDrop(e, item) {
        e.preventDefault();
        item.classList.remove('drag-over');

        const fromIndex = this.draggedIndex;
        const toIndex = parseInt(item.dataset.index);

        if (fromIndex !== null && fromIndex !== toIndex) {
            playlistManager.moveTrack(fromIndex, toIndex);
        }
    }

    /**
     * Format duration in MM:SS
     */
    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Escape HTML special characters
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Scroll to currently playing track
     */
    scrollToCurrentTrack() {
        const currentItem = this.trackList?.querySelector('.track-item.is-playing');
        if (currentItem) {
            currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.contextMenu) {
            this.contextMenu.remove();
        }
        this.isInitialized = false;
    }
}

// Export singleton
export const playlistUI = new PlaylistUI();
export default playlistUI;
