"""Ruby code parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_ruby as tsruby
from tree_sitter import Parser, Node, Language
from loguru import logger


@dataclass
class ParsedRubyMethod:
    """Represents a parsed Ruby method"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedRubyClass:
    """Represents a parsed Ruby class/module"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedRubyMethod] = None
    is_module: bool = False

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedRubyFile:
    """Represents a fully parsed Ruby file"""
    file_path: str
    functions: List[ParsedRubyMethod]
    classes: List[ParsedRubyClass]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class RubyParser:
    """Parser for Ruby source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with Ruby grammar"""
        self.language = Language(tsruby.language(), "ruby")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("RubyParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedRubyFile]:
        """Parse a Ruby file and extract methods and classes"""
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

            self._extract_declarations(tree.root_node, source_code, functions, classes)

            return ParsedRubyFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=source_code.count('\n') + 1
            )

        except Exception as e:
            logger.error(f"Failed to parse Ruby file {file_path}: {e}")
            return None

    def _extract_declarations(self, node: Node, source_code: str,
                              functions: List[ParsedRubyMethod],
                              classes: List[ParsedRubyClass]):
        """Recursively extract methods and classes"""
        for child in node.children:
            if child.type == 'method':
                method = self._parse_method(child, source_code)
                if method:
                    functions.append(method)

            elif child.type == 'class':
                cls = self._parse_class(child, source_code, is_module=False)
                if cls:
                    classes.append(cls)

            elif child.type == 'module':
                mod = self._parse_class(child, source_code, is_module=True)
                if mod:
                    classes.append(mod)

            elif child.type == 'singleton_class':
                # Extract singleton methods
                self._extract_declarations(child, source_code, functions, classes)

            elif child.type == 'program':
                self._extract_declarations(child, source_code, functions, classes)

    def _parse_method(self, node: Node, source_code: str) -> Optional[ParsedRubyMethod]:
        """Parse a method definition"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        return ParsedRubyMethod(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring
        )

    def _parse_class(self, node: Node, source_code: str, is_module: bool) -> Optional[ParsedRubyClass]:
        """Parse a class or module definition"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        # Extract methods
        methods = []
        body = node.child_by_field_name('body')
        if body:
            self._extract_methods(body, source_code, methods)

        return ParsedRubyClass(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            methods=methods,
            is_module=is_module
        )

    def _extract_methods(self, node: Node, source_code: str, methods: List[ParsedRubyMethod]):
        """Extract methods from a class/module body"""
        for child in node.children:
            if child.type == 'method':
                method = self._parse_method(child, source_code)
                if method:
                    methods.append(method)
            elif child.type == 'singleton_method':
                method = self._parse_singleton_method(child, source_code)
                if method:
                    methods.append(method)
            elif hasattr(child, 'children'):
                self._extract_methods(child, source_code, methods)

    def _parse_singleton_method(self, node: Node, source_code: str) -> Optional[ParsedRubyMethod]:
        """Parse a singleton method (self.method_name)"""
        name_node = node.child_by_field_name('name')
        if not name_node:
            return None

        name = "self." + self._get_node_text(name_node, source_code)
        code = self._get_node_text(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        return ParsedRubyMethod(
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

    test_code = '''
# User authentication module
module Authentication
  # Validates credentials
  def validate(username, password)
    check_credentials(username, password)
  end
end

# User management class
class UserManager
  # Initialize with database connection
  def initialize(db)
    @db = db
  end

  # Find user by ID
  def find(id)
    @db.query("SELECT * FROM users WHERE id = ?", id)
  end

  # Class method to create user
  def self.create(attrs)
    new(attrs).save
  end
end

# Standalone function
def greet(name)
  puts "Hello, #{name}!"
end
'''

    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.rb")
        with open(test_file, 'w') as f:
            f.write(test_code)

        parser = RubyParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Functions: {len(result.functions)}")
            print(f"Classes: {len(result.classes)}")

            for func in result.functions:
                print(f"\nFunction: {func.name}")
                if func.docstring:
                    print(f"  Doc: {func.docstring}")

            for cls in result.classes:
                kind = "Module" if cls.is_module else "Class"
                print(f"\n{kind}: {cls.name}")
                if cls.docstring:
                    print(f"  Doc: {cls.docstring}")
                if cls.methods:
                    print(f"  Methods: {len(cls.methods)}")
                    for m in cls.methods:
                        print(f"    - {m.name}()")
