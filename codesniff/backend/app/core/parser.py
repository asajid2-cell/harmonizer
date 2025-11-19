"""Code parser using Tree-sitter for Python syntax analysis"""

import os
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_python as tspython
from tree_sitter import Language, Parser, Node
from loguru import logger


@dataclass
class ParsedFunction:
    """Represents a parsed function from source code"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    file_path: str = ""


@dataclass
class ParsedClass:
    """Represents a parsed class from source code"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedFunction] = None
    file_path: str = ""

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedFile:
    """Represents a fully parsed Python file"""
    file_path: str
    functions: List[ParsedFunction]
    classes: List[ParsedClass]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class CodeParser:
    """Parser for Python source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with Python grammar"""
        # Load Python language
        self.language = Language(tspython.language(), "python")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("CodeParser initialized with Python grammar")

    def parse_file(self, file_path: str) -> Optional[ParsedFile]:
        """
        Parse a Python file and extract all functions and classes

        Args:
            file_path: Path to the Python file

        Returns:
            ParsedFile object containing all extracted symbols, or None on error
        """
        try:
            # Read file content
            with open(file_path, 'r', encoding='utf-8') as f:
                source_code = f.read()

            # Parse with tree-sitter
            tree = self.parser.parse(bytes(source_code, 'utf8'))
            root_node = tree.root_node

            # Extract functions and classes
            functions = self._extract_functions(root_node, source_code, file_path)
            classes = self._extract_classes(root_node, source_code, file_path)

            # Count lines
            total_lines = source_code.count('\n') + 1

            # Check for parse errors
            parse_errors = []
            if root_node.has_error:
                parse_errors.append("Syntax errors detected in file")

            parsed_file = ParsedFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=total_lines,
                parse_errors=parse_errors
            )

            logger.debug(f"Parsed {file_path}: {len(functions)} functions, {len(classes)} classes")
            return parsed_file

        except Exception as e:
            logger.error(f"Error parsing file {file_path}: {e}")
            return None

    def _extract_functions(self, node: Node, source_code: str, file_path: str,
                          parent_class: Optional[str] = None) -> List[ParsedFunction]:
        """
        Recursively extract all function definitions from the AST

        Args:
            node: Current tree-sitter node
            source_code: Full source code as string
            file_path: Path to the file being parsed
            parent_class: Name of parent class if this is a method

        Returns:
            List of ParsedFunction objects
        """
        functions = []

        # Check if current node is a function definition
        if node.type == 'function_definition':
            func = self._parse_function_node(node, source_code, file_path)
            if func:
                functions.append(func)

        # Recursively process children (but skip class bodies if we're not in a class)
        for child in node.children:
            # Skip nested classes when extracting module-level functions
            if parent_class is None and child.type == 'class_definition':
                continue
            functions.extend(self._extract_functions(child, source_code, file_path, parent_class))

        return functions

    def _extract_classes(self, node: Node, source_code: str, file_path: str) -> List[ParsedClass]:
        """
        Recursively extract all class definitions from the AST

        Args:
            node: Current tree-sitter node
            source_code: Full source code as string
            file_path: Path to the file being parsed

        Returns:
            List of ParsedClass objects
        """
        classes = []

        # Check if current node is a class definition
        if node.type == 'class_definition':
            cls = self._parse_class_node(node, source_code, file_path)
            if cls:
                classes.append(cls)

        # Recursively process children
        for child in node.children:
            classes.extend(self._extract_classes(child, source_code, file_path))

        return classes

    def _parse_function_node(self, node: Node, source_code: str, file_path: str) -> Optional[ParsedFunction]:
        """
        Parse a function_definition node into a ParsedFunction

        Args:
            node: Tree-sitter function_definition node
            source_code: Full source code as string
            file_path: Path to the file being parsed

        Returns:
            ParsedFunction object or None
        """
        try:
            # Get function name
            name_node = node.child_by_field_name('name')
            if not name_node:
                return None

            func_name = source_code[name_node.start_byte:name_node.end_byte]

            # Get function code
            func_code = source_code[node.start_byte:node.end_byte]

            # Get line numbers (tree-sitter uses 0-indexed lines)
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1

            # Extract docstring
            docstring = self._extract_docstring(node, source_code)

            return ParsedFunction(
                name=func_name,
                code=func_code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                file_path=file_path
            )

        except Exception as e:
            logger.warning(f"Error parsing function node: {e}")
            return None

    def _parse_class_node(self, node: Node, source_code: str, file_path: str) -> Optional[ParsedClass]:
        """
        Parse a class_definition node into a ParsedClass

        Args:
            node: Tree-sitter class_definition node
            source_code: Full source code as string
            file_path: Path to the file being parsed

        Returns:
            ParsedClass object or None
        """
        try:
            # Get class name
            name_node = node.child_by_field_name('name')
            if not name_node:
                return None

            class_name = source_code[name_node.start_byte:name_node.end_byte]

            # Get class code
            class_code = source_code[node.start_byte:node.end_byte]

            # Get line numbers
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1

            # Extract docstring
            docstring = self._extract_docstring(node, source_code)

            # Extract methods (functions within the class)
            body_node = node.child_by_field_name('body')
            methods = []
            if body_node:
                methods = self._extract_functions(body_node, source_code, file_path, parent_class=class_name)

            return ParsedClass(
                name=class_name,
                code=class_code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                methods=methods,
                file_path=file_path
            )

        except Exception as e:
            logger.warning(f"Error parsing class node: {e}")
            return None

    def _extract_docstring(self, node: Node, source_code: str) -> Optional[str]:
        """
        Extract docstring from a function or class node

        Args:
            node: Tree-sitter node (function_definition or class_definition)
            source_code: Full source code as string

        Returns:
            Docstring text or None
        """
        try:
            # Get the body of the function/class
            body_node = node.child_by_field_name('body')
            if not body_node or len(body_node.children) < 2:
                return None

            # Second child is often the first statement (after colon)
            first_statement = body_node.children[1]

            # Check if it's an expression statement containing a string
            if first_statement.type == 'expression_statement':
                if len(first_statement.children) > 0:
                    string_node = first_statement.children[0]
                    if string_node.type == 'string':
                        docstring = source_code[string_node.start_byte:string_node.end_byte]
                        # Clean up the docstring (remove quotes)
                        docstring = docstring.strip('"""').strip("'''").strip('"').strip("'").strip()
                        return docstring

            return None

        except Exception:
            return None

    def parse_directory(self, directory_path: str) -> List[ParsedFile]:
        """
        Parse all Python files in a directory recursively

        Args:
            directory_path: Path to the directory to scan

        Returns:
            List of ParsedFile objects
        """
        parsed_files = []
        directory = Path(directory_path)

        # Find all Python files
        python_files = list(directory.rglob("*.py"))
        logger.info(f"Found {len(python_files)} Python files in {directory_path}")

        for py_file in python_files:
            parsed = self.parse_file(str(py_file))
            if parsed:
                parsed_files.append(parsed)

        return parsed_files


def main():
    """Test the parser"""
    parser = CodeParser()

    # Test with a sample file
    test_code = '''
def hello_world(name: str) -> str:
    """Greet someone by name"""
    return f"Hello, {name}!"

class Calculator:
    """A simple calculator class"""

    def add(self, a: int, b: int) -> int:
        """Add two numbers"""
        return a + b

    def multiply(self, a: int, b: int) -> int:
        """Multiply two numbers"""
        return a * b
'''

    # Write test file
    test_file = '/tmp/test_parser.py'
    with open(test_file, 'w') as f:
        f.write(test_code)

    # Parse it
    result = parser.parse_file(test_file)
    if result:
        print(f"Functions: {len(result.functions)}")
        for func in result.functions:
            print(f"  - {func.name} (lines {func.start_line}-{func.end_line})")

        print(f"Classes: {len(result.classes)}")
        for cls in result.classes:
            print(f"  - {cls.name} (lines {cls.start_line}-{cls.end_line})")
            print(f"    Methods: {len(cls.methods)}")


if __name__ == "__main__":
    main()
