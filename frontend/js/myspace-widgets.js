// MySpace Widgets - Widget Functionality

(function() {
    'use strict';

    window.addEventListener('DOMContentLoaded', function() {
        initWidgets();
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

        // Banner and profile pic uploads
        setupProfileUploads();

        console.log("[Widgets] Initialization complete");
    }

    // Widget Toggles
    function setupWidgetToggles() {
        const toggleBtns = document.querySelectorAll('.widget-toggle');

        toggleBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const widget = this.closest('.widget');
                const content = widget.querySelector('.widget-content');

                if (content) {
                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        this.textContent = '−';
                    } else {
                        content.style.display = 'none';
                        this.textContent = '+';
                    }
                }
            });
        });
    }

    // Editable Content Auto-Save
    function setupContentEditable() {
        // Profile name
        const profileName = document.getElementById('profile-name');
        if (profileName) {
            profileName.addEventListener('blur', function() {
                window.MySpace.profile.profile.name = this.textContent.trim();
                window.MySpace.saveProfile();
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
                window.MySpace.profile.profile.tagline = this.textContent.trim();
                window.MySpace.saveProfile();
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
                window.MySpace.profile.profile.mood.text = this.textContent.trim();
                window.MySpace.saveProfile();
            });

            moodText.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.blur();
                }
            });
        }

        // About Me content
        const aboutMe = document.getElementById('about-me-content');
        if (aboutMe) {
            aboutMe.addEventListener('blur', function() {
                window.MySpace.profile.widgets.aboutMe.content = this.innerHTML;
                window.MySpace.saveProfile();
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
                    window.MySpace.profile.widgets.interests[key] = this.textContent.trim();
                    window.MySpace.saveProfile();
                });
            }
        });
    }

    // Comments Widget
    function setupCommentsWidget() {
        const addCommentBtn = document.getElementById('add-comment-btn');
        const commentAuthor = document.getElementById('comment-author');
        const commentText = document.getElementById('comment-text');
        const commentsList = document.getElementById('comments-list');

        // Load existing comments
        loadComments();

        // Add comment button
        if (addCommentBtn) {
            addCommentBtn.addEventListener('click', function() {
                const author = commentAuthor.value.trim();
                const text = commentText.value.trim();

                if (!author || !text) {
                    alert('Please enter both your name and comment!');
                    return;
                }

                const comment = {
                    id: Date.now(),
                    author: author,
                    text: text,
                    date: new Date().toISOString()
                };

                window.MySpace.profile.widgets.comments.entries.unshift(comment);
                window.MySpace.saveProfile();

                // Clear inputs
                commentAuthor.value = '';
                commentText.value = '';

                // Reload comments display
                loadComments();
            });
        }

        // Allow Enter to submit comment
        if (commentText) {
            commentText.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    if (addCommentBtn) addCommentBtn.click();
                }
            });
        }
    }

    function loadComments() {
        const commentsList = document.getElementById('comments-list');
        if (!commentsList) return;

        const comments = window.MySpace.profile.widgets.comments.entries;

        if (comments.length === 0) {
            commentsList.innerHTML = '<p style="opacity: 0.6; text-align: center; padding: 20px;">No comments yet. Be the first!</p>';
            return;
        }

        commentsList.innerHTML = '';

        comments.forEach(comment => {
            const commentDiv = document.createElement('div');
            commentDiv.className = 'comment-item';

            const date = new Date(comment.date);
            const dateStr = formatCommentDate(date);

            commentDiv.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(comment.author)}</span>
                    <span class="comment-date">${dateStr}</span>
                </div>
                <div class="comment-text">${escapeHtml(comment.text)}</div>
                <button class="comment-delete" data-id="${comment.id}">Delete</button>
            `;

            commentsList.appendChild(commentDiv);
        });

        // Add delete handlers
        const deleteBtns = commentsList.querySelectorAll('.comment-delete');
        deleteBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                deleteComment(id);
            });
        });
    }

    function deleteComment(id) {
        window.MySpace.profile.widgets.comments.entries =
            window.MySpace.profile.widgets.comments.entries.filter(c => c.id !== id);
        window.MySpace.saveProfile();
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
    function setupTopFriendsWidget() {
        const friendsSlots = document.getElementById('friends-slots');
        const friendsGrid = document.getElementById('friends-grid');

        // Load friends
        loadFriendsGrid();

        // Slots selector
        if (friendsSlots) {
            friendsSlots.value = window.MySpace.profile.widgets.topFriends.slots;

            friendsSlots.addEventListener('change', function() {
                window.MySpace.profile.widgets.topFriends.slots = parseInt(this.value);
                if (friendsGrid) {
                    friendsGrid.dataset.slots = this.value;
                }
                window.MySpace.saveProfile();
                loadFriendsGrid();
            });
        }
    }

    function loadFriendsGrid() {
        const friendsGrid = document.getElementById('friends-grid');
        if (!friendsGrid) return;

        const slots = window.MySpace.profile.widgets.topFriends.slots;
        const friends = window.MySpace.profile.widgets.topFriends.friends;

        friendsGrid.innerHTML = '';
        friendsGrid.dataset.slots = slots;

        for (let i = 0; i < slots; i++) {
            const friend = friends[i];
            const slotDiv = document.createElement('div');
            slotDiv.className = 'friend-slot';
            slotDiv.dataset.index = i;

            if (friend && friend.image) {
                slotDiv.innerHTML = `
                    <img src="${friend.image}" alt="${friend.name}">
                    <div class="friend-name">${escapeHtml(friend.name)}</div>
                `;
            } else {
                slotDiv.innerHTML = '<div class="add-friend-btn">+</div>';
            }

            slotDiv.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                if (friend && friend.image) {
                    // Remove friend
                    if (confirm(`Remove ${friend.name}?`)) {
                        window.MySpace.profile.widgets.topFriends.friends.splice(index, 1);
                        window.MySpace.saveProfile();
                        loadFriendsGrid();
                    }
                } else {
                    // Add friend
                    addFriend(index);
                }
            });

            friendsGrid.appendChild(slotDiv);
        }
    }

    function addFriend(index) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.addEventListener('change', async function() {
            const file = this.files[0];
            if (file && file.type.startsWith('image/')) {
                const name = prompt('Friend\'s name:');
                if (!name) return;

                try {
                    // Upload to server
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('type', 'friend');

                    const response = await fetch('/api/myspace/upload', {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const friend = {
                            name: name,
                            image: data.url
                        };

                        window.MySpace.profile.widgets.topFriends.friends[index] = friend;
                        await window.MySpace.saveProfile();
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
        const applyBtn = document.getElementById('apply-custom-html');
        const customHtmlOutput = document.getElementById('custom-html-output');

        // Load saved HTML
        if (customHtmlInput) {
            customHtmlInput.value = window.MySpace.profile.widgets.customHtml.html;
        }

        if (customHtmlOutput && window.MySpace.profile.widgets.customHtml.html) {
            customHtmlOutput.innerHTML = window.MySpace.profile.widgets.customHtml.html;
        }

        // Apply button
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                const html = customHtmlInput.value;
                window.MySpace.profile.widgets.customHtml.html = html;
                window.MySpace.saveProfile();

                if (customHtmlOutput) {
                    customHtmlOutput.innerHTML = html;
                }
            });
        }
    }

    // Profile Uploads
    function setupProfileUploads() {
        // Banner upload
        const bannerUpload = document.getElementById('banner-upload');
        if (bannerUpload) {
            bannerUpload.addEventListener('change', async function() {
                const file = this.files[0];
                if (file && file.type.startsWith('image/')) {
                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'banner');

                        const response = await fetch('/api/myspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.MySpace.profile.profile.bannerImage = data.url;
                            await window.MySpace.saveProfile();

                            const banner = document.getElementById('banner-image');
                            if (banner) {
                                banner.style.backgroundImage = `url(${data.url})`;
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
                if (confirm('Remove banner image?')) {
                    window.MySpace.profile.profile.bannerImage = '';
                    window.MySpace.saveProfile();

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
                const file = this.files[0];
                if (file && file.type.startsWith('image/')) {
                    try {
                        // Upload to server
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'profile');

                        const response = await fetch('/api/myspace/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            const data = await response.json();
                            window.MySpace.profile.profile.profilePic = data.url;
                            await window.MySpace.saveProfile();

                            const profilePic = document.getElementById('profile-pic');
                            if (profilePic) {
                                profilePic.src = data.url;
                                profilePic.style.display = 'block';
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
                if (confirm('Remove profile picture?')) {
                    window.MySpace.profile.profile.profilePic = '';
                    window.MySpace.saveProfile();

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
        if (window.MySpace.profile.profile.bannerImage) {
            const removeBtn = document.getElementById('remove-banner-btn');
            if (removeBtn) removeBtn.style.display = 'block';
        }
        if (window.MySpace.profile.profile.profilePic) {
            const removeBtn = document.getElementById('remove-profile-pic-btn');
            if (removeBtn) removeBtn.style.display = 'flex';
        }
    }

    // Helper: Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

})();
