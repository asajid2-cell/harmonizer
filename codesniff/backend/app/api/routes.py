"""API routes for CodeScope"""

import time
import subprocess
import tempfile
import shutil
import zipfile
from pathlib import Path
from typing import Optional, List, Dict
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form
from loguru import logger

from ..models.schemas import (
    IndexRequest, IndexResponse, IndexStats,
    SearchRequest, SearchResponse, SearchResult,
    SimilarCodeRequest, SymbolLookupRequest,
    StatsResponse, HealthResponse, ErrorResponse
)
from ..core.indexer import Indexer
from ..core.search import SearchEngine
from ..chatbot.groq_chat import CodeSniffChatbot, CodeSniffRAG


# Create router
router = APIRouter()

# Global instances (will be initialized in main.py)
indexer: Optional[Indexer] = None
search_engine: Optional[SearchEngine] = None
chatbot: Optional[CodeSniffChatbot] = None
rag_system: Optional[CodeSniffRAG] = None


def set_indexer(idx: Indexer):
    """Set the global indexer instance"""
    global indexer
    indexer = idx


def set_search_engine(engine: SearchEngine):
    """Set the global search engine instance"""
    global search_engine
    search_engine = engine


def set_chatbot(bot: CodeSniffChatbot):
    """Set the global chatbot instance"""
    global chatbot
    chatbot = bot


def set_rag_system(rag: CodeSniffRAG):
    """Set the global RAG system instance"""
    global rag_system
    rag_system = rag


@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Health check endpoint

    Returns system status and readiness
    """
    ready = False
    if search_engine:
        stats = search_engine.get_stats()
        ready = stats.get('ready', False)

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        ready=ready
    )


@router.get("/stats", response_model=StatsResponse, tags=["System"])
async def get_stats():
    """
    Get index statistics

    Returns information about indexed code:
    - Total symbols indexed
    - Total files indexed
    - Breakdown by type (functions, classes)
    - System readiness
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    stats = search_engine.get_stats()

    return StatsResponse(
        total_symbols=stats.get('total_symbols', 0),
        total_files=stats.get('total_files', 0),
        functions=stats.get('functions', 0),
        classes=stats.get('classes', 0),
        vector_count=stats.get('vector_count', 0),
        ready=stats.get('ready', False)
    )


@router.post("/index", response_model=IndexResponse, tags=["Indexing"])
async def index_directory(request: IndexRequest):
    """
    Index a directory of Python files

    This will:
    1. Scan the directory for Python files
    2. Parse each file to extract functions and classes
    3. Generate semantic embeddings
    4. Store in vector database for fast search

    Args:
        request: IndexRequest with directory_path

    Returns:
        IndexResponse with statistics about the indexing operation
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    try:
        logger.info(f"Starting indexing of directory: {request.directory_path}")

        # Perform indexing
        stats = indexer.index_directory(
            directory_path=request.directory_path,
            show_progress=request.show_progress
        )

        # Convert to response model
        index_stats = IndexStats(
            files_processed=stats.files_processed,
            files_failed=stats.files_failed,
            total_symbols=stats.total_symbols,
            functions_indexed=stats.functions_indexed,
            classes_indexed=stats.classes_indexed,
            methods_indexed=stats.methods_indexed,
            total_lines=stats.total_lines,
            time_taken=stats.time_taken
        )

        message = f"Successfully indexed {stats.files_processed} files with {stats.total_symbols} symbols"
        if stats.files_failed > 0:
            message += f" ({stats.files_failed} files failed)"

        logger.info(message)

        return IndexResponse(
            success=True,
            stats=index_stats,
            message=message
        )

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Indexing failed: {str(e)}"
        )


@router.post("/search", response_model=SearchResponse, tags=["Search"])
async def search_code(request: SearchRequest):
    """
    Search for code using natural language query

    Use natural language to find relevant code:
    - "authentication functions"
    - "database connections"
    - "error handling"
    - "user management classes"

    The search uses semantic embeddings to understand intent,
    not just keyword matching.

    Args:
        request: SearchRequest with query and options

    Returns:
        SearchResponse with matching code snippets
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        start_time = time.time()

        # Perform search
        results = search_engine.search(
            query=request.query,
            limit=request.limit,
            min_similarity=request.min_similarity,
            symbol_type=request.symbol_type,
            file_path_filter=request.file_path_filter
        )

        search_time_ms = (time.time() - start_time) * 1000

        # Convert to response models
        search_results = [
            SearchResult(
                symbol_name=r.symbol_name,
                symbol_type=r.symbol_type,
                file_path=r.file_path,
                code_snippet=r.code_snippet,
                start_line=r.start_line,
                end_line=r.end_line,
                similarity_score=r.similarity_score,
                docstring=r.docstring,
                match_info=r.match_info
            )
            for r in results
        ]

        return SearchResponse(
            query=request.query,
            results=search_results,
            total_results=len(search_results),
            search_time_ms=search_time_ms
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/search/similar", response_model=SearchResponse, tags=["Search"])
async def find_similar_code(request: SimilarCodeRequest):
    """
    Find code similar to a given snippet

    Provide a code snippet and find similar code in the index.
    Useful for finding duplicates, similar implementations, or related code.

    Args:
        request: SimilarCodeRequest with code snippet

    Returns:
        SearchResponse with similar code snippets
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        start_time = time.time()

        # Find similar code
        results = search_engine.find_similar_code(
            code_snippet=request.code_snippet,
            limit=request.limit,
            min_similarity=request.min_similarity
        )

        search_time_ms = (time.time() - start_time) * 1000

        # Convert to response models
        search_results = [
            SearchResult(
                symbol_name=r.symbol_name,
                symbol_type=r.symbol_type,
                file_path=r.file_path,
                code_snippet=r.code_snippet,
                start_line=r.start_line,
                end_line=r.end_line,
                similarity_score=r.similarity_score,
                docstring=r.docstring
            )
            for r in results
        ]

        return SearchResponse(
            query=f"Similar to: {request.code_snippet[:50]}...",
            results=search_results,
            total_results=len(search_results),
            search_time_ms=search_time_ms
        )

    except Exception as e:
        logger.error(f"Similar code search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Similar code search failed: {str(e)}"
        )


@router.post("/search/name", response_model=SearchResponse, tags=["Search"])
async def search_by_name(name: str, limit: int = 100):
    """
    Search for code by exact or partial name match

    Simple text-based search by symbol name.
    Faster than semantic search but less intelligent.

    Args:
        name: Symbol name to search for
        limit: Maximum results

    Returns:
        SearchResponse with matching symbols
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        start_time = time.time()

        # Search by name
        results = search_engine.search_by_name(name, limit=limit)

        search_time_ms = (time.time() - start_time) * 1000

        # Convert to response models
        search_results = [
            SearchResult(
                symbol_name=r.symbol_name,
                symbol_type=r.symbol_type,
                file_path=r.file_path,
                code_snippet=r.code_snippet,
                start_line=r.start_line,
                end_line=r.end_line,
                similarity_score=r.similarity_score,
                docstring=r.docstring
            )
            for r in results
        ]

        return SearchResponse(
            query=f"Name: {name}",
            results=search_results,
            total_results=len(search_results),
            search_time_ms=search_time_ms
        )

    except Exception as e:
        logger.error(f"Name search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Name search failed: {str(e)}"
        )


@router.get("/symbol/{name}", response_model=SearchResult, tags=["Search"])
async def get_symbol(name: str, file_path: Optional[str] = None):
    """
    Get a specific symbol by exact name

    Args:
        name: Exact symbol name
        file_path: Optional file path to narrow search

    Returns:
        SearchResult for the symbol
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        result = search_engine.get_symbol_by_name(name, file_path)

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Symbol '{name}' not found"
            )

        return SearchResult(
            symbol_name=result.symbol_name,
            symbol_type=result.symbol_type,
            file_path=result.file_path,
            code_snippet=result.code_snippet,
            start_line=result.start_line,
            end_line=result.end_line,
            similarity_score=result.similarity_score,
            docstring=result.docstring
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Symbol lookup failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Symbol lookup failed: {str(e)}"
        )


@router.post("/index/clear", tags=["Indexing"])
async def clear_index():
    """
    Clear all indexed data

    WARNING: This will delete all indexed code and cannot be undone.

    Returns:
        Success message
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    try:
        indexer.clear_index()
        return {"success": True, "message": "Index cleared successfully"}

    except Exception as e:
        logger.error(f"Clear index failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clear index failed: {str(e)}"
        )


@router.post("/index/github", tags=["Indexing"])
async def index_github_repo(repo_url: str):
    """
    Clone and index a GitHub repository

    This endpoint will:
    1. Clone the repository to a temporary directory
    2. Clean up unnecessary files (media, archives, node_modules, etc.)
    3. Index the code
    4. Remove the temporary directory

    Args:
        repo_url: GitHub repository URL (e.g., https://github.com/user/repo)

    Returns:
        IndexResponse with statistics
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    from ..utils.github_clone import clone_github_repo, clean_repository, cleanup_temp_repo

    temp_dir = None
    try:
        # Clone repository
        logger.info(f"Cloning GitHub repository: {repo_url}")
        temp_dir = clone_github_repo(repo_url)

        # Clean repository
        logger.info("Cleaning repository")
        clean_stats = clean_repository(temp_dir)
        logger.info(f"Removed {clean_stats['files_removed']} files, {clean_stats['dirs_removed']} directories")

        # Index the cleaned repository
        logger.info(f"Indexing repository at {temp_dir}")
        stats = indexer.index_directory(temp_dir, show_progress=False)

        return {
            "success": True,
            "stats": stats,
            "message": f"Successfully indexed GitHub repository. Cleaned {clean_stats['files_removed']} files.",
            "cleanup_stats": clean_stats
        }

    except subprocess.CalledProcessError as e:
        logger.error(f"Git clone failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to clone repository: {e.stderr if hasattr(e, 'stderr') else str(e)}"
        )
    except RuntimeError as e:
        logger.error(f"Git error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"GitHub indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to index repository: {str(e)}"
        )
    finally:
        # Clean up temporary directory
        if temp_dir:
            try:
                cleanup_temp_repo(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp directory: {e}")


@router.post("/index/upload", tags=["Indexing"])
async def upload_and_index(files: List[UploadFile] = File(...), is_zip: bool = Form(False)):
    """
    Upload and index files (folder or ZIP archive)

    This endpoint will:
    1. Save uploaded files to a temporary directory
    2. Extract ZIP if needed
    3. Clean up unnecessary files
    4. Index the code
    5. Remove the temporary directory

    Args:
        files: List of uploaded files
        is_zip: Whether the upload is a ZIP file

    Returns:
        IndexResponse with statistics
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    from ..utils.github_clone import clean_repository, cleanup_temp_repo

    temp_dir = None
    try:
        # Create temporary directory
        temp_dir = tempfile.mkdtemp(prefix='codescope_upload_')
        logger.info(f"Created temporary directory: {temp_dir}")

        if is_zip and len(files) == 1:
            # Handle ZIP file
            zip_path = Path(temp_dir) / files[0].filename
            with open(zip_path, 'wb') as f:
                content = await files[0].read()
                f.write(content)

            # Extract ZIP
            logger.info(f"Extracting ZIP file: {files[0].filename}")
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(temp_dir)

            # Remove the ZIP file itself
            zip_path.unlink()
        else:
            # Handle folder upload (multiple files)
            logger.info(f"Saving {len(files)} uploaded files")
            for file in files:
                # Reconstruct directory structure
                file_path = Path(temp_dir) / file.filename
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Save file
                with open(file_path, 'wb') as f:
                    content = await file.read()
                    f.write(content)

        # Clean repository
        logger.info("Cleaning uploaded files")
        clean_stats = clean_repository(temp_dir)
        logger.info(f"Removed {clean_stats['files_removed']} files, {clean_stats['dirs_removed']} directories")

        # Index the cleaned repository
        logger.info(f"Indexing uploaded files at {temp_dir}")
        stats = indexer.index_directory(temp_dir, show_progress=False)

        return {
            "success": True,
            "stats": stats,
            "message": f"Successfully indexed uploaded files. Cleaned {clean_stats['files_removed']} files.",
            "cleanup_stats": clean_stats
        }

    except zipfile.BadZipFile:
        logger.error("Invalid ZIP file")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ZIP file"
        )
    except Exception as e:
        logger.error(f"Upload indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to index uploaded files: {str(e)}"
        )
    finally:
        # Clean up temporary directory
        if temp_dir:
            try:
                cleanup_temp_repo(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp directory: {e}")


@router.get("/files", tags=["Indexing"])
async def list_indexed_files():
    """
    List all indexed files

    Returns:
        List of indexed file paths with stats
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    try:
        cursor = indexer.metadata_store.conn.cursor()
        cursor.execute('''
            SELECT f.id, f.path, f.total_lines, f.indexed_at,
                   COUNT(s.id) as symbol_count
            FROM files f
            LEFT JOIN symbols s ON f.id = s.file_id
            GROUP BY f.id
            ORDER BY f.indexed_at DESC
        ''')

        files = []
        for row in cursor.fetchall():
            files.append({
                "id": row['id'],
                "path": row['path'],
                "total_lines": row['total_lines'],
                "indexed_at": row['indexed_at'],
                "symbol_count": row['symbol_count']
            })

        return {
            "total_files": len(files),
            "files": files
        }

    except Exception as e:
        logger.error(f"List files failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"List files failed: {str(e)}"
        )


@router.get("/autocomplete", tags=["Search"])
async def autocomplete(prefix: str, limit: int = 10):
    """
    Get autocomplete suggestions for search queries

    Args:
        prefix: Query prefix to autocomplete
        limit: Maximum number of suggestions

    Returns:
        List of suggested terms
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        suggestions = search_engine.text_search.autocomplete(prefix, limit)
        return {
            "prefix": prefix,
            "suggestions": suggestions
        }
    except Exception as e:
        logger.error(f"Autocomplete failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Autocomplete failed: {str(e)}"
        )


@router.get("/popular-terms", tags=["Search"])
async def get_popular_terms(limit: int = 20):
    """
    Get most popular search terms in the index

    Args:
        limit: Maximum number of terms

    Returns:
        List of popular terms
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        terms = search_engine.text_search.get_popular_terms(limit)
        return {
            "terms": terms
        }
    except Exception as e:
        logger.error(f"Get popular terms failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Get popular terms failed: {str(e)}"
        )


@router.post("/chat", tags=["Chat"])
async def chat(
    message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    use_rag: bool = True
):
    """
    Chat with AI assistant about the codebase

    Send a message and get an intelligent response. The chatbot can:
    - Answer questions about the code
    - Help troubleshoot issues
    - Explain how to run/build projects
    - Provide guidance on using CodeSniff

    Args:
        message: Your question or message
        conversation_history: Previous messages (optional, for context)
        use_rag: Whether to search codebase for relevant context (default: True)

    Returns:
        AI response with optional code sources
    """
    if not chatbot:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatbot not initialized. GROQ_API_KEY may be missing."
        )

    try:
        start_time = time.time()

        # Use RAG if enabled and search engine available
        if use_rag and rag_system:
            result = rag_system.answer_with_context(
                question=message,
                conversation_history=conversation_history
            )
            response_time_ms = (time.time() - start_time) * 1000

            return {
                "answer": result["answer"],
                "sources": result.get("sources", []),
                "used_rag": result["used_rag"],
                "response_time_ms": response_time_ms
            }
        else:
            # Direct chat without RAG
            answer = chatbot.chat(
                message=message,
                conversation_history=conversation_history
            )
            response_time_ms = (time.time() - start_time) * 1000

            return {
                "answer": answer,
                "sources": [],
                "used_rag": False,
                "response_time_ms": response_time_ms
            }

    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {str(e)}"
        )
