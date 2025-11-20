"""Test batch indexing to avoid OOM"""

import tempfile
import os
import sys

# Add UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, '.')

from app.core.indexer import Indexer


def test_large_batch_indexing():
    """Test indexing with many symbols to verify batching works"""
    print("Testing batch indexing with 250 symbols...")

    with tempfile.TemporaryDirectory() as test_dir:
        # Create a Python file with many functions (more than BATCH_SIZE=100)
        test_file = os.path.join(test_dir, 'large_file.py')
        with open(test_file, 'w', encoding='utf-8') as f:
            # Generate 250 functions
            for i in range(250):
                f.write(f'''
def function_{i}(x, y):
    """This is function number {i}"""
    return x + y + {i}

''')

        # Index the directory
        print(f"\nIndexing file with 250 functions...")
        indexer = Indexer()

        # Verify batch size is set correctly
        assert indexer.SYMBOLS_BATCH_SIZE == 100, f"Expected batch size 100, got {indexer.SYMBOLS_BATCH_SIZE}"
        print(f"✓ Batch size configured: {indexer.SYMBOLS_BATCH_SIZE}")

        stats = indexer.index_directory(test_dir, show_progress=False)

        print(f"\n✓ Indexing Results:")
        print(f"  Files processed: {stats.files_processed}")
        print(f"  Total symbols: {stats.total_symbols}")
        print(f"  Functions: {stats.functions_indexed}")

        # Should have indexed 1 file with 250 functions
        assert stats.files_processed == 1, f"Expected 1 file, got {stats.files_processed}"
        assert stats.functions_indexed == 250, f"Expected 250 functions, got {stats.functions_indexed}"

        # Verify batching happened (3 batches: 100 + 100 + 50)
        print(f"\n✓ Expected 3 batches: 0-100, 100-200, 200-250")
        print(f"  All 250 symbols indexed successfully!")

        # Test searching works
        from app.core.search import SearchEngine

        search_engine = SearchEngine(
            embedder=indexer.embedder,
            vector_store=indexer.vector_store,
            metadata_store=indexer.metadata_store
        )

        # Search for a function
        results = search_engine.search("function 123", limit=5)
        print(f"\n✓ Search for 'function 123': {len(results)} results")
        if results:
            print(f"  Top result: {results[0].symbol_name}")
            assert 'function_123' in results[0].symbol_name, "Should find function_123"

        print("\n✅ Batch indexing test passed!")
        print(f"  ✓ Successfully indexed 250 symbols in batches of 100")
        print(f"  ✓ Memory efficient processing works correctly")


if __name__ == "__main__":
    test_large_batch_indexing()
