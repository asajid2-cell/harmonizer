# Google OAuth Setup Guide

## Why OAuth Solves Rate Limiting

Instead of sharing cookies across all users (which causes rate limiting), each user signs in with their own Google account. When they download videos, YouTube sees them as individual users with their own rate limits - **completely eliminating rate limiting for your app!**

## Benefits

- Each user has their own YouTube quota
- No more 403 forbidden errors
- No need to manually export cookies
- Users can keep their browsers open while using the app
- Works perfectly on servers/production
- More secure than shared cookie files

---

## Setup Instructions

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "**Select a project**" → "**New Project**"
3. Name it (e.g., "Harmonizer Lab")
4. Click "**Create**"

### Step 2: Enable YouTube API

1. In your project, go to "**APIs & Services**" → "**Library**"
2. Search for "**YouTube Data API v3**"
3. Click on it and click "**Enable**"

### Step 3: Configure OAuth Consent Screen

1. Go to "**APIs & Services**" → "**OAuth consent screen**"
2. Choose "**External**" (unless you have a Google Workspace)
3. Click "**Create**"
4. Fill in required fields:
   - **App name**: Harmonizer Lab
   - **User support email**: Your email
   - **Developer contact**: Your email
5. Click "**Save and Continue**"
6. On "**Scopes**" page, click "**Add or Remove Scopes**"
7. Search for and add: `https://www.googleapis.com/auth/youtube.readonly`
8. Click "**Update**" → "**Save and Continue**"
9. On "**Test users**" page, add your Google email and any other users who will test
10. Click "**Save and Continue**"

### Step 4: Create OAuth Credentials

1. Go to "**APIs & Services**" → "**Credentials**"
2. Click "**Create Credentials**" → "**OAuth client ID**"
3. Application type: "**Web application**"
4. Name: "Harmonizer Web Client"
5. **Authorized redirect URIs** - Add these:
   - For local development: `http://localhost:5000/auth/callback`
   - For production: `https://yourdomain.com/auth/callback`

   (Replace `yourdomain.com` with your actual domain)

6. Click "**Create**"
7. **IMPORTANT**: Copy your:
   - **Client ID** (looks like `123456789-abc123.apps.googleusercontent.com`)
   - **Client Secret** (looks like `GOCSPX-abc123xyz...`)

### Step 5: Configure Environment Variables

#### For Local Development

Create a `.env` file in your project root:

```bash
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here

# Flask Secret Key (generate a random string)
SECRET_KEY=your-super-secret-random-key-here

# Redirect URI (must match what you set in Google Cloud Console)
REDIRECT_URI=http://localhost:5000/auth/callback
```

**To generate a secure SECRET_KEY**, run:
```bash
python -c "import os; print(os.urandom(24).hex())"
```

#### For Production (Render/Heroku/etc.)

Add these environment variables in your hosting platform's dashboard:

```
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret-here
SECRET_KEY=your-super-secret-random-key-here
REDIRECT_URI=https://yourdomain.com/auth/callback
```

---

## How It Works

### User Flow

1. **User visits your app** → Sees "Sign in with Google" button
2. **Clicks sign in** → Redirected to Google OAuth page
3. **Logs in with Google** → Grants permission to read YouTube data
4. **Redirected back** → Now authenticated!
5. **Downloads videos** → Uses their own YouTube account (no rate limits!)

### Technical Flow

```
User clicks "Sign in with Google"
     ↓
Redirect to /auth/google
     ↓
Flask creates OAuth flow with Google
     ↓
User signs in at accounts.google.com
     ↓
Google redirects to /auth/callback
     ↓
Flask exchanges authorization code for access token
     ↓
Store user credentials in session
     ↓
User is authenticated!
     ↓
When downloading videos:
  - Extract user_id from session
  - Get user's OAuth credentials
  - Create temporary cookie file with their token
  - yt-dlp uses this cookie file
  - YouTube sees the request from THEIR account
```

---

## Testing

### 1. Start the server

```bash
cd backend
python app.py
```

### 2. Open in browser

```
http://localhost:5000
```

### 3. Test OAuth flow

1. You should see "**Sign in with Google**" button in top-right
2. Click it
3. Sign in with your Google account
4. Grant permissions
5. You should be redirected back and see your email in top-right
6. Try downloading a YouTube video - it should work without rate limits!

---

## Troubleshooting

### "redirect_uri_mismatch" error

**Problem**: The redirect URI doesn't match what you set in Google Cloud Console

**Fix**:
1. Check the exact URL in the error message
2. Go to Google Cloud Console → Credentials
3. Edit your OAuth client
4. Make sure the redirect URI **exactly** matches (including http/https, port, etc.)

### "Access blocked: This app's request is invalid"

**Problem**: OAuth consent screen is not configured correctly

**Fix**:
1. Go to Google Cloud Console → OAuth consent screen
2. Make sure you added the YouTube API scope
3. Make sure you're in the test users list
4. Status should be "Testing" (not "In production" yet)

### "Session is not available"

**Problem**: Flask session is not configured properly

**Fix**:
1. Make sure `SECRET_KEY` is set in environment variables
2. Make sure you're not using `localhost` vs `127.0.0.1` inconsistently
3. Check that cookies are enabled in your browser

### Downloads still fail with 403

**Possible causes**:
1. User didn't actually authenticate (check top-right for email)
2. OAuth token expired (sign out and sign in again)
3. YouTube API not enabled in Google Cloud Console
4. Scope is wrong (should be `youtube.readonly`)

---

## Production Deployment

### 1. Update Redirect URI

In Google Cloud Console → Credentials, add your production URL:
```
https://yourdomain.com/auth/callback
```

### 2. Set Environment Variables

In your hosting platform (Render/Heroku/etc.), set:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SECRET_KEY=...
REDIRECT_URI=https://yourdomain.com/auth/callback
```

### 3. Publishing Your App (Optional)

If you want anyone to use your app (not just test users):

1. Go to Google Cloud Console → OAuth consent screen
2. Click "**Publish App**"
3. Google will review your app (can take a few days)
4. Once approved, anyone can sign in!

Until then, only users you added in "Test users" can sign in.

---

## Security Notes

- ✅ Never commit `.env` file to git (add it to `.gitignore`)
- ✅ Never share your `CLIENT_SECRET` publicly
- ✅ Use HTTPS in production (not HTTP)
- ✅ Rotate your `SECRET_KEY` periodically
- ✅ Review OAuth scopes to only request what you need

---

## Cost

**Google OAuth is FREE!** The YouTube Data API has these quotas:

- **Free tier**: 10,000 quota units per day
- **Video downloads via yt-dlp**: Don't consume API quota!
- **API calls (if you use them)**: ~1-50 units each

Since we're using OAuth only for authentication (not API calls), and downloads go through yt-dlp (which doesn't use the API), you won't hit quota limits.

---

## Summary

With OAuth set up:
- ✅ Each user downloads with their own YouTube account
- ✅ No more shared rate limits
- ✅ No more 403 errors
- ✅ No manual cookie management
- ✅ Works perfectly on servers
- ✅ More secure and professional

Users just click "Sign in with Google" and everything works!
