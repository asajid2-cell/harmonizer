"""Pydantic models for API requests and responses"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# Request Models

class IndexRequest(BaseModel):
    """Request to index a directory"""
    directory_path: str = Field(..., description="Path to directory containing Python files")
    show_progress: bool = Field(True, description="Show progress during indexing")

    class Config:
        json_schema_extra = {
            "example": {
                "directory_path": "/path/to/codebase",
                "show_progress": True
            }
        }


class SearchRequest(BaseModel):
    """Request to search code"""
    query: str = Field(..., description="Natural language search query", min_length=1)
    limit: int = Field(20, description="Maximum number of results", ge=1, le=100)
    min_similarity: float = Field(0.0, description="Minimum similarity score", ge=0.0, le=1.0)
    symbol_type: Optional[str] = Field(None, description="Filter by symbol type: function, class, or method")
    file_path_filter: Optional[str] = Field(None, description="Filter by file path substring (e.g., 'backend', 'frontend')")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "authentication functions",
                "limit": 20,
                "min_similarity": 0.0,
                "symbol_type": None,
                "file_path_filter": None
            }
        }


class SimilarCodeRequest(BaseModel):
    """Request to find similar code"""
    code_snippet: str = Field(..., description="Code snippet to find similar matches for", min_length=1)
    limit: int = Field(10, description="Maximum number of results", ge=1, le=50)
    min_similarity: float = Field(0.5, description="Minimum similarity score", ge=0.0, le=1.0)

    class Config:
        json_schema_extra = {
            "example": {
                "code_snippet": "def authenticate(user, pwd):\n    return verify(user, pwd)",
                "limit": 10,
                "min_similarity": 0.5
            }
        }


class SymbolLookupRequest(BaseModel):
    """Request to lookup a specific symbol"""
    name: str = Field(..., description="Exact symbol name")
    file_path: Optional[str] = Field(None, description="Optional file path to narrow search")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "authenticate_user",
                "file_path": "/path/to/auth.py"
            }
        }


# Response Models

class SearchResult(BaseModel):
    """Single search result"""
    symbol_name: str = Field(..., description="Name of the code symbol")
    symbol_type: str = Field(..., description="Type of symbol (function, class, method)")
    file_path: str = Field(..., description="Path to the file containing this symbol")
    code_snippet: str = Field(..., description="The actual code")
    start_line: int = Field(..., description="Starting line number", ge=1)
    end_line: int = Field(..., description="Ending line number", ge=1)
    similarity_score: float = Field(..., description="Similarity score (0-1)", ge=0.0, le=1.0)
    docstring: Optional[str] = Field(None, description="Function/class docstring if available")
    match_info: Optional[str] = Field(None, description="Explanation of why this result matched")
    highlighted_name: Optional[str] = Field(None, description="Symbol name with matched terms highlighted")
    highlighted_docstring: Optional[str] = Field(None, description="Docstring with matched terms highlighted")

    class Config:
        json_schema_extra = {
            "example": {
                "symbol_name": "authenticate_user",
                "symbol_type": "function",
                "file_path": "/path/to/auth.py",
                "code_snippet": "def authenticate_user(username, password):\n    return check_creds(username, password)",
                "start_line": 10,
                "end_line": 12,
                "similarity_score": 0.92,
                "docstring": "Authenticate a user with credentials",
                "match_info": "Keywords: auth, user"
            }
        }


class SearchResponse(BaseModel):
    """Response for search requests"""
    query: str = Field(..., description="The search query")
    results: List[SearchResult] = Field(..., description="List of search results")
    total_results: int = Field(..., description="Total number of results returned")
    search_time_ms: float = Field(..., description="Time taken for search in milliseconds")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "authentication functions",
                "results": [],
                "total_results": 5,
                "search_time_ms": 150.5
            }
        }


class IndexStats(BaseModel):
    """Statistics from indexing operation"""
    files_processed: int = Field(..., description="Number of files successfully processed")
    files_failed: int = Field(..., description="Number of files that failed to process")
    total_symbols: int = Field(..., description="Total symbols indexed")
    functions_indexed: int = Field(..., description="Number of functions indexed")
    classes_indexed: int = Field(..., description="Number of classes indexed")
    methods_indexed: int = Field(..., description="Number of methods indexed")
    total_lines: int = Field(..., description="Total lines of code processed")
    time_taken: float = Field(..., description="Time taken in seconds")

    class Config:
        json_schema_extra = {
            "example": {
                "files_processed": 25,
                "files_failed": 0,
                "total_symbols": 150,
                "functions_indexed": 80,
                "classes_indexed": 20,
                "methods_indexed": 50,
                "total_lines": 5000,
                "time_taken": 15.3
            }
        }


class IndexResponse(BaseModel):
    """Response for index requests"""
    success: bool = Field(..., description="Whether indexing succeeded")
    stats: IndexStats = Field(..., description="Indexing statistics")
    message: str = Field(..., description="Status message")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "stats": {
                    "files_processed": 25,
                    "files_failed": 0,
                    "total_symbols": 150,
                    "functions_indexed": 80,
                    "classes_indexed": 20,
                    "methods_indexed": 50,
                    "total_lines": 5000,
                    "time_taken": 15.3
                },
                "message": "Successfully indexed 25 files"
            }
        }


class StatsResponse(BaseModel):
    """Response for stats endpoint"""
    total_symbols: int = Field(..., description="Total symbols indexed")
    total_files: int = Field(..., description="Total files indexed")
    functions: int = Field(..., description="Number of functions")
    classes: int = Field(..., description="Number of classes")
    vector_count: int = Field(..., description="Number of vectors in store")
    ready: bool = Field(..., description="Whether the system is ready for searches")

    class Config:
        json_schema_extra = {
            "example": {
                "total_symbols": 150,
                "total_files": 25,
                "functions": 100,
                "classes": 50,
                "vector_count": 150,
                "ready": True
            }
        }


class HealthResponse(BaseModel):
    """Response for health check"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    ready: bool = Field(..., description="Whether the service is ready")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0",
                "ready": True
            }
        }


class ErrorResponse(BaseModel):
    """Error response"""
    error: str = Field(..., description="Error message")
    details: Optional[str] = Field(None, description="Additional error details")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "Invalid request",
                "details": "Query parameter is required"
            }
        }
