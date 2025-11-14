// OurSpace Images - Picture Wall and Image Management

(function() {
    'use strict';

    window.addEventListener('DOMContentLoaded', function() {
        initImages();
    });

    // Reload images when content is loaded/reloaded
    window.addEventListener('ourspace:contentLoaded', function() {
        console.log('[Images] Content loaded event received, reloading picture grid');
        loadPictureGrid();
    });

    let picturesReorderMode = false;

    function initImages() {
        console.log("[Images] Initializing picture wall...");

        // Picture upload
        setupPictureUpload();

        // Grid columns control
        setupGridColumns();

        // Grid rows control
        setupGridRows();

        // Frame style control
        setupPictureFrameStyleControl();

        // Reorder button
        setupPictureReorder();

        // Load existing pictures
        loadPictureGrid();

        // Resize grid to match rows/columns
        resizePictureGrid();

        // Lightbox
        setupLightbox();

        console.log("[Images] Initialization complete");
    }

    function setupPictureReorder() {
        const reorderBtn = document.getElementById('pictures-reorder-btn');
        if (reorderBtn) {
            reorderBtn.addEventListener('click', function() {
                picturesReorderMode = !picturesReorderMode;
                this.textContent = picturesReorderMode ? 'Done' : 'Reorder';
                this.style.background = picturesReorderMode ? 'rgba(0, 255, 255, 0.2)' : '';
                loadPictureGrid();
            });
        }
    }

    // Picture Upload
    function setupPictureUpload() {
        const pictureUpload = document.getElementById('picture-upload');

        if (pictureUpload) {
            pictureUpload.addEventListener('change', async function() {
                const files = Array.from(this.files);

                if (files.length === 0) return;

                for (const file of files) {
                    if (file.type.startsWith('image/')) {
                        const caption = prompt(`Caption for ${file.name}:`, '');

                        try {
                            // Upload to server
                            const formData = new FormData();
                            formData.append('file', file);
                            formData.append('type', 'picture');

                            const response = await fetch('/api/ourspace/upload', {
                                method: 'POST',
                                body: formData
                            });

                            if (response.ok) {
                                const data = await response.json();
                                const image = {
                                    id: Date.now() + Math.random(),
                                    url: data.url,
                                    caption: caption || '',
                                    order: window.OurSpace.profile.widgets.pictureWall.images.length,
                                    frameStyle: window.OurSpace.profile.widgets.pictureWall.frameStyle || 'classic',
                                    position: { x: 50, y: 50 }
                                };

                                window.OurSpace.profile.widgets.pictureWall.images.push(image);
                                await // Auto-save removed - only save when user clicks Save Profile button
                                loadPictureGrid();
                            } else {
                                console.error('[Images] Failed to upload image:', file.name);
                                alert(`Failed to upload ${file.name}`);
                            }
                        } catch (e) {
                            console.error('[Images] Error uploading image:', e);
                            alert(`Error uploading ${file.name}`);
                        }
                    }
                }

                // Reset input
                this.value = '';
            });
        }
    }

    // Grid Columns Control
    function setupGridColumns() {
        const gridColumns = document.getElementById('grid-columns');
        const pictureGrid = document.getElementById('picture-grid');

        if (gridColumns && pictureGrid) {
            gridColumns.value = window.OurSpace.profile.widgets.pictureWall.columns;

            gridColumns.addEventListener('change', function() {
                const columns = parseInt(this.value);
                window.OurSpace.profile.widgets.pictureWall.columns = columns;
                pictureGrid.dataset.columns = columns;
                resizePictureGrid();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }
    }

    // Grid Rows Control
    function setupGridRows() {
        const gridRows = document.getElementById('grid-rows');
        const pictureGrid = document.getElementById('picture-grid');

        if (gridRows && pictureGrid) {
            // Initialize rows if not set
            if (!window.OurSpace.profile.widgets.pictureWall.rows) {
                window.OurSpace.profile.widgets.pictureWall.rows = 4;
            }
            gridRows.value = window.OurSpace.profile.widgets.pictureWall.rows;

            gridRows.addEventListener('change', function() {
                const rows = parseInt(this.value);
                window.OurSpace.profile.widgets.pictureWall.rows = rows;
                pictureGrid.dataset.rows = rows;
                resizePictureGrid();
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }
    }

    // Resize picture grid based on rows and columns
    function resizePictureGrid() {
        const pictureGrid = document.getElementById('picture-grid');
        if (!pictureGrid) return;

        const columns = window.OurSpace.profile.widgets.pictureWall.columns || 4;
        const rows = window.OurSpace.profile.widgets.pictureWall.rows || 4;

        // Calculate aspect ratio - base size per cell is approximately 150px
        const cellSize = 150;
        const gap = 10;

        // Calculate dimensions including gaps
        const width = (columns * cellSize) + ((columns - 1) * gap);
        const height = (rows * cellSize) + ((rows - 1) * gap);

        console.log(`[Images] Resizing grid to ${columns}x${rows} (${width}px x ${height}px)`);

        // Apply to the parent widget if it has layout positioning
        const widget = pictureGrid.closest('.widget');
        if (widget && widget.style.position === 'absolute') {
            // Store old dimensions to calculate offset
            const oldWidth = parseInt(widget.style.width) || width;
            const oldHeight = parseInt(widget.style.height) || height;

            // Set new dimensions
            widget.style.width = width + 'px';
            widget.style.height = height + 'px';

            // Check for overlaps with other widgets if layout editor is available
            if (window.OurSpaceLayoutEditor && window.OurSpaceLayoutEditor.enabled) {
                preventWidgetOverlap(widget, oldWidth, oldHeight, width, height);
            }
        }
    }

    // Prevent widget overlap by moving conflicting widgets
    function preventWidgetOverlap(resizedWidget, oldWidth, oldHeight, newWidth, newHeight) {
        const resizedRect = resizedWidget.getBoundingClientRect();
        const allWidgets = document.querySelectorAll('.widget');

        const widthDelta = newWidth - oldWidth;
        const heightDelta = newHeight - oldHeight;

        // Only proceed if grid is growing
        if (widthDelta <= 0 && heightDelta <= 0) return;

        allWidgets.forEach(widget => {
            if (widget === resizedWidget) return;
            if (widget.style.position !== 'absolute') return;

            const widgetRect = widget.getBoundingClientRect();

            // Check if this widget would overlap with the new size
            const wouldOverlap = !(
                widgetRect.right < resizedRect.left ||
                widgetRect.left > resizedRect.right + widthDelta ||
                widgetRect.bottom < resizedRect.top ||
                widgetRect.top > resizedRect.bottom + heightDelta
            );

            if (wouldOverlap) {
                // Move widget down and/or right to avoid overlap
                const currentLeft = parseInt(widget.style.left) || 0;
                const currentTop = parseInt(widget.style.top) || 0;

                // If widget is to the right, push it further right
                if (widgetRect.left >= resizedRect.left && widthDelta > 0) {
                    widget.style.left = (currentLeft + widthDelta) + 'px';
                    console.log(`[Images] Moved widget right by ${widthDelta}px to prevent overlap`);
                }

                // If widget is below, push it further down
                if (widgetRect.top >= resizedRect.top && heightDelta > 0) {
                    widget.style.top = (currentTop + heightDelta) + 'px';
                    console.log(`[Images] Moved widget down by ${heightDelta}px to prevent overlap`);
                }
            }
        });
    }

    function setupPictureFrameStyleControl() {
        const frameSelect = document.getElementById('picture-frame-style');
        if (!frameSelect) return;

        if (!window.OurSpace.profile.widgets.pictureWall.frameStyle) {
            window.OurSpace.profile.widgets.pictureWall.frameStyle = 'classic';
        }
        const current = window.OurSpace.profile.widgets.pictureWall.frameStyle || 'classic';
        frameSelect.value = current;

        frameSelect.addEventListener('change', () => {
            const style = frameSelect.value || 'classic';
            window.OurSpace.profile.widgets.pictureWall.frameStyle = style;
            window.OurSpace.profile.widgets.pictureWall.images.forEach(img => {
                img.frameStyle = style;
            });
            // Auto-save removed - only save when user clicks Save Profile button
            loadPictureGrid();
        });
    }

    // Load Picture Grid
    function loadPictureGrid() {
        const pictureGrid = document.getElementById('picture-grid');
        if (!pictureGrid) return;

        if (!window.OurSpace.profile.widgets.pictureWall.frameStyle) {
            window.OurSpace.profile.widgets.pictureWall.frameStyle = 'classic';
        }

        const images = window.OurSpace.profile.widgets.pictureWall.images;

        // Sort by order
        images.sort((a, b) => a.order - b.order);

        pictureGrid.innerHTML = '';

        if (images.length === 0) {
            pictureGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; opacity: 0.6;">No pictures yet. Click "Add Photos" to get started!</div>';
            return;
        }

        images.forEach((image, index) => {
            const position = ensurePicturePosition(image);
            const frameStyle = sanitizeFrameStyle(image.frameStyle || window.OurSpace.profile.widgets.pictureWall.frameStyle || 'classic');
            image.frameStyle = frameStyle;
            const pictureItem = document.createElement('div');
            pictureItem.className = 'picture-item frame-' + frameStyle;
            if (picturesReorderMode) {
                pictureItem.classList.add('reorder-mode');
            }
            pictureItem.dataset.frameStyle = frameStyle;
            pictureItem.dataset.id = image.id;
            pictureItem.dataset.index = index;
            pictureItem.draggable = picturesReorderMode; // Only draggable in reorder mode

            // Build HTML based on mode
            let buttonsHTML = '';
            if (!picturesReorderMode) {
                buttonsHTML = `
                    <button class="frame-btn" title="Adjust framing">Frame</button>
                    <button class="delete-btn" title="Delete">x</button>
                `;
            }

            pictureItem.innerHTML = `
                <img src="${image.url}" alt="${escapeHtml(image.caption)}" loading="lazy" decoding="async" style="object-position: ${position.x}% ${position.y}%">
                ${buttonsHTML}
                ${image.caption ? `<div class="caption">${escapeHtml(image.caption)}</div>` : ''}
            `;

            // Click to view in lightbox (not in reorder mode)
            const img = pictureItem.querySelector('img');
            if (img && !picturesReorderMode) {
                img.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openLightbox(image.url, image.caption);
                });
            }

            // Delete button
            if (!picturesReorderMode) {
                const deleteBtn = pictureItem.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (confirm('Delete this picture?')) {
                            deletePicture(image.id);
                        }
                    });
                }

                const frameBtn = pictureItem.querySelector('.frame-btn');
                if (frameBtn) {
                    frameBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (document.body.classList.contains('view-mode')) {
                            alert('Switch to Customize mode to adjust framing.');
                            return;
                        }
                        const isActive = pictureItem.classList.toggle('picture-framing');
                        pictureItem.draggable = !isActive;
                        frameBtn.textContent = isActive ? 'Done' : 'Frame';
                        if (!isActive) {
                            // Auto-save removed - only save when user clicks Save Profile button
                        }
                    });
                }

                if (img && window.OurSpace && typeof window.OurSpace.createFrameDrag === 'function') {
                    window.OurSpace.createFrameDrag(img, {
                        isActive: () => pictureItem.classList.contains('picture-framing'),
                        get: () => ensurePicturePosition(image),
                        set: pos => {
                            const state = ensurePicturePosition(image);
                            state.x = pos.x;
                            state.y = pos.y;
                        },
                        apply: (x, y) => {
                            img.style.objectPosition = `${x}% ${y}%`;
                        },
                        ignoreSelector: '.delete-btn, .frame-btn',
                        onSave: () => { /* Auto-save removed */ }
                    });
                }

                // Double-click caption to edit
                const caption = pictureItem.querySelector('.caption');
                if (caption) {
                    caption.addEventListener('dblclick', function(e) {
                        e.stopPropagation();
                        editCaption(image.id);
                    });
                }
            }

            // Drag and drop for reordering (only in reorder mode)
            if (picturesReorderMode) {
                pictureItem.addEventListener('dragstart', handleDragStart);
                pictureItem.addEventListener('dragover', handleDragOver);
                pictureItem.addEventListener('drop', handleDrop);
                pictureItem.addEventListener('dragend', handleDragEnd);
            }

            pictureGrid.appendChild(pictureItem);
        });
    }

    // Delete Picture
    function deletePicture(id) {
        window.OurSpace.profile.widgets.pictureWall.images =
            window.OurSpace.profile.widgets.pictureWall.images.filter(img => img.id !== id);

        // Reorder
        window.OurSpace.profile.widgets.pictureWall.images.forEach((img, index) => {
            img.order = index;
        });

        // Auto-save removed - only save when user clicks Save Profile button
        loadPictureGrid();
    }

    // Edit Caption
    function editCaption(id) {
        const image = window.OurSpace.profile.widgets.pictureWall.images.find(img => img.id === id);
        if (!image) return;

        const newCaption = prompt('Edit caption:', image.caption);
        if (newCaption !== null) {
            image.caption = newCaption;
            // Auto-save removed - only save when user clicks Save Profile button
            loadPictureGrid();
        }
    }

    // Drag and Drop for Reordering
    let draggedElement = null;
    let draggedIndex = null;

    function handleDragStart(e) {
        draggedElement = this;
        draggedIndex = parseInt(this.dataset.index);
        this.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        e.dataTransfer.dropEffect = 'move';

        this.style.border = '3px dashed #00ffff';
        return false;
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }

        this.style.border = '';

        if (draggedElement !== this) {
            const targetIndex = parseInt(this.dataset.index);

            // Reorder images
            const images = window.OurSpace.profile.widgets.pictureWall.images;
            const [movedImage] = images.splice(draggedIndex, 1);
            images.splice(targetIndex, 0, movedImage);

            // Update order
            images.forEach((img, index) => {
                img.order = index;
            });

            // Auto-save removed - only save when user clicks Save Profile button
            loadPictureGrid();
        }

        return false;
    }

    function handleDragEnd(e) {
        this.style.opacity = '1';

        const items = document.querySelectorAll('.picture-item');
        items.forEach(item => {
            item.style.border = '';
        });
    }

    // Lightbox
    function setupLightbox() {
        const lightbox = document.getElementById('lightbox');
        const lightboxClose = lightbox ? lightbox.querySelector('.lightbox-close') : null;

        if (lightboxClose) {
            lightboxClose.addEventListener('click', function() {
                closeLightbox();
            });
        }

        if (lightbox) {
            lightbox.addEventListener('click', function(e) {
                if (e.target === lightbox) {
                    closeLightbox();
                }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeLightbox();
            }
        });
    }

    function openLightbox(imageUrl, caption) {
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');
        const lightboxCaption = document.getElementById('lightbox-caption');

        if (lightbox && lightboxImg) {
            lightboxImg.src = imageUrl;
            if (lightboxCaption) {
                lightboxCaption.textContent = caption || '';
            }
            lightbox.classList.add('active');
        }
    }

    function closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.classList.remove('active');
        }
    }

    // Helper: Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function ensurePicturePosition(image) {
        if (!image.position) {
            image.position = { x: 50, y: 50 };
        } else {
            if (typeof image.position.x !== 'number') image.position.x = 50;
            if (typeof image.position.y !== 'number') image.position.y = 50;
        }
        return image.position;
    }

    function sanitizeFrameStyle(value) {
        const allowed = ['classic', 'notebook', 'magazine', 'polaroid', 'photocard'];
        return allowed.includes(value) ? value : 'classic';
    }

})();





