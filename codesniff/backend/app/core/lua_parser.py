"""Lua code parser using Tree-sitter."""

import ctypes
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import tree_sitter_lua as tslua
from loguru import logger
from tree_sitter import Language, Node, Parser


@dataclass
class ParsedLuaFunction:
    """Represents a parsed Lua function."""

    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    parent_table: Optional[str] = None


@dataclass
class ParsedLuaTable:
    """Represents a Lua table used as a module/class-like surface."""

    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedLuaFunction] = None

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedLuaFile:
    """Represents a fully parsed Lua file."""

    file_path: str
    functions: List[ParsedLuaFunction]
    tables: List[ParsedLuaTable]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class LuaParser:
    """Parser for Lua source code using Tree-sitter."""

    def __init__(self):
        self.language = self._load_language()
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("LuaParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedLuaFile]:
        """Parse a Lua file and extract functions plus module-like tables."""
        try:
            source_bytes = Path(file_path).read_bytes()
            if source_bytes.startswith(b"\xef\xbb\xbf"):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode("utf-8")
            tree = self.parser.parse(source_bytes)

            functions: List[ParsedLuaFunction] = []
            tables_by_name: dict[str, ParsedLuaTable] = {}
            self._extract_declarations(tree.root_node, source_code, functions, tables_by_name)

            for function in functions:
                if function.parent_table and function.parent_table in tables_by_name:
                    tables_by_name[function.parent_table].methods.append(function)

            standalone_functions = [
                function
                for function in functions
                if not function.parent_table or function.parent_table not in tables_by_name
            ]

            return ParsedLuaFile(
                file_path=file_path,
                functions=standalone_functions,
                tables=list(tables_by_name.values()),
                total_lines=source_code.count("\n") + 1,
            )
        except Exception as e:
            logger.error(f"Failed to parse Lua file {file_path}: {e}")
            return None

    def _extract_declarations(
        self,
        node: Node,
        source_code: str,
        functions: List[ParsedLuaFunction],
        tables_by_name: dict[str, ParsedLuaTable],
    ):
        for child in node.children:
            if child.type == "function_declaration":
                function = self._parse_function(child, source_code)
                if function:
                    functions.append(function)
            elif child.type == "variable_declaration":
                table = self._parse_table_declaration(child, source_code)
                if table:
                    tables_by_name.setdefault(table.name, table)
            elif child.is_named:
                self._extract_declarations(child, source_code, functions, tables_by_name)

    def _parse_function(self, node: Node, source_code: str) -> Optional[ParsedLuaFunction]:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return None

        full_name = self._get_node_text(name_node, source_code)
        display_name = full_name
        parent_table = None
        if name_node.type in {"dot_index_expression", "method_index_expression"}:
            identifiers = [child for child in name_node.children if child.type == "identifier"]
            if len(identifiers) >= 2:
                parent_table = self._get_node_text(identifiers[0], source_code)
                display_name = self._get_node_text(identifiers[-1], source_code)

        return ParsedLuaFunction(
            name=display_name,
            code=self._get_node_text(node, source_code),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=self._get_preceding_comment(node, source_code),
            parent_table=parent_table,
        )

    def _parse_table_declaration(self, node: Node, source_code: str) -> Optional[ParsedLuaTable]:
        assignment = self._first_child_of_type(node, "assignment_statement")
        if not assignment:
            return None

        name_node = assignment.child_by_field_name("name")
        if not name_node or name_node.type != "identifier":
            return None
        if not self._contains_node_type(assignment, "table_constructor"):
            return None

        return ParsedLuaTable(
            name=self._get_node_text(name_node, source_code),
            code=self._get_node_text(node, source_code),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=self._get_preceding_comment(node, source_code),
        )

    def _first_child_of_type(self, node: Node, child_type: str) -> Optional[Node]:
        for child in node.children:
            if child.type == child_type:
                return child
        return None

    def _contains_node_type(self, node: Node, child_type: str) -> bool:
        if node.type == child_type:
            return True
        return any(self._contains_node_type(child, child_type) for child in node.children)

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
        while stripped.startswith("-"):
            stripped = stripped[1:]
        return stripped.strip()

    def _load_language(self) -> Language:
        language_value = tslua.language()
        if isinstance(language_value, int):
            return Language(language_value, "lua")

        ctypes.pythonapi.PyCapsule_GetPointer.restype = ctypes.c_void_p
        ctypes.pythonapi.PyCapsule_GetPointer.argtypes = [ctypes.py_object, ctypes.c_char_p]
        pointer = ctypes.pythonapi.PyCapsule_GetPointer(language_value, b"tree_sitter.Language")
        return Language(pointer, "lua")
