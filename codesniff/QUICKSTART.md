# ⚡ CodeScope Quick Start

Get CodeScope running in 5 minutes!

## Prerequisites

- Python 3.10+
- Node.js 18+
- 4GB RAM

## Installation (One Command!)

```bash
chmod +x scripts/setup.sh && ./scripts/setup.sh
```

This will:
- Set up Python virtual environment
- Install all dependencies
- Create configuration files
- Create storage directory

## Start the Application

**Terminal 1 - Backend:**
```bash
chmod +x scripts/start_backend.sh && ./scripts/start_backend.sh
```

**Terminal 2 - Frontend:**
```bash
chmod +x scripts/start_frontend.sh && ./scripts/start_frontend.sh
```

## Index Sample Code

**Terminal 3:**
```bash
chmod +x scripts/index_sample.sh && ./scripts/index_sample.sh
```

Wait ~15 seconds for indexing to complete.

## Start Searching!

1. Open http://localhost:5173
2. Try these queries:
   - `"authentication functions"`
   - `"database connections"`
   - `"error handling"`
   - `"data validation"`

## Next Steps

### Index Your Own Code

```bash
curl -X POST http://localhost:8000/api/index \
  -H "Content-Type: application/json" \
  -d '{"directory_path": "/path/to/your/python/project"}'
```

### Check Status

```bash
curl http://localhost:8000/api/stats
```

### Explore API

Visit http://localhost:8000/docs for interactive API documentation.

## Troubleshooting

**Backend won't start:**
- Check Python version: `python --version` (needs 3.10+)
- Activate venv: `source backend/venv/bin/activate`
- Check port 8000 is available

**Frontend won't start:**
- Check Node version: `node --version` (needs 18+)
- Clear node_modules: `rm -rf node_modules && npm install`
- Check port 5173 is available

**Indexing fails:**
- Ensure backend is running
- Check directory path is absolute
- Ensure directory contains Python files

## Need Help?

- Full documentation: `README.md`
- Demo guide: `DEMO.md`
- API docs: http://localhost:8000/docs

---

**Tip:** Use `Cmd/Ctrl + K` to quickly focus the search bar!
