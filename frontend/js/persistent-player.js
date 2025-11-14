(() => {
    'use strict';

    const STORAGE_KEY = 'idcPersistentPlayerState';
    const PLAYER_STYLE_ID = 'idc-persistent-player-styles';

    const FALLBACK_TRACKS = [
        { number: '01', title: 'Moves So Sweet', artist: 'ID Chief', durationLabel: '3:14', file: 'assets/audio/moves-so-sweet.wav' },
        { number: '02', title: 'Tigerstyle', artist: 'Aloe Island Posse', durationLabel: '2:58', file: 'assets/audio/tigerstyle.wav' },
        { number: '03', title: 'Kotori', artist: 'コンシャスTHOUGHTS', durationLabel: '3:28', file: 'assets/audio/kotori.wav' },
        { number: '04', title: 'Smile', artist: 'ID Chief x Aloe Island Posse', durationLabel: '3:21', file: 'assets/audio/smile.wav' },
        { number: '05', title: "Maybe I'm Dreaming", artist: 'コンシャスTHOUGHTS x ID Chief', durationLabel: '4:04', file: 'assets/audio/maybe-im-dreaming.wav' },
        { number: '06', title: 'Refreshing', artist: 'コンシャスTHOUGHTS x Aloe Island Posse', durationLabel: '2:40', file: 'assets/audio/refreshing.wav' },
        { number: '07', title: 'Our Love', artist: 'Aloe Island Posse', durationLabel: '2:30', file: 'assets/audio/our-love.wav' },
        { number: '08', title: 'Visions of You', artist: 'コンシャスTHOUGHTS', durationLabel: '3:14', file: 'assets/audio/visions-of-you.wav' },
        { number: '09', title: 'Me & You', artist: 'ID Chief', durationLabel: '3:21', file: 'assets/audio/me-and-you.wav' },
        { number: '10', title: 'Space Cowboys', artist: 'コンシャスTHOUGHTS x ID Chief x Aloe Island Posse', durationLabel: '4:20', file: 'assets/audio/space-cowboys.wav' },
    ];

    const scriptEl = document.currentScript || document.querySelector('script[src*="persistent-player.js"]');
    const FRONTEND_ROOT = (() => {
        if (!scriptEl) {
            return document.baseURI || window.location.href;
        }
        const cleaned = scriptEl.src.replace(/js\/persistent-player\.js(?:\?.*)?$/, '');
        return cleaned.endsWith('/') ? cleaned : `${cleaned}`;
    })();

    const resolveAsset = (path) => {
        if (!path) return path;
        if (/^https?:\/\//i.test(path)) {
            return path;
        }
        const normalized = path.startsWith('/') ? path.slice(1) : path.replace(/^\.\//, '');
        return new URL(normalized, FRONTEND_ROOT).href;
    };

    const ready = (cb) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cb, { once: true });
        } else {
            cb();
        }
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const formatTime = (totalSeconds) => {
        if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
            return '0:00';
        }
        const seconds = Math.floor(totalSeconds % 60);
        const minutes = Math.floor(totalSeconds / 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    const parseDurationLabel = (label) => {
        if (!label || typeof label !== 'string') return null;
        const parts = label.split(':').map((part) => parseInt(part, 10));
        if (parts.some((n) => Number.isNaN(n))) return null;
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1];
        }
        return parts[0];
    };

    FALLBACK_TRACKS.forEach((track) => {
        track.durationSeconds = parseDurationLabel(track.durationLabel);
    });

    const safeStorage = {
        get(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to read storage', err);
                return null;
            }
        },
        set(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to persist state', err);
            }
        },
        remove(key) {
            try {
                window.localStorage.removeItem(key);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to remove state', err);
            }
        },
    };

    if (window.__idcPersistentPlayerInitialized) {
        return;
    }
    window.__idcPersistentPlayerInitialized = true;

    class PersistentPlayer {
        constructor() {
            this.blocked = document.body?.dataset?.disablePersistentPlayer === 'true';
            this.trackRegistry = new Map();
            this.catalogOrder = [];
            this.inlineObserver = null;
            this.inlineActive = null;
            this.playbackOwner = 'deck';
            this.lastInlinePersist = 0;
            this.handoffInProgress = false;
            this.pendingSet = null;

            this.state = this.readState();
            const storedSettings = this.state?.playbackSettings || {};
            this.playbackSettings = {
                shuffle: storedSettings.shuffle !== undefined ? storedSettings.shuffle : true,
                repeatAll: storedSettings.repeatAll ?? false,
                loopOne: storedSettings.loopOne ?? false,
            };
            this.volume = typeof this.state?.volume === 'number' ? clamp(this.state.volume, 0, 1) : 0.9;
            this.uiState = this.state?.uiState || {};
            this.minimized = !!this.uiState.minimized;
            this.autoStartAttempted = false;

            if (this.blocked) {
                safeStorage.remove(STORAGE_KEY);
                return;
            }

            this.injectStyles();
            this.buildUI();
            this.setupAudio();
            this.bindUIEvents();
            this.bindStorageEvents();
            this.buildCatalog();
            this.setupInlineIntegration();
            this.restoreFromState();
            this.applyMinimizeState(this.minimized);
            this.maybeAutoplayFromHome();
        }

        injectStyles() {
            if (document.getElementById(PLAYER_STYLE_ID)) {
                return;
            }
            const styles = document.createElement('style');
            styles.id = PLAYER_STYLE_ID;
            styles.textContent = `
#persistent-audio-deck {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: min(380px, calc(100vw - 32px));
    padding: 18px 20px 20px;
    background: rgba(6, 8, 15, 0.96);
    border: 1px solid rgba(0, 255, 170, 0.4);
    border-radius: 20px;
    box-shadow: 0 20px 42px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(18px);
    color: #f2fff7;
    font-family: "JetBrains Mono", "IBM Plex Mono", system-ui, sans-serif;
    z-index: 9999;
    transition: opacity 180ms ease, transform 180ms ease;
}
#persistent-audio-deck[data-visible="false"] {
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
}
#persistent-audio-deck[data-inline-visible="true"] {
    opacity: 0.35;
    pointer-events: auto;
    transform: translateY(8px);
}
#persistent-audio-deck[data-inline-visible="true"]::after {
    content: 'Inline player active';
    position: absolute;
    top: 6px;
    right: 20px;
    font-size: 0.6rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
}
#persistent-audio-deck header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
#persistent-audio-deck .player-meta {
    display: grid;
    gap: 2px;
}
#persistent-audio-deck .player-meta__label {
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 0.58rem;
    color: rgba(0, 255, 213, 0.65);
}
#persistent-audio-deck .player-meta__title {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.08em;
}
#persistent-audio-deck .player-meta__artist {
    font-size: 0.82rem;
    color: rgba(255, 255, 255, 0.75);
}
#persistent-audio-deck .player-actions {
    display: flex;
    align-items: center;
    gap: 6px;
}
#persistent-audio-deck button {
    font-family: inherit;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
}
#persistent-audio-deck .player-minimize {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.85rem;
}
#persistent-audio-deck .player-close {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
}
#persistent-audio-deck .player-controls {
    margin: 12px 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
#persistent-audio-deck .player-controls button {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(0, 255, 170, 0.35);
    background: rgba(4, 20, 28, 0.6);
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
}
#persistent-audio-deck .player-controls button[data-action="toggle"] {
    flex: 2;
    background: linear-gradient(120deg, rgba(0, 255, 170, 0.9), rgba(0, 169, 255, 0.9));
    color: #041410;
    font-weight: 600;
    box-shadow: 0 8px 18px rgba(0, 169, 255, 0.25);
}
#persistent-audio-deck[data-playing="true"] .player-controls button[data-action="toggle"]::after {
    content: 'Pause';
}
#persistent-audio-deck[data-playing="false"] .player-controls button[data-action="toggle"]::after {
    content: 'Play';
}
#persistent-audio-deck .player-progress {
    display: grid;
    gap: 6px;
    margin-bottom: 10px;
}
#persistent-audio-deck .player-progress input[type="range"] {
    width: 100%;
    accent-color: #00ffd5;
}
#persistent-audio-deck .player-times {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.75);
}
#persistent-audio-deck .player-modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
}
#persistent-audio-deck .player-modes button {
    padding: 8px 6px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
}
#persistent-audio-deck .player-modes button[aria-pressed="true"] {
    background: linear-gradient(120deg, rgba(0, 255, 213, 0.24), rgba(0, 123, 255, 0.24));
    border-color: rgba(0, 255, 213, 0.5);
    color: #e9fff8;
    box-shadow: 0 6px 14px rgba(0, 140, 255, 0.25);
}
#persistent-audio-deck .player-volume {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.7);
}
#persistent-audio-deck .player-volume input[type="range"] {
    flex: 1;
    accent-color: #00ffd5;
}
#persistent-audio-deck[data-minimized="true"] {
    padding: 10px 14px;
    width: auto;
    min-width: 240px;
}
#persistent-audio-deck[data-minimized="true"] header {
    margin-bottom: 0;
}
#persistent-audio-deck[data-minimized="true"] .player-controls,
#persistent-audio-deck[data-minimized="true"] .player-progress,
#persistent-audio-deck[data-minimized="true"] .player-modes,
#persistent-audio-deck[data-minimized="true"] .player-volume {
    display: none;
}
#persistent-audio-deck[data-minimized="true"] .player-meta__title {
    font-size: 0.9rem;
}
#persistent-audio-deck[data-minimized="true"] .player-meta__artist {
    font-size: 0.7rem;
}
@media (max-width: 620px) {
    #persistent-audio-deck {
        left: 16px;
        right: 16px;
        width: auto;
    }
}
            `;
            document.head.appendChild(styles);
        }

        buildUI() {
            this.root = document.createElement('section');
            this.root.id = 'persistent-audio-deck';
            this.root.setAttribute('role', 'complementary');
            this.root.setAttribute('aria-label', 'Floating music player');
            this.root.dataset.visible = 'false';
            this.root.dataset.playing = 'false';
            this.root.dataset.inlineVisible = 'false';
            this.root.innerHTML = `
                <header>
                    <div class="player-meta">
                        <span class="player-meta__label">Now Playing</span>
                        <span class="player-meta__title" data-player-title>&mdash;</span>
                        <span class="player-meta__artist" data-player-artist></span>
                    </div>
                    <div class="player-actions">
                        <button type="button" class="player-minimize" aria-label="Minimize player" data-player-minimize>&#8211;</button>
                        <button type="button" class="player-close" aria-label="Close player" data-player-close>&times;</button>
                    </div>
                </header>
                <div class="player-controls">
                    <button type="button" data-action="rewind" aria-label="Rewind 10 seconds">&minus;10s</button>
                    <button type="button" data-action="toggle" aria-label="Play or pause"></button>
                    <button type="button" data-action="forward" aria-label="Skip ahead 10 seconds">+10s</button>
                </div>
                <div class="player-progress">
                    <input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek within track" data-player-seek>
                    <div class="player-times">
                        <span data-player-current>0:00</span>
                        <span data-player-duration>0:00</span>
                    </div>
                </div>
                <div class="player-modes">
                    <button type="button" data-action="shuffle" aria-pressed="false">Shuffle</button>
                    <button type="button" data-action="repeat" aria-pressed="false">Repeat</button>
                    <button type="button" data-action="loop" aria-pressed="false">Loop</button>
                </div>
                <div class="player-volume">
                    <span>Volume</span>
                    <input type="range" min="0" max="1" step="0.01" value="${this.volume.toFixed(2)}" data-player-volume>
                </div>
            `;
            document.body.appendChild(this.root);
            this.root.dataset.minimized = this.minimized ? 'true' : 'false';
            this.titleEl = this.root.querySelector('[data-player-title]');
            this.artistEl = this.root.querySelector('[data-player-artist]');
            this.seekInput = this.root.querySelector('[data-player-seek]');
            this.currentTimeEl = this.root.querySelector('[data-player-current]');
            this.durationEl = this.root.querySelector('[data-player-duration]');
            this.closeButton = this.root.querySelector('[data-player-close]');
            this.minimizeButton = this.root.querySelector('[data-player-minimize]');
            this.modeButtons = {
                shuffle: this.root.querySelector('[data-action="shuffle"]'),
                repeat: this.root.querySelector('[data-action="repeat"]'),
                loop: this.root.querySelector('[data-action="loop"]'),
            };
            this.volumeSlider = this.root.querySelector('[data-player-volume]');
            this.updateModeButtons();
            this.updateMinimizeUI();
        }

        setupAudio() {
            this.audio = document.createElement('audio');
            this.audio.preload = 'auto';
            this.audio.autoplay = false;
            this.audio.playsInline = true;
            this.audio.crossOrigin = 'anonymous';
            this.audio.loop = false;
            this.audio.volume = this.volume;
            this.audio.dataset.role = 'persistent-player-audio';
            this.audio.style.display = 'none';
            (this.root || document.body).appendChild(this.audio);
            this.audio.addEventListener('timeupdate', () => this.handleTimeUpdate());
            this.audio.addEventListener('loadedmetadata', () => this.handleLoadedMetadata());
            this.audio.addEventListener('ended', () => this.handleEnded());
            this.audio.addEventListener('play', () => this.updatePlaybackState());
            this.audio.addEventListener('pause', () => this.updatePlaybackState());
        }

        bindUIEvents() {
            this.root.querySelector('[data-action="toggle"]').addEventListener('click', () => this.togglePlayback());
            this.root.querySelector('[data-action="rewind"]').addEventListener('click', () => this.nudgePlayback(-10));
            this.root.querySelector('[data-action="forward"]').addEventListener('click', () => this.nudgePlayback(10));
            this.seekInput.addEventListener('input', (event) => this.previewSeek(event.target.value));
            this.seekInput.addEventListener('change', (event) => this.commitSeek(event.target.value));
            this.closeButton.addEventListener('click', () => this.stopAndHide());
            if (this.minimizeButton) {
                this.minimizeButton.addEventListener('click', () => this.toggleMinimize());
            }
            this.modeButtons.shuffle.addEventListener('click', () => this.toggleMode('shuffle'));
            this.modeButtons.repeat.addEventListener('click', () => this.toggleMode('repeat'));
            this.modeButtons.loop.addEventListener('click', () => this.toggleMode('loop'));
            this.volumeSlider.addEventListener('input', (event) => this.setVolume(parseFloat(event.target.value)));
        }

        bindStorageEvents() {
            window.addEventListener('storage', (event) => {
                if (event.key !== STORAGE_KEY) return;
                this.state = this.readState();
                if (!this.state?.src) {
                    this.stopAndHide();
                    return;
                }
                const incomingSettings = this.state?.playbackSettings || {};
                this.playbackSettings = {
                    shuffle: incomingSettings.shuffle !== undefined ? incomingSettings.shuffle : true,
                    repeatAll: incomingSettings.repeatAll ?? false,
                    loopOne: incomingSettings.loopOne ?? false,
                };
                this.updateModeButtons();
                this.volume = typeof this.state.volume === 'number' ? clamp(this.state.volume, 0, 1) : this.volume;
                this.applyVolume();
                this.applyMinimizeState(!!(this.state?.uiState?.minimized));
                this.restoreFromState();
            });
        }

        toggleMinimize(force) {
            if (!this.root) return;
            const next = typeof force === 'boolean' ? force : this.root.dataset.minimized !== 'true';
            this.root.dataset.minimized = next ? 'true' : 'false';
            this.updateMinimizeUI();
            this.persistState();
        }

        updateMinimizeUI() {
            if (!this.minimizeButton || !this.root) return;
            const minimized = this.root.dataset.minimized === 'true';
            this.minimizeButton.innerHTML = minimized ? '&#9633;' : '&#8211;';
            this.minimizeButton.setAttribute('aria-label', minimized ? 'Restore player' : 'Minimize player');
        }

        applyMinimizeState(isMinimized) {
            if (!this.root) return;
            this.root.dataset.minimized = isMinimized ? 'true' : 'false';
            this.updateMinimizeUI();
        }

        buildCatalog() {
            const trackItems = document.querySelectorAll('.track-list .track-item');
            if (!trackItems.length) {
                FALLBACK_TRACKS.forEach((track, index) => {
                    const meta = {
                        trackNumber: track.number || String(index + 1).padStart(2, '0'),
                        title: track.title,
                        artist: track.artist,
                        durationLabel: track.durationLabel,
                        durationSeconds: track.durationSeconds,
                        src: resolveAsset(track.file),
                    };
                    this.registerMeta(meta);
                });
                return;
            }

            trackItems.forEach((trackItem, index) => {
                const audioEl = trackItem.querySelector('.audio-player audio');
                const sourceEl = audioEl?.querySelector('source');
                const src =
                    (sourceEl && sourceEl.getAttribute('src')) ?
                        new URL(sourceEl.getAttribute('src'), document.baseURI).href :
                        (audioEl?.currentSrc || '');
                const title = trackItem.querySelector('.track-title')?.textContent?.trim() ?? `Track ${index + 1}`;
                const artist = trackItem.querySelector('.track-artist')?.textContent?.trim() ?? '';
                const durationLabel = trackItem.querySelector('.track-duration')?.textContent?.trim() ?? '';
                const trackNumber = trackItem.querySelector('.track-number')?.textContent?.trim() ?? String(index + 1).padStart(2, '0');
                const meta = {
                    trackNumber,
                    title,
                    artist,
                    durationLabel,
                    durationSeconds: parseDurationLabel(durationLabel),
                    src,
                    inlineAudio: audioEl,
                    trackElement: trackItem,
                };
                if (trackItem) {
                    trackItem.dataset.persistentSrc = src;
                }
                if (audioEl) {
                    audioEl.dataset.persistentSrc = src;
                }
                this.registerMeta(meta);
            });
        }

        registerMeta(meta) {
            if (!meta?.src) {
                return;
            }
            if (!this.trackRegistry.has(meta.src)) {
                this.catalogOrder.push(meta);
            }
            this.trackRegistry.set(meta.src, meta);
        }

        setupInlineIntegration() {
            const inlineMetas = this.catalogOrder.filter((meta) => meta.inlineAudio);
            if (!inlineMetas.length) {
                return;
            }
            this.inlineObserver = new IntersectionObserver((entries) => this.handleIntersection(entries), {
                threshold: 0.35,
            });
            inlineMetas.forEach((meta) => {
                const { inlineAudio, trackElement } = meta;
                if (trackElement) {
                    this.inlineObserver.observe(trackElement);
                }
                inlineAudio.addEventListener('play', () => this.handleInlinePlay(meta));
                inlineAudio.addEventListener('pause', () => this.handleInlinePause(meta));
                inlineAudio.addEventListener('timeupdate', () => this.syncInlineProgress(meta));
                inlineAudio.addEventListener('volumechange', () => this.syncInlineVolume(meta));
            });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    this.forceDeckForNavigation();
                }
            });
            window.addEventListener('pagehide', () => this.forceDeckForNavigation());
        }

        handleIntersection(entries) {
            entries.forEach((entry) => {
                const src = entry.target.dataset?.persistentSrc;
                const meta = src ? this.trackRegistry.get(src) : null;
                if (!meta) return;
                meta.isVisible = entry.isIntersecting;

                if (this.inlineActive === meta && this.playbackOwner === 'inline' && !entry.isIntersecting) {
                    this.handoffInlineToDeck(meta);
                }
                if (entry.isIntersecting && this.playbackOwner === 'deck' && this.state?.src === meta.src) {
                    this.handoffDeckToInline(meta);
                }
            });
        }

        handleInlinePlay(meta) {
            if (!meta?.inlineAudio) return;
            this.inlineActive = meta;
            this.playbackOwner = 'inline';
            this.ensureState(meta);
            this.state.source = 'inline';
            this.state.currentTime = meta.inlineAudio.currentTime || 0;
            this.state.isPlaying = true;
            this.state.trackIndex = this.resolveTrackIndex(meta.src);
            this.persistState();
            this.audio.pause();
            this.root.dataset.inlineVisible = meta.isVisible ? 'true' : 'false';
        }

        handleInlinePause(meta) {
            if (!meta?.inlineAudio) return;
            if (this.playbackOwner !== 'inline' || this.inlineActive !== meta) {
                return;
            }
            this.ensureState(meta);
            this.state.isPlaying = !meta.inlineAudio.paused;
            this.state.currentTime = meta.inlineAudio.currentTime || 0;
            this.persistState();
        }

        syncInlineVolume(meta) {
            if (!meta?.inlineAudio) return;
            if (this.inlineActive === meta && this.playbackOwner === 'inline') {
                const nextVolume = clamp(meta.inlineAudio.volume, 0, 1);
                this.volume = nextVolume;
                this.applyVolume({ skipInline: true });
            }
        }

        syncInlineProgress(meta) {
            if (!meta?.inlineAudio) return;
            if (this.inlineActive !== meta) return;
            const now = Date.now();
            if (now - this.lastInlinePersist < 400) return;
            this.lastInlinePersist = now;
            this.ensureState(meta);
            this.state.currentTime = meta.inlineAudio.currentTime || 0;
            this.state.isPlaying = !meta.inlineAudio.paused;
            this.persistState();
        }

        forceDeckForNavigation() {
            if (this.playbackOwner !== 'inline' || !this.inlineActive?.inlineAudio) {
                return;
            }
            this.handoffInlineToDeck(this.inlineActive, { muteDuringTransfer: true });
        }

        handoffInlineToDeck(meta, options = {}) {
            if (!meta?.inlineAudio || this.handoffInProgress) return;
            if (this.playbackOwner === 'deck' && this.state?.src === meta.src) {
                return;
            }
            this.handoffInProgress = true;
            const resumeTime = meta.inlineAudio.currentTime || 0;
            const shouldPlay = !meta.inlineAudio.paused;
            const muteDuringTransfer = options.muteDuringTransfer ?? true;
            if (muteDuringTransfer) {
                this.audio.muted = true;
            }
            this.playbackOwner = 'deck';
            this.ensureState(meta);
            this.setTrack(meta, { startTime: resumeTime, autoPlay: shouldPlay })
                .then(() => {
                    if (!meta.inlineAudio.paused) {
                        meta.inlineAudio.pause();
                    }
                    this.inlineActive = null;
                    this.root.dataset.inlineVisible = 'false';
                })
                .finally(() => {
                    this.audio.muted = false;
                    this.handoffInProgress = false;
                });
        }

        handoffDeckToInline(meta) {
            if (!meta?.inlineAudio || this.handoffInProgress) return;
            if (this.playbackOwner === 'inline') return;
            this.handoffInProgress = true;
            const resumeTime = this.audio.currentTime || this.state?.currentTime || 0;
            const shouldPlay = !this.audio.paused && this.state?.isPlaying !== false;
            meta.inlineAudio.currentTime = resumeTime;
            meta.inlineAudio.volume = this.volume;
            const finalize = () => {
                this.inlineActive = meta;
                this.playbackOwner = 'inline';
                this.root.dataset.inlineVisible = 'true';
                this.audio.pause();
                this.handoffInProgress = false;
            };
            if (shouldPlay) {
                meta.inlineAudio.play()
                    .then(finalize)
                    .catch(() => {
                        this.playbackOwner = 'deck';
                        this.root.dataset.inlineVisible = 'false';
                        this.handoffInProgress = false;
                    });
            } else {
                finalize();
            }
        }

        ensureState(meta) {
            if (!meta) return;
            const base = this.state || {};
            this.state = {
                ...base,
                src: meta.src,
                title: meta.title,
                artist: meta.artist,
                durationSeconds: meta.durationSeconds,
                durationLabel: meta.durationLabel,
                trackNumber: meta.trackNumber,
                trackIndex: this.resolveTrackIndex(meta.src),
            };
        }

        resolveTrackIndex(src) {
            if (!src) return -1;
            return this.catalogOrder.findIndex((entry) => entry.src === src);
        }

        restoreFromState() {
            if (!this.state?.src) return;
            const meta = this.trackRegistry.get(this.state.src) || this.state;
            this.ensureState(meta);
            this.volume = typeof this.state.volume === 'number' ? clamp(this.state.volume, 0, 1) : this.volume;
            this.applyVolume();
            this.minimized = !!(this.state?.uiState?.minimized);
            this.applyMinimizeState(this.minimized);
            this.showUI();
            this.renderMetadata();
            const shouldResume = this.state.isPlaying !== false;
            const startTime = this.state.currentTime || 0;
            this.setTrack(meta, { startTime, autoPlay: shouldResume }).then(() => {
                if (!shouldResume) {
                    this.audio.pause();
                }
                this.updatePlaybackState();
            });
        }

        setTrack(meta, options = {}) {
            if (!meta?.src) return Promise.resolve();
            const { startTime = 0, autoPlay = true } = options;
            const normalizedStart = Number.isFinite(startTime) ? Math.max(0, startTime) : 0;

            if (this.pendingSet && this.pendingSet.src === meta.src) {
                const delta = Math.abs(this.pendingSet.startTime - normalizedStart);
                if (delta < 0.1 && this.pendingSet.autoPlay === autoPlay) {
                    return this.pendingSet.promise;
                }
            }

            this.ensureState(meta);
            this.state.currentTime = normalizedStart;
            this.state.isPlaying = autoPlay;
            this.state.trackIndex = this.resolveTrackIndex(meta.src);
            this.persistState();
            this.showUI();
            this.renderMetadata();
            this.pendingSeek = normalizedStart;

            const attemptPlay = () => {
                if (!autoPlay) {
                    this.audio.pause();
                    this.persistState({ isPlaying: false, currentTime: this.audio.currentTime });
                    return Promise.resolve();
                }
                return this.audio.play()
                    .then(() => {
                        this.persistState({ isPlaying: true, currentTime: this.audio.currentTime });
                    })
                    .catch((err) => {
                        console.warn('[PersistentPlayer] Play failed', err);
                        this.persistState({ isPlaying: false });
                    });
            };

            const seekIfNeeded = () => {
                const delta = Math.abs((this.audio.currentTime || 0) - normalizedStart);
                if (delta > 0.25) {
                    try {
                        this.audio.currentTime = normalizedStart;
                    } catch (err) {
                        console.warn('[PersistentPlayer] Unable to seek existing source', err);
                    }
                }
            };

            if (this.audio.src === meta.src && this.audio.readyState >= 1) {
                seekIfNeeded();
                this.pendingSet = null;
                return attemptPlay();
            }

            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            this.audio.src = meta.src;

            const pending = new Promise((resolve) => {
                const cleanup = () => {
                    this.audio.removeEventListener('loadedmetadata', handleMeta);
                    this.audio.removeEventListener('error', handleError);
                    this.pendingSet = null;
                };
                const handleMeta = () => {
                    cleanup();
                    attemptPlay().finally(resolve);
                };
                const handleError = () => {
                    cleanup();
                    resolve();
                };
                this.audio.addEventListener('loadedmetadata', handleMeta, { once: true });
                this.audio.addEventListener('error', handleError, { once: true });
            });

            this.pendingSet = {
                src: meta.src,
                startTime: normalizedStart,
                autoPlay,
                promise: pending,
            };

            return pending;
        }

        showUI() {
            this.root.dataset.visible = 'true';
            if (this.playbackOwner === 'inline' && this.inlineActive?.isVisible) {
                this.root.dataset.inlineVisible = 'true';
            } else {
                this.root.dataset.inlineVisible = 'false';
            }
        }

        renderMetadata() {
            if (!this.state) return;
            this.titleEl.textContent = this.state.title || 'Untitled Track';
            const artistParts = [];
            if (this.state.trackNumber) {
                artistParts.push(`#${this.state.trackNumber}`);
            }
            if (this.state.artist) {
                artistParts.push(this.state.artist);
            }
            this.artistEl.textContent = artistParts.join(' × ');
        }

        handleTimeUpdate() {
            this.updateProgressUI();
            if (this.state) {
                this.persistState({ currentTime: this.audio.currentTime });
            }
        }

        handleLoadedMetadata() {
            if (typeof this.pendingSeek === 'number' && Number.isFinite(this.pendingSeek)) {
                try {
                    this.audio.currentTime = this.pendingSeek;
                } catch (err) {
                    console.warn('[PersistentPlayer] Unable to seek to stored position', err);
                }
                this.pendingSeek = null;
            }
            this.updateProgressUI();
        }

        handleEnded() {
            if (this.playbackSettings.loopOne) {
                this.setTrack(this.trackRegistry.get(this.state?.src) || this.state, { startTime: 0, autoPlay: true });
                return;
            }
            const nextMeta = this.getNextTrack(1);
            if (nextMeta) {
                this.setTrack(nextMeta, { startTime: 0, autoPlay: true });
                return;
            }
            this.persistState({ isPlaying: false, currentTime: this.audio.duration || 0 });
            this.root.dataset.playing = 'false';
        }

        getNextTrack(step = 1) {
            if (!this.catalogOrder.length) return null;
            const currentIndex = this.resolveTrackIndex(this.state?.src);
            if (this.playbackSettings.shuffle) {
                if (this.catalogOrder.length === 1) {
                    return this.catalogOrder[0];
                }
                let nextIndex = currentIndex;
                while (nextIndex === currentIndex) {
                    nextIndex = Math.floor(Math.random() * this.catalogOrder.length);
                }
                return this.catalogOrder[nextIndex];
            }
            let nextIndex = currentIndex + step;
            if (nextIndex >= this.catalogOrder.length) {
                if (this.playbackSettings.repeatAll) {
                    nextIndex = 0;
                } else {
                    return null;
                }
            }
            if (nextIndex < 0) {
                if (this.playbackSettings.repeatAll) {
                    nextIndex = this.catalogOrder.length - 1;
                } else {
                    return null;
                }
            }
            return this.catalogOrder[nextIndex] || null;
        }

        updateProgressUI() {
            const duration = this.audio.duration && Number.isFinite(this.audio.duration)
                ? this.audio.duration
                : this.state?.durationSeconds || null;
            const current = this.audio.currentTime || 0;
            if (duration) {
                const value = Math.max(0, Math.min(1000, Math.round((current / duration) * 1000)));
                this.seekInput.disabled = false;
                this.seekInput.value = String(value);
                this.durationEl.textContent = formatTime(duration);
            } else {
                this.seekInput.disabled = true;
            }
            this.currentTimeEl.textContent = formatTime(current);
        }

        previewSeek(value) {
            const duration = this.audio.duration && Number.isFinite(this.audio.duration)
                ? this.audio.duration
                : this.state?.durationSeconds || null;
            if (!duration) return;
            const percent = Number(value) / 1000;
            const preview = duration * percent;
            this.currentTimeEl.textContent = formatTime(preview);
        }

        commitSeek(value) {
            const duration = this.audio.duration && Number.isFinite(this.audio.duration)
                ? this.audio.duration
                : this.state?.durationSeconds || null;
            if (!duration) return;
            const percent = Number(value) / 1000;
            const nextTime = duration * percent;
            this.audio.currentTime = nextTime;
            this.persistState({ currentTime: nextTime });
        }

        nudgePlayback(delta) {
            if (!this.state?.src) return;
            const next = Math.max(0, (this.audio.currentTime || 0) + delta);
            this.audio.currentTime = next;
            this.persistState({ currentTime: next });
        }

        togglePlayback() {
            if (!this.state?.src) return;
            if (this.audio.paused) {
                this.audio.play().catch((err) => console.warn('[PersistentPlayer] Play failed', err));
            } else {
                this.audio.pause();
            }
        }

        toggleMode(mode) {
            if (mode === 'shuffle') {
                this.playbackSettings.shuffle = !this.playbackSettings.shuffle;
            } else if (mode === 'repeat') {
                this.playbackSettings.repeatAll = !this.playbackSettings.repeatAll;
            } else if (mode === 'loop') {
                this.playbackSettings.loopOne = !this.playbackSettings.loopOne;
            }
            this.updateModeButtons();
            this.persistState();
        }

        updateModeButtons() {
            if (!this.modeButtons) return;
            this.modeButtons.shuffle.setAttribute('aria-pressed', this.playbackSettings.shuffle ? 'true' : 'false');
            this.modeButtons.repeat.setAttribute('aria-pressed', this.playbackSettings.repeatAll ? 'true' : 'false');
            this.modeButtons.loop.setAttribute('aria-pressed', this.playbackSettings.loopOne ? 'true' : 'false');
        }

        setVolume(value, options = {}) {
            const nextVolume = clamp(Number.isFinite(value) ? value : this.volume, 0, 1);
            this.volume = nextVolume;
            this.applyVolume({ skipInline: options.skipInline });
            this.persistState({ volume: this.volume });
        }

        applyVolume(options = {}) {
            if (this.volumeSlider && !options.skipSlider) {
                this.volumeSlider.value = this.volume.toFixed(2);
            }
            if (this.audio) {
                this.audio.volume = this.volume;
            }
            if (!options.skipInline && this.inlineActive?.inlineAudio) {
                this.inlineActive.inlineAudio.volume = this.volume;
            }
        }

        updatePlaybackState() {
            const isPlaying = !this.audio.paused && !this.audio.ended;
            this.root.dataset.playing = isPlaying ? 'true' : 'false';
            if (this.state) {
                this.persistState({ isPlaying, currentTime: this.audio.currentTime });
            }
        }

        persistState(partial = {}) {
            this.state = this.state || {};
            const next = {
                ...this.state,
                ...partial,
                updatedAt: Date.now(),
                playbackSettings: this.playbackSettings,
                volume: this.volume,
                uiState: {
                    minimized: this.root?.dataset?.minimized === 'true',
                },
            };
            this.state = next;
            safeStorage.set(STORAGE_KEY, JSON.stringify(next));
            this.highlightActiveTrack();
        }

        readState() {
            const raw = safeStorage.get(STORAGE_KEY);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to parse stored state', err);
                return null;
            }
        }

        highlightActiveTrack() {
            document.querySelectorAll('.track-item[data-persistent-active="true"]').forEach((el) => {
                el.removeAttribute('data-persistent-active');
            });
            if (!this.state?.src) return;
            const meta = this.trackRegistry.get(this.state.src);
            if (meta?.trackElement) {
                meta.trackElement.setAttribute('data-persistent-active', 'true');
            }
        }

        stopAndHide() {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            this.root.dataset.visible = 'false';
            this.root.dataset.playing = 'false';
            this.root.dataset.inlineVisible = 'false';
            this.applyMinimizeState(false);
            this.inlineActive = null;
            this.playbackOwner = 'deck';
            safeStorage.remove(STORAGE_KEY);
            this.state = null;
            document.querySelectorAll('.track-item[data-persistent-active="true"]').forEach((el) => {
                el.removeAttribute('data-persistent-active');
            });
            // Re-show the play button on homepage
            this.autoStartAttempted = false;
            this.showPlayButtonIfHome();
        }

        maybeAutoplayFromHome() {
            if (this.autoStartAttempted) return;
            if (!this.isHomePage()) return;
            if (this.state?.src) return;
            if (!this.catalogOrder.length) return;

            this.showPlayButtonIfHome();
        }

        showPlayButtonIfHome() {
            if (!this.isHomePage()) return;
            if (this.state?.src) return;
            if (!this.catalogOrder.length) return;

            // Remove existing button if present
            const existing = document.getElementById('autoplay-trigger');
            if (existing) existing.remove();

            // Find the credits section to inject the button
            const creditsSection = document.querySelector('.retro-credits');
            if (!creditsSection) return;

            // Create an autoplay trigger button
            const autoplayTrigger = document.createElement('button');
            autoplayTrigger.id = 'autoplay-trigger';
            autoplayTrigger.textContent = '► PLAY';
            autoplayTrigger.setAttribute('aria-label', 'Start playing music');

            // Add styles if not already present
            if (!document.getElementById('autoplay-trigger-styles')) {
                const style = document.createElement('style');
                style.id = 'autoplay-trigger-styles';
                style.textContent = `
                    #autoplay-trigger {
                        display: inline-block;
                        margin-top: 16px;
                        padding: 8px 20px;
                        background: transparent;
                        color: #66d9ff;
                        border: 2px solid #66d9ff;
                        font-family: Courier New, monospace;
                        font-size: 16px;
                        font-weight: normal;
                        letter-spacing: 0.12em;
                        text-transform: uppercase;
                        cursor: pointer;
                        transition: all 0.3s ease;
                        box-shadow: 0 0 10px rgba(102, 217, 255, 0.3);
                        animation: buttonGlow 2s ease-in-out infinite;
                    }
                    @keyframes buttonGlow {
                        0%, 100% {
                            box-shadow: 0 0 10px rgba(102, 217, 255, 0.3);
                            text-shadow: 0 0 8px rgba(102, 217, 255, 0.5);
                        }
                        50% {
                            box-shadow: 0 0 20px rgba(102, 217, 255, 0.6);
                            text-shadow: 0 0 12px rgba(102, 217, 255, 0.8);
                        }
                    }
                    #autoplay-trigger:hover {
                        color: #3f9;
                        border-color: #3f9;
                        box-shadow: 0 0 20px rgba(51, 255, 153, 0.5);
                        text-shadow: 0 0 12px rgba(51, 255, 153, 0.8);
                    }
                    #autoplay-trigger:active {
                        transform: scale(0.98);
                    }
                `;
                document.head.appendChild(style);
            }

            autoplayTrigger.addEventListener('click', () => {
                this.autoStartAttempted = true;
                this.playbackSettings.shuffle = true;
                this.updateModeButtons();
                this.persistState();
                const randomMeta = this.catalogOrder[Math.floor(Math.random() * this.catalogOrder.length)];
                if (!randomMeta) return;
                this.setTrack(randomMeta, { startTime: 0, autoPlay: true })
                    .then(() => {
                        autoplayTrigger.style.opacity = '0';
                        autoplayTrigger.style.transform = 'scale(0.9)';
                        setTimeout(() => autoplayTrigger.remove(), 300);
                    })
                    .catch((err) => {
                        console.warn('[PersistentPlayer] Autoplay failed', err);
                    });
            }, { once: true });

            creditsSection.appendChild(autoplayTrigger);
        }

        isHomePage() {
            try {
                const path = window.location?.pathname || '/';
                return path === '/' || path.endsWith('/index.html');
            } catch (err) {
                return false;
            }
        }
    }

    ready(() => {
        new PersistentPlayer();
    });
})();


