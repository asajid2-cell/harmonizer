# CodeSniff Setup Guide

Complete installation and configuration guide for CodeSniff.

## Prerequisites

### Required Software

| Software | Version | Download |
|----------|---------|----------|
| Python | 3.10 or higher | https://www.python.org/downloads/ |
| Node.js | 18 or higher | https://nodejs.org/ |
| npm | 9.0+ | Included with Node.js |
| Git | Latest | https://git-scm.com/downloads |

### System Requirements

- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space
- **OS**: Windows, macOS, or Linux

### Verify Installations

```bash
python --version    # Should show 3.10+
node --version      # Should show v18+
npm --version       # Should show 9+
git --version       # Should show 2.0+
```

## Backend Setup

### 1. Navigate to Backend Directory

```bash
cd backend
```

### 2. Create Virtual Environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This installs:
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `torch` - PyTorch for ML models
- `transformers` - Hugging Face models (CodeBERT)
- `faiss-cpu` - Vector similarity search
- `tree-sitter` - Code parsing
- `tree-sitter-python` - Python parser
- `tree-sitter-javascript` - JavaScript parser
- `python-dotenv` - Environment variables
- `loguru` - Logging
- `rank-bm25` - Text search
- `groq` - Groq LLM API client

### 4. Configure Environment Variables

Create `.env` file in `backend/` directory:

```bash
cp .env.example .env
```

Edit `backend/.env` and add:

```env
# Groq API Key (Required for chatbot feature)
GROQ_API_KEY=your_groq_api_key_here
```

**Get Groq API Key:**
1. Visit https://console.groq.com
2. Sign up or log in
3. Navigate to API Keys section
4. Create new API key
5. Copy and paste into `.env` file

### 5. Verify Backend Installation

```bash
python -m app.main
```

Server should start on `http://localhost:8000`

Visit `http://localhost:8000/docs` to see API documentation.

Press `Ctrl+C` to stop the server.

## Frontend Setup

### 1. Navigate to Frontend Directory

```bash
cd ../frontend
```

### 2. Install Node Dependencies

```bash
npm install
```

This installs:
- `react` - UI framework
- `react-dom` - React DOM bindings
- `typescript` - Type safety
- `vite` - Build tool
- `tailwindcss` - CSS framework
- `framer-motion` - Animations
- `axios` - HTTP client
- `lucide-react` - Icons
- `@monaco-editor/react` - Code editor

### 3. Configure Environment (Optional)

Create `.env` file in `frontend/` directory:

```bash
cp .env.example .env
```

Edit `frontend/.env` (optional):

```env
# Backend API URL (default: http://localhost:8000)
VITE_API_URL=http://localhost:8000
```

### 4. Verify Frontend Installation

```bash
npm run dev
```

App should start on `http://localhost:5173`

Press `Ctrl+C` to stop the dev server.

## Environment Variables Reference

### Backend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GROQ_API_KEY` | Yes (for chat) | None | Groq API key for chatbot feature |

### Frontend Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:8000` | Backend API URL |

## Running the Application

### Start Backend

```bash
cd backend
source venv/bin/activate  # Windows: venv\Scripts\activate
python -m app.main
```

Backend runs on: `http://localhost:8000`

### Start Frontend (New Terminal)

```bash
cd frontend
npm run dev
```

Frontend runs on: `http://localhost:5173`

### Open Application

Visit `http://localhost:5173` in your browser.

## Post-Installation

### Index Your First Codebase

**Method 1: Upload via UI**
1. Click upload button (↑) in header
2. Select folder or ZIP file
3. Wait for indexing to complete

**Method 2: GitHub Repository**
1. Click upload button
2. Select "GitHub" tab
3. Enter repository URL
4. Click "Index"

**Method 3: API Call**
```bash
curl -X POST http://localhost:8000/api/index \
  -H "Content-Type: application/json" \
  -d '{"directory_path": "/path/to/your/project"}'
```

### Test Search

Try these example queries:
- "functions that validate email addresses"
- "code that connects to database"
- "error handling logic"
- "authentication middleware"

### Test Chat

1. Click chat icon (💬) in header
2. Toggle "Search codebase for context" on
3. Ask: "How does the search engine work?"

## Troubleshooting

### Backend Issues

**Import Error: No module named 'app'**
```bash
# Make sure you're in the backend directory
cd backend
# And virtual environment is activated
source venv/bin/activate  # Windows: venv\Scripts\activate
```

**GROQ_API_KEY not found**
```bash
# Check .env file exists
ls .env  # Windows: dir .env
# Verify key is set correctly
cat .env  # Windows: type .env
```

**Port 8000 already in use**
```bash
# Find process using port 8000
# Windows:
netstat -ano | findstr :8000
# macOS/Linux:
lsof -i :8000
# Kill the process or use different port
```

**Tree-sitter build fails**
```bash
# Install build tools
# Windows: Install Visual Studio Build Tools
# macOS: xcode-select --install
# Linux: sudo apt-get install build-essential
```

### Frontend Issues

**Module not found errors**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Port 5173 already in use**
```bash
# Vite will automatically try next available port
# Or specify different port:
npm run dev -- --port 3000
```

**Build errors**
```bash
# Clear Vite cache
rm -rf node_modules/.vite
npm run dev
```

### Common Issues

**Search returns no results**
- Ensure code is indexed (check stats in header)
- Try lower similarity threshold
- Check backend logs for errors

**Chatbot not working**
- Verify `GROQ_API_KEY` is set in `backend/.env`
- Restart backend server after adding key
- Check API key is valid at console.groq.com

**Upload fails**
- Check file permissions
- Ensure enough disk space
- Try smaller folder first
- Check backend logs for errors

## Development Tips

### Backend Development

**Hot Reload:**
```bash
# Use uvicorn with reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**View Logs:**
```bash
# Logs are written to codescope.log
tail -f codescope.log  # macOS/Linux
Get-Content codescope.log -Wait  # Windows PowerShell
```

**Interactive API Docs:**
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Frontend Development

**Build for Production:**
```bash
npm run build
npm run preview  # Preview production build
```

**Type Checking:**
```bash
npm run type-check
```

**Linting:**
```bash
npm run lint
```

## Production Deployment

### Backend

```bash
# Install production dependencies
pip install gunicorn

# Run with gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Frontend

```bash
# Build for production
npm run build

# Serve with any static file server
# dist/ folder contains production build
```

### Environment Variables in Production

**Backend:**
- Set `GROQ_API_KEY` in production environment
- Use secrets manager (AWS Secrets, Azure Key Vault, etc.)

**Frontend:**
- Set `VITE_API_URL` to production backend URL
- Rebuild after changing environment variables

## Docker Deployment (Optional)

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## Additional Resources

- FastAPI Docs: https://fastapi.tiangolo.com/
- React Docs: https://react.dev/
- Vite Docs: https://vitejs.dev/
- Groq Docs: https://console.groq.com/docs
- Tree-sitter: https://tree-sitter.github.io/

## Getting Help

If you encounter issues:
1. Check troubleshooting section above
2. Review backend logs (`codescope.log`)
3. Check browser console for frontend errors
4. Open issue on GitHub with error details

## Next Steps

After successful setup:
1. Index your codebase
2. Try example searches
3. Test chatbot features
4. Explore API documentation
5. Customize for your needs
