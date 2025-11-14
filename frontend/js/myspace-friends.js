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
        }
    };

    // Initialize when DOM is ready
    window.addEventListener('DOMContentLoaded', function() {
        setupContactButtons();
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

    function getViewingUsername() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('user');
    }

})();
