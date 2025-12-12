/**
 * SONIC ARCHITECT MK.III
 * UIManager - UI State Management and Event Handling
 *
 * Features:
 * - Panel visibility management
 * - Mobile navigation handling
 * - Theme switching
 * - Keyboard shortcuts
 * - Responsive breakpoint detection
 */

import { eventBus, Events } from '../utils/EventBus.js';
import { storage } from '../utils/Storage.js';

// Breakpoint definitions
const BREAKPOINTS = {
    mobile: 0,
    tablet: 480,
    tabletLandscape: 768,
    desktop: 1024
};

class UIManager {
    constructor() {
        // UI State
        this.isUIVisible = true;
        this.activePanel = null;
        this.previousPanel = null;
        this.isFullscreen = false;

        // Responsive state
        this.currentBreakpoint = 'mobile';
        this.isMobile = true;
        this.isTablet = false;
        this.isDesktop = false;

        // Theme
        this.currentTheme = 'cyber';
        this.themes = [
            'cyber', 'vapor', 'matrix', 'sunset', 'void',
            'aurora', 'retrowave', 'bloodmoon', 'hologram', 'custom'
        ];

        // Settings modal
        this.isSettingsOpen = false;

        // DOM references
        this.elements = {};

        // Bound methods
        this.handleResize = this.handleResize.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);

        // Storage key
        this.storageKey = 'sonic-ui-settings';
    }

    /**
     * Initialize UI manager
     */
    init() {
        this.cacheElements();
        this.setupEventListeners();
        this.detectBreakpoint();
        this.loadSettings();

        console.log('🎛️ UIManager initialized');
        return this;
    }

    /**
     * Cache DOM element references
     */
    cacheElements() {
        this.elements = {
            app: document.querySelector('.app'),
            header: document.querySelector('.header'),
            leftPanel: document.querySelector('.panel--left'),
            rightPanel: document.querySelector('.panel--right'),
            playerBar: document.querySelector('.player-bar'),
            mobileNav: document.querySelector('.mobile-nav'),
            settingsModal: document.getElementById('settings-modal'),
            overlay: document.querySelector('.overlay'),

            // Player controls
            playBtn: document.getElementById('play-btn'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn'),
            shuffleBtn: document.getElementById('shuffle-btn'),
            repeatBtn: document.getElementById('repeat-btn'),
            volumeSlider: document.getElementById('volume-slider'),
            progressBar: document.querySelector('.progress-bar'),

            // Track info
            trackName: document.querySelector('.track-name'),
            trackArtist: document.querySelector('.track-artist'),
            albumArt: document.querySelector('.album-art'),
            currentTime: document.querySelector('.current-time'),
            totalTime: document.querySelector('.total-time'),

            // Mobile nav items
            navItems: document.querySelectorAll('.mobile-nav__item'),

            // Theme buttons
            themeButtons: document.querySelectorAll('.theme-btn'),

            // Settings
            settingsBtn: document.querySelector('[data-action="settings"]'),
            closeSettingsBtn: document.querySelector('.modal__close'),

            // Visualizer mode buttons
            visualizerBtns: document.querySelectorAll('[data-visualizer]'),

            // Control sliders
            controlSliders: document.querySelectorAll('.slider-control input')
        };
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Window events
        window.addEventListener('resize', this.handleResize);
        window.addEventListener('keydown', this.handleKeydown);

        // Mobile nav
        this.elements.navItems?.forEach(item => {
            item.addEventListener('click', (e) => {
                const panel = e.currentTarget.dataset.panel;
                if (panel) this.togglePanel(panel);
            });
        });

        // Theme buttons
        this.elements.themeButtons?.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const theme = e.currentTarget.dataset.theme;
                if (theme) this.setTheme(theme);
            });
        });

        // Settings modal
        this.elements.settingsBtn?.addEventListener('click', () => {
            this.openSettings();
        });

        this.elements.closeSettingsBtn?.addEventListener('click', () => {
            this.closeSettings();
        });

        this.elements.overlay?.addEventListener('click', () => {
            this.closeSettings();
            this.closeActivePanel();
        });

        // Fullscreen button
        const fullscreenBtn = document.querySelector('[data-action="fullscreen"]');
        fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());

        // Listen to custom events
        eventBus.on(Events.AUDIO_LOAD, this.updateTrackInfo.bind(this));
        eventBus.on(Events.AUDIO_PLAY, this.updatePlayState.bind(this));
        eventBus.on(Events.AUDIO_PAUSE, this.updatePlayState.bind(this));
        eventBus.on(Events.AUDIO_TIME_UPDATE, this.updateProgress.bind(this));
        eventBus.on(Events.PLAYLIST_TRACK_CHANGE, this.handleTrackChange.bind(this));
        eventBus.on(Events.SHUFFLE_CHANGE, this.updateShuffleState.bind(this));
        eventBus.on(Events.PLAYBACK_MODE_CHANGE, this.updateRepeatState.bind(this));
    }

    /**
     * Handle window resize
     */
    handleResize() {
        this.detectBreakpoint();
    }

    /**
     * Detect current breakpoint
     */
    detectBreakpoint() {
        const width = window.innerWidth;
        let newBreakpoint = 'mobile';

        if (width >= BREAKPOINTS.desktop) {
            newBreakpoint = 'desktop';
        } else if (width >= BREAKPOINTS.tabletLandscape) {
            newBreakpoint = 'tabletLandscape';
        } else if (width >= BREAKPOINTS.tablet) {
            newBreakpoint = 'tablet';
        }

        if (newBreakpoint !== this.currentBreakpoint) {
            const previousBreakpoint = this.currentBreakpoint;
            this.currentBreakpoint = newBreakpoint;

            this.isMobile = newBreakpoint === 'mobile';
            this.isTablet = newBreakpoint === 'tablet' || newBreakpoint === 'tabletLandscape';
            this.isDesktop = newBreakpoint === 'desktop';

            // Close mobile panels when switching to desktop
            if (this.isDesktop && this.activePanel) {
                this.closeActivePanel();
            }

            eventBus.emit(Events.BREAKPOINT_CHANGE, {
                from: previousBreakpoint,
                to: newBreakpoint,
                isMobile: this.isMobile,
                isDesktop: this.isDesktop
            });
        }
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeydown(e) {
        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                eventBus.emit(Events.TOGGLE_PLAY);
                break;

            case 'arrowleft':
                if (e.shiftKey) {
                    eventBus.emit(Events.PREV_TRACK);
                } else {
                    eventBus.emit(Events.SEEK, { delta: -5 });
                }
                break;

            case 'arrowright':
                if (e.shiftKey) {
                    eventBus.emit(Events.NEXT_TRACK);
                } else {
                    eventBus.emit(Events.SEEK, { delta: 5 });
                }
                break;

            case 'arrowup':
                e.preventDefault();
                eventBus.emit(Events.VOLUME_CHANGE, { delta: 0.1 });
                break;

            case 'arrowdown':
                e.preventDefault();
                eventBus.emit(Events.VOLUME_CHANGE, { delta: -0.1 });
                break;

            case 'm':
                eventBus.emit(Events.TOGGLE_MUTE);
                break;

            case 'f':
                this.toggleFullscreen();
                break;

            case 'h':
                this.toggleUI();
                break;

            case 's':
                if (!e.ctrlKey) {
                    eventBus.emit(Events.TOGGLE_SHUFFLE);
                }
                break;

            case 'r':
                eventBus.emit(Events.CYCLE_REPEAT);
                break;

            case 'n':
                eventBus.emit(Events.NEXT_TRACK);
                break;

            case 'p':
                eventBus.emit(Events.PREV_TRACK);
                break;

            case 'escape':
                if (this.isSettingsOpen) {
                    this.closeSettings();
                } else if (this.activePanel) {
                    this.closeActivePanel();
                } else if (this.isFullscreen) {
                    this.exitFullscreen();
                }
                break;

            // Number keys 1-9 for visualizer modes
            default:
                if (e.key >= '1' && e.key <= '9') {
                    const index = parseInt(e.key) - 1;
                    eventBus.emit(Events.SWITCH_VISUALIZER, { index });
                }
        }
    }

    /**
     * Toggle panel visibility
     */
    togglePanel(panelName) {
        const panel = panelName === 'controls' ?
            this.elements.leftPanel :
            this.elements.rightPanel;

        if (!panel) return;

        // Close other panels on mobile
        if (this.isMobile || this.isTablet) {
            if (this.activePanel && this.activePanel !== panelName) {
                this.closeActivePanel();
            }
        }

        const isOpen = panel.classList.contains('is-open');

        if (isOpen) {
            panel.classList.remove('is-open');
            this.elements.overlay?.classList.remove('is-visible');
            this.activePanel = null;
        } else {
            panel.classList.add('is-open');
            if (this.isMobile || this.isTablet) {
                this.elements.overlay?.classList.add('is-visible');
            }
            this.activePanel = panelName;
        }

        // Update nav item active state
        this.elements.navItems?.forEach(item => {
            item.classList.toggle('active', item.dataset.panel === this.activePanel);
        });
    }

    /**
     * Close active panel
     */
    closeActivePanel() {
        if (!this.activePanel) return;

        const panel = this.activePanel === 'controls' ?
            this.elements.leftPanel :
            this.elements.rightPanel;

        panel?.classList.remove('is-open');
        this.elements.overlay?.classList.remove('is-visible');

        this.elements.navItems?.forEach(item => {
            item.classList.remove('active');
        });

        this.activePanel = null;
    }

    /**
     * Toggle UI visibility
     */
    toggleUI() {
        this.isUIVisible = !this.isUIVisible;
        this.elements.app?.classList.toggle('ui-hidden', !this.isUIVisible);

        eventBus.emit(Events.UI_VISIBILITY_CHANGE, { visible: this.isUIVisible });
    }

    /**
     * Set theme
     */
    setTheme(themeName) {
        if (!this.themes.includes(themeName)) return;

        // Remove previous theme
        this.themes.forEach(t => {
            document.documentElement.classList.remove(`theme-${t}`);
        });

        // Add new theme
        document.documentElement.classList.add(`theme-${themeName}`);
        this.currentTheme = themeName;

        // Update theme button states
        this.elements.themeButtons?.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeName);
        });

        eventBus.emit(Events.THEME_CHANGE, { theme: themeName });
        this.saveSettings();
    }

    /**
     * Toggle fullscreen
     */
    async toggleFullscreen() {
        if (this.isFullscreen) {
            await this.exitFullscreen();
        } else {
            await this.enterFullscreen();
        }
    }

    /**
     * Enter fullscreen
     */
    async enterFullscreen() {
        try {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                await elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                await elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                await elem.msRequestFullscreen();
            }
            this.isFullscreen = true;
            eventBus.emit(Events.FULLSCREEN_CHANGE, { fullscreen: true });
        } catch (error) {
            console.warn('Fullscreen failed:', error);
        }
    }

    /**
     * Exit fullscreen
     */
    async exitFullscreen() {
        try {
            if (document.exitFullscreen) {
                await document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                await document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                await document.msExitFullscreen();
            }
            this.isFullscreen = false;
            eventBus.emit(Events.FULLSCREEN_CHANGE, { fullscreen: false });
        } catch (error) {
            console.warn('Exit fullscreen failed:', error);
        }
    }

    /**
     * Open settings modal
     */
    openSettings() {
        this.elements.settingsModal?.classList.add('is-open');
        this.elements.overlay?.classList.add('is-visible');
        this.isSettingsOpen = true;
    }

    /**
     * Close settings modal
     */
    closeSettings() {
        this.elements.settingsModal?.classList.remove('is-open');
        if (!this.activePanel) {
            this.elements.overlay?.classList.remove('is-visible');
        }
        this.isSettingsOpen = false;
    }

    /**
     * Update track info display
     */
    updateTrackInfo(data) {
        if (this.elements.trackName) {
            this.elements.trackName.textContent = data.name || 'Unknown Track';
        }
        if (this.elements.trackArtist) {
            this.elements.trackArtist.textContent = data.artist || '';
        }
        if (this.elements.totalTime) {
            this.elements.totalTime.textContent = this.formatTime(data.duration);
        }
        if (this.elements.albumArt && data.albumArtUrl) {
            this.elements.albumArt.src = data.albumArtUrl;
        }
    }

    /**
     * Handle track change from playlist
     */
    handleTrackChange(data) {
        this.updateTrackInfo(data.track);
    }

    /**
     * Update play/pause button state
     */
    updatePlayState(data) {
        const isPlaying = data?.playing !== false;
        this.elements.playBtn?.classList.toggle('is-playing', isPlaying);
    }

    /**
     * Update progress bar
     */
    updateProgress(data) {
        if (this.elements.progressBar) {
            this.elements.progressBar.style.setProperty('--progress', `${data.progress * 100}%`);
        }
        if (this.elements.currentTime) {
            this.elements.currentTime.textContent = this.formatTime(data.currentTime);
        }
    }

    /**
     * Update shuffle button state
     */
    updateShuffleState(data) {
        this.elements.shuffleBtn?.classList.toggle('active', data.enabled);
    }

    /**
     * Update repeat button state
     */
    updateRepeatState(data) {
        const btn = this.elements.repeatBtn;
        if (!btn) return;

        btn.classList.remove('repeat-one', 'repeat-all');

        if (data.mode === 'repeat-one') {
            btn.classList.add('active', 'repeat-one');
        } else if (data.mode === 'repeat-all') {
            btn.classList.add('active', 'repeat-all');
        } else {
            btn.classList.remove('active');
        }
    }

    /**
     * Format time in MM:SS
     */
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Save settings to storage
     */
    async saveSettings() {
        await storage.setLocal(this.storageKey, {
            theme: this.currentTheme,
            isUIVisible: this.isUIVisible
        });
    }

    /**
     * Load settings from storage
     */
    async loadSettings() {
        const settings = await storage.getLocal(this.storageKey);

        if (settings) {
            if (settings.theme) {
                this.setTheme(settings.theme);
            }
        }
    }

    /**
     * Get current UI state
     */
    getState() {
        return {
            isUIVisible: this.isUIVisible,
            activePanel: this.activePanel,
            isFullscreen: this.isFullscreen,
            isSettingsOpen: this.isSettingsOpen,
            currentBreakpoint: this.currentBreakpoint,
            isMobile: this.isMobile,
            isDesktop: this.isDesktop,
            currentTheme: this.currentTheme
        };
    }

    /**
     * Cleanup
     */
    destroy() {
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('keydown', this.handleKeydown);
    }
}

// Export singleton
export const uiManager = new UIManager();
export default uiManager;
