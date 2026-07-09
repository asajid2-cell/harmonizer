"""Swift code parser using Tree-sitter."""

import ctypes
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import tree_sitter_swift as tsswift
from loguru import logger
from tree_sitter import Language, Node, Parser


@dataclass
class ParsedSwiftSymbol:
    """Represents a parsed Swift function, method, or property."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None


@dataclass
class ParsedSwiftType:
    """Represents a parsed Swift type declaration."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None
    members: List[ParsedSwiftSymbol] = None

    def __post_init__(self):
        if self.members is None:
            self.members = []


@dataclass
class ParsedSwiftFile:
    """Represents a fully parsed Swift file."""

    file_path: str
    functions: List[ParsedSwiftSymbol]
    properties: List[ParsedSwiftSymbol]
    types: List[ParsedSwiftType]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class SwiftParser:
    """Parser for Swift source code using Tree-sitter."""

    TYPE_NODES = {"class_declaration", "protocol_declaration"}
    FUNCTION_NODES = {"function_declaration", "protocol_function_declaration"}
    PROPERTY_NODE = "property_declaration"
    TYPE_KEYWORDS = {"actor", "class", "enum", "extension", "protocol", "struct"}
    BODY_NODES = {"class_body", "protocol_body", "enum_class_body"}

    def __init__(self):
        """Initialize Tree-sitter parser with the Swift grammar."""
        self.language = self._load_language()
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("SwiftParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedSwiftFile]:
        """Parse a Swift file and extract top-level declarations."""
        try:
            source_bytes = Path(file_path).read_bytes()
            if source_bytes.startswith(b"\xef\xbb\xbf"):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode("utf-8")
            tree = self.parser.parse(source_bytes)

            functions: List[ParsedSwiftSymbol] = []
            properties: List[ParsedSwiftSymbol] = []
            types: List[ParsedSwiftType] = []
            self._extract_declarations(tree.root_node, source_code, functions, properties, types)

            return ParsedSwiftFile(
                file_path=file_path,
                functions=functions,
                properties=properties,
                types=types,
                total_lines=source_code.count("\n") + 1,
            )
        except Exception as e:
            logger.error(f"Failed to parse Swift file {file_path}: {e}")
            return None

    def _extract_declarations(
        self,
        node: Node,
        source_code: str,
        functions: List[ParsedSwiftSymbol],
        properties: List[ParsedSwiftSymbol],
        types: List[ParsedSwiftType],
    ):
        """Extract top-level Swift functions, properties, and type declarations."""
        for child in node.children:
            if child.type in self.FUNCTION_NODES:
                function = self._parse_symbol(child, source_code, "function")
                if function:
                    functions.append(function)
            elif child.type == self.PROPERTY_NODE:
                property_symbol = self._parse_symbol(child, source_code, "property")
                if property_symbol:
                    properties.append(property_symbol)
            elif child.type in self.TYPE_NODES:
                parsed_type = self._parse_type(child, source_code)
                if parsed_type:
                    types.append(parsed_type)
            elif child.is_named:
                self._extract_declarations(child, source_code, functions, properties, types)

    def _parse_type(self, node: Node, source_code: str) -> Optional[ParsedSwiftType]:
        """Parse a Swift type declaration."""
        name_node = self._first_descendant_of_type(node, {"type_identifier"})
        if not name_node:
            return None

        members: List[ParsedSwiftSymbol] = []
        body = self._first_child_of_type(node, self.BODY_NODES)
        if body:
            self._extract_members(body, source_code, members)

        kind = self._type_kind(node)
        name = self._get_node_text(name_node, source_code)
        if kind == "extension":
            name = f"{name} extension"

        return ParsedSwiftType(
            name=name,
            code=self._get_node_text(node, source_code),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            kind=kind,
            docstring=self._get_preceding_comment(node, source_code),
            members=members,
        )

    def _extract_members(
        self,
        node: Node,
        source_code: str,
        members: List[ParsedSwiftSymbol],
    ):
        """Extract methods and properties from a Swift type body."""
        for child in node.children:
            if child.type in self.FUNCTION_NODES:
                method = self._parse_symbol(child, source_code, "method")
                if method:
                    members.append(method)
            elif child.type == self.PROPERTY_NODE:
                property_symbol = self._parse_symbol(child, source_code, "property")
                if property_symbol:
                    members.append(property_symbol)
            elif child.type not in self.TYPE_NODES and child.is_named:
                self._extract_members(child, source_code, members)

    def _parse_symbol(
        self,
        node: Node,
        source_code: str,
        kind: str,
    ) -> Optional[ParsedSwiftSymbol]:
        """Parse a Swift function-like or property declaration."""
        if kind == "property":
            name_node = self._first_descendant_of_type(node, {"simple_identifier"})
        else:
            name_node = self._first_child_of_type(node, {"simple_identifier"})
        if not name_node:
            return None

        return ParsedSwiftSymbol(
            name=self._get_node_text(name_node, source_code),
            code=self._get_node_text(node, source_code),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            kind=kind,
            docstring=self._get_preceding_comment(node, source_code),
        )

    def _type_kind(self, node: Node) -> str:
        for child in node.children:
            if child.type in self.TYPE_KEYWORDS:
                return child.type
        return "type"

    def _first_child_of_type(self, node: Node, child_types: set[str]) -> Optional[Node]:
        for child in node.children:
            if child.type in child_types:
                return child
        return None

    def _first_descendant_of_type(self, node: Node, node_types: set[str]) -> Optional[Node]:
        for child in node.children:
            if child.type in node_types:
                return child
            if child.is_named:
                match = self._first_descendant_of_type(child, node_types)
                if match:
                    return match
        return None

    def _get_node_text(self, node: Node, source_code: str) -> str:
        return source_code[node.start_byte:node.end_byte]

    def _get_preceding_comment(self, node: Node, source_code: str) -> Optional[str]:
        comments = []
        sibling = node.prev_sibling
        while sibling and sibling.type == "comment":
            comments.insert(0, self._clean_comment(self._get_node_text(sibling, source_code)))
            sibling = sibling.prev_sibling
        cleaned = [comment for comment in comments if comment]
        return "\n".join(cleaned) if cleaned else None

    def _clean_comment(self, text: str) -> str:
        stripped = text.strip()
        if stripped.startswith("///"):
            return stripped[3:].strip()
        if stripped.startswith("//"):
            return stripped[2:].strip()
        if stripped.startswith("/**") and stripped.endswith("*/"):
            stripped = stripped[3:-2]
        elif stripped.startswith("/*") and stripped.endswith("*/"):
            stripped = stripped[2:-2]
        lines = []
        for line in stripped.splitlines():
            line = line.strip()
            if line.startswith("*"):
                line = line[1:].strip()
            if line:
                lines.append(line)
        return " ".join(lines).strip()

    def _load_language(self) -> Language:
        language_value = tsswift.language()
        if isinstance(language_value, int):
            return Language(language_value, "swift")

        ctypes.pythonapi.PyCapsule_GetPointer.restype = ctypes.c_void_p
        ctypes.pythonapi.PyCapsule_GetPointer.argtypes = [ctypes.py_object, ctypes.c_char_p]
        pointer = ctypes.pythonapi.PyCapsule_GetPointer(language_value, b"tree_sitter.Language")
        return Language(pointer, "swift")
