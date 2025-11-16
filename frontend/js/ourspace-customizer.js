// OurSpace Customizer - Customization Panel Logic

(function() {
    'use strict';

    const WIDGET_TWEAK_DEFAULTS = {
        radius: 10,
        border: 3,
        blur: 0,
        glowColor: '#00ffff',
        glowStrength: 20
    };

    const themeButtonMap = new Map();
    const SCENE_ID_PREFIX = 'scene-';
    const THEME_ALIAS_MAP = Object.freeze({
        scenecore: 'stagebloom',
        weirdcore: 'liminalveil',
        dreamcore: 'lucidmirage',
        kidcore: 'stickerparade',
        angelcore: 'haloaurora',
        witchcore: 'moonlitcoven',
        goblincore: 'mosswild',
        fairycore: 'prismfae',
        cryptidcore: 'cryptidnight',
        mermaidcore: 'sirenlagoon',
        royalcore: 'opulentthrone',
        trashcore: 'dumpsterpop'
    });
    const THEME_ALIAS_INVERSE = Object.freeze(Object.entries(THEME_ALIAS_MAP).reduce((acc, [legacy, current]) => {
        if (!acc[current]) {
            acc[current] = [];
        }
        acc[current].push(legacy);
        return acc;
    }, {}));

    function resolveThemeName(themeName) {
        if (!themeName) {
            return themeName;
        }
        return THEME_ALIAS_MAP[themeName] || themeName;
    }

    function ensureSceneDeckData() {
        if (!window.OurSpace || !window.OurSpace.profile) {
            return [];
        }
        if (window.OurSpace.ensureSceneDeck) {
            return window.OurSpace.ensureSceneDeck();
        }
        if (!Array.isArray(window.OurSpace.profile.sceneDeck)) {
            window.OurSpace.profile.sceneDeck = [];
        }
        return window.OurSpace.profile.sceneDeck;
    }

    function createSceneSnapshot() {
        const profile = window.OurSpace?.profile;
        if (!profile) {
            return {};
        }
        if (window.OurSpaceLayoutEditor && typeof window.OurSpaceLayoutEditor.snapshotCurrentLayout === 'function') {
            window.OurSpaceLayoutEditor.snapshotCurrentLayout();
        }
        const snapshot = JSON.parse(JSON.stringify(profile));
        snapshot.sceneDeck = [];
        return snapshot;
    }

    function formatSceneTimestamp(timestamp) {
        if (!timestamp) return 'moments ago';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'moments ago';
    }

    function highlightThemeButton(themeName) {
        if (!themeName) return;
        const resolved = resolveThemeName(themeName);
        themeButtonMap.forEach((btn, key) => {
            if (!btn) return;
            btn.classList.toggle('active', key === resolved);
        });
    }

    function applyThemeFilter(term) {
        const search = term.trim().toLowerCase();
        themeButtonMap.forEach((btn, key) => {
            if (!btn) return;
            if (!search) {
                btn.style.display = '';
                return;
            }
            const label = (btn.textContent || '').toLowerCase();
            const aliases = THEME_ALIAS_INVERSE[key] || [];
            const aliasMatches = aliases.some(alias => alias.toLowerCase().includes(search));
            const matches = key.toLowerCase().includes(search) || label.includes(search) || aliasMatches;
            btn.style.display = matches ? '' : 'none';
        });
    }

    function formatSummaryLabel(name) {
        if (!name) return 'Custom';
        return name
            .replace(/[-_]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function updateCustomizerSummary() {
        const themeNameEl = document.getElementById('summary-theme-name');
        const layoutNameEl = document.getElementById('summary-layout-name');
        const statusEl = document.getElementById('summary-save-state');
        if (!themeNameEl || !layoutNameEl || !statusEl) {
            return;
        }
        const profile = window.OurSpace?.profile || {};
        const currentThemeName = resolveThemeName(profile.theme?.name || 'custom');
        if (profile.theme && profile.theme.name !== currentThemeName) {
            profile.theme.name = currentThemeName;
        }
        const themeBtn = themeButtonMap.get(currentThemeName);
        const themeLabel = themeBtn ? (themeBtn.textContent || '').trim() : currentThemeName;
        const themeName = formatSummaryLabel(themeLabel);
        const isPhone = typeof window.OurSpace?.isPhoneViewportActive === 'function'
            ? window.OurSpace.isPhoneViewportActive()
            : false;
        const layoutSource = isPhone ? (profile.layout?.mobilePreset || profile.layout?.preset) : (profile.layout?.preset || 'classic');
        let layoutName = formatSummaryLabel(layoutSource);
        if (isPhone) {
            layoutName = `${layoutName} · phone`;
        }
        const lastSaved = window.OurSpace?._lastSavedTimestamp || 0;
        const lastModified = profile.meta?.lastModified || 0;
        const hasUnsaved = lastModified > lastSaved;

        themeNameEl.textContent = themeName;
        layoutNameEl.textContent = layoutName;
        statusEl.textContent = hasUnsaved ? 'Unsaved changes' : 'All changes saved';
        statusEl.classList.toggle('unsaved', hasUnsaved);
    }

    window.OurSpaceCustomizer = window.OurSpaceCustomizer || {};
    window.OurSpaceCustomizer.updateSummary = updateCustomizerSummary;

    function syncMobileCustomizer(isMobile) {
        const panel = document.getElementById('customization-panel');
        if (!panel) {
            return;
        }
        if (!isMobile) {
            delete panel.dataset.mobileSheetInit;
            if (typeof panel._updateToggleState === 'function') {
                panel._updateToggleState();
            }
            return;
        }
        if (!panel.dataset.mobileSheetInit) {
            panel.classList.remove('collapsed');
            panel.dataset.mobileSheetInit = 'true';
        }
        if (typeof panel._updateToggleState === 'function') {
            panel._updateToggleState();
        }
    }

    window.OurSpaceCustomizer.syncMobileCustomizer = syncMobileCustomizer;

    function setupPanelTabs() {
        const tabButtons = document.querySelectorAll('.panel-tab');
        const panelContainer = document.querySelector('#customization-panel .panel-content.tabbed-panel');
        if (!tabButtons.length || !panelContainer) return;

        const setActive = (tabName) => {
            panelContainer.dataset.activeTab = tabName;
            tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
        };

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.dataset.tab) return;
                setActive(btn.dataset.tab);
            });
        });

        const initial = document.querySelector('.panel-tab.active')?.dataset.tab || tabButtons[0].dataset.tab;
        setActive(initial);
    }

    window.addEventListener('DOMContentLoaded', function() {
        initCustomizer();
    });

    function initCustomizer() {
        console.log("[Customizer] Initializing customization panel...");

        // Panel toggle
        setupPanelToggle();
        setupMobilePanelHandle();
        setupMobileOverlayDismiss();

        // Theme presets
        setupThemePresets();

        // Color pickers
        setupColorPickers();

        // Background controls
        setupBackgroundControls();

        // Font controls
        setupFontControls();

        // Widget styling controls
        setupWidgetStyleControls();
        setupWidgetVisibilityControls();

        // Custom widget creator
        setupCustomWidgetCreator();

        // Scene memory manager
        setupSceneManager();

        // Effects controls
        setupEffectsControls();

        // Layout controls
        setupLayoutControls();

        // Save/Load/Export/Reset
        setupProfileActions();

        setupPanelTabs();
        updateCustomizerSummary();

        console.log("[Customizer] Initialization complete");
    }

    // Panel Toggle
    function setupPanelToggle() {
        const panel = document.getElementById('customization-panel');
        const toggleBtn = document.getElementById('toggle-panel');

        if (!toggleBtn || !panel) {
            return;
        }

        const updateState = () => {
            const collapsed = panel.classList.contains('collapsed');
            toggleBtn.textContent = collapsed ? '›' : '‹';
            toggleBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        };

        toggleBtn.addEventListener('click', function() {
            panel.classList.toggle('collapsed');
            updateState();
        });

        panel._updateToggleState = updateState;
        updateState();
    }

    function setupMobilePanelHandle() {
        const handle = document.querySelector('.mobile-panel-handle');
        const panel = document.getElementById('customization-panel');
        if (!handle || !panel) {
            return;
        }
        handle.addEventListener('click', () => {
            if (!document.body.classList.contains('ourspace-mobile')) {
                return;
            }
            if (panel.classList.contains('collapsed')) {
                panel.classList.remove('collapsed');
                if (typeof panel._updateToggleState === 'function') {
                    panel._updateToggleState();
                }
            }
        });
    }

    function setupMobileOverlayDismiss() {
        const overlay = document.getElementById('mobile-panel-overlay');
        const panel = document.getElementById('customization-panel');
        if (!overlay || !panel) {
            return;
        }
        overlay.addEventListener('click', () => {
            if (!document.body.classList.contains('ourspace-mobile')) {
                return;
            }
            if (!panel.classList.contains('collapsed')) {
                panel.classList.add('collapsed');
                if (typeof panel._updateToggleState === 'function') {
                    panel._updateToggleState();
                }
            }
        });
    }

    // Theme Presets
    function setupThemePresets() {
        const themeBtns = document.querySelectorAll('.theme-btn');
        themeButtonMap.clear();
        const profileTheme = window.OurSpace?.profile?.theme;
        if (profileTheme && profileTheme.name) {
            const normalized = resolveThemeName(profileTheme.name);
            if (normalized !== profileTheme.name) {
                profileTheme.name = normalized;
            }
        }

        themeBtns.forEach(btn => {
            if (!btn.dataset.theme) return;
            themeButtonMap.set(btn.dataset.theme, btn);
            btn.addEventListener('click', function() {
                const themeName = this.dataset.theme;
                applyThemePreset(themeName);
            });
        });

        const themeFilter = document.getElementById('theme-filter');
        if (themeFilter) {
            themeFilter.addEventListener('input', function() {
                applyThemeFilter(this.value);
            });
        }

        const initialTheme = resolveThemeName(window.OurSpace?.profile?.theme?.name || 'classic');
        if (themeButtonMap.has(initialTheme)) {
            highlightThemeButton(initialTheme);
        }
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
            },
            candyrave: {
                name: 'candyrave',
                colors: {
                    background: '#ff1493',
                    text: '#ffffff',
                    links: '#00ffff',
                    linksHover: '#ffff00',
                    borders: '#ff00ff',
                    widgetBg: '#ff69b4',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 16
                },
                background: {
                    type: 'pattern',
                    pattern: 'hearts'
                }
            },
            neongrunge: {
                name: 'neongrunge',
                colors: {
                    background: '#1a1a1a',
                    text: '#00ff41',
                    links: '#ff00de',
                    linksHover: '#00f0ff',
                    borders: '#39ff14',
                    widgetBg: '#0d0d0d',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Arial',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'dots'
                }
            },
            holographic: {
                name: 'holographic',
                colors: {
                    background: '#e0e0ff',
                    text: '#4a0080',
                    links: '#ff00ff',
                    linksHover: '#00ffff',
                    borders: '#b366ff',
                    widgetBg: '#f0f0ff',
                    widgetBgOpacity: 60
                },
                fonts: {
                    family: 'Verdana',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            vaporwave: {
                name: 'vaporwave',
                colors: {
                    background: '#ff71ce',
                    text: '#01cdfe',
                    links: '#05ffa1',
                    linksHover: '#fffb96',
                    borders: '#b967ff',
                    widgetBg: '#ff6ac1',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Courier New',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            acidwash: {
                name: 'acidwash',
                colors: {
                    background: '#ccff00',
                    text: '#9900ff',
                    links: '#ff0099',
                    linksHover: '#00ff99',
                    borders: '#ff6600',
                    widgetBg: '#99ff00',
                    widgetBgOpacity: 65
                },
                fonts: {
                    family: 'Impact',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'tigerprint'
                }
            },
            kawaiigore: {
                name: 'kawaiigore',
                colors: {
                    background: '#ffb3d9',
                    text: '#8b0000',
                    links: '#ff1493',
                    linksHover: '#dc143c',
                    borders: '#ff69b4',
                    widgetBg: '#ffc0cb',
                    widgetBgOpacity: 80
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'hearts'
                }
            },
            glitchcore: {
                name: 'Glitchdream',
                colors: {
                    background: '#000000',
                    text: '#00ff00',
                    links: '#ff0000',
                    linksHover: '#0000ff',
                    borders: '#ffff00',
                    widgetBg: '#1a1a1a',
                    widgetBgOpacity: 95
                },
                fonts: {
                    family: 'Courier New',
                    size: 13
                },
                background: {
                    type: 'pattern',
                    pattern: 'checkers'
                }
            },
            stargaze: {
                name: 'stargaze',
                colors: {
                    background: '#0a0e27',
                    text: '#ffffff',
                    links: '#a78bfa',
                    linksHover: '#fbbf24',
                    borders: '#6366f1',
                    widgetBg: '#1e1b4b',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Georgia',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            plasticfantastic: {
                name: 'plasticfantastic',
                colors: {
                    background: '#ff00ff',
                    text: '#ffff00',
                    links: '#00ffff',
                    linksHover: '#ff6600',
                    borders: '#00ff00',
                    widgetBg: '#cc00cc',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 16
                },
                background: {
                    type: 'pattern',
                    pattern: 'dots'
                }
            },
            hyperpop: {
                name: 'hyperpop',
                colors: {
                    background: '#ff006e',
                    text: '#ffffff',
                    links: '#06ffa5',
                    linksHover: '#fffb00',
                    borders: '#3a86ff',
                    widgetBg: '#fb5607',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Impact',
                    size: 17
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            cosmichorror: {
                name: 'cosmichorror',
                colors: {
                    background: '#1a0033',
                    text: '#9d4edd',
                    links: '#7209b7',
                    linksHover: '#f72585',
                    borders: '#560bad',
                    widgetBg: '#10002b',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Times New Roman',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'flames'
                }
            },
            rainbowvomit: {
                name: 'rainbowvomit',
                colors: {
                    background: '#ff0000',
                    text: '#ffff00',
                    links: '#00ff00',
                    linksHover: '#00ffff',
                    borders: '#ff00ff',
                    widgetBg: '#ff8800',
                    widgetBgOpacity: 60
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 18
                },
                background: {
                    type: 'pattern',
                    pattern: 'hearts'
                }
            },
            electricdream: {
                name: 'electricdream',
                colors: {
                    background: '#0d1b2a',
                    text: '#00d9ff',
                    links: '#ff006e',
                    linksHover: '#ffbe0b',
                    borders: '#8338ec',
                    widgetBg: '#1b263b',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Verdana',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            cyberpsycho: {
                name: 'cyberpsycho',
                colors: {
                    background: '#000000',
                    text: '#ff0080',
                    links: '#00ff41',
                    linksHover: '#ffff00',
                    borders: '#ff0080',
                    widgetBg: '#1a001a',
                    widgetBgOpacity: 95
                },
                fonts: {
                    family: 'Courier New',
                    size: 13
                },
                background: {
                    type: 'pattern',
                    pattern: 'checkers'
                }
            },
            unicornblood: {
                name: 'unicornblood',
                colors: {
                    background: '#ff1493',
                    text: '#ffffff',
                    links: '#9d00ff',
                    linksHover: '#00ffff',
                    borders: '#ff00ff',
                    widgetBg: '#c71585',
                    widgetBgOpacity: 50
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 20
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            stagebloom: {
                name: 'Stage Bloom',
                colors: {
                    background: '#000000',
                    text: '#ff00ff',
                    links: '#00ff00',
                    linksHover: '#ffff00',
                    borders: '#ff0080',
                    widgetBg: '#1a0033',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Arial',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'checkers'
                }
            },
            liminalveil: {
                name: 'Liminal Bloom',
                colors: {
                    background: '#ffe5b4',
                    text: '#8b4513',
                    links: '#ff6347',
                    linksHover: '#4169e1',
                    borders: '#9370db',
                    widgetBg: '#ffd700',
                    widgetBgOpacity: 60
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 16
                },
                background: {
                    type: 'pattern',
                    pattern: 'dots'
                }
            },
            lucidmirage: {
                name: 'Lucid Mirage',
                colors: {
                    background: '#f0e6ff',
                    text: '#6a0dad',
                    links: '#ff69b4',
                    linksHover: '#9370db',
                    borders: '#dda0dd',
                    widgetBg: '#e6ccff',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Georgia',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'clouds'
                }
            },
            stickerparade: {
                name: 'Sticker Parade',
                colors: {
                    background: '#ffff00',
                    text: '#ff0000',
                    links: '#0000ff',
                    linksHover: '#00ff00',
                    borders: '#ff00ff',
                    widgetBg: '#ffa500',
                    widgetBgOpacity: 65
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 18
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            haloaurora: {
                name: 'haloaurora',
                colors: {
                    background: '#ffffff',
                    text: '#d4af37',
                    links: '#ffd700',
                    linksHover: '#ffb6c1',
                    borders: '#e6e6fa',
                    widgetBg: '#fff8dc',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Georgia',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            moonlitcoven: {
                name: 'Moonlit Coven',
                colors: {
                    background: '#1a0033',
                    text: '#9d4edd',
                    links: '#c77dff',
                    linksHover: '#e0aaff',
                    borders: '#7209b7',
                    widgetBg: '#240046',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Times New Roman',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            mosswild: {
                name: 'mosswild',
                colors: {
                    background: '#3d2b1f',
                    text: '#b5a397',
                    links: '#8db600',
                    linksHover: '#d4a373',
                    borders: '#6b4423',
                    widgetBg: '#4a3526',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Verdana',
                    size: 13
                },
                background: {
                    type: 'pattern',
                    pattern: 'dots'
                }
            },
            prismfae: {
                name: 'Prism Fae',
                colors: {
                    background: '#f0fff0',
                    text: '#2e8b57',
                    links: '#ff69b4',
                    linksHover: '#dda0dd',
                    borders: '#98fb98',
                    widgetBg: '#e0ffe0',
                    widgetBgOpacity: 65
                },
                fonts: {
                    family: 'Georgia',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'butterflies'
                }
            },
            cryptidnight: {
                name: 'Cryptid Night',
                colors: {
                    background: '#1c3b1a',
                    text: '#9cce9c',
                    links: '#ff6b35',
                    linksHover: '#ffff66',
                    borders: '#4d7c4d',
                    widgetBg: '#0f2a0e',
                    widgetBgOpacity: 88
                },
                fonts: {
                    family: 'Courier New',
                    size: 13
                },
                background: {
                    type: 'pattern',
                    pattern: 'stripes'
                }
            },
            sirenlagoon: {
                name: 'Siren Lagoon',
                colors: {
                    background: '#00ced1',
                    text: '#f0ffff',
                    links: '#ff69b4',
                    linksHover: '#ffd700',
                    borders: '#40e0d0',
                    widgetBg: '#008b8b',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Verdana',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            opulentthrone: {
                name: 'Opulent Throne',
                colors: {
                    background: '#4b0082',
                    text: '#ffd700',
                    links: '#ffb6c1',
                    linksHover: '#dda0dd',
                    borders: '#9370db',
                    widgetBg: '#2f0066',
                    widgetBgOpacity: 82
                },
                fonts: {
                    family: 'Times New Roman',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'roses'
                }
            },
            dumpsterpop: {
                name: 'Dumpster Pop',
                colors: {
                    background: '#708090',
                    text: '#00ff00',
                    links: '#ff00ff',
                    linksHover: '#ffff00',
                    borders: '#a9a9a9',
                    widgetBg: '#2f4f4f',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Courier New',
                    size: 13
                },
                background: {
                    type: 'pattern',
                    pattern: 'checkers'
                }
            },
            bloodrave: {
                name: 'bloodrave',
                colors: {
                    background: '#8b0000',
                    text: '#ffffff',
                    links: '#ff1493',
                    linksHover: '#00ffff',
                    borders: '#dc143c',
                    widgetBg: '#660000',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Impact',
                    size: 16
                },
                background: {
                    type: 'pattern',
                    pattern: 'hearts'
                }
            },
            pastelgore: {
                name: 'Sugar Shock',
                colors: {
                    background: '#ffcce5',
                    text: '#990000',
                    links: '#ff3366',
                    linksHover: '#cc0066',
                    borders: '#ff99cc',
                    widgetBg: '#ffe0f0',
                    widgetBgOpacity: 65
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'hearts'
                }
            },
            neonoir: {
                name: 'neonoir',
                colors: {
                    background: '#000000',
                    text: '#ff00ff',
                    links: '#00ffff',
                    linksHover: '#ff0000',
                    borders: '#39ff14',
                    widgetBg: '#0a0a0a',
                    widgetBgOpacity: 92
                },
                fonts: {
                    family: 'Courier New',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'checkers'
                }
            },
            acidfairy: {
                name: 'acidfairy',
                colors: {
                    background: '#bfff00',
                    text: '#ff00ff',
                    links: '#00ffff',
                    linksHover: '#ff1493',
                    borders: '#ff69b4',
                    widgetBg: '#90ee90',
                    widgetBgOpacity: 60
                },
                fonts: {
                    family: 'Comic Sans MS',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'butterflies'
                }
            },
            cybergoth: {
                name: 'cybergoth',
                colors: {
                    background: '#0d0d0d',
                    text: '#00ff41',
                    links: '#ff0080',
                    linksHover: '#00d9ff',
                    borders: '#8b00ff',
                    widgetBg: '#1a1a1a',
                    widgetBgOpacity: 90
                },
                fonts: {
                    family: 'Arial',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'lightning'
                }
            },
            gloomwave: {
                name: 'gloomwave',
                colors: {
                    background: '#2c2c54',
                    text: '#a29bfe',
                    links: '#fd79a8',
                    linksHover: '#fdcb6e',
                    borders: '#6c5ce7',
                    widgetBg: '#1e1e3f',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Georgia',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'clouds'
                }
            },
            sparklevoid: {
                name: 'sparklevoid',
                colors: {
                    background: '#000033',
                    text: '#ffffff',
                    links: '#ff00ff',
                    linksHover: '#00ffff',
                    borders: '#9d00ff',
                    widgetBg: '#000011',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Verdana',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            chaosangel: {
                name: 'chaosangel',
                colors: {
                    background: '#ffffff',
                    text: '#000000',
                    links: '#ff0000',
                    linksHover: '#ffd700',
                    borders: '#ff1493',
                    widgetBg: '#fff0f5',
                    widgetBgOpacity: 55
                },
                fonts: {
                    family: 'Impact',
                    size: 17
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            toxiccandy: {
                name: 'toxiccandy',
                colors: {
                    background: '#39ff14',
                    text: '#ff006e',
                    links: '#00f5ff',
                    linksHover: '#ffff00',
                    borders: '#ff00ff',
                    widgetBg: '#00ff00',
                    widgetBgOpacity: 45
                },
                fonts: {
                    family: 'Chalkduster',
                    size: 16
                },
                background: {
                    type: 'pattern',
                    pattern: 'dots'
                }
            },
            midnightsun: {
                name: 'midnightsun',
                colors: {
                    background: '#191970',
                    text: '#ffb347',
                    links: '#ffd700',
                    linksHover: '#ff6347',
                    borders: '#ff8c00',
                    widgetBg: '#0c0c3d',
                    widgetBgOpacity: 88
                },
                fonts: {
                    family: 'Garamond',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'stars'
                }
            },
            neonforest: {
                name: 'neonforest',
                colors: {
                    background: '#004d00',
                    text: '#00ff00',
                    links: '#7fff00',
                    linksHover: '#adff2f',
                    borders: '#32cd32',
                    widgetBg: '#003300',
                    widgetBgOpacity: 82
                },
                fonts: {
                    family: 'Luminari',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'butterflies'
                }
            },
            desertmirage: {
                name: 'desertmirage',
                colors: {
                    background: '#daa520',
                    text: '#8b4513',
                    links: '#ff4500',
                    linksHover: '#dc143c',
                    borders: '#cd853f',
                    widgetBg: '#f4a460',
                    widgetBgOpacity: 60
                },
                fonts: {
                    family: 'Palatino',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'stripes'
                }
            },
            frostbite: {
                name: 'frostbite',
                colors: {
                    background: '#e0ffff',
                    text: '#000080',
                    links: '#4169e1',
                    linksHover: '#1e90ff',
                    borders: '#00bfff',
                    widgetBg: '#f0f8ff',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Century Gothic',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'sparkles'
                }
            },
            lavahaze: {
                name: 'lavahaze',
                colors: {
                    background: '#8b0000',
                    text: '#ffa500',
                    links: '#ff4500',
                    linksHover: '#ffff00',
                    borders: '#ff6347',
                    widgetBg: '#b22222',
                    widgetBgOpacity: 78
                },
                fonts: {
                    family: 'Rockwell',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'flames'
                }
            },
            oilslick: {
                name: 'oilslick',
                colors: {
                    background: '#1c1c1c',
                    text: '#c0c0c0',
                    links: '#9400d3',
                    linksHover: '#ff1493',
                    borders: '#00ced1',
                    widgetBg: '#2f2f2f',
                    widgetBgOpacity: 85
                },
                fonts: {
                    family: 'Copperplate',
                    size: 13
                },
                background: {
                    type: 'pattern',
                    pattern: 'galaxy'
                }
            },
            candyfloss: {
                name: 'candyfloss',
                colors: {
                    background: '#ffb3e6',
                    text: '#4d0026',
                    links: '#ff0080',
                    linksHover: '#cc0066',
                    borders: '#ff66b3',
                    widgetBg: '#ffe6f2',
                    widgetBgOpacity: 50
                },
                fonts: {
                    family: 'Bradley Hand',
                    size: 16
                },
                background: {
                    type: 'pattern',
                    pattern: 'clouds'
                }
            },
            rustpunk: {
                name: 'rustpunk',
                colors: {
                    background: '#b7410e',
                    text: '#f5f5dc',
                    links: '#ff8c00',
                    linksHover: '#ffa500',
                    borders: '#8b4513',
                    widgetBg: '#a0522d',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Stencil',
                    size: 14
                },
                background: {
                    type: 'pattern',
                    pattern: 'chains'
                }
            },
            electropastel: {
                name: 'electropastel',
                colors: {
                    background: '#ffccff',
                    text: '#0000ff',
                    links: '#ff00ff',
                    linksHover: '#00ffff',
                    borders: '#9966ff',
                    widgetBg: '#e6ccff',
                    widgetBgOpacity: 55
                },
                fonts: {
                    family: 'Trebuchet MS',
                    size: 15
                },
                background: {
                    type: 'pattern',
                    pattern: 'lightning'
                }
            },
            myceliumdream: {
                name: 'myceliumdream',
                colors: {
                    background: '#041b0f',
                    text: '#ecffe6',
                    links: '#74ffb4',
                    linksHover: '#c0ffea',
                    borders: '#2dd480',
                    widgetBg: '#0f3b24',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Book Antiqua',
                    size: 16,
                    effects: {
                        shadow: false,
                        glow: true,
                        glowColor: '#78ffb7'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'vines'
                },
                tweaks: {
                    radius: 22,
                    border: 2,
                    blur: 6,
                    glowColor: '#2dd480',
                    glowStrength: 26
                }
            },
            prismshock: {
                name: 'prismshock',
                colors: {
                    background: '#1b0033',
                    text: '#fef6ff',
                    links: '#ff6bff',
                    linksHover: '#72f5ff',
                    borders: '#ffd447',
                    widgetBg: '#2b0050',
                    widgetBgOpacity: 60
                },
                fonts: {
                    family: 'Century Gothic',
                    size: 15,
                    effects: {
                        shadow: false,
                        glow: true,
                        glowColor: '#ffb7ff'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'prism'
                },
                tweaks: {
                    radius: 18,
                    border: 2,
                    blur: 4,
                    glowColor: '#ff6bff',
                    glowStrength: 32
                }
            },
            ancientfrequency: {
                name: 'ancientfrequency',
                colors: {
                    background: '#2c1500',
                    text: '#f7e0c0',
                    links: '#ffb347',
                    linksHover: '#ffd369',
                    borders: '#8f5c1c',
                    widgetBg: '#311f09',
                    widgetBgOpacity: 78
                },
                fonts: {
                    family: 'Palatino Linotype',
                    size: 15,
                    effects: {
                        shadow: true,
                        glow: false,
                        glowColor: '#f7e0c0'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'hieroglyphs'
                },
                tweaks: {
                    radius: 14,
                    border: 4,
                    blur: 0,
                    glowColor: '#ffb347',
                    glowStrength: 20
                }
            },
            cyberrelic: {
                name: 'cyberrelic',
                colors: {
                    background: '#001f29',
                    text: '#a8f9ff',
                    links: '#08ffc8',
                    linksHover: '#7dffb9',
                    borders: '#00c4ff',
                    widgetBg: '#012d3d',
                    widgetBgOpacity: 65
                },
                fonts: {
                    family: 'Lucida Console',
                    size: 15,
                    effects: {
                        shadow: false,
                        glow: false,
                        glowColor: '#08ffc8'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'circuit'
                },
                tweaks: {
                    radius: 12,
                    border: 3,
                    blur: 5,
                    glowColor: '#08ffc8',
                    glowStrength: 24
                }
            },
            spectrumritual: {
                name: 'spectrumritual',
                colors: {
                    background: '#1a0020',
                    text: '#f6e8ff',
                    links: '#ff6ff3',
                    linksHover: '#9dffea',
                    borders: '#ffae00',
                    widgetBg: '#260033',
                    widgetBgOpacity: 72
                },
                fonts: {
                    family: 'Copperplate',
                    size: 17,
                    effects: {
                        shadow: false,
                        glow: true,
                        glowColor: '#ff9cf2'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'mandala'
                },
                tweaks: {
                    radius: 20,
                    border: 2,
                    blur: 5,
                    glowColor: '#ff6ff3',
                    glowStrength: 34
                }
            },
            abyssalbloom: {
                name: 'abyssalbloom',
                colors: {
                    background: '#001219',
                    text: '#d9f8ff',
                    links: '#ff5f9c',
                    linksHover: '#a8fff0',
                    borders: '#00c2ff',
                    widgetBg: '#001f2b',
                    widgetBgOpacity: 75
                },
                fonts: {
                    family: 'Luminari',
                    size: 17,
                    effects: {
                        shadow: true,
                        glow: false,
                        glowColor: '#ff5f9c'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'tentacles'
                },
                tweaks: {
                    radius: 24,
                    border: 3,
                    blur: 8,
                    glowColor: '#00c2ff',
                    glowStrength: 30
                }
            },
            auroracode: {
                name: 'auroracode',
                colors: {
                    background: '#04103d',
                    text: '#d6f6ff',
                    links: '#7bf7ff',
                    linksHover: '#c7fff8',
                    borders: '#4ef2a9',
                    widgetBg: '#071a54',
                    widgetBgOpacity: 65
                },
                fonts: {
                    family: 'Garamond',
                    size: 15,
                    effects: {
                        shadow: false,
                        glow: true,
                        glowColor: '#7bf7ff'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'binary'
                },
                tweaks: {
                    radius: 16,
                    border: 2,
                    blur: 4,
                    glowColor: '#7bf7ff',
                    glowStrength: 24
                }
            },
            starforged: {
                name: 'starforged',
                colors: {
                    background: '#0b1116',
                    text: '#f0faff',
                    links: '#ffae42',
                    linksHover: '#ffd782',
                    borders: '#6ee5ff',
                    widgetBg: '#121c24',
                    widgetBgOpacity: 78
                },
                fonts: {
                    family: 'Rockwell',
                    size: 16,
                    effects: {
                        shadow: true,
                        glow: false,
                        glowColor: '#ffae42'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'scales'
                },
                tweaks: {
                    radius: 10,
                    border: 4,
                    blur: 2,
                    glowColor: '#ffae42',
                    glowStrength: 28
                }
            },
            petalstorm: {
                name: 'petalstorm',
                colors: {
                    background: '#ffe3f6',
                    text: '#5a0039',
                    links: '#e4007c',
                    linksHover: '#7a00e6',
                    borders: '#ff90c9',
                    widgetBg: '#fff5fb',
                    widgetBgOpacity: 58
                },
                fonts: {
                    family: 'Bradley Hand',
                    size: 16,
                    effects: {
                        shadow: false,
                        glow: false,
                        glowColor: '#e4007c'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'sakura'
                },
                tweaks: {
                    radius: 28,
                    border: 2,
                    blur: 3,
                    glowColor: '#ff90c9',
                    glowStrength: 22
                }
            },
            peacockpunk: {
                name: 'peacockpunk',
                colors: {
                    background: '#052026',
                    text: '#faffd2',
                    links: '#00ffd1',
                    linksHover: '#7bfffb',
                    borders: '#ffde59',
                    widgetBg: '#082f39',
                    widgetBgOpacity: 70
                },
                fonts: {
                    family: 'Stencil',
                    size: 15,
                    effects: {
                        shadow: true,
                        glow: false,
                        glowColor: '#00ffd1'
                    }
                },
                background: {
                    type: 'pattern',
                    pattern: 'peacock'
                },
                tweaks: {
                    radius: 15,
                    border: 3,
                    blur: 3,
                    glowColor: '#00ffd1',
                    glowStrength: 26
                }
            }
        };

        const resolvedThemeName = resolveThemeName(themeName);
        const theme = themes[resolvedThemeName];
        if (theme) {
            window.OurSpace.profile.theme.name = resolvedThemeName;
            Object.assign(window.OurSpace.profile.theme.colors, theme.colors);
            Object.assign(window.OurSpace.profile.theme.fonts, theme.fonts);
            Object.assign(window.OurSpace.profile.theme.background, theme.background);
            if (theme.tweaks) {
                window.OurSpace.profile.theme.tweaks = Object.assign({}, WIDGET_TWEAK_DEFAULTS, theme.tweaks);
            } else {
                ensureWidgetTweaks();
            }

            // Update UI controls
            updateColorPickers();
            updateFontControls();
            updateBackgroundControls();
            updateWidgetStyleControls();
            highlightThemeButton(resolvedThemeName);

            // Apply and save
            window.OurSpace.applyTheme();
            updateCustomizerSummary();
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

    function ensureWidgetTweaks() {
        if (!window.OurSpace.profile.theme) {
            window.OurSpace.profile.theme = {};
        }
        if (!window.OurSpace.profile.theme.tweaks || typeof window.OurSpace.profile.theme.tweaks !== 'object') {
            window.OurSpace.profile.theme.tweaks = {};
        }
        window.OurSpace.profile.theme.tweaks = Object.assign({}, WIDGET_TWEAK_DEFAULTS, window.OurSpace.profile.theme.tweaks);
        return window.OurSpace.profile.theme.tweaks;
    }

    function setupWidgetStyleControls() {
        const radiusInput = document.getElementById('widget-radius');
        const borderInput = document.getElementById('widget-border');
        const blurInput = document.getElementById('widget-blur');
        const glowStrengthInput = document.getElementById('widget-glow-strength');
        const glowColorInput = document.getElementById('widget-glow-color');

        const commitTweaks = (mutator) => {
            const tweaks = ensureWidgetTweaks();
            mutator(tweaks);
            window.OurSpace.applyTheme();
            updateWidgetStyleControls();
        };

        if (radiusInput) {
            radiusInput.addEventListener('input', function() {
                const val = parseInt(this.value, 10) || 0;
                commitTweaks((t) => {
                    t.radius = val;
                });
            });
        }

        if (borderInput) {
            borderInput.addEventListener('input', function() {
                const val = parseInt(this.value, 10) || 0;
                commitTweaks((t) => {
                    t.border = val;
                });
            });
        }

        if (blurInput) {
            blurInput.addEventListener('input', function() {
                const val = parseInt(this.value, 10) || 0;
                commitTweaks((t) => {
                    t.blur = val;
                });
            });
        }

        if (glowStrengthInput) {
            glowStrengthInput.addEventListener('input', function() {
                const val = parseInt(this.value, 10) || 0;
                commitTweaks((t) => {
                    t.glowStrength = val;
                });
            });
        }

        if (glowColorInput) {
            glowColorInput.addEventListener('input', function() {
                const color = this.value || '#00ffff';
                commitTweaks((t) => {
                    t.glowColor = color;
                });
            });
        }

        updateWidgetStyleControls();
    }

    function setupWidgetVisibilityControls() {
        const toggles = document.querySelectorAll('.widget-visibility-toggle');
        if (!toggles.length || !window.OurSpace) return;

        if (typeof window.OurSpace.ensureWidgetVisibilityState === 'function') {
            window.OurSpace.ensureWidgetVisibilityState();
        }
        const state = window.OurSpace.profile.widgetsVisibility || {};

        toggles.forEach(toggle => {
            const key = toggle.dataset.widget;
            toggle.checked = state[key] !== false;
            toggle.addEventListener('change', function() {
                state[key] = this.checked;
                if (typeof window.OurSpace.applyWidgetVisibility === 'function') {
                    window.OurSpace.applyWidgetVisibility();
                }
            });
        });
    }

    function updateWidgetStyleControls() {
        const tweaks = ensureWidgetTweaks();
        const radiusInput = document.getElementById('widget-radius');
        const radiusDisplay = document.getElementById('widget-radius-display');
        const borderInput = document.getElementById('widget-border');
        const borderDisplay = document.getElementById('widget-border-display');
        const blurInput = document.getElementById('widget-blur');
        const blurDisplay = document.getElementById('widget-blur-display');
        const glowStrengthInput = document.getElementById('widget-glow-strength');
        const glowStrengthDisplay = document.getElementById('widget-glow-strength-display');
        const glowColorInput = document.getElementById('widget-glow-color');

        if (radiusInput) radiusInput.value = tweaks.radius;
        if (radiusDisplay) radiusDisplay.textContent = tweaks.radius + 'px';

        if (borderInput) borderInput.value = tweaks.border;
        if (borderDisplay) borderDisplay.textContent = tweaks.border + 'px';

        if (blurInput) blurInput.value = tweaks.blur;
        if (blurDisplay) blurDisplay.textContent = tweaks.blur + 'px';

        if (glowStrengthInput) glowStrengthInput.value = tweaks.glowStrength;
        if (glowStrengthDisplay) glowStrengthDisplay.textContent = tweaks.glowStrength + 'px';

        if (glowColorInput && tweaks.glowColor) {
            glowColorInput.value = tweaks.glowColor;
        }
    }

    async function uploadCustomWidgetMedia(file) {
        if (!file) {
            throw new Error('No file selected');
        }
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/api/ourspace/upload', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error('Upload failed');
        }
        const data = await response.json();
        if (!data || !data.url) {
            throw new Error('Upload response missing URL');
        }
        return data.url;
    }
    window.OurSpaceWidgets = window.OurSpaceWidgets || {};
    window.OurSpaceWidgets.uploadCustomWidgetMedia = uploadCustomWidgetMedia;

    function setupCustomWidgetCreator() {
        const titleInput = document.getElementById('custom-widget-title');
        const typeSelect = document.getElementById('custom-widget-type');
        const textInput = document.getElementById('custom-widget-text');
        const mediaInput = document.getElementById('custom-widget-media');
        const uploadBtn = document.getElementById('custom-widget-upload-btn');
        const uploadLabel = document.getElementById('custom-widget-upload-label');
        const uploadInput = document.getElementById('custom-widget-file');
        const addBtn = document.getElementById('add-custom-widget');
        const list = document.getElementById('custom-widget-list');

        if (!titleInput || !typeSelect || !textInput || !mediaInput || !addBtn || !list || !uploadBtn || !uploadLabel || !uploadInput) {
            return;
        }

        function getStore() {
            if (!window.OurSpace.profile.widgets.customWidgets) {
                window.OurSpace.profile.widgets.customWidgets = [];
            }
            return window.OurSpace.profile.widgets.customWidgets;
        }

        function notifyRender() {
            if (window.OurSpaceWidgets && typeof window.OurSpaceWidgets.renderCustomWidgets === 'function') {
                window.OurSpaceWidgets.renderCustomWidgets();
            }
        }

        uploadBtn.addEventListener('click', function() {
            uploadInput.click();
        });

        uploadInput.addEventListener('change', async function() {
            const file = this.files && this.files[0];
            if (!file) return;
            uploadLabel.textContent = 'Uploading media...';
            try {
                const url = await uploadCustomWidgetMedia(file);
                mediaInput.value = url;
                uploadLabel.textContent = 'Media uploaded ✔';
            } catch (error) {
                console.error('[Customizer] Failed to upload custom widget media', error);
                uploadLabel.textContent = 'Upload failed';
                alert('Unable to upload media right now.');
            } finally {
                this.value = '';
            }
        });

        function renderList() {
            const widgets = getStore();
            list.innerHTML = '';
            if (!widgets.length) {
                const empty = document.createElement('p');
                empty.className = 'custom-widget-empty';
                empty.textContent = 'No custom widgets yet. Add one above!';
                list.appendChild(empty);
                return;
            }

            widgets.forEach(widget => {
                const item = document.createElement('div');
                item.className = 'custom-widget-item';

                const details = document.createElement('div');
                details.className = 'custom-widget-item-details';
                const title = document.createElement('strong');
                title.textContent = widget.title || 'Untitled Widget';
                details.appendChild(title);

                const type = document.createElement('span');
                type.className = 'custom-widget-item-type';
                type.textContent = (widget.type || 'text').toUpperCase();
                details.appendChild(type);

                const status = document.createElement('span');
                status.textContent = widget.mediaUrl ? 'Media linked' : 'No media yet';
                status.style.opacity = '0.7';
                details.appendChild(status);

                item.appendChild(details);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'custom-widget-remove';
                removeBtn.dataset.widgetId = widget.id;
                removeBtn.textContent = 'Remove';
                removeBtn.addEventListener('click', function() {
                    const widgets = getStore();
                    const index = widgets.findIndex(w => String(w.id) === String(widget.id));
                    if (index >= 0) {
                        widgets.splice(index, 1);
                        renderList();
                        notifyRender();
                    }
                });
                item.appendChild(removeBtn);

                list.appendChild(item);
            });
        }

        addBtn.addEventListener('click', function() {
            const widgets = getStore();
            const title = (titleInput.value || '').trim() || 'Untitled Widget';
            const type = typeSelect.value || 'text';
            const text = (textInput.value || '').trim();
            const mediaUrl = (mediaInput.value || '').trim();

            const widget = {
                id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
                title,
                type,
                text,
                mediaUrl
            };

            widgets.push(widget);
            titleInput.value = '';
            textInput.value = '';
            mediaInput.value = '';
            typeSelect.value = 'text';
            uploadLabel.textContent = 'No media uploaded';
            renderList();
            notifyRender();
        });

        renderList();
    }

    function setupSceneManager() {
        const nameInput = document.getElementById('scene-name');
        const descInput = document.getElementById('scene-description');
        const captureBtn = document.getElementById('scene-capture-btn');
        const clearBtn = document.getElementById('scene-clear-btn');
        const listEl = document.getElementById('scene-list');
        const emptyState = document.getElementById('scene-empty-state');

        if (!nameInput || !captureBtn || !listEl || !emptyState) {
            return;
        }

        const getDeck = () => ensureSceneDeckData();

        const resetInputs = () => {
            nameInput.value = '';
            if (descInput) {
                descInput.value = '';
            }
        };

        const markDirty = () => {
            if (window.OurSpace?.profile?.meta) {
                window.OurSpace.profile.meta.lastModified = Date.now();
            }
            updateCustomizerSummary();
        };

        const renderScenes = () => {
            const deck = getDeck();
            listEl.innerHTML = '';
            if (!deck.length) {
                emptyState.style.display = 'block';
                return;
            }
            emptyState.style.display = 'none';
            deck.forEach(scene => {
                const card = document.createElement('div');
                card.className = 'scene-card';
                card.dataset.sceneId = scene.id;
                if (scene.isActive) {
                    card.classList.add('active');
                }

                const header = document.createElement('div');
                header.className = 'scene-card-header';

                const title = document.createElement('h4');
                title.textContent = scene.name || 'Untitled Scene';
                header.appendChild(title);

                const meta = document.createElement('span');
                meta.className = 'scene-card-meta';
                meta.textContent = `Updated ${formatSceneTimestamp(scene.updatedAt || scene.createdAt)}`;
                header.appendChild(meta);

                card.appendChild(header);

                const swatch = document.createElement('div');
                swatch.className = 'scene-swatch';
                const primary = scene.snapshot?.theme?.colors?.background || '#555';
                const secondary = scene.snapshot?.theme?.colors?.widgetBg || '#999';
                swatch.style.background = `linear-gradient(90deg, ${primary}, ${secondary})`;
                card.appendChild(swatch);

                if (scene.description) {
                    const desc = document.createElement('p');
                    desc.className = 'scene-description';
                    desc.textContent = scene.description;
                    card.appendChild(desc);
                }

                const actions = document.createElement('div');
                actions.className = 'scene-actions';
                const applyBtn = document.createElement('button');
                applyBtn.className = 'scene-action-btn scene-apply';
                applyBtn.dataset.sceneAction = 'apply';
                applyBtn.textContent = 'Apply Scene';
                actions.appendChild(applyBtn);

                const updateBtn = document.createElement('button');
                updateBtn.className = 'scene-action-btn';
                updateBtn.dataset.sceneAction = 'update';
                updateBtn.textContent = 'Update Snapshot';
                actions.appendChild(updateBtn);

                const renameBtn = document.createElement('button');
                renameBtn.className = 'scene-action-btn';
                renameBtn.dataset.sceneAction = 'rename';
                renameBtn.textContent = 'Rename';
                actions.appendChild(renameBtn);

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'scene-action-btn danger';
                deleteBtn.dataset.sceneAction = 'delete';
                deleteBtn.textContent = 'Delete';
                actions.appendChild(deleteBtn);

                card.appendChild(actions);
                listEl.appendChild(card);
            });
        };

        const setActiveScene = (sceneId) => {
            getDeck().forEach(scene => {
                scene.isActive = scene.id === sceneId;
            });
        };

        const applyScene = (scene) => {
            if (!scene || !scene.snapshot) return;
            const deck = getDeck();
            const snapshot = JSON.parse(JSON.stringify(scene.snapshot));
            snapshot.sceneDeck = deck;
            if (!snapshot.meta) {
                snapshot.meta = {};
            }
            snapshot.meta.lastModified = Date.now();
            window.OurSpace.profile = snapshot;
            scene.lastAppliedAt = Date.now();
            setActiveScene(scene.id);
            markDirty();
            window.OurSpace.applyTheme(true);
            window.OurSpace.loadContent();
            window.OurSpace.updateStats();
            if (window.OurSpaceWidgets && typeof window.OurSpaceWidgets.renderCustomWidgets === 'function') {
                window.OurSpaceWidgets.renderCustomWidgets();
            }
            if (window.OurSpaceLayoutEditor && typeof window.OurSpaceLayoutEditor.updateFromProfile === 'function') {
                window.OurSpaceLayoutEditor.updateFromProfile();
            }
            updateColorPickers();
            updateFontControls();
            updateWidgetStyleControls();
            updateBackgroundControls();
            if (window.OurSpace && typeof window.OurSpace.saveProfile === 'function') {
                window.OurSpace.saveProfile();
            }
            renderScenes();
        };

        captureBtn.addEventListener('click', () => {
            const deck = getDeck();
            const sceneName = (nameInput.value || '').trim() || `Scene ${deck.length + 1}`;
            const description = (descInput?.value || '').trim();
            const now = Date.now();
            const scene = {
                id: (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `${SCENE_ID_PREFIX}${now}`,
                name: sceneName,
                description,
                createdAt: now,
                updatedAt: now,
                lastAppliedAt: null,
                isActive: true,
                snapshot: createSceneSnapshot()
            };
            deck.forEach(entry => {
                entry.isActive = false;
            });
            deck.unshift(scene);
            markDirty();
            resetInputs();
            renderScenes();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                resetInputs();
            });
        }

        listEl.addEventListener('click', (event) => {
            const actionBtn = event.target.closest('[data-scene-action]');
            if (!actionBtn) return;
            const card = actionBtn.closest('.scene-card');
            if (!card) return;
            const sceneId = card.dataset.sceneId;
            const action = actionBtn.dataset.sceneAction;
            const deck = getDeck();
            const scene = deck.find(item => item.id === sceneId);
            if (!scene) return;

            if (action === 'apply') {
                applyScene(scene);
                return;
            }

            if (action === 'update') {
                scene.snapshot = createSceneSnapshot();
                scene.updatedAt = Date.now();
                setActiveScene(scene.id);
                markDirty();
                renderScenes();
                return;
            }

            if (action === 'rename') {
                const nextName = prompt('Rename scene', scene.name || 'Untitled Scene');
                if (nextName) {
                    scene.name = nextName.trim();
                    scene.updatedAt = Date.now();
                    markDirty();
                    renderScenes();
                }
                return;
            }

            if (action === 'delete') {
                const confirmDelete = confirm(`Delete "${scene.name || 'this scene'}"?`);
                if (confirmDelete) {
                    const index = deck.findIndex(item => item.id === sceneId);
                    if (index !== -1) {
                        deck.splice(index, 1);
                        markDirty();
                        renderScenes();
                    }
                }
            }
        });

        renderScenes();
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
        const effectMatrixRain = document.getElementById('effect-matrix-rain');
        const effectDiscoBall = document.getElementById('effect-disco-ball');
        const effectTvStatic = document.getElementById('effect-tv-static');
        const effectKaleidoscope = document.getElementById('effect-kaleidoscope');
        const effectVhsGlitch = document.getElementById('effect-vhs-glitch');
        const effectStardust = document.getElementById('effect-stardust');
        const effectEmojiOrbit = document.getElementById('effect-emoji-orbit');
        const effectEmojiBurst = document.getElementById('effect-emoji-burst');
        const effectEmojiWave = document.getElementById('effect-emoji-wave');
        const effectEmojiPop = document.getElementById('effect-emoji-pop');
        const effectEmojiLanterns = document.getElementById('effect-emoji-lanterns');
        const effectScreenVignette = document.getElementById('effect-screen-vignette');
        const effectScreenHaze = document.getElementById('effect-screen-haze');
        const effectScreenGrid = document.getElementById('effect-screen-grid');
        const effectScreenHolo = document.getElementById('effect-screen-holo');
        const effectScreenPrism = document.getElementById('effect-screen-prism');

        const cursorCustomWrapper = document.getElementById('cursor-trail-custom-wrapper');
        const resetEffectsBtn = document.getElementById('reset-effects-btn');
        const hydrators = [];

        const registerHydrator = (fn) => {
            if (typeof fn === 'function') {
                hydrators.push(fn);
            }
        };

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
            const applyState = () => {
                const config = ensureEffectConfig(key, defaults);
                toggle.checked = !!config.enabled;
            };
            applyState();
            registerHydrator(applyState);
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
            const format = options.format || (val => val);
            const parse = options.parse || (val => parseFloat(val));
            const updateDisplay = (val) => {
                if (display) display.textContent = format(val);
            };
            const applyState = () => {
                const config = ensureEffectConfig(key, defaults);
                let value = config[prop];
                if (value === undefined) {
                    value = parse(input.value);
                    ensureEffectConfig(key, defaults)[prop] = value;
                }
                input.value = value;
                updateDisplay(value);
            };
            applyState();
            registerHydrator(applyState);
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
            const applyState = () => {
                const config = ensureEffectConfig(key, defaults);
                let value = config[prop];
                if (value === undefined) {
                    value = defaults[prop] !== undefined ? defaults[prop] : select.value;
                    ensureEffectConfig(key, defaults)[prop] = value;
                }
                select.value = value;
                if (options.onInit) {
                    options.onInit(value);
                }
            };
            applyState();
            registerHydrator(applyState);
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
            const applyState = () => {
                const config = ensureEffectConfig(key, defaults);
                let value = config[prop];
                if (!value) {
                    value = defaults[prop] || input.value;
                    ensureEffectConfig(key, defaults)[prop] = value;
                }
                input.value = value;
            };
            applyState();
            registerHydrator(applyState);
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
        bindEffectToggle(effectMatrixRain, 'matrixRain', { density: 1 });
        bindEffectToggle(effectDiscoBall, 'discoBall', { color: '#ff00ff', accent: '#00ffff', sparkle: 1 });
        bindEffectToggle(effectTvStatic, 'tvStatic', { opacity: 0.25 });
        bindEffectToggle(effectKaleidoscope, 'kaleidoscope', { speed: 18 });
        bindEffectToggle(effectVhsGlitch, 'vhsGlitch', { intensity: 0.3 });
        bindEffectToggle(effectStardust, 'stardustTrail', { density: 1.2, color: '#ffffff' });
        bindEffectToggle(effectEmojiOrbit, 'emojiOrbit', { emojis: ['💫', '🦋', '🌙', '⭐', '💖'] });
        bindEffectToggle(effectEmojiBurst, 'emojiBurst', { frequency: 2 });
        bindEffectToggle(effectEmojiWave, 'emojiWave', { speed: 4000 });
        bindEffectToggle(effectEmojiPop, 'emojiPop', {});
        bindEffectToggle(effectEmojiLanterns, 'emojiLanterns', { speed: 1.2 });
        bindEffectToggle(effectScreenVignette, 'screenVignette', {});
        bindEffectToggle(effectScreenHaze, 'screenHaze', {});
        bindEffectToggle(effectScreenGrid, 'screenGrid', {});
        bindEffectToggle(effectScreenHolo, 'screenHolo', {});
        bindEffectToggle(effectScreenPrism, 'screenPrism', {});

        const hydrateEffectsUI = () => {
            hydrators.forEach(fn => {
                try {
                    fn();
                } catch (err) {
                    console.warn('[Customizer] Failed to hydrate effect control', err);
                }
            });
            refreshEffects({ falling: true, cursor: true });
        };

        if (resetEffectsBtn) {
            resetEffectsBtn.addEventListener('click', () => {
                if (!window.OurSpace || !window.OurSpace.profile) return;
                window.OurSpace.profile.theme.effects = {};
                hydrateEffectsUI();
                if (typeof markDirty === 'function') {
                    markDirty();
                }
            });
        }
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

                updateCustomizerSummary();

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





