// MySpace Authentication

(function() {
    'use strict';

    // Global auth state
    window.MySpaceAuth = {
        currentUser: null,
        isAuthenticated: false,

        syncCoreAuthState: function() {
            if (window.MySpace && typeof window.MySpace.setAuthState === 'function') {
                window.MySpace.setAuthState(this.isAuthenticated);
            }
        },

        // Check if user is logged in
        checkAuth: async function() {
            try {
                const response = await fetch('/api/myspace/me');
                const data = await response.json();

                if (data.authenticated) {
                    this.currentUser = {
                        id: data.user_id,
                        username: data.username
                    };
                    this.isAuthenticated = true;
                    this.syncCoreAuthState();
                    if (window.MySpace) {
                        window.MySpace.viewingUsername = data.username;
                    }
                    this.updateUI();

                    // Load user's profile from database
                    await this.loadUserProfile();

                    if (window.MySpaceComments && window.MySpaceComments.refresh) {
                        window.MySpaceComments.refresh();
                    }

                    return true;
                } else {
                    this.currentUser = null;
                    this.isAuthenticated = false;
                    this.syncCoreAuthState();
                    if (window.MySpace) {
                        window.MySpace.viewingUsername = null;
                    }
                    this.updateUI();
                    if (window.MySpaceFriends && window.MySpaceFriends.refreshInboxUI) {
                        window.MySpaceFriends.refreshInboxUI();
                    }
                    return false;
                }
            } catch (e) {
                console.error('[Auth] Error checking auth:', e);
                return false;
            }
        },

        // Register new user
        register: async function(username, password) {
            try {
                const response = await fetch('/api/myspace/register', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    this.currentUser = {
                        id: data.user_id,
                        username: data.username
                    };
                    this.isAuthenticated = true;
                    this.syncCoreAuthState();
                    if (window.MySpace) {
                        window.MySpace.viewingUsername = data.username;
                    }
                    this.updateUI();
                    if (window.MySpaceFriends && window.MySpaceFriends.refreshInboxUI) {
                        window.MySpaceFriends.refreshInboxUI();
                    }
                    if (window.MySpaceComments && window.MySpaceComments.refresh) {
                        window.MySpaceComments.refresh();
                    }
                    return { success: true };
                } else {
                    return { success: false, error: data.error || 'Registration failed' };
                }
            } catch (e) {
                console.error('[Auth] Error registering:', e);
                return { success: false, error: 'Network error' };
            }
        },

        // Login existing user
        login: async function(username, password) {
            try {
                const response = await fetch('/api/myspace/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    this.currentUser = {
                        id: data.user_id,
                        username: data.username
                    };
                    this.isAuthenticated = true;
                    this.syncCoreAuthState();
                    if (window.MySpace) {
                        window.MySpace.viewingUsername = data.username;
                    }
                    this.updateUI();

                    // Load user's profile from database
                    await this.loadUserProfile();

                    if (window.MySpaceFriends && window.MySpaceFriends.refreshInboxUI) {
                        window.MySpaceFriends.refreshInboxUI();
                    }
                    if (window.MySpaceComments && window.MySpaceComments.refresh) {
                        window.MySpaceComments.refresh();
                    }

                    return { success: true };
                } else {
                    return { success: false, error: data.error || 'Login failed' };
                }
            } catch (e) {
                console.error('[Auth] Error logging in:', e);
                return { success: false, error: 'Network error' };
            }
        },

        // Logout
        logout: async function() {
            try {
                await fetch('/api/myspace/logout', {
                    method: 'POST'
                });

                this.currentUser = null;
                this.isAuthenticated = false;
                this.syncCoreAuthState();
                if (window.MySpace) {
                    window.MySpace.viewingUsername = null;
                }
                this.updateUI();
                if (window.MySpaceFriends && window.MySpaceFriends.refreshInboxUI) {
                    window.MySpaceFriends.refreshInboxUI();
                }
                if (window.MySpaceComments && window.MySpaceComments.refresh) {
                    window.MySpaceComments.refresh();
                }

                // Reload page to reset state
                window.location.reload();
            } catch (e) {
                console.error('[Auth] Error logging out:', e);
            }
        },

        // Load user's profile from database
        loadUserProfile: async function() {
            try {
                const response = await fetch('/api/myspace/profile/load');

                if (response.ok) {
                    const profileData = await response.json();
                    if (profileData && window.MySpace) {
                        window.MySpace.profile = profileData;
                        window.MySpace.profileSource = 'database';
                        window.MySpace.profileLoadIssue = false;
                        if (typeof window.MySpace.clearProfileLoadWarning === 'function') {
                            window.MySpace.clearProfileLoadWarning();
                        }
                        if (typeof window.MySpace.updateProfileLoadWarning === 'function') {
                            window.MySpace.updateProfileLoadWarning();
                        }
                        if (typeof window.MySpace.setAuthState === 'function') {
                            window.MySpace.setAuthState(true);
                        }
                        if (typeof window.MySpace.backupProfileLocally === 'function') {
                            window.MySpace.backupProfileLocally();
                        }
                        // Reapply theme and reload content
                        if (window.MySpace.applyTheme) {
                            window.MySpace.applyTheme();
                        }
                        if (window.MySpace.loadContent) {
                            window.MySpace.loadContent();
                        }
                        if (window.MySpace.updateStats) {
                            window.MySpace.updateStats();
                        }
                        // Reload audio widget with saved audio
                        if (window.MySpaceAudio && window.MySpaceAudio.reloadAudio) {
                            window.MySpaceAudio.reloadAudio();
                        }
                        console.log('[Auth] Loaded user profile from database');
                    }
                }
            } catch (e) {
                console.error('[Auth] Error loading user profile:', e);
            }
        },

        // Save and publish profile
        saveAndPublish: async function() {
            if (!this.isAuthenticated) {
                alert('Please log in to publish your profile!');
                this.showAuthModal('login');
                return false;
            }

            if (window.MySpace && window.MySpace.isAuthenticated && window.MySpace.profileSource === 'default') {
                if (typeof window.MySpace.showProfileLoadWarning === 'function') {
                    window.MySpace.showProfileLoadWarning("We couldn't load your saved profile. Refresh before publishing.");
                }
                alert('Profile data has not loaded from the server yet. Please refresh or re-login before publishing to avoid overwriting your profile.');
                return false;
            }

            try {
                // First save the profile
                const saveResponse = await fetch('/api/myspace/profile/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(window.MySpace.profile)
                });

                if (!saveResponse.ok) {
                    throw new Error('Failed to save profile');
                }

                // Then publish it
                const publishResponse = await fetch('/api/myspace/profile/publish', {
                    method: 'POST'
                });

                if (!publishResponse.ok) {
                    throw new Error('Failed to publish profile');
                }

                alert('✅ Your profile has been saved and published!\nOthers can now view it at: myspace.html?user=' + this.currentUser.username);
                return true;
            } catch (e) {
                console.error('[Auth] Error saving and publishing:', e);
                alert('Failed to save and publish profile. Please try again.');
                return false;
            }
        },

        // Update UI based on auth state
        updateUI: function() {
            const authInfo = document.getElementById('auth-info');
            const authActions = document.getElementById('auth-actions');
            const savePublishBtn = document.getElementById('save-publish-btn');

            if (this.isAuthenticated && this.currentUser) {
                // Logged in
                if (authInfo) {
                    authInfo.innerHTML = `
                        <span class="auth-username">Logged in as: <strong>${this.currentUser.username}</strong></span>
                    `;
                }

                if (authActions) {
                    authActions.innerHTML = `
                        <button id="logout-btn" class="auth-btn">Logout</button>
                    `;

                    const logoutBtn = document.getElementById('logout-btn');
                    if (logoutBtn) {
                        logoutBtn.addEventListener('click', () => {
                            if (confirm('Are you sure you want to logout?')) {
                                this.logout();
                            }
                        });
                    }
                }

                if (savePublishBtn) {
                    savePublishBtn.style.display = 'block';
                }
            } else {
                // Not logged in
                if (authInfo) {
                    authInfo.innerHTML = `
                        <span class="auth-message">⚠️ Not logged in - changes are temporary!</span>
                    `;
                }

                if (authActions) {
                    authActions.innerHTML = `
                        <button id="login-btn" class="auth-btn">Login</button>
                        <button id="register-btn" class="auth-btn">Sign Up</button>
                    `;

                    const loginBtn = document.getElementById('login-btn');
                    const registerBtn = document.getElementById('register-btn');

                    if (loginBtn) {
                        loginBtn.addEventListener('click', () => {
                            this.showAuthModal('login');
                        });
                    }

                    if (registerBtn) {
                        registerBtn.addEventListener('click', () => {
                            this.showAuthModal('register');
                        });
                    }
                }

                if (savePublishBtn) {
                    savePublishBtn.style.display = 'none';
                }
            }

            if (window.MySpaceFriends && window.MySpaceFriends.refreshInboxUI) {
                window.MySpaceFriends.refreshInboxUI();
            }
        },

        // Show auth modal
        showAuthModal: function(mode) {
            const modal = document.getElementById('auth-modal');
            const modalTitle = document.getElementById('auth-modal-title');
            const authForm = document.getElementById('auth-form');
            const submitBtn = document.getElementById('auth-submit-btn');
            const switchLink = document.getElementById('auth-switch-link');
            const passwordGroup = document.getElementById('auth-password-group');
            const adminPasswordGroup = document.getElementById('auth-admin-password-group');
            const newPasswordGroup = document.getElementById('auth-new-password-group');
            const passwordField = document.getElementById('auth-password');
            const adminPasswordField = document.getElementById('auth-admin-password');
            const newPasswordField = document.getElementById('auth-new-password');

            if (!modal) return;

            modal.dataset.mode = mode;

            // Reset visibility
            if (passwordGroup) passwordGroup.style.display = 'block';
            if (adminPasswordGroup) adminPasswordGroup.style.display = 'none';
            if (newPasswordGroup) newPasswordGroup.style.display = 'none';
            if (passwordField) passwordField.required = true;
            if (adminPasswordField) adminPasswordField.required = false;
            if (newPasswordField) newPasswordField.required = false;

            if (mode === 'login') {
                modalTitle.textContent = 'Login to MySpace';
                submitBtn.textContent = 'Login';
                switchLink.innerHTML = 'Don\'t have an account? <a href="#" id="switch-to-register">Sign up</a><br><a href="#" id="forgot-password-link" style="margin-top: 5px; display: inline-block;">Forgot password?</a>';
            } else if (mode === 'register') {
                modalTitle.textContent = 'Create MySpace Account';
                submitBtn.textContent = 'Sign Up';
                switchLink.innerHTML = 'Already have an account? <a href="#" id="switch-to-login">Login</a>';
            } else if (mode === 'reset') {
                modalTitle.textContent = 'Reset Password';
                submitBtn.textContent = 'Reset Password';
                switchLink.innerHTML = '<a href="#" id="back-to-login">Back to Login</a>';

                // Show admin password and new password fields, hide regular password
                if (passwordGroup) passwordGroup.style.display = 'none';
                if (adminPasswordGroup) adminPasswordGroup.style.display = 'block';
                if (newPasswordGroup) newPasswordGroup.style.display = 'block';
                if (passwordField) passwordField.required = false;
                if (adminPasswordField) adminPasswordField.required = true;
                if (newPasswordField) newPasswordField.required = true;
            }

            // Set up switch links
            const switchToRegister = document.getElementById('switch-to-register');
            const switchToLogin = document.getElementById('switch-to-login');
            const forgotPasswordLink = document.getElementById('forgot-password-link');
            const backToLogin = document.getElementById('back-to-login');

            if (switchToRegister) {
                switchToRegister.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showAuthModal('register');
                });
            }

            if (switchToLogin) {
                switchToLogin.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showAuthModal('login');
                });
            }

            if (forgotPasswordLink) {
                forgotPasswordLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showAuthModal('reset');
                });
            }

            if (backToLogin) {
                backToLogin.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.showAuthModal('login');
                });
            }

            modal.style.display = 'flex';

            // Focus username field
            const usernameField = document.getElementById('auth-username');
            if (usernameField) {
                setTimeout(() => usernameField.focus(), 100);
            }
        },

        // Close auth modal
        closeAuthModal: function() {
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.style.display = 'none';
                // Clear form
                const form = document.getElementById('auth-form');
                if (form) form.reset();
                // Clear error
                const error = document.getElementById('auth-error');
                if (error) error.textContent = '';
            }
        },

        // Handle auth form submission
        handleAuthSubmit: async function(e) {
            e.preventDefault();

            const modal = document.getElementById('auth-modal');
            const mode = modal.dataset.mode;
            const username = document.getElementById('auth-username').value.trim();
            const errorEl = document.getElementById('auth-error');
            const submitBtn = document.getElementById('auth-submit-btn');

            // Clear previous error
            errorEl.textContent = '';

            if (mode === 'reset') {
                // Password reset mode
                const adminPassword = document.getElementById('auth-admin-password').value;
                const newPassword = document.getElementById('auth-new-password').value;

                // Validation
                if (!username || !adminPassword || !newPassword) {
                    errorEl.textContent = 'Please fill in all fields';
                    return;
                }

                if (newPassword.length < 6) {
                    errorEl.textContent = 'New password must be at least 6 characters';
                    return;
                }

                // Disable submit button
                submitBtn.disabled = true;
                submitBtn.textContent = 'Resetting...';

                const result = await this.resetPassword(username, adminPassword, newPassword);

                if (result.success) {
                    this.closeAuthModal();
                    alert('Password reset successfully! You can now login with your new password.');
                } else {
                    errorEl.textContent = result.error;
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Reset Password';
                }
            } else {
                // Login or register mode
                const password = document.getElementById('auth-password').value;

                // Validation
                if (!username || !password) {
                    errorEl.textContent = 'Please fill in all fields';
                    return;
                }

                // Disable submit button
                submitBtn.disabled = true;
                submitBtn.textContent = mode === 'login' ? 'Logging in...' : 'Signing up...';

                let result;
                if (mode === 'login') {
                    result = await this.login(username, password);
                } else {
                    result = await this.register(username, password);
                }

                if (result.success) {
                    this.closeAuthModal();
                    alert(`Welcome${mode === 'register' ? ' to MySpace' : ' back'}, ${username}!`);
                } else {
                    errorEl.textContent = result.error;
                    submitBtn.disabled = false;
                    submitBtn.textContent = mode === 'login' ? 'Login' : 'Sign Up';
                }
            }
        },

        // Reset password with admin password
        resetPassword: async function(username, adminPassword, newPassword) {
            try {
                const response = await fetch('/api/myspace/reset-password', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        username,
                        admin_password: adminPassword,
                        new_password: newPassword
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    return { success: true };
                } else {
                    return { success: false, error: data.error || 'Password reset failed' };
                }
            } catch (e) {
                console.error('[Auth] Error resetting password:', e);
                return { success: false, error: 'Network error' };
            }
        }
    };

    // Initialize when DOM is ready
    window.addEventListener('DOMContentLoaded', async function() {
        console.log('[Auth] Initializing...');

        // Check if user is logged in
        await window.MySpaceAuth.checkAuth();

        // Set up auth form submit handler
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', (e) => {
                window.MySpaceAuth.handleAuthSubmit(e);
            });
        }

        // Set up modal close handlers
        const closeModalBtn = document.getElementById('close-auth-modal');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                window.MySpaceAuth.closeAuthModal();
            });
        }

        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.addEventListener('click', (e) => {
                if (e.target === authModal) {
                    window.MySpaceAuth.closeAuthModal();
                }
            });
        }

        // Set up save & publish button
        const savePublishBtn = document.getElementById('save-publish-btn');
        if (savePublishBtn) {
            savePublishBtn.addEventListener('click', () => {
                window.MySpaceAuth.saveAndPublish();
            });
        }

        // Check if viewing another user's profile
        const urlParams = new URLSearchParams(window.location.search);
        const viewUser = urlParams.get('user');

        if (viewUser) {
            // Load and display another user's profile
            await loadOtherUserProfile(viewUser);
        }

        console.log('[Auth] Initialization complete');
    });

    // Load another user's profile
    async function loadOtherUserProfile(username) {
        try {
            const response = await fetch(`/api/myspace/profile/${encodeURIComponent(username)}`);

            if (!response.ok) {
                if (response.status === 404) {
                    alert(`User "${username}" not found.`);
                } else if (response.status === 403) {
                    alert(`${username}'s profile is not published yet.`);
                } else {
                    alert('Error loading profile.');
                }
                window.location.href = 'myspace.html';
                return;
            }

            const data = await response.json();

            if (data.data && window.MySpace) {
                // Load the profile into view-only mode
                window.MySpace.profile = data.data;
                window.MySpace.viewingUsername = data.username;
                window.MySpace.profileSource = 'published';
                window.MySpace.profileLoadIssue = false;
                if (typeof window.MySpace.clearProfileLoadWarning === 'function') {
                    window.MySpace.clearProfileLoadWarning();
                }
                if (typeof window.MySpace.updateProfileLoadWarning === 'function') {
                    window.MySpace.updateProfileLoadWarning();
                }
                window.MySpace.viewMode = true;
                window.MySpace.applyTheme();
                window.MySpace.loadContent();
                window.MySpace.applyViewMode();
                if (window.MySpaceComments && window.MySpaceComments.refresh) {
                    window.MySpaceComments.refresh();
                }

                // Update stats with visit count
                if (data.visits !== undefined) {
                    window.MySpace.profile.meta.visits = data.visits;
                    window.MySpace.updateStats();
                }

                // Reload audio widget with user's saved audio
                if (window.MySpaceAudio && window.MySpaceAudio.reloadAudio) {
                    window.MySpaceAudio.reloadAudio();
                }

                // Add banner showing whose profile this is
                addProfileOwnerBanner(data.username);

                console.log(`[Auth] Loaded ${username}'s profile`);
            }
        } catch (e) {
            console.error('[Auth] Error loading other user profile:', e);
            alert('Error loading profile.');
            window.location.href = 'myspace.html';
        }
    }

    // Add banner showing whose profile we're viewing
    function addProfileOwnerBanner(username) {
        const banner = document.createElement('div');
        banner.id = 'viewing-profile-banner';
        banner.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 10px 20px;
            text-align: center;
            z-index: 10002;
            font-family: 'Comic Sans MS', cursive;
            font-size: 14px;
            border-bottom: 3px solid #00ffff;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        `;
        banner.innerHTML = `
            <strong>Viewing ${username}'s Profile</strong>
            <a href="myspace.html" style="color: #00ffff; margin-left: 20px; text-decoration: underline;">Back to My Profile</a>
        `;
        document.body.insertBefore(banner, document.body.firstChild);

        // Adjust container padding
        const container = document.getElementById('myspace-container');
        if (container) {
            container.style.paddingTop = '100px';
        }
    }

})();
