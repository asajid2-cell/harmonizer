"""
Comprehensive tests for CodeScope search engine
Tests text search, semantic search, hybrid fusion, and all features
"""

import pytest
import tempfile
import shutil
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.parser import CodeParser
from app.core.embedder import CodeEmbedder
from app.core.indexer import Indexer
from app.core.search import SearchEngine
from app.core.text_search import TextSearchEngine
from app.storage.vector_store import VectorStore
from app.storage.metadata_store import MetadataStore


class TestSearchEngine:
    """Test suite for the search engine"""

    @pytest.fixture(scope="class")
    def test_codebase(self):
        """Create a test codebase with known content"""
        test_dir = tempfile.mkdtemp()

        # Create test files with various functions
        auth_file = os.path.join(test_dir, 'auth.py')
        with open(auth_file, 'w') as f:
            f.write('''
def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user with username and password credentials"""
    return verify_credentials(username, password)

def login(email: str, pwd: str) -> dict:
    """Login user and return session token"""
    if authenticate_user(email, pwd):
        return {"token": generate_token()}
    return {"error": "Invalid credentials"}

def logout(session_id: str) -> bool:
    """Logout user and invalidate session"""
    return invalidate_session(session_id)

class AuthenticationManager:
    """Manages user authentication and sessions"""

    def create_session(self, user_id: int) -> str:
        """Create a new user session"""
        return generate_session_id()

    def validate_token(self, token: str) -> bool:
        """Validate a JWT token"""
        return check_token_validity(token)
''')

        db_file = os.path.join(test_dir, 'database.py')
        with open(db_file, 'w') as f:
            f.write('''
def connect_database(host: str, port: int):
    """Connect to the database server"""
    return create_connection(host, port)

def execute_query(sql: str, params: tuple = None):
    """Execute a SQL query and return results"""
    cursor = get_cursor()
    cursor.execute(sql, params)
    return cursor.fetchall()

def disconnect_database(connection):
    """Close database connection"""
    connection.close()

class DatabaseManager:
    """Manages database connections and queries"""

    def __init__(self, db_path: str):
        """Initialize database manager"""
        self.db_path = db_path
        self.connection = None

    def query(self, sql: str):
        """Run a database query"""
        return execute_query(sql)
''')

        audio_file = os.path.join(test_dir, 'audio.py')
        with open(audio_file, 'w') as f:
            f.write('''
def load_audio_file(path: str):
    """Load an audio file from disk"""
    return read_wav(path)

def play_sound(audio_data):
    """Play audio through speakers"""
    output_device.play(audio_data)

def record_audio(duration: int):
    """Record audio from microphone"""
    return capture_from_mic(duration)

class AudioProcessor:
    """Process and manipulate audio data"""

    def normalize_volume(self, audio):
        """Normalize audio volume levels"""
        return apply_normalization(audio)

    def apply_filter(self, audio, filter_type: str):
        """Apply audio filter effect"""
        return process_filter(audio, filter_type)
''')

        animation_file = os.path.join(test_dir, 'animation.py')
        with open(animation_file, 'w') as f:
            f.write('''
def animate_element(element, duration: float):
    """Animate an element with transition"""
    return apply_animation(element, duration)

def create_motion_path(points: list):
    """Create a motion path for animations"""
    return interpolate_path(points)

def transition_opacity(element, from_val: float, to_val: float):
    """Transition element opacity smoothly"""
    return fade_transition(element, from_val, to_val)

class AnimationController:
    """Control animations and transitions"""

    def start_animation(self, name: str):
        """Start a named animation"""
        self.active_animations.append(name)

    def stop_all(self):
        """Stop all running animations"""
        self.active_animations.clear()
''')

        error_file = os.path.join(test_dir, 'errors.py')
        with open(error_file, 'w') as f:
            f.write('''
def handle_error(error: Exception):
    """Handle and log an exception"""
    logger.error(str(error))
    return format_error_response(error)

def raise_validation_error(message: str):
    """Raise a validation error"""
    raise ValidationError(message)

class ErrorHandler:
    """Central error handling"""

    def catch_exception(self, exc: Exception):
        """Catch and process exception"""
        return self.format_error(exc)
''')

        index_file = os.path.join(test_dir, 'indexer.py')
        with open(index_file, 'w') as f:
            f.write('''
def index_document(doc: dict):
    """Index a document for search"""
    return add_to_index(doc)

def search_index(query: str):
    """Search the document index"""
    return find_matches(query)

class SearchIndexer:
    """Index and search documents"""

    def build_index(self, documents: list):
        """Build search index from documents"""
        for doc in documents:
            self.add_document(doc)
''')

        yield test_dir

        # Cleanup
        shutil.rmtree(test_dir)

    @pytest.fixture(scope="class")
    def search_engine(self, test_codebase):
        """Create and initialize search engine with test data"""
        # Create components
        parser = CodeParser()
        embedder = CodeEmbedder()
        vector_store = VectorStore(dimension=768)
        metadata_store = MetadataStore(db_path=":memory:")
        text_search = TextSearchEngine()

        # Create indexer
        indexer = Indexer(
            parser=parser,
            embedder=embedder,
            vector_store=vector_store,
            metadata_store=metadata_store,
            text_search=text_search
        )

        # Index test codebase
        stats = indexer.index_directory(test_codebase, show_progress=False)
        print(f"\nIndexed {stats.total_symbols} symbols from {stats.files_processed} files")

        # Create search engine
        engine = SearchEngine(
            embedder=embedder,
            vector_store=vector_store,
            metadata_store=metadata_store,
            text_search=text_search
        )

        return engine

    def test_basic_keyword_search(self, search_engine):
        """Test basic keyword matching"""
        results = search_engine.search("authenticate", limit=5)

        assert len(results) > 0, "Should find results for 'authenticate'"

        # First result should be authentication-related
        top_result = results[0]
        assert "auth" in top_result.symbol_name.lower() or "auth" in (top_result.docstring or "").lower(), \
            f"Top result should be auth-related, got: {top_result.symbol_name}"

        # Should have keyword match info
        assert top_result.match_info and "Keywords" in top_result.match_info, \
            "Should have keyword match info"

    def test_synonym_expansion(self, search_engine):
        """Test that synonyms are expanded"""
        # Search for 'audio' should find 'sound' related functions
        results = search_engine.search("audio", limit=10)

        assert len(results) > 0, "Should find results for 'audio'"

        # Should find audio-related functions
        symbol_names = [r.symbol_name.lower() for r in results]
        found_audio = any("audio" in name or "sound" in name for name in symbol_names)
        assert found_audio, f"Should find audio/sound functions, got: {symbol_names}"

    def test_stemming(self, search_engine):
        """Test that stemming works"""
        # 'animating' should match 'animation', 'animate'
        results = search_engine.search("animating", limit=10)

        assert len(results) > 0, "Should find results for 'animating'"

        # Should find animation-related functions
        symbol_names = [r.symbol_name.lower() for r in results]
        found_animation = any("animat" in name or "motion" in name or "transition" in name
                              for name in symbol_names)
        assert found_animation, f"Should find animation functions, got: {symbol_names}"

    def test_database_search(self, search_engine):
        """Test database-related search"""
        results = search_engine.search("database connection", limit=5)

        assert len(results) > 0, "Should find results for 'database connection'"

        # First result should be database-related
        top_result = results[0]
        assert "database" in top_result.symbol_name.lower() or \
               "connect" in top_result.symbol_name.lower() or \
               "db" in top_result.symbol_name.lower(), \
            f"Top result should be db-related, got: {top_result.symbol_name}"

    def test_error_handling_search(self, search_engine):
        """Test error handling search"""
        results = search_engine.search("error handling", limit=5)

        assert len(results) > 0, "Should find results for 'error handling'"

        # Should find error-related functions
        symbol_names = [r.symbol_name.lower() for r in results]
        found_error = any("error" in name or "exception" in name or "handle" in name
                         for name in symbol_names)
        assert found_error, f"Should find error functions, got: {symbol_names}"

    def test_class_search(self, search_engine):
        """Test searching for classes"""
        results = search_engine.search("manager class", limit=10)

        assert len(results) > 0, "Should find results for 'manager class'"

        # Should find manager classes
        found_manager = any("manager" in r.symbol_name.lower() for r in results)
        assert found_manager, f"Should find manager classes"

    def test_symbol_type_filter(self, search_engine):
        """Test filtering by symbol type"""
        # Search for functions only
        results = search_engine.search("authenticate", limit=10, symbol_type="function")

        for result in results:
            assert result.symbol_type == "function", \
                f"All results should be functions, got: {result.symbol_type}"

        # Search for classes only
        results = search_engine.search("manager", limit=10, symbol_type="class")

        for result in results:
            assert result.symbol_type == "class", \
                f"All results should be classes, got: {result.symbol_type}"

    def test_file_path_filter(self, search_engine):
        """Test filtering by file path"""
        results = search_engine.search("connect", limit=10, file_path_filter="database")

        for result in results:
            assert "database" in result.file_path.lower(), \
                f"All results should be from database files, got: {result.file_path}"

    def test_minimum_similarity(self, search_engine):
        """Test minimum similarity threshold"""
        # Get all results
        all_results = search_engine.search("authenticate", limit=20)

        # Filter with high threshold
        filtered_results = search_engine.search("authenticate", limit=20, min_similarity=0.5)

        # Filtered should have fewer results
        assert len(filtered_results) <= len(all_results), \
            "Filtered results should not exceed all results"

        # All filtered results should meet threshold
        for result in filtered_results:
            assert result.similarity_score >= 0.5, \
                f"Score {result.similarity_score} below threshold"

    def test_search_by_name(self, search_engine):
        """Test direct name search"""
        results = search_engine.search_by_name("authenticate_user", limit=5)

        assert len(results) > 0, "Should find authenticate_user"
        assert results[0].symbol_name == "authenticate_user", \
            f"Should find exact match, got: {results[0].symbol_name}"

    def test_find_similar_code(self, search_engine):
        """Test finding similar code"""
        code_snippet = "def auth(user, pwd): return verify(user, pwd)"
        results = search_engine.find_similar_code(code_snippet, limit=5)

        assert len(results) > 0, "Should find similar code"

    def test_autocomplete(self, search_engine):
        """Test autocomplete functionality"""
        suggestions = search_engine.text_search.autocomplete("auth", limit=5)

        assert len(suggestions) > 0, "Should have autocomplete suggestions"

        # All suggestions should start with 'auth'
        for suggestion in suggestions:
            assert suggestion.startswith("auth"), \
                f"Suggestion should start with 'auth', got: {suggestion}"

    def test_popular_terms(self, search_engine):
        """Test popular terms retrieval"""
        terms = search_engine.text_search.get_popular_terms(limit=10)

        assert len(terms) > 0, "Should have popular terms"

    def test_index_search(self, search_engine):
        """Test searching for indexing-related code"""
        results = search_engine.search("indexing", limit=5)

        assert len(results) > 0, "Should find results for 'indexing'"

        # Should find index-related functions
        symbol_names = [r.symbol_name.lower() for r in results]
        found_index = any("index" in name for name in symbol_names)
        assert found_index, f"Should find index functions, got: {symbol_names}"

    def test_empty_query(self, search_engine):
        """Test handling of edge cases"""
        # Very short query
        results = search_engine.search("a", limit=5)
        # Should handle gracefully (may return no results or semantic-only)
        assert isinstance(results, list)

    def test_no_match_query(self, search_engine):
        """Test query with no matches"""
        results = search_engine.search("xyznonexistent123", limit=5)

        # Should return empty or semantic-only results
        assert isinstance(results, list)

    def test_result_ordering(self, search_engine):
        """Test that results are ordered by score"""
        results = search_engine.search("database", limit=10)

        if len(results) > 1:
            scores = [r.similarity_score for r in results]
            assert scores == sorted(scores, reverse=True), \
                "Results should be sorted by descending score"

    def test_docstring_search(self, search_engine):
        """Test searching in docstrings"""
        results = search_engine.search("credentials", limit=5)

        assert len(results) > 0, "Should find results for 'credentials'"

        # Should find functions with 'credentials' in docstring
        found = any("credential" in (r.docstring or "").lower() for r in results)
        assert found, "Should find functions with 'credentials' in docstring"

    def test_multiple_keywords(self, search_engine):
        """Test search with multiple keywords"""
        results = search_engine.search("user authentication login", limit=5)

        assert len(results) > 0, "Should find results for multiple keywords"

        # Top result should match multiple terms
        top_result = results[0]
        assert top_result.similarity_score > 0.3, \
            "Multi-keyword match should have reasonable score"


def run_search_quality_report(search_engine):
    """Generate a search quality report"""
    test_queries = [
        ("authentication", ["authenticate", "login", "auth"]),
        ("database", ["database", "connect", "query", "sql"]),
        ("audio", ["audio", "sound", "wav", "music"]),
        ("animation", ["animate", "animation", "motion", "transition"]),
        ("error", ["error", "exception", "handle"]),
        ("indexing", ["index", "search"]),
    ]

    print("\n" + "="*60)
    print("SEARCH QUALITY REPORT")
    print("="*60)

    total_score = 0
    total_tests = 0

    for query, expected_terms in test_queries:
        results = search_engine.search(query, limit=5)

        print(f"\nQuery: '{query}'")
        print("-" * 40)

        matches = 0
        for i, result in enumerate(results, 1):
            name_lower = result.symbol_name.lower()
            doc_lower = (result.docstring or "").lower()

            is_relevant = any(
                term in name_lower or term in doc_lower
                for term in expected_terms
            )

            status = "✓" if is_relevant else "✗"
            matches += 1 if is_relevant else 0

            print(f"  {i}. {status} {result.symbol_name} ({result.symbol_type}) - {result.similarity_score:.2f}")
            if result.match_info:
                print(f"      {result.match_info}")

        score = matches / len(results) if results else 0
        total_score += score
        total_tests += 1
        print(f"  Relevance: {matches}/{len(results)} ({score*100:.0f}%)")

    overall = total_score / total_tests if total_tests > 0 else 0
    print("\n" + "="*60)
    print(f"OVERALL RELEVANCE: {overall*100:.1f}%")
    print("="*60)

    return overall


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])
