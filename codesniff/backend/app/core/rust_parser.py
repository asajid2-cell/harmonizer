"""Rust code parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_rust as tsrust
from tree_sitter import Parser, Node, Language
from loguru import logger


@dataclass
class ParsedRustFunction:
    """Represents a parsed Rust function"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    is_async: bool = False
    is_pub: bool = False


@dataclass
class ParsedRustStruct:
    """Represents a parsed Rust struct/enum/trait"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedRustFunction] = None
    kind: str = "struct"  # struct, enum, trait

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedRustFile:
    """Represents a fully parsed Rust file"""
    file_path: str
    functions: List[ParsedRustFunction]
    structs: List[ParsedRustStruct]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class RustParser:
    """Parser for Rust source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with Rust grammar"""
        self.language = Language(tsrust.language(), "rust")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("RustParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedRustFile]:
        """Parse a Rust file and extract functions and structs"""
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

            self._extract_declarations(tree.root_node, source_code, functions, structs)

            return ParsedRustFile(
                file_path=file_path,
                functions=functions,
                structs=structs,
                total_lines=source_code.count('\n') + 1
            )

        except Exception as e:
            logger.error(f"Failed to parse Rust file {file_path}: {e}")
            return None

    def _extract_declarations(self, node: Node, source_code: str,
                              functions: List[ParsedRustFunction],
                              structs: List[ParsedRustStruct]):
        """Recursively extract functions and structs"""
        for child in node.children:
            if child.type == 'function_item':
                func = self._parse_function(child, source_code)
                if func:
                    functions.append(func)

            elif child.type == 'struct_item':
                struct = self._parse_struct(child, source_code, "struct")
                if struct:
                    structs.append(struct)

            elif child.type == 'enum_item':
                struct = self._parse_struct(child, source_code, "enum")
                if struct:
                    structs.append(struct)

            elif child.type == 'trait_item':
                struct = self._parse_struct(child, source_code, "trait")
                if struct:
                    structs.append(struct)

            elif child.type == 'impl_item':
                # Extract methods from impl blocks
                self._extract_impl_methods(child, source_code, functions, structs)

            # Recurse into mod blocks
            elif child.type == 'mod_item':
                body = child.child_by_field_name('body')
                if body:
                    self._extract_declarations(body, source_code, functions, structs)

    def _parse_function(self, node: Node, source_code: str) -> Optional[ParsedRustFunction]:
        """Parse a function item"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_doc_comment(node, source_code)

        # Check for async/pub modifiers
        is_async = False
        is_pub = False
        for child in node.children:
            if child.type == 'visibility_modifier':
                is_pub = True
            elif child.type == 'async':
                is_async = True

        return ParsedRustFunction(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            is_async=is_async,
            is_pub=is_pub
        )

    def _parse_struct(self, node: Node, source_code: str, kind: str) -> Optional[ParsedRustStruct]:
        """Parse a struct/enum/trait"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_doc_comment(node, source_code)

        return ParsedRustStruct(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            kind=kind
        )

    def _extract_impl_methods(self, impl_node: Node, source_code: str,
                              functions: List[ParsedRustFunction],
                              structs: List[ParsedRustStruct]):
        """Extract methods from impl blocks and associate with structs"""
        # Get the type being implemented
        type_node = impl_node.child_by_field_name('type')
        if not type_node:
            return

        type_name = self._get_node_text(type_node, source_code)

        # Find the body and extract methods
        body = impl_node.child_by_field_name('body')
        if not body:
            return

        methods = []
        for child in body.children:
            if child.type == 'function_item':
                method = self._parse_function(child, source_code)
                if method:
                    methods.append(method)

        # Try to find and attach methods to existing struct
        for struct in structs:
            if struct.name == type_name:
                struct.methods.extend(methods)
                return

        # If struct not found, add methods as standalone functions
        functions.extend(methods)

    def _get_node_text(self, node: Node, source_code: str) -> str:
        """Extract text content of a node"""
        return source_code[node.start_byte:node.end_byte]

    def _get_doc_comment(self, node: Node, source_code: str) -> Optional[str]:
        """Get doc comment (/// or /** */) before a node"""
        comments = []
        sibling = node.prev_sibling

        while sibling and sibling.type in ('line_comment', 'block_comment'):
            text = self._get_node_text(sibling, source_code)
            # Check if it's a doc comment
            if text.startswith('///') or text.startswith('/**'):
                comments.insert(0, text.lstrip('/').lstrip('*').strip())
            sibling = sibling.prev_sibling

        return '\n'.join(comments) if comments else None


if __name__ == "__main__":
    import tempfile
    import os

    test_code = '''
/// User authentication service
pub struct UserAuth {
    db: Database,
}

/// Repository trait for data access
pub trait Repository {
    fn find(&self, id: i32) -> Result<Data, Error>;
    fn save(&self, data: &Data) -> Result<(), Error>;
}

/// Connection status enum
pub enum Status {
    Connected,
    Disconnected,
    Error(String),
}

impl UserAuth {
    /// Creates a new UserAuth instance
    pub fn new(db: Database) -> Self {
        UserAuth { db }
    }

    /// Validates user credentials
    pub async fn validate(&self, user: &str, pass: &str) -> bool {
        self.db.check(user, pass).await
    }
}

/// Main entry point
fn main() {
    println!("Hello, World!");
}
'''

    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.rs")
        with open(test_file, 'w') as f:
            f.write(test_code)

        parser = RustParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Functions: {len(result.functions)}")
            print(f"Structs: {len(result.structs)}")

            for func in result.functions:
                mods = []
                if func.is_pub:
                    mods.append("pub")
                if func.is_async:
                    mods.append("async")
                mod_str = f" [{', '.join(mods)}]" if mods else ""
                print(f"\nFunction: {func.name}{mod_str}")
                if func.docstring:
                    print(f"  Doc: {func.docstring}")

            for struct in result.structs:
                print(f"\n{struct.kind.capitalize()}: {struct.name}")
                if struct.docstring:
                    print(f"  Doc: {struct.docstring}")
                if struct.methods:
                    print(f"  Methods: {len(struct.methods)}")
                    for m in struct.methods:
                        print(f"    - {m.name}()")
