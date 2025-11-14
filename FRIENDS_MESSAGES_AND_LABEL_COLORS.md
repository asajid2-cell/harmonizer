# Friends, Messages System & Label Color Feature

## Overview

Completed implementation of the MySpace friends and messaging system with full end-to-end functionality, plus added customizable label text colors for section headings.

## Features Implemented

### 1. Label Text Color Option ✅

**Problem**: Labels like "Music", "TV Shows", "Page Views", etc. were hardcoded to cyan (#00ffff) and couldn't be customized.

**Solution**: Added new color picker for label text with real-time updates.

#### Implementation Details:

**Default Profile** ([myspace-core.js:25](frontend/js/myspace-core.js#L25)):
```javascript
colors: {
    background: "#ff69b4",
    text: "#ffffff",
    links: "#00ffff",
    linksHover: "#ff00ff",
    borders: "#ffffff",
    labelText: "#00aaff",  // NEW!
    widgetBg: "#000000",
    widgetBgOpacity: 70
}
```

**CSS Variable** ([myspace-core.js:434](frontend/js/myspace-core.js#L434)):
```javascript
document.documentElement.style.setProperty('--custom-label-color', theme.colors.labelText || '#00aaff');
```

**CSS Usage** ([myspace-base.css:981, 1047](frontend/css/myspace-base.css)):
```css
.stat-item strong {
    color: var(--custom-label-color, #00ffff);
}

.interest-section strong {
    color: var(--custom-label-color, #00ffff);
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
}
```

**Color Picker UI** ([myspace.html:107-110](frontend/myspace.html#L107-L110)):
```html
<label>
    Labels (Music, TV, etc)
    <input type="color" id="color-labels" value="#00aaff">
</label>
```

**Event Handlers** ([myspace-customizer.js:267-276](frontend/js/myspace-customizer.js#L267-L276)):
```javascript
// Label text color (Music, TV, etc)
if (colorLabels) {
    colorLabels.addEventListener('input', function() {
        window.MySpace.profile.theme.colors.labelText = this.value;
        window.MySpace.applyTheme();
    });
    colorLabels.addEventListener('change', function() {
        window.MySpace.saveProfile();
    });
}
```

#### What Labels Update in Real-Time:

✅ **Statistics Section**:
- "Contact"
- "Page Views"
- "Last Login"

✅ **Interests Section**:
- "Music:"
- "Movies:"
- "TV Shows:"
- "Books:"

✅ **Any `<strong>` tags within**:
- `.stat-item strong`
- `.interest-section strong`

### 2. Friends & Messages System ✅

**Problem**: The "Add to Friends", "Send Message", "Forward to Friend", and "Block User" buttons existed in the HTML but had no functionality.

**Solution**: Created complete friends and messaging system with frontend module and backend API integration.

#### New JavaScript Module

**File**: [frontend/js/myspace-friends.js](frontend/js/myspace-friends.js) (NEW)

**API Methods**:

```javascript
window.MySpaceFriends = {
    // Friend requests
    sendFriendRequest(username)      // Send friend request to user
    getFriendRequests()               // Get pending requests
    acceptFriendRequest(requestId)    // Accept a request
    rejectFriendRequest(requestId)    // Reject a request

    // Messaging
    sendMessage(toUsername, subject, body)  // Send message
    getInbox()                               // Get inbox messages

    // Blocking
    blockUser(username)               // Block a user

    // UI Dialogs
    showAddFriendDialog()             // Prompt for username to add
    showSendMessageDialog(toUsername) // Prompt for message details
    showShareProfileDialog()          // Show profile link to share
}
```

#### Button Functionality

**Add to Friends** Button:
- If viewing another user's profile → Sends friend request to that user
- If on own profile → Prompts for username to add
- Shows success/error alerts
- Checks if user is logged in

**Send Message** Button:
- If viewing another user's profile → Opens message dialog for that user
- If on own profile → Prompts for recipient username
- Prompts for subject and message body
- Sends message via API

**Forward to Friend** Button:
- Generates shareable profile URL
- Offers to copy link to clipboard
- Format: `http://localhost:4000/myspace.html?user=username`
- Can be sent to friend's inbox

**Block User** Button:
- If viewing another user's profile → Blocks that user
- If on own profile → Prompts for username to block
- Shows confirmation dialog
- Removes friendship and prevents future contact

#### Backend API Endpoints (Already Implemented)

**Friend Requests**:
- `POST /api/myspace/friends/request/send` - Send request
- `GET /api/myspace/friends/requests` - Get pending requests
- `POST /api/myspace/friends/request/accept` - Accept request
- `POST /api/myspace/friends/request/reject` - Reject request

**Messages**:
- `POST /api/myspace/messages/send` - Send message
- `GET /api/myspace/messages/inbox` - Get inbox
- `GET /api/myspace/messages/sent` - Get sent messages
- `POST /api/myspace/messages/read` - Mark as read
- `GET /api/myspace/messages/unread-count` - Get unread count
- `POST /api/myspace/messages/delete` - Delete message

**Blocking**:
- `POST /api/myspace/block` - Block user
- `POST /api/myspace/unblock` - Unblock user
- `GET /api/myspace/blocked` - Get blocked users list

#### Database Tables (Already Implemented)

**friend_requests**:
```sql
CREATE TABLE friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK(status IN ('pending', 'accepted', 'rejected'))
)
```

**messages**:
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**blocked_users**:
```sql
CREATE TABLE blocked_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    blocked_user_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, blocked_user_id)
)
```

#### Smart Context Detection

The friends module automatically detects context:

**Viewing Another User's Profile**:
```javascript
// URL: myspace.html?user=john
// Click "Add to Friends" → Sends request to john
// Click "Send Message" → Opens message dialog for john
// Click "Block User" → Blocks john
```

**On Your Own Profile**:
```javascript
// URL: myspace.html (no ?user parameter)
// Click "Add to Friends" → Prompts for username
// Click "Send Message" → Prompts for username
// Click "Block User" → Prompts for username
```

### 3. Share Profile Feature ✅

**"Forward to Friend" Button Functionality**:

When clicked:
1. Generates profile URL: `http://localhost:4000/myspace.html?user=yourname`
2. Shows dialog with the link
3. Asks if user wants to copy to clipboard
4. If yes → Copies link (or shows manual copy prompt if clipboard fails)
5. User can then paste link into:
   - Friend's message inbox
   - Email
   - Social media
   - Instant messenger

**Implementation** ([myspace-friends.js:202-220](frontend/js/myspace-friends.js#L202-L220)):
```javascript
showShareProfileDialog: function() {
    if (!window.MySpaceAuth || !window.MySpaceAuth.currentUser) {
        alert('You must be logged in');
        return;
    }

    const username = window.MySpaceAuth.currentUser.username;
    const profileUrl = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(username)}`;

    const message = `Check out my MySpace profile!\n\n${profileUrl}\n\nYou can also send this link to a friend's inbox.`;

    if (confirm(message + '\n\nCopy link to clipboard?')) {
        navigator.clipboard.writeText(profileUrl).then(() => {
            alert('Profile link copied to clipboard!');
        }).catch(() => {
            prompt('Copy this link:', profileUrl);
        });
    }
}
```

## Files Modified/Created

### Created:
1. **[frontend/js/myspace-friends.js](frontend/js/myspace-friends.js)** - NEW
   - Complete friends & messaging system
   - 280 lines of functionality
   - Button event listeners
   - API integration
   - Smart context detection

### Modified:
1. **[frontend/js/myspace-core.js](frontend/js/myspace-core.js)**
   - Line 25: Added `labelText: "#00aaff"` to colors
   - Line 434: Added CSS variable for label color

2. **[frontend/css/myspace-base.css](frontend/css/myspace-base.css)**
   - Line 981: Use `var(--custom-label-color)` for stats
   - Line 1047: Use `var(--custom-label-color)` for interests

3. **[frontend/myspace.html](frontend/myspace.html)**
   - Lines 107-110: Added label color picker
   - Line 706: Included myspace-friends.js script

4. **[frontend/js/myspace-customizer.js](frontend/js/myspace-customizer.js)**
   - Line 215: Added `colorLabels` variable
   - Lines 267-276: Added label color event handlers
   - Line 319: Initialize label color picker value

## Usage Guide

### Customizing Label Colors

1. Open customize panel
2. Go to "Colors" section
3. Find "Labels (Music, TV, etc)" color picker
4. Drag to select color
5. **Labels update instantly in real-time!**
6. Affects: Music, Movies, TV Shows, Books, Contact, Page Views

### Adding Friends

**Method 1: From Their Profile**
1. Visit another user's profile: `myspace.html?user=username`
2. Click "👥 Add to Friends" button
3. Friend request sent automatically!

**Method 2: From Your Profile**
1. Click "👥 Add to Friends" button
2. Enter username in prompt
3. Click OK
4. Friend request sent!

### Sending Messages

**Method 1: From Their Profile**
1. Visit another user's profile
2. Click "✉️ Send Message" button
3. Enter subject (e.g., "Hey!")
4. Enter message body
5. Message sent!

**Method 2: From Your Profile**
1. Click "✉️ Send Message" button
2. Enter recipient username
3. Enter subject and message
4. Message sent!

### Sharing Your Profile

1. Click "📧 Forward to Friend" button
2. Dialog shows your profile URL
3. Click "OK" to copy to clipboard
4. Paste link anywhere:
   - Send to friend's inbox
   - Share on social media
   - Email to friends
   - Send via instant messenger

### Blocking Users

**Method 1: From Their Profile**
1. Visit user's profile
2. Click "🚫 Block User" button
3. Confirm in dialog
4. User blocked!

**Method 2: From Your Profile**
1. Click "🚫 Block User" button
2. Enter username to block
3. Confirm in dialog
4. User blocked!

**What Blocking Does**:
- Removes existing friendship (both directions)
- Deletes pending friend requests
- Prevents new friend requests
- Blocks incoming messages
- User cannot contact you

## Testing

### Test 1: Label Colors

1. Open customize panel
2. Find "Labels (Music, TV, etc)" color picker
3. Change color to red (#ff0000)
4. **Expected**: All label text (Music:, Movies:, etc.) turns red instantly
5. Change to green (#00ff00)
6. **Expected**: Labels turn green instantly
7. Check both Interests and Stats sections
8. **Expected**: Both sections update

### Test 2: Add Friend (From Profile)

1. Create two accounts: UserA and UserB
2. Login as UserA
3. Publish profile
4. Logout
5. Login as UserB
6. Navigate to `myspace.html?user=UserA`
7. Click "👥 Add to Friends"
8. **Expected**: Alert says "Friend request sent to UserA!"
9. **Backend**: Check database for friend_request record

### Test 3: Add Friend (Prompt)

1. Login
2. Go to your own profile
3. Click "👥 Add to Friends"
4. **Expected**: Prompt asks for username
5. Enter existing username
6. **Expected**: Alert confirms friend request sent

### Test 4: Send Message

1. Login as UserA
2. Visit UserB's profile
3. Click "✉️ Send Message"
4. Enter subject: "Hello"
5. Enter message: "Nice profile!"
6. **Expected**: Alert says "Message sent to UserB!"
7. **Backend**: Check messages table

### Test 5: Share Profile

1. Login
2. Click "📧 Forward to Friend"
3. **Expected**: Dialog shows profile URL
4. Click OK
5. **Expected**: "Profile link copied to clipboard!" alert
6. Paste somewhere
7. **Expected**: URL is `http://localhost:4000/myspace.html?user=yourname`

### Test 6: Block User

1. Login as UserA
2. Visit UserB's profile
3. Click "🚫 Block User"
4. **Expected**: Confirmation dialog appears
5. Click OK
6. **Expected**: Alert says "UserB has been blocked"
7. Try to send friend request
8. **Expected**: Request fails (blocked)

## Error Handling

All functions include proper error handling:

```javascript
// Not logged in
if (!window.MySpaceAuth || !window.MySpaceAuth.isAuthenticated) {
    alert('You must be logged in to add friends');
    return false;
}

// API errors
try {
    const response = await fetch('/api/...');
    if (response.ok) {
        // Success
    } else {
        const data = await response.json();
        alert(data.error || 'Failed to...');
    }
} catch (e) {
    console.error('[Friends] Error:', e);
    alert('Error...');
}
```

## Console Output

### Successful Friend Request:
```
[Friends] Sending friend request to: john
POST /api/myspace/friends/request/send 200
```

### Successful Message Send:
```
[Messages] Sending message to: jane
Subject: Hello
POST /api/myspace/messages/send 200
```

### Block User:
```
[Block] Blocking user: baduser
POST /api/myspace/block 200
```

## Security Features

✅ **Authentication Required**: All friend/message operations require login
✅ **Blocking Enforcement**: Blocked users cannot send requests or messages
✅ **SQL Injection Prevention**: Prepared statements in all database queries
✅ **Session Validation**: Server-side session checks for all operations
✅ **Confirmation Dialogs**: Destructive actions (block) require confirmation

## Future Enhancements

The backend supports these features (UI not yet built):

- **View Friend Requests**: UI to see and manage pending requests
- **Inbox UI**: Full inbox interface with message list
- **Unread Badge**: Show count of unread messages
- **Friend List UI**: View all friends
- **Blocked Users UI**: Manage blocked users list
- **Sent Messages**: View sent messages history

## Summary

All requested functionality is now complete and working:

1. ✅ **Label Text Color** - Customizable color for section headings with real-time updates
2. ✅ **Add Friends** - Full friend request system with backend integration
3. ✅ **Send Messages** - Complete messaging system
4. ✅ **Forward to Friend** - Share profile link with copy-to-clipboard
5. ✅ **Block Users** - Block functionality with friendship removal

The MySpace page now has a fully functional social network backend with friends, messages, and blocking capabilities!
