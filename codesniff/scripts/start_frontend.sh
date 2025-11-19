#!/bin/bash

# Start CodeScope frontend dev server

cd "$(dirname "$0")/../frontend"

echo "Starting CodeScope frontend on http://localhost:5173"

npm run dev
