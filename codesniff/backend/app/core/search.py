"""Hybrid search engine combining text search (BM25) and semantic search"""

import time
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, asdict
from loguru import logger

from .embedder import CodeEmbedder
from .text_search import TextSearchEngine
from ..storage.vector_store import VectorStore
from ..storage.metadata_store import MetadataStore, SymbolRecord


@dataclass
class CodeSearchResult:
    """Search result containing code and metadata"""
    symbol_name: str
    symbol_type: str
    file_path: str
    code_snippet: str
    start_line: int
    end_line: int
    similarity_score: float
    docstring: Optional[str] = None
    match_info: Optional[str] = None
    highlighted_name: Optional[str] = None
    highlighted_docstring: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


class SearchEngine:
    """Hybrid semantic + text code search engine"""

    def __init__(
        self,
        embedder: Optional[CodeEmbedder] = None,
        vector_store: Optional[VectorStore] = None,
        metadata_store: Optional[MetadataStore] = None,
        text_search: Optional[TextSearchEngine] = None
    ):
        """
        Initialize search engine

        Args:
            embedder: CodeEmbedder instance
            vector_store: VectorStore instance
            metadata_store: MetadataStore instance
            text_search: TextSearchEngine instance
        """
        self.embedder = embedder or CodeEmbedder()
        self.vector_store = vector_store or VectorStore()
        self.metadata_store = metadata_store or MetadataStore()

        # Use provided text_search or create new one and build index
        if text_search:
            self.text_search = text_search
            # If text search is empty but we have data, build the index
            if self.text_search.doc_count == 0:
                self._build_text_index()
        else:
            self.text_search = TextSearchEngine()
            self._build_text_index()

        logger.info("SearchEngine initialized with hybrid search")

    def _highlight_terms(self, text: str, terms: List[str], marker: str = "**") -> str:
        """
        Highlight matched terms in text

        Args:
            text: Text to highlight
            terms: Terms to highlight
            marker: Marker to use for highlighting

        Returns:
            Text with highlighted terms
        """
        if not text or not terms:
            return text

        import re
        highlighted = text

        for term in terms:
            # Remove ~ prefix from synonym matches
            clean_term = term.lstrip("~")
            if len(clean_term) < 2:
                continue

            # Case-insensitive replacement
            pattern = re.compile(re.escape(clean_term), re.IGNORECASE)
            highlighted = pattern.sub(
                lambda m: f"{marker}{m.group()}{marker}",
                highlighted
            )

        return highlighted

    def _build_text_index(self):
        """Build text search index from metadata store"""
        try:
            # Get all symbols from metadata store
            cursor = self.metadata_store.conn.cursor()
            cursor.execute('SELECT * FROM symbols')
            rows = cursor.fetchall()

            if not rows:
                return

            # Add to text search index
            symbols = []
            for row in rows:
                symbol_data = {
                    'name': row['name'],
                    'symbol_type': row['symbol_type'],
                    'code': row['code'],
                    'docstring': row['docstring']
                }
                symbols.append((row['embedding_id'], symbol_data))

            self.text_search.add_documents_batch(symbols)
            logger.info(f"Built text index with {len(symbols)} symbols")

        except Exception as e:
            logger.warning(f"Failed to build text index: {e}")

    def rebuild_text_index(self):
        """Rebuild text search index"""
        self.text_search.clear()
        self._build_text_index()

    def search(
        self,
        query: str,
        limit: int = 20,
        min_similarity: float = 0.0,
        symbol_type: Optional[str] = None,
        file_path_filter: Optional[str] = None
    ) -> List[CodeSearchResult]:
        """
        Search for code using natural language query

        Args:
            query: Natural language search query
            limit: Maximum number of results to return
            min_similarity: Minimum similarity score (0-1)
            symbol_type: Optional filter by type ('function', 'class', 'method')
            file_path_filter: Optional filter by file path substring

        Returns:
            List of CodeSearchResult objects
        """
        start_time = time.time()
        logger.debug(f"Searching for: '{query}'")

        # Get text search results (BM25)
        text_results = self.text_search.search(query, limit=100)

        # Get semantic search results
        query_embedding = self.embedder.embed_query(query)
        vector_results = self.vector_store.search(
            query_embedding,
            k=min(100, self.vector_store.vector_count)
        )

        # Build result maps
        text_scores: Dict[int, float] = {}
        text_matches: Dict[int, List[str]] = {}
        max_text_score = 1.0

        for result in text_results:
            text_scores[result.symbol_id] = result.score
            text_matches[result.symbol_id] = result.matched_terms
            if result.score > max_text_score:
                max_text_score = result.score

        # Normalize text scores to 0-1 range
        if max_text_score > 0:
            for k in text_scores:
                text_scores[k] = text_scores[k] / max_text_score

        semantic_scores: Dict[int, float] = {}
        for result in vector_results:
            semantic_scores[result.vector_id] = result.similarity_score

        # Combine candidates from both searches
        all_candidates = set(text_scores.keys()) | set(semantic_scores.keys())

        # Get symbols for all candidates
        embedding_ids = list(all_candidates)
        symbols = self.metadata_store.get_symbols_by_embedding_ids(embedding_ids)
        symbol_map = {eid: sym for eid, sym in zip(embedding_ids, symbols) if sym}

        # Score and rank results using hybrid fusion
        search_results = []

        for embedding_id in all_candidates:
            symbol = symbol_map.get(embedding_id)
            if symbol is None:
                continue

            # Filter by symbol type if specified
            if symbol_type and symbol.symbol_type != symbol_type:
                continue

            # Get scores
            text_score = text_scores.get(embedding_id, 0.0)
            semantic_score = semantic_scores.get(embedding_id, 0.0)

            # Hybrid scoring strategy:
            # - If text matches exist, heavily weight text (keywords matter most)
            # - If no text matches, use semantic but penalize
            if text_score > 0:
                # Text match found - text is primary, semantic is bonus
                final_score = (text_score * 0.8) + (semantic_score * 0.2)
                match_info = f"Keywords: {', '.join(text_matches.get(embedding_id, []))}"
            else:
                # No text match - semantic only, but penalized
                final_score = semantic_score * 0.4
                match_info = "Semantic similarity only"

            # Filter by minimum similarity
            if final_score < min_similarity:
                continue

            # Get file path
            file_record = self.metadata_store.get_file(symbol.file_id)
            file_path = file_record.path if file_record else "unknown"

            # Filter by file path if specified
            if file_path_filter and file_path_filter.lower() not in file_path.lower():
                continue

            # Get matched terms for highlighting
            matched_terms = text_matches.get(embedding_id, [])

            # Apply highlighting to name and docstring
            highlighted_name = self._highlight_terms(symbol.name, matched_terms)
            highlighted_docstring = self._highlight_terms(symbol.docstring or "", matched_terms) if symbol.docstring else None

            result = CodeSearchResult(
                symbol_name=symbol.name,
                symbol_type=symbol.symbol_type,
                file_path=file_path,
                code_snippet=symbol.code,
                start_line=symbol.start_line,
                end_line=symbol.end_line,
                similarity_score=final_score,
                docstring=symbol.docstring,
                match_info=match_info,
                highlighted_name=highlighted_name,
                highlighted_docstring=highlighted_docstring
            )

            search_results.append(result)

        # Sort by score and limit results
        search_results.sort(key=lambda r: r.similarity_score, reverse=True)
        search_results = search_results[:limit]

        elapsed = time.time() - start_time
        logger.info(f"Search completed in {elapsed*1000:.2f}ms: {len(search_results)} results for '{query}'")

        return search_results

    def search_by_name(self, name: str, limit: int = 100) -> List[CodeSearchResult]:
        """
        Search for code symbols by name (text search, not semantic)

        Args:
            name: Symbol name to search for
            limit: Maximum number of results

        Returns:
            List of CodeSearchResult objects
        """
        symbols = self.metadata_store.search_symbols(name, limit=limit)

        results = []
        for symbol in symbols:
            # Get file path
            file_record = self.metadata_store.get_file(symbol.file_id)
            file_path = file_record.path if file_record else "unknown"

            result = CodeSearchResult(
                symbol_name=symbol.name,
                symbol_type=symbol.symbol_type,
                file_path=file_path,
                code_snippet=symbol.code,
                start_line=symbol.start_line,
                end_line=symbol.end_line,
                similarity_score=1.0,  # Exact name match
                docstring=symbol.docstring
            )

            results.append(result)

        return results

    def find_similar_code(
        self,
        code_snippet: str,
        limit: int = 10,
        min_similarity: float = 0.5
    ) -> List[CodeSearchResult]:
        """
        Find code similar to a given snippet

        Args:
            code_snippet: Code to find similar matches for
            limit: Maximum number of results
            min_similarity: Minimum similarity score

        Returns:
            List of CodeSearchResult objects
        """
        # Generate embedding for the code snippet
        code_embedding = self.embedder.generate_embedding(code_snippet)

        # Search
        vector_results = self.vector_store.search(code_embedding, k=limit)

        # Get metadata
        embedding_ids = [r.vector_id for r in vector_results]
        symbols = self.metadata_store.get_symbols_by_embedding_ids(embedding_ids)

        # Build results
        results = []
        for vector_result, symbol in zip(vector_results, symbols):
            if symbol is None:
                continue

            if vector_result.similarity_score < min_similarity:
                continue

            file_record = self.metadata_store.get_file(symbol.file_id)
            file_path = file_record.path if file_record else "unknown"

            result = CodeSearchResult(
                symbol_name=symbol.name,
                symbol_type=symbol.symbol_type,
                file_path=file_path,
                code_snippet=symbol.code,
                start_line=symbol.start_line,
                end_line=symbol.end_line,
                similarity_score=vector_result.similarity_score,
                docstring=symbol.docstring
            )

            results.append(result)

        return results

    def get_symbol_by_name(self, name: str, file_path: Optional[str] = None) -> Optional[CodeSearchResult]:
        """
        Get a specific symbol by exact name

        Args:
            name: Exact symbol name
            file_path: Optional file path to narrow search

        Returns:
            CodeSearchResult or None
        """
        symbols = self.metadata_store.search_symbols(name, limit=100)

        for symbol in symbols:
            if symbol.name != name:
                continue

            file_record = self.metadata_store.get_file(symbol.file_id)
            if file_record is None:
                continue

            # Filter by file path if specified
            if file_path and file_record.path != file_path:
                continue

            return CodeSearchResult(
                symbol_name=symbol.name,
                symbol_type=symbol.symbol_type,
                file_path=file_record.path,
                code_snippet=symbol.code,
                start_line=symbol.start_line,
                end_line=symbol.end_line,
                similarity_score=1.0,
                docstring=symbol.docstring
            )

        return None

    def get_stats(self) -> Dict[str, Any]:
        """
        Get search engine statistics

        Returns:
            Dictionary with stats
        """
        db_stats = self.metadata_store.get_stats()
        vector_stats = self.vector_store.get_stats()
        text_stats = self.text_search.get_stats()
        by_type = db_stats.get('by_type', {})

        return {
            'total_symbols': db_stats.get('total_symbols', 0),
            'total_files': db_stats.get('total_files', 0),
            'functions': by_type.get('function', 0),
            'classes': by_type.get('class', 0),
            'methods': by_type.get('method', 0),
            'vector_count': vector_stats.get('total_vectors', 0),
            'text_index_size': text_stats.get('total_documents', 0),
            'ready': vector_stats.get('total_vectors', 0) > 0
        }


def main():
    """Test the search engine"""
    from .indexer import Indexer
    import tempfile
    import os

    # Create test Python files
    test_dir = tempfile.mkdtemp()

    test_file = os.path.join(test_dir, 'test.py')
    with open(test_file, 'w') as f:
        f.write('''
def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user with credentials"""
    return check_credentials(username, password)

def connect_to_database(host: str, port: int):
    """Establish connection to database server"""
    return create_connection(host, port)

def calculate_total(items: list) -> float:
    """Calculate the total sum of items"""
    return sum(items)

class UserManager:
    """Manages user accounts and permissions"""

    def create_user(self, username: str):
        """Create a new user account"""
        pass

    def delete_user(self, user_id: int):
        """Delete a user account"""
        pass

def handle_error(error: Exception):
    """Handle and log errors"""
    logger.error(str(error))
''')

    try:
        # Index the files
        print("Indexing test file...")
        indexer = Indexer()
        stats = indexer.index_directory(test_dir, show_progress=False)
        print(f"Indexed {stats.total_symbols} symbols")

        # Create search engine
        search = SearchEngine(
            embedder=indexer.embedder,
            vector_store=indexer.vector_store,
            metadata_store=indexer.metadata_store
        )

        # Test searches
        queries = [
            "authentication functions",
            "database connection",
            "error handling",
            "user management class"
        ]

        for query in queries:
            print(f"\n=== Search: '{query}' ===")
            results = search.search(query, limit=3)

            for i, result in enumerate(results, 1):
                print(f"{i}. {result.symbol_name} ({result.symbol_type}) - {result.similarity_score:.3f}")
                print(f"   File: {result.file_path}:{result.start_line}")
                if result.match_info:
                    print(f"   Match: {result.match_info}")
                if result.docstring:
                    print(f"   Doc: {result.docstring}")

        # Test find similar
        print("\n=== Find similar code ===")
        similar_code = "def auth(user, pwd): return verify(user, pwd)"
        results = search.find_similar_code(similar_code, limit=3)
        for i, result in enumerate(results, 1):
            print(f"{i}. {result.symbol_name} - {result.similarity_score:.3f}")

    finally:
        # Cleanup
        import shutil
        shutil.rmtree(test_dir)


if __name__ == "__main__":
    main()
