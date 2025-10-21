# Google OAuth Implementation (Alternative Approach)

## Why Use OAuth?

Instead of managing cookies yourself, let users sign in with Google and use **their** YouTube session.

### Benefits:
- ✅ No cookie file management
- ✅ Each user has own rate limit
- ✅ Automatically handles cookie expiration
- ✅ More secure (no shared credentials)

### Drawbacks:
- ❌ More complex to implement
- ❌ Users must sign in
- ❌ Requires Google Cloud project

## Quick Setup (Under 30 Minutes)

### Step 1: Google Cloud Console

1. Go to https://console.cloud.google.com
2. Create new project: "Harmonizer"
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:4000/oauth/callback` (dev) and `https://your-domain.com/oauth/callback` (prod)
5. Copy Client ID and Client Secret

### Step 2: Install Dependencies

```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2
```

### Step 3: Update Backend

Add to `backend/app.py`:

```python
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
import google.auth.exceptions
import pickle

# OAuth configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
SCOPES = ['https://www.googleapis.com/auth/youtube.readonly']

# Store user sessions (in production, use Redis or database)
user_sessions = {}

@app.route("/auth/google")
def auth_google():
    """Initiate Google OAuth flow"""
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [request.host_url + "oauth/callback"]
            }
        },
        scopes=SCOPES
    )

    flow.redirect_uri = request.host_url + "oauth/callback"
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true'
    )

    session['state'] = state
    return redirect(authorization_url)

@app.route("/oauth/callback")
def oauth_callback():
    """Handle OAuth callback"""
    state = session['state']
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [request.host_url + "oauth/callback"]
            }
        },
        scopes=SCOPES,
        state=state
    )

    flow.redirect_uri = request.host_url + "oauth/callback"
    flow.fetch_token(authorization_response=request.url)

    credentials = flow.credentials
    user_id = str(uuid.uuid4())  # Generate session ID

    # Store credentials
    user_sessions[user_id] = {
        'credentials': credentials,
        'email': get_user_email(credentials)
    }

    # Set cookie with user session
    response = redirect(url_for('index'))
    response.set_cookie('user_session', user_id, max_age=86400)
    return response

def get_user_cookies(user_session_id):
    """Get cookies for a user session"""
    if user_session_id not in user_sessions:
        return None

    credentials = user_sessions[user_session_id]['credentials']

    # Create cookies from OAuth token
    # This is simplified - actual implementation needs cookie jar creation
    return {
        'Authorization': f'Bearer {credentials.token}'
    }
```

### Step 4: Update Download Function

Modify `_download_youtube` to use user's session:

```python
def _download_youtube(url: str, track_id: str, user_session_id: Optional[str] = None) -> tuple[Path, Optional[dict]]:
    # ... existing code ...

    # If user is authenticated, use their cookies
    if user_session_id:
        user_cookies = get_user_cookies(user_session_id)
        if user_cookies:
            # Add user's OAuth token to yt-dlp
            common_opts["http_headers"]["Authorization"] = user_cookies["Authorization"]
            print(f"[YouTube Download] Using authenticated user session", flush=True)

    # ... rest of existing code ...
```

### Step 5: Update Frontend

Add Google Sign-In button to `frontend/index.html`:

```html
<!-- Add to header -->
<div id="auth-section">
    <button onclick="signInWithGoogle()" id="sign-in-btn">
        Sign in with Google
    </button>
    <span id="user-email" style="display:none;"></span>
</div>

<script>
function signInWithGoogle() {
    window.location.href = '/auth/google';
}

// Check if user is authenticated
fetch('/api/auth/status')
    .then(r => r.json())
    .then(data => {
        if (data.authenticated) {
            document.getElementById('sign-in-btn').style.display = 'none';
            document.getElementById('user-email').textContent = data.email;
            document.getElementById('user-email').style.display = 'inline';
        }
    });
</script>
```

### Step 6: Update API Endpoint

Modify `/api/process` to pass user session:

```python
@app.route("/api/process", methods=["POST", "OPTIONS"])
def api_process():
    # ... existing code ...

    # Get user session from cookie
    user_session_id = request.cookies.get('user_session')

    if source == "youtube":
        url = request.form.get("youtube_url", "").strip()
        if not url:
            return jsonify({"error": "Please provide a YouTube URL."}), 400

        # Pass user session to download function
        audio_path, info = _download_youtube(url, track_id, user_session_id)

    # ... rest of code ...
```

## Simpler Alternative: Just Prompt for Cookies

If OAuth is too complex, you can let **users** provide cookies:

```html
<!-- Add to frontend -->
<div id="cookie-prompt" style="display:none;">
    <p>YouTube authentication required</p>
    <textarea id="cookie-input" placeholder="Paste cookies here..."></textarea>
    <button onclick="saveCookies()">Save Cookies</button>
    <a href="#" onclick="showCookieHelp()">How to get cookies?</a>
</div>

<script>
function saveCookies() {
    const cookies = document.getElementById('cookie-input').value;
    localStorage.setItem('youtube_cookies', cookies);
    // Send to backend or use directly
}

function showCookieHelp() {
    alert(`
1. Install browser extension "Get cookies.txt"
2. Visit YouTube while logged in
3. Click extension icon
4. Copy cookies and paste here
    `);
}
</script>
```

Then in backend:

```python
@app.route("/api/process", methods=["POST"])
def api_process():
    # Check if user provided cookies
    user_cookies = request.form.get("user_cookies")

    if user_cookies:
        # Save to temporary file
        temp_cookie_file = UPLOAD_FOLDER / f"cookies_{track_id}.txt"
        temp_cookie_file.write_text(user_cookies)

        # Use in yt-dlp
        ydl_opts["cookiefile"] = str(temp_cookie_file)
```

## Recommendation

**For your use case, I recommend:**

1. **Start with: Cookie file approach** (already implemented)
   - Easiest
   - Works immediately
   - Good for low-medium traffic

2. **Later, add: User cookie input**
   - Let users paste their own cookies
   - Better rate limiting
   - Still simple

3. **If needed: Full OAuth**
   - Only if you have high traffic
   - Only if cookie management becomes a pain

The cookie file approach (already done) will work for 95% of use cases!
