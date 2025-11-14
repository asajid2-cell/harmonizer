# OurSpace Authentication & Database System - User Guide

## Overview

The OurSpace page now has a complete authentication and database system that allows:
- Creating user accounts with secure password hashing
- Saving and publishing profiles permanently
- Viewing other users' published profiles
- Making local changes without login (temporary)
- Server-side media storage (no localStorage quota issues)

> **Production host:** OurSpace is served from `https://ourspace.icu/ourspace.html`. Local development uses `http://localhost:4000/ourspace.html`.

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

1. Open http://localhost:8000/ourspace.html
2. Look for the "Account" section in the left sidebar
3. Click "Sign Up" button
4. Enter a username (min 3 characters, letters/numbers/underscores only)
5. Enter a password (min 6 characters)
6. Click "Sign Up"
7. You're automatically logged in!

### Customizing Your Profile

1. **While Logged In**:
   - All changes are saved locally as you make them
   - Click "ðŸ’¾ Save & Publish Profile" when you're happy with your page
   - This makes your profile visible to others

2. **Without Login**:
   - You can still customize everything
   - Changes are temporary (session storage)
   - Warning message: "⚠️ Not logged in - changes are temporary!"
   - Must log in to publish

### Viewing Other Profiles

1. Get another user's URL: `http://localhost:8000/ourspace.html?user=theirusername`
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

All media is stored on the server in `backend/ourspace_data/{user_id}/` folders.

#### Profile Data:
- Stored in SQLite database (`backend/ourspace_data/OurSpace.db`)
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
- `POST /api/ourspace/register` - Create account
- `POST /api/ourspace/login` - Login
- `POST /api/ourspace/logout` - Logout
- `GET /api/ourspace/me` - Get current user info

### Profiles
- `GET /api/ourspace/profile/load` - Load own profile (requires auth)
- `POST /api/ourspace/profile/save` - Save own profile (requires auth)
- `POST /api/ourspace/profile/publish` - Publish profile (requires auth)
- `GET /api/ourspace/profile/<username>` - View published profile

### Media
- `POST /api/ourspace/upload` - Upload media file
- `GET /api/ourspace/media/<user_id>/<filename>` - Serve media file

### Friends
- `GET /api/ourspace/friends` - Get friends list
- `POST /api/ourspace/friends/add` - Add friend
- `POST /api/ourspace/friends/remove` - Remove friend
- `GET /api/ourspace/search?q=<query>` - Search users

## Testing Steps

1. **Create First Account**:
   - Sign up as "user1" with password "password123"
   - Customize profile (change theme, upload banner, etc.)
   - Click "Save & Publish Profile"

2. **Create Second Account**:
   - Open browser incognito/private window
   - Go to http://localhost:8000/ourspace.html
   - Sign up as "user2" with password "password456"
   - Customize differently

3. **View Profiles**:
   - In user2's window, visit: http://localhost:8000/ourspace.html?user=user1
   - See user1's published profile
   - Verify visit counter increases

4. **Logout/Login Test**:
   - Log out from user1 account
   - Close browser
   - Open again, login as user1
   - Verify profile is restored exactly as saved

## Files Modified/Created

### Backend
- `ourspace_db.py` - Database models and functions (NEW)
- `app.py` - Added auth endpoints (lines 1895-2207)

### Frontend
- `js/ourspace-auth.js` - Authentication UI and logic (NEW)
- `js/ourspace-core.js` - Initialize profile with default to prevent null errors
- `js/ourspace-customizer.js` - Updated background upload to use server
- `ourspace.html` - Added auth modal and account section
- `css/ourspace-base.css` - Added auth UI styling

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
- Verify `/api/ourspace/upload` endpoint is accessible
- Check server logs for errors
- Ensure `ourspace_data` directory exists with write permissions

### "Database errors"
- Check if `ourspace_data/OurSpace.db` exists
- Verify ourspace_db.py is in backend directory
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









