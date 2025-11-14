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
        const colorLabels = document.getElementById('color-labels');
        const colorWidgetBg = document.getElementById('color-widget-bg');
        const widgetBgOpacity = document.getElementById('widget-bg-opacity');
        const opacityValue = document.getElementById('opacity-value');

        // Initialize with current values
        updateColorPickers();

        // Background color
        if (colorBg) {
            colorBg.addEventListener('input', function() {
                window.MySpace.profile.theme.colors.background = this.value;
                window.MySpace.applyTheme();
            });
            colorBg.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Text color
        if (colorText) {
            colorText.addEventListener('input', function() {
                window.MySpace.profile.theme.colors.text = this.value;
                window.MySpace.applyTheme();
            });
            colorText.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Links color
        if (colorLinks) {
            colorLinks.addEventListener('input', function() {
                window.MySpace.profile.theme.colors.links = this.value;
                window.MySpace.applyTheme();
            });
            colorLinks.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Borders color
        if (colorBorders) {
            colorBorders.addEventListener('input', function() {
                window.MySpace.profile.theme.colors.borders = this.value;
                window.MySpace.applyTheme();
            });
            colorBorders.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Label text color (Music, TV, etc)
        if (colorLabels) {
            colorLabels.addEventListener('input', function() {
                window.MySpace.profile.theme.colors.labelText = this.value;
                window.MySpace.applyTheme();
            });
            colorLabels.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Widget background color
        if (colorWidgetBg) {
            colorWidgetBg.addEventListener('input', function() {
                window.MySpace.profile.theme.colors.widgetBg = this.value;
                window.MySpace.applyTheme();
            });
            colorWidgetBg.addEventListener('change', function() {
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
            bgType.value = window.MySpace.profile.theme.background.type;

            // Show/hide pattern grid based on initial type
            if (patternGrid) {
                patternGrid.style.display = (bgType.value === 'pattern') ? 'grid' : 'none';
            }

            bgType.addEventListener('change', function() {
                window.MySpace.profile.theme.background.type = this.value;

                // Clear custom image when switching away from 'image' type
                if (this.value !== 'image' && window.MySpace.profile.theme.background.image) {
                    console.log('[Customizer] Clearing custom background image');
                    // Don't delete the image, just clear the reference
                    window.MySpace.profile.theme.background.image = '';
                }

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
                    window.MySpace.profile.theme.background.image = ''; // Clear custom image
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

                        const response = await fetch('/api/myspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.MySpace.profile.theme.background.image = data.url;
                            window.MySpace.profile.theme.background.type = 'image';
                            if (bgType) bgType.value = 'image';

                            // Show remove button
                            if (removeBgBtn) removeBgBtn.style.display = 'block';

                            window.MySpace.applyTheme();
                            await window.MySpace.saveProfile();
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
            if (window.MySpace.profile.theme.background.image) {
                removeBgBtn.style.display = 'block';
            }

            removeBgBtn.addEventListener('click', function() {
                if (confirm('Remove custom background image?')) {
                    window.MySpace.profile.theme.background.image = '';
                    window.MySpace.profile.theme.background.type = 'solid';
                    if (bgType) bgType.value = 'solid';

                    this.style.display = 'none';

                    window.MySpace.applyTheme();
                    window.MySpace.saveProfile();
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
            bgRepeat.value = window.MySpace.profile.theme.background.repeat || 'no-repeat';
            bgRepeat.addEventListener('change', function() {
                window.MySpace.profile.theme.background.repeat = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Size control
        const bgSize = document.getElementById('bg-size');
        const bgSizeCustomLabel = document.getElementById('bg-size-custom-label');
        const bgSizeCustom = document.getElementById('bg-size-custom');
        const bgSizeCustomDisplay = document.getElementById('bg-size-custom-display');

        if (bgSize) {
            bgSize.value = window.MySpace.profile.theme.background.size || 'cover';

            // Show/hide custom size slider
            function updateCustomSizeVisibility() {
                if (bgSizeCustomLabel) {
                    bgSizeCustomLabel.style.display = bgSize.value === 'custom' ? 'block' : 'none';
                }
            }
            updateCustomSizeVisibility();

            bgSize.addEventListener('change', function() {
                window.MySpace.profile.theme.background.size = this.value;
                updateCustomSizeVisibility();
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Custom size slider
        if (bgSizeCustom && bgSizeCustomDisplay) {
            bgSizeCustom.value = window.MySpace.profile.theme.background.customSize || 100;
            bgSizeCustomDisplay.textContent = (window.MySpace.profile.theme.background.customSize || 100) + 'px';

            bgSizeCustom.addEventListener('input', function() {
                bgSizeCustomDisplay.textContent = this.value + 'px';
                window.MySpace.profile.theme.background.customSize = parseInt(this.value);
                window.MySpace.applyTheme();
            });

            bgSizeCustom.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Position control
        const bgPosition = document.getElementById('bg-position');
        if (bgPosition) {
            bgPosition.value = window.MySpace.profile.theme.background.position || 'center';
            bgPosition.addEventListener('change', function() {
                window.MySpace.profile.theme.background.position = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Transform controls
        const transform = window.MySpace.profile.theme.background.transform || {};

        // Scale
        const bgScale = document.getElementById('bg-scale');
        const bgScaleDisplay = document.getElementById('bg-scale-display');
        if (bgScale && bgScaleDisplay) {
            bgScale.value = transform.scale || 1;
            bgScaleDisplay.textContent = (transform.scale || 1).toFixed(1);
            bgScale.addEventListener('input', function() {
                bgScaleDisplay.textContent = parseFloat(this.value).toFixed(1);
                window.MySpace.profile.theme.background.transform.scale = parseFloat(this.value);
                window.MySpace.applyTheme();
            });
            bgScale.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Rotate
        const bgRotate = document.getElementById('bg-rotate');
        const bgRotateDisplay = document.getElementById('bg-rotate-display');
        if (bgRotate && bgRotateDisplay) {
            bgRotate.value = transform.rotate || 0;
            bgRotateDisplay.textContent = (transform.rotate || 0) + '°';
            bgRotate.addEventListener('input', function() {
                bgRotateDisplay.textContent = this.value + '°';
                window.MySpace.profile.theme.background.transform.rotate = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgRotate.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Skew X
        const bgSkewX = document.getElementById('bg-skewx');
        const bgSkewXDisplay = document.getElementById('bg-skewx-display');
        if (bgSkewX && bgSkewXDisplay) {
            bgSkewX.value = transform.skewX || 0;
            bgSkewXDisplay.textContent = (transform.skewX || 0) + '°';
            bgSkewX.addEventListener('input', function() {
                bgSkewXDisplay.textContent = this.value + '°';
                window.MySpace.profile.theme.background.transform.skewX = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgSkewX.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Skew Y
        const bgSkewY = document.getElementById('bg-skewy');
        const bgSkewYDisplay = document.getElementById('bg-skewy-display');
        if (bgSkewY && bgSkewYDisplay) {
            bgSkewY.value = transform.skewY || 0;
            bgSkewYDisplay.textContent = (transform.skewY || 0) + '°';
            bgSkewY.addEventListener('input', function() {
                bgSkewYDisplay.textContent = this.value + '°';
                window.MySpace.profile.theme.background.transform.skewY = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgSkewY.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Flip X
        const bgFlipX = document.getElementById('bg-flipx');
        if (bgFlipX) {
            bgFlipX.checked = transform.flipX || false;
            bgFlipX.addEventListener('change', function() {
                window.MySpace.profile.theme.background.transform.flipX = this.checked;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Flip Y
        const bgFlipY = document.getElementById('bg-flipy');
        if (bgFlipY) {
            bgFlipY.checked = transform.flipY || false;
            bgFlipY.addEventListener('change', function() {
                window.MySpace.profile.theme.background.transform.flipY = this.checked;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Filter controls
        const filter = window.MySpace.profile.theme.background.filter || {};

        // Blur
        const bgBlur = document.getElementById('bg-blur');
        const bgBlurDisplay = document.getElementById('bg-blur-display');
        if (bgBlur && bgBlurDisplay) {
            bgBlur.value = filter.blur || 0;
            bgBlurDisplay.textContent = (filter.blur || 0) + 'px';
            bgBlur.addEventListener('input', function() {
                bgBlurDisplay.textContent = this.value + 'px';
                window.MySpace.profile.theme.background.filter.blur = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgBlur.addEventListener('change', function() {
                window.MySpace.saveProfile();
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
                window.MySpace.profile.theme.background.filter.brightness = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgBrightness.addEventListener('change', function() {
                window.MySpace.saveProfile();
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
                window.MySpace.profile.theme.background.filter.contrast = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgContrast.addEventListener('change', function() {
                window.MySpace.saveProfile();
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
                window.MySpace.profile.theme.background.filter.saturate = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgSaturate.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Hue Rotate
        const bgHue = document.getElementById('bg-hue');
        const bgHueDisplay = document.getElementById('bg-hue-display');
        if (bgHue && bgHueDisplay) {
            bgHue.value = filter.hueRotate || 0;
            bgHueDisplay.textContent = (filter.hueRotate || 0) + '°';
            bgHue.addEventListener('input', function() {
                bgHueDisplay.textContent = this.value + '°';
                window.MySpace.profile.theme.background.filter.hueRotate = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgHue.addEventListener('change', function() {
                window.MySpace.saveProfile();
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
                window.MySpace.profile.theme.background.filter.invert = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgInvert.addEventListener('change', function() {
                window.MySpace.saveProfile();
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
                window.MySpace.profile.theme.background.filter.sepia = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgSepia.addEventListener('change', function() {
                window.MySpace.saveProfile();
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
                window.MySpace.profile.theme.background.filter.grayscale = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgGrayscale.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Blend mode
        const bgBlendMode = document.getElementById('bg-blend-mode');
        if (bgBlendMode) {
            const blend = window.MySpace.profile.theme.background.blend || {};
            bgBlendMode.value = blend.mode || 'normal';
            bgBlendMode.addEventListener('change', function() {
                window.MySpace.profile.theme.background.blend.mode = this.value;
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
            });
        }

        // Opacity
        const bgOpacity = document.getElementById('bg-opacity');
        const bgOpacityDisplay = document.getElementById('bg-opacity-display');
        if (bgOpacity && bgOpacityDisplay) {
            const blend = window.MySpace.profile.theme.background.blend || {};
            bgOpacity.value = blend.opacity || 100;
            bgOpacityDisplay.textContent = (blend.opacity || 100) + '%';
            bgOpacity.addEventListener('input', function() {
                bgOpacityDisplay.textContent = this.value + '%';
                window.MySpace.profile.theme.background.blend.opacity = parseInt(this.value);
                window.MySpace.applyTheme();
            });
            bgOpacity.addEventListener('change', function() {
                window.MySpace.saveProfile();
            });
        }

        // Reset button
        const resetBtn = document.getElementById('bg-reset-transforms');
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                // Reset all transformations to defaults
                window.MySpace.profile.theme.background.size = 'cover';
                window.MySpace.profile.theme.background.position = 'center';
                window.MySpace.profile.theme.background.repeat = 'no-repeat';
                window.MySpace.profile.theme.background.transform = {
                    scale: 1,
                    rotate: 0,
                    skewX: 0,
                    skewY: 0,
                    flipX: false,
                    flipY: false
                };
                window.MySpace.profile.theme.background.filter = {
                    blur: 0,
                    brightness: 100,
                    contrast: 100,
                    saturate: 100,
                    hueRotate: 0,
                    invert: 0,
                    sepia: 0,
                    grayscale: 0
                };
                window.MySpace.profile.theme.background.blend = {
                    mode: 'normal',
                    opacity: 100
                };

                // Update all controls
                setupBackgroundTransformControls();
                window.MySpace.applyTheme();
                window.MySpace.saveProfile();
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
