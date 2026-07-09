"""PowerShell parser using a conservative declaration scanner."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import List, Optional

from loguru import logger


@dataclass
class ParsedPowerShellSymbol:
    """Represents a parsed PowerShell function, method, property, or variable."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None


@dataclass
class ParsedPowerShellType:
    """Represents a parsed PowerShell class, enum, or configuration."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None
    members: List[ParsedPowerShellSymbol] = None

    def __post_init__(self):
        if self.members is None:
            self.members = []


@dataclass
class ParsedPowerShellFile:
    """Represents a fully parsed PowerShell script or module."""

    file_path: str
    functions: List[ParsedPowerShellSymbol]
    variables: List[ParsedPowerShellSymbol]
    types: List[ParsedPowerShellType]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class PowerShellParser:
    """Parser for common PowerShell declarations."""

    TYPE_PATTERN = re.compile(r"^\s*(?P<kind>class|enum|configuration)\s+(?P<name>[A-Za-z_][\w.]*)\b", re.IGNORECASE)
    FUNCTION_PATTERN = re.compile(
        r"^\s*(?P<kind>function|filter|workflow)\s+"
        r"(?P<name>(?:(?:global|script|local|private):)?[A-Za-z_][\w.-]*)\b",
        re.IGNORECASE,
    )
    VARIABLE_PATTERN = re.compile(
        r"^\s*(?:\[[^\]]+\]\s*)?\$(?P<name>(?:(?:global|script|local|private):)?[A-Za-z_]\w*)\s*=",
        re.IGNORECASE,
    )
    METHOD_PATTERN = re.compile(
        r"^\s*(?:(?:static|hidden|final|abstract)\s+)*"
        r"(?:\[[^\]]+\]\s+)?(?P<name>[A-Za-z_][\w-]*)\s*\(",
        re.IGNORECASE,
    )
    PROPERTY_PATTERN = re.compile(
        r"^\s*(?:(?:static|hidden)\s+)*(?:\[[^\]]+\]\s*)?\$(?P<name>[A-Za-z_]\w*)\b",
        re.IGNORECASE,
    )
    CONTROL_KEYWORDS = {"catch", "data", "do", "dynamicparam", "else", "elseif", "finally", "for", "foreach", "if", "param", "process", "switch", "trap", "while"}

    def parse_file(self, file_path: str) -> Optional[ParsedPowerShellFile]:
        """Parse a PowerShell file and extract common declarations."""
        try:
            source = Path(file_path).read_text(encoding="utf-8-sig", errors="replace")
            lines = source.splitlines()
            functions, variables, types = self._extract_top_level_declarations(lines)
            return ParsedPowerShellFile(
                file_path=file_path,
                functions=functions,
                variables=variables,
                types=types,
                total_lines=max(1, len(lines)),
            )
        except Exception as e:
            logger.error(f"Failed to parse PowerShell file {file_path}: {e}")
            return None

    def _extract_top_level_declarations(
        self,
        lines: List[str],
    ) -> tuple[List[ParsedPowerShellSymbol], List[ParsedPowerShellSymbol], List[ParsedPowerShellType]]:
        functions: List[ParsedPowerShellSymbol] = []
        variables: List[ParsedPowerShellSymbol] = []
        types: List[ParsedPowerShellType] = []

        index = 0
        depth = 0
        in_block_comment = False
        while index < len(lines):
            line = lines[index]
            stripped, in_block_comment = self._strip_comments_for_detection(line, in_block_comment)
            current_depth = depth

            if current_depth == 0 and stripped:
                type_match = self.TYPE_PATTERN.match(stripped)
                if type_match:
                    start_line = index + 1
                    end_line = self._block_end_line(lines, index)
                    kind = type_match.group("kind").lower()
                    name = type_match.group("name")
                    types.append(ParsedPowerShellType(
                        name=name,
                        code=self._slice_lines(lines, start_line, end_line),
                        start_line=start_line,
                        end_line=end_line,
                        kind=kind,
                        docstring=self._get_preceding_comment(lines, start_line),
                        members=self._extract_type_members(lines, start_line, end_line, name),
                    ))
                    index = max(index + 1, end_line)
                    depth = 0
                    in_block_comment = False
                    continue

                function_match = self.FUNCTION_PATTERN.match(stripped)
                if function_match:
                    start_line = index + 1
                    end_line = self._block_end_line(lines, index)
                    functions.append(ParsedPowerShellSymbol(
                        name=self._clean_scoped_name(function_match.group("name")),
                        code=self._slice_lines(lines, start_line, end_line),
                        start_line=start_line,
                        end_line=end_line,
                        kind=function_match.group("kind").lower(),
                        docstring=self._get_preceding_comment(lines, start_line),
                    ))
                    index = max(index + 1, end_line)
                    depth = 0
                    in_block_comment = False
                    continue

                variable_match = self.VARIABLE_PATTERN.match(stripped)
                if variable_match:
                    start_line = index + 1
                    variables.append(ParsedPowerShellSymbol(
                        name=self._clean_scoped_name(variable_match.group("name")),
                        code=lines[index],
                        start_line=start_line,
                        end_line=start_line,
                        kind="variable",
                        docstring=self._get_preceding_comment(lines, start_line),
                    ))

            depth = max(0, depth + self._brace_delta(line))
            index += 1

        return functions, variables, types

    def _extract_type_members(
        self,
        lines: List[str],
        start_line: int,
        end_line: int,
        type_name: str,
    ) -> List[ParsedPowerShellSymbol]:
        members: List[ParsedPowerShellSymbol] = []
        index = start_line - 1
        depth = 0
        in_block_comment = False
        while index < end_line:
            line = lines[index]
            stripped, in_block_comment = self._strip_comments_for_detection(line, in_block_comment)
            current_depth = depth

            if current_depth == 1 and stripped:
                method = self._parse_method(lines, index, type_name)
                if method:
                    members.append(method)
                    index = method.end_line
                    depth = 1
                    in_block_comment = False
                    continue

                property_symbol = self._parse_property(lines, index)
                if property_symbol:
                    members.append(property_symbol)

            depth = max(0, depth + self._brace_delta(line))
            index += 1
        return members

    def _parse_method(
        self,
        lines: List[str],
        index: int,
        type_name: str,
    ) -> Optional[ParsedPowerShellSymbol]:
        match = self.METHOD_PATTERN.match(lines[index])
        if not match:
            return None
        name = match.group("name")
        lower_name = name.lower()
        if lower_name in self.CONTROL_KEYWORDS:
            return None
        kind = "constructor" if name == type_name else "method"
        start_line = index + 1
        end_line = self._block_end_line(lines, index)
        return ParsedPowerShellSymbol(
            name=name,
            code=self._slice_lines(lines, start_line, end_line),
            start_line=start_line,
            end_line=end_line,
            kind=kind,
            docstring=self._get_preceding_comment(lines, start_line),
        )

    def _parse_property(self, lines: List[str], index: int) -> Optional[ParsedPowerShellSymbol]:
        stripped = lines[index].strip()
        if not stripped or stripped.startswith("$this."):
            return None
        match = self.PROPERTY_PATTERN.match(stripped)
        if not match:
            return None
        start_line = index + 1
        return ParsedPowerShellSymbol(
            name=match.group("name"),
            code=lines[index],
            start_line=start_line,
            end_line=start_line,
            kind="property",
            docstring=self._get_preceding_comment(lines, start_line),
        )

    def _block_end_line(self, lines: List[str], start_index: int) -> int:
        depth = 0
        saw_open = False
        in_block_comment = False
        for index in range(start_index, len(lines)):
            line, in_block_comment = self._strip_comments_for_detection(lines[index], in_block_comment)
            line = self._strip_string_literals(line)
            depth += line.count("{") - line.count("}")
            if "{" in line:
                saw_open = True
            if saw_open and depth <= 0:
                return index + 1
        return start_index + 1

    def _get_preceding_comment(self, lines: List[str], start_line: int) -> Optional[str]:
        comments = []
        index = start_line - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped:
                break
            if stripped == "#>":
                block = []
                index -= 1
                while index >= 0:
                    block_line = lines[index].strip()
                    if block_line.startswith("<#"):
                        text = block_line[2:].strip()
                        if text:
                            block.insert(0, text)
                        break
                    block.insert(0, self._clean_comment_text(block_line))
                    index -= 1
                comments = block + comments
                index -= 1
                continue
            if stripped.startswith("#"):
                comments.insert(0, self._clean_comment_text(stripped))
                index -= 1
                continue
            break
        cleaned = [comment for comment in comments if comment]
        return "\n".join(cleaned) if cleaned else None

    def _strip_comments_for_detection(self, line: str, in_block_comment: bool) -> tuple[str, bool]:
        text = line
        if in_block_comment:
            if "#>" in text:
                text = text.split("#>", 1)[1]
                in_block_comment = False
            else:
                return "", True
        if "<#" in text:
            before, after = text.split("<#", 1)
            if "#>" in after:
                text = before + after.split("#>", 1)[1]
            else:
                return before.strip(), True
        stripped_literals = self._strip_string_literals(text)
        if "#" in stripped_literals:
            text = text[:stripped_literals.index("#")]
        return text.strip(), in_block_comment

    def _clean_comment_text(self, text: str) -> str:
        stripped = text.strip()
        if stripped.startswith("<#"):
            stripped = stripped[2:]
        if stripped.endswith("#>"):
            stripped = stripped[:-2]
        if stripped.startswith("#"):
            stripped = stripped[1:]
        return stripped.strip()

    def _slice_lines(self, lines: List[str], start_line: int, end_line: int) -> str:
        return "\n".join(lines[start_line - 1:end_line])

    def _brace_delta(self, line: str) -> int:
        stripped = self._strip_string_literals(line)
        return stripped.count("{") - stripped.count("}")

    def _strip_string_literals(self, line: str) -> str:
        line = re.sub(r"'(?:''|[^'])*'", "''", line)
        return re.sub(r'"(?:`.|[^"])*"', '""', line)

    def _clean_scoped_name(self, name: str) -> str:
        if ":" in name:
            return name.split(":", 1)[1]
        return name
