"""Test search functionality against the actual CodeScope codebase"""

import os
from pathlib import Path

# Add parent to path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.indexer import Indexer
from app.core.search import SearchEngine


def test_codescope_codebase():
    """Test search against the CodeScope project itself"""

    # Get the project root
    backend_dir = Path(__file__).parent.parent
    project_root = backend_dir.parent  # codescope directory

    print(f"Indexing CodeScope project at: {project_root}")

    # Create indexer
    indexer = Indexer()

    # Index the codescope project
    stats = indexer.index_directory(str(project_root), show_progress=True)

    print(f"\nIndexing Stats:")
    print(f"  Files processed: {stats.files_processed}")
    print(f"  Total symbols: {stats.total_symbols}")
    print(f"  Functions: {stats.functions_indexed}")
    print(f"  Classes: {stats.classes_indexed}")
    print(f"  Methods: {stats.methods_indexed}")
    print(f"  Time taken: {stats.time_taken:.2f}s")

    # Create search engine
    search = SearchEngine(
        embedder=indexer.embedder,
        vector_store=indexer.vector_store,
        metadata_store=indexer.metadata_store,
        text_search=indexer.text_search
    )

    # Test various searches
    test_queries = [
        "search engine",
        "text search BM25",
        "embedding",
        "parse python",
        "vector store FAISS",
        "API routes",
        "metadata database",
        "authentication",
        "index directory",
    ]

    print("\n" + "=" * 70)
    print("SEARCH RESULTS FOR CODESCOPE CODEBASE")
    print("=" * 70)

    for query in test_queries:
        print(f"\nQuery: '{query}'")
        print("-" * 70)

        results = search.search(query, limit=5)

        if not results:
            print("  No results found")
            continue

        for i, result in enumerate(results, 1):
            score_type = "text" if "Keywords" in (result.match_info or "") else "semantic"
            # Shorten file path for display
            short_path = result.file_path.replace(str(project_root), "").lstrip("/\\")
            print(f"  {i}. {result.symbol_name} ({result.symbol_type})")
            print(f"     Score: {result.similarity_score:.2f} [{score_type}]")
            print(f"     File: {short_path}:{result.start_line}")
            if result.match_info:
                # Truncate match info if too long
                match_info = result.match_info
                if len(match_info) > 60:
                    match_info = match_info[:57] + "..."
                print(f"     Match: {match_info}")
            if result.docstring:
                # Truncate docstring if too long
                docstring = result.docstring[:80] + "..." if len(result.docstring) > 80 else result.docstring
                print(f"     Doc: {docstring}")

    # Get stats
    stats_info = search.get_stats()
    print("\n" + "=" * 70)
    print("INDEX STATISTICS")
    print("=" * 70)
    print(f"  Total symbols: {stats_info.get('total_symbols', 0)}")
    print(f"  Total files: {stats_info.get('total_files', 0)}")
    print(f"  Functions: {stats_info.get('functions', 0)}")
    print(f"  Classes: {stats_info.get('classes', 0)}")
    print(f"  Methods: {stats_info.get('methods', 0)}")
    print(f"  Vector count: {stats_info.get('vector_count', 0)}")
    print(f"  Text index size: {stats_info.get('text_index_size', 0)}")
    print(f"  Ready: {stats_info.get('ready', False)}")

    return True


if __name__ == "__main__":
    print("Testing CodeScope search against its own codebase...\n")
    test_codescope_codebase()
    print("\nTest complete!")
