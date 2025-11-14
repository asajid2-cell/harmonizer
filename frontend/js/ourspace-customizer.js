// OurSpace Customizer - Customization Panel Logic

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
            const updateState = () => {
                const collapsed = panel.classList.contains('collapsed');
                toggleBtn.textContent = collapsed ? '▶' : '◀';
                toggleBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
            };

            toggleBtn.addEventListener('click', function() {
                panel.classList.toggle('collapsed');
                updateState();
            });

            updateState();
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
            },
            tigerprint: {
                name: 'tigerprint',
                colors: {
                    background: '#ff0da6',
                    text: '#ffffff',
                    links: '#2de3ff',
                    linksHover: '#ffe600',
                    borders: '#0e0b2b',
                    widgetBg: '#050014',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'tigerprint'
                }
            },
            mallgoth: {
                name: 'mallgoth',
                colors: {
                    background: '#120000',
                    text: '#ff3c49',
                    links: '#ffea5a',
                    linksHover: '#ff8d2d',
                    borders: '#470000',
                    widgetBg: '#050505',
                    widgetBgOpacity: 95
                },
                fonts: {
                    family: 'Times New Roman',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'mallgoth'
                }
            },
            checkers: {
                name: 'checkers',
                colors: {
                    background: '#080808',
                    text: '#ffffff',
                    links: '#00ccff',
                    linksHover: '#ff66ff',
                    borders: '#ffffff',
                    widgetBg: '#0b0b0b',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Verdana',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'checkers'
                }
            },
            poppunk: {
                name: 'poppunk',
                colors: {
                    background: '#000000',
                    text: '#ffffff',
                    links: '#ff6dfc',
                    linksHover: '#3df1ff',
                    borders: '#ffffff',
                    widgetBg: '#0e0e0e',
                    widgetBgOpacity: 80
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'poppunk'
                }
            },
            evanescent: {
                name: 'evanescent',
                colors: {
                    background: '#0c0f24',
                    text: '#d9f0ff',
                    links: '#7ce6ff',
                    linksHover: '#f059ff',
                    borders: '#8fe1ff',
                    widgetBg: '#05050c',
                    widgetBgOpacity: 88
                },
                fonts: {
                    family: 'Georgia',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'evanescent'
                }
            }
        };

        const theme = themes[themeName];
        if (theme) {
            window.OurSpace.profile.theme.name = theme.name;
            Object.assign(window.OurSpace.profile.theme.colors, theme.colors);
            Object.assign(window.OurSpace.profile.theme.fonts, theme.fonts);
            Object.assign(window.OurSpace.profile.theme.background, theme.background);

            // Update UI controls
            updateColorPickers();
            updateFontControls();
            updateBackgroundControls();

            // Apply and save
            window.OurSpace.applyTheme();
            // Auto-save removed - only save when user clicks Save Profile button
        }
    }

    // Color Pickers
    function setupColorPickers() {
        const colorBg = document.getElementById('color-bg');
        const colorText = document.getElementById('color-text');
        const colorLinks = document.getElementById('color-links');
        const colorBorders = document.getElementById('color-borders');
        const colorLabels = document.getElementById('color-labels');
        const colorWidgetBg = document.getElementById('color-widget-bg');
        const widgetBgOpacity = document.getElementById('widget-bg-opacity');
        const opacityValue = document.getElementById('opacity-value');

        // Initialize with current values
        updateColorPickers();

        // Background color
        if (colorBg) {
            console.log('[Customizer] Background color picker found:', colorBg);
            console.log('[Customizer] Current value:', colorBg.value);

            colorBg.addEventListener('input', function() {
                console.log('[Customizer] Background color changed to:', this.value);
                window.OurSpace.profile.theme.colors.background = this.value;
                // Automatically switch to solid color background when user picks a color
                window.OurSpace.profile.theme.background.type = 'solid';
                console.log('[Customizer] Switched background type to solid');
                // Update the bg-type selector to reflect the change
                const bgTypeSelect = document.getElementById('bg-type');
                if (bgTypeSelect) {
                    bgTypeSelect.value = 'solid';
                    console.log('[Customizer] Updated dropdown to solid');
                }
                window.OurSpace.applyTheme();
            });
            colorBg.addEventListener('change', function() {
                console.log('[Customizer] Saving profile with new background color');
                // Auto-save removed - only save when user clicks Save Profile button
            });
        } else {
            console.error('[Customizer] Background color picker NOT FOUND! Element #color-bg is missing.');
        }

        // Text color
        if (colorText) {
            colorText.addEventListener('input', function() {
                window.OurSpace.profile.theme.colors.text = this.value;
                window.OurSpace.applyTheme();
            });
            colorText.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Links color
        if (colorLinks) {
            colorLinks.addEventListener('input', function() {
                window.OurSpace.profile.theme.colors.links = this.value;
                window.OurSpace.applyTheme();
            });
            colorLinks.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Borders color
        if (colorBorders) {
            colorBorders.addEventListener('input', function() {
                window.OurSpace.profile.theme.colors.borders = this.value;
                window.OurSpace.applyTheme();
            });
            colorBorders.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Label text color (Music, TV, etc)
        if (colorLabels) {
            colorLabels.addEventListener('input', function() {
                window.OurSpace.profile.theme.colors.labelText = this.value;
                window.OurSpace.applyTheme();
            });
            colorLabels.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Widget background color
        if (colorWidgetBg) {
            colorWidgetBg.addEventListener('input', function() {
                window.OurSpace.profile.theme.colors.widgetBg = this.value;
                window.OurSpace.applyTheme();
            });
            colorWidgetBg.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Widget background opacity
        if (widgetBgOpacity) {
            widgetBgOpacity.addEventListener('input', function() {
                if (opacityValue) opacityValue.textContent = this.value + '%';
                window.OurSpace.profile.theme.colors.widgetBgOpacity = parseInt(this.value);
                window.OurSpace.applyTheme();
            });

            widgetBgOpacity.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }
    }

    function updateColorPickers() {
        const colors = window.OurSpace.profile.theme.colors;

        const colorBg = document.getElementById('color-bg');
        const colorText = document.getElementById('color-text');
        const colorLinks = document.getElementById('color-links');
        const colorBorders = document.getElementById('color-borders');
        const colorLabels = document.getElementById('color-labels');
        const colorWidgetBg = document.getElementById('color-widget-bg');
        const widgetBgOpacity = document.getElementById('widget-bg-opacity');
        const opacityValue = document.getElementById('opacity-value');

        if (colorBg) colorBg.value = colors.background;
        if (colorText) colorText.value = colors.text;
        if (colorLinks) colorLinks.value = colors.links;
        if (colorBorders) colorBorders.value = colors.borders;
        if (colorLabels) colorLabels.value = colors.labelText || '#00aaff';
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
            bgType.value = window.OurSpace.profile.theme.background.type;

            // Show/hide pattern grid based on initial type
            if (patternGrid) {
                patternGrid.style.display = (bgType.value === 'pattern') ? 'grid' : 'none';
            }

            bgType.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.type = this.value;

                // Clear custom image when switching away from 'image' type
                if (this.value !== 'image' && window.OurSpace.profile.theme.background.image) {
                    console.log('[Customizer] Clearing custom background image');
                    // Don't delete the image, just clear the reference
                    window.OurSpace.profile.theme.background.image = '';
                }

                if (this.value === 'pattern') {
                    if (patternGrid) patternGrid.style.display = 'grid';
                } else {
                    if (patternGrid) patternGrid.style.display = 'none';
                }

                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Pattern selection
        if (patternGrid) {
            const patternItems = patternGrid.querySelectorAll('.pattern-item');
            patternItems.forEach(item => {
                if (item.dataset.pattern === window.OurSpace.profile.theme.background.pattern) {
                    item.classList.add('active');
                }

                item.addEventListener('click', function() {
                    patternItems.forEach(p => p.classList.remove('active'));
                    this.classList.add('active');

                    window.OurSpace.profile.theme.background.pattern = this.dataset.pattern;
                    window.OurSpace.profile.theme.background.type = 'pattern';
                    window.OurSpace.profile.theme.background.image = ''; // Clear custom image
                    if (bgType) bgType.value = 'pattern';

                    window.OurSpace.applyTheme();
                    // Auto-save removed - only save when user clicks Save Profile button
                });
            });
        }

        // Background image upload
        if (uploadBgBtn) {
            uploadBgBtn.addEventListener('click', function() {
                if (bgImageUpload) bgImageUpload.click();
            });
        }

        const removeBgBtn = document.getElementById('remove-bg-btn');

        if (bgImageUpload) {
            bgImageUpload.addEventListener('change', async function() {
                const file = this.files[0];
                if (file && file.type.startsWith('image/')) {
                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'background');

                        const response = await fetch('/api/ourspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.OurSpace.profile.theme.background.image = data.url;
                            window.OurSpace.profile.theme.background.type = 'image';
                            if (bgType) bgType.value = 'image';

                            // Show remove button
                            if (removeBgBtn) removeBgBtn.style.display = 'block';

                            window.OurSpace.applyTheme();
                            // Auto-save removed - only save when user clicks Save Profile button
                        } else {
                            console.error('[Customizer] Failed to upload background image');
                            alert('Failed to upload background image');
                        }
                    } catch (e) {
                        console.error('[Customizer] Error uploading background image:', e);
                        alert('Error uploading background image');
                    }
                }
            });
        }

        // Remove custom background button
        if (removeBgBtn) {
            // Show/hide based on whether there's a custom background
            if (window.OurSpace.profile.theme.background.image) {
                removeBgBtn.style.display = 'block';
            }

            removeBgBtn.addEventListener('click', function() {
                if (confirm('Remove custom background image?')) {
                    window.OurSpace.profile.theme.background.image = '';
                    window.OurSpace.profile.theme.background.type = 'solid';
                    if (bgType) bgType.value = 'solid';

                    this.style.display = 'none';

                    window.OurSpace.applyTheme();
                    // Auto-save removed - only save when user clicks Save Profile button
                }
            });
        }

        // Setup background transformation controls
        setupBackgroundTransformControls();
    }

    function setupBackgroundTransformControls() {
        const transformPanel = document.getElementById('bg-transform-panel');
        const bgType = document.getElementById('bg-type');

        // Show/hide transform panel based on background type
        function updateTransformPanelVisibility() {
            if (transformPanel && bgType) {
                transformPanel.style.display = bgType.value === 'image' ? 'block' : 'none';
            }
        }

        if (bgType) {
            bgType.addEventListener('change', updateTransformPanelVisibility);
            updateTransformPanelVisibility();
        }

        // Repeat control
        const bgRepeat = document.getElementById('bg-repeat');
        if (bgRepeat) {
            bgRepeat.value = window.OurSpace.profile.theme.background.repeat || 'no-repeat';
            bgRepeat.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.repeat = this.value;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Size control
        const bgSize = document.getElementById('bg-size');
        const bgSizeCustomLabel = document.getElementById('bg-size-custom-label');
        const bgSizeCustom = document.getElementById('bg-size-custom');
        const bgSizeCustomDisplay = document.getElementById('bg-size-custom-display');

        if (bgSize) {
            bgSize.value = window.OurSpace.profile.theme.background.size || 'cover';

            // Show/hide custom size slider
            function updateCustomSizeVisibility() {
                if (bgSizeCustomLabel) {
                    bgSizeCustomLabel.style.display = bgSize.value === 'custom' ? 'block' : 'none';
                }
            }
            updateCustomSizeVisibility();

            bgSize.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.size = this.value;
                updateCustomSizeVisibility();
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Custom size slider
        if (bgSizeCustom && bgSizeCustomDisplay) {
            bgSizeCustom.value = window.OurSpace.profile.theme.background.customSize || 100;
            bgSizeCustomDisplay.textContent = (window.OurSpace.profile.theme.background.customSize || 100) + 'px';

            bgSizeCustom.addEventListener('input', function() {
                bgSizeCustomDisplay.textContent = this.value + 'px';
                window.OurSpace.profile.theme.background.customSize = parseInt(this.value);
                window.OurSpace.applyTheme();
            });

            bgSizeCustom.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Position control
        const bgPosition = document.getElementById('bg-position');
        if (bgPosition) {
            bgPosition.value = window.OurSpace.profile.theme.background.position || 'center';
            bgPosition.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.position = this.value;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Transform controls
        const transform = window.OurSpace.profile.theme.background.transform || {};

        // Scale
        const bgScale = document.getElementById('bg-scale');
        const bgScaleDisplay = document.getElementById('bg-scale-display');
        if (bgScale && bgScaleDisplay) {
            bgScale.value = transform.scale || 1;
            bgScaleDisplay.textContent = (transform.scale || 1).toFixed(1);
            bgScale.addEventListener('input', function() {
                bgScaleDisplay.textContent = parseFloat(this.value).toFixed(1);
                window.OurSpace.profile.theme.background.transform.scale = parseFloat(this.value);
                window.OurSpace.applyTheme();
            });
            bgScale.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Rotate
        const bgRotate = document.getElementById('bg-rotate');
        const bgRotateDisplay = document.getElementById('bg-rotate-display');
        if (bgRotate && bgRotateDisplay) {
            bgRotate.value = transform.rotate || 0;
            bgRotateDisplay.textContent = (transform.rotate || 0) + ' deg';
            bgRotate.addEventListener('input', function() {
                bgRotateDisplay.textContent = this.value + ' deg';
                window.OurSpace.profile.theme.background.transform.rotate = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgRotate.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Skew X
        const bgSkewX = document.getElementById('bg-skewx');
        const bgSkewXDisplay = document.getElementById('bg-skewx-display');
        if (bgSkewX && bgSkewXDisplay) {
            bgSkewX.value = transform.skewX || 0;
            bgSkewXDisplay.textContent = (transform.skewX || 0) + ' deg';
            bgSkewX.addEventListener('input', function() {
                bgSkewXDisplay.textContent = this.value + ' deg';
                window.OurSpace.profile.theme.background.transform.skewX = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgSkewX.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Skew Y
        const bgSkewY = document.getElementById('bg-skewy');
        const bgSkewYDisplay = document.getElementById('bg-skewy-display');
        if (bgSkewY && bgSkewYDisplay) {
            bgSkewY.value = transform.skewY || 0;
            bgSkewYDisplay.textContent = (transform.skewY || 0) + ' deg';
            bgSkewY.addEventListener('input', function() {
                bgSkewYDisplay.textContent = this.value + ' deg';
                window.OurSpace.profile.theme.background.transform.skewY = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgSkewY.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Flip X
        const bgFlipX = document.getElementById('bg-flipx');
        if (bgFlipX) {
            bgFlipX.checked = transform.flipX || false;
            bgFlipX.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.transform.flipX = this.checked;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Flip Y
        const bgFlipY = document.getElementById('bg-flipy');
        if (bgFlipY) {
            bgFlipY.checked = transform.flipY || false;
            bgFlipY.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.transform.flipY = this.checked;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Filter controls
        const filter = window.OurSpace.profile.theme.background.filter || {};

        // Blur
        const bgBlur = document.getElementById('bg-blur');
        const bgBlurDisplay = document.getElementById('bg-blur-display');
        if (bgBlur && bgBlurDisplay) {
            bgBlur.value = filter.blur || 0;
            bgBlurDisplay.textContent = (filter.blur || 0) + 'px';
            bgBlur.addEventListener('input', function() {
                bgBlurDisplay.textContent = this.value + 'px';
                window.OurSpace.profile.theme.background.filter.blur = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgBlur.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Brightness
        const bgBrightness = document.getElementById('bg-brightness');
        const bgBrightnessDisplay = document.getElementById('bg-brightness-display');
        if (bgBrightness && bgBrightnessDisplay) {
            bgBrightness.value = filter.brightness || 100;
            bgBrightnessDisplay.textContent = (filter.brightness || 100) + '%';
            bgBrightness.addEventListener('input', function() {
                bgBrightnessDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.filter.brightness = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgBrightness.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Contrast
        const bgContrast = document.getElementById('bg-contrast');
        const bgContrastDisplay = document.getElementById('bg-contrast-display');
        if (bgContrast && bgContrastDisplay) {
            bgContrast.value = filter.contrast || 100;
            bgContrastDisplay.textContent = (filter.contrast || 100) + '%';
            bgContrast.addEventListener('input', function() {
                bgContrastDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.filter.contrast = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgContrast.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Saturation
        const bgSaturate = document.getElementById('bg-saturate');
        const bgSaturateDisplay = document.getElementById('bg-saturate-display');
        if (bgSaturate && bgSaturateDisplay) {
            bgSaturate.value = filter.saturate || 100;
            bgSaturateDisplay.textContent = (filter.saturate || 100) + '%';
            bgSaturate.addEventListener('input', function() {
                bgSaturateDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.filter.saturate = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgSaturate.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Hue Rotate
        const bgHue = document.getElementById('bg-hue');
        const bgHueDisplay = document.getElementById('bg-hue-display');
        if (bgHue && bgHueDisplay) {
            bgHue.value = filter.hueRotate || 0;
            bgHueDisplay.textContent = (filter.hueRotate || 0) + ' deg';
            bgHue.addEventListener('input', function() {
                bgHueDisplay.textContent = this.value + ' deg';
                window.OurSpace.profile.theme.background.filter.hueRotate = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgHue.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Invert
        const bgInvert = document.getElementById('bg-invert');
        const bgInvertDisplay = document.getElementById('bg-invert-display');
        if (bgInvert && bgInvertDisplay) {
            bgInvert.value = filter.invert || 0;
            bgInvertDisplay.textContent = (filter.invert || 0) + '%';
            bgInvert.addEventListener('input', function() {
                bgInvertDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.filter.invert = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgInvert.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Sepia
        const bgSepia = document.getElementById('bg-sepia');
        const bgSepiaDisplay = document.getElementById('bg-sepia-display');
        if (bgSepia && bgSepiaDisplay) {
            bgSepia.value = filter.sepia || 0;
            bgSepiaDisplay.textContent = (filter.sepia || 0) + '%';
            bgSepia.addEventListener('input', function() {
                bgSepiaDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.filter.sepia = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgSepia.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Grayscale
        const bgGrayscale = document.getElementById('bg-grayscale');
        const bgGrayscaleDisplay = document.getElementById('bg-grayscale-display');
        if (bgGrayscale && bgGrayscaleDisplay) {
            bgGrayscale.value = filter.grayscale || 0;
            bgGrayscaleDisplay.textContent = (filter.grayscale || 0) + '%';
            bgGrayscale.addEventListener('input', function() {
                bgGrayscaleDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.filter.grayscale = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgGrayscale.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Blend mode
        const bgBlendMode = document.getElementById('bg-blend-mode');
        if (bgBlendMode) {
            const blend = window.OurSpace.profile.theme.background.blend || {};
            bgBlendMode.value = blend.mode || 'normal';
            bgBlendMode.addEventListener('change', function() {
                window.OurSpace.profile.theme.background.blend.mode = this.value;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Opacity
        const bgOpacity = document.getElementById('bg-opacity');
        const bgOpacityDisplay = document.getElementById('bg-opacity-display');
        if (bgOpacity && bgOpacityDisplay) {
            const blend = window.OurSpace.profile.theme.background.blend || {};
            bgOpacity.value = blend.opacity || 100;
            bgOpacityDisplay.textContent = (blend.opacity || 100) + '%';
            bgOpacity.addEventListener('input', function() {
                bgOpacityDisplay.textContent = this.value + '%';
                window.OurSpace.profile.theme.background.blend.opacity = parseInt(this.value);
                window.OurSpace.applyTheme();
            });
            bgOpacity.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Reset button
        const resetBtn = document.getElementById('bg-reset-transforms');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                // Reset all transformations to defaults
                window.OurSpace.profile.theme.background.size = 'cover';
                window.OurSpace.profile.theme.background.position = 'center';
                window.OurSpace.profile.theme.background.repeat = 'no-repeat';
                window.OurSpace.profile.theme.background.transform = {
                    scale: 1,
                    rotate: 0,
                    skewX: 0,
                    skewY: 0,
                    flipX: false,
                    flipY: false
                };
                window.OurSpace.profile.theme.background.filter = {
                    blur: 0,
                    brightness: 100,
                    contrast: 100,
                    saturate: 100,
                    hueRotate: 0,
                    invert: 0,
                    sepia: 0,
                    grayscale: 0
                };
                window.OurSpace.profile.theme.background.blend = {
                    mode: 'normal',
                    opacity: 100
                };

                // Update all controls
                setupBackgroundTransformControls();
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }
    }

    function updateBackgroundControls() {
        const bgType = document.getElementById('bg-type');
        const patternGrid = document.getElementById('pattern-grid');

        if (bgType) {
            bgType.value = window.OurSpace.profile.theme.background.type;
        }

        if (patternGrid) {
            const patternItems = patternGrid.querySelectorAll('.pattern-item');
            patternItems.forEach(item => {
                item.classList.remove('active');
                if (item.dataset.pattern === window.OurSpace.profile.theme.background.pattern) {
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
        const textGlowColor = document.getElementById('text-glow-color');
        const textGlowColorWrapper = document.getElementById('text-glow-color-wrapper');

        // Initialize with current values
        updateFontControls();

        // Font family
        if (fontFamily) {
            fontFamily.addEventListener('change', function() {
                window.OurSpace.profile.theme.fonts.family = this.value;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Font size
        if (fontSize) {
            fontSize.addEventListener('input', function() {
                if (fontSizeDisplay) fontSizeDisplay.textContent = this.value + 'px';
                window.OurSpace.profile.theme.fonts.size = parseInt(this.value);
                window.OurSpace.applyTheme();
            });

            fontSize.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Text shadow
        if (textShadow) {
            textShadow.addEventListener('change', function() {
                window.OurSpace.profile.theme.fonts.effects.shadow = this.checked;
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Text glow
        if (textGlow) {
            textGlow.addEventListener('change', function() {
                window.OurSpace.profile.theme.fonts.effects.glow = this.checked;
                if (textGlowColorWrapper) {
                    textGlowColorWrapper.style.display = this.checked ? 'block' : 'none';
                }
                window.OurSpace.applyTheme();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        if (textGlowColor) {
            textGlowColor.addEventListener('input', function() {
                window.OurSpace.profile.theme.fonts.effects.glowColor = this.value;
                window.OurSpace.applyTheme();
            });
            textGlowColor.addEventListener('change', function() {
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }
    }

    function updateFontControls() {
        const fonts = window.OurSpace.profile.theme.fonts;

        const fontFamily = document.getElementById('font-family');
        const fontSize = document.getElementById('font-size');
        const fontSizeDisplay = document.getElementById('font-size-display');
        const textShadow = document.getElementById('text-shadow');
        const textGlow = document.getElementById('text-glow');
        const textGlowColor = document.getElementById('text-glow-color');
        const textGlowColorWrapper = document.getElementById('text-glow-color-wrapper');

        if (fontFamily) fontFamily.value = fonts.family;
        if (fontSize) fontSize.value = fonts.size;
        if (fontSizeDisplay) fontSizeDisplay.textContent = fonts.size + 'px';
        if (textShadow) textShadow.checked = fonts.effects.shadow;
        if (textGlow) textGlow.checked = fonts.effects.glow;
        if (textGlowColor) textGlowColor.value = fonts.effects.glowColor || '#ffffff';
        if (textGlowColorWrapper) {
            textGlowColorWrapper.style.display = fonts.effects.glow ? 'block' : 'none';
        }
    }

    // Effects Controls
    function setupEffectsControls() {
        window.OurSpace.profile.theme.effects = window.OurSpace.profile.theme.effects || {};

        const effectFalling = document.getElementById('effect-falling');
        const fallingType = document.getElementById('falling-type');
        const effectCursorTrail = document.getElementById('effect-cursor-trail');
        const effectGlitter = document.getElementById('effect-glitter');
        const effectBlink = document.getElementById('effect-blink');
        const effectSparkleRain = document.getElementById('effect-sparkle-rain');
        const effectAuroraWaves = document.getElementById('effect-aurora-waves');
        const effectPixelBurst = document.getElementById('effect-pixel-burst');
        const effectNeonPulse = document.getElementById('effect-neon-pulse');
        const effectPolaroid = document.getElementById('effect-polaroid-popups');
        const effectBubbleWarp = document.getElementById('effect-bubble-warp');
        const effectRetroScanlines = document.getElementById('effect-retro-scanlines');
        const effectChromatic = document.getElementById('effect-chromatic-trails');
        const effectFloatingEmojis = document.getElementById('effect-floating-emojis');
        const effectLightning = document.getElementById('effect-lightning-flickers');

        const cursorCustomWrapper = document.getElementById('cursor-trail-custom-wrapper');

        function ensureEffectConfig(key, defaults = {}) {
            const effects = window.OurSpace.profile.theme.effects;
            let config = effects[key];
            if (!config || typeof config !== 'object') {
                config = { enabled: !!config };
            }
            config = Object.assign({ enabled: false }, defaults, config);
            effects[key] = config;
            return config;
        }

        function refreshEffects(options = {}) {
            if (options.falling && window.OurSpaceEffects && window.OurSpaceEffects.updateFallingEffect) {
                window.OurSpaceEffects.updateFallingEffect();
            }
            if (options.cursor && window.OurSpaceEffects && window.OurSpaceEffects.toggleCursorTrail) {
                window.OurSpaceEffects.toggleCursorTrail();
            }
            if (window.OurSpaceEffects && window.OurSpaceEffects.refreshDynamicEffects) {
                window.OurSpaceEffects.refreshDynamicEffects();
            }
        }

        function bindEffectToggle(toggle, key, defaults = {}, options = {}) {
            if (!toggle) return;
            const config = ensureEffectConfig(key, defaults);
            toggle.checked = !!config.enabled;
            toggle.addEventListener('change', function() {
                ensureEffectConfig(key, defaults).enabled = this.checked;
                // Auto-save removed - only save when user clicks Save Profile button
                refreshEffects(options.refresh || {});
            });
        }

        function bindRangeControl(inputId, displayId, key, prop, defaults = {}, options = {}) {
            const input = document.getElementById(inputId);
            if (!input) return;
            const display = displayId ? document.getElementById(displayId) : null;
            const config = ensureEffectConfig(key, defaults);
            const format = options.format || (val => val);
            const parse = options.parse || (val => parseFloat(val));
            const updateDisplay = (val) => {
                if (display) display.textContent = format(val);
            };
            if (config[prop] !== undefined) {
                input.value = config[prop];
            } else {
                ensureEffectConfig(key, defaults)[prop] = parse(input.value);
            }
            updateDisplay(ensureEffectConfig(key, defaults)[prop]);
            input.addEventListener('input', function() {
                const val = parse(this.value);
                ensureEffectConfig(key, defaults)[prop] = val;
                updateDisplay(val);
                if (options.live !== false) {
                    refreshEffects(options.refresh || {});
                }
            });
            input.addEventListener('change', function() {
                const val = parse(this.value);
                ensureEffectConfig(key, defaults)[prop] = val;
                // Auto-save removed - only save when user clicks Save Profile button
                refreshEffects(options.refresh || {});
            });
        }

        function bindSelectControl(selectId, key, prop, defaults = {}, options = {}) {
            const select = document.getElementById(selectId);
            if (!select) return;
            const config = ensureEffectConfig(key, defaults);
            if (config[prop] !== undefined) {
                select.value = config[prop];
            } else {
                ensureEffectConfig(key, defaults)[prop] = select.value;
            }
            if (options.onInit) {
                options.onInit(select.value);
            }
            select.addEventListener('change', function() {
                ensureEffectConfig(key, defaults)[prop] = this.value;
                // Auto-save removed - only save when user clicks Save Profile button
                if (options.onChange) {
                    options.onChange(this.value);
                }
                refreshEffects(options.refresh || {});
            });
        }

        function bindColorControl(inputId, key, prop, defaults = {}, options = {}) {
            const input = document.getElementById(inputId);
            if (!input) return;
            const config = ensureEffectConfig(key, defaults);
            if (config[prop]) {
                input.value = config[prop];
            } else {
                ensureEffectConfig(key, defaults)[prop] = input.value;
            }
            input.addEventListener('input', function() {
                ensureEffectConfig(key, defaults)[prop] = this.value;
                if (options.live !== false) {
                    refreshEffects(options.refresh || {});
                }
            });
            input.addEventListener('change', function() {
                ensureEffectConfig(key, defaults)[prop] = this.value;
                // Auto-save removed - only save when user clicks Save Profile button
                refreshEffects(options.refresh || {});
            });
        }

        const fallingDefaults = { type: 'hearts', speed: 2, density: 1 };
        bindEffectToggle(effectFalling, 'falling', fallingDefaults, { refresh: { falling: true } });
        if (fallingType) {
            const fallingConfig = ensureEffectConfig('falling', fallingDefaults);
            fallingType.value = fallingConfig.type;
            fallingType.addEventListener('change', function() {
                ensureEffectConfig('falling', fallingDefaults).type = this.value;
                // Auto-save removed - only save when user clicks Save Profile button
                refreshEffects({ falling: true });
            });
        }
        bindRangeControl('falling-speed', 'falling-speed-display', 'falling', 'speed', fallingDefaults, {
            refresh: { falling: true },
            format: val => val.toFixed(1) + 'x'
        });
        bindRangeControl('falling-density', 'falling-density-display', 'falling', 'density', fallingDefaults, {
            refresh: { falling: true },
            format: val => val.toFixed(1) + 'x'
        });

        const cursorDefaults = { style: 'sparkle', colorMode: 'rainbow', customColor: '#ff7cf5', length: 1, size: 1 };
        bindEffectToggle(effectCursorTrail, 'cursorTrail', cursorDefaults, { refresh: { cursor: true } });
        bindRangeControl('cursor-trail-length', 'cursor-trail-length-display', 'cursorTrail', 'length', cursorDefaults, {
            refresh: { cursor: true },
            format: val => val.toFixed(1) + 'x'
        });
        bindRangeControl('cursor-trail-size', 'cursor-trail-size-display', 'cursorTrail', 'size', cursorDefaults, {
            refresh: { cursor: true },
            format: val => val.toFixed(1) + 'x'
        });
        bindSelectControl('cursor-trail-color-mode', 'cursorTrail', 'colorMode', cursorDefaults, {
            refresh: { cursor: true },
            onInit: (value) => {
                if (cursorCustomWrapper) {
                    cursorCustomWrapper.style.display = value === 'custom' ? 'block' : 'none';
                }
            },
            onChange: (value) => {
                if (cursorCustomWrapper) {
                    cursorCustomWrapper.style.display = value === 'custom' ? 'block' : 'none';
                }
            }
        });
        bindColorControl('cursor-trail-custom-color', 'cursorTrail', 'customColor', cursorDefaults, {
            refresh: { cursor: true }
        });

        const glitterDefaults = { intensity: 0.7 };
        bindEffectToggle(effectGlitter, 'glitter', glitterDefaults);
        bindRangeControl('glitter-intensity', 'glitter-intensity-display', 'glitter', 'intensity', glitterDefaults, {
            refresh: {},
            format: val => Math.round(val * 100) + '%'
        });

        const blinkDefaults = { speed: 1 };
        bindEffectToggle(effectBlink, 'blink', blinkDefaults);
        bindRangeControl('blink-speed', 'blink-speed-display', 'blink', 'speed', blinkDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 's'
        });

        const sparkleDefaults = { density: 1 };
        bindEffectToggle(effectSparkleRain, 'sparkleRain', sparkleDefaults);
        bindRangeControl('sparkle-rain-density', 'sparkle-rain-density-display', 'sparkleRain', 'density', sparkleDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 'x'
        });

        const auroraDefaults = { intensity: 0.4, speed: 1, colorA: '#47ffe3', colorB: '#ff4ffb' };
        bindEffectToggle(effectAuroraWaves, 'auroraWaves', auroraDefaults);
        bindRangeControl('aurora-intensity', 'aurora-intensity-display', 'auroraWaves', 'intensity', auroraDefaults, {
            refresh: {},
            format: val => Math.round(val * 100) + '%'
        });
        bindRangeControl('aurora-speed', 'aurora-speed-display', 'auroraWaves', 'speed', auroraDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 'x'
        });
        bindColorControl('aurora-color-a', 'auroraWaves', 'colorA', auroraDefaults, { refresh: {} });
        bindColorControl('aurora-color-b', 'auroraWaves', 'colorB', auroraDefaults, { refresh: {} });

        const neonDefaults = { color: '#00fff5', accent: '#ff00ff', speed: 1.2 };
        bindEffectToggle(effectNeonPulse, 'neonPulse', neonDefaults);
        bindColorControl('neon-color', 'neonPulse', 'color', neonDefaults, { refresh: {} });
        bindColorControl('neon-accent-color', 'neonPulse', 'accent', neonDefaults, { refresh: {} });
        bindRangeControl('neon-speed', 'neon-speed-display', 'neonPulse', 'speed', neonDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 'x'
        });

        bindEffectToggle(effectPixelBurst, 'pixelBurst');
        bindEffectToggle(effectPolaroid, 'polaroidPopups', { interval: 4 });
        bindEffectToggle(effectBubbleWarp, 'bubbleWarp', { size: 1 });
        bindEffectToggle(effectRetroScanlines, 'retroScanlines', { opacity: 0.18 });

        const trailDefaults = { length: 0.9, mode: 'sunset' };
        bindEffectToggle(effectChromatic, 'chromaticTrails', trailDefaults);
        bindRangeControl('trail-length', 'trail-length-display', 'chromaticTrails', 'length', trailDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 'x'
        });
        bindSelectControl('trail-mode', 'chromaticTrails', 'mode', trailDefaults, { refresh: {} });

        const emojiDefaults = { density: 1 };
        bindEffectToggle(effectFloatingEmojis, 'floatingEmojis', emojiDefaults);
        bindRangeControl('emoji-density', 'emoji-density-display', 'floatingEmojis', 'density', emojiDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 'x'
        });

        const lightningDefaults = { intensity: 0.8, frequency: 6 };
        bindEffectToggle(effectLightning, 'lightningFlickers', lightningDefaults);
        bindRangeControl('lightning-frequency', 'lightning-frequency-display', 'lightningFlickers', 'frequency', lightningDefaults, {
            refresh: {},
            format: val => val.toFixed(1) + 's'
        });
        bindRangeControl('lightning-intensity', 'lightning-intensity-display', 'lightningFlickers', 'intensity', lightningDefaults, {
            refresh: {},
            format: val => Math.round(val * 100) + '%'
        });
    }

    // Layout Controls
    function setupLayoutControls() {
        const layoutBtns = document.querySelectorAll('.layout-btn');

        layoutBtns.forEach(btn => {
            if (btn.dataset.layout === window.OurSpace.profile.layout.preset) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', function() {
                layoutBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');

                const layout = this.dataset.layout;
                window.OurSpace.profile.layout.preset = layout;

                const grid = document.getElementById('content-grid');
                if (grid) {
                    grid.className = `content-grid layout-${layout}`;
                }

                // Auto-save removed - only save when user clicks Save Profile button
            });
        });

        // Layout Editor Controls
        const layoutEditorToggle = document.getElementById('layout-editor-toggle');
        const allowOverlapToggle = document.getElementById('allow-overlap-toggle');
        const layoutEditorControls = document.getElementById('layout-editor-controls');
        const snapThreshold = document.getElementById('snap-threshold');
        const snapThresholdDisplay = document.getElementById('snap-threshold-display');
        const gridSize = document.getElementById('grid-size');
        const gridSizeDisplay = document.getElementById('grid-size-display');
        const mobileBreakpoint = document.getElementById('mobile-breakpoint');
        const mobileBehavior = document.getElementById('mobile-behavior');
        const layoutReset = document.getElementById('layout-reset');

        if (layoutEditorToggle) {
            layoutEditorToggle.addEventListener('change', function() {
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.toggle(this.checked);

                    if (layoutEditorControls) {
                        layoutEditorControls.style.display = this.checked ? 'block' : 'none';
                    }
                }
            });
        }

        if (allowOverlapToggle) {
            allowOverlapToggle.checked = true; // Default to allowing overlap
            allowOverlapToggle.addEventListener('change', function() {
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.allowOverlap = this.checked;
                    console.log('[Layout Editor] Allow overlap:', this.checked);

                    // If turning off overlap, resolve existing overlaps
                    if (!this.checked && window.OurSpaceLayoutEditor.enabled) {
                        window.OurSpaceLayoutEditor.resolveOverlaps();
                        window.OurSpaceLayoutEditor.saveLayout();
                    }
                }
            });
        }

        if (snapThreshold && snapThresholdDisplay) {
            snapThreshold.addEventListener('input', function() {
                snapThresholdDisplay.textContent = this.value + 'px';
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.snapThreshold = parseInt(this.value);
                }
            });
        }

        if (gridSize && gridSizeDisplay) {
            gridSize.addEventListener('input', function() {
                gridSizeDisplay.textContent = this.value + 'px';
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.gridSize = parseInt(this.value);
                }
            });
        }

        if (mobileBreakpoint) {
            mobileBreakpoint.addEventListener('change', function() {
                const widgets = document.querySelectorAll('.layout-editable');
                widgets.forEach(widget => {
                    widget.dataset.mobileBreakpoint = this.value;
                });
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.saveLayout();
                }
            });
        }

        if (mobileBehavior) {
            mobileBehavior.addEventListener('change', function() {
                const widgets = document.querySelectorAll('.layout-editable');
                widgets.forEach(widget => {
                    widget.dataset.mobileBehavior = this.value;
                });
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.saveLayout();
                }
            });
        }

        if (layoutReset) {
            layoutReset.addEventListener('click', function() {
                if (window.OurSpaceLayoutEditor) {
                    window.OurSpaceLayoutEditor.resetLayout();
                }
            });
        }
    }

    // Profile Actions
    function setupProfileActions() {
        const saveBtn = document.getElementById('save-profile');
        const loadFromDbBtn = document.getElementById('load-from-database');
        const loadBtn = document.getElementById('load-profile');
        const exportBtn = document.getElementById('export-profile');
        const resetBtn = document.getElementById('reset-profile');

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                if (window.OurSpace.saveProfile()) {
                    alert('Profile saved successfully! ✨');
                }
            });
        }

        if (loadFromDbBtn) {
            loadFromDbBtn.addEventListener('click', async function() {
                if (window.OurSpace && typeof window.OurSpace.loadFromDatabase === 'function') {
                    await window.OurSpace.loadFromDatabase();
                } else {
                    alert('Load from database function not available. Please make sure you are logged in.');
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
                        window.OurSpace.importProfile(file);
                    }
                };
                input.click();
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                window.OurSpace.exportProfile();
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                window.OurSpace.resetProfile();
            });
        }
    }

})();





