# CodeSniff

CodeSniff is the semantic code-search prototype inside Harmonizer. It indexes source files, stores metadata locally, and serves search and chat endpoints through a FastAPI backend.

## Run Locally

Backend:

```bash
cd codesniff/backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Windows PowerShell activation:

```powershell
venv\Scripts\Activate.ps1
```

Frontend:

```bash
cd codesniff/frontend
npm install
npm run dev
```

Open the API docs:

```text
http://localhost:8000/docs
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `GROQ_API_KEY` | Enables chat responses when the chat feature is used. |
| `CODESCOPE_STORAGE_DIR` | Overrides local index and metadata storage. |

Storage is runtime data and should stay out of Git.

## Main Endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/index` | Index a local directory. |
| `POST /api/index/github` | Clone and index a GitHub repository. |
| `POST /api/index/upload` | Upload and index source files. |
| `POST /api/index/clear` | Clear indexed data. |
| `GET /api/files` | List indexed files. |
| `POST /api/search` | Run semantic search. |
| `POST /api/search/name` | Search by symbol name. |
| `POST /api/search/similar` | Find similar code. |
| `GET /api/symbol/<name>` | Fetch a specific symbol. |
| `POST /api/chat` | Ask a codebase question. |
| `GET /api/stats` | Return index statistics. |
| `GET /api/health` | Health check. |

## Implementation Notes

- FastAPI serves the backend API.
- CodeBERT embeddings and FAISS power semantic search.
- Tree-sitter parses source files where supported.
- SQLite stores indexed metadata.
- React and TypeScript power the front end.

Generated indexes, uploaded archives, and cloned repositories are local runtime data. Do not commit them.
