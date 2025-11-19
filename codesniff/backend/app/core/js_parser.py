"""Simple JavaScript/TypeScript parser using regex patterns"""

import re
from typing import List, Optional
from dataclasses import dataclass
from loguru import logger


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
    """Simple parser for JavaScript/TypeScript using regex"""

    def __init__(self):
        """Initialize JS parser"""
        # Pattern for functions: function name(...) { or const name = (...) => { or name(...) {
        self.function_patterns = [
            # function declarations
            r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{',
            # arrow functions assigned to const/let/var
            r'(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*=>\s*[{\(]',
            # method definitions in objects/classes
            r'^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*\{',
        ]

        # Pattern for classes
        self.class_pattern = r'(?:export\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?\s*(?:implements\s+[\w,\s]+)?\s*\{'

        # Pattern for JSDoc comments
        self.jsdoc_pattern = r'/\*\*\s*([\s\S]*?)\s*\*/'

        # Pattern for React components (function components)
        self.component_pattern = r'(?:export\s+)?(?:const|function)\s+(\w+)\s*(?::\s*(?:React\.)?FC(?:<[^>]+>)?)?\s*=?\s*\([^)]*\)\s*(?::\s*\w+(?:<[^>]+>)?)?\s*(?:=>)?\s*[{\(]'

        logger.info("JSParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedJSFile]:
        """
        Parse a JavaScript/TypeScript file

        Args:
            file_path: Path to the file

        Returns:
            ParsedJSFile object or None on error
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source_code = f.read()

            lines = source_code.split('\n')
            total_lines = len(lines)

            functions = []
            classes = []

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

                classes.append(ParsedJSClass(
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
                total_lines=total_lines
            )

        except Exception as e:
            logger.error(f"Error parsing {file_path}: {e}")
            return None

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

        match = re.search(r'/\*\*\s*([\s\S]*?)\s*\*/\s*$', search_text)
        if match:
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
