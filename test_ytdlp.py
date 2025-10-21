#!/usr/bin/env python3
"""Quick test to verify yt-dlp can download with the new configuration."""

from yt_dlp import YoutubeDL
from pathlib import Path

# Test URLs - various videos to test reliability
TEST_URLS = [
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",  # "Me at the zoo" - first YouTube video
    "https://www.youtube.com/watch?v=9bZkp7q19f0",  # PSY - GANGNAM STYLE (popular music video)
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",  # Rick Astley - Never Gonna Give You Up
]

def test_with_config(config_name, ydl_opts, test_url):
    """Test downloading with a specific configuration."""
    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(test_url, download=False)
            title = info.get('title', 'Unknown')[:50]
            # Handle encoding issues on Windows console
            title = title.encode('ascii', 'ignore').decode('ascii')
            print(f"  [OK] {title}")
            return True
    except Exception as e:
        error = str(e)[:80].encode('ascii', 'ignore').decode('ascii')
        print(f"  [FAIL] {error}")
        return False

def test_download():
    """Test downloading with multiple configurations."""
    print("Testing yt-dlp with web_embedded + web + tv clients...")
    print(f"Testing {len(TEST_URLS)} different videos\n")

    # Test the primary configuration (web_embedded + web + tv)
    config = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "extractor_args": {"youtube": {"player_client": ["web_embedded", "web", "tv"]}},
    }

    success_count = 0
    for i, url in enumerate(TEST_URLS, 1):
        print(f"Video {i}/{len(TEST_URLS)}: {url}")
        if test_with_config("web_embedded+web+tv", config, url):
            success_count += 1

    print(f"\n[RESULT] {success_count}/{len(TEST_URLS)} videos successfully extracted")
    return success_count == len(TEST_URLS)

if __name__ == "__main__":
    success = test_download()
    exit(0 if success else 1)
