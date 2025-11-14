// MySpace Effects - Visual Effects (Falling Objects, Cursor Trail, etc.)

(function() {
    'use strict';

    let fallingInterval = null;
    let cursorTrailActive = false;
    let particles = [];

    window.MySpaceEffects = {
        updateFallingEffect: updateFallingEffect,
        toggleCursorTrail: toggleCursorTrail
    };

    window.addEventListener('DOMContentLoaded', function() {
        initEffects();
    });

    function initEffects() {
        console.log("[Effects] Initializing visual effects...");

        // Initialize falling effects if enabled
        if (window.MySpace.profile.theme.effects.falling.enabled) {
            startFallingEffect();
        }

        // Initialize cursor trail if enabled
        if (window.MySpace.profile.theme.effects.cursorTrail.enabled) {
            startCursorTrail();
        }

        // Apply glitter borders if enabled
        if (window.MySpace.profile.theme.effects.glitter) {
            applyGlitterBorders();
        }

        // Apply blinking text if enabled
        if (window.MySpace.profile.theme.effects.blink) {
            applyBlinkingText();
        }

        console.log("[Effects] Initialization complete");
    }

    // Falling Effects
    function updateFallingEffect() {
        if (window.MySpace.profile.theme.effects.falling.enabled) {
            startFallingEffect();
        } else {
            stopFallingEffect();
        }
    }

    function startFallingEffect() {
        stopFallingEffect(); // Clear any existing interval

        const container = document.getElementById('falling-effects-container');
        if (!container) return;

        const type = window.MySpace.profile.theme.effects.falling.type;
        const speed = window.MySpace.profile.theme.effects.falling.speed || 2;

        const emojis = {
            hearts: ['💖', '💕', '💗', '💓', '💝'],
            stars: ['⭐', '✨', '🌟', '💫', '⭐'],
            snow: ['❄️', '❅', '❆', '❄️', '❅'],
            sparkles: ['✨', '💎', '✨', '⚡', '✨']
        };

        const objectsToFall = emojis[type] || emojis.hearts;

        // Create falling objects periodically
        fallingInterval = setInterval(function() {
            createFallingObject(container, objectsToFall, speed);
        }, 500);

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

    function createFallingObject(container, objects, speed) {
        const object = document.createElement('div');
        object.className = 'falling-object';
        object.textContent = objects[Math.floor(Math.random() * objects.length)];

        // Random horizontal position
        object.style.left = Math.random() * 100 + '%';

        // Random animation duration based on speed
        const duration = (5 + Math.random() * 5) / speed;
        object.style.animationDuration = duration + 's';

        // Random delay
        object.style.animationDelay = Math.random() * 2 + 's';

        container.appendChild(object);

        // Remove after animation completes
        setTimeout(function() {
            if (object.parentNode) {
                object.parentNode.removeChild(object);
            }
        }, (duration + 2) * 1000);
    }

    // Cursor Trail
    function toggleCursorTrail(enabled) {
        if (enabled) {
            startCursorTrail();
        } else {
            stopCursorTrail();
        }
    }

    function startCursorTrail() {
        if (cursorTrailActive) return;

        const canvas = document.getElementById('cursor-trail-canvas');
        if (!canvas) return;

        canvas.classList.add('active');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const ctx = canvas.getContext('2d');
        cursorTrailActive = true;

        // Track mouse position
        document.addEventListener('mousemove', handleMouseMove);

        // Animate particles
        animateCursorTrail(ctx, canvas);

        // Resize handler
        window.addEventListener('resize', function() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });

        console.log("[Effects] Cursor trail started");
    }

    function stopCursorTrail() {
        cursorTrailActive = false;
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

        // Create particle at mouse position
        particles.push({
            x: e.clientX,
            y: e.clientY,
            size: Math.random() * 5 + 2,
            color: `hsl(${Math.random() * 360}, 100%, 70%)`,
            life: 1.0
        });

        // Limit particles
        if (particles.length > 50) {
            particles.shift();
        }
    }

    function animateCursorTrail(ctx, canvas) {
        if (!cursorTrailActive) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update and draw particles
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];

            p.life -= 0.02;
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

    // Glitter Borders
    function applyGlitterBorders() {
        const elements = document.querySelectorAll('.widget, .picture-item, .friend-slot');
        elements.forEach(el => {
            el.classList.add('glitter-border');
        });
    }

    // Blinking Text
    function applyBlinkingText() {
        const headers = document.querySelectorAll('.widget-header h2, .profile-name');
        headers.forEach(header => {
            header.classList.add('blink');
        });
    }

})();
