// MySpace Friends & Messages System

(function() {
    'use strict';

    window.MySpaceFriends = {
        // Send friend request
        sendFriendRequest: async function(username) {
            if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
                alert('You must be logged in to add friends');
                return false;
            }

            try {
                const response = await fetch('/api/myspace/friends/request/send', {
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
            if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
                return [];
            }

            try {
                const response = await fetch('/api/myspace/friends/requests');
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
                const response = await fetch('/api/myspace/friends/request/accept', {
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
                const response = await fetch('/api/myspace/friends/request/reject', {
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
            if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
                alert('You must be logged in to send messages');
                return false;
            }

            try {
                const response = await fetch('/api/myspace/messages/send', {
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
            if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
                return [];
            }

            try {
                const response = await fetch('/api/myspace/messages/inbox');
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
            if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
                alert('You must be logged in to block users');
                return false;
            }

            if (!confirm(`Are you sure you want to block ${username}?`)) {
                return false;
            }

            try {
                const response = await fetch('/api/myspace/block', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({username: username})
                });

                const data = await response.json();

                if (response.ok) {
                    alert(`${username} has been blocked`);
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
            if (!window.MySpaceAuth || !window.MySpaceAuth.currentUser) {
                alert('You must be logged in');
                return;
            }

            const username = window.MySpaceAuth.currentUser.username;
            const profileUrl = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username)}`;

            const message = `Check out my MySpace profile!\n\n${profileUrl}\n\nYou can also send this link to a friend's inbox.`;

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
                const response = await fetch('/api/myspace/messages/read', {
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
                const response = await fetch('/api/myspace/messages/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ message_id: messageId })
                });
                return response.ok;
            } catch (e) {
                console.error('[Messages] Error deleting message:', e);
                return false;
            }
        }
    };

    // Initialize when DOM is ready
    window.addEventListener('DOMContentLoaded', function() {
        setupContactButtons();
        setupContactTabs();
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
                        window.MySpaceFriends.showSendMessageDialog(viewingUser);
                    } else {
                        window.MySpaceFriends.showSendMessageDialog();
                    }
                });
            } else if (text.includes('Add to Friends')) {
                button.addEventListener('click', function() {
                    const viewingUser = getViewingUsername();
                    if (viewingUser) {
                        window.MySpaceFriends.sendFriendRequest(viewingUser);
                    } else {
                        window.MySpaceFriends.showAddFriendDialog();
                    }
                });
            } else if (text.includes('Forward to Friend')) {
                button.addEventListener('click', function() {
                    window.MySpaceFriends.showShareProfileDialog();
                });
            } else if (text.includes('Block User')) {
                button.addEventListener('click', function() {
                    const viewingUser = getViewingUsername();
                    if (viewingUser) {
                        window.MySpaceFriends.blockUser(viewingUser);
                    } else {
                        const username = prompt('Enter username to block:');
                        if (username && username.trim()) {
                            window.MySpaceFriends.blockUser(username.trim());
                        }
                    }
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
                    window.MySpaceFriends.refreshInboxUI();
                }
            });
        });
    }

    async function refreshInbox() {
        const inboxLists = document.getElementById('inbox-lists');
        const loginMessage = document.getElementById('inbox-login-message');
        if (!inboxLists || !loginMessage) return;

        if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
            loginMessage.textContent = 'Log in to view your inbox.';
            loginMessage.style.display = 'block';
            inboxLists.style.display = 'none';
            return;
        }

        loginMessage.style.display = 'none';
        inboxLists.style.display = 'flex';
        inboxLists.style.flexDirection = 'column';

        const [messages, requests] = await Promise.all([
            window.MySpaceFriends.getInbox(),
            window.MySpaceFriends.getFriendRequests()
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
                        const ok = await window.MySpaceFriends.markMessageRead(button.dataset.id);
                        if (ok) {
                            refreshInbox();
                        } else {
                            alert('Unable to mark message as read.');
                        }
                    });
                } else if (action === 'reply') {
                    button.addEventListener('click', () => {
                        window.MySpaceFriends.showSendMessageDialog(button.dataset.username);
                    });
                } else if (action === 'delete') {
                    button.addEventListener('click', async () => {
                        if (!confirm('Delete this message?')) return;
                        const ok = await window.MySpaceFriends.deleteInboxMessage(button.dataset.id);
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
                    const ok = await window.MySpaceFriends.acceptFriendRequest(parseInt(acceptBtn.dataset.id, 10));
                    if (!ok) {
                        alert('Unable to accept request.');
                    }
                    refreshInbox();
                });
            }

            if (rejectBtn) {
                rejectBtn.addEventListener('click', async () => {
                    const ok = await window.MySpaceFriends.rejectFriendRequest(parseInt(rejectBtn.dataset.id, 10));
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
        return `${text.slice(0, max - 1)}…`;
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
