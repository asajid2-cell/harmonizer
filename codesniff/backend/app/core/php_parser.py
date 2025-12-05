"""PHP code parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_php as tsphp
from tree_sitter import Parser, Node, Language
from loguru import logger


@dataclass
class ParsedPHPFunction:
    """Represents a parsed PHP function/method"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    visibility: Optional[str] = None  # public, private, protected


@dataclass
class ParsedPHPClass:
    """Represents a parsed PHP class/interface/trait"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedPHPFunction] = None
    kind: str = "class"  # class, interface, trait

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedPHPFile:
    """Represents a fully parsed PHP file"""
    file_path: str
    functions: List[ParsedPHPFunction]
    classes: List[ParsedPHPClass]
    total_lines: int
    namespace: Optional[str] = None
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class PHPParser:
    """Parser for PHP source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with PHP grammar"""
        # tree-sitter-php uses language_php() instead of language()
        self.language = Language(tsphp.language_php(), "php")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("PHPParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedPHPFile]:
        """Parse a PHP file and extract functions and classes"""
        try:
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Handle BOM
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode('utf-8')
            tree = self.parser.parse(source_bytes)

            functions = []
            classes = []
            namespace = None

            # Extract namespace and declarations
            self._extract_declarations(tree.root_node, source_code, functions, classes)

            # Find namespace
            namespace = self._find_namespace(tree.root_node, source_code)

            return ParsedPHPFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=source_code.count('\n') + 1,
                namespace=namespace
            )

        except Exception as e:
            logger.error(f"Failed to parse PHP file {file_path}: {e}")
            return None

    def _find_namespace(self, node: Node, source_code: str) -> Optional[str]:
        """Find namespace declaration"""
        for child in node.children:
            if child.type == 'namespace_definition':
                name_node = child.child_by_field_name('name')
                if name_node:
                    return self._get_node_text(name_node, source_code)
            elif child.type == 'program':
                result = self._find_namespace(child, source_code)
                if result:
                    return result
        return None

    def _extract_declarations(self, node: Node, source_code: str,
                              functions: List[ParsedPHPFunction],
                              classes: List[ParsedPHPClass]):
        """Recursively extract functions and classes"""
        for child in node.children:
            if child.type == 'function_definition':
                func = self._parse_function(child, source_code)
                if func:
                    functions.append(func)

            elif child.type == 'class_declaration':
                cls = self._parse_class(child, source_code, "class")
                if cls:
                    classes.append(cls)

            elif child.type == 'interface_declaration':
                cls = self._parse_class(child, source_code, "interface")
                if cls:
                    classes.append(cls)

            elif child.type == 'trait_declaration':
                cls = self._parse_class(child, source_code, "trait")
                if cls:
                    classes.append(cls)

            elif child.type in ('program', 'namespace_definition'):
                # Recurse into program or namespace body
                body = child.child_by_field_name('body') or child
                self._extract_declarations(body, source_code, functions, classes)

    def _parse_function(self, node: Node, source_code: str) -> Optional[ParsedPHPFunction]:
        """Parse a function definition"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_doc_comment(node, source_code)

        return ParsedPHPFunction(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring
        )

    def _parse_class(self, node: Node, source_code: str, kind: str) -> Optional[ParsedPHPClass]:
        """Parse a class/interface/trait"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_doc_comment(node, source_code)

        # Extract methods
        methods = []
        body = node.child_by_field_name('body')
        if body:
            self._extract_methods(body, source_code, methods)

        return ParsedPHPClass(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            methods=methods,
            kind=kind
        )

    def _extract_methods(self, node: Node, source_code: str, methods: List[ParsedPHPFunction]):
        """Extract methods from class body"""
        for child in node.children:
            if child.type == 'method_declaration':
                method = self._parse_method(child, source_code)
                if method:
                    methods.append(method)

    def _parse_method(self, node: Node, source_code: str) -> Optional[ParsedPHPFunction]:
        """Parse a method declaration"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_doc_comment(node, source_code)

        # Get visibility modifier
        visibility = None
        for child in node.children:
            if child.type == 'visibility_modifier':
                visibility = self._get_node_text(child, source_code)
                break

        return ParsedPHPFunction(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            visibility=visibility
        )

    def _get_node_text(self, node: Node, source_code: str) -> str:
        """Extract text content of a node"""
        return source_code[node.start_byte:node.end_byte]

    def _get_doc_comment(self, node: Node, source_code: str) -> Optional[str]:
        """Get PHPDoc comment before a node"""
        sibling = node.prev_sibling
        while sibling:
            if sibling.type == 'comment':
                text = self._get_node_text(sibling, source_code)
                if text.startswith('/**'):
                    # Parse PHPDoc
                    lines = text.split('\n')
                    doc_lines = []
                    for line in lines:
                        line = line.strip().lstrip('/*').rstrip('*/').strip()
                        if line and not line.startswith('@'):
                            doc_lines.append(line)
                    return ' '.join(doc_lines) if doc_lines else None
            elif sibling.type not in ('comment', 'text'):
                break
            sibling = sibling.prev_sibling
        return None


if __name__ == "__main__":
    import tempfile
    import os

    test_code = '''<?php

namespace App\\Services;

/**
 * User authentication service
 * Handles login and validation
 */
class UserAuth
{
    /**
     * Validate user credentials
     * @param string $username
     * @param string $password
     * @return bool
     */
    public function validate($username, $password)
    {
        return $this->checkCredentials($username, $password);
    }

    /**
     * Login a user
     */
    private function login($email)
    {
        // Login logic
    }
}

/**
 * Repository interface
 */
interface Repository
{
    public function find($id);
    public function save($data);
}

/**
 * Logging trait
 */
trait Loggable
{
    public function log($message)
    {
        echo $message;
    }
}

/**
 * Helper function
 */
function formatDate($date)
{
    return date('Y-m-d', $date);
}
'''

    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.php")
        with open(test_file, 'w') as f:
            f.write(test_code)

        parser = PHPParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Namespace: {result.namespace}")
            print(f"Functions: {len(result.functions)}")
            print(f"Classes: {len(result.classes)}")

            for func in result.functions:
                print(f"\nFunction: {func.name}")
                if func.docstring:
                    print(f"  Doc: {func.docstring}")

            for cls in result.classes:
                print(f"\n{cls.kind.capitalize()}: {cls.name}")
                if cls.docstring:
                    print(f"  Doc: {cls.docstring}")
                if cls.methods:
                    print(f"  Methods: {len(cls.methods)}")
                    for m in cls.methods:
                        vis = f"[{m.visibility}] " if m.visibility else ""
                        print(f"    - {vis}{m.name}()")
