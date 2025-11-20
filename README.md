# Harmonizer

Creative lab combining AI-powered image generation, social profiles, and audio experiments.

## Features
- **Harmonizer** - Upload music and transform it, jump between beats and loop.
- **Eldrichify** - AI image transformation using diffusion models
- **IMGEN** - Text-to-image generation pipeline
- **OurSpace** - MySpace-inspired customizable profiles with auth system
- **RL Labeler** - Reinforcement learning experiment for audio jump detection
- **Disco-Teque** - Conversational AI playground
- **CodeSniff** - Semantic code search using CodeBERT embeddings

## CodeSniff

Semantic code search engine that finds functions and classes by meaning, not just keywords. Index a codebase and query it in natural language.

### Stack
- **Backend**: FastAPI, CodeBERT (microsoft/codebert-base), FAISS vector store
- **Frontend**: React + TypeScript, Monaco Editor, Framer Motion
- **Embedding Model**: CodeBERT generates 768-dimensional vectors for code snippets

### How It Works

1. **Indexing**: Parses Python/JS/TS files using AST, extracts functions and classes with docstrings
2. **Embedding**: CodeBERT converts each code symbol into a semantic vector
3. **Storage**: Vectors stored in FAISS index for fast similarity search
4. **Search**: Query text is embedded, FAISS finds nearest neighbors by cosine similarity

### Technical Details

- **Symbol extraction**: Uses Python `ast` module and regex-based parsers to extract function/class definitions
- **Chunking**: Each symbol (function, method, class) becomes one indexed unit with metadata (file path, line numbers, docstring)
- **Vector dimensions**: 768-d embeddings from CodeBERT's `[CLS]` token
- **Similarity threshold**: Default 0.3 minimum score, returns top 10 results
- **File policies**: Ignores `node_modules/`, `__pycache__/`, `.git/`, `venv/`, and binary files
- **Supported languages**: Python (`.py`), JavaScript (`.js`, `.jsx`), TypeScript (`.ts`, `.tsx`), Java (`.java`), Kotlin (`.kt`)

### API Endpoints

- `POST /api/codesniff/index/upload` - Upload folder/zip for indexing
- `POST /api/codesniff/index/github` - Clone and index a GitHub repo
- `POST /api/codesniff/search` - Semantic search query
- `GET /api/codesniff/stats` - Index statistics
- `POST /api/codesniff/chat` - RAG-powered chat about your codebase
- `DELETE /api/codesniff/index` - Clear the index

### Memory Requirements

CodeBERT model loads ~500MB into memory. Container needs at least 1GB RAM allocated (we use 1.2GB limit in production).

## Installation

### Docker (Production)

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

Server runs on port 4000 by default.

### Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
python app.py

# Frontend (separate terminal)
cd frontend
python -m http.server 8000
```

## Configuration

Edit `.env` with your credentials:

| Variable | Description |
| --- | --- |
| `SECRET_KEY` | Flask session key (generate: `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `YOUTUBE_API_KEY` | Optional - for video metadata |

## API Endpoints

### Image Generation
- `POST /api/eldrichify` - Transform images with AI
- `GET /api/eldrichify/status/<job_id>` - Check processing status
- `POST /api/imgen` - Generate images from text prompts
- `GET /api/imgen/status/<job_id>` - Check generation status

### OurSpace (Social Profiles)
- `POST /api/ourspace/register` - Create account
- `POST /api/ourspace/login` - Login
- `GET /api/ourspace/profile/<username>` - View profile
- `POST /api/ourspace/upload` - Upload media

### RL Experiments
- `POST /api/rl/jump-event` - Log audio jump event
- `GET /api/rl/policy` - Get current policy
- `POST /api/rl/snippet/<id>/label` - Label training data

Full endpoint list: see [backend/app.py](backend/app.py)

## Project Structure

```
backend/
  app.py              # Flask API
  eldrichify.py       # Image transformation pipeline
  imgen_pipeline.py   # Text-to-image generation
  ourspace_db.py      # User database and auth
frontend/
  eldrichify.html     # Image transformer UI
  ourspace.html       # Social profile builder
  rl_labeler.html     # RL training interface
  js/                 # Client-side logic
```

## Deployment

See [BACKUPS.md](BACKUPS.md) for VPS backup procedures.

Basic VPS setup:
1. Provision 2-4 vCPU server
2. Install Docker + Compose
3. Clone repo and configure `.env`
4. Run `docker compose up -d`
5. Optional: Add Traefik for TLS

## Documentation

- [OurSpace Authentication Guide](OURSPACE_AUTH_GUIDE.md) - User accounts and profile system
- [Database Backups](BACKUPS.md) - Backup and restore procedures

## License

MIT
