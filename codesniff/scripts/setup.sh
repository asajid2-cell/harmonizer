#!/bin/bash

# Setup script for CodeScope

set -e

echo "🔍 Setting up CodeScope..."

# Setup backend
echo "📦 Setting up backend..."
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Backend setup complete"

# Setup frontend
echo "📦 Setting up frontend..."
cd ../frontend

# Install dependencies
npm install

echo "✅ Frontend setup complete"

# Create storage directory
mkdir -p ../backend/storage

# Copy environment files
if [ ! -f "../backend/.env" ]; then
    cp ../backend/.env.example ../backend/.env
    echo "📝 Created backend/.env"
fi

if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "📝 Created frontend/.env"
fi

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  Terminal 1: ./scripts/start_backend.sh"
echo "  Terminal 2: ./scripts/start_frontend.sh"
echo ""
echo "Then open http://localhost:5173 in your browser"
