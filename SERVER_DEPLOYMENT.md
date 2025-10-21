# Server Deployment Guide

## The Cookie Problem on Servers

When deploying to a server (Render, Heroku, AWS, etc.), you **can't use browser cookies** because:
- No browser is installed on the server
- Even if there was, you wouldn't be logged into YouTube

## ✅ Best Solution: Export Cookies Once

### Step 1: Export Cookies Locally

On your local machine (where you have Chrome and are logged into YouTube):

```bash
# Close Chrome completely
# Run the export script
python export_cookies.py
```

This creates `backend/youtube_cookies.txt` with your YouTube session.

### Step 2: Deploy with the Cookie File

**Option A: Include in Git (Private Repos Only!)**
```bash
# Add to your deployment
git add backend/youtube_cookies.txt
git commit -m "Add YouTube cookies for server"
git push
```

⚠️ **SECURITY WARNING**: Only do this if your repository is **private**. Cookies are sensitive!

**Option B: Use Environment Variable (Recommended)**

1. **Convert cookies to base64:**
```bash
# Windows
certutil -encode backend/youtube_cookies.txt cookies_base64.txt

# Linux/Mac
base64 backend/youtube_cookies.txt > cookies_base64.txt
```

2. **Set environment variable on your server:**
```bash
# Render, Heroku, etc.
YOUTUBE_COOKIES_BASE64=<paste the base64 content>
```

3. **Update code to decode** (add to app.py):
```python
import base64
import os

# At startup, decode cookies from environment
cookies_b64 = os.environ.get("YOUTUBE_COOKIES_BASE64")
if cookies_b64:
    cookies_path = BASE_DIR / "youtube_cookies.txt"
    cookies_path.write_bytes(base64.b64decode(cookies_b64))
```

**Option C: Use Secret Files (Platform-Specific)**

**Render.com:**
```bash
# In Render dashboard:
# 1. Go to your service
# 2. Environment > Secret Files
# 3. Add file: /app/youtube_cookies.txt
# 4. Paste cookie content
```

**Heroku:**
```bash
# Set as config var
heroku config:set YOUTUBE_COOKIES_PATH=/app/youtube_cookies.txt
```

### Step 3: Update Code (Already Done!)

The code now checks these locations automatically:
1. `YOUTUBE_COOKIES_PATH` environment variable
2. `backend/youtube_cookies.txt`
3. Project root `/youtube_cookies.txt`
4. `/app/youtube_cookies.txt` (Docker/container)

## Alternative: Google OAuth (User Signs In)

### Pros:
- ✅ Each user uses their own YouTube account
- ✅ No manual cookie management
- ✅ Better for rate limiting (distributed across users)
- ✅ More secure

### Cons:
- ❌ More complex implementation
- ❌ Requires Google Cloud project setup
- ❌ Users must sign in every time

### Quick Implementation:

1. **Install OAuth library:**
```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2
```

2. **Add to frontend (index.html):**
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<div id="g_id_onload"
     data-client_id="YOUR_CLIENT_ID.apps.googleusercontent.com"
     data-callback="handleCredentialResponse">
</div>
```

3. **Backend handles OAuth token:**
```python
from google.oauth2.credentials import Credentials

@app.route("/api/process", methods=["POST"])
def api_process():
    # Get OAuth token from request
    oauth_token = request.headers.get("Authorization")

    # Use token to create authenticated yt-dlp session
    # ... (more complex, needs implementation)
```

## 🎯 Recommended Approach

**For Most Cases: Use Cookie File**

This is what I recommend because:
1. ✅ **Simple** - Export once, deploy, done
2. ✅ **Fast** - No OAuth flow needed
3. ✅ **Reliable** - Works for months before expiring
4. ✅ **Already implemented** - Code is ready

### When to Use OAuth Instead:

- High-traffic site (many concurrent users)
- Want users to download from their own accounts
- Need per-user rate limiting
- Willing to invest more development time

## Cookie File Maintenance

### How Long Do Cookies Last?

YouTube cookies typically last **2-3 months**.

### When They Expire:

You'll see 403 errors again. Simply:
1. Re-run `python export_cookies.py` locally
2. Re-deploy with new cookies

### Automation (Optional):

Set up a monthly reminder to refresh cookies:
```bash
# Add to crontab or GitHub Actions
0 0 1 * * python export_cookies.py && git push
```

## Security Best Practices

### DO:
- ✅ Use environment variables for cookies
- ✅ Keep repository private if cookies are in git
- ✅ Rotate cookies regularly (monthly)
- ✅ Use HTTPS for your deployed site

### DON'T:
- ❌ Commit cookies to public repositories
- ❌ Share cookie files publicly
- ❌ Use cookies from YouTube accounts with sensitive data

## Deployment Platforms

### Render.com
```yaml
# render.yaml
services:
  - type: web
    name: harmonizer
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: gunicorn backend.app:app
    envVars:
      - key: YOUTUBE_COOKIES_PATH
        value: /app/youtube_cookies.txt
```

### Heroku
```bash
# Procfile
web: gunicorn backend.app:app

# Deploy
git push heroku main
heroku config:set YOUTUBE_COOKIES_PATH=/app/youtube_cookies.txt
```

### Docker
```dockerfile
FROM python:3.11
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
# Copy cookies at build time (or mount as secret)
COPY youtube_cookies.txt /app/youtube_cookies.txt
CMD ["gunicorn", "backend.app:app"]
```

## Testing on Server

```bash
# SSH into your server or use logs
tail -f /var/log/your-app.log

# Look for this message:
# [YouTube Download] Using cookies from: /app/youtube_cookies.txt
# [YouTube Download] Using cookie file for authentication
```

If you see these messages, cookies are loaded correctly!

## Troubleshooting

### "No cookie file found"
- Check file path is correct
- Verify environment variable is set
- Check file permissions (should be readable)

### Still getting 403 errors
- Cookies may be expired - re-export them
- Make sure you're logged into YouTube when exporting
- Try exporting from different browser

### Cookies not loading
- Check server logs for file path
- Verify file was deployed with your code
- Test locally first with same cookie file
