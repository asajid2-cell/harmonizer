// OurSpace Widgets - Widget Functionality

(function() {
    'use strict';

    const EMOJI_CHOICES = [
        "😎", "😊", "🥳", "🤘", "😭",
        "🤍", "💜", "🔥", "🌈", "⭐",
        "🦄", "🎧", "👻", "👽", "🍒",
        "💅", "🎮", "😇", "🤡", "😴"
    ];

    function hasEditAccess() {
        if (window.OurSpace && typeof window.OurSpace.canEditProfile === 'function') {
            return window.OurSpace.canEditProfile();
        }
        return true;
    }

    function blockIfReadOnly(input) {
        if (hasEditAccess()) {
            return false;
        }
        alert("This profile is view-only while you're visiting someone else's page.");
        if (input) {
            input.value = '';
        }
        return true;
    }

    window.addEventListener('DOMContentLoaded', function() {
        initWidgets();
    });

    // Reload widgets when content is loaded/reloaded
    window.addEventListener('ourspace:contentLoaded', function() {
        console.log('[Widgets] Content loaded event received, reloading friends grid');
        loadFriendsGrid();
    });

    function initWidgets() {
        console.log("[Widgets] Initializing widgets...");

        // Widget toggles (collapse/expand)
        setupWidgetToggles();

        // Editable content auto-save
        setupContentEditable();

        // Comments widget
        setupCommentsWidget();

        // Top Friends widget
        setupTopFriendsWidget();

        // Custom HTML widget
        setupCustomHtmlWidget();
        renderCustomWidgets();

        // Banner and profile pic uploads
        setupProfileUploads();

        // Sticker controls
        setupStickerControls();

        // Image framing controls
        setupImageFraming();

        console.log("[Widgets] Initialization complete");
    }

    // Widget Toggles
    function setupWidgetToggles() {
        const toggleBtns = document.querySelectorAll('.widget-toggle');

        toggleBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const widget = this.closest('.widget');
                const content = widget ? widget.querySelector('.widget-content') : null;
                if (!content) {
                    return;
                }

                const isHidden = content.style.display === 'none';
                content.style.display = isHidden ? 'block' : 'none';
                this.textContent = isHidden ? '−' : '+';
            });
        });
    }

    // Editable Content Auto-Save
    function setupContentEditable() {
        // Profile name
        const profileName = document.getElementById('profile-name');
        if (profileName) {
            profileName.addEventListener('blur', function() {
                window.OurSpace.profile.profile.name = this.textContent.trim();
                // Auto-save removed - only save when user clicks Save Profile button
            });

            profileName.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                }
            });
        }

        // Profile tagline
        const profileTagline = document.getElementById('profile-tagline');
        if (profileTagline) {
            profileTagline.addEventListener('blur', function() {
                window.OurSpace.profile.profile.tagline = this.textContent.trim();
                // Auto-save removed - only save when user clicks Save Profile button
            });

            profileTagline.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                }
            });
        }

        // Mood text
        const moodText = document.getElementById('mood-text');
        if (moodText) {
            moodText.addEventListener('blur', function() {
                window.OurSpace.profile.profile.mood.text = this.textContent.trim();
                // Auto-save removed - only save when user clicks Save Profile button
            });

            moodText.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                }
            });
        }

        // Mood icon picker
        setupMoodIconPicker();

        // About Me content
        const aboutMe = document.getElementById('about-me-content');
        if (aboutMe) {
            aboutMe.addEventListener('blur', function() {
                window.OurSpace.profile.widgets.aboutMe.content = this.innerHTML;
                // Auto-save removed - only save when user clicks Save Profile button
            });
        }

        // Interests
        const interests = [
            { id: 'interest-music', key: 'music' },
            { id: 'interest-movies', key: 'movies' },
            { id: 'interest-tv', key: 'tv' },
            { id: 'interest-books', key: 'books' }
        ];

        interests.forEach(({ id, key }) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('blur', function() {
                    window.OurSpace.profile.widgets.interests[key] = this.textContent.trim();
                    // Auto-save removed - only save when user clicks Save Profile button
                });
            }
        });
    }

    function setupMoodIconPicker() {
        const moodIcon = document.getElementById('mood-icon');
        if (!moodIcon) {
            return;
        }

        moodIcon.classList.add('mood-icon-button');
        moodIcon.setAttribute('role', 'button');
        moodIcon.setAttribute('aria-label', 'Choose mood emoji');
        moodIcon.tabIndex = 0;

        let picker = null;

        const closePicker = () => {
            if (picker) {
                picker.remove();
                picker = null;
                document.removeEventListener('click', handleOutsideClick);
            }
        };

        const handleOutsideClick = (event) => {
            if (!picker) return;
            if (picker.contains(event.target) || event.target === moodIcon) return;
            closePicker();
        };

        const selectEmoji = (emoji) => {
            moodIcon.textContent = emoji;
            if (window.OurSpace && window.OurSpace.profile && window.OurSpace.profile.profile) {
                window.OurSpace.profile.profile.mood.icon = emoji;
                // Auto-save removed - only save when user clicks Save Profile button
            }
            closePicker();
        };

        const openPicker = () => {
            if (window.OurSpace && window.OurSpace.viewMode) {
                return;
            }
            if (picker) {
                closePicker();
                return;
            }
            picker = document.createElement('div');
            picker.className = 'emoji-picker';
            EMOJI_CHOICES.forEach((emoji) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'emoji-option';
                btn.textContent = emoji;
                btn.addEventListener('click', (event) => {
                    event.stopPropagation();
                    selectEmoji(emoji);
                });
                picker.appendChild(btn);
            });
            document.body.appendChild(picker);
            const rect = moodIcon.getBoundingClientRect();
            picker.style.top = `${rect.bottom + window.scrollY + 8}px`;
            picker.style.left = `${rect.left + window.scrollX}px`;
            requestAnimationFrame(() => picker.classList.add('visible'));
            document.addEventListener('click', handleOutsideClick);
        };

        moodIcon.addEventListener('click', (event) => {
            event.stopPropagation();
            openPicker();
        });

        moodIcon.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openPicker();
            } else if (event.key === 'Escape') {
                closePicker();
            }
        });
    }

    // Comments Widget
    function setupCommentsWidget() {
        const addCommentBtn = document.getElementById('add-comment-btn');
        const commentAuthor = document.getElementById('comment-author');
        const commentText = document.getElementById('comment-text');

        loadComments();

        if (addCommentBtn) {
            addCommentBtn.addEventListener('click', async function() {
                const author = commentAuthor.value.trim();
                const text = commentText.value.trim();

                if (!author || !text) {
                    alert('Please enter both your name and comment!');
                    return;
                }

                addCommentBtn.disabled = true;
                const success = await submitComment(author, text);
                addCommentBtn.disabled = false;

                if (success) {
                    commentAuthor.value = '';
                    commentText.value = '';
                    loadComments();
                }
            });
        }

        if (commentText) {
            commentText.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    if (addCommentBtn) addCommentBtn.click();
                }
            });
        }

        window.OurSpaceComments = {
            refresh: loadComments
        };
    }

    function getProfileOwnerUsername() {
        if (window.OurSpace && window.OurSpace.viewingUsername) {
            return window.OurSpace.viewingUsername;
        }
        const params = new URLSearchParams(window.location.search);
        const viewingUser = params.get('user');
        if (viewingUser) return viewingUser;
        if (window.OurSpaceAuth && window.OurSpaceAuth.currentUser) {
            return window.OurSpaceAuth.currentUser.username;
        }
        return null;
    }

    async function submitComment(author, text) {
        const targetUser = getProfileOwnerUsername();
        if (targetUser) {
            try {
                const response = await fetch(`/api/ourspace/comments/${encodeURIComponent(targetUser)}`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ author, text })
                });
                if (response.ok) {
                    return true;
                }
                const data = await response.json();
                alert(data.error || 'Unable to post comment. Please try again.');
                return false;
            } catch (error) {
                console.error('[Comments] Error posting comment:', error);
                alert('Unable to post comment right now. Please try again later.');
                return false;
            }
        }

        // Fallback to local profile storage
        const comment = {
            id: Date.now(),
            author,
            text,
            date: new Date().toISOString()
        };
        window.OurSpace.profile.widgets.comments.entries.unshift(comment);
        // Auto-save removed - only save when user clicks Save Profile button
        return true;
    }

    async function fetchComments(username) {
        try {
            const response = await fetch(`/api/ourspace/comments/${encodeURIComponent(username)}`, {
                cache: 'no-store'
            });
            if (response.ok) {
                const data = await response.json();
                return data.comments || [];
            }
        } catch (error) {
            console.error('[Comments] Error fetching comments:', error);
        }
        return null;
    }

    async function migrateLegacyComments(username, remoteComments) {
        if (!window.OurSpace || window.OurSpace._commentMigrationDone) return false;
        if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) return false;
        if (window.OurSpaceAuth.currentUser.username !== username) return false;

        const localComments = window.OurSpace.profile.widgets.comments.entries || [];
        if (!localComments.length || (remoteComments && remoteComments.length)) {
            return false;
        }

        window.OurSpace._commentMigrationDone = true;
        for (const comment of localComments) {
            await submitComment(comment.author, comment.text);
        }
        return true;
    }

    async function loadComments() {
        const commentsList = document.getElementById('comments-list');
        if (!commentsList) return;

        const targetUser = getProfileOwnerUsername();
        let comments = [];

        if (targetUser) {
            const remoteComments = await fetchComments(targetUser);
            if (remoteComments) {
                if (await migrateLegacyComments(targetUser, remoteComments)) {
                    return loadComments();
                }
                comments = remoteComments;
                window.OurSpace.profile.widgets.comments.entries = remoteComments;
            } else {
                comments = window.OurSpace.profile.widgets.comments.entries || [];
            }
        } else {
            comments = window.OurSpace.profile.widgets.comments.entries || [];
        }

        if (!comments.length) {
            commentsList.innerHTML = '<p style="opacity: 0.6; text-align: center; padding: 20px;">No comments yet. Be the first!</p>';
            return;
        }

        commentsList.innerHTML = '';
        const canDeleteRemote = !!(targetUser && window.OurSpaceAuth && window.OurSpaceAuth.isAuthenticated &&
            window.OurSpaceAuth.currentUser && window.OurSpaceAuth.currentUser.username === targetUser);

        comments.forEach(comment => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment-item';

            const rawDate = comment.created_at || comment.date;
            const date = rawDate ? new Date(rawDate) : new Date();
            const dateStr = formatCommentDate(date);

            const deleteButton = canDeleteRemote || !targetUser
                ? `<button class="comment-delete" data-id="${comment.id}" data-remote="${targetUser ? '1' : '0'}">Delete</button>`
                : '';

            commentDiv.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author)}</span>
                    <span class="comment-date">${dateStr}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.text)}</div>
                ${deleteButton}
            `;

            commentsList.appendChild(commentDiv);
        });

        const deleteBtns = commentsList.querySelectorAll('.comment-delete');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                const viaRemote = this.dataset.remote === '1';
                deleteComment(id, viaRemote);
            });
        });
    }

    async function deleteComment(id, isRemote) {
        if (isRemote) {
            try {
                const response = await fetch(`/api/ourspace/comments/${id}/delete`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'}
                });
                if (!response.ok) {
                    const data = await response.json();
                    alert(data.error || 'Unable to delete comment.');
                    return;
                }
                loadComments();
                return;
            } catch (error) {
                console.error('[Comments] Error deleting comment:', error);
                alert('Unable to delete comment right now.');
                return;
            }
        }

        window.OurSpace.profile.widgets.comments.entries =
            window.OurSpace.profile.widgets.comments.entries.filter(c => String(c.id) !== String(id));
        // Auto-save removed - only save when user clicks Save Profile button
        loadComments();
    }

    function formatCommentDate(date) {
        const now = new Date();
        const diff = now - date;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 7) {
            return date.toLocaleDateString();
        } else if (days > 0) {
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    // Top Friends Widget
    let friendsReorderMode = false;

    function setupTopFriendsWidget() {
        const friendsSlots = document.getElementById('friends-slots');
        const friendsColumns = document.getElementById('friends-columns');
        const friendsRows = document.getElementById('friends-rows');
        const friendsGrid = document.getElementById('friends-grid');
        const reorderBtn = document.getElementById('friends-reorder-btn');

        const ensureSelectOption = (select, value) => {
            if (!select) return;
            if (!select.querySelector(`option[value="${value}"]`)) {
                const opt = document.createElement('option');
                opt.value = String(value);
                opt.textContent = String(value);
                opt.dataset.dynamicOption = 'true';
                select.appendChild(opt);
            }
        };

        const setSlotsValue = (value) => {
            const normalized = Math.max(1, parseInt(value, 10) || 1);
            window.OurSpace.profile.widgets.topFriends.slots = normalized;
            if (friendsSlots) {
                ensureSelectOption(friendsSlots, normalized);
                friendsSlots.value = String(normalized);
            }
        };

        const setRowsValue = (value) => {
            const normalized = Math.max(1, parseInt(value, 10) || 1);
            window.OurSpace.profile.widgets.topFriends.rows = normalized;
            if (friendsRows) {
                ensureSelectOption(friendsRows, normalized);
                friendsRows.value = String(normalized);
            }
        };

        const syncRowsFromState = () => {
            const cols = Math.max(
                1,
                parseInt((friendsColumns && friendsColumns.value) || window.OurSpace.profile.widgets.topFriends.columns || 4, 10)
            );
            const slots = window.OurSpace.profile.widgets.topFriends.slots || 4;
            const rows = Math.max(1, Math.ceil(slots / cols));
            setRowsValue(rows);
        };

        // Load friends
        loadFriendsGrid();
        syncRowsFromState();

        // Slots selector
        if (friendsSlots) {
            friendsSlots.value = window.OurSpace.profile.widgets.topFriends.slots;

            friendsSlots.addEventListener('change', function() {
                setSlotsValue(this.value);
                syncRowsFromState();
                // Auto-save removed - only save when user clicks Save Profile button
                loadFriendsGrid();
            });
        }

        if (friendsColumns) {
            const savedColumns = window.OurSpace.profile.widgets.topFriends.columns || 4;
            friendsColumns.value = savedColumns;
            if (friendsGrid) {
                friendsGrid.dataset.columns = savedColumns;
            }
            friendsColumns.addEventListener('change', function() {
                const cols = parseInt(this.value);
                window.OurSpace.profile.widgets.topFriends.columns = cols;
                if (friendsGrid) {
                    friendsGrid.dataset.columns = cols;
                }
                syncRowsFromState();
                loadFriendsGrid();
            });
        }

        if (friendsRows) {
            friendsRows.addEventListener('change', function() {
                const rows = Math.max(1, parseInt(this.value, 10) || 1);
                const cols = Math.max(
                    1,
                    parseInt((friendsColumns && friendsColumns.value) || window.OurSpace.profile.widgets.topFriends.columns || 4, 10)
                );
                setRowsValue(rows);
                setSlotsValue(rows * cols);
                loadFriendsGrid();
            });
        }

        // Reorder button
        if (reorderBtn) {
            reorderBtn.addEventListener('click', function() {
                friendsReorderMode = !friendsReorderMode;
                this.textContent = friendsReorderMode ? 'Done' : 'Reorder';
                this.style.background = friendsReorderMode ? 'rgba(0, 255, 255, 0.2)' : '';
                loadFriendsGrid();
            });
        }
    }

    function loadFriendsGrid() {
        const friendsGrid = document.getElementById('friends-grid');
        if (!friendsGrid) return;

        const slots = window.OurSpace.profile.widgets.topFriends.slots;
        const columns = window.OurSpace.profile.widgets.topFriends.columns || 4;
        const friends = window.OurSpace.profile.widgets.topFriends.friends;
        const isCustomizeMode = !document.body.classList.contains('view-mode');

        friendsGrid.innerHTML = '';
        friendsGrid.dataset.slots = slots;
        friendsGrid.dataset.columns = columns;
        const rows = window.OurSpace.profile.widgets.topFriends.rows ||
            Math.max(1, Math.ceil(slots / Math.max(1, columns)));
        window.OurSpace.profile.widgets.topFriends.rows = rows;
        friendsGrid.dataset.rows = rows;

        for (let i = 0; i < slots; i++) {
            const friend = friends[i];
            const slotDiv = document.createElement('div');
            slotDiv.className = 'friend-slot';
            slotDiv.dataset.index = i;

            if (friendsReorderMode) {
                slotDiv.draggable = true;
            }

            if (friend && friend.image) {
                // Ensure position data exists
                if (!friend.position) {
                    friend.position = { x: 50, y: 50 };
                }

                const img = document.createElement('img');
                img.src = friend.image;
                img.alt = friend.name;
                img.loading = 'lazy';
                img.decoding = 'async';
                img.style.objectPosition = `${friend.position.x}% ${friend.position.y}%`;

                slotDiv.appendChild(img);

                const nameDiv = document.createElement('div');
                nameDiv.className = 'friend-name';
                nameDiv.textContent = friend.name;
                slotDiv.appendChild(nameDiv);

                // Frame button in customize mode
                if (isCustomizeMode && !friendsReorderMode) {
                    const frameBtn = document.createElement('button');
                    frameBtn.className = 'friend-frame-btn';
                    frameBtn.textContent = 'Frame';
                    frameBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        const isActive = slotDiv.classList.toggle('friend-framing');
                        slotDiv.draggable = false;
                        frameBtn.textContent = isActive ? 'Done' : 'Frame';
                        if (!isActive) {
                            // Auto-save removed - only save when user clicks Save Profile button
                        }
                    });
                    slotDiv.appendChild(frameBtn);

                    // Setup frame drag for image
                    if (window.OurSpace && typeof window.OurSpace.createFrameDrag === 'function') {
                        window.OurSpace.createFrameDrag(img, {
                            isActive: () => slotDiv.classList.contains('friend-framing'),
                            get: () => friend.position,
                            set: pos => {
                                friend.position.x = pos.x;
                                friend.position.y = pos.y;
                            },
                            apply: (x, y) => {
                                img.style.objectPosition = `${x}% ${y}%`;
                            },
                            ignoreSelector: '.friend-frame-btn',
                            onSave: () => { /* Auto-save removed */ }
                        });
                    }
                }
            } else {
                slotDiv.innerHTML = '<div class="add-friend-btn">+</div>';
            }

            // Click handler (not in reorder mode)
            if (!friendsReorderMode) {
                slotDiv.addEventListener('click', function(e) {
                    if (e.target.classList.contains('friend-frame-btn')) return;
                    const index = parseInt(this.dataset.index);
                    if (friend && friend.image) {
                        // Remove friend
                        if (confirm(`Remove ${friend.name}?`)) {
                            window.OurSpace.profile.widgets.topFriends.friends.splice(index, 1);
                            // Auto-save removed - only save when user clicks Save Profile button
                            loadFriendsGrid();
                        }
                    } else {
                        // Add friend
                        addFriend(index);
                    }
                });
            }

            // Drag handlers for reorder mode
            if (friendsReorderMode && friend && friend.image) {
                slotDiv.addEventListener('dragstart', function(e) {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', this.dataset.index);
                    this.style.opacity = '0.5';
                });

                slotDiv.addEventListener('dragover', function(e) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    this.style.border = '3px dashed #00ffff';
                });

                slotDiv.addEventListener('dragleave', function() {
                    this.style.border = '';
                });

                slotDiv.addEventListener('drop', function(e) {
                    e.preventDefault();
                    this.style.border = '';

                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                    const toIndex = parseInt(this.dataset.index);

                    if (fromIndex !== toIndex && friends[toIndex]) {
                        // Swap friends
                        const temp = friends[fromIndex];
                        friends[fromIndex] = friends[toIndex];
                        friends[toIndex] = temp;

                        // Auto-save removed - only save when user clicks Save Profile button
                        loadFriendsGrid();
                    }
                });

                slotDiv.addEventListener('dragend', function() {
                    this.style.opacity = '1';
                    this.style.border = '';
                });
            }

            friendsGrid.appendChild(slotDiv);
        }
    }

    async function showAllFriends() {
        // Check if authenticated
        if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
            alert('You must be logged in to view your friends list');
            return;
        }

        // Fetch friends from database
        let dbFriends = [];
        try {
            const response = await fetch('/api/ourspace/friends');
            if (!response.ok) {
                throw new Error('Failed to fetch friends');
            }
            const data = await response.json();
            dbFriends = data.friends || [];
        } catch (e) {
            console.error('[Friends] Error fetching friends:', e);
            alert('Error loading friends list');
            return;
        }

        // Create or get modal
        let modal = document.querySelector('.friends-list-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'friends-list-modal';
            document.body.appendChild(modal);
        }

        let html = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>My Friends (${dbFriends.length})</h2>
                    <button class="close-btn">&times;</button>
                </div>
                <div class="modal-body">
        `;

        if (dbFriends.length === 0) {
            html += '<div class="friends-list-empty">No friends yet. Use "Add to Friends" to add mutual friends!</div>';
        } else {
            html += '<div class="friends-list-container">';
            dbFriends.forEach((friend) => {
                const friendUsername = friend.friend_username;
                const profilePic = friend.profile_pic || '/static/default-avatar.png';
                const createdDate = new Date(friend.created_at).toLocaleDateString();

                html += `
                    <div class="friend-list-item" data-username="${escapeHtml(friendUsername)}">
                        <img src="${profilePic}" alt="${escapeHtml(friendUsername)}" loading="lazy" decoding="async">
                        <div class="friend-list-item-info">
                            <div class="friend-list-item-name">${escapeHtml(friendUsername)}</div>
                            <div class="friend-list-item-date" style="font-size: 10px; opacity: 0.7;">Friends since ${createdDate}</div>
                        </div>
                        <div class="friend-list-item-actions">
                            <button class="remove-friend-btn" data-username="${escapeHtml(friendUsername)}">Remove</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }

        html += `
                </div>
            </div>
        `;

        modal.innerHTML = html;
        modal.classList.add('active');

        // Close button
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        }

        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        // Remove buttons
        const removeBtns = modal.querySelectorAll('.remove-friend-btn');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', async function() {
                const username = this.dataset.username;

                if (confirm(`Remove ${username} from your friends list?`)) {
                    try {
                        const response = await fetch('/api/ourspace/friends/remove', {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({username: username})
                        });

                        const data = await response.json();

                        if (response.ok) {
                            // Reload the friends list
                            showAllFriends();
                        } else {
                            alert(data.error || 'Failed to remove friend');
                        }
                    } catch (e) {
                        console.error('[Friends] Error removing friend:', e);
                        alert('Error removing friend');
                    }
                }
            });
        });

        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                modal.classList.remove('active');
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    // Expose showAllFriends globally so it can be called from other modules
    window.showAllFriends = showAllFriends;

    function addFriend(index) {
        if (!hasEditAccess()) {
            alert("This profile is view-only while you're visiting someone else's page.");
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.addEventListener('change', async function() {
            if (blockIfReadOnly(this)) {
                return;
            }
            const file = this.files[0];
            if (file && file.type.startsWith('image/')) {
                const name = prompt('Friend\'s name:');
                if (!name) return;

                try {
                    // Upload to server
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('type', 'friend');

                    const response = await fetch('/api/ourspace/upload', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const friend = {
                            name: name,
                            image: data.url
                        };

                        window.OurSpace.profile.widgets.topFriends.friends[index] = friend;
                        // Auto-save removed - only save when user clicks Save Profile button
                        loadFriendsGrid();
                    } else {
                        console.error('[Widgets] Failed to upload friend image');
                        alert('Failed to upload friend image');
                    }
                } catch (e) {
                    console.error('[Widgets] Error uploading friend image:', e);
                    alert('Error uploading friend image');
                }
            }
        });

        input.click();
    }

    // Custom HTML Widget
    function setupCustomHtmlWidget() {
        const customHtmlInput = document.getElementById('custom-html-input');
        const globalHtmlInput = document.getElementById('custom-html-global-input');
        const applyBtn = document.getElementById('apply-custom-html');
        const customHtmlOutput = document.getElementById('custom-html-output');
        const globalInjection = document.getElementById('custom-html-global');

        if (!window.OurSpace.profile.widgets.customHtml) {
            window.OurSpace.profile.widgets.customHtml = { visible: true, html: '', global: '' };
        }

        window.OurSpace.profile.widgets.customHtml.html = sanitizeCustomCode(window.OurSpace.profile.widgets.customHtml.html || '');
        window.OurSpace.profile.widgets.customHtml.global = sanitizeCustomCode(window.OurSpace.profile.widgets.customHtml.global || '');

        // Load saved HTML
        if (customHtmlInput) {
            customHtmlInput.value = window.OurSpace.profile.widgets.customHtml.html || '';
        }

        if (globalHtmlInput) {
            globalHtmlInput.value = window.OurSpace.profile.widgets.customHtml.global || '';
        }

        if (customHtmlOutput) {
            customHtmlOutput.innerHTML = window.OurSpace.profile.widgets.customHtml.html || '';
        }

        if (globalInjection) {
            globalInjection.innerHTML = window.OurSpace.profile.widgets.customHtml.global || '';
        }

        const applyCustomHtml = () => {
            const widgetHtml = sanitizeCustomCode(customHtmlInput ? customHtmlInput.value : '');
            const globalHtml = sanitizeCustomCode(globalHtmlInput ? globalHtmlInput.value : '');
            window.OurSpace.profile.widgets.customHtml.html = widgetHtml;
            window.OurSpace.profile.widgets.customHtml.global = globalHtml;
            // Auto-save removed - only save when user clicks Save Profile button

            if (customHtmlOutput) {
                customHtmlOutput.innerHTML = widgetHtml;
            }
            if (globalInjection) {
                globalInjection.innerHTML = globalHtml;
            }
            if (window.OurSpace && typeof window.OurSpace.applyCustomGlobalCode === 'function') {
                window.OurSpace.applyCustomGlobalCode(globalHtml);
            }
        };

        if (applyBtn) {
            applyBtn.addEventListener('click', applyCustomHtml);
        }
    }

    function renderCustomWidgets() {
        const container = document.getElementById('custom-widgets-container');
        if (!container) return;
        if (!window.OurSpace.profile.widgets.customWidgets) {
            window.OurSpace.profile.widgets.customWidgets = [];
        }

        const widgets = window.OurSpace.profile.widgets.customWidgets;
        const isCustomizeMode = !document.body.classList.contains('view-mode');
        container.innerHTML = '';

        if (!widgets.length) {
            if (!isCustomizeMode) {
                return;
            }
            const emptyCard = document.createElement('div');
            emptyCard.className = 'widget custom-widget-card customize-mode-only';
            const content = document.createElement('div');
            content.className = 'widget-content';
            const msg = document.createElement('p');
            msg.className = 'custom-widget-empty';
            msg.textContent = 'Use the Custom Widgets panel to add new sections to your page.';
            content.appendChild(msg);
            emptyCard.appendChild(content);
            container.appendChild(emptyCard);
            return;
        }

        widgets.forEach(widget => {
            const card = document.createElement('div');
            card.className = 'widget custom-widget-card';

            const header = document.createElement('div');
            header.className = 'widget-header';
            const title = document.createElement('h2');
            title.textContent = widget.title || 'Untitled Widget';
            header.appendChild(title);

            const badge = document.createElement('span');
            badge.className = 'custom-widget-type-badge';
            badge.textContent = (widget.type || 'text').toUpperCase();
            header.appendChild(badge);
            card.appendChild(header);

            const content = document.createElement('div');
            content.className = 'widget-content';

            if (widget.text) {
                const paragraph = document.createElement('p');
                paragraph.textContent = widget.text;
                content.appendChild(paragraph);
            }

            if (widget.mediaUrl) {
                const url = widget.mediaUrl;
                if (widget.type === 'image' || widget.type === 'gif') {
                    const img = document.createElement('img');
                    img.src = url;
                    img.alt = widget.title || 'Custom widget image';
                    img.loading = 'lazy';
                    img.decoding = 'async';
                    img.className = 'custom-widget-media';
                    content.appendChild(img);
                } else if (widget.type === 'video') {
                    const video = document.createElement('video');
                    video.src = url;
                    video.controls = true;
                    video.className = 'custom-widget-media';
                    video.preload = 'metadata';
                    content.appendChild(video);
                } else if (widget.type === 'audio') {
                    const audio = document.createElement('audio');
                    audio.src = url;
                    audio.controls = true;
                    audio.className = 'custom-widget-media';
                    content.appendChild(audio);
                }
            }

            const canEdit = !document.body.classList.contains('view-mode') && hasEditAccess();
            if (canEdit) {
                const actions = document.createElement('div');
                actions.className = 'custom-widget-actions';

                const uploadBtn = document.createElement('button');
                uploadBtn.type = 'button';
                uploadBtn.className = 'custom-widget-upload-btn';
                uploadBtn.textContent = widget.mediaUrl ? 'Replace Media' : 'Upload Media';
                const uploadInput = document.createElement('input');
                uploadInput.type = 'file';
                uploadInput.accept = 'image/*,video/*,audio/*';
                uploadInput.style.display = 'none';

                uploadBtn.addEventListener('click', () => uploadInput.click());
                uploadInput.addEventListener('change', async function() {
                    const file = this.files && this.files[0];
                    if (!file) return;
                    uploadBtn.textContent = 'Uploading...';
                    try {
                        const uploader = window.OurSpaceWidgets && window.OurSpaceWidgets.uploadCustomWidgetMedia;
                        if (!uploader) {
                            throw new Error('Upload helper unavailable');
                        }
                        const url = await uploader(file);
                        widget.mediaUrl = url;
                        renderCustomWidgets();
                    } catch (error) {
                        console.error('[Widgets] Failed to upload widget media', error);
                        alert('Unable to upload media right now.');
                        uploadBtn.textContent = widget.mediaUrl ? 'Replace Media' : 'Upload Media';
                    } finally {
                        this.value = '';
                    }
                });

                actions.appendChild(uploadBtn);
                actions.appendChild(uploadInput);
                content.appendChild(actions);
            }

            card.appendChild(content);
            container.appendChild(card);
        });
    }

    // Profile Uploads
    function setupProfileUploads() {
        // Banner upload
        const bannerUpload = document.getElementById('banner-upload');
        if (bannerUpload) {
            bannerUpload.addEventListener('change', async function() {
                if (blockIfReadOnly(this)) {
                    return;
                }
                const file = this.files[0];
                if (file && file.type.startsWith('image/')) {
                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'banner');

                        const response = await fetch('/api/ourspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.OurSpace.profile.profile.bannerImage = data.url;
                            window.OurSpace.profile.profile.bannerOffset = { x: 50, y: 50 };
                            // Auto-save removed - only save when user clicks Save Profile button

                            const banner = document.getElementById('banner-image');
                            if (banner) {
                                banner.style.backgroundImage = `url(${data.url})`;
                                banner.style.backgroundPosition = '50% 50%';
                                const overlay = banner.querySelector('.upload-overlay');
                                if (overlay) overlay.style.display = 'none';

                                const removeBtn = document.getElementById('remove-banner-btn');
                                if (removeBtn) removeBtn.style.display = 'block';
                            }
                        } else {
                            console.error('[Widgets] Failed to upload banner');
                            alert('Failed to upload banner image');
                        }
                    } catch (e) {
                        console.error('[Widgets] Error uploading banner:', e);
                        alert('Error uploading banner image');
                    }
                }
            });
        }

        // Remove banner button
        const removeBannerBtn = document.getElementById('remove-banner-btn');
        if (removeBannerBtn) {
            removeBannerBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!hasEditAccess()) {
                    return;
                }
                if (confirm('Remove banner image?')) {
                    window.OurSpace.profile.profile.bannerImage = '';
                    window.OurSpace.profile.profile.bannerOffset = { x: 50, y: 50 };
                    // Auto-save removed - only save when user clicks Save Profile button

                    const banner = document.getElementById('banner-image');
                    if (banner) {
                        banner.style.backgroundImage = '';
                        const overlay = banner.querySelector('.upload-overlay');
                        if (overlay) overlay.style.display = 'block';
                    }
                    this.style.display = 'none';
                }
            });
        }

        // Profile pic upload
        const profilePicUpload = document.getElementById('profile-pic-upload');
        if (profilePicUpload) {
            profilePicUpload.addEventListener('change', async function() {
                if (blockIfReadOnly(this)) {
                    return;
                }
                const file = this.files[0];
                if (file && file.type.startsWith('image/')) {
                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'profile');

                        const response = await fetch('/api/ourspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.OurSpace.profile.profile.profilePic = data.url;
                            window.OurSpace.profile.profile.profilePicOffset = { x: 50, y: 50 };
                            // Auto-save removed - only save when user clicks Save Profile button

                            const profilePic = document.getElementById('profile-pic');
                            if (profilePic) {
                                profilePic.src = data.url;
                                profilePic.style.display = 'block';
                                profilePic.style.objectPosition = '50% 50%';
                            }

                            const removeBtn = document.getElementById('remove-profile-pic-btn');
                            if (removeBtn) removeBtn.style.display = 'flex';
                        } else {
                            console.error('[Widgets] Failed to upload profile pic');
                            alert('Failed to upload profile picture');
                        }
                    } catch (e) {
                        console.error('[Widgets] Error uploading profile pic:', e);
                        alert('Error uploading profile picture');
                    }
                }
            });
        }

        // Remove profile pic button
        const removeProfilePicBtn = document.getElementById('remove-profile-pic-btn');
        if (removeProfilePicBtn) {
            removeProfilePicBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (!hasEditAccess()) {
                    return;
                }
                if (confirm('Remove profile picture?')) {
                    window.OurSpace.profile.profile.profilePic = '';
                    window.OurSpace.profile.profile.profilePicOffset = { x: 50, y: 50 };
                    // Auto-save removed - only save when user clicks Save Profile button

                    const profilePic = document.getElementById('profile-pic');
                    if (profilePic) {
                        profilePic.src = '';
                        profilePic.style.display = 'none';
                    }
                    this.style.display = 'none';
                }
            });
        }

        // Show remove buttons if images exist
        if (window.OurSpace.profile.profile.bannerImage) {
            const removeBtn = document.getElementById('remove-banner-btn');
            if (removeBtn) removeBtn.style.display = 'block';
        }
        if (window.OurSpace.profile.profile.profilePic) {
            const removeBtn = document.getElementById('remove-profile-pic-btn');
            if (removeBtn) removeBtn.style.display = 'flex';
        }
    }

    function setupImageFraming() {
        if (!window.OurSpace || typeof window.OurSpace.createFrameDrag !== 'function') {
            return;
        }

        const banner = document.getElementById('banner-image');
        if (banner) {
            banner.classList.add('frame-draggable');
            window.OurSpace.createFrameDrag(banner, {
                isActive: () => !!(window.OurSpace.profile.profile.bannerImage),
                ignoreSelector: 'button, .upload-overlay',
                get: () => ensureProfileOffset('bannerOffset'),
                set: pos => {
                    const offsets = ensureProfileOffset('bannerOffset');
                    offsets.x = pos.x;
                    offsets.y = pos.y;
                },
                apply: (x, y) => {
                    banner.style.backgroundPosition = `${x}% ${y}%`;
                },
                onSave: () => { /* Auto-save removed */ }
            });
        }

        const profilePic = document.getElementById('profile-pic');
        if (profilePic) {
            profilePic.classList.add('frame-draggable');
            window.OurSpace.createFrameDrag(profilePic, {
                isActive: () => !!(window.OurSpace.profile.profile.profilePic),
                ignoreSelector: '.pic-upload-btn, .pic-remove-btn',
                get: () => ensureProfileOffset('profilePicOffset'),
                set: pos => {
                    const offsets = ensureProfileOffset('profilePicOffset');
                    offsets.x = pos.x;
                    offsets.y = pos.y;
                },
                apply: (x, y) => {
                    profilePic.style.objectPosition = `${x}% ${y}%`;
                },
                onSave: () => { /* Auto-save removed */ }
            });
        }
    }

    function ensureProfileOffset(key) {
        if (!window.OurSpace || !window.OurSpace.profile || !window.OurSpace.profile.profile) {
            return { x: 50, y: 50 };
        }
        if (!window.OurSpace.profile.profile[key]) {
            window.OurSpace.profile.profile[key] = { x: 50, y: 50 };
        }
        return window.OurSpace.profile.profile[key];
    }

    function setupStickerControls() {
        const uploadInput = document.getElementById('sticker-upload');
        const addBtn = document.getElementById('add-sticker-btn');
        const scaleInput = document.getElementById('sticker-scale');
        const zInput = document.getElementById('sticker-z');
        const cutoutBtn = document.getElementById('sticker-cutout-btn');
        const frameButtons = Array.from(document.querySelectorAll('#sticker-frame-style [data-sticker-frame]'));
        const frameTextInput = document.getElementById('sticker-frame-text');
        const frameTextColorInput = document.getElementById('sticker-frame-text-color');
        const frameTextControls = document.getElementById('frame-text-controls');
        const resetBtn = document.getElementById('sticker-reset-cutout');
        const deleteBtn = document.getElementById('sticker-delete-btn');
        const hint = document.getElementById('sticker-hint');
        const deckGrid = document.getElementById('sticker-deck-grid');

        if (!addBtn || !uploadInput) {
            return;
        }

        let activeSticker = null;
        const getCore = () => window.OurSpace;
        const framesWithText = ['magazine', 'polaroid'];
        const supportsFrameText = (style) => framesWithText.includes(style);

        const toggleControls = (enabled) => {
            const controls = [scaleInput, zInput, cutoutBtn, resetBtn, deleteBtn];
            controls.forEach(ctrl => {
                if (ctrl) ctrl.disabled = !enabled;
            });
            if (frameTextInput) frameTextInput.disabled = !enabled;
            if (frameTextColorInput) frameTextColorInput.disabled = !enabled;
            frameButtons.forEach(btn => {
                btn.disabled = !enabled;
            });
            if (hint) {
                hint.textContent = enabled
                    ? 'Drag to reposition. Use the controls to tweak size, layering, and cutout.'
                    : 'Click any sticker to select it. Drag to move when Customize mode is active.';
            }
        };

        const setFramePresetState = (value) => {
            const selected = value || 'none';
            frameButtons.forEach(btn => {
                const isActive = btn.dataset.stickerFrame === selected;
                btn.classList.toggle('active', isActive);
            });
        };

        const updateFrameTextControls = () => {
            if (!frameTextControls) return;
            const frameStyle = activeSticker?.frameStyle || 'none';
            const supported = supportsFrameText(frameStyle) && !!activeSticker;
            frameTextControls.classList.toggle('hidden', !supported);
            if (!supported || !activeSticker) {
                if (frameTextInput) frameTextInput.value = '';
                if (frameTextColorInput) frameTextColorInput.value = '#3c3c3c';
                return;
            }
            if (frameTextInput) {
                frameTextInput.value = activeSticker.frameText || '';
            }
            if (frameTextColorInput) {
                const color = activeSticker.frameTextColor || '#3c3c3c';
                frameTextColorInput.value = /^#/.test(color) ? color : '#3c3c3c';
            }
        };

        const getActiveLayout = () => {
            if (!activeSticker) return null;
            const core = getCore();
            if (core && typeof core.getStickerLayout === 'function') {
                try {
                    return core.getStickerLayout(activeSticker);
                } catch (err) {
                    return null;
                }
            }
            return null;
        };

        const setActive = (sticker) => {
            activeSticker = sticker || null;
            if (!activeSticker) {
                toggleControls(false);
                setFramePresetState(null);
                updateFrameTextControls();
                return;
            }
            toggleControls(true);
            const layout = getActiveLayout();
            if (scaleInput) scaleInput.value = layout ? (layout.scale || 1) : (activeSticker.scale || 1);
            if (zInput) zInput.value = layout ? (layout.zIndex || 30) : (activeSticker.zIndex || 30);
            setFramePresetState(activeSticker.frameStyle || 'none');
            updateFrameTextControls();
        };

        toggleControls(false);
        updateFrameTextControls();

        document.addEventListener('ourspace:sticker-selected', (event) => {
            setActive(event.detail?.sticker || null);
        });

        document.addEventListener('ourspace:stickers-updated', (event) => {
            if (!activeSticker) return;
            const latest = (event.detail?.stickers || []).find(s => s.id === activeSticker.id);
            setActive(latest || null);
        });

        addBtn.addEventListener('click', () => {
            if (!hasEditAccess()) {
                alert("This profile is view-only while you're visiting someone else's page.");
                return;
            }
            uploadInput.click();
        });

        uploadInput.addEventListener('change', async function() {
            if (blockIfReadOnly(this)) {
                this.value = '';
                return;
            }
            const file = this.files && this.files[0];
            this.value = '';
            if (!file || !file.type.startsWith('image/')) {
                return;
            }
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('type', 'sticker');
                const response = await fetch('/api/ourspace/upload', {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) {
                    alert('Failed to upload sticker.');
                    return;
                }
                const data = await response.json();
                const core = getCore();
                if (core && typeof core.addSticker === 'function') {
                    const label = file.name ? file.name.split('.').slice(0, -1).join('.') || file.name : 'Sticker';
                    if (typeof core.addStickerAsset === 'function') {
                        core.addStickerAsset({
                            url: data.url,
                            clipPath: '',
                            scale: 1,
                            zIndex: 40,
                            label,
                            frameStyle: 'none'
                        });
                    }
                    core.addSticker({
                        id: `sticker-${Date.now()}`,
                        url: data.url,
                        x: 50,
                        y: 50,
                        scale: 1,
                        zIndex: 40,
                        clipPath: '',
                        frameStyle: 'none'
                    });
                }
            } catch (error) {
                console.error('[Stickers] Upload failed:', error);
                alert('Error uploading sticker image.');
            }
        });

        if (scaleInput) {
            const updateScale = (commit) => {
                if (!activeSticker) return;
                const core = getCore();
                const scaleValue = parseFloat(scaleInput.value) || 1;
                if (core && typeof core.updateSticker === 'function') {
                    core.updateSticker(activeSticker.id, { scale: scaleValue }, { silent: !commit });
                }
            };
            scaleInput.addEventListener('input', () => updateScale(false));
            scaleInput.addEventListener('change', () => updateScale(true));
        }

        if (zInput) {
            zInput.addEventListener('change', () => {
                if (!activeSticker) return;
                const value = parseInt(zInput.value, 10) || 1;
                const core = getCore();
                if (core && typeof core.updateSticker === 'function') {
                    core.updateSticker(activeSticker.id, { zIndex: value });
                }
            });
        }

        frameButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                if (!activeSticker) return;
                const style = btn.dataset.stickerFrame || 'none';
                const core = getCore();
                if (core && typeof core.updateSticker === 'function') {
                    core.updateSticker(activeSticker.id, { frameStyle: style });
                    setFramePresetState(style);
                    updateFrameTextControls();
                }
            });
        });

        if (frameTextInput) {
            frameTextInput.addEventListener('change', () => {
                if (!activeSticker) return;
                const core = getCore();
                if (core && typeof core.updateSticker === 'function') {
                    core.updateSticker(activeSticker.id, { frameText: frameTextInput.value });
                }
            });
        }

        if (frameTextColorInput) {
            frameTextColorInput.addEventListener('change', () => {
                if (!activeSticker) return;
                const core = getCore();
                if (core && typeof core.updateSticker === 'function') {
                    core.updateSticker(activeSticker.id, { frameTextColor: frameTextColorInput.value });
                }
            });
        }

        const beginLabelEdit = (labelEl) => {
            if (!labelEl) return;
            labelEl.dataset.originalText = labelEl.textContent;
            labelEl.dataset.editing = 'true';
            labelEl.contentEditable = 'true';
            labelEl.spellcheck = false;
            labelEl.focus();
            const range = document.createRange();
            range.selectNodeContents(labelEl);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        };

        const finishLabelEdit = (labelEl, { cancel } = { cancel: false }) => {
            if (!labelEl || labelEl.dataset.editing !== 'true') return;
            labelEl.dataset.editing = '';
            labelEl.contentEditable = 'false';
            const original = labelEl.dataset.originalText || '';
            if (cancel) {
                labelEl.textContent = original;
                return;
            }
            const core = getCore();
            const stickerId = labelEl.dataset.stickerId;
            if (core && typeof core.updateSticker === 'function' && stickerId) {
                core.updateSticker(stickerId, { frameText: labelEl.textContent.trim() });
            }
        };

        document.addEventListener('dblclick', (event) => {
            const labelEl = event.target.closest('.sticker-frame-label');
            if (!labelEl) return;
            const core = getCore();
            if (core?.viewMode) return;
            const stickerId = labelEl.dataset.stickerId;
            if (core && typeof core.selectSticker === 'function' && stickerId) {
                core.selectSticker(stickerId);
            }
            event.stopPropagation();
            beginLabelEdit(labelEl);
        });

        document.addEventListener('keydown', (event) => {
            const labelEl = event.target.closest('.sticker-frame-label');
            if (!labelEl || labelEl.dataset.editing !== 'true') return;
            if (event.key === 'Enter') {
                event.preventDefault();
                labelEl.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finishLabelEdit(labelEl, { cancel: true });
                labelEl.blur();
            }
        }, true);

        document.addEventListener('blur', (event) => {
            const labelEl = event.target.closest('.sticker-frame-label');
            if (!labelEl || labelEl.dataset.editing !== 'true') return;
            finishLabelEdit(labelEl, { cancel: false });
        }, true);

        if (cutoutBtn) {
            cutoutBtn.addEventListener('click', () => {
                if (!activeSticker) return;
                const core = getCore();
                if (core && typeof core.startStickerCutout === 'function') {
                    core.startStickerCutout(activeSticker.id);
                }
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (!activeSticker) return;
                const core = getCore();
                if (core && typeof core.clearStickerCutout === 'function') {
                    core.clearStickerCutout(activeSticker.id);
                }
            });
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                if (!activeSticker) return;
                if (!confirm('Delete this sticker?')) return;
                const core = getCore();
                if (core && typeof core.removeSticker === 'function') {
                    core.removeSticker(activeSticker.id);
                }
                setActive(null);
            });
        }

        if (deckGrid) {
            deckGrid.addEventListener('click', (event) => {
                const actionBtn = event.target.closest('button[data-action]');
                if (!actionBtn) return;
                const deckItem = actionBtn.closest('[data-deck-id]');
                if (!deckItem) return;
                const deckId = deckItem.dataset.deckId;
                const action = actionBtn.dataset.action;
                const core = getCore();
                if (!core) return;

                if (action === 'place' && typeof core.addStickerFromDeck === 'function') {
                    core.addStickerFromDeck(deckId);
                } else if (action === 'delete' && typeof core.removeStickerFromDeck === 'function') {
                    if (!confirm('Remove this sticker from your deck?')) {
                        return;
                    }
                    core.removeStickerFromDeck(deckId);
                }
            });
        }
    }

    function sanitizeCustomCode(html) {
        if (!html) return '';
        let sanitized = String(html);
        sanitized = sanitized.replace(/<script(?![^>]*data-ourspace)[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        sanitized = sanitized.replace(/on\w+\s*=\s*(['"]).*?\1/gi, '');
        sanitized = sanitized.replace(/javascript:/gi, '');
        return sanitized;
    }

    // Helper: Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    window.OurSpaceWidgets = window.OurSpaceWidgets || {};
    window.OurSpaceWidgets.renderCustomWidgets = renderCustomWidgets;

})();










