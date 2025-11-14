# MySpace Password Reset Feature

## Overview

Added a secure password reset feature that requires an admin password to reset any user's password.

## Admin Password

**Admin Password:** ``

- Stored securely in the database with PBKDF2-SHA256 hashing
- Required to reset any user's password
- Cannot be changed through the UI (would need database access)

## How to Use

### Resetting Your Password

1. Go to http://localhost:8000/myspace.html
2. Click "Login" button
3. Click "Forgot password?" link at the bottom of the login modal
4. Enter the following:
   - **Username**: Your account username
   - **Admin Password**: ``
   - **New Password**: Your desired new password (min 6 characters)
5. Click "Reset Password"
6. If successful, you can now login with your new password

### Flow Details

**Login Modal:**
- Shows "Forgot password?" link
- Clicking it switches to Password Reset mode

**Password Reset Modal:**
- Fields shown:
  - Username (required)
  - Admin Password (required)
  - New Password (required, min 6 chars)
- "Back to Login" link to return to login

**Security:**
- Admin password is verified server-side
- User existence is checked
- Password is hashed with new salt before storing
- Invalid admin password results in error: "Password reset failed. Check username and admin password."

## Technical Implementation

### Backend

**Database (myspace_db.py):**
- Added `settings` table to store admin password hash and salt
- `verify_admin_password()` - Verifies admin password
- `reset_user_password()` - Resets user password with admin verification
- Admin password initialized on first database creation

**API Endpoint (app.py):**
- `POST /api/myspace/reset-password`
  - Body: `{ "username": "...", "admin_password": "...", "new_password": "..." }`
  - Returns: `{ "success": true, "message": "..." }` or error

### Frontend

**HTML (myspace.html):**
- Added admin password field (hidden by default)
- Added new password field (hidden by default)
- Added "Forgot password?" link in auth modal

**JavaScript (myspace-auth.js):**
- `showAuthModal('reset')` - Shows password reset form
- `resetPassword()` - Calls password reset API
- `handleAuthSubmit()` - Handles all three modes: login, register, reset

**CSS (myspace-base.css):**
- Uses existing auth modal styles
- Fields dynamically shown/hidden based on mode

## Testing

1. **Create a test account:**
   ```
   Username: testuser
   Password: password123
   ```

2. **Logout** (if logged in)

3. **Click "Forgot password?"**

4. **Reset the password:**
   ```
   Username: testuser
   Admin Password: 
   New Password: newpassword123
   ```

5. **Login with new password:**
   ```
   Username: testuser
   Password: newpassword123
   ```

## Error Messages

- "Username, admin password, and new password are required" - Missing fields
- "New password must be at least 6 characters" - Password too short
- "Password reset failed. Check username and admin password." - Invalid admin password or username doesn't exist
- "Network error" - Cannot connect to server

## Security Notes

1. **Admin password is hashed** - Not stored in plain text
2. **Separate salt** - Admin password uses its own salt
3. **Server-side verification** - All checks happen on backend
4. **No user enumeration** - Same error for invalid username or admin password
5. **Console logging** - Server logs show password reset attempts

## Database Schema

**settings table:**
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

**Current entries:**
- `admin_password_hash` - Hashed admin password
- `admin_password_salt` - Salt for admin password

## Future Enhancements

- Email verification for password reset
- Temporary reset tokens instead of admin password
- Password reset history/audit log
- Rate limiting on reset attempts
- Two-factor authentication
