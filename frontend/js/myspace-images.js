// MySpace Images - Picture Wall and Image Management

(function() {
    'use strict';

    window.addEventListener('DOMContentLoaded', function() {
        initImages();
    });

    function initImages() {
        console.log("[Images] Initializing picture wall...");

        // Picture upload
        setupPictureUpload();

        // Grid columns control
        setupGridColumns();

        // Load existing pictures
        loadPictureGrid();

        // Lightbox
        setupLightbox();

        console.log("[Images] Initialization complete");
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

                            const response = await fetch('/api/myspace/upload', {
                                method: 'POST',
                                body: formData
                            });

                            if (response.ok) {
                                const data = await response.json();
                                const image = {
                                    id: Date.now() + Math.random(),
                                    url: data.url,
                                    caption: caption || '',
                                    order: window.MySpace.profile.widgets.pictureWall.images.length,
                                    position: { x: 50, y: 50 }
                                };

                                window.MySpace.profile.widgets.pictureWall.images.push(image);
                                await window.MySpace.saveProfile();
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
            gridColumns.value = window.MySpace.profile.widgets.pictureWall.columns;

            gridColumns.addEventListener('change', function() {
                const columns = parseInt(this.value);
                window.MySpace.profile.widgets.pictureWall.columns = columns;
                pictureGrid.dataset.columns = columns;
                window.MySpace.saveProfile();
            });
        }
    }

    // Load Picture Grid
    function loadPictureGrid() {
        const pictureGrid = document.getElementById('picture-grid');
        if (!pictureGrid) return;

        const images = window.MySpace.profile.widgets.pictureWall.images;

        // Sort by order
        images.sort((a, b) => a.order - b.order);

        pictureGrid.innerHTML = '';

        if (images.length === 0) {
            pictureGrid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; opacity: 0.6;">No pictures yet. Click "Add Photos" to get started!</div>';
            return;
        }

        images.forEach((image, index) => {
            const position = ensurePicturePosition(image);
            const pictureItem = document.createElement('div');
            pictureItem.className = 'picture-item';
            pictureItem.dataset.id = image.id;
            pictureItem.dataset.index = index;
            pictureItem.draggable = true;

            pictureItem.innerHTML = `
                <img src="${image.url}" alt="${escapeHtml(image.caption)}" loading="lazy" style="object-position: ${position.x}% ${position.y}%">
                <button class="frame-btn" title="Adjust framing">Frame</button>
                <button class="delete-btn" title="Delete">x</button>
                ${image.caption ? `<div class="caption">${escapeHtml(image.caption)}</div>` : ''}
            `;

            // Click to view in lightbox
            const img = pictureItem.querySelector('img');
            if (img) {
                img.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openLightbox(image.url, image.caption);
                });
            }

            // Delete button
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
                        window.MySpace.saveProfile();
                    }
                });
            }

            if (img && window.MySpace && typeof window.MySpace.createFrameDrag === 'function') {
                window.MySpace.createFrameDrag(img, {
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
                    onSave: () => window.MySpace.saveProfile()
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

            // Drag and drop for reordering
            pictureItem.addEventListener('dragstart', handleDragStart);
            pictureItem.addEventListener('dragover', handleDragOver);
            pictureItem.addEventListener('drop', handleDrop);
            pictureItem.addEventListener('dragend', handleDragEnd);

            pictureGrid.appendChild(pictureItem);
        });
    }

    // Delete Picture
    function deletePicture(id) {
        window.MySpace.profile.widgets.pictureWall.images =
            window.MySpace.profile.widgets.pictureWall.images.filter(img => img.id !== id);

        // Reorder
        window.MySpace.profile.widgets.pictureWall.images.forEach((img, index) => {
            img.order = index;
        });

        window.MySpace.saveProfile();
        loadPictureGrid();
    }

    // Edit Caption
    function editCaption(id) {
        const image = window.MySpace.profile.widgets.pictureWall.images.find(img => img.id === id);
        if (!image) return;

        const newCaption = prompt('Edit caption:', image.caption);
        if (newCaption !== null) {
            image.caption = newCaption;
            window.MySpace.saveProfile();
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
            const images = window.MySpace.profile.widgets.pictureWall.images;
            const [movedImage] = images.splice(draggedIndex, 1);
            images.splice(targetIndex, 0, movedImage);

            // Update order
            images.forEach((img, index) => {
                img.order = index;
            });

            window.MySpace.saveProfile();
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

})();
