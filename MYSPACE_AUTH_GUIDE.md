# MySpace Authentication & Database System - User Guide

## Overview

The MySpace page now has a complete authentication and database system that allows:
- Creating user accounts with secure password hashing
- Saving and publishing profiles permanently
- Viewing other users' published profiles
- Making local changes without login (temporary)
- Server-side media storage (no localStorage quota issues)

## How to Use

### Starting the Servers

1. **Backend Server** (Port 4000):
   ```bash
   cd backend
   python app.py
   ```

2. **Frontend Server** (Port 8000):
   ```bash
   cd frontend
   python -m http.server 8000
   ```

### Creating an Account

1. Open http://localhost:8000/myspace.html
2. Look for the "Account" section in the left sidebar
3. Click "Sign Up" button
4. Enter a username (min 3 characters, letters/numbers/underscores only)
5. Enter a password (min 6 characters)
6. Click "Sign Up"
7. You're automatically logged in!

### Customizing Your Profile

1. **While Logged In**:
   - All changes are saved locally as you make them
   - Click "💾 Save & Publish Profile" when you're happy with your page
   - This makes your profile visible to others

2. **Without Login**:
   - You can still customize everything
   - Changes are temporary (session storage)
   - Warning message: "⚠️ Not logged in - changes are temporary!"
   - Must log in to publish

### Viewing Other Profiles

1. Get another user's URL: `http://localhost:8000/myspace.html?user=theirusername`
2. Visit their page - it loads in view-only mode
3. Banner shows "Viewing {username}'s Profile"
4. Visit counter increments
5. Click "Back to My Profile" to return to editing your own

### Features

#### Uploads (All Server-Side):
- Banner images
- Profile pictures
- Friend images
- Picture wall photos
- Audio files
- Background images

All media is stored on the server in `backend/myspace_data/{user_id}/` folders.

#### Profile Data:
- Stored in SQLite database (`backend/myspace_data/myspace.db`)
- Passwords hashed with PBKDF2-SHA256 (100,000 iterations)
- Profile JSON stored per user
- Visit tracking

## Database Schema

### Users Table
- `id`: Auto-increment primary key
- `username`: Unique username
- `password_hash`: Hashed password
- `salt`: Random salt for password
- `created_at`: Account creation time
- `last_login`: Last login timestamp
- `profile_published`: Boolean - is profile visible to others?

### Profiles Table
- `id`: Auto-increment primary key
- `user_id`: Foreign key to users table
- `profile_data`: JSON blob with all customizations
- `last_modified`: Last save timestamp
- `visits`: Visit counter

### Friendships Table
- `id`: Auto-increment primary key
- `user_id`: User ID
- `friend_id`: Friend's user ID
- `created_at`: Friendship creation time
- Bidirectional relationships (both users get a row)

## API Endpoints

### Authentication
- `POST /api/myspace/register` - Create account
- `POST /api/myspace/login` - Login
- `POST /api/myspace/logout` - Logout
- `GET /api/myspace/me` - Get current user info

### Profiles
- `GET /api/myspace/profile/load` - Load own profile (requires auth)
- `POST /api/myspace/profile/save` - Save own profile (requires auth)
- `POST /api/myspace/profile/publish` - Publish profile (requires auth)
- `GET /api/myspace/profile/<username>` - View published profile

### Media
- `POST /api/myspace/upload` - Upload media file
- `GET /api/myspace/media/<user_id>/<filename>` - Serve media file

### Friends
- `GET /api/myspace/friends` - Get friends list
- `POST /api/myspace/friends/add` - Add friend
- `POST /api/myspace/friends/remove` - Remove friend
- `GET /api/myspace/search?q=<query>` - Search users

## Testing Steps

1. **Create First Account**:
   - Sign up as "user1" with password "password123"
   - Customize profile (change theme, upload banner, etc.)
   - Click "Save & Publish Profile"

2. **Create Second Account**:
   - Open browser incognito/private window
   - Go to http://localhost:8000/myspace.html
   - Sign up as "user2" with password "password456"
   - Customize differently

3. **View Profiles**:
   - In user2's window, visit: http://localhost:8000/myspace.html?user=user1
   - See user1's published profile
   - Verify visit counter increases

4. **Logout/Login Test**:
   - Log out from user1 account
   - Close browser
   - Open again, login as user1
   - Verify profile is restored exactly as saved

## Files Modified/Created

### Backend
- `myspace_db.py` - Database models and functions (NEW)
- `app.py` - Added auth endpoints (lines 1895-2207)

### Frontend
- `js/myspace-auth.js` - Authentication UI and logic (NEW)
- `js/myspace-core.js` - Initialize profile with default to prevent null errors
- `js/myspace-customizer.js` - Updated background upload to use server
- `myspace.html` - Added auth modal and account section
- `css/myspace-base.css` - Added auth UI styling

## Security Features

1. **Password Hashing**: PBKDF2-HMAC-SHA256 with 100,000 iterations
2. **Salting**: Unique 32-byte random salt per user
3. **Session Management**: Flask sessions with secret key
4. **Input Validation**: Username/password requirements enforced
5. **SQL Injection Protection**: Parameterized queries
6. **XSS Protection**: HTML escaping in widgets

## Troubleshooting

### "Profile not loading"
- Check if backend server is running on port 4000
- Check browser console for errors
- Clear browser cache and refresh

### "Can't upload files"
- Verify `/api/myspace/upload` endpoint is accessible
- Check server logs for errors
- Ensure `myspace_data` directory exists with write permissions

### "Database errors"
- Check if `myspace_data/myspace.db` exists
- Verify myspace_db.py is in backend directory
- Check server console for SQL errors

### "Login not working"
- Verify Flask session secret key is set
- Check browser cookies are enabled
- Look for errors in server console

## Future Enhancements

- Friend requests and approval system
- Comments on profiles
- Profile search and discovery
- Activity feed
- Messaging system
- Profile analytics
