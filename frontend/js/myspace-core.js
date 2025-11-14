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
                gradient: ""
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
        profile: null,
        viewMode: false,

        // Initialize the MySpace page
        init: function() {
            console.log("[MySpace] Initializing...");

            // Load profile from localStorage or use default
            this.loadProfile();

            // Load view mode preference
            this.loadViewMode();

            // Increment visit counter
            this.profile.meta.visits++;
            this.profile.meta.lastModified = Date.now();
            this.saveProfile();

            // Apply theme and customizations
            this.applyTheme();
            this.loadContent();
            this.updateStats();

            // Setup mode toggle
            this.setupModeToggle();

            console.log("[MySpace] Initialization complete");
        },

        // Load profile from localStorage
        loadProfile: function() {
            const saved = localStorage.getItem('myspace-profile');
            if (saved) {
                try {
                    this.profile = JSON.parse(saved);
                    console.log("[MySpace] Loaded saved profile");
                } catch (e) {
                    console.error("[MySpace] Error loading profile:", e);
                    this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                }
            } else {
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                console.log("[MySpace] Created new profile");
            }
        },

        // Save profile to localStorage
        saveProfile: function() {
            try {
                this.profile.meta.lastModified = Date.now();
                localStorage.setItem('myspace-profile', JSON.stringify(this.profile));
                console.log("[MySpace] Profile saved");
                return true;
            } catch (e) {
                console.error("[MySpace] Error saving profile:", e);
                alert("Error saving profile. Your browser's storage might be full.");
                return false;
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

            // Apply theme class (preserve view-mode class)
            const viewMode = document.body.classList.contains('view-mode');
            document.body.className = `theme-${theme.name}`;
            if (viewMode) {
                document.body.classList.add('view-mode');
            }

            // Apply custom colors
            const bg = document.getElementById('myspace-background');
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
                    bg.style.backgroundColor = theme.colors.background;
                } else if (theme.background.type === 'gradient') {
                    // Gradient background
                    bg.style.background = theme.background.gradient ||
                        `linear-gradient(135deg, ${theme.colors.background} 0%, #000000 100%)`;
                } else if (theme.background.type === 'pattern') {
                    // Pattern background with color
                    bg.style.backgroundColor = theme.colors.background;
                    bg.style.backgroundImage = this.getPatternUrl(theme.background.pattern);
                    bg.style.backgroundRepeat = 'repeat';
                    bg.style.backgroundAttachment = 'fixed';
                } else if (theme.background.type === 'image' && theme.background.image) {
                    // Custom image background
                    bg.style.backgroundImage = `url(${theme.background.image})`;
                    bg.style.backgroundSize = 'cover';
                    bg.style.backgroundPosition = 'center';
                    bg.style.backgroundAttachment = 'fixed';
                    bg.style.backgroundRepeat = 'no-repeat';
                }
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
                stars: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHRleHQgeD0iMTAiIHk9IjI1IiBmb250LXNpemU9IjIwIj7imrQ8L3RleHQ+PC9zdmc+)',
                hearts: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHRleHQgeD0iMTAiIHk9IjI1IiBmb250LXNpemU9IjIwIj7wn5KWPC90ZXh0Pjwvc3ZnPg==)',
                flames: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHRleHQgeD0iMTAiIHk9IjI1IiBmb250LXNpemU9IjIwIj7wn5SlPC90ZXh0Pjwvc3ZnPg==)',
                sparkles: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHRleHQgeD0iMTAiIHk9IjI1IiBmb250LXNpemU9IjIwIj7inajvuI88L3RleHQ+PC9zdmc+)',
                checkers: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiLz48cmVjdCB4PSIyMCIgeT0iMjAiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+)',
                dots: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iNSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjIpIi8+PC9zdmc+)',
                stripes: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGxpbmUgeDE9IjAiIHkxPSIwIiB4Mj0iNDAiIHkyPSI0MCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==)',
                glitter: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHRleHQgeD0iNSIgeT0iMTUiIGZvbnQtc2l6ZT0iMTAiPuKcqDwvdGV4dD48dGV4dCB4PSIyNSIgeT0iMzAiIGZvbnQtc2l6ZT0iOCI+4pyoPC90ZXh0Pjwvc3ZnPg==)'
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
