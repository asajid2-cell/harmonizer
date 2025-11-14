# Upload Persistence Fix

## Problem

Uploaded images and audio files were not persisting when users logged out and back in, or when viewing other users' profiles.

### Root Cause

The `saveProfile()` function in [myspace-core.js](frontend/js/myspace-core.js) was always saving to temporary storage (`/api/myspace/profile`) regardless of authentication status. This meant:

1. **Non-authenticated users**: Uploads worked correctly (saved to temp storage)
2. **Authenticated users**: Uploads saved to temp storage instead of database
   - When user logged out and back in, database profile loaded (without uploads)
   - Uploads were in temp storage, not synced to database
3. **Viewing other profiles**: Database profiles didn't contain upload URLs

## Solution

Updated `saveProfile()` to check authentication status and route to the correct endpoint:

### Code Change ([myspace-core.js:165-196](frontend/js/myspace-core.js#L165-L196))

```javascript
saveProfile: async function() {
    try {
        this.profile.meta.lastModified = Date.now();

        // Check if user is authenticated
        const isAuthenticated = window.MySpaceAuth && window.MySpaceAuth.isAuthenticated;
        console.log(`[MySpace] saveProfile called - isAuthenticated: ${isAuthenticated}`);

        let response;
        if (isAuthenticated) {
            // Save to database for authenticated users
            console.log('[MySpace] Saving to database via /api/myspace/profile/save');
            response = await fetch('/api/myspace/profile/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(this.profile)
            });
        } else {
            // Save to temp storage for non-authenticated users
            console.log('[MySpace] Saving to temp storage via /api/myspace/profile');
            response = await fetch('/api/myspace/profile', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(this.profile)
            });
        }

        if (response.ok) {
            console.log(`[MySpace] Profile saved successfully to ${isAuthenticated ? 'database' : 'temp storage'}`);
        } else {
            throw new Error('Server save failed');
        }

        return true;
    } catch (e) {
        console.error("[MySpace] Error saving profile:", e);
        // Fallback to localStorage...
    }
}
```

## How It Works

### Upload Flow (Authenticated Users)

1. **User uploads file** (banner, profile pic, audio, background, etc.)
2. **Upload handler** sends file to `/api/myspace/upload`
3. **Backend** saves file to `myspace_data/{user_id}/` folder
4. **Backend** returns URL: `/api/myspace/media/{user_id}/{filename}`
5. **Frontend** updates profile with URL
6. **Frontend** calls `saveProfile()`
7. **saveProfile()** checks `isAuthenticated` → **true**
8. **saveProfile()** calls `/api/myspace/profile/save` → **saves to database**
9. **Profile with upload URLs** now persisted in database

### Upload Flow (Non-Authenticated Users)

1. **User uploads file** (temporary session)
2. **Backend** saves file to `myspace_data/temp_{session_id}/` folder
3. **Backend** returns URL with temp folder path
4. **saveProfile()** checks `isAuthenticated` → **false**
5. **saveProfile()** calls `/api/myspace/profile` → **saves to temp JSON file**
6. **Changes temporary** - lost on page refresh unless user logs in

### Login Flow

1. **User logs in**
2. **loadUserProfile()** calls `/api/myspace/profile/load`
3. **Backend** returns database profile **with all upload URLs**
4. **Frontend** applies profile with media
5. **All uploads restored** from database

### Viewing Other Profiles

1. **Navigate to** `myspace.html?user=someusername`
2. **Frontend** calls `/api/myspace/profile/<username>`
3. **Backend** returns published database profile **with upload URLs**
4. **Media URLs** point to `/api/myspace/media/{their_user_id}/{filename}`
5. **All their uploads visible** to viewer

## Backend Support (Already In Place)

The backend already properly handles authenticated vs non-authenticated uploads:

### Upload Endpoint ([app.py:1847-1888](backend/app.py#L1847-L1888))

```python
@app.route("/api/myspace/upload", methods=["POST"])
def myspace_upload():
    # Use authenticated user ID if available, otherwise temp ID
    myspace_user_id = session.get("myspace_user_id")
    if myspace_user_id:
        user_id = str(myspace_user_id)  # Real user folder
    else:
        if "user_id" not in session:
            session["user_id"] = str(uuid.uuid4())
        user_id = f"temp_{session['user_id']}"  # Temp folder

    user_media_dir = MYSPACE_DATA_DIR / user_id
    # Save file and return URL...
```

### Media Serving ([app.py:1891-1897](backend/app.py#L1891-L1897))

```python
@app.route("/api/myspace/media/<user_id>/<filename>")
def myspace_media(user_id: str, filename: str):
    """Serve MySpace media files."""
    filepath = MYSPACE_DATA_DIR / user_id / filename
    if not filepath.exists():
        abort(404)
    return send_file(filepath)
```

## Testing

### Test 1: Upload Persistence After Login/Logout

1. Create account and login
2. Upload banner image
3. Upload profile audio
4. Click "Save & Publish Profile"
5. **Console should show**: `Profile saved successfully to database`
6. Logout
7. Login again
8. **Expected**: Banner and audio restored

### Test 2: Viewing Other Profiles

1. User A: Login, upload images/audio, publish
2. User B: Login (different browser/incognito)
3. User B: Navigate to `myspace.html?user=userA`
4. **Expected**: User A's uploads visible

### Test 3: Non-Authenticated Uploads (Temporary)

1. Open page without logging in
2. Upload banner image
3. **Console should show**: `Profile saved successfully to temp storage`
4. Refresh page
5. **Expected**: Upload lost (temp storage cleared)

## Debug Logging

Console logs show the routing decision:

```
[MySpace] saveProfile called - isAuthenticated: true
[MySpace] Saving to database via /api/myspace/profile/save
[MySpace] Profile saved successfully to database
```

Or for non-authenticated:

```
[MySpace] saveProfile called - isAuthenticated: false
[MySpace] Saving to temp storage via /api/myspace/profile
[MySpace] Profile saved successfully to temp storage
```

## Files Modified

- **frontend/js/myspace-core.js** (lines 165-196)
  - Added authentication check in `saveProfile()`
  - Routes to database endpoint for authenticated users
  - Routes to temp endpoint for non-authenticated users
  - Added debug logging

## Files Already Supporting This

- **backend/app.py**:
  - `/api/myspace/upload` - Already handles auth/temp folders
  - `/api/myspace/profile/save` - Database save endpoint
  - `/api/myspace/media/<user_id>/<filename>` - Media serving

- **backend/myspace_db.py**:
  - `save_user_profile()` - Saves profile JSON to database

- **frontend/js/myspace-auth.js**:
  - Maintains `isAuthenticated` flag
  - Sets flag on login/register
  - Clears flag on logout

## Result

✅ **Authenticated users**: Uploads persist in database across sessions
✅ **Non-authenticated users**: Can still upload (temporary)
✅ **Viewing profiles**: Other users see your published uploads
✅ **No data loss**: Login/logout doesn't lose uploads
✅ **Proper routing**: Database vs temp storage based on auth status
