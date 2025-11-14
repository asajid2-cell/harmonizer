# Audio Autoplay Feature

## Overview

The audio widget now fully supports autoplay functionality. When a user enables autoplay and saves their profile, the audio will automatically start playing whenever anyone loads the profile (including the owner and visitors).

## Features

### 1. Autoplay Setting Persistence
- Autoplay checkbox state is saved to the database with the profile
- Setting is restored when the profile is loaded from database
- Works for both the profile owner and visitors viewing the profile

### 2. Automatic Playback on Profile Load
- When autoplay is enabled, the audio starts playing automatically after the profile loads
- 500ms delay to ensure the page is fully loaded before attempting playback
- Handles browser autoplay restrictions gracefully

### 3. Cross-User Autoplay
- When someone views your published profile with autoplay enabled, the audio plays for them automatically
- The visitor doesn't need to click play - the music starts on page load

## Implementation

### File Modified: [frontend/js/myspace-audio.js](frontend/js/myspace-audio.js)

#### 1. Autoplay Checkbox Save (Lines 186-193)

Already implemented - checkbox changes are saved to profile:

```javascript
if (autoplayCheckbox) {
    autoplayCheckbox.checked = window.MySpace.profile.widgets.music.autoplay;

    autoplayCheckbox.addEventListener('change', function() {
        window.MySpace.profile.widgets.music.autoplay = this.checked;
        window.MySpace.saveProfile();
    });
}
```

#### 2. Autoplay Check Function (Lines 222-240)

```javascript
function checkAutoplay() {
    const autoplay = window.MySpace.profile.widgets.music.autoplay;
    const audioData = window.MySpace.profile.widgets.music.audioData;

    if (autoplay && audioData && audioPlayer) {
        // Delay autoplay slightly to ensure page is fully loaded
        setTimeout(function() {
            audioPlayer.play()
                .then(() => {
                    console.log("[Audio] Autoplaying");
                    startVisualizer();
                })
                .catch(err => {
                    console.log("[Audio] Autoplay blocked by browser:", err);
                    // Browsers often block autoplay, this is expected
                });
        }, 500);
    }
}
```

#### 3. Reload Audio with Autoplay (Lines 270-291)

Enhanced `reloadAudio()` function to restore checkbox state and trigger autoplay:

```javascript
window.MySpaceAudio = {
    reloadAudio: function() {
        console.log('[Audio] Reloading audio from profile');
        loadSavedAudio();

        // Update remove button visibility
        const removeAudioBtn = document.getElementById('remove-audio-btn');
        if (removeAudioBtn && window.MySpace.profile.widgets.music.audioData) {
            removeAudioBtn.style.display = 'inline-block';
        } else if (removeAudioBtn) {
            removeAudioBtn.style.display = 'none';
        }

        // Restore autoplay checkbox state
        const autoplayCheckbox = document.getElementById('autoplay-checkbox');
        if (autoplayCheckbox) {
            autoplayCheckbox.checked = window.MySpace.profile.widgets.music.autoplay;
            console.log('[Audio] Autoplay setting restored:', window.MySpace.profile.widgets.music.autoplay);
        }

        // Check and enforce autoplay
        checkAutoplay();
    }
};
```

## User Flow

### Setting Up Autoplay

1. **User uploads audio** to their profile
2. **User checks the "Autoplay" checkbox** in the music widget
3. Checkbox change triggers save: `window.MySpace.saveProfile()`
4. **Profile saved to database** with `autoplay: true`
5. **User clicks "Save & Publish Profile"** to make it public

### Own Profile Load (After Refresh)

1. **User refreshes page** or logs in
2. `checkAuth()` → `loadUserProfile()` → loads database profile
3. `MySpaceAudio.reloadAudio()` called
4. Audio loaded from `profile.widgets.music.audioData`
5. Autoplay checkbox restored to saved state
6. `checkAutoplay()` called
7. **Audio automatically plays** (if autoplay was enabled)
8. Visualizer starts

### Visitor Viewing Profile

1. **Visitor navigates to** `myspace.html?user=username`
2. Profile loaded from database via `/api/myspace/profile/username`
3. Profile applied, audio widget initialized
4. If `profile.widgets.music.autoplay === true`:
5. **Audio automatically plays** after 500ms
6. Visitor hears the music immediately

## Browser Autoplay Restrictions

### Modern Browser Behavior

Most modern browsers (Chrome, Firefox, Safari) have autoplay restrictions:
- **Muted videos**: Usually allowed to autoplay
- **Audio with sound**: Requires user interaction first

### How We Handle This

```javascript
audioPlayer.play()
    .then(() => {
        console.log("[Audio] Autoplaying");
        startVisualizer();
    })
    .catch(err => {
        console.log("[Audio] Autoplay blocked by browser:", err);
        // Gracefully handle - no error shown to user
    });
```

- We attempt autoplay
- If browser blocks it, we log but don't show an error
- User can still manually click play button

### Bypass Methods (User Can Enable)

Users can enable autoplay in their browser:

**Chrome:**
1. Click padlock/info icon in address bar
2. Site settings → Sound → Allow

**Firefox:**
1. Click info icon in address bar
2. Permissions → Autoplay → Allow Audio and Video

**Safari:**
1. Safari menu → Settings for This Website
2. Auto-Play → Allow All Auto-Play

## Console Output

### On Profile Load with Autoplay:
```
[Audio] Reloading audio from profile
[Audio] Loaded: Your Song Title
[Audio] Autoplay setting restored: true
[Audio] Autoplaying
```

### If Browser Blocks Autoplay:
```
[Audio] Reloading audio from profile
[Audio] Loaded: Your Song Title
[Audio] Autoplay setting restored: true
[Audio] Autoplay blocked by browser: NotAllowedError: play() failed because the user didn't interact with the document first
```

## Testing

### Test 1: Enable Autoplay
1. Login to your account
2. Upload an audio file
3. Check the "Autoplay" checkbox
4. Click "Save & Publish Profile"
5. Refresh the page
6. **Expected**: Audio starts playing automatically (if browser allows)

### Test 2: Visitor Autoplay
1. User A: Enable autoplay, save & publish
2. User B: Navigate to User A's profile via `?user=userA`
3. **Expected**: User A's audio plays automatically for User B

### Test 3: Disable Autoplay
1. Uncheck the "Autoplay" checkbox
2. Click "Save & Publish Profile"
3. Refresh the page
4. **Expected**: Audio loads but doesn't play automatically

### Test 4: Autoplay Persistence
1. Enable autoplay
2. Logout
3. Login again
4. **Expected**: Autoplay checkbox is checked, audio plays on load

## Data Structure

Autoplay setting is stored in the profile:

```javascript
{
  "widgets": {
    "music": {
      "audioData": "/api/myspace/media/1/audio_xxx.mp3",
      "title": "My Song",
      "autoplay": true,  // ← Autoplay setting
      "volume": 70
    }
  }
}
```

## Edge Cases Handled

1. **No audio loaded**: Autoplay doesn't trigger (checked in `checkAutoplay()`)
2. **Audio player not initialized**: Autoplay doesn't trigger
3. **Browser blocks autoplay**: Error caught and logged silently
4. **Profile not loaded yet**: Autoplay checked after profile fully loaded
5. **Visitor viewing profile**: Autoplay works for them too (not just owner)

## Future Enhancements

Possible improvements:
- [ ] Mute/unmute toggle for autoplay
- [ ] Fade-in effect for autoplay
- [ ] Autoplay only on first visit (using cookies)
- [ ] Visual indicator when autoplay is blocked
- [ ] Click-anywhere-to-play fallback when blocked

## Summary

The autoplay feature is fully functional:

✅ Autoplay setting saves to database
✅ Setting restored on profile load
✅ Audio automatically plays when enabled
✅ Works for profile owner after refresh
✅ Works for visitors viewing the profile
✅ Browser autoplay restrictions handled gracefully
✅ Checkbox state synchronized with profile
✅ Visualizer starts with autoplay

Users can now set their profile music to autoplay, and anyone viewing their profile will hear the music automatically start playing!
