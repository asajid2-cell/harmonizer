"""
Run search quality tests against the actual CodeScope codebase
This script indexes the codebase and tests various search queries
"""

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


def create_search_engine(codebase_path: str):
    """Create and index search engine"""
    print(f"Creating search engine for: {codebase_path}")

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

    # Index codebase
    print(f"Indexing {codebase_path}...")
    stats = indexer.index_directory(codebase_path, show_progress=True)
    print(f"Indexed {stats.total_symbols} symbols from {stats.files_processed} files")
    print(f"  Functions: {stats.functions_indexed}")
    print(f"  Classes: {stats.classes_indexed}")
    print(f"  Methods: {stats.methods_indexed}")

    # Create search engine
    engine = SearchEngine(
        embedder=embedder,
        vector_store=vector_store,
        metadata_store=metadata_store,
        text_search=text_search
    )

    return engine


def test_search(engine, query: str, expected_terms: list = None, limit: int = 5):
    """Run a single search test and evaluate results"""
    print(f"\n{'='*60}")
    print(f"Query: '{query}'")
    print(f"{'='*60}")

    results = engine.search(query, limit=limit)

    if not results:
        print("  No results found!")
        return 0

    matches = 0
    for i, result in enumerate(results, 1):
        name_lower = result.symbol_name.lower()
        doc_lower = (result.docstring or "").lower()
        code_lower = result.code_snippet.lower()

        # Check if relevant
        is_relevant = True
        if expected_terms:
            is_relevant = any(
                term in name_lower or term in doc_lower or term in code_lower
                for term in expected_terms
            )

        status = "✓" if is_relevant else "✗"
        matches += 1 if is_relevant else 0

        print(f"\n  {i}. {status} {result.symbol_name}")
        print(f"     Type: {result.symbol_type}")
        print(f"     File: {result.file_path}:{result.start_line}")
        print(f"     Score: {result.similarity_score:.3f}")
        if result.match_info:
            print(f"     Match: {result.match_info}")
        if result.docstring:
            doc_preview = result.docstring[:80] + "..." if len(result.docstring) > 80 else result.docstring
            print(f"     Doc: {doc_preview}")

    relevance = matches / len(results) if results else 0
    print(f"\n  Relevance: {matches}/{len(results)} ({relevance*100:.0f}%)")

    return relevance


def run_quality_tests(engine):
    """Run comprehensive quality tests"""
    test_cases = [
        # (query, expected_terms)
        ("authentication", ["auth", "login", "credential", "password", "token"]),
        ("database connection", ["database", "connect", "db", "sql", "query"]),
        ("error handling", ["error", "exception", "handle", "catch", "raise"]),
        ("parse code", ["parse", "parser", "token", "ast", "syntax"]),
        ("search engine", ["search", "query", "find", "index", "match"]),
        ("embedding", ["embed", "vector", "codebert", "model"]),
        ("file operations", ["file", "path", "read", "write", "load", "save"]),
        ("validation", ["valid", "check", "verify", "validate"]),
        ("configuration", ["config", "settings", "options"]),
        ("indexer", ["index", "indexer", "indexing"]),
    ]

    print("\n" + "#"*60)
    print("# SEARCH QUALITY TEST SUITE")
    print("#"*60)

    total_relevance = 0
    for query, expected in test_cases:
        relevance = test_search(engine, query, expected, limit=5)
        total_relevance += relevance

    overall = total_relevance / len(test_cases)

    print("\n" + "#"*60)
    print(f"# OVERALL SEARCH QUALITY: {overall*100:.1f}%")
    print("#"*60)

    # Quality rating
    if overall >= 0.8:
        rating = "EXCELLENT"
    elif overall >= 0.6:
        rating = "GOOD"
    elif overall >= 0.4:
        rating = "FAIR"
    else:
        rating = "NEEDS IMPROVEMENT"

    print(f"# Rating: {rating}")
    print("#"*60)

    return overall


def test_autocomplete(engine):
    """Test autocomplete functionality"""
    print("\n" + "="*60)
    print("AUTOCOMPLETE TESTS")
    print("="*60)

    prefixes = ["auth", "data", "err", "pars", "search", "ind"]

    for prefix in prefixes:
        suggestions = engine.text_search.autocomplete(prefix, limit=5)
        print(f"\n  '{prefix}' -> {suggestions}")


def test_filters(engine):
    """Test filtering functionality"""
    print("\n" + "="*60)
    print("FILTER TESTS")
    print("="*60)

    # Test symbol type filter
    print("\n  Functions containing 'search':")
    results = engine.search("search", limit=3, symbol_type="function")
    for r in results:
        print(f"    - {r.symbol_name} ({r.symbol_type})")

    print("\n  Classes containing 'manager':")
    results = engine.search("manager", limit=3, symbol_type="class")
    for r in results:
        print(f"    - {r.symbol_name} ({r.symbol_type})")

    # Test file path filter
    print("\n  'search' in storage files:")
    results = engine.search("search", limit=3, file_path_filter="storage")
    for r in results:
        print(f"    - {r.symbol_name} in {r.file_path}")


def main():
    """Main test runner"""
    # Determine codebase path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.dirname(script_dir)

    # You can also test with sample_code
    sample_code_dir = os.path.join(os.path.dirname(backend_dir), "sample_code")

    # Use backend app for testing
    codebase_path = os.path.join(backend_dir, "app")

    if not os.path.exists(codebase_path):
        print(f"Codebase not found: {codebase_path}")
        return

    # Create search engine
    engine = create_search_engine(codebase_path)

    # Run tests
    overall_quality = run_quality_tests(engine)

    # Test autocomplete
    test_autocomplete(engine)

    # Test filters
    test_filters(engine)

    # Get stats
    stats = engine.get_stats()
    print("\n" + "="*60)
    print("INDEX STATISTICS")
    print("="*60)
    print(f"  Total symbols: {stats['total_symbols']}")
    print(f"  Total files: {stats['total_files']}")
    print(f"  Functions: {stats['functions']}")
    print(f"  Classes: {stats['classes']}")
    print(f"  Methods: {stats['methods']}")
    print(f"  Text index size: {stats['text_index_size']}")

    return overall_quality


if __name__ == "__main__":
    quality = main()
    print(f"\nFinal quality score: {quality*100:.1f}%")
