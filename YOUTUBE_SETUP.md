# YouTube Download Setup

Due to YouTube's anti-bot measures (as of late 2024), downloading videos requires authentication via browser cookies.

## Quick Start (Recommended)

### Option 1: Use the Export Script (Easiest!)

1. **Close Chrome completely** (check Task Manager to be sure)
2. Run: `python export_cookies.py`
3. Press Enter when prompted
4. Done! Cookies are saved and you can now download videos

### Option 2: Close Browsers (Simple)

1. **Close ALL browser windows** (Chrome, Edge, Firefox)
2. Try downloading again
3. The app will automatically read cookies from your closed browser

### Option 3: Manual Cookie Export (For Production/Deployment)

1. Install a cookie export browser extension:
   - Chrome: [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)

2. Visit https://www.youtube.com while logged in

3. Click the extension icon and export cookies

4. Save the file as: `backend/youtube_cookies.txt`

5. The app will automatically use this file

## How It Works

The app includes these anti-detection features:
- **Sleep intervals**: 1-5 second delays between requests to avoid rate limiting
- **User-Agent spoofing**: Mimics a real browser
- **HTTP headers**: Sends realistic browser headers
- **Cookie authentication**: Uses your logged-in YouTube session

## Troubleshooting

### "Failed to download video" error

- Make sure you're logged into YouTube in your browser
- Close all browser windows before trying again
- If deployed, use Option 2 (export cookies)

### "Cookie database" error

- This means a browser is still open
- Close ALL browser windows (check system tray)
- Wait a few seconds and try again

### For Deployment (Render/Heroku/etc)

You MUST use Option 2 (cookie export) because:
- The server doesn't have a browser installed
- Even if it did, you wouldn't be logged in

Export your cookies and add `youtube_cookies.txt` to your deployment.

## Why is this necessary?

YouTube has implemented strict bot detection to prevent abuse. As of October 2024, most videos require authentication even for audio-only downloads. This is a yt-dlp/YouTube limitation, not a bug in this app.
