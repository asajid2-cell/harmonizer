// OurSpace Core - Initialization and Storage Management

(function() {
    'use strict';

    const EFFECT_DEFAULTS = {
        falling: { enabled: false, type: "hearts", speed: 2, density: 1 },
        cursorTrail: {
            enabled: false,
            style: "sparkle",
            colorMode: "rainbow",
            customColor: "#ff7cf5",
            length: 1,
            size: 1
        },
        blink: { enabled: false, speed: 1 },
        glitter: { enabled: false, intensity: 0.7 },
        sparkleRain: { enabled: false, density: 1 },
        auroraWaves: {
            enabled: false,
            intensity: 0.4,
            speed: 1,
            colorA: "#47ffe3",
            colorB: "#ff4ffb"
        },
        pixelBurst: { enabled: false },
        neonPulse: { enabled: false, color: "#00fff5", accent: "#ff00ff", speed: 1.2 },
        polaroidPopups: { enabled: false, interval: 4 },
        bubbleWarp: { enabled: false, size: 1 },
        retroScanlines: { enabled: false, opacity: 0.18 },
        chromaticTrails: { enabled: false, length: 0.9, mode: "sunset" },
        floatingEmojis: { enabled: false, density: 1 },
        lightningFlickers: { enabled: false, intensity: 0.8, frequency: 6 }
    };

    const STICKER_FRAME_STYLES = [
        'none',
        'notebook',
        'magazine',
        'polaroid',
        'photocard',
        'holographic',
        'glitter',
        'taped',
        'neon',
        'burnt'
    ];

    const FRAME_TEXT_DEFAULTS = {
        magazine: {
            text: 'FEATURED',
            color: '#3c3c3c'
        },
        polaroid: {
            text: 'ourspace',
            color: '#2f2f2f'
        }
    };

    const frameSupportsText = (style) => Object.prototype.hasOwnProperty.call(FRAME_TEXT_DEFAULTS, style);
    const getFrameTextDefaults = (style) => FRAME_TEXT_DEFAULTS[style] || { text: '', color: '' };

    // Default profile data structure
    const DEFAULT_PROFILE = {
        version: "1.0",
        profile: {
            name: "Your Name Here",
            tagline: "✨ living my best life ✨",
            profilePic: "",
            profilePicOffset: { x: 50, y: 50 },
            bannerImage: "",
            bannerOffset: { x: 50, y: 50 },
            mood: { icon: "😎", text: "chillin" },
            onlineStatus: true
        },
        stickers: [],
        stickerDeck: [],
        theme: {
            name: "glitter",
            colors: {
                background: "#ff69b4",
                text: "#ffffff",
                links: "#00ffff",
                linksHover: "#ff00ff",
                borders: "#ffffff",
                labelText: "#00aaff",
                widgetBg: "#000000",
                widgetBgOpacity: 70
            },
            fonts: {
                family: "Comic Sans MS",
                size: 14,
                effects: {
                    shadow: false,
                    glow: false,
                    glowColor: "#ffffff"
                }
            },
            background: {
                type: "pattern",
                pattern: "hearts",
                image: "",
                repeat: "repeat",
                attachment: "fixed",
                gradient: "",
                size: "auto",
                customSize: 100,
                position: "center",
                transform: {
                    scale: 1,
                    rotate: 0,
                    skewX: 0,
                    skewY: 0,
                    flipX: false,
                    flipY: false
                },
                filter: {
                    blur: 0,
                    brightness: 100,
                    contrast: 100,
                    saturate: 100,
                    hueRotate: 0,
                    invert: 0,
                    sepia: 0,
                    grayscale: 0
                },
                blend: {
                    mode: "normal",
                    opacity: 100
                }
            },
            effects: JSON.parse(JSON.stringify(EFFECT_DEFAULTS))
        },
        widgets: {
            aboutMe: {
                visible: true,
                content: "<p>Hey! Thanks for visiting my page! 🎉</p><p>This is my corner of the internet where I share my pics, music, and vibes.</p><p>Feel free to leave a comment! 💕</p>"
            },
            pictureWall: {
                visible: true,
                images: [],
                columns: 4,
                rows: 4,
                gap: "10px",
                frameStyle: "classic"
            },
            topFriends: {
                visible: true,
                slots: 8,
                friends: []
            },
            music: {
                visible: true,
                audioUrl: "",
                audioData: "",
                title: "No track loaded",
                autoplay: false,
                volume: 70
            },
            comments: {
                visible: true,
                entries: []
            },
            interests: {
                visible: true,
                music: "Artist 1, Artist 2, Artist 3",
                movies: "Movie 1, Movie 2, Movie 3",
                tv: "Show 1, Show 2, Show 3",
                books: "Book 1, Book 2, Book 3"
            },
            customHtml: {
                visible: true,
                html: "",
                global: ""
            }
        },
        layout: {
            preset: "classic"
        },
        meta: {
            created: Date.now(),
            lastModified: Date.now(),
            visits: 0
        }
    };

    function mergeEffectConfig(defaultConfig, currentConfig) {
        if (typeof defaultConfig !== "object" || defaultConfig === null) {
            return currentConfig !== undefined ? currentConfig : defaultConfig;
        }

        let source = currentConfig;
        if (typeof currentConfig === "boolean") {
            source = { enabled: currentConfig };
        } else if (typeof currentConfig !== "object" || currentConfig === null) {
            source = {};
        }

        const merged = {};
        for (const key of Object.keys(defaultConfig)) {
            merged[key] = mergeEffectConfig(defaultConfig[key], source[key]);
        }
        for (const key of Object.keys(source)) {
            if (!(key in merged)) {
                merged[key] = source[key];
            }
        }
        return merged;
    }

    function mergeEffectDefaults(effects) {
        const current = effects || {};
        const merged = {};
        for (const key of Object.keys(EFFECT_DEFAULTS)) {
            merged[key] = mergeEffectConfig(EFFECT_DEFAULTS[key], current[key]);
        }
        for (const key of Object.keys(current)) {
            if (!(key in merged)) {
                merged[key] = current[key];
            }
        }
        return merged;
    }

    // Global OurSpace object
    window.OurSpace = {
        profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)), // Initialize with default to prevent null errors
        viewMode: false,
        _themeFrame: null,
        isAuthenticated: false,
        _authPromise: null,
        _lastAuthCheck: 0,
        profileSource: 'default',
        profileLoadIssue: false,
        loadFailureAlertShown: false,
        viewingUsername: null,
        _commentMigrationDone: false,
        stickerLayer: null,
        stickerDeckGrid: null,
        stickerDeckEmpty: null,
        stickerState: {
            activeId: null,
            dragging: null
        },

        // Initialize the OurSpace page
        init: async function() {
            console.log("[OurSpace] Initializing...");

            const searchParams = new URLSearchParams(window.location.search);
            if (!searchParams.has('user')) {
                searchParams.set('user', '');
                const nextUrl = `${window.location.pathname}?${searchParams.toString()}`;
                window.history.replaceState({}, '', nextUrl);
            }

            const urlUser = searchParams.get('user');
            if (urlUser) {
                this.viewingUsername = urlUser;
            }

            // Load profile from server or localStorage
            await this.loadProfile();
            this.ensureStickerData();
            this.initStickerLayer();

            // Load view mode preference
            this.loadViewMode();

            // Note: We do NOT update visits or lastModified here to avoid falsely marking profile as changed
            console.log("[OurSpace] Profile loaded. Changes will only be saved when you click Save Profile button.");

            // Apply theme and customizations
            this.applyTheme(true);
            this.loadContent();
            this.updateStats();

            // Setup mode toggle
            this.setupModeToggle();

            // Load custom layout if exists
            if (window.OurSpaceLayoutEditor && this.profile.layout && this.profile.layout.grid) {
                setTimeout(() => {
                    window.OurSpaceLayoutEditor.updateFromProfile();
                }, 500);
            }

            // Setup beforeunload warning for unsaved changes
            this.setupUnsavedChangesWarning();

            console.log("[OurSpace] Initialization complete");
        },

        setupUnsavedChangesWarning: function() {
            // Track when profile was last saved
            this._lastSavedTimestamp = this.profile.meta.lastModified || 0;

            // Warn before leaving page if there are unsaved changes
            window.addEventListener('beforeunload', (e) => {
                const currentTimestamp = this.profile.meta.lastModified || 0;
                const hasUnsavedChanges = currentTimestamp > this._lastSavedTimestamp;

                if (hasUnsavedChanges) {
                    const message = 'You have unsaved changes! Are you sure you want to leave?';
                    e.preventDefault();
                    e.returnValue = message;
                    return message;
                }
            });
        },

        setAuthState: function(state) {
            this.isAuthenticated = !!state;
            this._lastAuthCheck = Date.now();
            if (typeof this.updateProfileLoadWarning === 'function') {
                this.updateProfileLoadWarning();
            }
        },

        refreshAuthState: async function(force = false) {
            const now = Date.now();

            if (!force && !this._authPromise && now - this._lastAuthCheck < 15000) {
                return this.isAuthenticated;
            }

            if (this._authPromise && !force) {
                return this._authPromise;
            }

            const promise = fetch('/api/ourspace/me', {
                method: 'GET',
                cache: 'no-store'
            })
                .then(response => response.ok ? response.json() : { authenticated: false })
                .then(data => {
                    const moduleState = (window.OurSpaceAuth && typeof window.OurSpaceAuth.isAuthenticated === 'boolean')
                        ? window.OurSpaceAuth.isAuthenticated
                        : null;
                    const resolved = moduleState !== null ? moduleState : !!data.authenticated;
                    this.setAuthState(resolved);
                    return this.isAuthenticated;
                })
                .catch(() => {
                    const fallback = !!(window.OurSpaceAuth && window.OurSpaceAuth.isAuthenticated);
                    this.setAuthState(fallback);
                    return this.isAuthenticated;
                })
                .finally(() => {
                    this._authPromise = null;
                });

            this._authPromise = promise;
            return promise;
        },

        backupProfileLocally: function() {
            try {
                localStorage.setItem('ourspace-profile', JSON.stringify(this.profile));
                return true;
            } catch (error) {
                console.warn("[OurSpace] Unable to store local backup:", error);
                return false;
            }
        },

        showProfileLoadWarning: function(message) {
            this.profileLoadIssue = true;
            if (typeof document === 'undefined' || !document.body) return;

            let banner = document.getElementById('profile-load-warning');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'profile-load-warning';
                banner.style.cssText = `
                    position: fixed;
                    top: 12px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #b00020;
                    color: #ffffff;
                    padding: 10px 18px;
                    border-radius: 999px;
                    z-index: 10030;
                    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
                    font-family: 'Comic Sans MS', cursive;
                    font-size: 14px;
                    text-align: center;
                `;
                document.body.appendChild(banner);
            }
            banner.textContent = message;
        },

        clearProfileLoadWarning: function() {
            if (typeof document === 'undefined') {
                this.profileLoadIssue = false;
                this.loadFailureAlertShown = false;
                return;
            }
            this.profileLoadIssue = false;
            this.loadFailureAlertShown = false;
            const banner = document.getElementById('profile-load-warning');
            if (banner) {
                banner.remove();
            }
        },

        updateProfileLoadWarning: function() {
            if (this.isAuthenticated && this.profileSource === 'default') {
                this.showProfileLoadWarning("We couldn't load your saved profile. Please refresh or re-login before editing.");
            } else {
                this.clearProfileLoadWarning();
            }
        },

        // Load profile from persistent storage
        loadProfile: async function() {
            const isAuthenticated = await this.refreshAuthState();
            const profiles = [];

            // Load all available profiles with timestamps
            if (isAuthenticated) {
                const dbProfile = await this._loadProfileCandidate('/api/ourspace/profile/load', 'database');
                if (dbProfile) profiles.push(dbProfile);
            }

            const sessionProfile = await this._loadProfileCandidate('/api/ourspace/profile', 'session');
            if (sessionProfile) profiles.push(sessionProfile);

            const localProfile = this._loadProfileCandidateFromLocalStorage();
            if (localProfile) profiles.push(localProfile);

            // Priority order: localStorage > database > session > default
            // This ensures that local changes are NEVER overwritten by remote data
            if (profiles.length > 0) {
                const priorityOrder = {
                    'local': 1,
                    'database': 2,
                    'session': 3
                };

                profiles.sort((a, b) => {
                    return (priorityOrder[a.source] || 999) - (priorityOrder[b.source] || 999);
                });

                const selected = profiles[0];
                this.profile = selected.data;
                this.profileSource = selected.source;
                this.backupProfileLocally();
                console.log(`[OurSpace] Loaded profile from ${selected.source} (priority-based, NOT timestamp-based)`);
            } else {
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                this.profileSource = 'default';
                this.backupProfileLocally();
                console.log("[OurSpace] Created new profile");
            }

            this.updateProfileLoadWarning();
            this.ensureStickerData();
        },

        _loadProfileCandidate: async function(endpoint, sourceLabel) {
            try {
                const response = await fetch(endpoint, { cache: 'no-store' });
                if (!response.ok) return null;
                const data = await response.json();
                if (!data) return null;
                return { data, source: sourceLabel };
            } catch (error) {
                console.error(`[OurSpace] Error loading profile from ${endpoint}:`, error);
                return null;
            }
        },

        _loadProfileCandidateFromLocalStorage: function() {
            try {
                const saved = localStorage.getItem('ourspace-profile');
                if (!saved) return null;
                const data = JSON.parse(saved);
                return { data, source: 'local' };
            } catch (error) {
                console.error("[OurSpace] Error loading profile from localStorage:", error);
                return null;
            }
        },

        // Save profile to server
        saveProfile: async function() {
            // Throttle saves to prevent spam (but allow preset changes)
            const now = Date.now();
            if (this._lastSave && (now - this._lastSave) < 100) {
                return;
            }
            this._lastSave = now;

            try {
                if (this.isAuthenticated && this.profileSource === 'default') {
                    this.updateProfileLoadWarning();
                    const warningMessage = "Profile data wasn't loaded from the server yet. Refresh or re-login before saving.";
                    console.warn("[OurSpace] Save blocked:", warningMessage);
                    if (!this.loadFailureAlertShown) {
                        alert(warningMessage);
                        this.loadFailureAlertShown = true;
                    }
                    return false;
                }

                this.profile.meta.lastModified = Date.now();

                const moduleState = window.OurSpaceAuth && typeof window.OurSpaceAuth.isAuthenticated === 'boolean'
                    ? window.OurSpaceAuth.isAuthenticated
                    : null;

                if (moduleState !== null) {
                    this.setAuthState(moduleState);
                } else {
                    await this.refreshAuthState();
                }

                const useDatabase = this.isAuthenticated;

                // Save to primary location
                const primaryEndpoint = useDatabase ? '/api/ourspace/profile/save' : '/api/ourspace/profile';
                const primaryLabel = useDatabase ? 'database' : 'temporary storage';

                const primaryResponse = await fetch(primaryEndpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(this.profile)
                });

                if (!primaryResponse.ok) {
                    if (primaryResponse.status === 401 && useDatabase) {
                        this.setAuthState(false);
                    }
                    throw new Error(`Server save failed (${primaryResponse.status})`);
                }

                // If saved to database, also update session storage to keep them in sync
                if (useDatabase) {
                    try {
                        await fetch('/api/ourspace/profile', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(this.profile)
                        });
                    } catch (e) {
                        console.warn("[OurSpace] Failed to sync to session storage:", e);
                    }
                }

                // Update source to reflect where we successfully saved
                this.profileSource = useDatabase ? 'database' : 'session';
                this.backupProfileLocally();

                // Update last saved timestamp to track unsaved changes
                this._lastSavedTimestamp = this.profile.meta.lastModified;

                console.log(`[OurSpace] Profile saved successfully to ${primaryLabel} at ${new Date(this.profile.meta.lastModified).toLocaleTimeString()}`);
                return true;
            } catch (e) {
                console.error("[OurSpace] Error saving profile:", e);
                if (!this.backupProfileLocally()) {
                    alert("Error saving profile. Storage might be full.");
                    return false;
                }
                console.log("[OurSpace] Profile saved to local backup (fallback)");
                return true;
            }
        },

        // Reset profile to defaults
        resetProfile: function() {
            if (confirm("Are you sure you want to reset everything? This cannot be undone!")) {
                // Clear all widget inline styles (positions, sizes from grid editor)
                const allWidgets = document.querySelectorAll('.widget, #profile-header, .profile-header, .profile-picture, .profile-banner, .contact-section, .stat-container, .profile-info');
                allWidgets.forEach(widget => {
                    // Remove all inline positioning
                    widget.style.position = '';
                    widget.style.left = '';
                    widget.style.top = '';
                    widget.style.width = '';
                    widget.style.height = '';
                    widget.style.zIndex = '';

                    // Clear dataset attributes
                    delete widget.dataset.originalPosition;
                    delete widget.dataset.originalLeft;
                    delete widget.dataset.originalTop;
                    delete widget.dataset.originalWidth;
                    delete widget.dataset.originalHeight;

                    // Remove any editor classes
                    widget.classList.remove('layout-editable', 'dragging', 'resizing');
                });

                // Remove transform overlay if it exists
                const overlay = document.getElementById('bg-transform-overlay');
                if (overlay) {
                    overlay.remove();
                }

                // Disable grid editor if active
                if (window.OurSpaceLayoutEditor && window.OurSpaceLayoutEditor.enabled) {
                    window.OurSpaceLayoutEditor.toggle(false);
                    const layoutToggle = document.getElementById('layout-editor-toggle');
                    if (layoutToggle) layoutToggle.checked = false;
                }

                // Reset profile data
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                this.saveProfile();

                // Reload page to apply clean state
                location.reload();
            }
        },

        // Export profile as JSON file
        exportProfile: function() {
            const dataStr = JSON.stringify(this.profile, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);

            const link = document.createElement('a');
            link.href = url;
            link.download = 'ourspace-profile.json';
            link.click();

            URL.revokeObjectURL(url);
            console.log("[OurSpace] Profile exported");
        },

        // Import profile from JSON file
        importProfile: function(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = JSON.parse(e.target.result);
                    this.profile = imported;
                    this.saveProfile();
                    location.reload();
                } catch (error) {
                    alert("Error importing profile. Invalid file format.");
                    console.error("[OurSpace] Import error:", error);
                }
            };
            reader.readAsText(file);
        },

        // Load profile from database (force reload from server)
        loadFromDatabase: async function() {
            // Check if user is authenticated
            await this.refreshAuthState();

            if (!this.isAuthenticated) {
                alert('You must be logged in to load your profile from the database.\n\nPlease log in first.');
                return false;
            }

            // Warn user about overwriting local changes
            const confirmLoad = confirm(
                '⚠️ Load from Database\n\n' +
                'This will replace your current profile with the latest version saved in the database.\n\n' +
                'Any unsaved local changes will be LOST.\n\n' +
                'Click OK to load from database\n' +
                'Click Cancel to keep current profile'
            );

            if (!confirmLoad) {
                console.log('[OurSpace] User cancelled database load');
                return false;
            }

            try {
                console.log('[OurSpace] Loading profile from database...');
                const response = await fetch('/api/ourspace/profile/load', {
                    cache: 'no-store'
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        alert('Authentication failed. Please log in again.');
                        return false;
                    }
                    throw new Error(`Failed to load profile (${response.status})`);
                }

                const profileData = await response.json();

                if (!profileData) {
                    alert('No profile found in database. Your profile may not have been saved yet.');
                    return false;
                }

                // Replace current profile with database version
                this.profile = profileData;
                this.profileSource = 'database';
                this.profileLoadIssue = false;

                // Update last saved timestamp
                this._lastSavedTimestamp = this.profile.meta.lastModified;

                // Backup to localStorage
                this.backupProfileLocally();

                // Clear any warnings
                if (typeof this.clearProfileLoadWarning === 'function') {
                    this.clearProfileLoadWarning();
                }

                // Reload the entire page to apply all changes (pictures, theme, layout, etc.)
                console.log('[OurSpace] Profile loaded from database successfully. Reloading page...');
                alert('✅ Profile loaded from database successfully!\n\nThe page will reload to apply all changes.');
                location.reload();

                return true;
            } catch (e) {
                console.error('[OurSpace] Error loading profile from database:', e);
                alert('Error loading profile from database:\n' + e.message);
                return false;
            }
        },

        // Apply current theme
        applyTheme: function(forceImmediate = false) {
            if (!forceImmediate) {
                if (this._themeFrame) {
                    return;
                }
                const raf = window.requestAnimationFrame || function(cb) {
                    return setTimeout(cb, 16);
                };
                this._themeFrame = raf(() => {
                    this._themeFrame = null;
                    this.applyTheme(true);
                });
                return;
            }

            // Prevent recursive execution
            if (this._applyingTheme) {
                console.warn('[OurSpace] applyTheme called recursively, ignoring');
                return;
            }
            this._applyingTheme = true;

            const theme = this.profile.theme;

            // Ensure font structure exists (backwards compatibility)
            if (!theme.fonts) {
                theme.fonts = {
                    family: "Arial",
                    size: 14,
                    effects: { shadow: false, glow: false }
                };
            }
            if (!theme.fonts.effects) {
                theme.fonts.effects = { shadow: false, glow: false, glowColor: "#ffffff" };
            }
            if (!("glowColor" in theme.fonts.effects) || !theme.fonts.effects.glowColor) {
                theme.fonts.effects.glowColor = "#ffffff";
            }

            theme.effects = mergeEffectDefaults(theme.effects);

            // Initialize background properties if they don't exist (backwards compatibility)
            if (!theme.background.transform) {
                theme.background.transform = { scale: 1, rotate: 0, skewX: 0, skewY: 0, flipX: false, flipY: false };
            }
            if (!theme.background.filter) {
                theme.background.filter = { blur: 0, brightness: 100, contrast: 100, saturate: 100, hueRotate: 0, invert: 0, sepia: 0, grayscale: 0 };
            }
            if (!theme.background.blend) {
                theme.background.blend = { mode: 'normal', opacity: 100 };
            }
            if (!theme.background.size) theme.background.size = 'cover';
            if (!theme.background.customSize) theme.background.customSize = 100;
            if (!theme.background.position) theme.background.position = 'center';

            console.log("[OurSpace] Applying theme:", theme.name);
            console.log("[OurSpace] Background type:", theme.background.type);
            console.log("[OurSpace] Background color:", theme.colors.background);

            // Apply theme class (preserve view-mode class)
            const viewMode = document.body.classList.contains('view-mode');
            document.body.className = `theme-${theme.name}`;
            if (viewMode) {
                document.body.classList.add('view-mode');
            }

            // Apply custom colors
            const bg = document.getElementById('ourspace-background');
            console.log("[OurSpace] Background element:", bg);
            if (bg) {
                // Clear all background styles first
                bg.style.background = '';
                bg.style.backgroundColor = '';
                bg.style.backgroundImage = '';
                bg.style.backgroundRepeat = '';
                bg.style.backgroundSize = '';
                bg.style.backgroundPosition = '';
                bg.style.backgroundAttachment = '';
                bg.style.mixBlendMode = '';
                bg.style.opacity = '';
                bg.style.filter = '';

                // Remove any existing transform overlay
                const existingOverlay = document.getElementById('bg-transform-overlay');
                if (existingOverlay) {
                    existingOverlay.remove();
                    console.log("[OurSpace] Removed existing transform overlay");
                }

                if (theme.background.type === 'solid') {
                    // Solid color background
                    console.log("[OurSpace] Applying solid color:", theme.colors.background);
                    bg.style.backgroundColor = theme.colors.background;
                } else if (theme.background.type === 'gradient') {
                    // Gradient background
                    const gradient = theme.background.gradient ||
                        `linear-gradient(135deg, ${theme.colors.background} 0%, #000000 100%)`;
                    console.log("[OurSpace] Applying gradient:", gradient);
                    bg.style.background = gradient;
                } else if (theme.background.type === 'pattern') {
                    // Pattern background with color
                    const patternUrl = this.getPatternUrl(theme.background.pattern);
                    console.log("[OurSpace] Applying pattern:", theme.background.pattern);
                    console.log("[OurSpace] Pattern URL:", patternUrl);
                    bg.style.backgroundColor = theme.colors.background;
                    bg.style.backgroundImage = patternUrl;
                    bg.style.backgroundRepeat = 'repeat';
                    bg.style.backgroundAttachment = 'fixed';
                } else if (theme.background.type === 'image' && theme.background.image) {
                    // Custom image background with transformations
                    console.log("[OurSpace] Applying custom image with transformations");

                    // Handle custom size
                    const bgSize = theme.background.size === 'custom'
                        ? `${theme.background.customSize}px ${theme.background.customSize}px`
                        : (theme.background.size || 'cover');

                    // Apply CSS filters
                    const filters = [];
                    if (theme.background.filter) {
                        const f = theme.background.filter;
                        if (f.blur > 0) filters.push(`blur(${f.blur}px)`);
                        if (f.brightness !== 100) filters.push(`brightness(${f.brightness}%)`);
                        if (f.contrast !== 100) filters.push(`contrast(${f.contrast}%)`);
                        if (f.saturate !== 100) filters.push(`saturate(${f.saturate}%)`);
                        if (f.hueRotate !== 0) filters.push(`hue-rotate(${f.hueRotate}deg)`);
                        if (f.invert > 0) filters.push(`invert(${f.invert}%)`);
                        if (f.sepia > 0) filters.push(`sepia(${f.sepia}%)`);
                        if (f.grayscale > 0) filters.push(`grayscale(${f.grayscale}%)`);
                    }

                    // Apply transformations using a pseudo-element approach
                    const transform = theme.background.transform || {};
                    const transforms = [];
                    if (transform.scale !== 1) transforms.push(`scale(${transform.scale})`);
                    if (transform.rotate !== 0) transforms.push(`rotate(${transform.rotate}deg)`);
                    if (transform.skewX !== 0) transforms.push(`skewX(${transform.skewX}deg)`);
                    if (transform.skewY !== 0) transforms.push(`skewY(${transform.skewY}deg)`);
                    if (transform.flipX) transforms.push(`scaleX(-1)`);
                    if (transform.flipY) transforms.push(`scaleY(-1)`);

                    // Create the transform overlay for the image
                    let overlay = document.createElement('div');
                    overlay.id = 'bg-transform-overlay';
                    overlay.style.cssText = `
                        position: fixed;
                        top: -100%;
                        left: -100%;
                        width: 300%;
                        height: 300%;
                        pointer-events: none;
                        z-index: -1;
                    `;
                    bg.appendChild(overlay);

                    // Apply all styles to the overlay only
                    overlay.style.backgroundImage = `url(${theme.background.image})`;
                    overlay.style.backgroundSize = bgSize;
                    overlay.style.backgroundPosition = 'center';
                    overlay.style.backgroundRepeat = theme.background.repeat || 'no-repeat';
                    overlay.style.transform = transforms.length > 0 ? transforms.join(' ') : 'none';
                    overlay.style.filter = filters.length > 0 ? filters.join(' ') : 'none';

                    // Apply blend mode and opacity to overlay
                    if (theme.background.blend) {
                        overlay.style.mixBlendMode = theme.background.blend.mode || 'normal';
                        overlay.style.opacity = (theme.background.blend.opacity || 100) / 100;
                    }
                }
                console.log("[OurSpace] Final background styles:", {
                    background: bg.style.background,
                    backgroundColor: bg.style.backgroundColor,
                    backgroundImage: bg.style.backgroundImage
                });
            }

            // Apply font
            document.body.style.fontFamily = theme.fonts.family;
            document.body.style.fontSize = theme.fonts.size + 'px';

            // Apply text effects
            const hasShadow = !!theme.fonts.effects.shadow;
            const hasGlow = !!theme.fonts.effects.glow;
            const glowColor = theme.fonts.effects.glowColor || '#ffffff';

            document.body.style.textShadow = hasShadow
                ? '2px 2px 4px rgba(0, 0, 0, 0.8)'
                : 'none';
            document.body.style.setProperty('--text-glow-color', glowColor);
            document.body.classList.toggle('glow', hasGlow);

            // Apply colors
            document.documentElement.style.setProperty('--custom-text-color', theme.colors.text);
            document.documentElement.style.setProperty('--custom-link-color', theme.colors.links);
            document.documentElement.style.setProperty('--custom-link-hover', theme.colors.linksHover);
            document.documentElement.style.setProperty('--custom-border-color', theme.colors.borders);
            document.documentElement.style.setProperty('--custom-label-color', theme.colors.labelText || '#00aaff');

            // Apply widget background with opacity
            const opacity = theme.colors.widgetBgOpacity / 100;
            const widgetBg = this.hexToRgba(theme.colors.widgetBg, opacity);
            document.documentElement.style.setProperty('--custom-widget-bg', widgetBg);

            // Apply layout
            const grid = document.getElementById('content-grid');
            if (grid) {
                grid.className = `content-grid layout-${this.profile.layout.preset}`;
            }

            console.log("[OurSpace] Theme applied:", theme.name);

            // Reset execution flag
            this._applyingTheme = false;
        },

        // Load content into page
        loadContent: function() {
            this.ensureCustomHtmlData();

            // Profile info
            const profileName = document.getElementById('profile-name');
            const profileTagline = document.getElementById('profile-tagline');
            const profilePic = document.getElementById('profile-pic');
            const moodText = document.getElementById('mood-text');
            const moodIcon = document.getElementById('mood-icon');

            if (profileName) profileName.textContent = this.profile.profile.name;
            if (profileTagline) profileTagline.textContent = this.profile.profile.tagline;
            if (moodText) moodText.textContent = this.profile.profile.mood.text;
            if (moodIcon) moodIcon.textContent = this.profile.profile.mood.icon;

            if (!this.profile.profile.profilePicOffset) {
                this.profile.profile.profilePicOffset = { x: 50, y: 50 };
            }
            if (profilePic) {
                if (this.profile.profile.profilePic) {
                    profilePic.src = this.profile.profile.profilePic;
                    profilePic.style.display = 'block';
                }
                const picOffset = this.profile.profile.profilePicOffset;
                profilePic.style.objectPosition = `${picOffset.x}% ${picOffset.y}%`;
            }

            // Banner image
            const banner = document.getElementById('banner-image');
            if (banner && this.profile.profile.bannerImage) {
                banner.style.backgroundImage = `url(${this.profile.profile.bannerImage})`;
                const overlay = banner.querySelector('.upload-overlay');
                if (overlay) overlay.style.display = 'none';
            }
            if (!this.profile.profile.bannerOffset) {
                this.profile.profile.bannerOffset = { x: 50, y: 50 };
            }
            if (banner) {
                const bannerOffset = this.profile.profile.bannerOffset;
                banner.style.backgroundPosition = `${bannerOffset.x}% ${bannerOffset.y}%`;
            }

            // About Me
            const aboutMe = document.getElementById('about-me-content');
            if (aboutMe) {
                aboutMe.innerHTML = this.profile.widgets.aboutMe.content;
            }

            // Interests
            const interests = this.profile.widgets.interests;
            const musicEl = document.getElementById('interest-music');
            const moviesEl = document.getElementById('interest-movies');
            const tvEl = document.getElementById('interest-tv');
            const booksEl = document.getElementById('interest-books');

            if (musicEl) musicEl.textContent = interests.music;
            if (moviesEl) moviesEl.textContent = interests.movies;
            if (tvEl) tvEl.textContent = interests.tv;
            if (booksEl) booksEl.textContent = interests.books;

            // Custom HTML widget
            const safeWidgetHtml = this.sanitizeCustomHtml(this.profile.widgets.customHtml.html || '');
            const safeGlobalHtml = this.sanitizeCustomHtml(this.profile.widgets.customHtml.global || '');
            const customHtmlOutput = document.getElementById('custom-html-output');
            if (customHtmlOutput) {
                customHtmlOutput.innerHTML = safeWidgetHtml;
            }
            const customHtmlInput = document.getElementById('custom-html-input');
            if (customHtmlInput) {
                customHtmlInput.value = safeWidgetHtml;
            }
            const customHtmlGlobalInput = document.getElementById('custom-html-global-input');
            if (customHtmlGlobalInput) {
                customHtmlGlobalInput.value = safeGlobalHtml;
            }
            const customHtmlGlobal = document.getElementById('custom-html-global');
            if (customHtmlGlobal) {
                customHtmlGlobal.innerHTML = safeGlobalHtml;
            }

            // Hide Custom HTML widget in view mode if empty
            const customHtmlWidget = document.getElementById('custom-html-widget');
            if (customHtmlWidget) {
                const isViewMode = document.body.classList.contains('view-mode');
                const hasContent = safeWidgetHtml.trim().length > 0 || safeGlobalHtml.trim().length > 0;

                if (isViewMode && !hasContent) {
                    customHtmlWidget.style.display = 'none';
                } else {
                    customHtmlWidget.style.display = '';
                }
            }

            this.renderCustomGlobalCode();

            this.renderStickers();
            this.renderStickerDeck();

            // Preload critical images for faster display
            this.preloadCriticalImages();

            // Trigger custom event so other modules can respond to content load
            window.dispatchEvent(new CustomEvent('ourspace:contentLoaded'));

            console.log("[OurSpace] Content loaded");
        },

        // Update stats display
        updateStats: function() {
            const pageViews = document.getElementById('page-views');
            const lastLogin = document.getElementById('last-login');
            const memberSince = document.getElementById('member-since');

            if (pageViews) {
                pageViews.textContent = this.profile.meta.visits;

                // Update counter display
                const digits = String(this.profile.meta.visits).padStart(4, '0').split('');
                const counterDigits = document.querySelectorAll('.counter-digit');
                counterDigits.forEach((digit, i) => {
                    if (digits[i]) digit.textContent = digits[i];
                });
            }

            if (lastLogin) {
                const now = new Date();
                lastLogin.textContent = this.formatDate(now);
            }

            if (memberSince) {
                const created = new Date(this.profile.meta.created);
                memberSince.textContent = this.formatDate(created);
            }
        },

        // Helper: Format date
        formatDate: function(date) {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
        },

        // Helper: Convert hex to rgba
        hexToRgba: function(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        },

        // Helper: Get pattern URL
        getPatternUrl: function(patternName) {
            const patterns = {
                // Star pattern - 5-pointed stars
                stars: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20,5 L23,15 L33,15 L25,21 L28,31 L20,25 L12,31 L15,21 L7,15 L17,15 Z\' fill=\'rgba(255,255,255,0.3)\' /%3E%3C/svg%3E")',

                // Heart pattern
                hearts: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20,30 C20,30 8,22 8,15 C8,10 11,8 14,8 C17,8 20,11 20,11 C20,11 23,8 26,8 C29,8 32,10 32,15 C32,22 20,30 20,30 Z\' fill=\'rgba(255,100,150,0.4)\' /%3E%3C/svg%3E")',

                // Flame pattern
                flames: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20,5 Q18,15 20,18 Q22,15 20,5 M20,18 Q15,25 20,35 Q25,25 20,18\' fill=\'rgba(255,150,50,0.5)\' /%3E%3C/svg%3E")',

                // Sparkle pattern - 4-pointed stars
                sparkles: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M20,8 L21,18 L20,19 L19,18 Z M20,22 L21,32 L20,33 L19,32 Z M12,20 L8,21 L7,20 L8,19 Z M28,20 L32,21 L33,20 L32,19 Z\' fill=\'rgba(255,255,100,0.6)\' /%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'1.5\' fill=\'rgba(255,255,255,0.8)\' /%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'2\' fill=\'rgba(255,255,255,0.7)\' /%3E%3C/svg%3E")',

                // Checkerboard pattern - high contrast
                checkers: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'20\' height=\'20\' fill=\'rgba(255,255,255,0.15)\' /%3E%3Crect x=\'20\' y=\'20\' width=\'20\' height=\'20\' fill=\'rgba(255,255,255,0.15)\' /%3E%3Crect x=\'20\' y=\'0\' width=\'20\' height=\'20\' fill=\'rgba(0,0,0,0.15)\' /%3E%3Crect x=\'0\' y=\'20\' width=\'20\' height=\'20\' fill=\'rgba(0,0,0,0.15)\' /%3E%3C/svg%3E")',

                // Dots pattern - polka dots
                dots: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Ccircle cx=\'10\' cy=\'10\' r=\'6\' fill=\'rgba(255,255,255,0.25)\' /%3E%3Ccircle cx=\'30\' cy=\'30\' r=\'6\' fill=\'rgba(255,255,255,0.25)\' /%3E%3C/svg%3E")',

                // Diagonal stripes
                stripes: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0,40 L40,0 M-10,10 L10,-10 M30,50 L50,30\' stroke=\'rgba(255,255,255,0.2)\' stroke-width=\'8\' /%3E%3C/svg%3E")',

                // Glitter - random sparkles
                glitter: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M8,8 L9,12 L8,13 L7,12 Z M8,8 L12,9 L13,8 L12,7 Z\' fill=\'rgba(255,255,255,0.6)\' /%3E%3Cpath d=\'M28,15 L29,18 L28,19 L27,18 Z M28,15 L31,16 L32,15 L31,14 Z\' fill=\'rgba(255,255,100,0.5)\' /%3E%3Cpath d=\'M15,28 L16,30 L15,31 L14,30 Z M15,28 L17,29 L18,28 L17,27 Z\' fill=\'rgba(255,200,255,0.5)\' /%3E%3Ccircle cx=\'32\' cy=\'8\' r=\'1.5\' fill=\'rgba(255,255,255,0.7)\' /%3E%3Ccircle cx=\'10\' cy=\'35\' r=\'1\' fill=\'rgba(255,255,255,0.8)\' /%3E%3C/svg%3E")',

                // Tiger print remix
                tigerprint: 'url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'80\' height=\'80\' fill=\'rgba(0,0,0,0)\'/%3E%3Cpath d=\'M10 20 C30 5 50 5 70 20\' stroke=\'rgba(0,0,0,0.35)\' stroke-width=\'10\' stroke-linecap=\'round\'/%3E%3Cpath d=\'M5 50 C25 35 55 35 75 50\' stroke=\'rgba(0,0,0,0.35)\' stroke-width=\'10\' stroke-linecap=\'round\'/%3E%3Ccircle cx=\'20\' cy=\'15\' r=\'8\' fill=\'rgba(0,150,255,0.4)\'/%3E%3Ccircle cx=\'55\' cy=\'40\' r=\'10\' fill=\'rgba(0,150,255,0.4)\'/%3E%3Ccircle cx=\'25\' cy=\'60\' r=\'7\' fill=\'rgba(0,150,255,0.4)\'/%3E%3C/svg%3E")',

                // Mall goth glitch
                mallgoth: 'url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'80\' height=\'80\' fill=\'rgba(255,0,0,0.12)\'/%3E%3Crect x=\'0\' y=\'0\' width=\'40\' height=\'10\' fill=\'rgba(255,0,0,0.35)\'/%3E%3Crect x=\'45\' y=\'25\' width=\'35\' height=\'12\' fill=\'rgba(255,0,0,0.45)\'/%3E%3Crect x=\'10\' y=\'45\' width=\'25\' height=\'15\' fill=\'rgba(255,60,60,0.4)\'/%3E%3Crect x=\'40\' y=\'65\' width=\'30\' height=\'10\' fill=\'rgba(255,0,0,0.35)\'/%3E%3C/svg%3E")',

                // Pop punk doodles
                poppunk: 'url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'80\' height=\'80\' fill=\'rgba(0,0,0,0)\'/%3E%3Ccircle cx=\'20\' cy=\'15\' r=\'4\' fill=\'%23ff5bff\'/%3E%3Ccircle cx=\'60\' cy=\'25\' r=\'4\' fill=\'%2336fffb\'/%3E%3Cpath d=\'M5 60 L25 40\' stroke=\'%23ffef5a\' stroke-width=\'4\'/%3E%3Cpath d=\'M35 70 L55 50\' stroke=\'%23ff5bff\' stroke-width=\'4\'/%3E%3Crect x=\'50\' y=\'5\' width=\'12\' height=\'12\' fill=\'rgba(255,255,255,0.25)\'/%3E%3Crect x=\'10\' y=\'35\' width=\'12\' height=\'12\' fill=\'rgba(255,255,255,0.25)\'/%3E%3C/svg%3E")',

                // Evanescent swirls
                evanescent: 'url("data:image/svg+xml,%3Csvg width=\'80\' height=\'80\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'80\' height=\'80\' fill=\'rgba(0,0,0,0)\'/%3E%3Cpath d=\'M10 40 Q30 20 50 40 T90 40\' fill=\'none\' stroke=\'rgba(126, 230, 255, 0.35)\' stroke-width=\'6\'/%3E%3Cpath d=\'M-10 60 Q10 80 30 60 T70 60\' fill=\'none\' stroke=\'rgba(240, 89, 255, 0.3)\' stroke-width=\'5\'/%3E%3Ccircle cx=\'25\' cy=\'50\' r=\'5\' fill=\'rgba(126,230,255,0.4)\'/%3E%3Ccircle cx=\'55\' cy=\'30\' r=\'4\' fill=\'rgba(240,89,255,0.4)\'/%3E%3C/svg%3E")'
            };
            return patterns[patternName] || patterns.stars;
        },

        sanitizeCustomHtml: function(html) {
            if (!html || typeof html !== 'string') {
                return '';
            }
            let sanitized = html;
            sanitized = sanitized.replace(/<script(?![^>]*data-ourspace)[\s\S]*?>[\s\S]*?<\/script>/gi, '');
            sanitized = sanitized.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');
            sanitized = sanitized.replace(/javascript:/gi, '');
            return sanitized;
        },

        normalizeFrameTextData: function(target) {
            if (!target) return;
            if (!frameSupportsText(target.frameStyle)) {
                if (typeof target.frameText !== 'string') {
                    target.frameText = '';
                }
                if (typeof target.frameTextColor !== 'string') {
                    target.frameTextColor = '';
                }
                return;
            }
            const defaults = getFrameTextDefaults(target.frameStyle);
            if (typeof target.frameText !== 'string') {
                target.frameText = defaults.text;
            }
            if (typeof target.frameTextColor !== 'string' || !target.frameTextColor || !/^#/.test(target.frameTextColor)) {
                target.frameTextColor = defaults.color;
            }
        },

        ensureStickerData: function() {
            if (!Array.isArray(this.profile.stickers)) {
                this.profile.stickers = [];
            }
            this.profile.stickers.forEach(sticker => {
                if (!STICKER_FRAME_STYLES.includes(sticker.frameStyle)) {
                    sticker.frameStyle = 'none';
                }
                this.normalizeFrameTextData(sticker);
            });
            if (!Array.isArray(this.profile.stickerDeck)) {
                this.profile.stickerDeck = [];
            }
            this.profile.stickerDeck.forEach(entry => {
                if (!STICKER_FRAME_STYLES.includes(entry.frameStyle)) {
                    entry.frameStyle = 'none';
                }
                this.normalizeFrameTextData(entry);
            });
        },

        getPublicBaseUrl: function() {
            const host = window.location.hostname;
            if (host === 'localhost' || host === '127.0.0.1') {
                return `${window.location.origin}/ourspace.html`;
            }
            return 'https://ourspace.icu/ourspace.html';
        },

        getProfileShareUrl: function(username = '') {
            const base = this.getPublicBaseUrl();
            const encoded = username ? encodeURIComponent(username) : '';
            return `${base}?user=${encoded}`;
        },

        renderCustomGlobalCode: function() {
            this.ensureCustomHtmlData();
            this.applyCustomGlobalCode(this.profile.widgets.customHtml.global || '');
        },

        applyCustomGlobalCode: function(code) {
            const styleTarget = document.getElementById('custom-global-style');
            const contentTarget = document.getElementById('custom-global-content');
            if (!styleTarget || !contentTarget) {
                return;
            }

            styleTarget.textContent = '';
            contentTarget.innerHTML = '';

            if (!code || typeof code !== 'string') {
                return;
            }

            const template = document.createElement('template');
            template.innerHTML = code;
            const effectPayloads = [];

            Array.from(template.content.childNodes).forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'STYLE') {
                    styleTarget.textContent += node.textContent || '';
                    node.remove();
                    return;
                }

                if (
                    node.nodeType === Node.ELEMENT_NODE &&
                    node.tagName === 'SCRIPT' &&
                    node.getAttribute('type') === 'application/json' &&
                    node.dataset &&
                    node.dataset.ourspace === 'effects'
                ) {
                    try {
                        const payload = JSON.parse(node.textContent || '{}');
                        effectPayloads.push(payload);
                    } catch (err) {
                        console.warn('[Custom Code] Invalid effect JSON', err);
                    }
                    node.remove();
                    return;
                }

                if (node.nodeType === Node.TEXT_NODE) {
                    if (!node.textContent.trim()) {
                        node.remove();
                        return;
                    }
                }

                contentTarget.appendChild(node);
            });

            if (effectPayloads.length) {
                effectPayloads.forEach(payload => this.applyEffectPayload(payload));
            }
        },

        applyEffectPayload: function(payload) {
            if (!payload || typeof payload !== 'object') {
                return;
            }
            this.ensureStickerData();
            this.profile.theme.effects = mergeEffectDefaults(this.profile.theme.effects);

            Object.entries(payload).forEach(([effect, config]) => {
                if (typeof config !== 'object') return;
                if (!this.profile.theme.effects[effect]) {
                    this.profile.theme.effects[effect] = { enabled: false };
                }
                Object.assign(this.profile.theme.effects[effect], config);
            });

            this.applyTheme(true);
        },

        initStickerLayer: function() {
            this.stickerLayer = document.getElementById('sticker-layer');
            if (this.stickerLayer) {
                const main = document.getElementById('ourspace-main');
                if (main && this.stickerLayer.parentElement !== main) {
                    main.insertBefore(this.stickerLayer, main.firstChild);
                }
                this.stickerLayer.innerHTML = '';
            }
        },

        ensureCustomHtmlData: function() {
            if (!this.profile.widgets.customHtml) {
                this.profile.widgets.customHtml = { visible: true, html: "", global: "" };
            }
            if (typeof this.profile.widgets.customHtml.html !== 'string') {
                this.profile.widgets.customHtml.html = '';
            }
            if (typeof this.profile.widgets.customHtml.global !== 'string') {
                this.profile.widgets.customHtml.global = '';
            }
        },

        updateCustomHtmlWidgetVisibility: function() {
            this.ensureCustomHtmlData();
            const customHtmlWidget = document.getElementById('custom-html-widget');
            if (customHtmlWidget) {
                const isViewMode = document.body.classList.contains('view-mode');
                const safeWidgetHtml = this.sanitizeCustomHtml(this.profile.widgets.customHtml.html || '');
                const safeGlobalHtml = this.sanitizeCustomHtml(this.profile.widgets.customHtml.global || '');
                const hasContent = safeWidgetHtml.trim().length > 0 || safeGlobalHtml.trim().length > 0;

                if (isViewMode && !hasContent) {
                    customHtmlWidget.style.display = 'none';
                } else {
                    customHtmlWidget.style.display = '';
                }
            }
        },

        renderStickers: function() {
            this.ensureStickerData();
            if (!this.stickerLayer) {
                this.initStickerLayer();
            }
            const layer = this.stickerLayer;
            if (!layer) return;
            layer.innerHTML = '';

            this.profile.stickers.forEach(sticker => {
                if (!sticker.id) {
                    sticker.id = `sticker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                }
                if (typeof sticker.scale !== 'number') sticker.scale = 1;
                if (typeof sticker.x !== 'number') sticker.x = 50;
                if (typeof sticker.y !== 'number') sticker.y = 50;
                if (typeof sticker.zIndex !== 'number') sticker.zIndex = 30;

                const item = document.createElement('div');
                item.className = 'sticker-item';
                item.dataset.stickerId = sticker.id;

                const img = document.createElement('img');
                img.src = sticker.url;
                img.alt = sticker.caption || 'Sticker';
                item.appendChild(img);

                this.applyStickerStyles(sticker, item);
                layer.appendChild(item);

                item.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.selectSticker(sticker.id);
                });

                if (!this.viewMode) {
                    item.addEventListener('pointerdown', (event) => {
                        if (event.button !== 0) return;
                        event.stopPropagation();
                        this.selectSticker(sticker.id);
                        this.startStickerDrag(event, sticker);
                    });
                }
            });

            this.notifyStickerUpdate();
        },

        renderStickerDeck: function() {
            this.ensureStickerData();

            if (!this.stickerDeckGrid || !document.body.contains(this.stickerDeckGrid)) {
                this.stickerDeckGrid = document.getElementById('sticker-deck-grid');
            }
            if (!this.stickerDeckEmpty || !document.body.contains(this.stickerDeckEmpty)) {
                this.stickerDeckEmpty = document.getElementById('sticker-deck-empty');
            }

            const grid = this.stickerDeckGrid;
            const emptyState = this.stickerDeckEmpty;

            if (!grid) {
                this.notifyStickerDeckUpdate();
                return;
            }

            grid.innerHTML = '';
            const deck = (this.profile.stickerDeck || [])
                .filter(entry => entry && entry.url)
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            if (!deck.length) {
                if (emptyState) {
                    emptyState.style.display = 'block';
                }
                this.notifyStickerDeckUpdate([]);
                return;
            }

            if (emptyState) {
                emptyState.style.display = 'none';
            }

            const fragment = document.createDocumentFragment();
            deck.forEach(entry => {
                const entryFrame = STICKER_FRAME_STYLES.includes(entry.frameStyle) ? entry.frameStyle : 'none';
                entry.frameStyle = entryFrame;
                const card = document.createElement('div');
                card.className = 'sticker-deck-item';
                card.dataset.deckId = entry.id;

                const thumbButton = document.createElement('button');
                thumbButton.type = 'button';
                thumbButton.className = 'sticker-deck-thumb';
                thumbButton.dataset.action = 'place';

                const thumbImage = document.createElement('img');
                thumbImage.src = entry.url;
                thumbImage.alt = entry.label || 'Sticker';
                if (entry.clipPath) {
                    thumbImage.style.clipPath = entry.clipPath;
                }
                thumbButton.appendChild(thumbImage);

                const meta = document.createElement('div');
                meta.className = 'sticker-deck-meta';

                const label = document.createElement('p');
                label.className = 'sticker-deck-label';
                label.textContent = entry.label || 'Sticker';

                const styleBadge = document.createElement('span');
                styleBadge.className = 'sticker-deck-style';
                styleBadge.textContent = entryFrame === 'none' ? 'Default frame' : `${entryFrame} frame`;

                const actions = document.createElement('div');
                actions.className = 'sticker-deck-actions';

                const placeBtn = document.createElement('button');
                placeBtn.type = 'button';
                placeBtn.dataset.action = 'place';
                placeBtn.textContent = 'Place';

                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.dataset.action = 'delete';
                deleteBtn.classList.add('danger');
                deleteBtn.textContent = 'Delete';

                actions.appendChild(placeBtn);
                actions.appendChild(deleteBtn);

                meta.appendChild(label);
                meta.appendChild(styleBadge);
                meta.appendChild(actions);

                card.appendChild(thumbButton);
                card.appendChild(meta);
                fragment.appendChild(card);
            });

            grid.appendChild(fragment);
            this.notifyStickerDeckUpdate(deck);
        },

        notifyStickerDeckUpdate: function(deckData) {
            const payload = Array.isArray(deckData)
                ? deckData
                : (Array.isArray(this.profile.stickerDeck) ? [...this.profile.stickerDeck] : []);
            document.dispatchEvent(new CustomEvent('ourspace:sticker-deck-updated', {
                detail: { deck: payload }
            }));
        },

        applyStickerStyles: function(sticker, element) {
            if (!this.stickerLayer) return;
            if (!element) {
                element = this.stickerLayer.querySelector(`[data-sticker-id="${sticker.id}"]`);
            }
            if (!element) return;
            const x = typeof sticker.x === 'number' ? sticker.x : 50;
            const y = typeof sticker.y === 'number' ? sticker.y : 50;
            const scale = typeof sticker.scale === 'number' ? sticker.scale : 1;
            element.style.left = `${x}%`;
            element.style.top = `${y}%`;
            element.style.transform = `translate(-50%, -50%) scale(${scale})`;
            element.style.zIndex = sticker.zIndex || 30;
            const frameStyle = STICKER_FRAME_STYLES.includes(sticker.frameStyle) ? sticker.frameStyle : 'none';
            element.dataset.frameStyle = frameStyle;
            STICKER_FRAME_STYLES.forEach(style => {
                if (style === 'none') {
                    return;
                }
                element.classList.toggle(`sticker-frame--${style}`, frameStyle === style);
            });
            const existingLabel = element.querySelector('.sticker-frame-label');
            if (frameSupportsText(frameStyle)) {
                const defaults = getFrameTextDefaults(frameStyle);
                const frameText = typeof sticker.frameText === 'string' ? sticker.frameText : defaults.text;
                const textColor = sticker.frameTextColor || defaults.color;
                let labelEl = existingLabel;
                if (!labelEl) {
                    labelEl = document.createElement('div');
                    labelEl.className = 'sticker-frame-label';
                    labelEl.contentEditable = 'false';
                    labelEl.spellcheck = false;
                    element.appendChild(labelEl);
                }
                labelEl.textContent = frameText || '';
                labelEl.dataset.stickerId = sticker.id;
                labelEl.style.color = textColor || defaults.color;
                labelEl.style.setProperty('--frame-text-color', textColor || defaults.color);
                labelEl.style.display = 'block';
            } else if (existingLabel) {
                existingLabel.remove();
            }

            if (sticker.clipPath) {
                element.style.clipPath = sticker.clipPath;
                element.style.webkitClipPath = sticker.clipPath;
            } else {
                element.style.clipPath = '';
                element.style.webkitClipPath = '';
            }
            const img = element.querySelector('img');
            if (img) {
                img.style.clipPath = sticker.clipPath || '';
            }
        },

        selectSticker: function(id) {
            if (!this.stickerLayer) return;
            this.stickerState.activeId = id;
            const elements = this.stickerLayer.querySelectorAll('.sticker-item');
            elements.forEach(el => {
                el.classList.toggle('active', el.dataset.stickerId === id);
            });
            const sticker = this.profile.stickers.find(s => s.id === id);
            document.dispatchEvent(new CustomEvent('ourspace:sticker-selected', {
                detail: { id, sticker }
            }));
        },

        addSticker: function(sticker) {
            this.ensureStickerData();
            if (!sticker.id) {
                sticker.id = `sticker-${Date.now()}-${Math.random().toString(16).slice(2)}`;
            }
            if (typeof sticker.x !== 'number') sticker.x = 50;
            if (typeof sticker.y !== 'number') sticker.y = 50;
            if (typeof sticker.scale !== 'number') sticker.scale = 1;
            if (typeof sticker.zIndex !== 'number') sticker.zIndex = 30;
            if (!STICKER_FRAME_STYLES.includes(sticker.frameStyle)) {
                sticker.frameStyle = 'none';
            }
            this.normalizeFrameTextData(sticker);
            this.profile.stickers.push(sticker);
            this.renderStickers();
            this.selectSticker(sticker.id);
            // Removed auto-save - only save when user clicks Save Profile button
        },

        addStickerAsset: function(options = {}) {
            this.ensureStickerData();
            if (!options.url) {
                return null;
            }

            const entry = {
                id: options.id || `deck-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                url: options.url,
                clipPath: options.clipPath || '',
                scale: typeof options.scale === 'number' ? options.scale : 1,
                zIndex: typeof options.zIndex === 'number' ? options.zIndex : 40,
                label: options.label || options.name || `Sticker ${this.profile.stickerDeck.length + 1}`,
                createdAt: options.createdAt || Date.now(),
                sourceStickerId: options.sourceStickerId || null,
                frameStyle: STICKER_FRAME_STYLES.includes(options.frameStyle) ? options.frameStyle : 'none',
                frameText: typeof options.frameText === 'string' ? options.frameText : undefined,
                frameTextColor: typeof options.frameTextColor === 'string' ? options.frameTextColor : undefined
            };

            this.profile.stickerDeck.push(entry);
            this.normalizeFrameTextData(entry);
            this.renderStickerDeck();

            // Removed auto-save - only save when user clicks Save Profile button

            return entry;
        },

        duplicateStickerToDeck: function(sticker, meta = {}) {
            if (!sticker || !sticker.url) {
                return null;
            }
            const label = meta.label || `Cutout ${this.profile.stickerDeck.length + 1}`;
            return this.addStickerAsset({
                url: sticker.url,
                clipPath: sticker.clipPath || '',
                scale: typeof sticker.scale === 'number' ? sticker.scale : 1,
                zIndex: typeof sticker.zIndex === 'number' ? sticker.zIndex : 40,
                label,
                sourceStickerId: sticker.id,
                frameStyle: STICKER_FRAME_STYLES.includes(sticker.frameStyle) ? sticker.frameStyle : 'none',
                frameText: sticker.frameText,
                frameTextColor: sticker.frameTextColor
            });
        },

        addStickerFromDeck: function(deckId) {
            this.ensureStickerData();
            const entry = this.profile.stickerDeck.find(item => item.id === deckId);
            if (!entry) {
                return;
            }
            this.addSticker({
                url: entry.url,
                clipPath: entry.clipPath || '',
                scale: typeof entry.scale === 'number' ? entry.scale : 1,
                zIndex: typeof entry.zIndex === 'number' ? entry.zIndex : 40,
                x: 50,
                y: 50,
                frameStyle: STICKER_FRAME_STYLES.includes(entry.frameStyle) ? entry.frameStyle : 'none',
                frameText: entry.frameText,
                frameTextColor: entry.frameTextColor
            });
        },

        removeStickerFromDeck: function(deckId) {
            this.ensureStickerData();
            const next = this.profile.stickerDeck.filter(entry => entry.id !== deckId);
            if (next.length === this.profile.stickerDeck.length) {
                return;
            }
            this.profile.stickerDeck = next;
            this.renderStickerDeck();
            // Removed auto-save - only save when user clicks Save Profile button
        },

        updateSticker: function(id, updates, options = {}) {
            const sticker = this.profile.stickers.find(s => s.id === id);
            if (!sticker) return;
            Object.assign(sticker, updates);
            if (!STICKER_FRAME_STYLES.includes(sticker.frameStyle)) {
                sticker.frameStyle = 'none';
            }
            this.normalizeFrameTextData(sticker);
            this.applyStickerStyles(sticker);
            if (!options.silent) {
                // Removed auto-save - only save when user clicks Save Profile button
                this.notifyStickerUpdate();
            }
        },

        removeSticker: function(id) {
            const next = this.profile.stickers.filter(s => s.id !== id);
            if (next.length === this.profile.stickers.length) return;
            this.profile.stickers = next;
            this.renderStickers();
            this.selectSticker(null);
            // Removed auto-save - only save when user clicks Save Profile button
        },

        notifyStickerUpdate: function() {
            document.dispatchEvent(new CustomEvent('ourspace:stickers-updated', {
                detail: { stickers: this.profile.stickers }
            }));
        },

        startStickerDrag: function(startEvent, sticker) {
            if (this.viewMode || !this.stickerLayer) return;
            startEvent.preventDefault();
            const bounds = this.stickerLayer.getBoundingClientRect();
            const width = bounds.width || window.innerWidth || 1;
            const height = bounds.height || window.innerHeight || 1;
            const state = {
                id: sticker.id,
                pointerId: startEvent.pointerId,
                startX: startEvent.clientX,
                startY: startEvent.clientY,
                initialX: sticker.x || 50,
                initialY: sticker.y || 50,
                bounds: { width, height }
            };
            this.stickerState.dragging = state;

            const moveHandler = (event) => {
                if (event.pointerId !== state.pointerId) return;
                const deltaX = (event.clientX - state.startX) / state.bounds.width * 100;
                const deltaY = (event.clientY - state.startY) / state.bounds.height * 100;
                sticker.x = Math.max(0, Math.min(100, state.initialX + deltaX));
                sticker.y = Math.max(0, Math.min(100, state.initialY + deltaY));
                this.applyStickerStyles(sticker);
            };

            const endHandler = (event) => {
                if (event.pointerId !== state.pointerId) return;
                window.removeEventListener('pointermove', moveHandler);
                window.removeEventListener('pointerup', endHandler);
                window.removeEventListener('pointercancel', endHandler);
                this.stickerState.dragging = null;
                // Removed auto-save - only save when user clicks Save Profile button
                this.notifyStickerUpdate();
            };

            window.addEventListener('pointermove', moveHandler);
            window.addEventListener('pointerup', endHandler);
            window.addEventListener('pointercancel', endHandler);
        },

        startStickerCutout: function(id) {
            if (this.viewMode || !this.stickerLayer) return;
            const sticker = this.profile.stickers.find(s => s.id === id);
            if (!sticker) return;
            const element = this.stickerLayer.querySelector(`[data-sticker-id="${id}"]`);
            if (!element) return;

            // Add cutout-mode class to disable sticker dragging
            element.classList.add('cutout-mode');

            const canvas = document.createElement('canvas');
            canvas.className = 'sticker-cutout-canvas';
            element.appendChild(canvas);
            const rect = element.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext('2d');
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(0,255,255,0.9)';
            ctx.fillStyle = 'rgba(0,255,255,0.25)';

            const points = [];
            let drawing = false;

            const getPoint = (event) => {
                const bounds = canvas.getBoundingClientRect();
                return {
                    x: event.clientX - bounds.left,
                    y: event.clientY - bounds.top
                };
            };

            const draw = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (points.length === 0) return;
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i].x, points[i].y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            };

            const moveHandler = (event) => {
                if (!drawing) return;
                points.push(getPoint(event));
                draw();
            };

            const endHandler = () => {
                drawing = false;
                window.removeEventListener('pointermove', moveHandler);
                window.removeEventListener('pointerup', endHandler);
                window.removeEventListener('pointercancel', endHandler);
                element.removeChild(canvas);

                // Remove cutout-mode class to re-enable sticker dragging
                element.classList.remove('cutout-mode');

                if (points.length >= 3) {
                    const coords = points.map(p => {
                        const x = (p.x / canvas.width) * 100;
                        const y = (p.y / canvas.height) * 100;
                        return `${x.toFixed(2)}% ${y.toFixed(2)}%`;
                    }).join(', ');
                    sticker.clipPath = `polygon(${coords})`;
                    this.applyStickerStyles(sticker);
                    // Removed auto-save - only save when user clicks Save Profile button
                    this.notifyStickerUpdate();
                    this.duplicateStickerToDeck(sticker);
                }
            };

            canvas.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
                drawing = true;
                points.length = 0;
                points.push(getPoint(event));
                draw();
                window.addEventListener('pointermove', moveHandler);
                window.addEventListener('pointerup', endHandler);
                window.addEventListener('pointercancel', endHandler);
            }, { once: true });
        },

        clearStickerCutout: function(id) {
            const sticker = this.profile.stickers.find(s => s.id === id);
            if (!sticker) return;
            sticker.clipPath = '';
            this.applyStickerStyles(sticker);
            // Removed auto-save - only save when user clicks Save Profile button
            this.notifyStickerUpdate();
        },

        // Enable drag-to-frame behavior on an element
        createFrameDrag: function(element, options = {}) {
            if (!element) return;

            const clamp = value => Math.max(0, Math.min(100, value));
            let pointerId = null;
            let startX = 0;
            let startY = 0;
            let initialX = 50;
            let initialY = 50;

            const getOffsets = () => {
                if (typeof options.get === 'function') {
                    const result = options.get();
                    return {
                        x: result && typeof result.x === 'number' ? result.x : 50,
                        y: result && typeof result.y === 'number' ? result.y : 50
                    };
                }
                return { x: 50, y: 50 };
            };

            const applyOffsets = (x, y) => {
                if (typeof options.apply === 'function') {
                    options.apply(x, y);
                }
            };

            const setOffsets = (x, y) => {
                if (typeof options.set === 'function') {
                    options.set({ x, y });
                }
            };

            const isViewMode = () => document.body.classList.contains('view-mode');

            const canActivate = (event) => {
                if (event.button !== 0) return false;
                if (!options.allowInViewMode && isViewMode()) return false;
                if (options.isActive && !options.isActive()) return false;
                if (options.ignoreSelector && event.target.closest(options.ignoreSelector)) return false;
                return true;
            };

            const pointerDown = (event) => {
                if (!canActivate(event)) return;

                event.preventDefault();
                const offsets = getOffsets();
                initialX = offsets.x;
                initialY = offsets.y;
                startX = event.clientX;
                startY = event.clientY;
                pointerId = event.pointerId;
                try {
                    element.setPointerCapture(pointerId);
                } catch (err) {
                    // Ignore pointer capture errors (e.g., non-pointer devices)
                }
                element.classList.add('framing-active');
            };

            const pointerMove = (event) => {
                if (pointerId === null || event.pointerId !== pointerId) return;
                const deltaX = (event.clientX - startX) / element.clientWidth * 100;
                const deltaY = (event.clientY - startY) / element.clientHeight * 100;
                const nextX = clamp(initialX - deltaX);
                const nextY = clamp(initialY - deltaY);
                applyOffsets(nextX, nextY);
                setOffsets(nextX, nextY);
            };

            const pointerUp = (event) => {
                if (pointerId === null || event.pointerId !== pointerId) return;
                try {
                    element.releasePointerCapture(pointerId);
                } catch (err) {
                    // Ignore release errors
                }
                pointerId = null;
                element.classList.remove('framing-active');
                if (typeof options.onSave === 'function') {
                    options.onSave();
                }
            };

            element.addEventListener('pointerdown', pointerDown);
            element.addEventListener('pointermove', pointerMove);
            element.addEventListener('pointerup', pointerUp);
            element.addEventListener('pointercancel', pointerUp);

            // Apply initial offsets if possible
            const initial = getOffsets();
            applyOffsets(initial.x, initial.y);
        },

        // Load view mode preference
        loadViewMode: function() {
            const saved = localStorage.getItem('ourspace-view-mode');
            this.viewMode = saved === 'true';
            this.applyViewMode();
        },

        // Save view mode preference
        saveViewMode: function() {
            localStorage.setItem('ourspace-view-mode', this.viewMode);
        },

        // Apply view mode
        applyViewMode: function() {
            if (this.viewMode) {
                document.body.classList.add('view-mode');
            } else {
                document.body.classList.remove('view-mode');
            }
            this.updateModeButton();
            this.renderStickers();
        },

        // Toggle view mode
        toggleViewMode: function() {
            this.viewMode = !this.viewMode;
            this.saveViewMode();
            this.applyViewMode();

            // Disable layout editor when entering view mode
            if (this.viewMode && window.OurSpaceLayoutEditor && window.OurSpaceLayoutEditor.enabled) {
                window.OurSpaceLayoutEditor.toggle(false);
                const layoutToggle = document.getElementById('layout-editor-toggle');
                if (layoutToggle) {
                    layoutToggle.checked = false;
                }
                const layoutControls = document.getElementById('layout-editor-controls');
                if (layoutControls) {
                    layoutControls.style.display = 'none';
                }
            }

            // Update Custom HTML widget visibility
            this.updateCustomHtmlWidgetVisibility();

            console.log("[OurSpace] View mode:", this.viewMode ? 'ON' : 'OFF');
        },

        // Setup mode toggle button
        setupModeToggle: function() {
            const toggleBtn = document.getElementById('mode-toggle-btn');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    this.toggleViewMode();
                });
            }
        },

        // Update mode button text
        updateModeButton: function() {
            const toggleBtn = document.getElementById('mode-toggle-btn');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('.mode-icon');
                const text = toggleBtn.querySelector('.mode-text');

                if (this.viewMode) {
                    if (icon) icon.textContent = '👁️';
                    if (text) text.textContent = 'View';
                } else {
                    if (icon) icon.textContent = '🎨';
                    if (text) text.textContent = 'Customize';
                }
            }
        },

        // Preload critical images for faster initial display
        preloadCriticalImages: function() {
            const imagesToPreload = [];

            // Profile picture
            if (this.profile.profilePicture) {
                imagesToPreload.push(this.profile.profilePicture);
            }

            // Banner image
            if (this.profile.banner && this.profile.banner.image) {
                imagesToPreload.push(this.profile.banner.image);
            }

            // Top friends (first 4 only for above-the-fold)
            if (this.profile.widgets.topFriends && this.profile.widgets.topFriends.friends) {
                this.profile.widgets.topFriends.friends.slice(0, 4).forEach(friend => {
                    if (friend && friend.image) {
                        imagesToPreload.push(friend.image);
                    }
                });
            }

            // Picture wall (first 6 only)
            if (this.profile.widgets.pictureWall && this.profile.widgets.pictureWall.images) {
                this.profile.widgets.pictureWall.images.slice(0, 6).forEach(img => {
                    if (img && img.url) {
                        imagesToPreload.push(img.url);
                    }
                });
            }

            // Preload images in the background
            imagesToPreload.forEach(src => {
                const img = new Image();
                img.src = src;
            });

            console.log(`[OurSpace] Preloading ${imagesToPreload.length} critical images`);
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.OurSpace.init();
        });
    } else {
        window.OurSpace.init();
    }

})();










