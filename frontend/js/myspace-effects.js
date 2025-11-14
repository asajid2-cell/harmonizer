// MySpace Effects - Visual Effects (Falling Objects, Cursor Trail, etc.)

(function() {
    'use strict';

    const root = document.documentElement;

    let fallingInterval = null;
    let cursorTrailActive = false;
    let cursorTrailConfig = null;
    let particles = [];
    let sparkleRainInterval = null;
    let polaroidInterval = null;
    let floatingEmojiInterval = null;
    let lightningTimeout = null;
    let pixelBurstHandler = null;
    let bubbleWarpHandler = null;
    let chromaticTrailHandler = null;
    let prismTrailConfig = null;

    function getEffectsStore() {
        return (window.MySpace && window.MySpace.profile && window.MySpace.profile.theme && window.MySpace.profile.theme.effects) || {};
    }

    function getEffectConfig(key, defaults = {}) {
        const store = getEffectsStore();
        let config = store[key];
        if (!config || typeof config !== 'object') {
            config = { enabled: !!config };
        }
        config = Object.assign({ enabled: false }, defaults, config);
        store[key] = config;
        return config;
    }

    function hexToRgba(hex, alpha) {
        if (!hex) return `rgba(255,255,255,${alpha})`;
        const normalized = hex.replace('#', '');
        const bigint = parseInt(normalized.length === 3
            ? normalized.split('').map(c => c + c).join('')
            : normalized, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    window.MySpaceEffects = {
        updateFallingEffect: updateFallingEffect,
        toggleCursorTrail: toggleCursorTrail,
        refreshDynamicEffects: refreshDynamicEffects
    };

    window.addEventListener('DOMContentLoaded', function() {
        initEffects();
    });

    function initEffects() {
        console.log("[Effects] Initializing visual effects...");

        const fallingDefaults = { type: "hearts", speed: 2, density: 1 };
        const cursorDefaults = { style: "sparkle", colorMode: "rainbow", customColor: "#ff7cf5", length: 1, size: 1 };

        if (getEffectConfig('falling', fallingDefaults).enabled) {
            startFallingEffect(fallingDefaults);
        }

        if (getEffectConfig('cursorTrail', cursorDefaults).enabled) {
            startCursorTrail(cursorDefaults);
        }

        refreshDynamicEffects();

        console.log("[Effects] Initialization complete");
    }

    function refreshDynamicEffects() {
        if (!window.MySpace || !window.MySpace.profile) return;
        toggleGlitterBorders(getEffectConfig('glitter', { intensity: 0.7 }));
        toggleBlinkingText(getEffectConfig('blink', { speed: 1 }));
        toggleSparkleRain(getEffectConfig('sparkleRain', { density: 1 }));
        toggleAuroraWaves(getEffectConfig('auroraWaves', { intensity: 0.4, speed: 1, colorA: "#47ffe3", colorB: "#ff4ffb" }));
        togglePixelBurst(getEffectConfig('pixelBurst', {}));
        toggleNeonPulse(getEffectConfig('neonPulse', { color: "#00fff5", accent: "#ff00ff", speed: 1.2 }));
        togglePolaroidPopups(getEffectConfig('polaroidPopups', { interval: 4 }));
        toggleBubbleWarp(getEffectConfig('bubbleWarp', { size: 1 }));
        toggleRetroScanlines(getEffectConfig('retroScanlines', { opacity: 0.18 }));
        toggleChromaticTrails(getEffectConfig('chromaticTrails', { length: 0.9, mode: "sunset" }));
        toggleFloatingEmojis(getEffectConfig('floatingEmojis', { density: 1 }));
        toggleLightningFlickers(getEffectConfig('lightningFlickers', { intensity: 0.8, frequency: 6 }));
    }

    // Falling Effects
    function updateFallingEffect() {
        const config = getEffectConfig('falling', { type: "hearts", speed: 2, density: 1 });
        if (config.enabled) {
            startFallingEffect(config);
        } else {
            stopFallingEffect();
        }
    }

    function startFallingEffect(config) {
        stopFallingEffect();

        const container = document.getElementById('falling-effects-container');
        if (!container) return;

        const cfg = config || getEffectConfig('falling', { type: "hearts", speed: 2, density: 1 });
        const type = cfg.type || 'hearts';
        const speed = cfg.speed || 2;
        const density = Math.max(0.2, cfg.density || 1);

        const emojis = {
            hearts: ['❤', '💕', '💖', '💗', '💞'],
            stars: ['✦', '✧', '★', '☆', '✩'],
            snow: ['❄', '❅', '❆', '✼', '✻'],
            sparkles: ['✨', '✺', '✷', '❇', '✹']
        };

        const objectsToFall = emojis[type] || emojis.hearts;
        const intervalDelay = Math.max(160, 600 / density);

        fallingInterval = setInterval(function() {
            createFallingObject(container, objectsToFall, cfg);
        }, intervalDelay);

        console.log("[Effects] Falling effect started:", type);
    }

    function stopFallingEffect() {
        if (fallingInterval) {
            clearInterval(fallingInterval);
            fallingInterval = null;
        }

        const container = document.getElementById('falling-effects-container');
        if (container) {
            container.innerHTML = '';
        }

        console.log("[Effects] Falling effect stopped");
    }

    function createFallingObject(container, objects, config) {
        const object = document.createElement('div');
        object.className = 'falling-object';
        object.textContent = objects[Math.floor(Math.random() * objects.length)];

        object.style.left = Math.random() * 100 + '%';

        const speed = config.speed || 2;
        const sizeMultiplier = config.size || 1;

        const duration = (5 + Math.random() * 5) / speed;
        object.style.animationDuration = duration + 's';
        object.style.animationDelay = Math.random() * 2 + 's';
        object.style.fontSize = (18 + Math.random() * 14) * sizeMultiplier + 'px';

        container.appendChild(object);

        setTimeout(function() {
            if (object.parentNode) {
                object.parentNode.removeChild(object);
            }
        }, (duration + 2) * 1000);
    }

    // Cursor Trail
    function toggleCursorTrail() {
        const config = getEffectConfig('cursorTrail', {
            style: 'sparkle',
            colorMode: 'rainbow',
            customColor: '#ff7cf5',
            length: 1,
            size: 1
        });
        if (config.enabled) {
            startCursorTrail(config);
        } else {
            stopCursorTrail();
        }
    }

    function startCursorTrail(config) {
        if (cursorTrailActive) {
            cursorTrailConfig = config;
            return;
        }

        const canvas = document.getElementById('cursor-trail-canvas');
        if (!canvas) return;

        cursorTrailConfig = config;
        canvas.classList.add('active');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const ctx = canvas.getContext('2d');
        cursorTrailActive = true;

        document.addEventListener('mousemove', handleMouseMove);

        animateCursorTrail(ctx, canvas);

        window.addEventListener('resize', function() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        console.log("[Effects] Cursor trail started");
    }

    function stopCursorTrail() {
        cursorTrailActive = false;
        cursorTrailConfig = null;
        particles = [];

        const canvas = document.getElementById('cursor-trail-canvas');
        if (canvas) {
            canvas.classList.remove('active');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        document.removeEventListener('mousemove', handleMouseMove);

        console.log("[Effects] Cursor trail stopped");
    }

    function handleMouseMove(e) {
        if (!cursorTrailActive) return;

        const cfg = cursorTrailConfig || {
            length: 1,
            size: 1,
            colorMode: 'rainbow',
            customColor: '#ff7cf5'
        };
        const sizeBoost = cfg.size || 1;
        const life = 1.0;
        particles.push({
            x: e.clientX,
            y: e.clientY,
            size: (Math.random() * 5 + 2) * sizeBoost,
            color: getTrailColor(cfg),
            life
        });

        // Limit particles
        const maxParticles = Math.max(20, Math.round(50 * (cfg.length || 1)));
        if (particles.length > maxParticles) {
            particles.shift();
        }
    }

    function animateCursorTrail(ctx, canvas) {
        if (!cursorTrailActive) return;
        const cfg = cursorTrailConfig || { length: 1 };
        const decay = 0.02 / (cfg.length || 1);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            p.life -= decay;
            p.size *= 0.95;

            if (p.life <= 0 || p.size < 0.5) {
                particles.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.fill();
        }

        ctx.globalAlpha = 1.0;

        requestAnimationFrame(function() {
            animateCursorTrail(ctx, canvas);
        });
    }

    function getTrailColor(config) {
        const mode = config.colorMode || 'rainbow';
        if (mode === 'custom' && config.customColor) {
            return config.customColor;
        }
        if (mode === 'neon') {
            const palette = ['#00fff5', '#ff00ff', '#ffe066'];
            return palette[Math.floor(Math.random() * palette.length)];
        }
        if (mode === 'cool') {
            const palette = ['#74ebd5', '#ACB6E5', '#5ef0ff'];
            return palette[Math.floor(Math.random() * palette.length)];
        }
        // rainbow default
        return `hsl(${Math.random() * 360}, 100%, 70%)`;
    }

    // Glitter Borders
    function toggleGlitterBorders(config) {
        const enabled = !!(config && config.enabled);
        const intensity = config && config.intensity !== undefined ? config.intensity : 0.7;
        root.style.setProperty('--glitter-border-strength', intensity);
        const elements = document.querySelectorAll('.widget, .picture-item, .friend-slot');
        elements.forEach(el => {
            el.classList.toggle('glitter-border', enabled);
        });
    }

    // Blinking Text
    function toggleBlinkingText(config) {
        const enabled = !!(config && config.enabled);
        const speed = (config && config.speed) ? config.speed : 1;
        root.style.setProperty('--blink-speed', speed + 's');
        const headers = document.querySelectorAll('.widget-header h2, .profile-name');
        headers.forEach(header => {
            header.classList.toggle('blink', enabled);
        });
    }

    // Sparkle Rain
    function toggleSparkleRain(config) {
        const enabled = !!(config && config.enabled);
        let container = document.getElementById('sparkle-rain-container');
        if (!enabled) {
            if (container) {
                container.innerHTML = '';
                container.classList.remove('active');
            }
            if (sparkleRainInterval) {
                clearInterval(sparkleRainInterval);
                sparkleRainInterval = null;
            }
            return;
        }

        if (!container) {
            container = ensureOverlay('sparkle-rain-container', 'sparkle-rain-container');
        }

        const density = Math.max(0.2, config.density || 1);
        container.classList.add('active');
        if (sparkleRainInterval) {
            clearInterval(sparkleRainInterval);
        }
        sparkleRainInterval = setInterval(() => {
            const drop = document.createElement('span');
            drop.className = 'sparkle-raindrop';
            drop.style.left = Math.random() * 100 + '%';
            const hue = Math.floor(Math.random() * 360);
            drop.style.setProperty('--sparkle-color', `hsla(${hue}, 90%, 70%, 0.8)`);
            drop.style.animationDuration = (3 + Math.random() * 3) / density + 's';
            container.appendChild(drop);
            setTimeout(() => drop.remove(), 6000);
        }, Math.max(120, 300 / density));
    }

    // Aurora Waves
    function toggleAuroraWaves(config) {
        const enabled = !!(config && config.enabled);
        let layer = document.getElementById('aurora-waves-overlay');
        if (!enabled) {
            if (layer) layer.classList.remove('active');
            return;
        }
        if (!layer) {
            layer = ensureOverlay('aurora-waves-overlay', 'aurora-waves-overlay');
        }
        const intensity = config.intensity !== undefined ? config.intensity : 0.4;
        const speedMultiplier = config.speed || 1;
        const baseDuration = 18;
        root.style.setProperty('--aurora-opacity', intensity);
        root.style.setProperty('--aurora-speed', (baseDuration / speedMultiplier) + 's');
        const colorA = config.colorA || '#47ffe3';
        const colorB = config.colorB || '#ff4ffb';
        layer.style.background = `
            radial-gradient(circle at 20% 20%, ${hexToRgba(colorA, 0.4)}, transparent 60%),
            radial-gradient(circle at 80% 30%, ${hexToRgba(colorB, 0.35)}, transparent 55%),
            radial-gradient(circle at 50% 80%, rgba(80, 120, 255, 0.35), transparent 60%)
        `;
        layer.classList.add('active');
    }

    // Pixel Burst
    function togglePixelBurst(config) {
        const enabled = !!(config && config.enabled);
        if (enabled) {
            if (pixelBurstHandler) return;
            pixelBurstHandler = function(e) {
                createPixelBurst(e.clientX, e.clientY);
            };
            document.addEventListener('click', pixelBurstHandler);
        } else if (pixelBurstHandler) {
            document.removeEventListener('click', pixelBurstHandler);
            pixelBurstHandler = null;
        }
    }

    function createPixelBurst(x, y) {
        const burst = document.createElement('div');
        burst.className = 'pixel-burst';
        burst.style.left = x + 'px';
        burst.style.top = y + 'px';

        for (let i = 0; i < 10; i++) {
            const particle = document.createElement('span');
            particle.className = 'pixel-burst-particle';
            particle.style.setProperty('--angle', Math.random() * 360 + 'deg');
            particle.style.setProperty('--distance', 30 + Math.random() * 50 + 'px');
            particle.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 70%)`;
            burst.appendChild(particle);
        }

        document.body.appendChild(burst);
        setTimeout(() => burst.remove(), 800);
    }

    // Neon Pulse
    function toggleNeonPulse(config) {
        const enabled = !!(config && config.enabled);
        document.body.classList.toggle('neon-pulse-active', enabled);
        if (!config) return;
        const color = config.color || '#00fff5';
        const accent = config.accent || '#ff00ff';
        const speed = config.speed || 1.2;
        root.style.setProperty('--neon-primary', color);
        root.style.setProperty('--neon-secondary', accent);
        root.style.setProperty('--neon-pulse-speed', (2.5 / speed) + 's');
    }

    // Polaroid Popups
    function togglePolaroidPopups(config) {
        const enabled = !!(config && config.enabled);
        let container = document.getElementById('polaroid-popups');
        if (!enabled) {
            if (container) container.innerHTML = '';
            if (polaroidInterval) {
                clearInterval(polaroidInterval);
                polaroidInterval = null;
            }
            return;
        }

        if (!container) {
            container = ensureOverlay('polaroid-popups', 'polaroid-popups');
        }

        const quotes = [
            "Stay weird âœ¨",
            "Live, laugh, loop",
            "BRB vibing",
            "Sparkle mode: ON",
            "404: Chill not found",
            "Scene queen energy",
            "Trust the glitter"
        ];

        if (polaroidInterval) clearInterval(polaroidInterval);
        const interval = Math.max(2, config && config.interval ? config.interval : 4) * 1000;
        polaroidInterval = setInterval(() => {
            const frame = document.createElement('div');
            frame.className = 'polaroid-popup';
            frame.textContent = quotes[Math.floor(Math.random() * quotes.length)];
            frame.style.left = Math.random() * 80 + '%';
            frame.style.top = 10 + Math.random() * 60 + '%';
            frame.style.setProperty('--rotation', (Math.random() * 20 - 10) + 'deg');
            container.appendChild(frame);
            setTimeout(() => frame.remove(), 6000);
        }, interval);
    }

    // Bubble Warp
    function toggleBubbleWarp(config) {
        const enabled = !!(config && config.enabled);
        const handler = function(e) {
            const sizeMult = config && config.size ? config.size : 1;
            const bubble = document.createElement('span');
            bubble.className = 'bubble-warp';
            bubble.style.left = e.clientX + 'px';
            bubble.style.top = e.clientY + 'px';
            bubble.style.setProperty('--bubble-size', (20 + Math.random() * 40) * sizeMult + 'px');
            bubble.style.setProperty('--bubble-color', `hsla(${Math.random() * 360}, 70%, 80%, 0.35)`);
            document.body.appendChild(bubble);
            setTimeout(() => bubble.remove(), 1200);
        };

        if (enabled) {
            if (bubbleWarpHandler) return;
            bubbleWarpHandler = handler;
            document.addEventListener('mousemove', bubbleWarpHandler);
        } else if (bubbleWarpHandler) {
            document.removeEventListener('mousemove', bubbleWarpHandler);
            bubbleWarpHandler = null;
        }
    }

    // Retro Scanlines
    function toggleRetroScanlines(config) {
        const enabled = !!(config && config.enabled);
        let overlay = document.getElementById('retro-scanlines');
        if (!enabled) {
            if (overlay) overlay.classList.remove('active');
            return;
        }
        if (!overlay) {
            overlay = ensureOverlay('retro-scanlines', 'retro-scanlines');
        }
        const opacity = config.opacity !== undefined ? config.opacity : 0.18;
        overlay.style.opacity = opacity;
        overlay.classList.add('active');
    }

    const PRISM_PALETTES = {
        sunset: ['#ff9a9e', '#fad0c4'],
        ocean: ['#00c6ff', '#0072ff'],
        neon: ['#0ff0fc', '#ff2d95'],
        pastel: ['#a18cd1', '#fbc2eb']
    };
    let lastTrailPoint = null;

    function toggleChromaticTrails(config) {
        const cfg = config || getEffectConfig('chromaticTrails', { length: 0.9, mode: 'sunset' });
        prismTrailConfig = cfg;
        const enabled = !!cfg.enabled;
        if (enabled) {
            if (chromaticTrailHandler) return;
            chromaticTrailHandler = function(e) {
                const activeCfg = prismTrailConfig || cfg;
                const trail = document.createElement('div');
                trail.className = 'prism-trail';
                const palette = PRISM_PALETTES[activeCfg.mode] || PRISM_PALETTES.sunset;
                trail.style.setProperty('--trail-gradient', `linear-gradient(90deg, ${palette[0]}, ${palette[1]})`);
                const duration = Math.max(0.3, 0.6 * (activeCfg.length || 1));
                trail.style.setProperty('--trail-duration', duration + 's');
                trail.style.left = e.clientX + 'px';
                trail.style.top = e.clientY + 'px';
                const prev = lastTrailPoint;
                let angle = Math.random() * 360;
                if (prev) {
                    angle = Math.atan2(e.clientY - prev.y, e.clientX - prev.x) * 180 / Math.PI;
                }
                trail.style.transform = `rotate(${angle}deg)`;
                document.body.appendChild(trail);
                setTimeout(() => trail.remove(), duration * 1000);
                lastTrailPoint = { x: e.clientX, y: e.clientY };
            };
            document.addEventListener('mousemove', chromaticTrailHandler);
        } else if (chromaticTrailHandler) {
            document.removeEventListener('mousemove', chromaticTrailHandler);
            chromaticTrailHandler = null;
            lastTrailPoint = null;
            prismTrailConfig = null;
        }
    }

    // Floating Emojis
    function toggleFloatingEmojis(config) {
        const enabled = !!(config && config.enabled);
        let container = document.getElementById('floating-emoji-container');
        if (!enabled) {
            if (container) container.innerHTML = '';
            if (floatingEmojiInterval) {
                clearInterval(floatingEmojiInterval);
                floatingEmojiInterval = null;
            }
            return;
        }

        if (!container) {
            container = ensureOverlay('floating-emoji-container', 'floating-emoji-container');
        }

        const emojis = ['✨', '🎧', '💜', '🌈', '⭐', '💌', '🦋'];
        if (floatingEmojiInterval) clearInterval(floatingEmojiInterval);
        const density = Math.max(0.3, config.density || 1);
        floatingEmojiInterval = setInterval(() => {
            const emoji = document.createElement('span');
            emoji.className = 'floating-emoji';
            emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            emoji.style.left = Math.random() * 100 + '%';
            emoji.style.fontSize = (24 + Math.random() * 12) * density + 'px';
            container.appendChild(emoji);
            setTimeout(() => emoji.remove(), 7000);
        }, Math.max(300, 1000 / density));
    }
            return;
        }

        if (!container) {
            container = ensureOverlay('floating-emoji-container', 'floating-emoji-container');
        }

        const emojis = ['âœ¨', 'ðŸŽ§', 'ðŸ’œ', 'ðŸŒˆ', 'â­', 'ðŸ’Œ', 'ðŸ¦‹'];
        if (floatingEmojiInterval) clearInterval(floatingEmojiInterval);
        floatingEmojiInterval = setInterval(() => {
            const emoji = document.createElement('span');
            emoji.className = 'floating-emoji';
            emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            emoji.style.left = Math.random() * 100 + '%';
            container.appendChild(emoji);
            setTimeout(() => emoji.remove(), 7000);
        }, 800);
    }

    // Lightning Flickers
    function toggleLightningFlickers(config) {
        const enabled = !!(config && config.enabled);
        let overlay = document.getElementById('lightning-overlay');
        if (!enabled) {
            if (overlay) overlay.classList.remove('active');
            if (lightningTimeout) {
                clearTimeout(lightningTimeout);
                lightningTimeout = null;
            }
            document.body.classList.remove('lightning-rumble');
            return;
        }

        if (!overlay) {
            overlay = ensureOverlay('lightning-overlay', 'lightning-overlay');
        }

        const intensity = config.intensity !== undefined ? config.intensity : 0.8;
        const frequency = config.frequency || 6;
        root.style.setProperty('--lightning-brightness', intensity);

        if (lightningTimeout) clearTimeout(lightningTimeout);
        const schedule = () => {
            overlay.classList.add('active');
            document.body.classList.add('lightning-rumble');
            setTimeout(() => {
                overlay.classList.remove('active');
                document.body.classList.remove('lightning-rumble');
            }, 280);
            lightningTimeout = setTimeout(schedule, frequency * 1000 + Math.random() * 800);
        };
        schedule();
    }

    function ensureOverlay(id, className) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = className;
            document.body.appendChild(el);
        }
        return el;
    }

})();


