(() => {
    'use strict';

    const STORAGE_KEY = 'idcPersistentPlayerState';
    const PLAYER_STYLE_ID = 'idc-persistent-player-styles';

    if (window.__idcPersistentPlayerInitialized) {
        return;
    }
    window.__idcPersistentPlayerInitialized = true;

    const ready = (cb) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', cb, { once: true });
        } else {
            cb();
        }
    };

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

    class PersistentPlayer {
        constructor() {
            this.blocked = document.body?.dataset?.disablePersistentPlayer === 'true';
            this.storageKey = STORAGE_KEY;
            this.state = this.readState();
            this.trackRegistry = new Map();
            this.playerContainers = new Map();
            this.lastPersist = 0;

            if (this.blocked) {
                this.clearStoredState();
                return;
            }

            this.injectStyles();
            this.buildUI();
            this.setupAudio();
            this.bindUIEvents();
            this.bindStorageEvents();
            this.upgradeShowcasePlayers();
            this.restoreFromState();
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
    width: min(360px, calc(100vw - 32px));
    padding: 16px 18px 18px;
    background: rgba(6, 8, 15, 0.92);
    border: 1px solid rgba(0, 255, 170, 0.4);
    border-radius: 18px;
    box-shadow: 0 18px 38px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(16px);
    color: #f2fff7;
    font-family: "JetBrains Mono", "IBM Plex Mono", system-ui, sans-serif;
    z-index: 9999;
    transition: opacity 180ms ease, transform 180ms ease;
}
#persistent-audio-deck[data-visible="false"] {
    opacity: 0;
    pointer-events: none;
    transform: translateY(12px);
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
#persistent-audio-deck button {
    font-family: inherit;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
}
#persistent-audio-deck .player-close {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.85);
}
#persistent-audio-deck .player-controls {
    margin: 12px 0 8px;
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
.audio-player[data-persistent-enhanced="1"] audio {
    display: none;
}
.audio-player .persistent-launch {
    width: 100%;
    border: 1px solid rgba(0, 255, 170, 0.35);
    background: radial-gradient(circle at 10% 10%, rgba(0, 255, 213, 0.28), rgba(0, 10, 6, 0.85));
    color: #e5fff6;
    border-radius: 12px;
    padding: 12px;
    text-align: left;
    display: grid;
    gap: 4px;
    text-transform: uppercase;
    font-size: 0.74rem;
    letter-spacing: 0.08em;
}
.audio-player .persistent-launch__secondary {
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    color: rgba(255, 255, 255, 0.7);
}
.audio-player .persistent-launch__hint {
    margin-top: 8px;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.55);
}
.audio-player[data-persistent-hint="active"] .persistent-launch__hint {
    color: #00ffd5;
    font-weight: 600;
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
            this.root.innerHTML = `
                <header>
                    <div class="player-meta">
                        <span class="player-meta__label">Now Playing</span>
                        <span class="player-meta__title" data-player-title>—</span>
                        <span class="player-meta__artist" data-player-artist></span>
                    </div>
                    <button type="button" class="player-close" aria-label="Close player" data-player-close>&times;</button>
                </header>
                <div class="player-controls">
                    <button type="button" data-action="rewind" aria-label="Rewind 10 seconds">–10s</button>
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
            `;
            document.body.appendChild(this.root);
            this.titleEl = this.root.querySelector('[data-player-title]');
            this.artistEl = this.root.querySelector('[data-player-artist]');
            this.seekInput = this.root.querySelector('[data-player-seek]');
            this.currentTimeEl = this.root.querySelector('[data-player-current]');
            this.durationEl = this.root.querySelector('[data-player-duration]');
            this.closeButton = this.root.querySelector('[data-player-close]');
        }

        setupAudio() {
            this.audio = new Audio();
            this.audio.preload = 'auto';
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
        }

        bindStorageEvents() {
            window.addEventListener('storage', (event) => {
                if (event.key !== this.storageKey) return;
                this.state = this.readState();
                if (!this.state?.src) {
                    this.stopAndHide();
                    return;
                }
                this.restoreFromState();
            });
        }

        upgradeShowcasePlayers() {
            const containers = document.querySelectorAll('.track-list .audio-player');
            if (!containers.length) return;
            containers.forEach((wrap, index) => {
                if (wrap.dataset.persistentEnhanced === '1') return;
                const audioEl = wrap.querySelector('audio');
                const sourceEl = audioEl?.querySelector('source');
                if (!audioEl || !sourceEl) return;
                const trackItem = wrap.closest('.track-item');
                if (!trackItem) return;
                const trackNumber = trackItem.querySelector('.track-number')?.textContent?.trim() ?? String(index + 1).padStart(2, '0');
                const trackTitle = trackItem.querySelector('.track-title')?.textContent?.trim() ?? `Track ${trackNumber}`;
                const trackArtist = trackItem.querySelector('.track-artist')?.textContent?.trim() ?? '';
                const durationLabel = trackItem.querySelector('.track-duration')?.textContent?.trim() ?? '';
                const absoluteSrc = new URL(sourceEl.getAttribute('src'), document.baseURI).href;

                this.trackRegistry.set(absoluteSrc, trackItem);
                this.playerContainers.set(absoluteSrc, wrap);

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'persistent-launch';
                button.innerHTML = `
                    <span class="persistent-launch__primary">Play track</span>
                    <span class="persistent-launch__secondary">Opens floating player</span>
                `;
                button.addEventListener('click', () => {
                    this.setTrack({
                        src: absoluteSrc,
                        title: trackTitle,
                        artist: trackArtist,
                        durationSeconds: parseDurationLabel(durationLabel),
                        durationLabel,
                        trackNumber,
                    });
                    this.highlightActiveTrack();
                    this.setActiveHintForSrc(absoluteSrc);
                });

                const hint = document.createElement('p');
                hint.className = 'persistent-launch__hint';
                hint.textContent = 'Keeps playing as you browse.';

                wrap.append(button, hint);
                audioEl.setAttribute('data-persistent-hidden', 'true');
                audioEl.style.display = 'none';
                wrap.dataset.persistentEnhanced = '1';
            });

            if (this.state?.src) {
                this.highlightActiveTrack();
                this.setActiveHintForSrc(this.state.src);
            }
        }

        readState() {
            const raw = safeStorage.get(this.storageKey);
            if (!raw) return null;
            try {
                return JSON.parse(raw);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to parse stored state', err);
                return null;
            }
        }

        persistState(partial = {}) {
            if (!this.state) return;
            const next = {
                ...this.state,
                ...partial,
                updatedAt: Date.now(),
            };
            this.state = next;
            safeStorage.set(this.storageKey, JSON.stringify(next));
        }

        clearStoredState() {
            this.state = null;
            safeStorage.remove(this.storageKey);
        }

        setTrack(meta) {
            if (!meta?.src) return;
            this.state = {
                src: meta.src,
                title: meta.title || 'Untitled Track',
                artist: meta.artist || '',
                durationSeconds: meta.durationSeconds || null,
                durationLabel: meta.durationLabel || '',
                trackNumber: meta.trackNumber || '',
                currentTime: 0,
                isPlaying: true,
                updatedAt: Date.now(),
            };

            this.audio.src = meta.src;
            this.pendingSeek = 0;
            this.showUI();
            this.renderMetadata();
            this.persistState();
            this.audio.play().then(() => {
                this.persistState({ isPlaying: true });
            }).catch((err) => {
                console.warn('[PersistentPlayer] Autoplay was blocked', err);
                this.persistState({ isPlaying: false });
            });
            this.syncMediaSession();
        }

        restoreFromState() {
            if (!this.state?.src) return;
            this.showUI();
            this.renderMetadata();
            const shouldResume = Boolean(this.state.isPlaying);
            const position = Number(this.state.currentTime) || 0;
            this.pendingSeek = position;
            if (this.audio.src !== this.state.src) {
                this.audio.src = this.state.src;
            }
            const playPromise = shouldResume ? this.audio.play() : Promise.resolve();
            playPromise
                .then(() => {
                    if (!shouldResume) {
                        this.audio.pause();
                    }
                    this.updatePlaybackState();
                    this.highlightActiveTrack();
                    this.setActiveHintForSrc(this.state.src);
                })
                .catch((err) => {
                    console.warn('[PersistentPlayer] Resume failed', err);
                    this.audio.pause();
                    this.persistState({ isPlaying: false });
                    this.updatePlaybackState();
                });
            this.syncMediaSession();
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
            this.artistEl.textContent = artistParts.join(' · ');
            if (this.state.durationSeconds) {
                this.durationEl.textContent = formatTime(this.state.durationSeconds);
            }
        }

        showUI() {
            this.root.dataset.visible = 'true';
        }

        updatePlaybackState() {
            const isPlaying = !this.audio.paused && !this.audio.ended;
            this.root.dataset.playing = isPlaying ? 'true' : 'false';
            if (this.state) {
                this.persistState({ isPlaying, currentTime: this.audio.currentTime });
            }
        }

        handleTimeUpdate() {
            this.updateProgressUI();
            const now = Date.now();
            if (now - this.lastPersist > 500) {
                this.lastPersist = now;
                if (this.state) {
                    this.persistState({ currentTime: this.audio.currentTime });
                }
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

        updateProgressUI() {
            const duration = this.getDurationSeconds();
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

        getDurationSeconds() {
            if (Number.isFinite(this.audio.duration)) {
                return this.audio.duration;
            }
            if (this.state?.durationSeconds) {
                return this.state.durationSeconds;
            }
            return null;
        }

        previewSeek(value) {
            const duration = this.getDurationSeconds();
            if (!duration) return;
            const percent = Number(value) / 1000;
            const preview = duration * percent;
            this.currentTimeEl.textContent = formatTime(preview);
        }

        commitSeek(value) {
            const duration = this.getDurationSeconds();
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
                this.audio.play().catch((err) => {
                    console.warn('[PersistentPlayer] Play failed', err);
                });
            } else {
                this.audio.pause();
            }
        }

        handleEnded() {
            this.updateProgressUI();
            this.persistState({ isPlaying: false, currentTime: this.audio.duration || 0 });
            this.root.dataset.playing = 'false';
        }

        syncMediaSession() {
            if (!('mediaSession' in navigator) || !this.state) return;
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: this.state.title || 'Internet Discotheque',
                    artist: this.state.artist || 'Various Artists',
                    album: 'Internet Discotheque',
                });
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to sync MediaSession', err);
            }
        }

        highlightActiveTrack() {
            document.querySelectorAll('.track-item[data-persistent-active="true"]').forEach((el) => {
                el.removeAttribute('data-persistent-active');
            });
            if (!this.state?.src) return;
            const track = this.trackRegistry.get(this.state.src);
            if (track) {
                track.setAttribute('data-persistent-active', 'true');
            }
        }

        setActiveHintForSrc(src) {
            this.playerContainers.forEach((container, key) => {
                if (src && key === src) {
                    container.setAttribute('data-persistent-hint', 'active');
                } else {
                    container.removeAttribute('data-persistent-hint');
                }
            });
        }

        stopAndHide() {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            this.root.dataset.visible = 'false';
            this.root.dataset.playing = 'false';
            this.clearStoredState();
            this.setActiveHintForSrc(null);
            document.querySelectorAll('.track-item[data-persistent-active="true"]').forEach((el) => {
                el.removeAttribute('data-persistent-active');
            });
        }
    }

    ready(() => {
        new PersistentPlayer();
    });
})();
