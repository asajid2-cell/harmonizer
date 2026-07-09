"""JavaScript/TypeScript parser with Tree-sitter backed symbol extraction."""

import re
from typing import List, Optional
from dataclasses import dataclass
import tree_sitter_javascript as tsjavascript
from tree_sitter import Language, Node, Parser
from loguru import logger

try:
    import tree_sitter_typescript as tstypescript
except ImportError:  # pragma: no cover - dependency is declared, fallback is defensive.
    tstypescript = None


@dataclass
class ParsedJSFunction:
    """Represents a parsed function from JS/TS code"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    file_path: str = ""


@dataclass
class ParsedJSClass:
    """Represents a parsed class from JS/TS code"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedJSFunction] = None
    file_path: str = ""

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedJSFile:
    """Represents a fully parsed JS/TS file"""
    file_path: str
    functions: List[ParsedJSFunction]
    classes: List[ParsedJSClass]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class JSParser:
    """Parser for JavaScript/TypeScript source with regex fallback."""

    def __init__(self):
        """Initialize JS parser"""
        self.parser = self._build_parser(tsjavascript.language, "javascript")
        self.typescript_parser: Optional[Parser] = None
        self.tsx_parser: Optional[Parser] = None
        if tstypescript is not None:
            self.typescript_parser = self._build_parser(tstypescript.language_typescript, "typescript")
            self.tsx_parser = self._build_parser(tstypescript.language_tsx, "tsx")

        # Pattern for functions: function name(...) { or const name = (...) => { or name(...) {
        self.function_patterns = [
            # function declarations
            r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+?)?\s*\{',
            # arrow functions assigned to const/let/var
            r'(?:export\s+)?(?:const|let|var)\s+(\w+)(?:\s*:\s*[^=]+?)?\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+?)?\s*=>\s*[{\(]',
            # method definitions in objects/classes
            r'^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+?)?\s*\{',
        ]

        # Pattern for classes
        self.class_pattern = r'(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*(?:implements\s+[\w,\s]+)?\s*\{'

        # Pattern for JSDoc comments
        self.jsdoc_pattern = r'/\*\*\s*([\s\S]*?)\s*\*/'

        # Pattern for React components (function components)
        self.component_pattern = r'(?:export\s+)?(?:const|function)\s+(\w+)\s*(?::\s*(?:React\.)?FC(?:<[^>]+>)?)?\s*=?\s*\([^)]*\)\s*(?::\s*[^{=]+?)?\s*(?:=>)?\s*[{\(]'

        logger.info("JSParser initialized")

    def _build_parser(self, language_factory, language_name: str) -> Optional[Parser]:
        try:
            language = Language(language_factory(), language_name)
            parser = Parser()
            parser.set_language(language)
            return parser
        except Exception as exc:
            logger.warning(f"Tree-sitter {language_name} parser unavailable; using regex fallback: {exc}")
            return None

    def parse_file(self, file_path: str) -> Optional[ParsedJSFile]:
        """
        Parse a JavaScript/TypeScript file

        Args:
            file_path: Path to the file

        Returns:
            ParsedJSFile object or None on error
        """
        try:
            with open(file_path, 'rb') as f:
                source_bytes = f.read()
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]
            source_code = source_bytes.decode('utf-8')

            lines = source_code.split('\n')
            total_lines = len(lines)

            functions, classes, parse_errors = self._parse_with_tree_sitter(source_bytes, source_code, file_path)

            # Extract functions
            for pattern in self.function_patterns:
                for match in re.finditer(pattern, source_code, re.MULTILINE):
                    name = match.group(1)
                    if not name or name in ['if', 'for', 'while', 'switch', 'catch']:
                        continue

                    start_pos = match.start()
                    start_line = source_code[:start_pos].count('\n') + 1

                    # Find the function body
                    code, end_line = self._extract_block(source_code, match.end() - 1, start_line)

                    # Look for preceding JSDoc
                    docstring = self._find_jsdoc(source_code, start_pos)

                    # Avoid duplicates
                    if not any(f.name == name and f.start_line == start_line for f in functions):
                        functions.append(ParsedJSFunction(
                            name=name,
                            code=code,
                            start_line=start_line,
                            end_line=end_line,
                            docstring=docstring,
                            file_path=file_path
                        ))

            # Extract React components
            for match in re.finditer(self.component_pattern, source_code, re.MULTILINE):
                name = match.group(1)
                if not name or name[0].islower():  # Components start with uppercase
                    continue

                start_pos = match.start()
                start_line = source_code[:start_pos].count('\n') + 1

                # Find the component body
                code, end_line = self._extract_block(source_code, match.end() - 1, start_line)

                docstring = self._find_jsdoc(source_code, start_pos)

                # Avoid duplicates
                if not any(f.name == name for f in functions):
                    functions.append(ParsedJSFunction(
                        name=name,
                        code=code,
                        start_line=start_line,
                        end_line=end_line,
                        docstring=docstring or f"React component: {name}",
                        file_path=file_path
                    ))

            # Extract classes
            for match in re.finditer(self.class_pattern, source_code, re.MULTILINE):
                name = match.group(1)
                start_pos = match.start()
                start_line = source_code[:start_pos].count('\n') + 1

                # Find the class body
                code, end_line = self._extract_block(source_code, match.end() - 1, start_line)

                docstring = self._find_jsdoc(source_code, start_pos)

                # Extract methods from class
                methods = self._extract_methods(code, start_line, file_path)

                self._append_class(classes, ParsedJSClass(
                    name=name,
                    code=code,
                    start_line=start_line,
                    end_line=end_line,
                    docstring=docstring,
                    methods=methods,
                    file_path=file_path
                ))

            return ParsedJSFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=total_lines,
                parse_errors=parse_errors,
            )

        except Exception as e:
            logger.error(f"Error parsing {file_path}: {e}")
            return None

    def _parse_with_tree_sitter(
        self,
        source_bytes: bytes,
        source_code: str,
        file_path: str,
    ) -> tuple[List[ParsedJSFunction], List[ParsedJSClass], List[str]]:
        """Extract declarations from the JavaScript grammar before regex fallback."""
        parser = self._parser_for_file(file_path)
        if parser is None:
            return [], [], []

        functions: List[ParsedJSFunction] = []
        classes: List[ParsedJSClass] = []
        parse_errors: List[str] = []

        try:
            tree = parser.parse(source_bytes)
        except Exception as exc:
            logger.debug(f"Tree-sitter JS parse failed for {file_path}: {exc}")
            return [], [], ["Tree-sitter JavaScript parse failed; regex fallback applied"]

        if tree.root_node.has_error:
            parse_errors.append("Tree-sitter JavaScript parse errors detected; regex fallback applied")

        def visit(node: Node):
            if node.type in {"function_declaration", "generator_function_declaration"}:
                func = self._parse_tree_sitter_function(node, source_bytes, source_code, file_path)
                if func:
                    self._append_function(functions, func)
            elif node.type == "variable_declarator":
                func = self._parse_tree_sitter_variable_function(node, source_bytes, source_code, file_path)
                if func:
                    self._append_function(functions, func)
            elif node.type == "class_declaration":
                cls = self._parse_tree_sitter_class(node, source_bytes, source_code, file_path)
                if cls:
                    self._append_class(classes, cls)
            elif node.type in {"interface_declaration", "type_alias_declaration", "enum_declaration"}:
                cls = self._parse_tree_sitter_type_symbol(node, source_bytes, source_code, file_path)
                if cls:
                    self._append_class(classes, cls)

            for child in node.children:
                visit(child)

        visit(tree.root_node)
        return functions, classes, parse_errors

    def _parser_for_file(self, file_path: str) -> Optional[Parser]:
        suffix = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
        if suffix == "ts":
            return self.typescript_parser or self.parser
        if suffix in {"tsx", "jsx"}:
            return self.tsx_parser or self.parser
        return self.parser

    def _parse_tree_sitter_function(
        self,
        node: Node,
        source_bytes: bytes,
        source_code: str,
        file_path: str,
    ) -> Optional[ParsedJSFunction]:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return None
        name = self._node_text(source_bytes, name_node)
        if not name:
            return None
        code_node = self._export_or_self(node)
        return ParsedJSFunction(
            name=name,
            code=self._node_text(source_bytes, code_node),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=self._find_jsdoc(source_code, self._byte_to_char_offset(source_bytes, code_node.start_byte)),
            file_path=file_path,
        )

    def _parse_tree_sitter_variable_function(
        self,
        node: Node,
        source_bytes: bytes,
        source_code: str,
        file_path: str,
    ) -> Optional[ParsedJSFunction]:
        value_node = node.child_by_field_name("value")
        if value_node is None or value_node.type not in {"arrow_function", "function_expression", "generator_function"}:
            return None

        name_node = node.child_by_field_name("name")
        if not name_node:
            return None
        name = self._node_text(source_bytes, name_node)
        if not name:
            return None

        code_node = self._declaration_statement_node(node)
        return ParsedJSFunction(
            name=name,
            code=self._node_text(source_bytes, code_node),
            start_line=code_node.start_point[0] + 1,
            end_line=code_node.end_point[0] + 1,
            docstring=self._find_jsdoc(source_code, self._byte_to_char_offset(source_bytes, code_node.start_byte)),
            file_path=file_path,
        )

    def _parse_tree_sitter_class(
        self,
        node: Node,
        source_bytes: bytes,
        source_code: str,
        file_path: str,
    ) -> Optional[ParsedJSClass]:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return None
        name = self._node_text(source_bytes, name_node)
        if not name:
            return None

        code_node = self._export_or_self(node)
        methods = self._extract_tree_sitter_methods(node, source_bytes, source_code, file_path)
        return ParsedJSClass(
            name=name,
            code=self._node_text(source_bytes, code_node),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=self._find_jsdoc(source_code, self._byte_to_char_offset(source_bytes, code_node.start_byte)),
            methods=methods,
            file_path=file_path,
        )

    def _parse_tree_sitter_type_symbol(
        self,
        node: Node,
        source_bytes: bytes,
        source_code: str,
        file_path: str,
    ) -> Optional[ParsedJSClass]:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return None
        name = self._node_text(source_bytes, name_node)
        if not name:
            return None

        code_node = self._export_or_self(node)
        return ParsedJSClass(
            name=name,
            code=self._node_text(source_bytes, code_node),
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=self._find_jsdoc(source_code, self._byte_to_char_offset(source_bytes, code_node.start_byte)),
            methods=[],
            file_path=file_path,
        )

    def _extract_tree_sitter_methods(
        self,
        class_node: Node,
        source_bytes: bytes,
        source_code: str,
        file_path: str,
    ) -> List[ParsedJSFunction]:
        methods: List[ParsedJSFunction] = []
        body = class_node.child_by_field_name("body")
        if body is None:
            return methods

        for child in body.children:
            if child.type != "method_definition":
                continue
            name_node = child.child_by_field_name("name")
            if not name_node:
                continue
            name = self._node_text(source_bytes, name_node)
            if not name:
                continue
            self._append_function(methods, ParsedJSFunction(
                name=name,
                code=self._node_text(source_bytes, child),
                start_line=child.start_point[0] + 1,
                end_line=child.end_point[0] + 1,
                docstring=self._find_jsdoc(source_code, self._byte_to_char_offset(source_bytes, child.start_byte)),
                file_path=file_path,
            ))

        return methods

    def _declaration_statement_node(self, node: Node) -> Node:
        current = node
        parent = current.parent
        while parent is not None and parent.type not in {"program", "statement_block", "class_body"}:
            current = parent
            parent = current.parent
        return self._export_or_self(current)

    def _export_or_self(self, node: Node) -> Node:
        parent = node.parent
        if parent is not None and parent.type == "export_statement":
            return parent
        return node

    def _node_text(self, source_bytes: bytes, node: Node) -> str:
        return source_bytes[node.start_byte:node.end_byte].decode("utf-8", errors="replace")

    def _byte_to_char_offset(self, source_bytes: bytes, byte_offset: int) -> int:
        return len(source_bytes[:byte_offset].decode("utf-8", errors="replace"))

    def _append_function(self, functions: List[ParsedJSFunction], function: ParsedJSFunction):
        if any(existing.name == function.name and existing.start_line == function.start_line for existing in functions):
            return
        functions.append(function)

    def _append_class(self, classes: List[ParsedJSClass], cls: ParsedJSClass):
        if any(existing.name == cls.name and existing.start_line == cls.start_line for existing in classes):
            return
        classes.append(cls)

    def _extract_block(self, source: str, brace_pos: int, start_line: int) -> tuple:
        """Extract a code block starting from opening brace"""
        if brace_pos >= len(source) or source[brace_pos] not in '{(':
            return "", start_line

        open_char = source[brace_pos]
        close_char = '}' if open_char == '{' else ')'

        depth = 1
        pos = brace_pos + 1
        in_string = False
        string_char = None

        while pos < len(source) and depth > 0:
            char = source[pos]

            # Handle strings
            if char in '"\'`' and (pos == 0 or source[pos-1] != '\\'):
                if not in_string:
                    in_string = True
                    string_char = char
                elif char == string_char:
                    in_string = False

            if not in_string:
                if char == open_char:
                    depth += 1
                elif char == close_char:
                    depth -= 1

            pos += 1

        # Get the block
        block_start = source[:brace_pos].rfind('\n') + 1
        code = source[block_start:pos]
        end_line = start_line + code.count('\n')

        return code, end_line

    def _find_jsdoc(self, source: str, pos: int) -> Optional[str]:
        """Find JSDoc comment preceding position"""
        # Look back for /**
        search_start = max(0, pos - 500)
        search_text = source[search_start:pos]

        matches = list(re.finditer(r'/\*\*\s*([\s\S]*?)\s*\*/', search_text))
        if matches and not search_text[matches[-1].end():].strip():
            match = matches[-1]
            # Clean up the docstring
            doc = match.group(1)
            # Remove * at start of lines
            doc = re.sub(r'^\s*\*\s?', '', doc, flags=re.MULTILINE)
            # Remove @param, @returns etc for brief description
            lines = doc.split('\n')
            brief = []
            for line in lines:
                if line.strip().startswith('@'):
                    break
                brief.append(line.strip())
            return ' '.join(brief).strip() or None

        return None

    def _extract_methods(self, class_code: str, class_start: int, file_path: str) -> List[ParsedJSFunction]:
        """Extract methods from class code"""
        methods = []

        # Pattern for class methods
        method_pattern = r'(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{'

        for match in re.finditer(method_pattern, class_code, re.MULTILINE):
            name = match.group(1)
            if name in ['constructor', 'if', 'for', 'while', 'switch', 'catch']:
                if name != 'constructor':
                    continue

            start_pos = match.start()
            start_line = class_start + class_code[:start_pos].count('\n')

            # Get method code
            code, end_line = self._extract_block(class_code, match.end() - 1, start_line)

            methods.append(ParsedJSFunction(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                file_path=file_path
            ))

        return methods
