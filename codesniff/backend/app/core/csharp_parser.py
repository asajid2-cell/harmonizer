"""C# parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
from tree_sitter import Language, Parser, Node
import tree_sitter_c_sharp as tscsharp
from loguru import logger


@dataclass
class ParsedCSharpMethod:
    """Represents a parsed C# method"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedCSharpClass:
    """Represents a parsed C# class/interface"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedCSharpMethod] = None
    is_interface: bool = False

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedCSharpFile:
    """Represents a parsed C# file"""
    file_path: str
    functions: List[ParsedCSharpMethod]
    classes: List[ParsedCSharpClass]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class CSharpParser:
    """Parser for C# source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser for C#"""
        self.language = Language(tscsharp.language(), "c_sharp")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("CSharpParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedCSharpFile]:
        """
        Parse a C# file

        Args:
            file_path: Path to C# file

        Returns:
            ParsedCSharpFile or None if parsing fails
        """
        try:
            # Read file as binary
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Strip BOM if present
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            # Decode for text operations
            source_code = source_bytes.decode('utf-8')
            lines = source_code.split('\n')
            total_lines = len(lines)

            # Parse with tree-sitter
            tree = self.parser.parse(source_bytes)
            root_node = tree.root_node

            # Extract classes and functions
            classes = self._extract_classes(root_node, source_code, lines)
            functions = self._extract_functions(root_node, source_code, lines)

            parse_errors = []
            if root_node.has_error:
                parse_errors.append("Syntax errors detected in file")

            return ParsedCSharpFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=total_lines,
                parse_errors=parse_errors
            )

        except Exception as e:
            logger.error(f"Error parsing C# file {file_path}: {e}")
            logger.exception("Full traceback:")
            return None

    def _extract_classes(self, node: Node, source_code: str, lines: List[str]) -> List[ParsedCSharpClass]:
        """Extract class, struct, and interface definitions"""
        classes = []

        for child in node.children:
            if child.type in ['class_declaration', 'struct_declaration', 'interface_declaration', 'record_declaration']:
                cls = self._parse_class(child, source_code, lines)
                if cls:
                    classes.append(cls)

            # Recursively search in namespaces
            elif child.type in ['namespace_declaration', 'file_scoped_namespace_declaration']:
                classes.extend(self._extract_classes(child, source_code, lines))

            # Search in declaration lists
            elif child.type == 'declaration_list':
                classes.extend(self._extract_classes(child, source_code, lines))

        return classes

    def _extract_functions(self, node: Node, source_code: str, lines: List[str]) -> List[ParsedCSharpMethod]:
        """Extract top-level functions (rare in C# but possible)"""
        functions = []

        for child in node.children:
            # C# can have top-level statements/functions (C# 9+)
            if child.type in ['method_declaration', 'local_function_statement']:
                func = self._parse_method(child, source_code, lines)
                if func:
                    functions.append(func)

            # Recursively search
            elif child.type in ['namespace_declaration', 'file_scoped_namespace_declaration', 'declaration_list']:
                functions.extend(self._extract_functions(child, source_code, lines))

        return functions

    def _parse_class(self, node: Node, source_code: str, lines: List[str]) -> Optional[ParsedCSharpClass]:
        """Parse a C# class, struct, interface, or record"""
        try:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            code = source_code[node.start_byte:node.end_byte]

            # Determine if interface
            is_interface = node.type == 'interface_declaration'

            # Extract class name
            name = "unknown"
            for child in node.children:
                if child.type == 'identifier':
                    name = source_code[child.start_byte:child.end_byte]
                    break

            # Extract methods
            methods = []
            for child in node.children:
                if child.type == 'declaration_list':
                    methods = self._extract_methods(child, source_code, lines)
                    break

            # Extract docstring (XML doc comments)
            docstring = self._extract_docstring(node, lines, start_line)

            return ParsedCSharpClass(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                methods=methods,
                is_interface=is_interface
            )

        except Exception as e:
            logger.debug(f"Error parsing class: {e}")
            return None

    def _extract_methods(self, node: Node, source_code: str, lines: List[str]) -> List[ParsedCSharpMethod]:
        """Extract methods from class body"""
        methods = []

        for child in node.children:
            if child.type == 'method_declaration':
                method = self._parse_method(child, source_code, lines)
                if method:
                    methods.append(method)

            # Also extract properties, constructors, etc.
            elif child.type in ['constructor_declaration', 'property_declaration', 'indexer_declaration']:
                method = self._parse_method(child, source_code, lines)
                if method:
                    methods.append(method)

        return methods

    def _parse_method(self, node: Node, source_code: str, lines: List[str]) -> Optional[ParsedCSharpMethod]:
        """Parse a C# method"""
        try:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            code = source_code[node.start_byte:node.end_byte]

            # Extract method name
            name = "unknown"
            for child in node.children:
                if child.type == 'identifier':
                    name = source_code[child.start_byte:child.end_byte]
                    break

            # Extract docstring (XML doc comments)
            docstring = self._extract_docstring(node, lines, start_line)

            return ParsedCSharpMethod(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring
            )

        except Exception as e:
            logger.debug(f"Error parsing method: {e}")
            return None

    def _extract_docstring(self, node: Node, lines: List[str], start_line: int) -> Optional[str]:
        """Extract XML doc comment above the node"""
        try:
            if start_line < 2:
                return None

            docstring_lines = []
            idx = start_line - 2

            # Collect XML doc comments (///)
            while idx >= 0:
                line = lines[idx].strip()
                if line.startswith('///'):
                    # Remove /// and XML tags for simplicity
                    doc_line = line[3:].strip()
                    # Remove common XML tags
                    doc_line = doc_line.replace('<summary>', '').replace('</summary>', '')
                    doc_line = doc_line.replace('<param>', '').replace('</param>', '')
                    doc_line = doc_line.replace('<returns>', '').replace('</returns>', '')
                    if doc_line:
                        docstring_lines.insert(0, doc_line)
                    idx -= 1
                elif line.startswith('//'):
                    # Regular comment
                    docstring_lines.insert(0, line[2:].strip())
                    idx -= 1
                else:
                    break

            if docstring_lines:
                return ' '.join(docstring_lines)

            return None

        except:
            return None


def main():
    """Test the C# parser"""
    import tempfile
    import os

    # Create test C# file
    test_dir = tempfile.mkdtemp()
    test_file = os.path.join(test_dir, 'test.cs')

    with open(test_file, 'w') as f:
        f.write('''
using System;

namespace MyApp
{
    /// <summary>
    /// User authentication service
    /// </summary>
    public class UserAuth
    {
        /// <summary>
        /// Validates user credentials
        /// </summary>
        public bool ValidateUser(string username, string password)
        {
            return CheckCredentials(username, password);
        }

        // Logs in a user
        public void Login(string email)
        {
            // Login logic
        }
    }

    /// Service interface
    public interface IUserService
    {
        void CreateUser(string username);
    }
}
''')

    try:
        parser = CSharpParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Functions: {len(result.functions)}")
            print(f"Classes: {len(result.classes)}")

            for cls in result.classes:
                print(f"\nClass: {cls.name} (interface: {cls.is_interface})")
                print(f"  Docstring: {cls.docstring}")
                print(f"  Methods: {len(cls.methods)}")
                for method in cls.methods:
                    print(f"    - {method.name}()")
                    if method.docstring:
                        print(f"      Doc: {method.docstring}")

    finally:
        import shutil
        shutil.rmtree(test_dir)


if __name__ == "__main__":
    main()
