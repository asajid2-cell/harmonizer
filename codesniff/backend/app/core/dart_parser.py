"""Dart code parser using a conservative declaration scanner."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import List, Optional

from loguru import logger


@dataclass
class ParsedDartSymbol:
    """Represents a parsed Dart function, method, or property."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None


@dataclass
class ParsedDartType:
    """Represents a parsed Dart class, mixin, enum, or extension."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None
    members: List[ParsedDartSymbol] = None

    def __post_init__(self):
        if self.members is None:
            self.members = []


@dataclass
class ParsedDartFile:
    """Represents a fully parsed Dart file."""

    file_path: str
    functions: List[ParsedDartSymbol]
    properties: List[ParsedDartSymbol]
    types: List[ParsedDartType]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class DartParser:
    """Parser for Dart source code using bounded regex and brace scanning."""

    TYPE_PATTERN = re.compile(
        r"^\s*(?:(?:abstract|base|final|interface|sealed)\s+)?"
        r"(?P<kind>class|mixin|enum)\s+(?P<name>[A-Za-z_]\w*)\b"
    )
    EXTENSION_PATTERN = re.compile(
        r"^\s*extension(?:\s+(?P<name>[A-Za-z_]\w*))?\s+on\s+(?P<target>[A-Za-z_][\w.<>, ?]*)"
    )
    FUNCTION_PATTERN = re.compile(
        r"^\s*(?:(?:external|static|factory|operator|const|final|late|abstract|override|async)\s+)*"
        r"(?:[A-Za-z_][\w.<>, ?\[\]]*\s+)?(?P<name>[A-Za-z_]\w*)\s*\("
    )
    PROPERTY_PATTERN = re.compile(
        r"^\s*(?:(?:external|static|final|late|const)\s+)*"
        r"(?:var\s+|[A-Za-z_][\w.<>, ?\[\]]+\s+)?(?P<name>[A-Za-z_]\w*)\s*(?:=|;|,)"
    )
    CONTROL_KEYWORDS = {
        "assert",
        "catch",
        "for",
        "if",
        "return",
        "switch",
        "while",
    }

    def parse_file(self, file_path: str) -> Optional[ParsedDartFile]:
        """Parse a Dart file and extract common declarations."""
        try:
            source_bytes = Path(file_path).read_bytes()
            source_code = source_bytes.decode("utf-8-sig")
            lines = source_code.splitlines()

            types = self._extract_types(lines)
            occupied_ranges = [(item.start_line, item.end_line) for item in types]
            functions, properties = self._extract_top_level_symbols(lines, occupied_ranges)

            return ParsedDartFile(
                file_path=file_path,
                functions=functions,
                properties=properties,
                types=types,
                total_lines=max(1, len(lines)),
            )
        except Exception as e:
            logger.error(f"Failed to parse Dart file {file_path}: {e}")
            return None

    def _extract_types(self, lines: List[str]) -> List[ParsedDartType]:
        types: List[ParsedDartType] = []
        line_index = 0
        while line_index < len(lines):
            line = lines[line_index]
            match = self.TYPE_PATTERN.match(line)
            extension_match = self.EXTENSION_PATTERN.match(line)
            if not match and not extension_match:
                line_index += 1
                continue

            start_line = line_index + 1
            kind = match.group("kind") if match else "extension"
            if match:
                name = match.group("name")
            else:
                name = extension_match.group("name") or f"extension on {extension_match.group('target').strip()}"

            end_line = self._declaration_end_line(lines, line_index)
            code = self._slice_lines(lines, start_line, end_line)
            members = self._extract_members(lines, start_line, end_line, type_name=name)
            types.append(ParsedDartType(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                kind=kind,
                docstring=self._get_preceding_comment(lines, start_line),
                members=members,
            ))
            line_index = max(line_index + 1, end_line)

        return types

    def _extract_members(
        self,
        lines: List[str],
        start_line: int,
        end_line: int,
        type_name: str,
    ) -> List[ParsedDartSymbol]:
        members: List[ParsedDartSymbol] = []
        index = start_line
        brace_depth = 1
        while index < end_line - 1:
            line = lines[index]
            stripped = line.strip()
            current_depth = brace_depth
            brace_depth += self._brace_delta(line)
            if current_depth != 1 or not stripped or self._is_comment_line(stripped):
                index += 1
                continue

            function = self._parse_function_symbol(lines, index, "method", allowed_constructor=type_name)
            if function:
                members.append(function)
                index = function.end_line
                continue

            property_symbol = self._parse_property_symbol(lines, index)
            if property_symbol:
                members.append(property_symbol)

            index += 1
        return members

    def _extract_top_level_symbols(
        self,
        lines: List[str],
        occupied_ranges: List[tuple[int, int]],
    ) -> tuple[List[ParsedDartSymbol], List[ParsedDartSymbol]]:
        functions: List[ParsedDartSymbol] = []
        properties: List[ParsedDartSymbol] = []
        index = 0
        while index < len(lines):
            line_no = index + 1
            if self._line_in_ranges(line_no, occupied_ranges):
                index += 1
                continue

            function = self._parse_function_symbol(lines, index, "function")
            if function:
                functions.append(function)
                index = function.end_line
                continue

            property_symbol = self._parse_property_symbol(lines, index)
            if property_symbol:
                properties.append(property_symbol)

            index += 1
        return functions, properties

    def _parse_function_symbol(
        self,
        lines: List[str],
        index: int,
        kind: str,
        allowed_constructor: Optional[str] = None,
    ) -> Optional[ParsedDartSymbol]:
        stripped = lines[index].strip()
        if not stripped or self._is_comment_line(stripped):
            return None
        match = self.FUNCTION_PATTERN.match(lines[index])
        if not match:
            return None
        name = match.group("name")
        if name in self.CONTROL_KEYWORDS:
            return None
        if name and name[0].islower() is False and kind == "function" and name != "main":
            return None
        if allowed_constructor and name == allowed_constructor:
            kind = "constructor"

        start_line = index + 1
        end_line = self._declaration_end_line(lines, index)
        return ParsedDartSymbol(
            name=name,
            code=self._slice_lines(lines, start_line, end_line),
            start_line=start_line,
            end_line=end_line,
            kind=kind,
            docstring=self._get_preceding_comment(lines, start_line),
        )

    def _parse_property_symbol(self, lines: List[str], index: int) -> Optional[ParsedDartSymbol]:
        stripped = lines[index].strip()
        if not stripped or self._is_comment_line(stripped) or "(" in stripped:
            return None
        match = self.PROPERTY_PATTERN.match(lines[index])
        if not match:
            return None
        name = match.group("name")
        if name in self.CONTROL_KEYWORDS:
            return None
        start_line = index + 1
        end_line = self._declaration_end_line(lines, index)
        return ParsedDartSymbol(
            name=name,
            code=self._slice_lines(lines, start_line, end_line),
            start_line=start_line,
            end_line=end_line,
            kind="property",
            docstring=self._get_preceding_comment(lines, start_line),
        )

    def _declaration_end_line(self, lines: List[str], start_index: int) -> int:
        depth = 0
        saw_open = False
        for index in range(start_index, len(lines)):
            line = lines[index]
            depth += self._brace_delta(line)
            if "{" in line:
                saw_open = True
            if saw_open and depth <= 0:
                return index + 1
            if not saw_open and ";" in line:
                return index + 1
            if not saw_open and "=>" in line and ";" in line:
                return index + 1
        return start_index + 1

    def _get_preceding_comment(self, lines: List[str], start_line: int) -> Optional[str]:
        comments = []
        index = start_line - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped:
                break
            if stripped.startswith("///") or stripped.startswith("//"):
                comments.insert(0, self._clean_comment(stripped))
                index -= 1
                continue
            if stripped.endswith("*/"):
                block = [stripped]
                index -= 1
                while index >= 0:
                    block.insert(0, lines[index].strip())
                    if lines[index].strip().startswith("/*"):
                        break
                    index -= 1
                comments.insert(0, self._clean_comment("\n".join(block)))
            break
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
        parts = []
        for line in stripped.splitlines():
            line = line.strip()
            if line.startswith("*"):
                line = line[1:].strip()
            if line:
                parts.append(line)
        return " ".join(parts).strip()

    def _slice_lines(self, lines: List[str], start_line: int, end_line: int) -> str:
        return "\n".join(lines[start_line - 1:end_line])

    def _line_in_ranges(self, line_no: int, ranges: List[tuple[int, int]]) -> bool:
        return any(start <= line_no <= end for start, end in ranges)

    def _is_comment_line(self, stripped: str) -> bool:
        return stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*")

    def _brace_delta(self, line: str) -> int:
        scrubbed = self._strip_string_literals(line)
        return scrubbed.count("{") - scrubbed.count("}")

    def _strip_string_literals(self, line: str) -> str:
        return re.sub(r"(['\"])(?:\\.|(?!\1).)*\1", '""', line)
