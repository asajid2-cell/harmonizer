"""Shader parser using lightweight heuristics for common shader languages."""

import re
from typing import List, Optional
from dataclasses import dataclass
from loguru import logger


CONTROL_KEYWORDS = {
    "if", "for", "while", "switch", "case", "default", "do", "else", "catch", "foreach"
}


@dataclass
class ParsedShaderFunction:
    """Represents a parsed shader function"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedShaderFile:
    """Represents a parsed shader file"""
    file_path: str
    functions: List[ParsedShaderFunction]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class ShaderParser:
    """Heuristic parser for GLSL/HLSL/WGSL/Metal/ShaderLab style shaders"""

    def __init__(self):
        logger.info("ShaderParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedShaderFile]:
        """Parse a shader file and extract functions"""
        try:
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Strip BOM if present
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode('utf-8', errors='replace')
            lines = source_code.split('\n')
            total_lines = len(lines)

            functions = self._extract_functions(source_code, lines)

            return ParsedShaderFile(
                file_path=file_path,
                functions=functions,
                total_lines=total_lines
            )

        except Exception as e:
            logger.error(f"Failed to parse shader file {file_path}: {e}")
            return None

    def _extract_functions(self, source_code: str, lines: List[str]) -> List[ParsedShaderFunction]:
        """Extract top-level function definitions from shader source"""
        functions: List[ParsedShaderFunction] = []
        seen = set()

        depths, masked = self._scan_states(source_code)
        pattern = re.compile(r'\b([A-Za-z_][A-Za-z0-9_]*)\s*\(', re.MULTILINE)

        for match in pattern.finditer(source_code):
            name = match.group(1)
            name_start = match.start(1)

            if name in CONTROL_KEYWORDS:
                continue

            if name_start < len(masked) and masked[name_start]:
                continue

            if name_start < len(depths) and depths[name_start] != 0:
                continue

            if self._is_member_call(source_code, name_start):
                continue

            paren_open = match.end() - 1
            paren_close = self._find_matching_paren(source_code, paren_open)
            if paren_close == -1:
                continue

            brace_start = self._find_body_brace(source_code, paren_close + 1)
            if brace_start == -1:
                continue

            brace_end = self._find_matching_brace(source_code, brace_start)
            if brace_end == -1:
                continue

            start_index = source_code.rfind('\n', 0, name_start)
            start_index = 0 if start_index == -1 else start_index + 1

            code = source_code[start_index:brace_end + 1]
            start_line = source_code.count('\n', 0, start_index) + 1
            end_line = source_code.count('\n', 0, brace_end) + 1
            docstring = self._extract_docstring(lines, start_line)

            key = (name, start_line, end_line)
            if key in seen:
                continue
            seen.add(key)

            functions.append(ParsedShaderFunction(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring
            ))

        return functions

    def _is_member_call(self, source_code: str, name_start: int) -> bool:
        """Check if the identifier looks like a member call"""
        idx = name_start - 1
        while idx >= 0 and source_code[idx].isspace():
            idx -= 1

        if idx < 0:
            return False

        if source_code[idx] == '.':
            return True

        if source_code[idx] == '>' and idx > 0 and source_code[idx - 1] == '-':
            return True

        if source_code[idx] == ':' and idx > 0 and source_code[idx - 1] == ':':
            return True

        return False

    def _scan_states(self, source_code: str):
        """Track brace depth and comment/string masking per index"""
        length = len(source_code)
        depths = [0] * (length + 1)
        masked = [False] * (length + 1)

        depth = 0
        in_line_comment = False
        in_block_comment = False
        in_string = None
        escape = False

        i = 0
        while i < length:
            depths[i] = depth
            masked[i] = in_line_comment or in_block_comment or in_string is not None

            ch = source_code[i]
            nxt = source_code[i + 1] if i + 1 < length else ''

            if in_line_comment:
                if ch == '\n':
                    in_line_comment = False
                i += 1
                continue

            if in_block_comment:
                if ch == '*' and nxt == '/':
                    in_block_comment = False
                    if i + 1 < length:
                        depths[i + 1] = depth
                        masked[i + 1] = True
                    i += 2
                    continue
                i += 1
                continue

            if in_string is not None:
                if escape:
                    escape = False
                elif ch == '\\':
                    escape = True
                elif ch == in_string:
                    in_string = None
                i += 1
                continue

            if ch == '/' and nxt == '/':
                in_line_comment = True
                if i + 1 < length:
                    depths[i + 1] = depth
                    masked[i + 1] = True
                i += 2
                continue

            if ch == '/' and nxt == '*':
                in_block_comment = True
                if i + 1 < length:
                    depths[i + 1] = depth
                    masked[i + 1] = True
                i += 2
                continue

            if ch in {'"', "'"}:
                in_string = ch
                i += 1
                continue

            if ch == '{':
                depth += 1
            elif ch == '}' and depth > 0:
                depth -= 1

            i += 1

        depths[length] = depth
        masked[length] = in_line_comment or in_block_comment or in_string is not None
        return depths, masked

    def _find_matching_paren(self, source_code: str, start_idx: int) -> int:
        """Find matching ')' for a '(' index"""
        depth = 0
        i = start_idx
        length = len(source_code)

        in_line_comment = False
        in_block_comment = False
        in_string = None
        escape = False

        while i < length:
            ch = source_code[i]
            nxt = source_code[i + 1] if i + 1 < length else ''

            if in_line_comment:
                if ch == '\n':
                    in_line_comment = False
                i += 1
                continue

            if in_block_comment:
                if ch == '*' and nxt == '/':
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue

            if in_string is not None:
                if escape:
                    escape = False
                elif ch == '\\':
                    escape = True
                elif ch == in_string:
                    in_string = None
                i += 1
                continue

            if ch == '/' and nxt == '/':
                in_line_comment = True
                i += 2
                continue

            if ch == '/' and nxt == '*':
                in_block_comment = True
                i += 2
                continue

            if ch in {'"', "'"}:
                in_string = ch
                i += 1
                continue

            if ch == '(':
                depth += 1
            elif ch == ')':
                depth -= 1
                if depth == 0:
                    return i
            i += 1

        return -1

    def _find_body_brace(self, source_code: str, start_idx: int) -> int:
        """Find the opening brace for a function body after a signature"""
        paren_depth = 0
        bracket_depth = 0

        i = start_idx
        length = len(source_code)

        in_line_comment = False
        in_block_comment = False
        in_string = None
        escape = False

        while i < length:
            ch = source_code[i]
            nxt = source_code[i + 1] if i + 1 < length else ''

            if in_line_comment:
                if ch == '\n':
                    in_line_comment = False
                i += 1
                continue

            if in_block_comment:
                if ch == '*' and nxt == '/':
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue

            if in_string is not None:
                if escape:
                    escape = False
                elif ch == '\\':
                    escape = True
                elif ch == in_string:
                    in_string = None
                i += 1
                continue

            if ch == '/' and nxt == '/':
                in_line_comment = True
                i += 2
                continue

            if ch == '/' and nxt == '*':
                in_block_comment = True
                i += 2
                continue

            if ch in {'"', "'"}:
                in_string = ch
                i += 1
                continue

            if ch == '(':
                paren_depth += 1
            elif ch == ')' and paren_depth > 0:
                paren_depth -= 1
            elif ch == '[':
                bracket_depth += 1
            elif ch == ']' and bracket_depth > 0:
                bracket_depth -= 1

            if paren_depth == 0 and bracket_depth == 0:
                if ch == ';':
                    return -1
                if ch == '{':
                    return i

            i += 1

        return -1

    def _find_matching_brace(self, source_code: str, start_idx: int) -> int:
        """Find matching '}' for a '{' index"""
        depth = 0
        i = start_idx
        length = len(source_code)

        in_line_comment = False
        in_block_comment = False
        in_string = None
        escape = False

        while i < length:
            ch = source_code[i]
            nxt = source_code[i + 1] if i + 1 < length else ''

            if in_line_comment:
                if ch == '\n':
                    in_line_comment = False
                i += 1
                continue

            if in_block_comment:
                if ch == '*' and nxt == '/':
                    in_block_comment = False
                    i += 2
                    continue
                i += 1
                continue

            if in_string is not None:
                if escape:
                    escape = False
                elif ch == '\\':
                    escape = True
                elif ch == in_string:
                    in_string = None
                i += 1
                continue

            if ch == '/' and nxt == '/':
                in_line_comment = True
                i += 2
                continue

            if ch == '/' and nxt == '*':
                in_block_comment = True
                i += 2
                continue

            if ch in {'"', "'"}:
                in_string = ch
                i += 1
                continue

            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return i

            i += 1

        return -1

    def _extract_docstring(self, lines: List[str], start_line: int) -> Optional[str]:
        """Extract comment above the function signature as docstring"""
        try:
            if start_line < 2:
                return None

            docstring_lines = []
            idx = start_line - 2

            while idx >= 0:
                line = lines[idx].strip()
                if line.startswith('//'):
                    docstring_lines.insert(0, line[2:].strip())
                    idx -= 1
                elif '*/' in line or '/*' in line:
                    docstring_lines.insert(0, line.replace('/*', '').replace('*/', '').replace('*', '').strip())
                    idx -= 1
                    if '/*' in line:
                        break
                else:
                    break

            if docstring_lines:
                return ' '.join(docstring_lines)
            return None

        except Exception:
            return None
