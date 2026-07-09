"""CodeScope FastAPI Application"""

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from dotenv import load_dotenv

from .core.parser import CodeParser
from .core.indexer import Indexer
from .core.worker_runtime import initialize_job_runtime
from .core.search import SearchEngine
from .core.text_search import TextSearchEngine
from .storage.vector_store import VectorStore
from .storage.metadata_store import MetadataStore
from .chatbot.groq_chat import CodeSniffChatbot, CodeSniffRAG
from .api import routes

# Load environment variables from .env file
load_dotenv()


# Configure logger. Loguru ships with a default DEBUG stderr handler; remove it
# so hot indexing loops do not flood production stderr.
logger.remove()
logger.add(sys.stderr, level=os.environ.get("CODESNIFF_LOG_LEVEL", "INFO"))
logger.add(
    "codescope.log",
    rotation="10 MB",
    retention="7 days",
    level=os.environ.get("CODESNIFF_FILE_LOG_LEVEL", os.environ.get("CODESNIFF_LOG_LEVEL", "INFO"))
)


# Global instances
indexer: Indexer = None
search_engine: SearchEngine = None


def _web_runner_enabled() -> bool:
    configured = os.environ.get("CODESNIFF_WEB_RUNNER_ENABLED", "1").strip().lower()
    return configured not in {"0", "false", "no", "off"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle manager for FastAPI app
    Initialize components on startup, cleanup on shutdown
    """
    global indexer, search_engine
    job_runtime = None

    logger.info("Starting CodeScope API...")

    # Initialize components
    try:
        # Create storage directory
        storage_dir = os.environ.get("CODESCOPE_STORAGE_DIR", "./storage")
        os.makedirs(storage_dir, exist_ok=True)

        # Database path
        db_path = os.path.join(storage_dir, "codescope.db")
        # Initialize core components
        parser = CodeParser()
        embedder = None
        embedder_cache_dir = os.path.join(storage_dir, "embeddings_cache")
        vector_store = VectorStore(dimension=768)
        metadata_store = MetadataStore(db_path=db_path)
        text_search = TextSearchEngine()

        # Initialize indexer and search engine with shared text_search
        indexer = Indexer(
            parser=parser,
            embedder=embedder,
            embedder_cache_dir=embedder_cache_dir,
            vector_store=vector_store,
            metadata_store=metadata_store,
            text_search=text_search
        )

        search_engine = SearchEngine(
            embedder=embedder,
            embedder_cache_dir=embedder_cache_dir,
            vector_store=vector_store,
            metadata_store=metadata_store,
            text_search=text_search
        )

        # Initialize chatbot (optional, only if GROQ_API_KEY is set)
        chatbot = None
        rag_system = None
        try:
            chatbot = CodeSniffChatbot()
            rag_system = CodeSniffRAG(chatbot, search_engine)
            logger.info("Groq chatbot initialized successfully")
        except ValueError as e:
            logger.warning(f"Chatbot not initialized: {e}")
        except Exception as e:
            logger.error(f"Error initializing chatbot: {e}")

        # Set in routes module
        routes.set_indexer(indexer)
        routes.set_search_engine(search_engine)
        if chatbot:
            routes.set_chatbot(chatbot)
        if rag_system:
            routes.set_rag_system(rag_system)

        start_web_worker = _web_runner_enabled()
        if not start_web_worker:
            logger.info("CodeSniff web-process job runner disabled; waiting for external worker")

        job_runtime = initialize_job_runtime(
            storage_dir=storage_dir,
            max_active_repos=int(os.environ.get("CODESNIFF_MAX_ACTIVE_REPOS", "3")),
            poll_interval=float(os.environ.get("CODESNIFF_JOB_POLL_INTERVAL", "1.0")),
            recover_interrupted=True,
            run_recovery_scan=True,
            start_runner=start_web_worker,
        )

        # Try to load existing index
        index_dir = os.path.join(storage_dir, "vector_index")
        if os.path.exists(os.path.join(index_dir, "vectors.index")):
            try:
                vector_store.load(index_dir)
                logger.info(f"Loaded existing vector index: {vector_store.vector_count} vectors")
                # Rebuild text search index from loaded data
                search_engine.rebuild_text_index()
                logger.info(f"Rebuilt text index: {text_search.doc_count} documents")
            except Exception as e:
                logger.warning(f"Could not load existing index: {e}")

        logger.info("CodeScope API ready!")

    except Exception as e:
        logger.error(f"Failed to initialize CodeScope: {e}")
        raise

    yield

    # Cleanup on shutdown
    logger.info("Shutting down CodeScope API...")

    # Save vector index
    try:
        if job_runtime:
            job_runtime.runner.stop()
        if routes.active_repo_manager:
            routes.active_repo_manager.close_all()
        if vector_store and vector_store.vector_count > 0:
            storage_dir = os.environ.get("CODESCOPE_STORAGE_DIR", "./storage")
            index_dir = os.path.join(storage_dir, "vector_index")
            vector_store.save(index_dir)
            logger.info(f"Saved vector index: {vector_store.vector_count} vectors")
    except Exception as e:
        logger.error(f"Error saving index: {e}")


# Create FastAPI app
app = FastAPI(
    title="CodeScope API",
    description="Semantic Code Search Engine - Find code using natural language",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:4000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4000",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(routes.router, prefix="/api")


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "name": "CodeScope API",
        "version": "1.0.0",
        "description": "Semantic Code Search Engine",
        "docs": "/docs",
        "health": "/api/health",
        "features": [
            "Semantic code search using CodeBERT",
            "Natural language queries",
            "Fast vector similarity search with FAISS",
            "Python code parsing with Tree-sitter",
            "Find similar code snippets",
            "Search by function/class names"
        ]
    }


if __name__ == "__main__":
    import uvicorn

    # Run the server
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    logger.info(f"Starting server on {host}:{port}")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
