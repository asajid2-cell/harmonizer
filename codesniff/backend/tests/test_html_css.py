"""Test HTML/CSS parsing and indexing"""

import tempfile
import os
import sys

# Add UTF-8 encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

from app.core.html_css_parser import HTMLCSSParser
from app.core.indexer import Indexer


def test_html_parser():
    """Test HTML parsing"""
    print("Testing HTML parser...")

    # Create test HTML file
    test_html = """
<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
    <style>
        .header {
            background-color: blue;
            padding: 20px;
        }

        #main-content {
            margin: 0 auto;
            max-width: 1200px;
        }
    </style>
</head>
<body>
    <header id="site-header" class="header">
        <h1>My Website</h1>
    </header>

    <main id="main-content">
        <section class="hero">
            <h2>Welcome</h2>
        </section>
    </main>

    <template id="user-card">
        <div class="card">
            <h3 class="name"></h3>
            <p class="bio"></p>
        </div>
    </template>
</body>
</html>
"""

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(test_html)
        temp_path = f.name

    try:
        parser = HTMLCSSParser()
        parsed = parser.parse_file(temp_path)

        assert parsed is not None, "Failed to parse HTML file"
        print(f"✓ Parsed HTML file: {len(parsed.elements)} elements, {len(parsed.css_rules)} CSS rules")

        # Check elements
        element_names = [e.name for e in parsed.elements]
        print(f"  Elements: {element_names}")
        assert 'user-card' in element_names, "Template not found"
        assert any('header' in name for name in element_names), "Header section not found"

        # Check CSS rules
        css_selectors = [r.selector for r in parsed.css_rules]
        print(f"  CSS rules: {css_selectors}")
        assert any('.header' in sel for sel in css_selectors), "CSS class rule not found"
        assert any('#main-content' in sel for sel in css_selectors), "CSS id rule not found"

        print("✓ HTML parser test passed!")

    finally:
        os.unlink(temp_path)


def test_css_parser():
    """Test CSS parsing"""
    print("\nTesting CSS parser...")

    test_css = """
/* Main styles */
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

#header {
    background-color: #333;
    color: white;
    padding: 1rem;
}

.button {
    display: inline-block;
    padding: 10px 20px;
    background-color: blue;
    color: white;
    border-radius: 4px;
}

.button:hover {
    background-color: darkblue;
}

@media (max-width: 768px) {
    .container {
        padding: 10px;
    }
}
"""

    # Write to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.css', delete=False, encoding='utf-8') as f:
        f.write(test_css)
        temp_path = f.name

    try:
        parser = HTMLCSSParser()
        parsed = parser.parse_file(temp_path)

        assert parsed is not None, "Failed to parse CSS file"
        print(f"✓ Parsed CSS file: {len(parsed.css_rules)} CSS rules")

        # Check CSS rules
        css_selectors = [r.selector for r in parsed.css_rules]
        print(f"  Selectors: {css_selectors}")
        assert any('body' in sel for sel in css_selectors), "Body selector not found"
        assert any('.container' in sel for sel in css_selectors), "Container class not found"
        assert any('#header' in sel for sel in css_selectors), "Header ID not found"

        print("✓ CSS parser test passed!")

    finally:
        os.unlink(temp_path)


def test_html_css_indexing():
    """Test indexing HTML/CSS files"""
    print("\nTesting HTML/CSS indexing...")

    # Create temp directory with test files
    with tempfile.TemporaryDirectory() as temp_dir:
        # HTML file
        html_file = os.path.join(temp_dir, 'index.html')
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write("""
<html>
<head>
    <style>
        .card { padding: 20px; }
    </style>
</head>
<body>
    <header class="main-header">
        <h1>Test</h1>
    </header>
    <template id="item-template">
        <div class="item"></div>
    </template>
</body>
</html>
""")

        # CSS file
        css_file = os.path.join(temp_dir, 'styles.css')
        with open(css_file, 'w', encoding='utf-8') as f:
            f.write("""
.button {
    background-color: blue;
    padding: 10px;
}

#main {
    max-width: 1200px;
}
""")

        # Index the directory
        indexer = Indexer()
        stats = indexer.index_directory(temp_dir, show_progress=False)

        print(f"✓ Indexed {stats.files_processed} files")
        print(f"  Total symbols: {stats.total_symbols}")
        print(f"  Functions/elements: {stats.functions_indexed}")

        assert stats.files_processed == 2, f"Expected 2 files, got {stats.files_processed}"
        assert stats.total_symbols > 0, "No symbols indexed"

        # Test searching for HTML/CSS
        from app.core.search import SearchEngine

        search_engine = SearchEngine(
            embedder=indexer.embedder,
            vector_store=indexer.vector_store,
            metadata_store=indexer.metadata_store
        )

        # Search for CSS rules
        results = search_engine.search("button styles", limit=5)
        print(f"\n✓ Search for 'button styles': {len(results)} results")
        if results:
            print(f"  Top result: {results[0].symbol_name} ({results[0].file_path})")

        # Search with language filter
        results_html_only = search_engine.search(
            "template",
            limit=5,
            language_filter=['html']
        )
        print(f"✓ Search for 'template' (HTML only): {len(results_html_only)} results")

        results_css_only = search_engine.search(
            "styles",
            limit=5,
            language_filter=['css']
        )
        print(f"✓ Search for 'styles' (CSS only): {len(results_css_only)} results")

        print("\n✓ HTML/CSS indexing and search test passed!")


if __name__ == "__main__":
    test_html_parser()
    test_css_parser()
    test_html_css_indexing()
    print("\n✅ All HTML/CSS tests passed!")
