"""Bash/Shell script parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_bash as tsbash
from tree_sitter import Parser, Node, Language
from loguru import logger


@dataclass
class ParsedBashFunction:
    """Represents a parsed Bash function"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedBashFile:
    """Represents a fully parsed Bash file"""
    file_path: str
    functions: List[ParsedBashFunction]
    total_lines: int
    shebang: Optional[str] = None
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class BashParser:
    """Parser for Bash/Shell scripts using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with Bash grammar"""
        self.language = Language(tsbash.language(), "bash")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("BashParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedBashFile]:
        """Parse a Bash file and extract functions"""
        try:
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Handle BOM
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode('utf-8')
            tree = self.parser.parse(source_bytes)

            functions = []
            shebang = None

            # Extract shebang if present
            lines = source_code.split('\n')
            if lines and lines[0].startswith('#!'):
                shebang = lines[0]

            # Extract function definitions
            self._extract_functions(tree.root_node, source_code, functions)

            return ParsedBashFile(
                file_path=file_path,
                functions=functions,
                total_lines=source_code.count('\n') + 1,
                shebang=shebang
            )

        except Exception as e:
            logger.error(f"Failed to parse Bash file {file_path}: {e}")
            return None

    def _extract_functions(self, node: Node, source_code: str,
                           functions: List[ParsedBashFunction]):
        """Recursively extract function definitions"""
        for child in node.children:
            if child.type == 'function_definition':
                func = self._parse_function(child, source_code)
                if func:
                    functions.append(func)
            else:
                # Recurse into child nodes
                self._extract_functions(child, source_code, functions)

    def _parse_function(self, node: Node, source_code: str) -> Optional[ParsedBashFunction]:
        """Parse a function definition"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            # Try to find function name in children
            for child in node.children:
                if child.type == 'word':
                    name_node = child
                    break

        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        return ParsedBashFunction(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring
        )

    def _get_node_text(self, node: Node, source_code: str) -> str:
        """Extract text content of a node"""
        return source_code[node.start_byte:node.end_byte]

    def _get_preceding_comment(self, node: Node, source_code: str) -> Optional[str]:
        """Get comment immediately before a node"""
        comments = []
        sibling = node.prev_sibling

        while sibling and sibling.type == 'comment':
            text = self._get_node_text(sibling, source_code)
            comments.insert(0, text.lstrip('# ').strip())
            sibling = sibling.prev_sibling

        return '\n'.join(comments) if comments else None


if __name__ == "__main__":
    import tempfile
    import os

    test_code = '''#!/bin/bash

# Configuration
CONFIG_FILE="/etc/myapp/config"

# Initialize the application
# Sets up required directories and configs
function init_app() {
    mkdir -p /var/log/myapp
    touch "$CONFIG_FILE"
    echo "Initialized"
}

# Start the main service
start_service() {
    echo "Starting service..."
    ./bin/server &
}

# Cleanup on exit
cleanup() {
    echo "Cleaning up..."
    rm -rf /tmp/myapp_*
}

# Main execution
main() {
    init_app
    start_service
    trap cleanup EXIT
}

main "$@"
'''

    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "script.sh")
        with open(test_file, 'w') as f:
            f.write(test_code)

        parser = BashParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Shebang: {result.shebang}")
            print(f"Functions: {len(result.functions)}")

            for func in result.functions:
                print(f"\nFunction: {func.name}()")
                if func.docstring:
                    print(f"  Doc: {func.docstring}")
