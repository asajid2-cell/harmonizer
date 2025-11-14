// MySpace Customizer - Customization Panel Logic

(function() {
    'use strict';

    window.addEventListener('DOMContentLoaded', function() {
        initCustomizer();
    });

    function initCustomizer() {
        console.log("[Customizer] Initializing customization panel...");

        // Panel toggle
        setupPanelToggle();

        // Theme presets
        setupThemePresets();

        // Color pickers
        setupColorPickers();

        // Background controls
        setupBackgroundControls();

        // Font controls
        setupFontControls();

        // Effects controls
        setupEffectsControls();

        // Layout controls
        setupLayoutControls();

        // Save/Load/Export/Reset
        setupProfileActions();

        console.log("[Customizer] Initialization complete");
    }

    // Panel Toggle
    function setupPanelToggle() {
        const panel = document.getElementById('customization-panel');
        const toggleBtn = document.getElementById('toggle-panel');

        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', function() {
                panel.classList.toggle('collapsed');
                toggleBtn.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
            });
        }
    }

    // Theme Presets
    function setupThemePresets() {
        const themeBtns = document.querySelectorAll('.theme-btn');

        themeBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const themeName = this.dataset.theme;
                applyThemePreset(themeName);
            });
        });
    }

    function applyThemePreset(themeName) {
        console.log("[Customizer] Applying theme:", themeName);

        const themes = {
            classic: {
                name: 'classic',
                colors: {
                    background: '#0066cc',
                    text: '#ffffff',
                    links: '#00ccff',
                    linksHover: '#ffff00',
                    borders: '#ffffff',
                    widgetBg: '#003399',
                    widgetBgOpacity: 80
                },
                fonts: {
                    family: 'Arial',
                    size: 14
                },
                background: {
                    type: 'solid',
                    pattern: 'stars'
                }
            },
            glitter: {
                name: 'glitter',
                colors: {
                    background: '#ff69b4',
                    text: '#ffffff',
                    links: '#ffb3d9',
                    linksHover: '#ff1493',
                    borders: '#ff1493',
                    widgetBg: '#c71585',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'hearts'
                }
            },
            emo: {
                name: 'emo',
                colors: {
                    background: '#000000',
                    text: '#ffffff',
                    links: '#ff00ff',
                    linksHover: '#00ffff',
                    borders: '#ff00ff',
                    widgetBg: '#000000',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Arial',
                    size: 14
                },
                background: {
                    type: 'solid',
                    pattern: 'stars'
                }
            },
            rainbow: {
                name: 'rainbow',
                colors: {
                    background: '#ffffff',
                    text: '#000000',
                    links: '#ff0000',
                    linksHover: '#0000ff',
                    borders: '#ff00ff',
                    widgetBg: '#ffffff',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 14
                },
                background: {
                    type: 'solid',
                    pattern: 'sparkles'
                }
            },
            goth: {
                name: 'goth',
                colors: {
                    background: '#1a0000',
                    text: '#8b0000',
                    links: '#ff0000',
                    linksHover: '#cc0000',
                    borders: '#8b0000',
                    widgetBg: '#000000',
                    widgetBgOpacity: 95
                },
                fonts: {
                    family: 'Times New Roman',
                    size: 14
                },
                background: {
                    type: 'solid',
                    pattern: 'flames'
                }
            },
            y2k: {
                name: 'y2k',
                colors: {
                    background: '#000000',
                    text: '#00ff00',
                    links: '#00ffff',
                    linksHover: '#ff00ff',
                    borders: '#00ff00',
                    widgetBg: '#000000',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Courier New',
                    size: 14
                },
                background: {
                    type: 'solid',
                    pattern: 'dots'
                }
            }
        };

        const theme = themes[themeName];
        if (theme) {
            window.MySpace.profile.theme.name = theme.name;
            Object.assign(window.MySpace.profile.theme.colors, theme.colors);
            Object.assign(window.MySpace.profile.theme.fonts, theme.fonts);
            Object.assign(window.MySpace.profile.theme.background, theme.background);

            // Update UI controls
            updateColorPickers();
            updateFontControls();
            updateBackgroundControls();

            // Apply and save
            window.MySpace.applyTheme();
            window.MySpace.saveProfile();
        }
    }

    // Color Pickers
    function setupColorPickers() {
        const colorBg = document.getElementById('color-bg');
        const colorText = document.getElementById('color-text');
        const colorLinks = document.getElementById('color-links');
        const colorBorders = document.getElementById('color-borders');
        const colorWidgetBg = document.getElementById('color-widget-bg');
        const widgetBgOpacity = document.getElementById('widget-bg-opacity');
        const opacityValue = document.getElementById('opacity-value');

        // Initialize with current values
        updateColorPickers();

        // Background color
        if (colorBg) {
            colorBg.addEventListener('change', function() {
                window.MySpace.profile.theme.colors.background = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Text color
        if (colorText) {
            colorText.addEventListener('change', function() {
                window.MySpace.profile.theme.colors.text = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Links color
        if (colorLinks) {
            colorLinks.addEventListener('change', function() {
                window.MySpace.profile.theme.colors.links = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Borders color
        if (colorBorders) {
            colorBorders.addEventListener('change', function() {
                window.MySpace.profile.theme.colors.borders = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Widget background color
        if (colorWidgetBg) {
            colorWidgetBg.addEventListener('change', function() {
                window.MySpace.profile.theme.colors.widgetBg = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Widget background opacity
        if (widgetBgOpacity) {
            widgetBgOpacity.addEventListener('input', function() {
                if (opacityValue) opacityValue.textContent = this.value + '%';
                window.MySpace.profile.theme.colors.widgetBgOpacity = parseInt(this.value);
                window.MySpace.applyTheme();
            });

            widgetBgOpacity.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }
    }

    function updateColorPickers() {
        const colors = window.MySpace.profile.theme.colors;

        const colorBg = document.getElementById('color-bg');
        const colorText = document.getElementById('color-text');
        const colorLinks = document.getElementById('color-links');
        const colorBorders = document.getElementById('color-borders');
        const colorWidgetBg = document.getElementById('color-widget-bg');
        const widgetBgOpacity = document.getElementById('widget-bg-opacity');
        const opacityValue = document.getElementById('opacity-value');

        if (colorBg) colorBg.value = colors.background;
        if (colorText) colorText.value = colors.text;
        if (colorLinks) colorLinks.value = colors.links;
        if (colorBorders) colorBorders.value = colors.borders;
        if (colorWidgetBg) colorWidgetBg.value = colors.widgetBg;
        if (widgetBgOpacity) widgetBgOpacity.value = colors.widgetBgOpacity;
        if (opacityValue) opacityValue.textContent = colors.widgetBgOpacity + '%';
    }

    // Background Controls
    function setupBackgroundControls() {
        const bgType = document.getElementById('bg-type');
        const patternGrid = document.getElementById('pattern-grid');
        const uploadBgBtn = document.getElementById('upload-bg-btn');
        const bgImageUpload = document.getElementById('bg-image-upload');

        // Background type selector
        if (bgType) {
            bgType.value = window.MySpace.profile.theme.background.type;

            bgType.addEventListener('change', function() {
                window.MySpace.profile.theme.background.type = this.value;

                if (this.value === 'pattern') {
                    if (patternGrid) patternGrid.style.display = 'grid';
                } else {
                    if (patternGrid) patternGrid.style.display = 'none';
                }

                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Pattern selection
        if (patternGrid) {
            const patternItems = patternGrid.querySelectorAll('.pattern-item');
            patternItems.forEach(item => {
                if (item.dataset.pattern === window.MySpace.profile.theme.background.pattern) {
                    item.classList.add('active');
                }

                item.addEventListener('click', function() {
                    patternItems.forEach(p => p.classList.remove('active'));
                    this.classList.add('active');

                    window.MySpace.profile.theme.background.pattern = this.dataset.pattern;
                    window.MySpace.profile.theme.background.type = 'pattern';
                    if (bgType) bgType.value = 'pattern';

                    window.MySpace.applyTheme();
                    window.MySpace.saveProfile();
                });
            });
        }

        // Background image upload
        if (uploadBgBtn) {
            uploadBgBtn.addEventListener('click', function() {
                if (bgImageUpload) bgImageUpload.click();
            });
        }

        if (bgImageUpload) {
            bgImageUpload.addEventListener('change', function() {
                const file = this.files[0];
                if (file && file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        window.MySpace.profile.theme.background.image = e.target.result;
                        window.MySpace.profile.theme.background.type = 'image';
                        if (bgType) bgType.value = 'image';

                        window.MySpace.applyTheme();
                        window.MySpace.saveProfile();
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }

    function updateBackgroundControls() {
        const bgType = document.getElementById('bg-type');
        const patternGrid = document.getElementById('pattern-grid');

        if (bgType) {
            bgType.value = window.MySpace.profile.theme.background.type;
        }

        if (patternGrid) {
            const patternItems = patternGrid.querySelectorAll('.pattern-item');
            patternItems.forEach(item => {
                item.classList.remove('active');
                if (item.dataset.pattern === window.MySpace.profile.theme.background.pattern) {
                    item.classList.add('active');
                }
            });
        }
    }

    // Font Controls
    function setupFontControls() {
        const fontFamily = document.getElementById('font-family');
        const fontSize = document.getElementById('font-size');
        const fontSizeDisplay = document.getElementById('font-size-display');
        const textShadow = document.getElementById('text-shadow');
        const textGlow = document.getElementById('text-glow');

        // Initialize with current values
        updateFontControls();

        // Font family
        if (fontFamily) {
            fontFamily.addEventListener('change', function() {
                window.MySpace.profile.theme.fonts.family = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Font size
        if (fontSize) {
            fontSize.addEventListener('input', function() {
                if (fontSizeDisplay) fontSizeDisplay.textContent = this.value + 'px';
                window.MySpace.profile.theme.fonts.size = parseInt(this.value);
                window.MySpace.applyTheme();
            });

            fontSize.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Text shadow
        if (textShadow) {
            textShadow.addEventListener('change', function() {
                window.MySpace.profile.theme.fonts.effects.shadow = this.checked;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Text glow
        if (textGlow) {
            textGlow.addEventListener('change', function() {
                window.MySpace.profile.theme.fonts.effects.glow = this.checked;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }
    }

    function updateFontControls() {
        const fonts = window.MySpace.profile.theme.fonts;

        const fontFamily = document.getElementById('font-family');
        const fontSize = document.getElementById('font-size');
        const fontSizeDisplay = document.getElementById('font-size-display');
        const textShadow = document.getElementById('text-shadow');
        const textGlow = document.getElementById('text-glow');

        if (fontFamily) fontFamily.value = fonts.family;
        if (fontSize) fontSize.value = fonts.size;
        if (fontSizeDisplay) fontSizeDisplay.textContent = fonts.size + 'px';
        if (textShadow) textShadow.checked = fonts.effects.shadow;
        if (textGlow) textGlow.checked = fonts.effects.glow;
    }

    // Effects Controls
    function setupEffectsControls() {
        const effectFalling = document.getElementById('effect-falling');
        const fallingType = document.getElementById('falling-type');
        const effectCursorTrail = document.getElementById('effect-cursor-trail');
        const effectGlitter = document.getElementById('effect-glitter');
        const effectBlink = document.getElementById('effect-blink');

        // Falling objects
        if (effectFalling) {
            effectFalling.checked = window.MySpace.profile.theme.effects.falling.enabled;

            effectFalling.addEventListener('change', function() {
                window.MySpace.profile.theme.effects.falling.enabled = this.checked;
                window.MySpace.saveProfile();

                // Trigger effects update
                if (window.MySpaceEffects && window.MySpaceEffects.updateFallingEffect) {
                    window.MySpaceEffects.updateFallingEffect();
                }
            });
        }

        // Falling type
        if (fallingType) {
            fallingType.value = window.MySpace.profile.theme.effects.falling.type;

            fallingType.addEventListener('change', function() {
                window.MySpace.profile.theme.effects.falling.type = this.value;
                window.MySpace.saveProfile();

                if (window.MySpaceEffects && window.MySpaceEffects.updateFallingEffect) {
                    window.MySpaceEffects.updateFallingEffect();
                }
            });
        }

        // Cursor trail
        if (effectCursorTrail) {
            effectCursorTrail.checked = window.MySpace.profile.theme.effects.cursorTrail.enabled;

            effectCursorTrail.addEventListener('change', function() {
                window.MySpace.profile.theme.effects.cursorTrail.enabled = this.checked;
                window.MySpace.saveProfile();

                if (window.MySpaceEffects && window.MySpaceEffects.toggleCursorTrail) {
                    window.MySpaceEffects.toggleCursorTrail(this.checked);
                }
            });
        }

        // Glitter borders
        if (effectGlitter) {
            effectGlitter.checked = window.MySpace.profile.theme.effects.glitter;

            effectGlitter.addEventListener('change', function() {
                window.MySpace.profile.theme.effects.glitter = this.checked;
                window.MySpace.saveProfile();

                // Toggle glitter class on widgets
                const widgets = document.querySelectorAll('.widget, .picture-item, .friend-slot');
                widgets.forEach(widget => {
                    if (this.checked) {
                        widget.classList.add('glitter-border');
                    } else {
                        widget.classList.remove('glitter-border');
                    }
                });
            });
        }

        // Blinking text
        if (effectBlink) {
            effectBlink.checked = window.MySpace.profile.theme.effects.blink;

            effectBlink.addEventListener('change', function() {
                window.MySpace.profile.theme.effects.blink = this.checked;
                window.MySpace.saveProfile();

                // Toggle blink class on headers
                const headers = document.querySelectorAll('.widget-header h2, .profile-name');
                headers.forEach(header => {
                    if (this.checked) {
                        header.classList.add('blink');
                    } else {
                        header.classList.remove('blink');
                    }
                });
            });
        }
    }

    // Layout Controls
    function setupLayoutControls() {
        const layoutBtns = document.querySelectorAll('.layout-btn');

        layoutBtns.forEach(btn => {
            if (btn.dataset.layout === window.MySpace.profile.layout.preset) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', function() {
                layoutBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                const layout = this.dataset.layout;
                window.MySpace.profile.layout.preset = layout;

                const grid = document.getElementById('content-grid');
                if (grid) {
                    grid.className = `content-grid layout-${layout}`;
                }

                window.MySpace.saveProfile();
            });
        });
    }

    // Profile Actions
    function setupProfileActions() {
        const saveBtn = document.getElementById('save-profile');
        const loadBtn = document.getElementById('load-profile');
        const exportBtn = document.getElementById('export-profile');
        const resetBtn = document.getElementById('reset-profile');

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (window.MySpace.saveProfile()) {
                    alert('Profile saved successfully! ✨');
                }
            });
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', function() {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        window.MySpace.importProfile(file);
                    }
                };
                input.click();
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                window.MySpace.exportProfile();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                window.MySpace.resetProfile();
            });
        }
    }

})();
