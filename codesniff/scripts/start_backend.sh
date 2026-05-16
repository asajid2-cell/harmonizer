#!/bin/bash

# Start CodeScope backend server

cd "$(dirname "$0")/../backend"

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Set environment variables
export HOST=${HOST:-0.0.0.0}
export PORT=${PORT:-8000}

echo "Starting CodeScope backend on http://${HOST}:${PORT}"

python -m app.main
