# Google Drive Integration Setup

## Overview

Allow users to select audio files directly from their Google Drive after signing in with Google OAuth.

---

## What Needs to Be Done

### 1. Update Appwrite OAuth Scopes

In your Appwrite dashboard, you need to add Google Drive scope when users sign in.

**Problem**: Appwrite's pre-configured Google OAuth only requests basic profile information. To access Google Drive, we need additional scopes.

**Solution**: Use custom OAuth configuration or request scope upgrade in Appwrite settings.

#### Option A: Appwrite Dashboard (If Available)
1. Go to Appwrite Console → Auth → OAuth2 Providers → Google
2. Look for "Scopes" configuration
3. Add: `https://www.googleapis.com/auth/drive.readonly`

#### Option B: Frontend Request (Recommended for now)
Since Appwrite's Google OAuth might not allow custom scopes, we can use Google's Picker API which handles its own auth.

---

### 2. Enable Google Picker API

#### In Google Cloud Console:
1. Go to https://console.cloud.google.com/
2. Select your project (Harmonizer Labs)
3. Go to "APIs & Services" → "Library"
4. Search for "Google Picker API"
5. Click "Enable"

#### Get API Key:
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Restrict the API key to:
   - Application restrictions: HTTP referrers
   - Add: `https://www.harmonizerlabs.cc/*`
   - API restrictions: Google Picker API
4. Copy the API key

---

### 3. Frontend Implementation

Add Google Picker JavaScript to your frontend:

```html
<!-- In index.html <head> -->
<script src="https://apis.google.com/js/api.js"></script>
<script src="https://accounts.google.com/gsi/client"></script>
```

```javascript
// Google Picker initialization
let pickerApiLoaded = false;
let oauthToken = null;

function loadPicker() {
    gapi.load('picker', () => {
        pickerApiLoaded = true;
    });
}

function showDrivePicker() {
    // Get OAuth token from Appwrite session
    if (!appwriteAccount) {
        alert('Please sign in with Google first');
        return;
    }

    // Create picker
    const picker = new google.picker.PickerBuilder()
        .addView(google.picker.ViewId.DOCS_AUDIO)  // Only show audio files
        .setOAuthToken(oauthToken)
        .setDeveloperKey('YOUR_API_KEY')
        .setCallback(pickerCallback)
        .build();

    picker.setVisible(true);
}

function pickerCallback(data) {
    if (data.action === google.picker.Action.PICKED) {
        const file = data.docs[0];
        document.getElementById('drive-file-id').value = file.id;
        document.getElementById('drive-file-name').textContent = file.name;
        document.getElementById('drive-file-info').style.display = 'block';
    }
}
```

---

### 4. Backend Implementation

Add endpoint to download from Google Drive:

```python
# In backend/app.py

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io

def _download_from_drive(file_id: str, track_id: str, access_token: str) -> tuple[Path, Optional[dict]]:
    """Download a file from Google Drive using access token."""
    try:
        # Build Drive API service with user's access token
        from google.oauth2.credentials import Credentials

        credentials = Credentials(token=access_token)
        service = build('drive', 'v3', credentials=credentials)

        # Get file metadata
        file_metadata = service.files().get(fileId=file_id, fields='name,mimeType,size').execute()
        print(f"[Drive Download] Downloading: {file_metadata['name']}", flush=True)

        # Download file
        request = service.files().get_media(fileId=file_id)
        file_path = UPLOAD_FOLDER / f"{track_id}.mp3"

        fh = io.FileIO(file_path, 'wb')
        downloader = MediaIoBaseDownload(fh, request)

        done = False
        while not done:
            status, done = downloader.next_chunk()
            print(f"[Drive Download] Progress: {int(status.progress() * 100)}%", flush=True)

        fh.close()

        info = {
            "title": file_metadata['name'].replace('.mp3', '').replace('.wav', ''),
            "uploader": "Google Drive",
        }

        print(f"[Drive Download] Success: {file_path.name}", flush=True)
        return file_path, info

    except Exception as e:
        error_msg = str(e)
        print(f"[Drive Download] Error: {error_msg}", flush=True)
        raise RuntimeError(f"Failed to download from Google Drive: {error_msg}")


# In api_process route, add:
elif source == "drive":
    file_id = request.form.get("drive_file_id", "").strip()
    access_token = request.headers.get("X-Drive-Token", "")

    if not file_id:
        return jsonify({"error": "No Drive file selected"}), 400
    if not access_token:
        return jsonify({"error": "Not authenticated with Google"}), 401

    audio_path, info = _download_from_drive(file_id, track_id, access_token)
    if not title:
        title = info.get("title") if info else None
```

---

### 5. Security Considerations

**Problem**: How to securely pass the OAuth access token from frontend to backend?

**Options**:

#### Option A: Use Appwrite Session (Recommended)
- Frontend gets Appwrite session after OAuth
- Backend validates Appwrite session
- Backend uses Appwrite to get Google access token
- More secure, server-side validation

#### Option B: Pass Token in Header
- Frontend sends `X-Drive-Token` header with access token
- Backend uses token directly
- Simpler but less secure

---

## Simplified Approach (Recommended)

Since full Google Drive integration is complex, here's a **simpler** approach:

### Just use Google Drive for storage, not picker

1. **User workflow**:
   - User uploads file to Google Drive
   - User gets **shareable link** from Drive
   - User pastes link into your app
   - Backend downloads from public Drive link

2. **Backend code**:
```python
def _download_from_drive_link(url: str, track_id: str) -> tuple[Path, Optional[dict]]:
    """Download from Google Drive shareable link."""
    # Extract file ID from various Drive URL formats
    import re

    file_id = None
    patterns = [
        r'/file/d/([^/]+)',
        r'id=([^&]+)',
        r'/open\?id=([^&]+)',
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            file_id = match.group(1)
            break

    if not file_id:
        raise RuntimeError("Invalid Google Drive link")

    # Use yt-dlp to download (it supports Drive links!)
    download_url = f"https://drive.google.com/uc?id={file_id}&export=download"

    # Download using requests
    import requests
    response = requests.get(download_url, stream=True)

    if response.status_code != 200:
        raise RuntimeError("Cannot download Drive file (make sure it's publicly shared)")

    file_path = UPLOAD_FOLDER / f"{track_id}.mp3"
    with open(file_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    return file_path, {"title": "Google Drive Audio"}
```

3. **Frontend**: Just add "Google Drive Link" as a source option

This is much simpler and doesn't require:
- Google Picker API
- Additional OAuth scopes
- Complex token passing
- API keys

---

## Recommendation

**Start with the simplified approach:**

✅ Add "Google Drive Link" option to source toggle
✅ Let users paste Drive shareable links
✅ Backend downloads from public Drive links
✅ Works immediately, no complex setup

**Later upgrade to full Picker integration if needed:**
- Better UX (don't need to copy/paste links)
- More secure (uses OAuth tokens)
- Browsable file picker UI

---

## Implementation Status

- ✅ Frontend UI added (Google Drive toggle)
- ✅ Backend placeholder ready
- ⚠️ Needs: Choose simple link approach OR full Picker approach
- ⚠️ Needs: Backend download function
- ⚠️ Needs: Testing

Let me know which approach you prefer!
