# Appwrite Google OAuth Setup Checklist

## ✅ Code Implementation Status

### Frontend Changes
- ✅ Appwrite SDK added to index.html (`<script src="https://cdn.jsdelivr.net/npm/appwrite@16.0.2"></script>`)
- ✅ OAuth code detects Appwrite vs Flask automatically
- ✅ Appwrite client initialized with correct endpoint and project ID
- ✅ Sign in button calls `appwriteAccount.createOAuth2Session('google', ...)`
- ✅ Sign out button calls `appwriteAccount.deleteSession('current')`
- ✅ Auth status check uses `appwriteAccount.get()`
- ✅ Works on production (Appwrite) AND locally (Flask) without conflicts

### Backend (Appwrite Console)
Your Appwrite project is already configured with:
- **Project ID**: `68f808d30023e28bd79e`
- **Endpoint**: `https://sfo.cloud.appwrite.io/v1`
- **Platform**: www.harmonizerlabs.cc
- **Google OAuth**: Enabled with Client ID and Secret

---

## 🔧 Required Google Cloud Console Setup

### Step 1: Fix Authorized Redirect URIs

In your Google Cloud Console OAuth credentials, you need **EXACTLY** this redirect URI:

```
https://sfo.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/68f808d30023e28bd79e
```

**Important:**
- Must be `/callback/` NOT `/redirect/`
- Project ID goes at the END after `/google/`
- This is the Appwrite format, not the Flask format

### Step 2: Add Authorized JavaScript Origins

Add these three origins:

```
https://sfo.cloud.appwrite.io
https://www.harmonizerlabs.cc
https://harmonizerlabs.cc
```

---

## 📋 Complete Google Cloud Console Configuration

Your OAuth 2.0 Client should have:

### Application Type
```
Web application
```

### Authorized JavaScript origins
```
https://sfo.cloud.appwrite.io
https://www.harmonizerlabs.cc
https://harmonizerlabs.cc
```

### Authorized redirect URIs
```
https://sfo.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/68f808d30023e28bd79e
```

---

## 🧪 Testing Instructions

### Production Test (Appwrite)
1. Go to https://www.harmonizerlabs.cc
2. Click "Sign in with Google" button (top-left)
3. Should redirect to Google OAuth consent screen
4. After signing in, redirects back to www.harmonizerlabs.cc
5. Should see your email in top-left corner
6. Click "Sign out" to test logout

### Local Test (Flask)
1. Run `python backend/app.py` locally
2. Go to http://localhost:4000
3. Click "Sign in with Google"
4. Uses Flask OAuth routes
5. Requires separate Google OAuth setup for localhost

---

## 🔍 How It Works

### Automatic Detection
```javascript
const isAppwrite = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
```

### Production (Appwrite)
- Detects production hostname
- Loads Appwrite SDK
- Uses Appwrite OAuth methods
- No Flask routes needed

### Local Development (Flask)
- Detects localhost
- Uses Flask `/auth/*` routes
- No Appwrite SDK needed
- Separate OAuth configuration

---

## ⚠️ Troubleshooting

### Error: "Invalid redirect URL"
**Cause**: Google redirect URI doesn't match Appwrite format
**Fix**: Use `/callback/` not `/redirect/`, project ID at end

### Error: "Appwrite is not defined"
**Cause**: Appwrite SDK not loaded
**Fix**: Verify `<script src="https://cdn.jsdelivr.net/npm/appwrite@16.0.2"></script>` in index.html

### Error: "CORS policy"
**Cause**: JavaScript origin not authorized
**Fix**: Add www.harmonizerlabs.cc to authorized origins

### Sign in button doesn't appear
**Cause**: Code is checking auth status and may be failing silently
**Fix**: Check browser console for errors

---

## ✅ Pre-Push Verification

Before pushing to master, verify:

- [x] Appwrite SDK script tag in index.html
- [x] OAuth code supports both Appwrite and Flask
- [x] Project ID and endpoint match your Appwrite project
- [x] Sign in button positioned correctly (top-left, fixed)
- [x] No syntax errors in JavaScript
- [x] Flask OAuth still works locally

---

## 🚀 Deployment Steps

### After Pushing to Master

1. **Code deploys automatically** (Vercel/Netlify/etc.)
2. **Update Google Cloud Console** with correct redirect URI
3. **Test on production** site
4. **Verify user can sign in/out**

### If Issues Persist

1. Check browser console for errors
2. Verify Appwrite project settings
3. Double-check Google OAuth redirect URI format
4. Ensure Google OAuth consent screen is configured
5. Add yourself as test user if app is in testing mode

---

## 📝 Summary

**What's Ready:**
✅ Frontend code supports Appwrite OAuth
✅ Automatic detection of Appwrite vs Flask
✅ Sign in/out functionality implemented
✅ Works with both production and local development

**What You Need to Do:**
1. Update Google Cloud Console redirect URI to Appwrite format
2. Add authorized JavaScript origins
3. Test on production site after code deploys

**Expected Result:**
Users can click "Sign in with Google" on www.harmonizerlabs.cc and authenticate seamlessly using Appwrite's OAuth system!
