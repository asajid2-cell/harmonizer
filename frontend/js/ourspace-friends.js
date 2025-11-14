// OurSpace Friends & Messages System

(function() {
    'use strict';

    window.OurSpaceFriends = {
        // Send friend request
        sendFriendRequest: async function(username) {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                alert('You must be logged in to add friends');
                return false;
            }

            try {
                const response = await fetch('/api/ourspace/friends/request/send', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: username})
                });

                const data = await response.json();

                if (response.ok) {
                    alert(`Friend request sent to ${username}!`);
                    return true;
                } else {
                    alert(data.error || 'Failed to send friend request');
                    return false;
                }
            } catch (e) {
                console.error('[Friends] Error sending friend request:', e);
                alert('Error sending friend request');
                return false;
            }
        },

        // Get pending friend requests
        getFriendRequests: async function() {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                return [];
            }

            try {
                const response = await fetch('/api/ourspace/friends/requests');
                if (response.ok) {
                    const data = await response.json();
                    return data.requests || [];
                }
                return [];
            } catch (e) {
                console.error('[Friends] Error getting friend requests:', e);
                return [];
            }
        },

        // Accept friend request
        acceptFriendRequest: async function(requestId) {
            try {
                const response = await fetch('/api/ourspace/friends/request/accept', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({request_id: requestId})
                });

                if (response.ok) {
                    return true;
                } else {
                    return false;
                }
            } catch (e) {
                console.error('[Friends] Error accepting request:', e);
                return false;
            }
        },

        // Reject friend request
        rejectFriendRequest: async function(requestId) {
            try {
                const response = await fetch('/api/ourspace/friends/request/reject', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({request_id: requestId})
                });

                return response.ok;
            } catch (e) {
                console.error('[Friends] Error rejecting request:', e);
                return false;
            }
        },

        // Send message
        sendMessage: async function(toUsername, subject, body) {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                alert('You must be logged in to send messages');
                return false;
            }

            try {
                const response = await fetch('/api/ourspace/messages/send', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        to_username: toUsername,
                        subject: subject,
                        body: body
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    alert(`Message sent to ${toUsername}!`);
                    return true;
                } else {
                    alert(data.error || 'Failed to send message');
                    return false;
                }
            } catch (e) {
                console.error('[Messages] Error sending message:', e);
                alert('Error sending message');
                return false;
            }
        },

        // Get inbox
        getInbox: async function() {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                return [];
            }

            try {
                const response = await fetch('/api/ourspace/messages/inbox');
                if (response.ok) {
                    const data = await response.json();
                    return data.messages || [];
                }
                return [];
            } catch (e) {
                console.error('[Messages] Error getting inbox:', e);
                return [];
            }
        },

        // Block user
        blockUser: async function(username) {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                alert('You must be logged in to block users');
                return false;
            }

            if (!confirm(`Are you sure you want to block ${username}?`)) {
                return false;
            }

            try {
                const response = await fetch('/api/ourspace/block', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: username})
                });

                const data = await response.json();

                if (response.ok) {
                    alert(`${username} has been blocked`);
                    // Refresh block list if it's open
                    if (document.querySelector('.blocklist-modal.active')) {
                        this.showBlockList();
                    }
                    return true;
                } else {
                    alert(data.error || 'Failed to block user');
                    return false;
                }
            } catch (e) {
                console.error('[Block] Error blocking user:', e);
                alert('Error blocking user');
                return false;
            }
        },

        // Unblock user
        unblockUser: async function(username) {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                alert('You must be logged in to unblock users');
                return false;
            }

            if (!confirm(`Are you sure you want to unblock ${username}?`)) {
                return false;
            }

            try {
                const response = await fetch('/api/ourspace/unblock', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: username})
                });

                const data = await response.json();

                if (response.ok) {
                    alert(`${username} has been unblocked`);
                    // Refresh block list
                    this.showBlockList();
                    return true;
                } else {
                    alert(data.error || 'Failed to unblock user');
                    return false;
                }
            } catch (e) {
                console.error('[Block] Error unblocking user:', e);
                alert('Error unblocking user');
                return false;
            }
        },

        // Show block list
        showBlockList: async function() {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
                alert('You must be logged in to view blocked users');
                return;
            }

            try {
                const response = await fetch('/api/ourspace/blocked');
                if (!response.ok) {
                    throw new Error('Failed to fetch blocked users');
                }

                const data = await response.json();
                const blockedUsers = data.blocked || [];

                // Create or get modal
                let modal = document.querySelector('.blocklist-modal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.className = 'blocklist-modal';
                    document.body.appendChild(modal);
                }

                let html = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h2>Blocked Users</h2>
                            <button class="close-btn">&times;</button>
                        </div>
                        <div class="modal-body">
                `;

                if (blockedUsers.length === 0) {
                    html += '<p style="text-align: center; padding: 20px; opacity: 0.6;">No blocked users</p>';
                } else {
                    html += '<div class="blocked-users-list">';
                    blockedUsers.forEach(user => {
                        html += `
                            <div class="blocked-user-item">
                                <span class="blocked-username">${escapeHtml(user.blocked_username)}</span>
                                <span class="blocked-date">${new Date(user.created_at).toLocaleDateString()}</span>
                                <button class="unblock-btn" data-username="${escapeHtml(user.blocked_username)}">Unblock</button>
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
                modal.querySelector('.close-btn').addEventListener('click', () => {
                    modal.classList.remove('active');
                });

                // Click outside to close
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.classList.remove('active');
                    }
                });

                // Unblock buttons
                modal.querySelectorAll('.unblock-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const username = btn.dataset.username;
                        this.unblockUser(username);
                    });
                });

            } catch (e) {
                console.error('[Block] Error loading blocked users:', e);
                alert('Error loading blocked users');
            }
        },

        // Show friend request dialog
        showAddFriendDialog: function() {
            const username = prompt('Enter username to add as friend:');
            if (username && username.trim()) {
                this.sendFriendRequest(username.trim());
            }
        },

        // Show send message dialog
        showSendMessageDialog: function(toUsername) {
            if (!toUsername) {
                toUsername = prompt('Enter username to send message to:');
                if (!toUsername || !toUsername.trim()) return;
                toUsername = toUsername.trim();
            }

            const subject = prompt('Message subject:', 'Hey!');
            if (!subject) return;

            const body = prompt('Message:', '');
            if (!body) return;

            this.sendMessage(toUsername, subject, body);
        },

        // Show share profile dialog
        showShareProfileDialog: function() {
            if (!window.OurSpaceAuth || !window.OurSpaceAuth.currentUser) {
                alert('You must be logged in');
                return;
            }

            const username = window.OurSpaceAuth.currentUser.username;
            let profileUrl = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username)}`;
            if (window.OurSpace && typeof window.OurSpace.getProfileShareUrl === 'function') {
                profileUrl = window.OurSpace.getProfileShareUrl(username);
            }

            const message = `Check out my OurSpace profile!\n\n${profileUrl}\n\nYou can also send this link to a friend's inbox.`;

            if (confirm(message + '\n\nCopy link to clipboard?')) {
                navigator.clipboard.writeText(profileUrl).then(() => {
                    alert('Profile link copied to clipboard!');
                }).catch(() => {
                    prompt('Copy this link:', profileUrl);
                });
            }
        },

        refreshInboxUI: function() {
            return refreshInbox();
        },

        markMessageRead: async function(messageId) {
            try {
                const response = await fetch('/api/ourspace/messages/read', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ message_id: messageId })
                });
                return response.ok;
            } catch (e) {
                console.error('[Messages] Error marking read:', e);
                return false;
            }
        },

        deleteInboxMessage: async function(messageId) {
            try {
                const response = await fetch('/api/ourspace/messages/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ message_id: messageId })
                });
                return response.ok;
            } catch (e) {
                console.error('[Messages] Error deleting message:', e);
                return false;
            }
        },

        fetchPublishedUsers: async function(query = '', limit = 60) {
            try {
                const params = new URLSearchParams();
                if (query) params.set('q', query);
                params.set('limit', String(limit));
                const response = await fetch(`/api/ourspace/users?${params.toString()}`);
                if (response.ok) {
                    const data = await response.json();
                    return data.users || [];
                }
            } catch (e) {
                console.error('[Friends] Error fetching users:', e);
            }
            return [];
        }
    };

    // Initialize when DOM is ready
    window.addEventListener('DOMContentLoaded', function() {
        setupContactButtons();
        setupContactTabs();
        setupAccountsTab();
    });

    function setupContactButtons() {
        const contactButtons = document.querySelectorAll('.contact-btn');

        contactButtons.forEach(button => {
            const text = button.textContent;

            if (text.includes('Send Message')) {
                button.addEventListener('click', function() {
                    // If viewing another user's profile, send to them
                    const viewingUser = getViewingUsername();
                    if (viewingUser) {
                        window.OurSpaceFriends.showSendMessageDialog(viewingUser);
                    } else {
                        window.OurSpaceFriends.showSendMessageDialog();
                    }
                });
            } else if (text.includes('Add to Friends')) {
                button.addEventListener('click', function() {
                    const viewingUser = getViewingUsername();
                    if (viewingUser) {
                        window.OurSpaceFriends.sendFriendRequest(viewingUser);
                    } else {
                        window.OurSpaceFriends.showAddFriendDialog();
                    }
                });
            } else if (text.includes('Forward to Friend')) {
                button.addEventListener('click', function() {
                    window.OurSpaceFriends.showShareProfileDialog();
                });
            } else if (text.includes('Block User')) {
                button.addEventListener('click', function() {
                    const viewingUser = getViewingUsername();
                    if (viewingUser) {
                        window.OurSpaceFriends.blockUser(viewingUser);
                    } else {
                        const username = prompt('Enter username to block:');
                        if (username && username.trim()) {
                            window.OurSpaceFriends.blockUser(username.trim());
                        }
                    }
                });
            } else if (text.includes('View Blocked Users')) {
                button.addEventListener('click', function() {
                    window.OurSpaceFriends.showBlockList();
                });
            }
        });
    }

    function setupContactTabs() {
        const tabs = document.querySelectorAll('.contact-tab');
        const contents = document.querySelectorAll('.contact-tab-content');
        if (!tabs.length) return;

        tabs.forEach(tab => {
            tab.addEventListener('click', function() {
                const target = this.dataset.tab;
                tabs.forEach(btn => btn.classList.toggle('active', btn === this));
                contents.forEach(panel => panel.classList.toggle('active', panel.dataset.tab === target));
                if (target === 'inbox') {
                    window.OurSpaceFriends.refreshInboxUI();
                } else if (target === 'accounts') {
                    refreshAccountsList();
                }
            });
        });
    }

    let accountsSearchTimer = null;

    function setupAccountsTab() {
        const searchInput = document.getElementById('accounts-search');
        const list = document.getElementById('accounts-list');
        if (!searchInput || !list) return;

        searchInput.addEventListener('input', function() {
            clearTimeout(accountsSearchTimer);
            accountsSearchTimer = setTimeout(() => {
                loadAccountsList(this.value.trim());
            }, 300);
        });

        list.addEventListener('click', (event) => {
            const addBtn = event.target.closest('[data-action="account-add"]');
            if (addBtn) {
                const username = addBtn.dataset.username;
                if (username) {
                    window.OurSpaceFriends.sendFriendRequest(username);
                }
            }
        });

        loadAccountsList('');
    }

    function refreshAccountsList() {
        const input = document.getElementById('accounts-search');
        if (!input) return;
        loadAccountsList(input.value.trim());
    }

    async function loadAccountsList(query = '') {
        const list = document.getElementById('accounts-list');
        if (!list) return;

        list.innerHTML = '<p class="inbox-empty">Loading profiles...</p>';
        const users = await window.OurSpaceFriends.fetchPublishedUsers(query);
        renderAccountsList(users);
    }

    function renderAccountsList(users) {
        const list = document.getElementById('accounts-list');
        if (!list) return;

        if (!users.length) {
            list.innerHTML = '<p class="inbox-empty">No users found.</p>';
            return;
        }

        list.innerHTML = '';
        users.forEach(user => {
            const item = document.createElement('div');
            item.className = 'account-item';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'account-name';
            nameSpan.textContent = user.username;

            const actions = document.createElement('div');
            actions.className = 'account-actions';

            const visitLink = document.createElement('a');
            visitLink.className = 'visit-btn';
            visitLink.href = `/ourspace.html?user=${encodeURIComponent(user.username)}`;
            visitLink.target = '_blank';
            visitLink.rel = 'noopener';
            visitLink.textContent = 'Visit';

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.dataset.action = 'account-add';
            addBtn.dataset.username = user.username;
            addBtn.textContent = 'Add Friend';

            actions.appendChild(visitLink);
            actions.appendChild(addBtn);

            item.appendChild(nameSpan);
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    async function refreshInbox() {
        const inboxLists = document.getElementById('inbox-lists');
        const loginMessage = document.getElementById('inbox-login-message');
        if (!inboxLists || !loginMessage) return;

        if (!window.OurSpaceAuth || !window.OurSpaceAuth.isAuthenticated) {
            loginMessage.textContent = 'Log in to view your inbox.';
            loginMessage.style.display = 'block';
            inboxLists.style.display = 'none';
            return;
        }

        loginMessage.style.display = 'none';
        inboxLists.style.display = 'flex';
        inboxLists.style.flexDirection = 'column';

        const [messages, requests] = await Promise.all([
            window.OurSpaceFriends.getInbox(),
            window.OurSpaceFriends.getFriendRequests()
        ]);

        renderMessages(messages);
        renderFriendRequests(requests);
    }

    function renderMessages(messages) {
        const container = document.getElementById('inbox-messages');
        if (!container) return;

        if (!messages.length) {
            container.innerHTML = '<p class="inbox-empty">No messages yet.</p>';
            return;
        }

        container.innerHTML = '';
        messages.forEach(message => {
            const item = document.createElement('div');
            item.className = 'inbox-item';

            const statusClass = message.read ? 'read' : 'unread';
            const snippet = truncateText(message.body || '', 160);
            const actions = [];
            if (!message.read) {
                actions.push(`<button data-action="mark-read" data-id="${message.id}">Mark Read</button>`);
            }
            actions.push(`<button data-action="reply" data-username="${message.from_username}">Reply</button>`);
            actions.push(`<button data-action="delete" data-id="${message.id}">Delete</button>`);

            item.innerHTML = `
                <div class="inbox-meta">
                    <span>From <strong>${safeText(message.from_username)}</strong></span>
                    <span class="inbox-pill ${statusClass}">${statusClass === 'read' ? 'Read' : 'New'}</span>
                </div>
                <div class="inbox-body">
                    <strong>${safeText(message.subject || 'No subject')}</strong><br>
                    ${safeText(snippet)}
                </div>
                <div class="inbox-meta">
                    <span>${formatInboxDate(message.created_at)}</span>
                </div>
                <div class="inbox-actions">
                    ${actions.join('')}
                </div>
            `;

            const buttons = item.querySelectorAll('.inbox-actions button');
            buttons.forEach(button => {
                const action = button.dataset.action;
                if (action === 'mark-read') {
                    button.addEventListener('click', async () => {
                        const ok = await window.OurSpaceFriends.markMessageRead(button.dataset.id);
                        if (ok) {
                            refreshInbox();
                        } else {
                            alert('Unable to mark message as read.');
                        }
                    });
                } else if (action === 'reply') {
                    button.addEventListener('click', () => {
                        window.OurSpaceFriends.showSendMessageDialog(button.dataset.username);
                    });
                } else if (action === 'delete') {
                    button.addEventListener('click', async () => {
                        if (!confirm('Delete this message?')) return;
                        const ok = await window.OurSpaceFriends.deleteInboxMessage(button.dataset.id);
                        if (ok) {
                            refreshInbox();
                        } else {
                            alert('Unable to delete message.');
                        }
                    });
                }
            });

            container.appendChild(item);
        });
    }

    function renderFriendRequests(requests) {
        const container = document.getElementById('inbox-requests');
        if (!container) return;

        if (!requests.length) {
            container.innerHTML = '<p class="inbox-empty">No pending requests.</p>';
            return;
        }

        container.innerHTML = '';
        requests.forEach(request => {
            const item = document.createElement('div');
            item.className = 'inbox-item';
            item.innerHTML = `
                <div class="inbox-body">
                    <strong>${safeText(request.username)}</strong> wants to be your friend.
                </div>
                <div class="inbox-meta">
                    <span>${formatInboxDate(request.created_at)}</span>
                </div>
                <div class="inbox-actions">
                    <button data-action="accept" data-id="${request.id}">Accept</button>
                    <button data-action="reject" data-id="${request.id}">Reject</button>
                </div>
            `;

            const acceptBtn = item.querySelector('[data-action="accept"]');
            const rejectBtn = item.querySelector('[data-action="reject"]');

            if (acceptBtn) {
                acceptBtn.addEventListener('click', async () => {
                    const ok = await window.OurSpaceFriends.acceptFriendRequest(parseInt(acceptBtn.dataset.id, 10));
                    if (!ok) {
                        alert('Unable to accept request.');
                    }
                    refreshInbox();
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener('click', async () => {
                    const ok = await window.OurSpaceFriends.rejectFriendRequest(parseInt(rejectBtn.dataset.id, 10));
                    if (!ok) {
                        alert('Unable to reject request.');
                    }
                    refreshInbox();
                });
            }

            container.appendChild(item);
        });
    }

    function formatInboxDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '';
        }
        return date.toLocaleString();
    }

    function truncateText(text, max) {
        if (!text) return '';
        if (text.length <= max) return text;
        return `${text.slice(0, max - 1)}\u2026`;
    }

    function safeText(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(text || '').replace(/[&<>"']/g, chr => map[chr]);
    }

    function getViewingUsername() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('user');
    }

})();





