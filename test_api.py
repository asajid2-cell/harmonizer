#!/usr/bin/env python3
"""Test the API endpoint to see the actual error."""

import requests
import time

# Wait a moment for server to be ready
time.sleep(2)

url = "http://127.0.0.1:4000/api/process"

# Test with a simple YouTube URL
data = {
    "source": "youtube",
    "youtube_url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    "algorithm": "canon",
}

print("Testing YouTube download via API...")
print(f"URL: {data['youtube_url']}\n")

try:
    response = requests.post(url, data=data, timeout=120)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
except requests.exceptions.Timeout:
    print("Request timed out")
except Exception as e:
    print(f"Error: {e}")
