// MySpace Layout Grid Editor
// Drag-and-drop grid system with snaplines, column controls, z-index, and mobile breakpoints

(function() {
    'use strict';

    window.MySpaceLayoutEditor = {
        enabled: false,
        allowOverlap: true,
        draggedElement: null,
        snapThreshold: 10,
        gridSize: 20,
        snaplines: {
            vertical: [],
            horizontal: []
        },

        init: function() {
            console.log('[Layout Editor] Initializing...');
            this.createSnaplineElements();
            this.attachDragHandlers();
            this.updateFromProfile();
        },

        toggle: function(enable) {
            this.enabled = enable;
            const widgets = document.querySelectorAll('.widget, #profile-header, .profile-header, .profile-picture, .profile-banner, .contact-section, .stat-container, .profile-info');

            if (enable) {
                // Ensure view mode is disabled so editor controls are visible
                if (document.body.classList.contains('view-mode')) {
                    document.body.classList.remove('view-mode');
                }
                if (window.MySpace && window.MySpace.viewMode) {
                    window.MySpace.viewMode = false;
                    if (typeof window.MySpace.saveViewMode === 'function') {
                        window.MySpace.saveViewMode();
                    }
                    if (typeof window.MySpace.applyViewMode === 'function') {
                        window.MySpace.applyViewMode();
                    }
                }

                console.log('[Layout Editor] Enabled');
                console.log('[Layout Editor] Found', widgets.length, 'widgets');

                const container = document.getElementById('myspace-main');
                if (container) {
                    const containerRect = container.getBoundingClientRect();

                    widgets.forEach((widget, index) => {
                        console.log('[Layout Editor] Processing widget', index, widget.id || widget.className);

                        // Store original positioning for restoration later
                        if (!widget.dataset.originalPosition) {
                            widget.dataset.originalPosition = widget.style.position || '';
                            widget.dataset.originalLeft = widget.style.left || '';
                            widget.dataset.originalTop = widget.style.top || '';
                            widget.dataset.originalWidth = widget.style.width || '';
                            widget.dataset.originalHeight = widget.style.height || '';
                        }

                        // Set initial position before making editable (to prevent jumps)
                        if (!widget.style.position || widget.style.position !== 'absolute') {
                            const rect = widget.getBoundingClientRect();
                            const left = rect.left - containerRect.left;
                            const top = rect.top - containerRect.top;

                            widget.style.position = 'absolute';
                            widget.style.left = left + 'px';
                            widget.style.top = top + 'px';
                            widget.style.width = rect.width + 'px';
                            widget.style.height = rect.height + 'px';
                        }

                        widget.classList.add('layout-editable');
                        this.makeDraggable(widget);
                        this.addResizeHandles(widget);
                        this.addZIndexControls(widget);

                        // Make content fit container
                        this.makeContentFit(widget);
                    });
                }
                document.body.classList.add('layout-editor-active');
                console.log('[Layout Editor] All handles added');
            } else {
                console.log('[Layout Editor] Disabled');
                widgets.forEach(widget => {
                    widget.classList.remove('layout-editable');
                    this.removeDragHandlers(widget);
                    this.removeResizeHandles(widget);
                    this.removeZIndexControls(widget);
                    this.removeContentFit(widget);

                    // Only restore original positioning if the user hasn't customized the layout
                    // If they have absolute positioning with specific values, keep them
                    if (widget.dataset.originalPosition !== undefined) {
                        // Check if positions were modified from original
                        const hasCustomLayout = widget.style.position === 'absolute' &&
                                               (widget.style.left !== widget.dataset.originalLeft ||
                                                widget.style.top !== widget.dataset.originalTop);

                        // Only restore if no custom layout was created
                        if (!hasCustomLayout) {
                            widget.style.position = widget.dataset.originalPosition;
                            widget.style.left = widget.dataset.originalLeft;
                            widget.style.top = widget.dataset.originalTop;
                            widget.style.width = widget.dataset.originalWidth;
                            widget.style.height = widget.dataset.originalHeight;

                            // Clear dataset after restoring
                            delete widget.dataset.originalPosition;
                            delete widget.dataset.originalLeft;
                            delete widget.dataset.originalTop;
                            delete widget.dataset.originalWidth;
                            delete widget.dataset.originalHeight;
                        }
                    }
                });
                document.body.classList.remove('layout-editor-active');
                this.hideSnaplines();
            }
        },

        createSnaplineElements: function() {
            let container = document.getElementById('snapline-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'snapline-container';
                container.className = 'snapline-container';
                document.body.appendChild(container);
            }
            this.snaplineContainer = container;
        },

        showSnapline: function(type, position) {
            const line = document.createElement('div');
            line.className = `snapline snapline-${type}`;

            if (type === 'vertical') {
                line.style.left = position + 'px';
            } else {
                line.style.top = position + 'px';
            }

            this.snaplineContainer.appendChild(line);
            setTimeout(() => line.remove(), 100);
        },

        hideSnaplines: function() {
            if (this.snaplineContainer) {
                this.snaplineContainer.innerHTML = '';
            }
        },

        makeDraggable: function(element) {
            // Check if drag handle already exists
            if (element.querySelector('.drag-handle')) {
                return;
            }

            const dragHandle = document.createElement('div');
            dragHandle.className = 'drag-handle';
            dragHandle.innerHTML = '⋮⋮';
            dragHandle.title = 'Drag to move';
            element.appendChild(dragHandle);

            let isDragging = false;
            let startX, startY, startLeft, startTop;

            const onMouseDown = (e) => {
                if (!this.enabled) return;
                if (e.target !== dragHandle && !dragHandle.contains(e.target)) return;

                isDragging = true;
                this.draggedElement = element;

                const rect = element.getBoundingClientRect();
                const container = document.getElementById('myspace-main').getBoundingClientRect();

                startX = e.clientX;
                startY = e.clientY;

                // Get current position or use element's rendered position
                if (element.style.position === 'absolute' && element.style.left && element.style.top) {
                    startLeft = parseFloat(element.style.left);
                    startTop = parseFloat(element.style.top);
                } else {
                    startLeft = rect.left - container.left;
                    startTop = rect.top - container.top;
                    // Set initial position before dragging
                    element.style.position = 'absolute';
                    element.style.left = startLeft + 'px';
                    element.style.top = startTop + 'px';
                }

                element.classList.add('dragging');

                e.preventDefault();
            };

            const onMouseMove = (e) => {
                if (!isDragging) return;

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newLeft = startLeft + deltaX;
                let newTop = startTop + deltaY;

                // Snap to grid
                if (e.shiftKey) {
                    newLeft = Math.round(newLeft / this.gridSize) * this.gridSize;
                    newTop = Math.round(newTop / this.gridSize) * this.gridSize;
                }

                // Snap to other elements
                const snapResult = this.getSnapPosition(element, newLeft, newTop);
                newLeft = snapResult.left;
                newTop = snapResult.top;

                element.style.left = newLeft + 'px';
                element.style.top = newTop + 'px';

                // Show snaplines
                if (snapResult.snappedX) {
                    this.showSnapline('vertical', snapResult.snapX);
                }
                if (snapResult.snappedY) {
                    this.showSnapline('horizontal', snapResult.snapY);
                }
            };

            const onMouseUp = () => {
                if (isDragging) {
                    isDragging = false;
                    this.draggedElement = null;
                    element.classList.remove('dragging');
                    this.hideSnaplines();

                    // Resolve overlaps if not allowed
                    if (!this.allowOverlap) {
                        this.resolveOverlaps();
                    }

                    this.saveLayout();
                }
            };

            dragHandle.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            element._dragHandlers = { onMouseDown, onMouseMove, onMouseUp, dragHandle };
        },

        removeDragHandlers: function(element) {
            if (element._dragHandlers) {
                const { dragHandle, onMouseMove, onMouseUp } = element._dragHandlers;
                if (dragHandle && dragHandle.parentNode) {
                    dragHandle.remove();
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                delete element._dragHandlers;
            }
        },

        getSnapPosition: function(element, left, top) {
            const threshold = this.snapThreshold;
            const rect = { left, top, right: left + element.offsetWidth, bottom: top + element.offsetHeight };

            let snappedLeft = left;
            let snappedTop = top;
            let snappedX = false;
            let snappedY = false;
            let snapX = 0;
            let snapY = 0;

            const allWidgets = document.querySelectorAll('.layout-editable');

            allWidgets.forEach(widget => {
                if (widget === element) return;

                const otherRect = widget.getBoundingClientRect();
                const container = document.getElementById('myspace-main').getBoundingClientRect();
                const otherLeft = otherRect.left - container.left;
                const otherTop = otherRect.top - container.top;
                const otherRight = otherLeft + widget.offsetWidth;
                const otherBottom = otherTop + widget.offsetHeight;

                // Snap left edge to left edge
                if (Math.abs(rect.left - otherLeft) < threshold) {
                    snappedLeft = otherLeft;
                    snappedX = true;
                    snapX = otherLeft;
                }

                // Snap left edge to right edge
                if (Math.abs(rect.left - otherRight) < threshold) {
                    snappedLeft = otherRight;
                    snappedX = true;
                    snapX = otherRight;
                }

                // Snap right edge to right edge
                if (Math.abs(rect.right - otherRight) < threshold) {
                    snappedLeft = otherRight - element.offsetWidth;
                    snappedX = true;
                    snapX = otherRight;
                }

                // Snap top edge to top edge
                if (Math.abs(rect.top - otherTop) < threshold) {
                    snappedTop = otherTop;
                    snappedY = true;
                    snapY = otherTop;
                }

                // Snap top edge to bottom edge
                if (Math.abs(rect.top - otherBottom) < threshold) {
                    snappedTop = otherBottom;
                    snappedY = true;
                    snapY = otherBottom;
                }

                // Snap bottom edge to bottom edge
                if (Math.abs(rect.bottom - otherBottom) < threshold) {
                    snappedTop = otherBottom - element.offsetHeight;
                    snappedY = true;
                    snapY = otherBottom;
                }
            });

            return {
                left: snappedLeft,
                top: snappedTop,
                snappedX,
                snappedY,
                snapX,
                snapY
            };
        },

        addResizeHandles: function(element) {
            // Check if resize handle already exists
            if (element.querySelector('.resize-handle')) {
                return;
            }

            const handle = document.createElement('div');
            handle.className = 'resize-handle';
            handle.innerHTML = '◢';
            handle.title = 'Drag to resize';
            element.appendChild(handle);

            let isResizing = false;
            let startX, startY, startWidth, startHeight;

            const onMouseDown = (e) => {
                if (!this.enabled) return;
                isResizing = true;
                startX = e.clientX;
                startY = e.clientY;
                startWidth = element.offsetWidth;
                startHeight = element.offsetHeight;
                element.classList.add('resizing');
                e.preventDefault();
                e.stopPropagation();
            };

            const onMouseMove = (e) => {
                if (!isResizing) return;

                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newWidth = startWidth + deltaX;
                let newHeight = startHeight + deltaY;

                // Snap to grid
                if (e.shiftKey) {
                    newWidth = Math.round(newWidth / this.gridSize) * this.gridSize;
                    newHeight = Math.round(newHeight / this.gridSize) * this.gridSize;
                }

                // Get element-specific minimum sizes
                const minSizes = this.getMinimumSize(element);

                element.style.width = Math.max(minSizes.width, newWidth) + 'px';
                element.style.height = Math.max(minSizes.height, newHeight) + 'px';

                // Update content fit
                this.updateContentFit(element);
            };

            const onMouseUp = () => {
                if (isResizing) {
                    isResizing = false;
                    element.classList.remove('resizing');

                    // Resolve overlaps if not allowed
                    if (!this.allowOverlap) {
                        this.resolveOverlaps();
                    }

                    this.saveLayout();
                }
            };

            handle.addEventListener('mousedown', onMouseDown);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);

            element._resizeHandlers = { handle, onMouseMove, onMouseUp };
        },

        removeResizeHandles: function(element) {
            if (element._resizeHandlers) {
                const { handle, onMouseMove, onMouseUp } = element._resizeHandlers;
                if (handle && handle.parentNode) {
                    handle.remove();
                }
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                delete element._resizeHandlers;
            }
        },

        addZIndexControls: function(element) {
            // Check if z-index controls already exist
            if (element.querySelector('.zindex-controls')) {
                return;
            }

            const controls = document.createElement('div');
            controls.className = 'zindex-controls';

            const upBtn = document.createElement('button');
            upBtn.className = 'zindex-btn';
            upBtn.innerHTML = '▲';
            upBtn.title = 'Move forward';
            upBtn.onclick = (e) => {
                e.stopPropagation();
                this.changeZIndex(element, 1);
            };

            const downBtn = document.createElement('button');
            downBtn.className = 'zindex-btn';
            downBtn.innerHTML = '▼';
            downBtn.title = 'Move backward';
            downBtn.onclick = (e) => {
                e.stopPropagation();
                this.changeZIndex(element, -1);
            };

            const label = document.createElement('span');
            label.className = 'zindex-label';
            const currentZ = parseInt(element.style.zIndex) || 1;
            label.textContent = `Z: ${currentZ}`;

            controls.appendChild(upBtn);
            controls.appendChild(label);
            controls.appendChild(downBtn);
            element.appendChild(controls);

            element._zindexControls = controls;
        },

        removeZIndexControls: function(element) {
            if (element._zindexControls) {
                element._zindexControls.remove();
                delete element._zindexControls;
            }
        },

        changeZIndex: function(element, delta) {
            const currentZ = parseInt(element.style.zIndex) || 1;
            const newZ = Math.max(1, Math.min(100, currentZ + delta));
            element.style.zIndex = newZ;

            const label = element.querySelector('.zindex-label');
            if (label) {
                label.textContent = `Z: ${newZ}`;
            }

            this.saveLayout();
        },

        setColumnWidth: function(widgetId, percentage) {
            const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widget) {
                widget.style.width = percentage + '%';
                this.saveLayout();
            }
        },

        setMobileBreakpoint: function(widgetId, breakpoint, behavior) {
            const widget = document.querySelector(`[data-widget-id="${widgetId}"]`);
            if (widget) {
                widget.dataset.mobileBehavior = behavior;
                widget.dataset.mobileBreakpoint = breakpoint;
                this.saveLayout();
            }
        },

        saveLayout: function() {
            if (!window.MySpace || !this.enabled) return;

            const layout = {
                widgets: []
            };

            const widgets = document.querySelectorAll('.layout-editable');
            widgets.forEach((widget, index) => {
                const widgetId = widget.dataset.widgetId || `widget-${index}`;
                widget.dataset.widgetId = widgetId;

                layout.widgets.push({
                    id: widgetId,
                    className: widget.className.split(' ')[0],
                    position: {
                        left: widget.style.left,
                        top: widget.style.top
                    },
                    size: {
                        width: widget.style.width,
                        height: widget.style.height
                    },
                    zIndex: parseInt(widget.style.zIndex) || 1,
                    mobile: {
                        breakpoint: widget.dataset.mobileBreakpoint || '768px',
                        behavior: widget.dataset.mobileBehavior || 'stack'
                    }
                });
            });

            if (!window.MySpace.profile.layout) {
                window.MySpace.profile.layout = {};
            }
            window.MySpace.profile.layout.grid = layout;

            console.log('[Layout Editor] Saved layout:', layout);
            window.MySpace.saveProfile();
        },

        updateFromProfile: function() {
            if (!window.MySpace || !window.MySpace.profile.layout || !window.MySpace.profile.layout.grid) {
                return;
            }

            const layout = window.MySpace.profile.layout.grid;
            console.log('[Layout Editor] Loading layout:', layout);

            layout.widgets.forEach(widgetData => {
                const widget = document.querySelector(`[data-widget-id="${widgetData.id}"]`)
                    || document.querySelector(`.${widgetData.className}`);

                if (widget) {
                    widget.dataset.widgetId = widgetData.id;

                    if (widgetData.position.left) {
                        widget.style.position = 'absolute';
                        widget.style.left = widgetData.position.left;
                        widget.style.top = widgetData.position.top;
                    }

                    if (widgetData.size.width) {
                        widget.style.width = widgetData.size.width;
                    }
                    if (widgetData.size.height) {
                        widget.style.height = widgetData.size.height;
                    }

                    widget.style.zIndex = widgetData.zIndex;

                    if (widgetData.mobile) {
                        widget.dataset.mobileBreakpoint = widgetData.mobile.breakpoint;
                        widget.dataset.mobileBehavior = widgetData.mobile.behavior;
                    }
                }
            });
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
                delete widget.dataset.widgetId;
                delete widget.dataset.mobileBreakpoint;
                delete widget.dataset.mobileBehavior;
            });

            if (window.MySpace && window.MySpace.profile.layout) {
                delete window.MySpace.profile.layout.grid;
                window.MySpace.saveProfile();
            }

            console.log('[Layout Editor] Layout reset');
        },

        attachDragHandlers: function() {
            // Will be attached when editor is enabled
        },

        getMinimumSize: function(element) {
            // Define minimum sizes based on element type - kept compact for tighter layouts
            const id = element.id || '';
            const classList = element.classList;

            // Music widget needs space for controls
            if (id === 'music-widget' || classList.contains('music-player')) {
                return { width: 250, height: 180 };
            }

            // Picture wall needs space for images
            if (id === 'picture-wall-widget' || classList.contains('picture-wall')) {
                return { width: 280, height: 220 };
            }

            // Comments widget needs space for input
            if (id === 'comments-widget' || classList.contains('comments-section')) {
                return { width: 280, height: 180 };
            }

            // Profile header/banner
            if (id === 'profile-header' || classList.contains('profile-header')) {
                return { width: 350, height: 120 };
            }

            // Contact section with buttons
            if (id === 'contact-widget' || classList.contains('contact-section')) {
                return { width: 180, height: 160 };
            }

            // Stats widget
            if (id === 'stats-widget' || classList.contains('stat-container')) {
                return { width: 180, height: 130 };
            }

            // Top friends
            if (id === 'top-friends-widget' || classList.contains('top-friends')) {
                return { width: 280, height: 180 };
            }

            // Default minimum - more compact
            return { width: 120, height: 80 };
        },

        makeContentFit: function(element) {
            // Store original overflow settings
            element.dataset.originalOverflow = element.style.overflow || '';
            element.dataset.originalOverflowX = element.style.overflowX || '';
            element.dataset.originalOverflowY = element.style.overflowY || '';

            // Make content fit and scroll within container
            element.style.overflow = 'auto';

            // Find widget content and make it fit
            const content = element.querySelector('.widget-content, .profile-info, .banner-content, .stat-item');
            if (content) {
                content.style.height = '100%';
                content.style.overflow = 'auto';
            }

            // For music widget, ensure controls remain visible
            if (element.id === 'music-widget') {
                const audioControls = element.querySelector('.audio-controls');
                if (audioControls) {
                    audioControls.style.position = 'relative';
                    audioControls.style.flexShrink = '0';
                }
            }
        },

        updateContentFit: function(element) {
            // Update content height when element is resized
            const content = element.querySelector('.widget-content, .profile-info, .banner-content, .stat-item');
            if (content) {
                content.style.height = '100%';
            }
        },

        removeContentFit: function(element) {
            // Restore original overflow settings
            if (element.dataset.originalOverflow !== undefined) {
                element.style.overflow = element.dataset.originalOverflow;
                delete element.dataset.originalOverflow;
            }
            if (element.dataset.originalOverflowX !== undefined) {
                element.style.overflowX = element.dataset.originalOverflowX;
                delete element.dataset.originalOverflowX;
            }
            if (element.dataset.originalOverflowY !== undefined) {
                element.style.overflowY = element.dataset.originalOverflowY;
                delete element.dataset.originalOverflowY;
            }

            // Remove content fit
            const content = element.querySelector('.widget-content, .profile-info, .banner-content, .stat-item');
            if (content) {
                content.style.height = '';
                content.style.overflow = '';
            }
        },

        resolveOverlaps: function() {
            const widgets = Array.from(document.querySelectorAll('.layout-editable'));
            if (widgets.length < 2) return;

            console.log('[Layout Editor] Resolving overlaps...');

            const container = document.getElementById('myspace-main');
            const containerRect = container.getBoundingClientRect();

            // Get all widget bounds
            const bounds = widgets.map(widget => {
                const rect = widget.getBoundingClientRect();
                return {
                    element: widget,
                    left: parseFloat(widget.style.left) || (rect.left - containerRect.left),
                    top: parseFloat(widget.style.top) || (rect.top - containerRect.top),
                    width: widget.offsetWidth,
                    height: widget.offsetHeight
                };
            });

            // Very minimal gap between elements for tight layouts
            const gap = 2; // Minimal gap for compact layouts

            // Check for overlaps and reposition with minimal movement
            for (let i = 0; i < bounds.length; i++) {
                for (let j = i + 1; j < bounds.length; j++) {
                    const a = bounds[i];
                    const b = bounds[j];

                    // Check if rectangles overlap significantly
                    if (this.isOverlapping(a, b)) {
                        console.log('[Layout Editor] Significant overlap detected, repositioning...');

                        // Try to position to the right first (horizontal layout)
                        const rightPos = a.left + a.width + gap;
                        const canFitRight = rightPos + b.width <= containerRect.width;

                        if (canFitRight) {
                            // Move to the right
                            b.element.style.position = 'absolute';
                            b.element.style.left = rightPos + 'px';
                            b.left = rightPos;
                        } else {
                            // Move below with minimal gap
                            const newTop = a.top + a.height + gap;
                            b.element.style.position = 'absolute';
                            b.element.style.top = newTop + 'px';
                            b.top = newTop;
                        }
                    }
                }
            }
        },

        isOverlapping: function(a, b) {
            // Add tolerance margin - only consider it overlapping if there's significant overlap
            const tolerance = 30; // Allow up to 30px of overlap before triggering repositioning (more lenient)

            return !(
                a.left + a.width - tolerance <= b.left ||
                b.left + b.width - tolerance <= a.left ||
                a.top + a.height - tolerance <= b.top ||
                b.top + b.height - tolerance <= a.top
            );
        }
    };

    // Initialize when DOM is ready
    window.addEventListener('DOMContentLoaded', function() {
        if (window.MySpaceLayoutEditor) {
            window.MySpaceLayoutEditor.init();
        }
    });

})();
