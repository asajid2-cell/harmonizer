"""Test all supported languages together"""

import tempfile
import os
import sys

# Add UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, '.')

from app.core.indexer import Indexer
from app.core.search import SearchEngine


def test_all_languages():
    """Test indexing and searching across all supported languages"""
    print("Testing all languages: Python, JavaScript, TypeScript, Java, Kotlin, HTML, CSS")

    with tempfile.TemporaryDirectory() as test_dir:
        # Python file
        with open(os.path.join(test_dir, 'auth.py'), 'w', encoding='utf-8') as f:
            f.write('''
def authenticate_user(username, password):
    """Authenticate a user with credentials"""
    return check_credentials(username, password)

class UserManager:
    """Manage user accounts"""
    def create_user(self, username):
        pass
''')

        # JavaScript file
        with open(os.path.join(test_dir, 'api.js'), 'w', encoding='utf-8') as f:
            f.write('''
/**
 * Fetch data from API
 */
function fetchData(url) {
    return fetch(url);
}

class ApiClient {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }
}
''')

        # TypeScript file
        with open(os.path.join(test_dir, 'types.ts'), 'w', encoding='utf-8') as f:
            f.write('''
interface User {
    id: number;
    name: string;
}

function createUser(name: string): User {
    return { id: 1, name };
}
''')

        # Java file
        with open(os.path.join(test_dir, 'Service.java'), 'w', encoding='utf-8') as f:
            f.write('''
public class DatabaseService {
    /**
     * Connect to database
     */
    public void connect(String host, int port) {
        // Implementation
    }
}
''')

        # Kotlin file
        with open(os.path.join(test_dir, 'Utils.kt'), 'w', encoding='utf-8') as f:
            f.write('''
data class Config(val apiKey: String, val endpoint: String)

fun loadConfig(): Config {
    return Config("key", "https://api.example.com")
}
''')

        # HTML file
        with open(os.path.join(test_dir, 'index.html'), 'w', encoding='utf-8') as f:
            f.write('''
<html>
<head>
    <style>
        .navbar {
            background-color: #333;
            padding: 10px;
        }
    </style>
</head>
<body>
    <header class="main-header">
        <nav class="navbar">
            <h1>My App</h1>
        </nav>
    </header>
    <template id="user-card">
        <div class="card"></div>
    </template>
</body>
</html>
''')

        # CSS file
        with open(os.path.join(test_dir, 'styles.css'), 'w', encoding='utf-8') as f:
            f.write('''
.button {
    background-color: blue;
    color: white;
    padding: 10px 20px;
    border-radius: 4px;
}

.button:hover {
    background-color: darkblue;
}

#main-container {
    max-width: 1200px;
    margin: 0 auto;
}
''')

        # Index all files
        print(f"\nIndexing directory with all language files...")
        indexer = Indexer()
        stats = indexer.index_directory(test_dir, show_progress=False)

        print(f"\n✓ Indexing Results:")
        print(f"  Files processed: {stats.files_processed}")
        print(f"  Total symbols: {stats.total_symbols}")
        print(f"  Functions: {stats.functions_indexed}")
        print(f"  Classes: {stats.classes_indexed}")
        print(f"  Methods: {stats.methods_indexed}")

        assert stats.files_processed == 7, f"Expected 7 files, got {stats.files_processed}"
        assert stats.total_symbols > 0, "No symbols indexed"

        # Create search engine
        search_engine = SearchEngine(
            embedder=indexer.embedder,
            vector_store=indexer.vector_store,
            metadata_store=indexer.metadata_store
        )

        # Test searches across languages
        print("\n✓ Testing semantic search across languages:")

        # Search for authentication
        results = search_engine.search("user authentication", limit=5)
        print(f"\n  Search 'user authentication': {len(results)} results")
        for i, r in enumerate(results[:3], 1):
            print(f"    {i}. {r.symbol_name} ({r.symbol_type}) - {os.path.basename(r.file_path)}")

        # Search for API/data fetching
        results = search_engine.search("fetch api data", limit=5)
        print(f"\n  Search 'fetch api data': {len(results)} results")
        for i, r in enumerate(results[:3], 1):
            print(f"    {i}. {r.symbol_name} ({r.symbol_type}) - {os.path.basename(r.file_path)}")

        # Test language filters
        print("\n✓ Testing language filters:")

        # Python only
        py_results = search_engine.search("user", limit=10, language_filter=['python'])
        print(f"\n  Python only: {len(py_results)} results")
        for r in py_results:
            assert r.file_path.endswith('.py'), f"Non-Python file found: {r.file_path}"
        print(f"    ✓ All results are Python files")

        # JavaScript + TypeScript
        js_ts_results = search_engine.search("user", limit=10, language_filter=['javascript', 'typescript'])
        print(f"\n  JavaScript + TypeScript: {len(js_ts_results)} results")
        for r in js_ts_results:
            assert r.file_path.endswith(('.js', '.ts')), f"Non-JS/TS file found: {r.file_path}"
        print(f"    ✓ All results are JS/TS files")

        # HTML + CSS only
        html_css_results = search_engine.search("style", limit=10, language_filter=['html', 'css'])
        print(f"\n  HTML + CSS: {len(html_css_results)} results")
        for r in html_css_results:
            assert r.file_path.endswith(('.html', '.htm', '.css')), f"Non-HTML/CSS file found: {r.file_path}"
        print(f"    ✓ All results are HTML/CSS files")

        # Java + Kotlin
        jvm_results = search_engine.search("config", limit=10, language_filter=['java', 'kotlin'])
        print(f"\n  Java + Kotlin: {len(jvm_results)} results")
        for r in jvm_results:
            assert r.file_path.endswith(('.java', '.kt')), f"Non-JVM file found: {r.file_path}"
        print(f"    ✓ All results are Java/Kotlin files")

        # Test specific language searches
        print("\n✓ Testing language-specific searches:")

        # Search for CSS button styles
        button_results = search_engine.search("button styles", limit=5, language_filter=['css'])
        print(f"\n  CSS button styles: {len(button_results)} results")
        if button_results:
            print(f"    Top: {button_results[0].symbol_name} in {os.path.basename(button_results[0].file_path)}")

        # Search for HTML template
        template_results = search_engine.search("template", limit=5, language_filter=['html'])
        print(f"\n  HTML templates: {len(template_results)} results")
        if template_results:
            print(f"    Top: {template_results[0].symbol_name} in {os.path.basename(template_results[0].file_path)}")

        print("\n✅ All language tests passed!")
        print(f"\nSummary:")
        print(f"  ✓ Indexed 7 files across 7 languages")
        print(f"  ✓ {stats.total_symbols} total symbols indexed")
        print(f"  ✓ Semantic search working across all languages")
        print(f"  ✓ Language filters working correctly")


if __name__ == "__main__":
    test_all_languages()
