/**
 * SONIC ARCHITECT MK.III
 * VisualizerManager - Manages Visualizer Switching and Transitions
 *
 * Features:
 * - Register/unregister visualizers
 * - Switch between visualizers with transitions
 * - Handle visualizer-specific controls
 * - Manage quality settings across all visualizers
 */

import { eventBus, Events } from '../utils/EventBus.js';

class VisualizerManager {
    constructor(scene, camera, renderer) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;

        // Registered visualizers
        this.visualizers = new Map();
        this.visualizerList = []; // Ordered list for cycling

        // Current state
        this.currentVisualizer = null;
        this.currentId = null;
        this.previousId = null;

        // Transition state
        this.isTransitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 1000; // ms
        this.transitionType = 'instant'; // 'crossfade', 'morph', 'glitch', 'instant' - Using instant to fix shader materials

        // Quality
        this.globalQuality = 'high';

        // Audio data reference
        this.audioData = null;

        // Bind methods
        this.update = this.update.bind(this);
    }

    /**
     * Register a visualizer
     */
    register(VisualizerClass, options = {}) {
        try {
            // Create instance
            const visualizer = new VisualizerClass(this.scene, this.camera, this.renderer);

            // Apply quality
            visualizer.setQuality(this.globalQuality);

            // Store
            this.visualizers.set(visualizer.id, visualizer);
            this.visualizerList.push(visualizer.id);

            console.log(`📊 Registered visualizer: ${visualizer.name} (${visualizer.id})`);

            eventBus.emit(Events.VISUALIZER_REGISTER, {
                id: visualizer.id,
                name: visualizer.name,
                total: this.visualizers.size
            });

            return visualizer;
        } catch (error) {
            console.error('Failed to register visualizer:', error);
            return null;
        }
    }

    /**
     * Unregister a visualizer
     */
    unregister(id) {
        const visualizer = this.visualizers.get(id);
        if (!visualizer) return false;

        // If active, switch away first
        if (this.currentId === id) {
            const nextId = this.getNextId();
            if (nextId && nextId !== id) {
                this.switchTo(nextId, 'instant');
            }
        }

        // Dispose and remove
        visualizer.dispose();
        this.visualizers.delete(id);
        this.visualizerList = this.visualizerList.filter(vid => vid !== id);

        console.log(`🗑️ Unregistered visualizer: ${id}`);
        return true;
    }

    /**
     * Initialize a visualizer by ID
     */
    init(id) {
        const visualizer = this.visualizers.get(id);
        if (visualizer && !visualizer.isInitialized) {
            visualizer.init();
        }
        return visualizer;
    }

    /**
     * Switch to a visualizer by ID
     */
    async switchTo(id, transitionType = null) {
        const visualizer = this.visualizers.get(id);
        if (!visualizer) {
            console.warn(`Visualizer not found: ${id}`);
            return false;
        }

        // Same visualizer, no switch needed
        if (this.currentId === id) return true;

        // Use specified or default transition
        const transition = transitionType || this.transitionType;

        console.log(`🔄 Switching to ${visualizer.name} (${transition})`);

        this.previousId = this.currentId;
        this.isTransitioning = true;

        // Initialize if needed
        if (!visualizer.isInitialized) {
            visualizer.init();
        }

        if (transition === 'instant') {
            // Instant switch
            if (this.currentVisualizer) {
                this.currentVisualizer.deactivate();
            }
            visualizer.activate();
            this.currentVisualizer = visualizer;
            this.currentId = id;
            this.isTransitioning = false;
        } else {
            // Animated transition
            await this.performTransition(visualizer, transition);
        }

        eventBus.emit(Events.VISUALIZER_CHANGE, {
            from: this.previousId,
            to: id,
            name: visualizer.name,
            transition
        });

        return true;
    }

    /**
     * Perform animated transition
     */
    async performTransition(newVisualizer, type) {
        const oldVisualizer = this.currentVisualizer;
        const duration = this.transitionDuration;
        const startTime = performance.now();

        // Activate new visualizer (but possibly invisible/faded)
        newVisualizer.activate();

        return new Promise(resolve => {
            const animate = () => {
                const elapsed = performance.now() - startTime;
                this.transitionProgress = Math.min(elapsed / duration, 1);

                // Apply transition effect
                this.applyTransition(oldVisualizer, newVisualizer, type, this.transitionProgress);

                if (this.transitionProgress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Transition complete
                    if (oldVisualizer) {
                        oldVisualizer.deactivate();
                    }
                    this.currentVisualizer = newVisualizer;
                    this.currentId = newVisualizer.id;
                    this.isTransitioning = false;
                    this.transitionProgress = 0;

                    // Reset any transition effects
                    this.resetTransitionEffects(newVisualizer);

                    resolve();
                }
            };

            animate();
        });
    }

    /**
     * Apply transition effect based on type
     */
    applyTransition(oldViz, newViz, type, progress) {
        switch (type) {
            case 'crossfade':
                this.applyCrossfade(oldViz, newViz, progress);
                break;
            case 'morph':
                this.applyMorph(oldViz, newViz, progress);
                break;
            case 'glitch':
                this.applyGlitch(oldViz, newViz, progress);
                break;
            default:
                this.applyCrossfade(oldViz, newViz, progress);
        }
    }

    /**
     * Crossfade transition
     */
    applyCrossfade(oldViz, newViz, progress) {
        // Fade out old
        if (oldViz && oldViz.container) {
            oldViz.container.traverse(obj => {
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => {
                            if (m.opacity !== undefined) m.opacity = 1 - progress;
                        });
                    } else if (obj.material.opacity !== undefined) {
                        obj.material.opacity = 1 - progress;
                    }
                }
            });
        }

        // Fade in new
        if (newViz && newViz.container) {
            newViz.container.traverse(obj => {
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => {
                            if (m.opacity !== undefined) m.opacity = progress;
                        });
                    } else if (obj.material.opacity !== undefined) {
                        obj.material.opacity = progress;
                    }
                }
            });
        }
    }

    /**
     * Morph transition (scale-based)
     */
    applyMorph(oldViz, newViz, progress) {
        const eased = this.easeInOutCubic(progress);

        // Scale down old
        if (oldViz && oldViz.container) {
            const scale = 1 - eased;
            oldViz.container.scale.setScalar(scale);
        }

        // Scale up new
        if (newViz && newViz.container) {
            const scale = eased;
            newViz.container.scale.setScalar(scale);
        }
    }

    /**
     * Glitch transition
     */
    applyGlitch(oldViz, newViz, progress) {
        const glitchIntensity = Math.sin(progress * Math.PI);

        // Apply random position offset during transition
        if (this.camera) {
            const originalPos = this.camera.userData.originalPosition || this.camera.position.clone();
            this.camera.userData.originalPosition = originalPos;

            if (progress < 1) {
                this.camera.position.x = originalPos.x + (Math.random() - 0.5) * glitchIntensity * 0.5;
                this.camera.position.y = originalPos.y + (Math.random() - 0.5) * glitchIntensity * 0.5;
            } else {
                this.camera.position.copy(originalPos);
            }
        }

        // Crossfade the actual visualizers
        this.applyCrossfade(oldViz, newViz, progress);
    }

    /**
     * Reset any temporary transition effects
     */
    resetTransitionEffects(visualizer) {
        // Reset opacity
        if (visualizer && visualizer.container) {
            visualizer.container.traverse(obj => {
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => {
                            if (m.opacity !== undefined) m.opacity = 1;
                        });
                    } else if (obj.material.opacity !== undefined) {
                        obj.material.opacity = 1;
                    }
                }
            });
            visualizer.container.scale.setScalar(1);
        }

        // Reset camera
        if (this.camera && this.camera.userData.originalPosition) {
            this.camera.position.copy(this.camera.userData.originalPosition);
            delete this.camera.userData.originalPosition;
        }
    }

    /**
     * Switch to next visualizer
     */
    next(transition = null) {
        const nextId = this.getNextId();
        if (nextId) {
            return this.switchTo(nextId, transition);
        }
        return false;
    }

    /**
     * Switch to previous visualizer
     */
    previous(transition = null) {
        const prevId = this.getPreviousId();
        if (prevId) {
            return this.switchTo(prevId, transition);
        }
        return false;
    }

    /**
     * Get next visualizer ID
     */
    getNextId() {
        if (this.visualizerList.length === 0) return null;

        const currentIndex = this.visualizerList.indexOf(this.currentId);
        const nextIndex = (currentIndex + 1) % this.visualizerList.length;
        return this.visualizerList[nextIndex];
    }

    /**
     * Get previous visualizer ID
     */
    getPreviousId() {
        if (this.visualizerList.length === 0) return null;

        const currentIndex = this.visualizerList.indexOf(this.currentId);
        const prevIndex = currentIndex <= 0 ? this.visualizerList.length - 1 : currentIndex - 1;
        return this.visualizerList[prevIndex];
    }

    /**
     * Update current visualizer
     */
    update(deltaTime, audioData) {
        this.audioData = audioData;

        if (this.currentVisualizer && this.currentVisualizer.isActive) {
            this.currentVisualizer.update(deltaTime, audioData);
        }

        // Also update previous during transitions
        if (this.isTransitioning && this.previousId) {
            const prevViz = this.visualizers.get(this.previousId);
            if (prevViz && prevViz.isActive) {
                prevViz.update(deltaTime, audioData);
            }
        }
    }

    /**
     * Handle beat for current visualizer
     */
    onBeat(intensity) {
        if (this.currentVisualizer) {
            this.currentVisualizer.onBeat(intensity);
        }
    }

    /**
     * Handle BPM update
     */
    onBPMUpdate(bpm, confidence) {
        if (this.currentVisualizer) {
            this.currentVisualizer.onBPMUpdate(bpm, confidence);
        }
    }

    /**
     * Handle resize
     */
    resize(width, height) {
        this.visualizers.forEach(viz => {
            if (viz.isInitialized) {
                viz.resize(width, height);
            }
        });
    }

    /**
     * Set global quality for all visualizers
     */
    setQuality(level) {
        this.globalQuality = level;
        this.visualizers.forEach(viz => {
            viz.setQuality(level);
        });

        eventBus.emit(Events.QUALITY_CHANGE, { level });
    }

    /**
     * Set transition type
     */
    setTransitionType(type) {
        this.transitionType = type;
    }

    /**
     * Set transition duration
     */
    setTransitionDuration(ms) {
        this.transitionDuration = Math.max(100, Math.min(3000, ms));
    }

    /**
     * Get list of registered visualizers
     */
    getVisualizerList() {
        return this.visualizerList.map(id => {
            const viz = this.visualizers.get(id);
            return viz ? viz.getInfo() : null;
        }).filter(Boolean);
    }

    /**
     * Get visualizer by ID
     */
    get(id) {
        return this.visualizers.get(id);
    }

    /**
     * Get current visualizer
     */
    getCurrent() {
        return this.currentVisualizer;
    }

    /**
     * Get current visualizer controls
     */
    getCurrentControls() {
        return this.currentVisualizer ? this.currentVisualizer.getControls() : {};
    }

    /**
     * Set control on current visualizer
     */
    setControl(name, value) {
        if (this.currentVisualizer) {
            this.currentVisualizer.setControl(name, value);
        }
    }

    /**
     * Easing function
     */
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Dispose of all visualizers
     */
    dispose() {
        this.visualizers.forEach(viz => {
            viz.dispose();
        });
        this.visualizers.clear();
        this.visualizerList = [];
        this.currentVisualizer = null;
        this.currentId = null;
    }

    /**
     * Get current visualizer ID
     */
    getCurrentId() {
        return this.currentId;
    }

    /**
     * Set auto-rotate for current visualizer
     */
    setAutoRotate(enabled) {
        if (this.currentVisualizer && typeof this.currentVisualizer.setAutoRotate === 'function') {
            this.currentVisualizer.setAutoRotate(enabled);
        }
        this.autoRotateEnabled = enabled;
    }

    /**
     * Get auto-rotate state
     */
    getAutoRotate() {
        return this.autoRotateEnabled || false;
    }

    /**
     * Set camera shake for current visualizer
     */
    setCameraShake(enabled) {
        if (this.currentVisualizer && typeof this.currentVisualizer.setCameraShake === 'function') {
            this.currentVisualizer.setCameraShake(enabled);
        }
        this.cameraShakeEnabled = enabled;
    }

    /**
     * Get camera shake state
     */
    getCameraShake() {
        return this.cameraShakeEnabled || false;
    }

    /**
     * Reset camera position
     */
    resetCamera() {
        // Reset camera to default position
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);
        this.camera.rotation.set(0, 0, 0);
    }
}

// Export singleton factory
export function createVisualizerManager(scene, camera, renderer) {
    return new VisualizerManager(scene, camera, renderer);
}

export default VisualizerManager;
