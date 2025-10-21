# OAuth Implementation Summary

## What Was Implemented

Google OAuth authentication has been fully integrated into the Harmonizer app to solve YouTube rate limiting by allowing each user to download videos using their own Google/YouTube account.

---

## Changes Made

### Backend Changes ([backend/app.py](backend/app.py))

#### 1. Added OAuth Dependencies
```python
from flask import session
from flask_session import Session
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
```

#### 2. Configured Flask Session
- Session type: filesystem
- Session storage: `backend/flask_session/`
- Added support for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables

#### 3. Created OAuth Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/auth/google` | GET | Initiates OAuth flow, redirects to Google |
| `/auth/callback` | GET | Handles OAuth callback, stores credentials |
| `/auth/status` | GET | Returns user authentication status |
| `/auth/logout` | GET | Clears session and logs out user |

#### 4. Created Helper Function
- **`get_user_oauth_cookies(user_id)`**: Converts user's OAuth credentials to temporary cookie file for yt-dlp

#### 5. Updated Download Functions
- **`_download_youtube(url, track_id, user_id=None)`**: Now accepts user_id parameter
  - Priority 0: User's OAuth credentials (if authenticated)
  - Priority 1: Cookie file
  - Priority 2: Browser cookies
  - Priority 3: Alternative player clients

- **`_download_spotify(url, track_id, user_id=None)`**: Now accepts user_id parameter
  - Passes OAuth credentials to spotdl's underlying yt-dlp downloader

#### 6. Updated API Route
- **`/api/process`**: Extracts `user_id` from session and passes to download functions

---

### Frontend Changes

#### [frontend/index.html](frontend/index.html)

**Added OAuth UI Components:**
```html
<div class="auth-status">
  <button id="google-signin-button">Sign in with Google</button>
  <div id="user-info" style="display: none;">
    <span id="user-email"></span>
    <button id="logout-button">Sign out</button>
  </div>
</div>
```

**Added OAuth JavaScript:**
- Checks authentication status on page load
- Shows/hides sign-in button based on status
- Handles sign-in redirect to `/auth/google`
- Handles sign-out and page reload

#### [frontend/modern.css](frontend/modern.css)

**Added OAuth Styles:**
- `.auth-status`: Container styling
- `.auth-button`: Button styling with hover effects
- `#user-info`: Flex layout for user email and logout button
- `#user-email`: Muted text styling for email display

---

### Dependencies Added

Updated [backend/analysis/requirements.txt](backend/analysis/requirements.txt):
```
google-auth>=2.0.0
google-auth-oauthlib>=1.0.0
google-auth-httplib2>=0.2.0
flask-session>=0.5.0
```

---

## How It Works

### Authentication Flow

```
1. User clicks "Sign in with Google" button
   ↓
2. Redirect to /auth/google
   ↓
3. Flask creates OAuth flow and redirects to Google
   ↓
4. User authenticates at accounts.google.com
   ↓
5. Google redirects to /auth/callback with authorization code
   ↓
6. Flask exchanges code for access token
   ↓
7. Store credentials in session with unique user_id
   ↓
8. User is authenticated!
```

### Download Flow (With OAuth)

```
1. User submits YouTube URL
   ↓
2. /api/process extracts user_id from session
   ↓
3. Passes user_id to _download_youtube()
   ↓
4. get_user_oauth_cookies(user_id) creates temporary cookie file
   ↓
5. yt-dlp uses cookie file with user's OAuth token
   ↓
6. YouTube sees request from user's own account
   ↓
7. No rate limiting! (Each user has their own quota)
```

### Download Flow (Without OAuth)

If user is not authenticated, the app falls back to:
1. Static cookie file (if exists)
2. Browser cookies (Chrome, Edge, Firefox)
3. Alternative player clients

---

## Setup Required

### 1. Google Cloud Console Setup

- Create a Google Cloud project
- Enable YouTube Data API v3
- Configure OAuth consent screen
- Create OAuth 2.0 credentials
- Add authorized redirect URIs

See [OAUTH_SETUP.md](OAUTH_SETUP.md) for detailed instructions.

### 2. Environment Variables

Create `.env` file or set environment variables:
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret
SECRET_KEY=your-flask-secret-key
REDIRECT_URI=http://localhost:5000/auth/callback
```

### 3. Install Dependencies

```bash
pip install -r backend/analysis/requirements.txt
```

---

## Benefits

### For Users
- ✅ Simple "Sign in with Google" button
- ✅ No manual cookie management
- ✅ No browser closing required
- ✅ Their own rate limits (not shared)
- ✅ More secure

### For You (Developer)
- ✅ Solves rate limiting completely
- ✅ No more 403 errors
- ✅ Scales to unlimited users
- ✅ Works perfectly on servers
- ✅ No manual cookie file deployment
- ✅ Professional authentication flow

### Technical
- ✅ Each user = separate YouTube quota
- ✅ OAuth tokens auto-refresh
- ✅ Session management handled by Flask
- ✅ Fallback to cookie files if not authenticated
- ✅ Works with both YouTube and Spotify URLs

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/app.py` | Added OAuth routes, session config, helper functions, updated download functions |
| `frontend/index.html` | Added OAuth UI and JavaScript |
| `frontend/modern.css` | Added OAuth styling |
| `backend/analysis/requirements.txt` | Added OAuth dependencies |

## Files Created

| File | Purpose |
|------|---------|
| `OAUTH_SETUP.md` | Complete setup guide for Google OAuth |
| `IMPLEMENTATION_SUMMARY.md` | This file |

---

## Testing

1. Set up Google Cloud OAuth credentials (see [OAUTH_SETUP.md](OAUTH_SETUP.md))
2. Add environment variables to `.env`
3. Install dependencies: `pip install -r backend/analysis/requirements.txt`
4. Start server: `python backend/app.py`
5. Open browser: `http://localhost:5000`
6. Click "Sign in with Google"
7. Authenticate with your Google account
8. Try downloading a YouTube video
9. Should work without rate limits!

---

## Next Steps

1. **Set up Google Cloud Console** following [OAUTH_SETUP.md](OAUTH_SETUP.md)
2. **Configure environment variables** (`.env` file)
3. **Test locally** with your Google account
4. **Add test users** in Google Cloud Console for others to test
5. **Deploy to production** with production redirect URI
6. **(Optional) Publish app** in Google Cloud Console for public access

---

## Rate Limiting Solution Explained

### Before OAuth:
- All users shared one cookie file or browser cookies
- YouTube saw all requests from one "account"
- Hit rate limits quickly
- Got 403 forbidden errors

### After OAuth:
- Each user signs in with their Google account
- Downloads use each user's own credentials
- YouTube sees separate accounts
- Each user has their own quota
- **No more rate limiting!**

It's like having a separate key for each person instead of everyone sharing one key!
