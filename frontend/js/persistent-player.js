(() => {
    'use strict';

    const STORAGE_KEY = 'idcPersistentPlayerState:session';
    const LEGACY_STORAGE_KEY = 'idcPersistentPlayerState';
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

    const sourceKey = (src, { stem = false } = {}) => {
        if (!src || typeof src !== 'string') return '';
        const clean = src.split('#', 1)[0].split('?', 1)[0];
        let pathname = clean;
        try {
            pathname = new URL(clean, document.baseURI).pathname;
        } catch (err) {}
        const last = pathname.split('/').filter(Boolean).pop() || clean;
        let decoded = last;
        try {
            decoded = decodeURIComponent(last);
        } catch (err) {}
        const lower = decoded.toLowerCase();
        return stem ? lower.replace(/\.[a-z0-9]+$/i, '') : lower;
    };

    FALLBACK_TRACKS.forEach((track) => {
        track.durationSeconds = parseDurationLabel(track.durationLabel);
    });

    const safeStorage = {
        get(key) {
            try {
                return window.sessionStorage.getItem(key);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to read session storage', err);
                return null;
            }
        },
        set(key, value) {
            try {
                window.sessionStorage.setItem(key, value);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to persist session state', err);
            }
        },
        remove(key) {
            try {
                window.sessionStorage.removeItem(key);
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to remove session state', err);
            }
        },
    };

    const clearLegacyGlobalState = () => {
        try {
            window.localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (err) {}
    };

    const isBlockedGlobalPlayerRoute = () => {
        const pathname = window.location.pathname.replace(/\/+$/, '').toLowerCase();
        return pathname === '/harmonizer' || pathname === '/harmonizer.html';
    };

    const makeInstanceId = () => {
        try {
            if (window.crypto?.randomUUID) {
                return window.crypto.randomUUID();
            }
        } catch (err) {}
        return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    if (window.__idcPersistentPlayerInitialized) {
        return;
    }
    window.__idcPersistentPlayerInitialized = true;

    class PersistentPlayer {
        constructor() {
            this.instanceId = makeInstanceId();
            clearLegacyGlobalState();
            this.blocked = document.body?.dataset?.disablePersistentPlayer === 'true' || isBlockedGlobalPlayerRoute();
            this.trackRegistry = new Map();
            this.catalogOrder = [];
            this.inlineObserver = null;
            this.inlineActive = null;
            this.playbackOwner = 'deck';
            this.lastInlinePersist = 0;
            this.handoffInProgress = false;
            this.pendingSet = null;
            this.isPageLeaving = false;
            this.suppressPausePersist = false;

            this.state = this.readState();
            this.desiredPlaying = this.state?.isPlaying === true;
            const storedSettings = this.state?.playbackSettings || {};
            this.playbackSettings = {
                autoplayNext: storedSettings.autoplayNext ?? true,
                shuffle: storedSettings.shuffle !== undefined ? storedSettings.shuffle : true,
                repeatAll: storedSettings.repeatAll ?? true,
                loopOne: storedSettings.loopOne ?? false,
                seekStep: storedSettings.seekStep ?? 10,
            };
            this.volume = typeof this.state?.volume === 'number' ? clamp(this.state.volume, 0, 1) : 0.9;
            this.uiState = this.state?.uiState || {};
            this.minimized = !!this.uiState.minimized;
            this.positionMode = this.uiState?.positionMode === 'manual' ? 'manual' : 'anchored';
            this.dragPosition = this.positionMode === 'manual' ? this.uiState?.position || null : null;
            this.dockButton = null;
            this.autoStartAttempted = false;

            if (this.blocked) {
                safeStorage.remove(STORAGE_KEY);
                clearLegacyGlobalState();
                return;
            }

            this.injectStyles();
            this.buildUI();
            this.applySavedPosition();
            this.setupDrag();
            this.setupAudio();
            this.bindUIEvents();
            this.bindStorageEvents();
            this.bindDesktopEvents();
            this.bindPageLifecycle();
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
    bottom: 58px;
    width: min(410px, calc(100vw - 32px));
    padding: 7px;
    background: #0d0d0d;
    border: 1px solid #3a3a3a;
    border-radius: 0;
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.12), inset -1px -1px 0 rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(138, 180, 255, 0.24), 0 18px 42px rgba(0, 0, 0, 0.65);
    color: #cfe4ff;
    font-family: "MS Sans Serif", Tahoma, "JetBrains Mono", monospace;
    z-index: 9999;
    transition: opacity 180ms ease, transform 180ms ease;
}
#persistent-audio-deck[data-docked="true"] {
    opacity: 0;
    pointer-events: none;
    transform: translateY(16px);
}
#persistent-audio-deck[data-dragging="true"] {
    cursor: grabbing;
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
    padding: 6px 7px;
    background: linear-gradient(90deg, #17233c, #0d0d0d);
    border: 1px solid rgba(138, 180, 255, 0.35);
    cursor: grab;
    user-select: none;
    touch-action: none;
}
#persistent-audio-deck[data-dragging="true"] header {
    cursor: grabbing;
}
#persistent-audio-deck .player-meta {
    display: grid;
    gap: 2px;
}
#persistent-audio-deck .player-meta__label {
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 0.58rem;
    color: #8ab4ff;
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
#persistent-audio-deck .player-menu-toggle {
    height: 28px;
    padding: 0 10px;
    border: 1px solid rgba(138, 180, 255, 0.48);
    background: rgba(14, 24, 42, 0.92);
    color: #cfe4ff;
    font-size: 0.58rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}
#persistent-audio-deck[data-options-open="true"] .player-menu-toggle {
    border-color: #8ab4ff;
    color: #ffffff;
    box-shadow: 0 0 12px rgba(138, 180, 255, 0.28);
}
#persistent-player-dock {
    height: 26px;
    border: 1px solid rgba(138, 180, 255, 0.45);
    background: #151515;
    color: #8ab4ff;
    padding: 4px 10px;
    font-family: "MS Sans Serif", Tahoma, sans-serif;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08), inset -1px -1px 0 rgba(0, 0, 0, 0.6);
    white-space: nowrap;
}
#persistent-player-dock.is-active {
    color: #8ab4ff;
    border-color: #8ab4ff;
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.1), inset -1px -1px 0 rgba(0, 0, 0, 0.7), 0 0 10px rgba(138, 180, 255, 0.22);
}
#persistent-player-dock[data-floating="true"] {
    position: fixed;
    right: 16px;
    bottom: 10px;
    z-index: 10000;
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
    border-radius: 3px;
    border: 1px solid rgba(138, 180, 255, 0.32);
    background: rgba(14, 24, 42, 0.86);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.85rem;
}
#persistent-audio-deck .player-close {
    width: 30px;
    height: 30px;
    border-radius: 3px;
    border: 1px solid rgba(138, 180, 255, 0.32);
    background: rgba(14, 24, 42, 0.86);
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
    border-radius: 4px;
    border: 1px solid rgba(138, 180, 255, 0.42);
    background: rgba(14, 24, 42, 0.92);
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
}
#persistent-audio-deck .player-controls button[data-action="toggle"] {
    flex: 2;
    background: linear-gradient(180deg, #cfe4ff, #8ab4ff);
    color: #07101f;
    font-weight: 600;
    box-shadow: 0 0 14px rgba(138, 180, 255, 0.25);
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
    accent-color: #8ab4ff;
}
#persistent-audio-deck .player-times {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.75);
}
#persistent-audio-deck .player-modes {
    display: none;
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
    background: rgba(138, 180, 255, 0.2);
    border-color: rgba(138, 180, 255, 0.7);
    color: #ffffff;
    box-shadow: 0 0 12px rgba(138, 180, 255, 0.2);
}
#persistent-audio-deck .player-options {
    display: none;
    margin: 10px 0;
    padding: 10px;
    border: 1px solid rgba(138, 180, 255, 0.38);
    background: rgba(8, 14, 24, 0.96);
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08), inset -1px -1px 0 rgba(0, 0, 0, 0.7);
}
#persistent-audio-deck[data-options-open="true"] .player-options {
    display: grid;
    gap: 10px;
}
#persistent-audio-deck .player-options__title {
    display: flex;
    justify-content: space-between;
    color: #8ab4ff;
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}
#persistent-audio-deck .player-options__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
}
#persistent-audio-deck .player-option {
    min-height: 34px;
    padding: 7px 8px;
    border: 1px solid rgba(138, 180, 255, 0.3);
    background: rgba(14, 24, 42, 0.9);
    color: #cfe4ff;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: left;
}
#persistent-audio-deck .player-option[aria-pressed="true"] {
    border-color: #8ab4ff;
    background: rgba(138, 180, 255, 0.22);
    color: #ffffff;
    box-shadow: 0 0 12px rgba(138, 180, 255, 0.18);
}
#persistent-audio-deck .player-option[aria-pressed="true"]::before {
    content: 'ON ';
    color: #8ab4ff;
}
#persistent-audio-deck .player-option[aria-pressed="false"]::before {
    content: 'OFF ';
    color: rgba(255, 255, 255, 0.45);
}
#persistent-audio-deck .player-seek-tools {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    align-items: center;
}
#persistent-audio-deck .player-seek-tools__label {
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}
#persistent-audio-deck .player-seek-steps,
#persistent-audio-deck .player-seek-jump {
    display: flex;
    gap: 6px;
}
#persistent-audio-deck .player-seek-steps button,
#persistent-audio-deck .player-seek-jump button {
    min-width: 34px;
    padding: 6px 8px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.78);
    font-size: 0.58rem;
    letter-spacing: 0.08em;
}
#persistent-audio-deck .player-seek-steps button[aria-pressed="true"] {
    border-color: #8ab4ff;
    color: #ffffff;
    background: rgba(138, 180, 255, 0.18);
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
    accent-color: #8ab4ff;
}
#persistent-audio-deck {
    width: min(280px, calc(100vw - 24px));
    padding: 0;
    background: transparent;
    border: 0;
    box-shadow: none;
}
#persistent-audio-deck .player-now-window,
#persistent-audio-deck .player-options {
    border: 2px solid #7f7f7f;
    border-top-color: #d7d7d7;
    border-left-color: #d7d7d7;
    border-right-color: #272727;
    border-bottom-color: #272727;
    background: #050505;
    box-shadow: 0 14px 28px rgba(0, 0, 0, 0.58);
}
#persistent-audio-deck header.player-now-window {
    display: block;
    width: 220px;
    min-height: 74px;
    margin: 0 auto 8px;
    padding: 0;
    background: #050505;
    cursor: grab;
}
#persistent-audio-deck .player-window-titlebar {
    min-height: 17px;
    padding: 2px 3px 2px 6px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: linear-gradient(90deg, #102d78, #07101f);
    border-bottom: 1px solid #0b0b0b;
    color: #8ab4ff;
    font-size: 0.58rem;
    line-height: 1;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}
#persistent-audio-deck .player-window-titlebar--options {
    background: linear-gradient(90deg, #102d78, #17233c);
    color: #cfe4ff;
}
#persistent-audio-deck .player-now-body {
    display: grid;
    grid-template-columns: 35px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 8px 8px 9px;
}
#persistent-audio-deck .player-now-icon {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(138, 180, 255, 0.38);
    background: rgba(8, 14, 24, 0.92);
    color: #8ab4ff;
    font-size: 1.2rem;
    box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.08);
}
#persistent-audio-deck .player-meta {
    min-width: 0;
}
#persistent-audio-deck .player-meta__label {
    color: #8ab4ff;
    font-size: 0.52rem;
    letter-spacing: 0.16em;
}
#persistent-audio-deck .player-meta__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #cfe4ff;
    font-size: 0.78rem;
    line-height: 1.25;
    letter-spacing: 0.02em;
}
#persistent-audio-deck .player-meta__artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.58rem;
    color: rgba(207, 228, 255, 0.82);
}
#persistent-audio-deck .player-actions {
    gap: 2px;
}
#persistent-audio-deck .player-menu-toggle {
    height: 15px;
    padding: 0 6px;
    border: 1px solid #9fb8f5;
    background: #0b1730;
    color: #cfe4ff;
    font-size: 0.5rem;
    letter-spacing: 0.08em;
}
#persistent-audio-deck .player-minimize,
#persistent-audio-deck .player-close {
    width: 15px;
    height: 15px;
    padding: 0;
    border-radius: 0;
    border: 1px solid #b8b8b8;
    background: #c0c0c0;
    color: #050505;
    font-size: 0.62rem;
    line-height: 1;
}
#persistent-audio-deck[data-options-open="true"] .player-menu-toggle {
    border-color: #8ab4ff;
    color: #ffffff;
    box-shadow: none;
}
#persistent-audio-deck .player-options {
    width: 270px;
    margin: 0 auto;
    padding: 0;
}
#persistent-audio-deck[data-options-open="true"] .player-options {
    display: grid;
    gap: 9px;
    padding-bottom: 10px;
}
#persistent-audio-deck .player-options__grid {
    padding: 7px 10px 0;
    grid-template-columns: 1fr;
    gap: 4px;
}
#persistent-audio-deck .player-option {
    min-height: 18px;
    padding: 2px 4px 2px 22px;
    position: relative;
    border: 0;
    background: transparent;
    color: #cfe4ff;
    font-size: 0.56rem;
    letter-spacing: 0.1em;
}
#persistent-audio-deck .player-option::before {
    position: absolute;
    left: 3px;
    top: 2px;
    width: 10px;
    height: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #a6a6a6;
    background: #111;
    color: #8ab4ff;
    font-size: 0.55rem;
    line-height: 1;
}
#persistent-audio-deck .player-option[aria-pressed="true"] {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
}
#persistent-audio-deck .player-option[aria-pressed="true"]::before {
    content: '\\2713';
    color: #8ab4ff;
}
#persistent-audio-deck .player-option[aria-pressed="false"]::before {
    content: '';
}
#persistent-audio-deck .player-seek-tools {
    margin: 2px 10px 0;
    padding-top: 8px;
    border-top: 1px solid rgba(138, 180, 255, 0.18);
    grid-template-columns: 1fr;
    gap: 6px;
}
#persistent-audio-deck .player-seek-tools__label {
    color: #8ab4ff;
    text-align: center;
    font-size: 0.5rem;
}
#persistent-audio-deck .player-seek-steps,
#persistent-audio-deck .player-seek-jump {
    justify-content: center;
}
#persistent-audio-deck .player-seek-steps button,
#persistent-audio-deck .player-seek-jump button,
#persistent-audio-deck .player-controls button {
    min-width: 44px;
    padding: 5px 8px;
    border: 2px solid #7f7f7f;
    border-top-color: #d7d7d7;
    border-left-color: #d7d7d7;
    border-right-color: #272727;
    border-bottom-color: #272727;
    border-radius: 0;
    background: #111827;
    color: #cfe4ff;
    font-size: 0.55rem;
}
#persistent-audio-deck .player-seek-steps button[aria-pressed="true"] {
    background: #17233c;
    color: #ffffff;
}
#persistent-audio-deck .player-controls {
    margin: 0 10px;
    padding-top: 8px;
    border-top: 1px solid rgba(138, 180, 255, 0.18);
    gap: 6px;
}
#persistent-audio-deck .player-controls button[data-action="toggle"] {
    background: #17233c;
    color: #ffffff;
    box-shadow: none;
}
#persistent-audio-deck .player-progress {
    margin: 0 10px;
}
#persistent-audio-deck .player-progress input[type="range"],
#persistent-audio-deck .player-volume input[type="range"] {
    accent-color: #8ab4ff;
}
#persistent-audio-deck .player-times {
    font-size: 0.58rem;
    color: #cfe4ff;
}
#persistent-audio-deck .player-volume {
    margin: 0 10px;
    padding-top: 7px;
    border-top: 1px solid rgba(138, 180, 255, 0.18);
    font-size: 0.55rem;
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
#persistent-audio-deck[data-minimized="true"] .player-options,
#persistent-audio-deck[data-minimized="true"] .player-volume {
    display: none;
}
#persistent-audio-deck[data-minimized="true"] .player-meta__title {
    font-size: 0.9rem;
}
#persistent-audio-deck[data-minimized="true"] .player-meta__artist {
    font-size: 0.7rem;
}
@media (max-width: 480px) {
    /* FIXED: Player text readability */
    #persistent-audio-deck .player-meta__label {
        font-size: 0.75rem !important; /* was 0.58rem - now 12px+ */
    }
    #persistent-audio-deck .player-controls button {
        font-size: 0.75rem !important; /* was 0.68rem - now 12px+ */
    }

    /* FIXED: Player button touch targets */
    #persistent-audio-deck .player-minimize,
    #persistent-audio-deck .player-close {
        width: 44px !important;
        height: 44px !important;
        font-size: 1rem !important;
    }

    #persistent-audio-deck .player-controls button {
        min-height: 44px !important;
        padding: 12px 10px !important;
    }
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
                <header class="player-now-window">
                    <div class="player-window-titlebar">
                        <span>Now Playing</span>
                        <div class="player-actions">
                            <button type="button" class="player-menu-toggle" aria-label="Open player options" aria-expanded="false" data-player-options-toggle>Options</button>
                            <button type="button" class="player-minimize" aria-label="Minimize player" data-player-minimize>&#8211;</button>
                            <button type="button" class="player-close" aria-label="Close player" data-player-close>&times;</button>
                        </div>
                    </div>
                    <div class="player-now-body">
                        <span class="player-now-icon" aria-hidden="true">&#9835;</span>
                        <div class="player-meta">
                            <span class="player-meta__label">Track</span>
                            <span class="player-meta__title" data-player-title>&mdash;</span>
                            <span class="player-meta__artist" data-player-artist></span>
                        </div>
                    </div>
                </header>
                <div class="player-options" data-player-options-panel>
                    <div class="player-window-titlebar player-window-titlebar--options">
                        <span>Player Options</span>
                        <span data-player-seek-label>Seek 10s</span>
                    </div>
                    <div class="player-options__grid">
                        <button type="button" class="player-option" data-action="autoplay" aria-pressed="false">Autoplay Next</button>
                        <button type="button" class="player-option" data-action="shuffle" aria-pressed="false">Shuffle</button>
                        <button type="button" class="player-option" data-action="repeat" aria-pressed="false">Repeat All</button>
                        <button type="button" class="player-option" data-action="loop" aria-pressed="false">Repeat One</button>
                    </div>
                    <div class="player-seek-tools">
                        <span class="player-seek-tools__label">Seek Step</span>
                        <div class="player-seek-steps" aria-label="Seek step">
                            <button type="button" data-seek-step="5" aria-pressed="false">5s</button>
                            <button type="button" data-seek-step="10" aria-pressed="false">10s</button>
                            <button type="button" data-seek-step="30" aria-pressed="false">30s</button>
                        </div>
                        <div class="player-seek-jump">
                            <button type="button" data-action="seek-back" aria-label="Seek backward">&minus;</button>
                            <button type="button" data-action="seek-forward" aria-label="Seek forward">+</button>
                        </div>
                    </div>
                    <div class="player-controls">
                        <button type="button" data-action="rewind" aria-label="Previous track">Prev</button>
                        <button type="button" data-action="toggle" aria-label="Play or pause"></button>
                        <button type="button" data-action="forward" aria-label="Next track">Next</button>
                    </div>
                    <div class="player-progress">
                        <input type="range" min="0" max="1000" value="0" step="1" aria-label="Seek within track" data-player-seek>
                        <div class="player-times">
                            <span data-player-current>0:00</span>
                            <span data-player-duration>0:00</span>
                        </div>
                    </div>
                    <div class="player-volume">
                        <span>Volume</span>
                        <input type="range" min="0" max="1" step="0.01" value="${this.volume.toFixed(2)}" data-player-volume>
                    </div>
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
            this.optionsToggle = this.root.querySelector('[data-player-options-toggle]');
            this.seekLabel = this.root.querySelector('[data-player-seek-label]');
            this.modeButtons = {
                autoplay: Array.from(this.root.querySelectorAll('[data-action="autoplay"]')),
                shuffle: Array.from(this.root.querySelectorAll('[data-action="shuffle"]')),
                repeat: Array.from(this.root.querySelectorAll('[data-action="repeat"]')),
                loop: Array.from(this.root.querySelectorAll('[data-action="loop"]')),
            };
            this.seekStepButtons = Array.from(this.root.querySelectorAll('[data-seek-step]'));
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
            this.setupMediaSession();
        }

        setupMediaSession() {
            if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
                return;
            }
            const bind = (action, handler) => {
                try {
                    navigator.mediaSession.setActionHandler(action, handler);
                } catch (err) {}
            };
            bind('play', () => this.togglePlayback());
            bind('pause', () => {
                if (this.audio) {
                    this.audio.pause();
                }
            });
            bind('previoustrack', () => this.skipTrack(-1));
            bind('nexttrack', () => this.skipTrack(1));
            bind('seekbackward', (details) => this.nudgePlayback(-(details?.seekOffset || this.playbackSettings.seekStep || 10)));
            bind('seekforward', (details) => this.nudgePlayback(details?.seekOffset || this.playbackSettings.seekStep || 10));
            bind('seekto', (details) => {
                if (details && typeof details.seekTime === 'number') {
                    this.audio.currentTime = Math.max(0, details.seekTime);
                    this.persistState({ currentTime: this.audio.currentTime });
                }
            });
        }

        updateMediaSession() {
            if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !this.state) {
                return;
            }
            if (typeof window.MediaMetadata === 'function') {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: this.state.title || 'Internet Discotheque',
                    artist: this.state.artist || 'ID Chief',
                    album: 'Internet Discotheque',
                });
            }
            if (typeof navigator.mediaSession.setPositionState === 'function') {
                const duration = this.audio.duration && Number.isFinite(this.audio.duration)
                    ? this.audio.duration
                    : this.state.durationSeconds || 0;
                try {
                    navigator.mediaSession.setPositionState({
                        duration,
                        playbackRate: this.audio.playbackRate || 1,
                        position: Math.min(duration || 0, this.audio.currentTime || 0),
                    });
                } catch (err) {}
            }
        }

        bindUIEvents() {
            this.root.querySelector('[data-action="toggle"]').addEventListener('click', () => this.togglePlayback());
            this.root.querySelector('[data-action="rewind"]').addEventListener('click', () => this.skipTrack(-1));
            this.root.querySelector('[data-action="forward"]').addEventListener('click', () => this.skipTrack(1));
            this.seekInput.addEventListener('input', (event) => this.previewSeek(event.target.value));
            this.seekInput.addEventListener('change', (event) => this.commitSeek(event.target.value));
            this.closeButton.addEventListener('click', () => this.stopAndHide());
            if (this.minimizeButton) {
                this.minimizeButton.addEventListener('click', () => this.toggleMinimize());
            }
            if (this.optionsToggle) {
                this.optionsToggle.addEventListener('click', () => this.toggleOptions());
            }
            this.root.querySelectorAll('[data-action="autoplay"]').forEach((button) => {
                button.addEventListener('click', () => this.toggleMode('autoplay'));
            });
            this.root.querySelectorAll('[data-action="shuffle"]').forEach((button) => {
                button.addEventListener('click', () => this.toggleMode('shuffle'));
            });
            this.root.querySelectorAll('[data-action="repeat"]').forEach((button) => {
                button.addEventListener('click', () => this.toggleMode('repeat'));
            });
            this.root.querySelectorAll('[data-action="loop"]').forEach((button) => {
                button.addEventListener('click', () => this.toggleMode('loop'));
            });
            this.root.querySelector('[data-action="seek-back"]').addEventListener('click', () => this.seekByStep(-1));
            this.root.querySelector('[data-action="seek-forward"]').addEventListener('click', () => this.seekByStep(1));
            this.seekStepButtons.forEach((button) => {
                button.addEventListener('click', () => this.setSeekStep(parseInt(button.dataset.seekStep, 10)));
            });
            this.volumeSlider.addEventListener('input', (event) => this.setVolume(parseFloat(event.target.value)));
            document.addEventListener('pointerdown', () => this.resumePendingPlayback(), { capture: true });
            document.addEventListener('keydown', () => this.resumePendingPlayback(), { capture: true });
        }

        bindStorageEvents() {
            // State is intentionally session-scoped. Do not listen to localStorage
            // events, or one tab can wake and play every other open tab.
        }

        bindDesktopEvents() {
            window.addEventListener('idc-reset-layout', () => {
                this.resetDockAndPosition();
            });
        }

        bindPageLifecycle() {
            document.addEventListener('click', (event) => {
                const anchor = event.target?.closest?.('a[href]');
                if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
                let url;
                try {
                    url = new URL(anchor.getAttribute('href'), window.location.href);
                } catch (err) {
                    return;
                }
                if (url.origin === window.location.origin) {
                    this.prepareSessionHandoff();
                }
            }, { capture: true });
            window.addEventListener('pagehide', () => this.prepareSessionHandoff());
            window.addEventListener('beforeunload', () => this.prepareSessionHandoff());
            window.addEventListener('resize', () => this.schedulePositionClamp());
        }

        prepareSessionHandoff() {
            if (this.isPageLeaving) return;
            this.isPageLeaving = true;
            const activeAudio = this.playbackOwner === 'inline'
                ? this.inlineActive?.inlineAudio
                : this.audio;
            if (this.playbackOwner === 'inline' && this.inlineActive) {
                this.ensureState(this.inlineActive);
            }
            if (!this.state?.src) return;
            const wasPlaying = !!activeAudio && !activeAudio.paused && !activeAudio.ended;
            const currentTime = activeAudio?.currentTime || this.state.currentTime || 0;
            this.persistState({
                isPlaying: wasPlaying || this.desiredPlaying || this.state.isPlaying === true,
                currentTime,
            });
        }

        resetDockAndPosition() {
            this.positionMode = 'anchored';
            this.uiState.position = null;
            this.uiState.positionMode = 'anchored';
            this.dragPosition = null;
            if (this.root) {
                this.root.style.left = '';
                this.root.style.top = '';
                this.root.style.right = '';
                this.root.style.bottom = '';
            }
            this.applyMinimizeState(false);
            this.persistState();
            this.resetPlayButtonPosition();
        }

        resetPlayButtonPosition() {
            try {
                window.localStorage.removeItem('idcDesktopPlayButton');
                window.localStorage.removeItem('idcDesktopPlayButton:desktop');
                window.localStorage.removeItem('idcDesktopPlayButton:tablet');
            } catch (err) {
                console.warn('[PersistentPlayer] Unable to clear play button position', err);
            }
            const button = document.getElementById('autoplay-trigger');
            const desktop = document.querySelector('.desktop');
            if (!button || !desktop || button.dataset.floating !== 'true') return;
            const desktopRect = desktop.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            const defaultX = clamp((desktopRect.width - buttonRect.width) / 2, 0, desktopRect.width - buttonRect.width);
            const defaultY = clamp(desktopRect.height - buttonRect.height - 140, 0, desktopRect.height - buttonRect.height);
            button.style.left = `${defaultX}px`;
            button.style.top = `${defaultY}px`;
        }

        applySavedPosition() {
            if (!this.root) return;
            if (this.positionMode !== 'manual') {
                this.applyAnchoredPosition();
                return;
            }
            const saved = this.dragPosition;
            if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) {
                this.applyAnchoredPosition();
                return;
            }
            const next = this.clampPlayerPosition(saved);
            if (!next) return;
            this.root.style.left = `${next.x}px`;
            this.root.style.top = `${next.y}px`;
            this.root.style.right = 'auto';
            this.root.style.bottom = 'auto';
            this.dragPosition = next;
        }

        applyAnchoredPosition() {
            if (!this.root) return;
            this.positionMode = 'anchored';
            this.dragPosition = null;
            this.uiState.position = null;
            this.uiState.positionMode = 'anchored';
            this.root.style.left = '';
            this.root.style.top = '';
            this.root.style.right = '';
            this.root.style.bottom = '';
        }

        clampPlayerPosition(position) {
            if (!this.root || !position) return null;
            const rect = this.root.getBoundingClientRect();
            const width = rect.width || this.root.offsetWidth || 280;
            const height = rect.height || this.root.offsetHeight || 120;
            const margin = 12;
            const maxX = Math.max(margin, window.innerWidth - width - margin);
            const maxY = Math.max(margin, window.innerHeight - height - margin);
            return {
                x: clamp(position.x, margin, maxX),
                y: clamp(position.y, margin, maxY),
            };
        }

        schedulePositionClamp() {
            if (!this.root || this.root.dataset.docked === 'true') return;
            window.requestAnimationFrame(() => {
                if (this.root?.dataset?.docked !== 'true' && this.positionMode === 'manual') {
                    this.applySavedPosition();
                } else if (this.root?.dataset?.docked !== 'true') {
                    this.applyAnchoredPosition();
                }
            });
        }

        setupDrag() {
            if (!this.root) return;
            const handle = this.root.querySelector('header');
            if (!handle) return;

            handle.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                if (event.target.closest('button')) return;

                const rect = this.root.getBoundingClientRect();
                const offsetX = event.clientX - rect.left;
                const offsetY = event.clientY - rect.top;
                const width = rect.width;
                const height = rect.height;
                let moved = false;
                const startX = event.clientX;
                const startY = event.clientY;

                this.root.dataset.dragging = 'true';
                this.root.style.right = 'auto';
                this.root.style.bottom = 'auto';
                handle.setPointerCapture(event.pointerId);

                const move = (moveEvent) => {
                    const dx = Math.abs(moveEvent.clientX - startX);
                    const dy = Math.abs(moveEvent.clientY - startY);
                    if (dx > 4 || dy > 4) moved = true;
                    const maxX = Math.max(0, window.innerWidth - width);
                    const maxY = Math.max(0, window.innerHeight - height);
                    const nextX = clamp(moveEvent.clientX - offsetX, 0, maxX);
                    const nextY = clamp(moveEvent.clientY - offsetY, 0, maxY);
                    this.root.style.left = `${nextX}px`;
                    this.root.style.top = `${nextY}px`;
                };

                const end = () => {
                    this.root.dataset.dragging = 'false';
                    handle.releasePointerCapture(event.pointerId);
                    handle.removeEventListener('pointermove', move);
                    handle.removeEventListener('pointerup', end);
                    handle.removeEventListener('pointercancel', end);
                    if (moved) {
                        this.positionMode = 'manual';
                        this.uiState.position = {
                            x: parseFloat(this.root.style.left) || 0,
                            y: parseFloat(this.root.style.top) || 0,
                        };
                        this.uiState.positionMode = 'manual';
                        this.dragPosition = this.uiState.position;
                        this.persistState();
                    }
                };

                handle.addEventListener('pointermove', move);
                handle.addEventListener('pointerup', end);
                handle.addEventListener('pointercancel', end);
            });
        }

        toggleMinimize(force) {
            if (!this.root) return;
            const next = typeof force === 'boolean' ? force : this.root.dataset.minimized !== 'true';
            this.applyMinimizeState(next);
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
            if (isMinimized) {
                this.toggleOptions(false);
            }
            this.root.dataset.minimized = isMinimized ? 'true' : 'false';
            this.root.dataset.docked = isMinimized ? 'true' : 'false';
            this.updateMinimizeUI();
            this.updateDockButton(isMinimized);
            if (!isMinimized) {
                this.schedulePositionClamp();
            }
        }

        ensureDockButton() {
            if (this.dockButton?.isConnected) return this.dockButton;
            if (this.dockButton && !this.dockButton.isConnected) {
                this.dockButton = null;
            }
            const staleDock = document.getElementById('persistent-player-dock');
            if (staleDock) {
                staleDock.remove();
            }
            const prefersDesktop = window.matchMedia('(min-width: 521px)').matches;
            const dockHost =
                (prefersDesktop && document.querySelector('.desktop-taskbar .taskbar-tray')) ||
                (prefersDesktop && document.querySelector('.desktop-taskbar')) ||
                document.body;
            const button = document.createElement('button');
            button.type = 'button';
            button.id = 'persistent-player-dock';
            button.className = 'player-dock-button';
            button.textContent = 'PLAYER';
            button.setAttribute('aria-label', 'Open music player');
            button.setAttribute('title', 'Open music player');
            if (dockHost === document.body) {
                button.dataset.floating = 'true';
            }
            button.addEventListener('click', () => {
                this.applyMinimizeState(false);
                this.showUI();
                this.persistState();
            });
            dockHost.appendChild(button);
            this.dockButton = button;
            return button;
        }

        updateDockButton(isDocked) {
            if (!isDocked) {
                if (this.dockButton) {
                    this.dockButton.remove();
                    this.dockButton = null;
                }
                return;
            }
            const button = this.ensureDockButton();
            button.classList.add('is-active');
            button.hidden = false;
            button.style.display = '';
            const title = this.state?.title ? `PLAYER - ${this.state.title}` : 'PLAYER';
            button.textContent = title.length > 28 ? `${title.slice(0, 25)}...` : title;
            button.title = title;
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

        findMetaForSrc(src) {
            if (!src) return null;
            const exact = this.trackRegistry.get(src);
            if (exact) return exact;

            let resolved = '';
            try {
                resolved = new URL(src, document.baseURI).href;
            } catch (err) {}
            if (resolved && this.trackRegistry.has(resolved)) {
                return this.trackRegistry.get(resolved);
            }

            const name = sourceKey(src);
            const stem = sourceKey(src, { stem: true });
            if (!name && !stem) return null;
            return this.catalogOrder.find((entry) => {
                const entryName = sourceKey(entry.src);
                return entryName === name || sourceKey(entry.src, { stem: true }) === stem;
            }) || null;
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
            this.desiredPlaying = true;
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
            if (!this.isPageLeaving && document.visibilityState !== 'hidden') {
                this.desiredPlaying = !meta.inlineAudio.paused;
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
            const meta = this.findMetaForSrc(src);
            if (meta) {
                return this.catalogOrder.indexOf(meta);
            }
            return -1;
        }

        restoreFromState() {
            if (!this.state?.src) return;
            const meta =
                this.findMetaForSrc(this.state.src) ||
                (Number.isInteger(this.state.trackIndex) ? this.catalogOrder[this.state.trackIndex] : null) ||
                this.state;
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
            this.desiredPlaying = autoPlay;
            this.persistState();
            this.showUI();
            this.renderMetadata();
            this.pendingSeek = normalizedStart;

            const attemptPlay = () => {
                if (!autoPlay) {
                    this.audio.pause();
                    this.desiredPlaying = false;
                    this.persistState({ isPlaying: false, currentTime: this.audio.currentTime });
                    return Promise.resolve();
                }
                return this.audio.play()
                    .then(() => {
                        this.desiredPlaying = true;
                        this.persistState({ isPlaying: true, currentTime: this.audio.currentTime });
                    })
                    .catch((err) => {
                        console.warn('[PersistentPlayer] Play failed', err);
                        if (err?.name === 'NotAllowedError') {
                            this.persistState({ isPlaying: true, resumePending: true });
                        } else {
                            this.desiredPlaying = false;
                            this.persistState({ isPlaying: false, resumePending: false });
                        }
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

            this.suppressPausePersist = true;
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            this.audio.src = meta.src;
            this.audio.load();
            const playPromise = attemptPlay().finally(() => {
                this.suppressPausePersist = false;
            });

            const pending = new Promise((resolve) => {
                const cleanup = () => {
                    this.audio.removeEventListener('loadedmetadata', handleMeta);
                    this.audio.removeEventListener('error', handleError);
                    this.pendingSet = null;
                };
                const handleMeta = () => {
                    cleanup();
                    playPromise.finally(resolve);
                };
                const handleError = () => {
                    cleanup();
                    playPromise.finally(resolve);
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
            this.schedulePositionClamp();
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
            this.updateMediaSession();
            if (this.root?.dataset?.docked === 'true') {
                this.updateDockButton(true);
            }
        }

        handleTimeUpdate() {
            this.updateProgressUI();
            this.updateMediaSession();
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
            this.updateMediaSession();
        }

        handleEnded() {
            if (this.playbackSettings.loopOne) {
                this.setTrack(this.trackRegistry.get(this.state?.src) || this.state, { startTime: 0, autoPlay: true });
                return;
            }
            if (!this.playbackSettings.autoplayNext) {
                this.persistState({ isPlaying: false, currentTime: this.audio.duration || 0 });
                this.desiredPlaying = false;
                this.root.dataset.playing = 'false';
                return;
            }
            const nextMeta = this.getNextTrack(1);
            if (nextMeta) {
                this.setTrack(nextMeta, { startTime: 0, autoPlay: true });
                return;
            }
            this.persistState({ isPlaying: false, currentTime: this.audio.duration || 0 });
            this.desiredPlaying = false;
            this.root.dataset.playing = 'false';
        }

        getNextTrack(step = 1, options = {}) {
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
            let nextIndex = (currentIndex >= 0 ? currentIndex : 0) + step;
            if (nextIndex >= this.catalogOrder.length) {
                if (this.playbackSettings.repeatAll || options.allowWrap) {
                    nextIndex = 0;
                } else {
                    return null;
                }
            }
            if (nextIndex < 0) {
                if (this.playbackSettings.repeatAll || options.allowWrap) {
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

        seekByStep(direction) {
            const step = this.playbackSettings.seekStep || 10;
            this.nudgePlayback(step * direction);
        }

        skipTrack(step) {
            if (!this.state?.src) {
                const first = this.getNextTrack(step, { allowWrap: true }) || this.catalogOrder[0];
                if (first) {
                    this.setTrack(first, { startTime: 0, autoPlay: true });
                }
                return;
            }
            if (step < 0 && this.audio.currentTime > 3) {
                this.audio.currentTime = 0;
                this.persistState({ currentTime: 0 });
                return;
            }
            const nextMeta = this.getNextTrack(step, { allowWrap: true });
            if (!nextMeta) return;
            const shouldPlay = !this.audio.paused || this.state?.isPlaying !== false;
            this.setTrack(nextMeta, { startTime: 0, autoPlay: shouldPlay });
        }

        togglePlayback() {
            if (!this.state?.src) {
                const first = this.playbackSettings.shuffle && this.catalogOrder.length
                    ? this.catalogOrder[Math.floor(Math.random() * this.catalogOrder.length)]
                    : this.catalogOrder[0];
                if (first) {
                    this.setTrack(first, { startTime: 0, autoPlay: true });
                }
                return;
            }
            if (this.audio.paused) {
                this.desiredPlaying = true;
                this.audio.play().catch((err) => console.warn('[PersistentPlayer] Play failed', err));
            } else {
                this.desiredPlaying = false;
                this.audio.pause();
            }
        }

        resumePendingPlayback() {
            if (!this.state?.resumePending || !this.state?.src || !this.audio?.paused) return;
            this.desiredPlaying = true;
            this.audio.play()
                .then(() => this.persistState({ isPlaying: true, resumePending: false, currentTime: this.audio.currentTime }))
                .catch(() => {});
        }

        toggleOptions(force) {
            const next = typeof force === 'boolean' ? force : this.root.dataset.optionsOpen !== 'true';
            this.root.dataset.optionsOpen = next ? 'true' : 'false';
            if (this.optionsToggle) {
                this.optionsToggle.setAttribute('aria-expanded', next ? 'true' : 'false');
            }
            this.schedulePositionClamp();
        }

        toggleMode(mode) {
            if (mode === 'autoplay') {
                this.playbackSettings.autoplayNext = !this.playbackSettings.autoplayNext;
            } else if (mode === 'shuffle') {
                this.playbackSettings.shuffle = !this.playbackSettings.shuffle;
            } else if (mode === 'repeat') {
                this.playbackSettings.repeatAll = !this.playbackSettings.repeatAll;
            } else if (mode === 'loop') {
                this.playbackSettings.loopOne = !this.playbackSettings.loopOne;
                if (this.playbackSettings.loopOne) {
                    this.playbackSettings.autoplayNext = true;
                }
            }
            if (this.audio) {
                this.audio.loop = false;
            }
            this.updateModeButtons();
            this.persistState();
        }

        updateModeButtons() {
            if (!this.modeButtons) return;
            const setPressed = (buttons, pressed) => {
                (Array.isArray(buttons) ? buttons : [buttons]).filter(Boolean).forEach((button) => {
                    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
                });
            };
            setPressed(this.modeButtons.autoplay, this.playbackSettings.autoplayNext);
            setPressed(this.modeButtons.shuffle, this.playbackSettings.shuffle);
            setPressed(this.modeButtons.repeat, this.playbackSettings.repeatAll);
            setPressed(this.modeButtons.loop, this.playbackSettings.loopOne);
            if (this.seekLabel) {
                this.seekLabel.textContent = `Seek ${this.playbackSettings.seekStep || 10}s`;
            }
            this.seekStepButtons?.forEach((button) => {
                button.setAttribute('aria-pressed', Number(button.dataset.seekStep) === Number(this.playbackSettings.seekStep || 10) ? 'true' : 'false');
            });
        }

        setSeekStep(step) {
            const allowed = [5, 10, 30];
            this.playbackSettings.seekStep = allowed.includes(step) ? step : 10;
            this.updateModeButtons();
            this.persistState();
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
            if (this.isPageLeaving) {
                return;
            }
            const isPlaying = !this.audio.paused && !this.audio.ended;
            if (!isPlaying && this.desiredPlaying && document.visibilityState === 'hidden') {
                return;
            }
            if (!isPlaying && this.suppressPausePersist) {
                return;
            }
            if (!isPlaying && this.desiredPlaying && this.state?.resumePending) {
                return;
            }
            this.root.dataset.playing = isPlaying ? 'true' : 'false';
            if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
                navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
            }
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
                writerId: this.instanceId,
                playbackSettings: this.playbackSettings,
                volume: this.volume,
                uiState: {
                    minimized: this.root?.dataset?.minimized === 'true',
                    position: this.positionMode === 'manual' ? this.uiState?.position || null : null,
                    positionMode: this.positionMode === 'manual' ? 'manual' : 'anchored',
                },
            };
            this.state = next;
            safeStorage.set(STORAGE_KEY, JSON.stringify(next));
            this.highlightActiveTrack();
            if (this.root?.dataset?.docked === 'true') {
                this.updateDockButton(true);
            }
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
            const meta = this.findMetaForSrc(this.state.src);
            if (meta?.trackElement) {
                meta.trackElement.setAttribute('data-persistent-active', 'true');
            }
        }

        stopAndHide() {
            this.audio.pause();
            this.desiredPlaying = false;
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

            const prefersDesktop = window.matchMedia('(min-width: 521px)').matches;
            const desktop = document.querySelector('.desktop');
            const mobileCredits = document.querySelector('.mobile-landing .retro-credits');
            const creditsSection = document.querySelector('.retro-credits');
            const host = (prefersDesktop && desktop) ? desktop : (mobileCredits || creditsSection);
            if (!host) return;

            // Create an autoplay trigger button
            const autoplayTrigger = document.createElement('button');
            autoplayTrigger.type = 'button';
            autoplayTrigger.id = 'autoplay-trigger';
            autoplayTrigger.textContent = 'PLAY';
            autoplayTrigger.setAttribute('aria-label', 'Start playing music');
            autoplayTrigger.draggable = false;
            if (prefersDesktop && desktop) {
                autoplayTrigger.dataset.floating = 'true';
            }

            // Add styles if not already present
            if (!document.getElementById('autoplay-trigger-styles')) {
                const style = document.createElement('style');
                style.id = 'autoplay-trigger-styles';
                style.textContent = `
                    #autoplay-trigger {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
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
                        user-select: none;
                        transition: all 0.3s ease;
                        box-shadow: 0 0 10px rgba(102, 217, 255, 0.3);
                        animation: buttonGlow 2s ease-in-out infinite;
                    }
                    #autoplay-trigger[data-floating="true"] {
                        position: absolute;
                        z-index: 6;
                        margin-top: 0;
                        cursor: grab;
                        touch-action: none;
                    }
                    #autoplay-trigger.is-dragging {
                        cursor: grabbing;
                        opacity: 0.9;
                        animation: none;
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
                        color: #8ab4ff;
                        border-color: #8ab4ff;
                        box-shadow: 0 0 20px rgba(138, 180, 255, 0.5);
                        text-shadow: 0 0 12px rgba(138, 180, 255, 0.8);
                    }
                    #autoplay-trigger:active {
                        transform: scale(0.98);
                    }
                `;
                document.head.appendChild(style);
            }

            host.appendChild(autoplayTrigger);

            if (prefersDesktop && desktop) {
                const bucket = window.matchMedia('(max-width: 1024px)').matches ? 'tablet' : 'desktop';
                const storageKey = `idcDesktopPlayButton:${bucket}`;
                const loadPosition = () => {
                    try {
                        const raw = window.localStorage.getItem(storageKey);
                        return raw ? JSON.parse(raw) : null;
                    } catch (err) {
                        return null;
                    }
                };
                const savePosition = (pos) => {
                    try {
                        window.localStorage.setItem(storageKey, JSON.stringify(pos));
                    } catch (err) {
                        console.warn('[PersistentPlayer] Unable to save play button position', err);
                    }
                };
                const placeDefault = () => {
                    const desktopRect = desktop.getBoundingClientRect();
                    const buttonRect = autoplayTrigger.getBoundingClientRect();
                    const defaultX = clamp((desktopRect.width - buttonRect.width) / 2, 0, desktopRect.width - buttonRect.width);
                    const defaultY = clamp(desktopRect.height - buttonRect.height - 140, 0, desktopRect.height - buttonRect.height);
                    autoplayTrigger.style.left = `${defaultX}px`;
                    autoplayTrigger.style.top = `${defaultY}px`;
                };
                const saved = (() => {
                    const value = loadPosition();
                    if (value) return value;
                    try {
                        const legacyRaw = window.localStorage.getItem('idcDesktopPlayButton');
                        return legacyRaw ? JSON.parse(legacyRaw) : null;
                    } catch (err) {
                        return null;
                    }
                })();
                if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
                    autoplayTrigger.style.left = `${saved.x}px`;
                    autoplayTrigger.style.top = `${saved.y}px`;
                } else {
                    placeDefault();
                }

                const handlePointerDown = (event) => {
                    if (event.button !== 0) return;
                    autoplayTrigger.dataset.dragged = 'false';
                    const buttonRect = autoplayTrigger.getBoundingClientRect();
                    const desktopRect = desktop.getBoundingClientRect();
                    const offsetX = event.clientX - buttonRect.left;
                    const offsetY = event.clientY - buttonRect.top;
                    const width = buttonRect.width;
                    const height = buttonRect.height;
                    let moved = false;
                    const startX = event.clientX;
                    const startY = event.clientY;

                    autoplayTrigger.classList.add('is-dragging');
                    autoplayTrigger.setPointerCapture(event.pointerId);

                    const move = (moveEvent) => {
                        const dx = Math.abs(moveEvent.clientX - startX);
                        const dy = Math.abs(moveEvent.clientY - startY);
                        if (dx > 4 || dy > 4) moved = true;
                        const nextX = clamp(moveEvent.clientX - desktopRect.left - offsetX, 0, desktopRect.width - width);
                        const nextY = clamp(moveEvent.clientY - desktopRect.top - offsetY, 0, desktopRect.height - height);
                        autoplayTrigger.style.left = `${nextX}px`;
                        autoplayTrigger.style.top = `${nextY}px`;
                    };

                    const end = () => {
                        autoplayTrigger.classList.remove('is-dragging');
                        autoplayTrigger.releasePointerCapture(event.pointerId);
                        autoplayTrigger.removeEventListener('pointermove', move);
                        autoplayTrigger.removeEventListener('pointerup', end);
                        autoplayTrigger.removeEventListener('pointercancel', end);
                        if (moved) {
                            autoplayTrigger.dataset.dragged = 'true';
                            savePosition({
                                x: parseFloat(autoplayTrigger.style.left) || 0,
                                y: parseFloat(autoplayTrigger.style.top) || 0,
                            });
                        }
                    };

                    autoplayTrigger.addEventListener('pointermove', move);
                    autoplayTrigger.addEventListener('pointerup', end);
                    autoplayTrigger.addEventListener('pointercancel', end);
                };

                autoplayTrigger.addEventListener('pointerdown', handlePointerDown);
            }

            autoplayTrigger.addEventListener('click', (event) => {
                if (autoplayTrigger.dataset.dragged === 'true') {
                    autoplayTrigger.dataset.dragged = 'false';
                    event.preventDefault();
                    return;
                }
                this.autoStartAttempted = true;
                this.playbackSettings.autoplayNext = true;
                this.playbackSettings.shuffle = true;
                this.playbackSettings.repeatAll = true;
                this.playbackSettings.loopOne = false;
                this.playbackSettings.seekStep = this.playbackSettings.seekStep || 10;
                if (this.audio) {
                    this.audio.loop = false;
                }
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
            });
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


