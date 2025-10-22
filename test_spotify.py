#!/usr/bin/env python3
"""Test Spotify download integration."""

import sys
sys.path.insert(0, 'backend')

from app import _download_spotify
from pathlib import Path

# Test with a Spotify track URL
# Using a popular public domain/royalty-free track
TEST_URL = "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp"  # Mr. Blue Sky - Electric Light Orchestra

track_id = "TESTSPOTIFY01"

print("Testing Spotify download integration...")
print(f"URL: {TEST_URL}")
print(f"Track ID: {track_id}\n")

try:
    filename, info = _download_spotify(TEST_URL, track_id)
    print(f"\n[SUCCESS] Downloaded: {filename}")
    print(f"Title: {info.get('title')}")
    print(f"Artist: {info.get('uploader')}")
    print(f"Album: {info.get('album')}")
    print(f"Duration: {info.get('duration')}s")
    print(f"\nFile exists: {filename.exists()}")
    print(f"File size: {filename.stat().st_size / 1024 / 1024:.2f} MB")
except Exception as e:
    print(f"\n[ERROR] {e}")
    import traceback
    traceback.print_exc()
