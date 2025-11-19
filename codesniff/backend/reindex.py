"""Script to clear and re-index the codebase with the new search engine"""

import requests
import sys

API_URL = "http://localhost:8000"


def main():
    # Path to index - change this to your codebase path
    if len(sys.argv) > 1:
        directory_path = sys.argv[1]
    else:
        # Default to the codescope project itself
        directory_path = r"Z:\328\CMPUT328-A2\codexworks\301\KIFE\codescope"

    print(f"Clearing old index...")
    try:
        response = requests.post(f"{API_URL}/api/index/clear")
        response.raise_for_status()
        print(f"  Result: {response.json()}")
    except Exception as e:
        print(f"  Failed to clear: {e}")
        return

    print(f"\nRe-indexing directory: {directory_path}")
    print("This may take a minute...")
    try:
        response = requests.post(
            f"{API_URL}/api/index",
            json={
                "directory_path": directory_path,
                "show_progress": True
            },
            timeout=300  # 5 minutes timeout
        )
        response.raise_for_status()
        result = response.json()

        print(f"\nIndexing complete!")
        print(f"  Files processed: {result['stats']['files_processed']}")
        print(f"  Total symbols: {result['stats']['total_symbols']}")
        print(f"  Functions: {result['stats']['functions_indexed']}")
        print(f"  Classes: {result['stats']['classes_indexed']}")
        print(f"  Methods: {result['stats']['methods_indexed']}")
        print(f"  Time taken: {result['stats']['time_taken']:.2f}s")

    except Exception as e:
        print(f"  Failed to index: {e}")
        return

    print("\nTesting search for 'animation'...")
    try:
        response = requests.post(
            f"{API_URL}/api/search",
            json={
                "query": "animation",
                "limit": 5
            }
        )
        response.raise_for_status()
        result = response.json()

        print(f"\nSearch results:")
        for i, r in enumerate(result['results'], 1):
            score_type = "text" if r.get('match_info') and "Keywords" in r['match_info'] else "semantic"
            print(f"  {i}. {r['symbol_name']} ({r['symbol_type']}) - {r['similarity_score']:.0%} [{score_type}]")
            if r.get('match_info'):
                print(f"     {r['match_info']}")

    except Exception as e:
        print(f"  Search failed: {e}")


if __name__ == "__main__":
    main()
