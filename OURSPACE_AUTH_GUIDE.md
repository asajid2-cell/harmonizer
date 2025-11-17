# OurSpace Authentication Guide

Complete user account system for saving and sharing customizable profiles.

## Quick Start

### Start Servers

```bash
# Backend (port 4000)
cd backend
python app.py

# Frontend (port 8000)
cd frontend
python -m http.server 8000
```

Visit `http://localhost:8000/ourspace.html`

Production: `https://ourspace.icu/ourspace.html`

## Features

- Secure account creation with password hashing
- Persistent profile storage (no localStorage limits)
- Public profile sharing via URLs
- Server-side media uploads
- Visit tracking

## Using OurSpace

### Create Account

1. Open OurSpace in browser
2. Click "Sign Up" in Account section
3. Enter username (3+ chars, alphanumeric + underscores)
4. Enter password (6+ chars)
5. Click "Sign Up"

### Customize Profile

**Logged in:**
- Changes save automatically
- Click "💾 Save & Publish Profile" to make public
- Profile becomes viewable at `?user=yourname`

**Not logged in:**
- Changes are temporary (session only)
- Warning shows: "⚠️ Not logged in - changes are temporary!"
- Must log in to publish

### View Others' Profiles

Visit: `http://localhost:8000/ourspace.html?user=username`

- Loads in view-only mode
- Shows "Viewing {username}'s Profile" banner
- Visit counter increments
- "Back to My Profile" returns to editing

## Uploads

All media stored server-side in `backend/ourspace_data/{user_id}/`:

- Banner images
- Profile pictures
- Friend images
- Picture wall photos
- Audio files
- Background images

## Database

SQLite database at `backend/ourspace_data/OurSpace.db`

### Tables

**users**
- Account info, usernames, password hashes
- PBKDF2-SHA256 (100k iterations) + random salt
- Login timestamps

**profiles**
- Profile customization JSON
- Publish status
- Visit counts

**friendships**
- User connections (bidirectional)

## API Endpoints

### Auth
- `POST /api/ourspace/register` - Create account
- `POST /api/ourspace/login` - Login
- `POST /api/ourspace/logout` - Logout
- `GET /api/ourspace/me` - Current user info

### Profiles
- `GET /api/ourspace/profile/load` - Load own profile
- `POST /api/ourspace/profile/save` - Save own profile
- `POST /api/ourspace/profile/publish` - Make profile public
- `GET /api/ourspace/profile/<username>` - View published profile

### Media
- `POST /api/ourspace/upload` - Upload file
- `GET /api/ourspace/media/<user_id>/<filename>` - Serve media

### Friends
- `GET /api/ourspace/friends` - Friends list
- `POST /api/ourspace/friends/add` - Add friend
- `POST /api/ourspace/friends/remove` - Remove friend
- `GET /api/ourspace/search?q=<query>` - Search users

## Testing

1. Sign up as user1 / password123
2. Customize and publish profile
3. Open incognito window
4. Sign up as user2 / password456
5. Visit `?user=user1` to view user1's profile
6. Verify visit counter increases
7. Log out and back in - verify profile persists

## Files

### Backend
- [backend/ourspace_db.py](backend/ourspace_db.py) - Database models
- [backend/app.py](backend/app.py#L2419-L2989) - Auth endpoints

### Frontend
- `frontend/js/ourspace-auth.js` - Auth UI
- `frontend/js/ourspace-core.js` - Profile logic
- `frontend/js/ourspace-customizer.js` - Customization handlers
- `frontend/ourspace.html` - Main page
- `frontend/css/ourspace-base.css` - Auth styling

## Security

- Password hashing: PBKDF2-HMAC-SHA256 (100k iterations)
- Random 32-byte salt per user
- Flask session management
- Parameterized SQL queries (injection protection)
- HTML escaping (XSS protection)

## Troubleshooting

**Profile not loading**
- Check backend running on port 4000
- Check browser console for errors
- Clear cache and refresh

**Upload fails**
- Verify `/api/ourspace/upload` accessible
- Check server logs
- Ensure `ourspace_data` directory has write permissions

**Database errors**
- Check `ourspace_data/OurSpace.db` exists
- Verify `ourspace_db.py` in backend directory
- Check server console for SQL errors

**Login fails**
- Verify Flask `SECRET_KEY` set in `.env`
- Enable browser cookies
- Check server console

## Backups

See [BACKUPS.md](BACKUPS.md) for database backup and restore procedures.
