"""Scala code parser using Tree-sitter."""

import ctypes
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import tree_sitter_scala as tsscala
from loguru import logger
from tree_sitter import Language, Node, Parser


@dataclass
class ParsedScalaFunction:
    """Represents a parsed Scala function or method."""

    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedScalaType:
    """Represents a parsed Scala class, object, trait, or enum."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None
    methods: List[ParsedScalaFunction] = None

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedScalaFile:
    """Represents a fully parsed Scala file."""

    file_path: str
    functions: List[ParsedScalaFunction]
    types: List[ParsedScalaType]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class ScalaParser:
    """Parser for Scala source code using Tree-sitter."""

    TYPE_NODE_KINDS = {
        "class_definition": "class",
        "object_definition": "object",
        "trait_definition": "trait",
        "enum_definition": "enum",
    }
    FUNCTION_NODE_TYPES = {"function_definition", "function_declaration"}

    def __init__(self):
        """Initialize Tree-sitter parser with the Scala grammar."""
        self.language = self._load_language()
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("ScalaParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedScalaFile]:
        """Parse a Scala file and extract declarations."""
        try:
            source_bytes = Path(file_path).read_bytes()
            if source_bytes.startswith(b"\xef\xbb\xbf"):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode("utf-8")
            tree = self.parser.parse(source_bytes)

            functions: List[ParsedScalaFunction] = []
            types: List[ParsedScalaType] = []
            self._extract_declarations(tree.root_node, source_code, functions, types)

            return ParsedScalaFile(
                file_path=file_path,
                functions=functions,
                types=types,
                total_lines=source_code.count("\n") + 1,
            )
        except Exception as e:
            logger.error(f"Failed to parse Scala file {file_path}: {e}")
            return None

    def _extract_declarations(
        self,
        node: Node,
        source_code: str,
        functions: List[ParsedScalaFunction],
        types: List[ParsedScalaType],
    ):
        """Extract top-level Scala functions and type declarations."""
        for child in node.children:
            if child.type in self.FUNCTION_NODE_TYPES:
                function = self._parse_function(child, source_code)
                if function:
                    functions.append(function)
            elif child.type in self.TYPE_NODE_KINDS:
                parsed_type = self._parse_type(child, source_code)
                if parsed_type:
                    types.append(parsed_type)
            elif child.is_named:
                self._extract_declarations(child, source_code, functions, types)

    def _parse_type(self, node: Node, source_code: str) -> Optional[ParsedScalaType]:
        """Parse a class, object, trait, or enum declaration."""
        name_node = node.child_by_field_name("name") or self._first_identifier(node)
        if not name_node:
            return None

        methods: List[ParsedScalaFunction] = []
        body = node.child_by_field_name("body") or self._first_child_of_type(node, "template_body")
        if body:
            self._extract_methods(body, source_code, methods)

        return ParsedScalaType(
            name=self._get_node_text(name_node, source_code),
            code=self._get_node_text(node, source_code),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            kind=self.TYPE_NODE_KINDS[node.type],
            docstring=self._get_preceding_comment(node, source_code),
            methods=methods,
        )

    def _extract_methods(self, node: Node, source_code: str, methods: List[ParsedScalaFunction]):
        """Extract method declarations from a Scala type body."""
        for child in node.children:
            if child.type in self.FUNCTION_NODE_TYPES:
                method = self._parse_function(child, source_code)
                if method:
                    methods.append(method)
            elif child.type not in self.TYPE_NODE_KINDS and child.is_named:
                self._extract_methods(child, source_code, methods)

    def _parse_function(self, node: Node, source_code: str) -> Optional[ParsedScalaFunction]:
        """Parse a Scala function or method declaration."""
        name_node = node.child_by_field_name("name") or self._first_identifier(node)
        if not name_node:
            return None

        return ParsedScalaFunction(
            name=self._get_node_text(name_node, source_code),
            code=self._get_node_text(node, source_code),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=self._get_preceding_comment(node, source_code),
        )

    def _first_identifier(self, node: Node) -> Optional[Node]:
        for child in node.children:
            if child.type == "identifier":
                return child
        return None

    def _first_child_of_type(self, node: Node, child_type: str) -> Optional[Node]:
        for child in node.children:
            if child.type == child_type:
                return child
        return None

    def _get_node_text(self, node: Node, source_code: str) -> str:
        return source_code[node.start_byte:node.end_byte]

    def _get_preceding_comment(self, node: Node, source_code: str) -> Optional[str]:
        comments = []
        sibling = node.prev_sibling
        while sibling and sibling.type in {"line_comment", "block_comment"}:
            comments.insert(0, self._clean_comment(self._get_node_text(sibling, source_code)))
            sibling = sibling.prev_sibling
        cleaned = [comment for comment in comments if comment]
        return "\n".join(cleaned) if cleaned else None

    def _clean_comment(self, text: str) -> str:
        stripped = text.strip()
        if stripped.startswith("//"):
            return stripped[2:].strip()
        if stripped.startswith("/*") and stripped.endswith("*/"):
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
        language_value = tsscala.language()
        if isinstance(language_value, int):
            return Language(language_value, "scala")

        ctypes.pythonapi.PyCapsule_GetPointer.restype = ctypes.c_void_p
        ctypes.pythonapi.PyCapsule_GetPointer.argtypes = [ctypes.py_object, ctypes.c_char_p]
        pointer = ctypes.pythonapi.PyCapsule_GetPointer(language_value, b"tree_sitter.Language")
        return Language(pointer, "scala")
