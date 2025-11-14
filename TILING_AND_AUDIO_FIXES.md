# Tiling Controls and Audio Persistence Improvements

## Overview

Enhanced background image tiling with more granular size controls and fixed audio persistence to ensure songs are properly cached and loaded for all profile viewers.

## Features Added

### 1. Enhanced Tiling Size Controls

**Problem**: The previous size options didn't provide enough control for creating visible tile patterns. Users couldn't make images small enough to see multiple tiles.

**Solution**: Added more percentage options and a custom pixel size slider.

#### New Size Options

- **10% (Tiny Tiles)** - Creates very small tiles, ideal for tessellation patterns
- **20% (Small Tiles)** - Small tiles that show multiple repetitions
- **30%** - Medium-small tiles
- **50%** - Half size
- **75%** - Three-quarter size
- **100%** - Original size
- **150%** - 1.5x larger
- **200%** - Double size
- **300%** - Triple size
- **400%** - Quadruple size
- **Custom (px)** - Pixel-perfect control with slider (10px - 500px)

#### Custom Size Slider

When "Custom (px)" is selected, a slider appears allowing precise control from 10px to 500px:

```html
<label id="bg-size-custom-label">
    Custom Size (px): <span id="bg-size-custom-display">100px</span>
    <input type="range" id="bg-size-custom" min="10" max="500" step="10" value="100">
</label>
```

**Usage Example: Creating Tiny Tiles**
1. Upload background image
2. Set Repeat to "Tile (Repeat)"
3. Set Size to "10% (Tiny Tiles)"
4. Result: Many small copies of the image tiled across the background

**Usage Example: Precise Tiling**
1. Upload background image
2. Set Repeat to "Tile (Repeat)"
3. Set Size to "Custom (px)"
4. Adjust slider to exact pixel size (e.g., 50px for very small tiles)
5. Combine with Scale transform for additional control

### 2. Audio Persistence for Profile Viewers

**Problem**: Audio files were tied to the logged-in user's session and wouldn't play for visitors viewing published profiles. The track would disappear after logout.

**Solution**: Audio is now permanently stored in the database and loads for anyone viewing the profile.

#### How It Works

**Upload Flow (User Uploads Audio)**:
1. User uploads audio file → stored in `myspace_data/{user_id}/audio_xxx.mp3`
2. Audio URL saved to database via `/api/myspace/profile/save`
3. URL stored in `profile.widgets.music.audioData`
4. Profile published via `/api/myspace/profile/publish`

**View Flow (Visitor Views Profile)**:
1. Visitor navigates to `myspace.html?user=username`
2. Frontend fetches `/api/myspace/profile/{username}`
3. Backend returns profile data with `audioData` URL
4. `loadOtherUserProfile()` loads profile into view mode
5. **NEW**: `MySpaceAudio.reloadAudio()` called to load audio
6. Audio player loaded with user's saved track
7. If autoplay enabled, audio plays automatically

**Logout Behavior**:
- User clicks logout
- Session cleared (no database changes)
- Page reloads with temp profile (empty audio)
- **User's audio stays in database** (not deleted)
- On next login, audio reloads from database

#### Code Changes

**File**: [frontend/js/myspace-auth.js](frontend/js/myspace-auth.js#L548-L551)

Added audio reload when viewing other users' profiles:

```javascript
// Reload audio widget with user's saved audio
if (window.MySpaceAudio && window.MySpaceAudio.reloadAudio) {
    window.MySpaceAudio.reloadAudio();
}
```

This ensures that:
- ✅ Audio loads for profile owner (already working)
- ✅ Audio loads for visitors viewing published profile (NEW)
- ✅ Audio persists through logout/login cycles (already working)
- ✅ Audio autoplay works for visitors (already working)

### 3. Data Structure Updates

**File**: [frontend/js/myspace-core.js](frontend/js/myspace-core.js#L43-L44)

Added `customSize` property to background config:

```javascript
background: {
    type: "pattern",
    pattern: "hearts",
    image: "",
    repeat: "repeat",
    attachment: "fixed",
    gradient: "",
    size: "auto",
    customSize: 100,  // NEW: Custom pixel size
    position: "center",
    transform: { ... },
    filter: { ... },
    blend: { ... }
}
```

**File**: [frontend/js/myspace-core.js](frontend/js/myspace-core.js#L346-L349)

Updated `applyTheme()` to handle custom size:

```javascript
// Handle custom size
const bgSize = theme.background.size === 'custom'
    ? `${theme.background.customSize}px ${theme.background.customSize}px`
    : (theme.background.size || 'cover');
bg.style.backgroundSize = bgSize;
```

### 4. UI Controls

**File**: [frontend/js/myspace-customizer.js](frontend/js/myspace-customizer.js#L436-L475)

Added custom size slider controls:

```javascript
// Custom size slider
if (bgSizeCustom && bgSizeCustomDisplay) {
    bgSizeCustom.value = window.MySpace.profile.theme.background.customSize || 100;
    bgSizeCustomDisplay.textContent = (window.MySpace.profile.theme.background.customSize || 100) + 'px';

    bgSizeCustom.addEventListener('input', function() {
        bgSizeCustomDisplay.textContent = this.value + 'px';
        window.MySpace.profile.theme.background.customSize = parseInt(this.value);
        window.MySpace.applyTheme();
    });

    bgSizeCustom.addEventListener('change', function() {
        window.MySpace.saveProfile();
    });
}
```

## Testing

### Test 1: Tiny Tiles Pattern

1. Login to account
2. Upload a decorative icon or pattern
3. Set Background Type to "Custom Image"
4. Set Repeat to "Tile (Repeat)"
5. Set Size to "10% (Tiny Tiles)"
6. **Expected**: Many small copies of the image tiled across background
7. Save & Publish Profile

### Test 2: Custom Pixel Size

1. Upload background image
2. Set Repeat to "Tile (Repeat)"
3. Set Size to "Custom (px)"
4. Drag slider to 50px
5. **Expected**: Image tiles at exactly 50x50 pixels
6. Combine with Scale transform (e.g., 0.5x) for even smaller tiles

### Test 3: Audio Loads for Visitors

1. **User A**:
   - Login
   - Upload audio file
   - Enable autoplay (optional)
   - Save & Publish Profile
   - Note username
2. **User B** (or incognito window):
   - Navigate to `myspace.html?user=userA`
   - **Expected**: User A's audio loads and is ready to play
   - **Expected**: If autoplay enabled, audio plays automatically
3. **Verify**: Audio player shows correct track title
4. **Verify**: Play button works

### Test 4: Audio Persists Through Logout

1. Login to account
2. Upload audio file
3. Logout
4. **Expected**: Audio disappears (temp profile loaded)
5. Login again
6. **Expected**: Audio reloads from database
7. **Expected**: Track is ready to play

### Test 5: Published Profile Audio

1. User uploads audio but doesn't publish
2. Another user tries to view profile
3. **Expected**: "Profile not published" error
4. User publishes profile
5. Another user views profile
6. **Expected**: Audio loads and plays

## Console Output

### When Viewing Another User's Profile:

```
[Auth] Loaded username's profile
[Audio] Reloading audio from profile
[Audio] Loaded: Song Title
[Audio] Autoplay setting restored: true
[Audio] Autoplaying
```

### After Logout:

```
[Auth] Initializing...
[MySpace] Initializing...
[MySpace] Loaded profile from server
[Audio] Initializing music player...
[Audio] No saved audio to load
```

### After Login (Audio Restores):

```
[Auth] Loaded user profile from database
[Audio] Reloading audio from profile
[Audio] Loaded: Song Title
```

## Architecture

### Audio Flow Diagram

```
┌─────────────┐
│   Upload    │
│    Audio    │
└──────┬──────┘
       │
       v
┌─────────────────────┐
│  Server Storage     │
│  myspace_data/{id}/ │
│  audio_xxx.mp3      │
└──────┬──────────────┘
       │
       v
┌─────────────────────┐
│  Database Profile   │
│  audioData: URL     │
│  autoplay: bool     │
└──────┬──────────────┘
       │
       ├──────────────┐
       │              │
       v              v
┌──────────┐    ┌────────────┐
│  Owner   │    │  Visitors  │
│  Loads   │    │    View    │
│ Profile  │    │  Profile   │
└────┬─────┘    └──────┬─────┘
     │                 │
     v                 v
┌──────────────────────────┐
│  MySpaceAudio.reloadAudio()  │
│  - Load from audioData       │
│  - Restore autoplay setting  │
│  - Trigger autoplay if enabled│
└──────────────────────────┘
```

## API Endpoints

### View Published Profile

```
GET /api/myspace/profile/{username}
```

**Response**:
```json
{
  "username": "john",
  "visits": 42,
  "data": {
    "theme": { ... },
    "widgets": {
      "music": {
        "audioData": "/api/myspace/media/1/audio_1234567890.mp3",
        "title": "My Song",
        "autoplay": true,
        "volume": 70
      },
      ...
    }
  }
}
```

The `audioData` URL is relative and served by the backend from the user's storage folder.

## Files Modified

1. **[frontend/myspace.html](frontend/myspace.html#L157-L180)**
   - Added more size percentage options (10%, 20%, 30%, 75%, 150%, 300%)
   - Added custom size option with slider

2. **[frontend/js/myspace-core.js](frontend/js/myspace-core.js)**
   - Line 44: Added `customSize: 100` to DEFAULT_PROFILE
   - Line 294: Added backwards compatibility for `customSize`
   - Lines 346-349: Handle custom size in applyTheme()
   - Line 403: Apply custom size to overlay

3. **[frontend/js/myspace-customizer.js](frontend/js/myspace-customizer.js#L436-L475)**
   - Added custom size slider controls
   - Added visibility toggle for custom size slider
   - Added event handlers for real-time preview and save

4. **[frontend/js/myspace-auth.js](frontend/js/myspace-auth.js#L548-L551)**
   - Added `MySpaceAudio.reloadAudio()` call when loading other users' profiles

## Summary

These improvements make tiling more useful and audio truly persistent:

✅ **Tiling**: Can now create visible tile patterns with granular size control (10% - 400%, or custom px)

✅ **Audio for Visitors**: Audio loads and plays for anyone viewing a published profile

✅ **Audio Persistence**: Audio permanently stored in database, survives logout/login cycles

✅ **Autoplay for Visitors**: If enabled, audio autoplays for profile visitors

✅ **No Data Loss**: Logout only clears session, doesn't delete user data

Users can now create complex tessellated backgrounds and share their music with profile visitors!
