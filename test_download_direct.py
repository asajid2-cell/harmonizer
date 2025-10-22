#!/usr/bin/env python3
"""Test the _download_youtube function directly."""

import sys
sys.path.insert(0, 'backend')

from app import _download_youtube

# Test with a simple YouTube URL
url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
track_id = "TESTTRACK01"

print("Testing _download_youtube function directly...")
print(f"URL: {url}")
print(f"Track ID: {track_id}\n")

try:
    filename, info = _download_youtube(url, track_id)
    print(f"\n[SUCCESS] Downloaded: {filename}")
    print(f"Title: {info.get('title')}")
except Exception as e:
    print(f"\n[ERROR] {e}")
    import traceback
    traceback.print_exc()
