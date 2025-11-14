// OurSpace Layout Grid Editor - Simplified Version
// Standard drag from center, resize from edges, Shift for symmetrical resize

(function() {
    'use strict';

    window.OurSpaceLayoutEditor = {
        enabled: false,
        allowOverlap: true, // Always true - overlapping is always allowed
        isMobile: false,
        resizeEdgeSize: 10, // Pixels from edge to trigger resize

        init: function() {
            console.log('[Layout Editor] Initializing...');
            this.detectMobile();
            this.updateFromProfile();

            // Re-detect on resize
            window.addEventListener('resize', () => {
                this.detectMobile();
                if (this.enabled) {
                    this.adaptUIForDevice();
                }
            });
        },

        detectMobile: function() {
            this.isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
            console.log('[Layout Editor] Mobile detected:', this.isMobile);
        },

        adaptUIForDevice: function() {
            if (this.isMobile) {
                document.body.classList.add('layout-editor-mobile');
            } else {
                document.body.classList.remove('layout-editor-mobile');
            }
        },

        toggle: function(enable) {
            this.enabled = enable;
            const widgets = document.querySelectorAll('.widget, #profile-header, .profile-header, .profile-picture, .profile-pic-container, .profile-banner, .contact-section, .stat-container, .profile-info');

            if (enable) {
                // Ensure view mode is disabled
                if (document.body.classList.contains('view-mode')) {
                    document.body.classList.remove('view-mode');
                }
                if (window.OurSpace && window.OurSpace.viewMode) {
                    window.OurSpace.viewMode = false;
                    if (typeof window.OurSpace.saveViewMode === 'function') {
                        window.OurSpace.saveViewMode();
                    }
                    if (typeof window.OurSpace.applyViewMode === 'function') {
                        window.OurSpace.applyViewMode();
                    }
                }

                console.log('[Layout Editor] Enabled - widgets stay where they are');

                // Simply make widgets interactive WITHOUT moving them
                widgets.forEach((widget) => {
                    widget.classList.add('layout-editable');
                    this.makeInteractive(widget);
                    this.addZIndexControls(widget);
                });

                document.body.classList.add('layout-editor-active');
                this.adaptUIForDevice();
            } else {
                console.log('[Layout Editor] Disabled');
                widgets.forEach(widget => {
                    widget.classList.remove('layout-editable');
                    this.removeInteractive(widget);
                    this.removeZIndexControls(widget);
                });
                document.body.classList.remove('layout-editor-active');
            }
        },

        makeInteractive: function(element) {
            const onMouseDown = (e) => {
                // Allow dragging from anywhere on the widget, not just the widget itself
                // Skip only if clicking on interactive child elements like buttons or inputs
                const target = e.target;
                const tagName = target.tagName.toLowerCase();
                const isInteractiveChild = (
                    tagName === 'button' ||
                    tagName === 'input' ||
                    tagName === 'textarea' ||
                    tagName === 'select' ||
                    tagName === 'a' ||
                    target.classList.contains('z-btn')
                );

                if (isInteractiveChild) {
                    return; // Don't interfere with buttons, inputs, etc.
                }

                e.preventDefault();
                e.stopPropagation();

                const container = document.getElementById('ourspace-main');
                const containerRect = container.getBoundingClientRect();
                const rect = element.getBoundingClientRect();

                const edgeInfo = this.isNearEdge(element, e);

                if (edgeInfo.anyEdge) {
                    // Start resizing
                    this.startResize(element, e, edgeInfo, containerRect);
                } else {
                    // Start dragging
                    this.startDrag(element, e, containerRect);
                }
            };

            const onMouseMove = (e) => {
                if (!this.enabled) return;

                const edgeInfo = this.isNearEdge(element, e);

                // Update cursor based on edge proximity
                if (edgeInfo.anyEdge) {
                    element.style.cursor = this.getResizeCursor(edgeInfo);
                } else {
                    element.style.cursor = 'move';
                }
            };

            element.addEventListener('mousedown', onMouseDown);
            element.addEventListener('mousemove', onMouseMove);

            element._interactiveHandlers = { onMouseDown, onMouseMove };
        },

        isNearEdge: function(element, e) {
            const rect = element.getBoundingClientRect();
            const edge = this.resizeEdgeSize;

            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const nearLeft = x < edge;
            const nearRight = x > rect.width - edge;
            const nearTop = y < edge;
            const nearBottom = y > rect.height - edge;

            return {
                left: nearLeft,
                right: nearRight,
                top: nearTop,
                bottom: nearBottom,
                anyEdge: nearLeft || nearRight || nearTop || nearBottom
            };
        },

        getResizeCursor: function(edgeInfo) {
            if ((edgeInfo.top && edgeInfo.left) || (edgeInfo.bottom && edgeInfo.right)) {
                return 'nwse-resize';
            }
            if ((edgeInfo.top && edgeInfo.right) || (edgeInfo.bottom && edgeInfo.left)) {
                return 'nesw-resize';
            }
            if (edgeInfo.left || edgeInfo.right) {
                return 'ew-resize';
            }
            if (edgeInfo.top || edgeInfo.bottom) {
                return 'ns-resize';
            }
            return 'move';
        },

        startDrag: function(element, e, containerRect) {
            // Get current position - if not absolute positioned, make it absolute at current location first
            if (element.style.position !== 'absolute') {
                const rect = element.getBoundingClientRect();
                const left = rect.left - containerRect.left;
                const top = rect.top - containerRect.top;

                element.style.position = 'absolute';
                element.style.left = left + 'px';
                element.style.top = top + 'px';
                element.style.width = rect.width + 'px';
                element.style.height = rect.height + 'px';
                element.style.margin = '0';
            }

            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseFloat(element.style.left) || 0;
            const startTop = parseFloat(element.style.top) || 0;

            element.classList.add('dragging');

            const onMouseMove = (e) => {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;

                // No snapping - just move freely, overlapping is always allowed
                element.style.left = newLeft + 'px';
                element.style.top = newTop + 'px';
            };

            const onMouseUp = () => {
                element.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                this.saveLayout();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        },

        startResize: function(element, e, edgeInfo, containerRect) {
            // Get current position - if not absolute positioned, make it absolute at current location first
            if (element.style.position !== 'absolute') {
                const rect = element.getBoundingClientRect();
                const left = rect.left - containerRect.left;
                const top = rect.top - containerRect.top;

                element.style.position = 'absolute';
                element.style.left = left + 'px';
                element.style.top = top + 'px';
                element.style.width = rect.width + 'px';
                element.style.height = rect.height + 'px';
                element.style.margin = '0';
            }

            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseFloat(element.style.left) || 0;
            const startTop = parseFloat(element.style.top) || 0;
            const startWidth = element.offsetWidth;
            const startHeight = element.offsetHeight;
            const isShiftKey = e.shiftKey;

            element.classList.add('resizing');

            const onMouseMove = (e) => {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;
                const shiftPressed = e.shiftKey || isShiftKey;

                let newLeft = startLeft;
                let newTop = startTop;
                let newWidth = startWidth;
                let newHeight = startHeight;

                // Resize from edges
                if (edgeInfo.right) {
                    newWidth = startWidth + deltaX;
                    if (shiftPressed && edgeInfo.left === false) {
                        // Symmetrical horizontal resize
                        newLeft = startLeft - deltaX / 2;
                        newWidth = startWidth + deltaX;
                    }
                }
                if (edgeInfo.left) {
                    newLeft = startLeft + deltaX;
                    newWidth = startWidth - deltaX;
                    if (shiftPressed && edgeInfo.right === false) {
                        // Symmetrical horizontal resize
                        newWidth = startWidth - deltaX * 2;
                    }
                }
                if (edgeInfo.bottom) {
                    newHeight = startHeight + deltaY;
                    if (shiftPressed && edgeInfo.top === false) {
                        // Symmetrical vertical resize
                        newTop = startTop - deltaY / 2;
                        newHeight = startHeight + deltaY;
                    }
                }
                if (edgeInfo.top) {
                    newTop = startTop + deltaY;
                    newHeight = startHeight - deltaY;
                    if (shiftPressed && edgeInfo.bottom === false) {
                        // Symmetrical vertical resize
                        newHeight = startHeight - deltaY * 2;
                    }
                }

                // Apply min sizes
                if (newWidth < 100) newWidth = 100;
                if (newHeight < 50) newHeight = 50;

                element.style.left = newLeft + 'px';
                element.style.top = newTop + 'px';
                element.style.width = newWidth + 'px';
                element.style.height = newHeight + 'px';
            };

            const onMouseUp = () => {
                element.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                this.saveLayout();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        },

        removeInteractive: function(element) {
            if (element._interactiveHandlers) {
                const { onMouseDown, onMouseMove } = element._interactiveHandlers;
                element.removeEventListener('mousedown', onMouseDown);
                element.removeEventListener('mousemove', onMouseMove);
                delete element._interactiveHandlers;
            }
            element.style.cursor = '';
        },

        addZIndexControls: function(element) {
            if (element.querySelector('.zindex-controls')) {
                return;
            }

            const controls = document.createElement('div');
            controls.className = 'zindex-controls';
            controls.innerHTML = `
                <button class="z-btn z-up" title="Bring Forward">▲</button>
                <button class="z-btn z-down" title="Send Backward">▼</button>
            `;

            const zUp = controls.querySelector('.z-up');
            const zDown = controls.querySelector('.z-down');

            zUp.addEventListener('click', (e) => {
                e.stopPropagation();
                const current = parseInt(element.style.zIndex) || 0;
                element.style.zIndex = current + 1;
                this.saveLayout();
            });

            zDown.addEventListener('click', (e) => {
                e.stopPropagation();
                const current = parseInt(element.style.zIndex) || 0;
                element.style.zIndex = Math.max(0, current - 1);
                this.saveLayout();
            });

            element.appendChild(controls);
        },

        removeZIndexControls: function(element) {
            const controls = element.querySelector('.zindex-controls');
            if (controls) {
                controls.remove();
            }
        },

        saveLayout: function() {
            const layout = [];
            const widgets = document.querySelectorAll('.layout-editable');

            widgets.forEach(widget => {
                layout.push({
                    id: widget.id,
                    left: widget.style.left,
                    top: widget.style.top,
                    width: widget.style.width,
                    height: widget.style.height,
                    zIndex: widget.style.zIndex || '0'
                });
            });

            if (window.OurSpace && window.OurSpace.profile) {
                if (!window.OurSpace.profile.layout) {
                    window.OurSpace.profile.layout = {};
                }
                window.OurSpace.profile.layout.grid = layout;
            }

            console.log('[Layout Editor] Saved layout:', layout);
        },

        resetLayout: function() {
            if (!confirm('Reset all widgets to default positions?')) {
                return;
            }

            const widgets = document.querySelectorAll('.layout-editable');
            widgets.forEach(widget => {
                widget.style.position = '';
                widget.style.left = '';
                widget.style.top = '';
                widget.style.width = '';
                widget.style.height = '';
                widget.style.zIndex = '';
            });

            if (window.OurSpace && window.OurSpace.profile && window.OurSpace.profile.layout) {
                window.OurSpace.profile.layout.grid = [];
            }

            console.log('[Layout Editor] Layout reset');
        },

        updateFromProfile: function() {
            if (!window.OurSpace || !window.OurSpace.profile || !window.OurSpace.profile.layout) {
                return;
            }

            const layout = window.OurSpace.profile.layout.grid;
            if (!layout || !Array.isArray(layout)) {
                return;
            }

            layout.forEach(item => {
                const widget = document.getElementById(item.id);
                if (widget) {
                    widget.style.position = 'absolute';
                    widget.style.left = item.left;
                    widget.style.top = item.top;
                    widget.style.width = item.width;
                    widget.style.height = item.height;
                    widget.style.zIndex = item.zIndex || '0';
                }
            });
        }
    };

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        window.OurSpaceLayoutEditor.init();
    });
})();
