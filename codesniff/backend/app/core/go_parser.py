"""Go code parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_go as tsgo
from tree_sitter import Parser, Node, Language
from loguru import logger


@dataclass
class ParsedGoFunction:
    """Represents a parsed Go function"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    receiver: Optional[str] = None  # For methods: (t *Type)


@dataclass
class ParsedGoStruct:
    """Represents a parsed Go struct/interface"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedGoFunction] = None
    is_interface: bool = False

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedGoFile:
    """Represents a fully parsed Go file"""
    file_path: str
    functions: List[ParsedGoFunction]
    structs: List[ParsedGoStruct]
    total_lines: int
    package_name: Optional[str] = None
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class GoParser:
    """Parser for Go source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with Go grammar"""
        self.language = Language(tsgo.language(), "go")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("GoParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedGoFile]:
        """Parse a Go file and extract functions and structs"""
        try:
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Handle BOM
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode('utf-8')
            tree = self.parser.parse(source_bytes)

            functions = []
            structs = []
            package_name = None

            # Find package name
            for child in tree.root_node.children:
                if child.type == 'package_clause':
                    pkg_id = child.child_by_field_name('name')
                    if pkg_id:
                        package_name = self._get_node_text(pkg_id, source_code)
                    break

            # Extract all declarations
            self._extract_declarations(tree.root_node, source_code, functions, structs)

            return ParsedGoFile(
                file_path=file_path,
                functions=functions,
                structs=structs,
                total_lines=source_code.count('\n') + 1,
                package_name=package_name
            )

        except Exception as e:
            logger.error(f"Failed to parse Go file {file_path}: {e}")
            return None

    def _extract_declarations(self, node: Node, source_code: str,
                              functions: List[ParsedGoFunction],
                              structs: List[ParsedGoStruct]):
        """Recursively extract functions and structs"""
        for child in node.children:
            if child.type == 'function_declaration':
                func = self._parse_function(child, source_code)
                if func:
                    functions.append(func)

            elif child.type == 'method_declaration':
                func = self._parse_method(child, source_code)
                if func:
                    functions.append(func)

            elif child.type == 'type_declaration':
                # Can contain struct or interface specs
                for spec in child.children:
                    if spec.type == 'type_spec':
                        struct = self._parse_type_spec(spec, source_code)
                        if struct:
                            structs.append(struct)

    def _parse_function(self, node: Node, source_code: str) -> Optional[ParsedGoFunction]:
        """Parse a function declaration"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        return ParsedGoFunction(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring
        )

    def _parse_method(self, node: Node, source_code: str) -> Optional[ParsedGoFunction]:
        """Parse a method declaration (function with receiver)"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        # Get receiver
        receiver = None
        receiver_node = node.child_by_field_name('receiver')
        if receiver_node:
            receiver = self._get_node_text(receiver_node, source_code)

        return ParsedGoFunction(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            receiver=receiver
        )

    def _parse_type_spec(self, node: Node, source_code: str) -> Optional[ParsedGoStruct]:
        """Parse a type specification (struct or interface)"""
        name_node = node.child_by_field_name('name')
        type_node = node.child_by_field_name('type')

        if not name_node or not type_node:
            return None

        name = self._get_node_text(name_node, source_code)
        is_interface = type_node.type == 'interface_type'

        # Only parse structs and interfaces
        if type_node.type not in ('struct_type', 'interface_type'):
            return None

        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        return ParsedGoStruct(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            is_interface=is_interface
        )

    def _get_node_text(self, node: Node, source_code: str) -> str:
        """Extract text content of a node"""
        return source_code[node.start_byte:node.end_byte]

    def _get_preceding_comment(self, node: Node, source_code: str) -> Optional[str]:
        """Get comment immediately before a node"""
        if node.prev_sibling and node.prev_sibling.type == 'comment':
            comment = self._get_node_text(node.prev_sibling, source_code)
            return comment.lstrip('/ ').strip()
        return None


if __name__ == "__main__":
    import tempfile
    import os

    # Test Go code
    test_code = '''
package main

// UserService handles user operations
type UserService struct {
    db *Database
}

// IRepository defines repository operations
type IRepository interface {
    Find(id int) error
    Save(data interface{}) error
}

// NewUserService creates a new UserService
func NewUserService(db *Database) *UserService {
    return &UserService{db: db}
}

// GetUser retrieves a user by ID
func (s *UserService) GetUser(id int) (*User, error) {
    return s.db.FindUser(id)
}

// main entry point
func main() {
    fmt.Println("Hello, World!")
}
'''

    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.go")
        with open(test_file, 'w') as f:
            f.write(test_code)

        parser = GoParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Package: {result.package_name}")
            print(f"Functions: {len(result.functions)}")
            print(f"Structs: {len(result.structs)}")

            for func in result.functions:
                receiver = f" (receiver: {func.receiver})" if func.receiver else ""
                print(f"\nFunction: {func.name}{receiver}")
                if func.docstring:
                    print(f"  Doc: {func.docstring}")

            for struct in result.structs:
                kind = "Interface" if struct.is_interface else "Struct"
                print(f"\n{kind}: {struct.name}")
                if struct.docstring:
                    print(f"  Doc: {struct.docstring}")
