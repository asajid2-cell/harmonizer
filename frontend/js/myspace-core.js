// MySpace Core - Initialization and Storage Management

(function() {
    'use strict';

    // Default profile data structure
    const DEFAULT_PROFILE = {
        version: "1.0",
        profile: {
            name: "Your Name Here",
            tagline: "✨ living my best life ✨",
            profilePic: "",
            bannerImage: "",
            mood: { icon: "😎", text: "chillin" },
            onlineStatus: true
        },
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
                    glow: false
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
            effects: {
                falling: { enabled: false, type: "hearts", speed: 2 },
                cursorTrail: { enabled: false, type: "sparkle" },
                blink: false,
                glitter: false
            }
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
                gap: "10px"
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
                html: ""
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

    // Global MySpace object
    window.MySpace = {
        profile: JSON.parse(JSON.stringify(DEFAULT_PROFILE)), // Initialize with default to prevent null errors
        viewMode: false,

        // Initialize the MySpace page
        init: async function() {
            console.log("[MySpace] Initializing...");

            // Load profile from server or localStorage
            await this.loadProfile();

            // Load view mode preference
            this.loadViewMode();

            // Increment visit counter
            this.profile.meta.visits++;
            this.profile.meta.lastModified = Date.now();
            await this.saveProfile();

            // Apply theme and customizations
            this.applyTheme();
            this.loadContent();
            this.updateStats();

            // Setup mode toggle
            this.setupModeToggle();

            console.log("[MySpace] Initialization complete");
        },

        // Load profile from server
        loadProfile: async function() {
            try {
                const response = await fetch('/api/myspace/profile');
                if (response.ok) {
                    const data = await response.json();
                    if (data) {
                        this.profile = data;
                        console.log("[MySpace] Loaded profile from server");
                        return;
                    }
                }
            } catch (e) {
                console.error("[MySpace] Error loading from server:", e);
            }

            // Fallback to localStorage
            const saved = localStorage.getItem('myspace-profile');
            if (saved) {
                try {
                    this.profile = JSON.parse(saved);
                    console.log("[MySpace] Loaded saved profile from localStorage");
                } catch (e) {
                    console.error("[MySpace] Error loading profile:", e);
                    this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                }
            } else {
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                console.log("[MySpace] Created new profile");
            }
        },

        // Save profile to server
        saveProfile: async function() {
            try {
                this.profile.meta.lastModified = Date.now();

                // Check if user is authenticated
                const isAuthenticated = window.MySpaceAuth && window.MySpaceAuth.isAuthenticated;
                console.log(`[MySpace] saveProfile called - isAuthenticated: ${isAuthenticated}`);

                let response;
                if (isAuthenticated) {
                    // Save to database for authenticated users
                    console.log('[MySpace] Saving to database via /api/myspace/profile/save');
                    response = await fetch('/api/myspace/profile/save', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(this.profile)
                    });
                } else {
                    // Save to temp storage for non-authenticated users
                    console.log('[MySpace] Saving to temp storage via /api/myspace/profile');
                    response = await fetch('/api/myspace/profile', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(this.profile)
                    });
                }

                if (response.ok) {
                    console.log(`[MySpace] Profile saved successfully to ${isAuthenticated ? 'database' : 'temp storage'}`);
                } else {
                    throw new Error('Server save failed');
                }

                return true;
            } catch (e) {
                console.error("[MySpace] Error saving profile:", e);
                // Fallback to localStorage
                try {
                    localStorage.setItem('myspace-profile', JSON.stringify(this.profile));
                    console.log("[MySpace] Profile saved to localStorage (fallback)");
                } catch (localErr) {
                    alert("Error saving profile. Storage might be full.");
                    return false;
                }
                return true;
            }
        },

        // Reset profile to defaults
        resetProfile: function() {
            if (confirm("Are you sure you want to reset everything? This cannot be undone!")) {
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                this.saveProfile();
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
            link.download = 'myspace-profile.json';
            link.click();

            URL.revokeObjectURL(url);
            console.log("[MySpace] Profile exported");
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
                    console.error("[MySpace] Import error:", error);
                }
            };
            reader.readAsText(file);
        },

        // Apply current theme
        applyTheme: function() {
            const theme = this.profile.theme;

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

            console.log("[MySpace] Applying theme:", theme.name);
            console.log("[MySpace] Background type:", theme.background.type);
            console.log("[MySpace] Background color:", theme.colors.background);

            // Apply theme class (preserve view-mode class)
            const viewMode = document.body.classList.contains('view-mode');
            document.body.className = `theme-${theme.name}`;
            if (viewMode) {
                document.body.classList.add('view-mode');
            }

            // Apply custom colors
            const bg = document.getElementById('myspace-background');
            console.log("[MySpace] Background element:", bg);
            if (bg) {
                // Clear all background styles first
                bg.style.background = '';
                bg.style.backgroundColor = '';
                bg.style.backgroundImage = '';
                bg.style.backgroundRepeat = '';
                bg.style.backgroundSize = '';
                bg.style.backgroundPosition = '';
                bg.style.backgroundAttachment = '';

                if (theme.background.type === 'solid') {
                    // Solid color background
                    console.log("[MySpace] Applying solid color:", theme.colors.background);
                    bg.style.backgroundColor = theme.colors.background;
                } else if (theme.background.type === 'gradient') {
                    // Gradient background
                    const gradient = theme.background.gradient ||
                        `linear-gradient(135deg, ${theme.colors.background} 0%, #000000 100%)`;
                    console.log("[MySpace] Applying gradient:", gradient);
                    bg.style.background = gradient;
                } else if (theme.background.type === 'pattern') {
                    // Pattern background with color
                    const patternUrl = this.getPatternUrl(theme.background.pattern);
                    console.log("[MySpace] Applying pattern:", theme.background.pattern);
                    console.log("[MySpace] Pattern URL:", patternUrl);
                    bg.style.backgroundColor = theme.colors.background;
                    bg.style.backgroundImage = patternUrl;
                    bg.style.backgroundRepeat = 'repeat';
                    bg.style.backgroundAttachment = 'fixed';
                } else if (theme.background.type === 'image' && theme.background.image) {
                    // Custom image background with transformations
                    console.log("[MySpace] Applying custom image with transformations");
                    bg.style.backgroundImage = `url(${theme.background.image})`;

                    // Handle custom size
                    const bgSize = theme.background.size === 'custom'
                        ? `${theme.background.customSize}px ${theme.background.customSize}px`
                        : (theme.background.size || 'cover');
                    bg.style.backgroundSize = bgSize;

                    bg.style.backgroundPosition = theme.background.position || 'center';
                    bg.style.backgroundAttachment = theme.background.attachment || 'fixed';
                    bg.style.backgroundRepeat = theme.background.repeat || 'no-repeat';

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

                    // Apply blend mode and opacity
                    if (theme.background.blend) {
                        bg.style.mixBlendMode = theme.background.blend.mode || 'normal';
                        bg.style.opacity = (theme.background.blend.opacity || 100) / 100;
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

                    // Create or update the transform overlay
                    let overlay = document.getElementById('bg-transform-overlay');
                    if (!overlay) {
                        overlay = document.createElement('div');
                        overlay.id = 'bg-transform-overlay';
                        overlay.style.cssText = `
                            position: fixed;
                            top: -50%;
                            left: -50%;
                            width: 200%;
                            height: 200%;
                            pointer-events: none;
                            z-index: -1;
                        `;
                        bg.appendChild(overlay);
                    }

                    overlay.style.backgroundImage = `url(${theme.background.image})`;
                    overlay.style.backgroundSize = bgSize;
                    overlay.style.backgroundPosition = 'center';
                    overlay.style.backgroundRepeat = theme.background.repeat || 'no-repeat';
                    overlay.style.transform = transforms.length > 0 ? transforms.join(' ') : 'none';
                    overlay.style.filter = filters.length > 0 ? filters.join(' ') : 'none';
                }
                console.log("[MySpace] Final background styles:", {
                    background: bg.style.background,
                    backgroundColor: bg.style.backgroundColor,
                    backgroundImage: bg.style.backgroundImage
                });
            }

            // Apply font
            document.body.style.fontFamily = theme.fonts.family;
            document.body.style.fontSize = theme.fonts.size + 'px';

            // Apply text effects
            if (theme.fonts.effects.shadow) {
                document.body.style.textShadow = '2px 2px 4px rgba(0, 0, 0, 0.8)';
            }
            if (theme.fonts.effects.glow) {
                document.body.classList.add('glow');
            }

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

            console.log("[MySpace] Theme applied:", theme.name);
        },

        // Load content into page
        loadContent: function() {
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

            if (profilePic && this.profile.profile.profilePic) {
                profilePic.src = this.profile.profile.profilePic;
                profilePic.style.display = 'block';
            }

            // Banner image
            const banner = document.getElementById('banner-image');
            if (banner && this.profile.profile.bannerImage) {
                banner.style.backgroundImage = `url(${this.profile.profile.bannerImage})`;
                const overlay = banner.querySelector('.upload-overlay');
                if (overlay) overlay.style.display = 'none';
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

            console.log("[MySpace] Content loaded");
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
                glitter: 'url("data:image/svg+xml,%3Csvg width=\'40\' height=\'40\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M8,8 L9,12 L8,13 L7,12 Z M8,8 L12,9 L13,8 L12,7 Z\' fill=\'rgba(255,255,255,0.6)\' /%3E%3Cpath d=\'M28,15 L29,18 L28,19 L27,18 Z M28,15 L31,16 L32,15 L31,14 Z\' fill=\'rgba(255,255,100,0.5)\' /%3E%3Cpath d=\'M15,28 L16,30 L15,31 L14,30 Z M15,28 L17,29 L18,28 L17,27 Z\' fill=\'rgba(255,200,255,0.5)\' /%3E%3Ccircle cx=\'32\' cy=\'8\' r=\'1.5\' fill=\'rgba(255,255,255,0.7)\' /%3E%3Ccircle cx=\'10\' cy=\'35\' r=\'1\' fill=\'rgba(255,255,255,0.8)\' /%3E%3C/svg%3E")'
            };
            return patterns[patternName] || patterns.stars;
        },

        // Load view mode preference
        loadViewMode: function() {
            const saved = localStorage.getItem('myspace-view-mode');
            this.viewMode = saved === 'true';
            this.applyViewMode();
        },

        // Save view mode preference
        saveViewMode: function() {
            localStorage.setItem('myspace-view-mode', this.viewMode);
        },

        // Apply view mode
        applyViewMode: function() {
            if (this.viewMode) {
                document.body.classList.add('view-mode');
            } else {
                document.body.classList.remove('view-mode');
            }
            this.updateModeButton();
        },

        // Toggle view mode
        toggleViewMode: function() {
            this.viewMode = !this.viewMode;
            this.saveViewMode();
            this.applyViewMode();
            console.log("[MySpace] View mode:", this.viewMode ? 'ON' : 'OFF');
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
        }
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            window.MySpace.init();
        });
    } else {
        window.MySpace.init();
    }

})();
