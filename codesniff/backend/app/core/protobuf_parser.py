"""Protocol Buffers parser using a conservative definition scanner."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import List, Optional

from loguru import logger


@dataclass
class ParsedProtoRPC:
    """Represents a parsed protobuf service RPC."""

    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedProtoDefinition:
    """Represents a parsed protobuf message, enum, or service."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None
    rpcs: List[ParsedProtoRPC] = None

    def __post_init__(self):
        if self.rpcs is None:
            self.rpcs = []


@dataclass
class ParsedProtoFile:
    """Represents a fully parsed protobuf file."""

    file_path: str
    definitions: List[ParsedProtoDefinition]
    total_lines: int
    package: Optional[str] = None
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class ProtobufParser:
    """Parser for common protobuf schema declarations."""

    DEFINITION_PATTERN = re.compile(r"^\s*(?P<kind>message|enum|service)\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\b")
    RPC_PATTERN = re.compile(r"^\s*rpc\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s*\(")
    PACKAGE_PATTERN = re.compile(r"^\s*package\s+([A-Za-z_][A-Za-z0-9_.]*)\s*;")

    def parse_file(self, file_path: str) -> Optional[ParsedProtoFile]:
        """Parse a protobuf file and extract top-level declarations."""
        try:
            source = Path(file_path).read_text(encoding="utf-8-sig", errors="replace")
            lines = source.splitlines()
            package = self._package_name(lines)
            definitions = self._extract_definitions(lines)
            return ParsedProtoFile(
                file_path=file_path,
                definitions=definitions,
                total_lines=max(1, len(lines)),
                package=package,
            )
        except Exception as e:
            logger.error(f"Failed to parse protobuf file {file_path}: {e}")
            return None

    def _package_name(self, lines: List[str]) -> Optional[str]:
        for line in lines:
            match = self.PACKAGE_PATTERN.match(line)
            if match:
                return match.group(1)
        return None

    def _extract_definitions(self, lines: List[str]) -> List[ParsedProtoDefinition]:
        definitions: List[ParsedProtoDefinition] = []
        index = 0
        while index < len(lines):
            stripped = lines[index].strip()
            if not stripped or self._is_comment_line(stripped):
                index += 1
                continue

            match = self.DEFINITION_PATTERN.match(lines[index])
            if not match:
                index += 1
                continue

            start_line = index + 1
            end_line = self._block_end_line(lines, index)
            kind = match.group("kind")
            name = match.group("name")
            rpcs = self._extract_rpcs(lines, start_line, end_line) if kind == "service" else []
            definitions.append(ParsedProtoDefinition(
                name=name,
                code=self._slice_lines(lines, start_line, end_line),
                start_line=start_line,
                end_line=end_line,
                kind=kind,
                docstring=self._get_preceding_comment(lines, start_line),
                rpcs=rpcs,
            ))
            index = max(index + 1, end_line)

        return definitions

    def _extract_rpcs(self, lines: List[str], start_line: int, end_line: int) -> List[ParsedProtoRPC]:
        rpcs: List[ParsedProtoRPC] = []
        for index in range(start_line, max(start_line, end_line - 1)):
            match = self.RPC_PATTERN.match(lines[index])
            if not match:
                continue
            rpc_start = index + 1
            rpc_end = self._statement_end_line(lines, index)
            rpcs.append(ParsedProtoRPC(
                name=match.group("name"),
                code=self._slice_lines(lines, rpc_start, rpc_end),
                start_line=rpc_start,
                end_line=rpc_end,
                docstring=self._get_preceding_comment(lines, rpc_start),
            ))
        return rpcs

    def _block_end_line(self, lines: List[str], start_index: int) -> int:
        depth = 0
        saw_open = False
        for index in range(start_index, len(lines)):
            line = self._strip_string_literals(lines[index])
            depth += line.count("{") - line.count("}")
            if "{" in line:
                saw_open = True
            if saw_open and depth <= 0:
                return index + 1
        return start_index + 1

    def _statement_end_line(self, lines: List[str], start_index: int) -> int:
        depth = 0
        for index in range(start_index, len(lines)):
            line = self._strip_string_literals(lines[index])
            depth += line.count("{") - line.count("}")
            if ";" in line and depth <= 0:
                return index + 1
            if "}" in line and depth <= 0:
                return index + 1
        return start_index + 1

    def _get_preceding_comment(self, lines: List[str], start_line: int) -> Optional[str]:
        comments = []
        index = start_line - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped:
                break
            if stripped.startswith("//"):
                comments.insert(0, stripped[2:].strip())
                index -= 1
                continue
            if stripped.startswith("/*") or stripped.startswith("*") or stripped.endswith("*/"):
                comments.insert(0, self._clean_block_comment(stripped))
                index -= 1
                continue
            break
        cleaned = [comment for comment in comments if comment]
        return "\n".join(cleaned) if cleaned else None

    def _clean_block_comment(self, text: str) -> str:
        stripped = text.strip()
        if stripped.startswith("/*") and stripped.endswith("*/"):
            stripped = stripped[2:-2]
        if stripped.startswith("*"):
            stripped = stripped[1:]
        return stripped.strip()

    def _slice_lines(self, lines: List[str], start_line: int, end_line: int) -> str:
        return "\n".join(lines[start_line - 1:end_line])

    def _is_comment_line(self, stripped: str) -> bool:
        return stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*")

    def _strip_string_literals(self, line: str) -> str:
        return re.sub(r'"(?:\\.|[^"])*"', '""', line)
