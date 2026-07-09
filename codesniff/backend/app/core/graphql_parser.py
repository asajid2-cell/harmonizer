"""GraphQL schema and operation parser using a conservative definition scanner."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import List, Optional

from loguru import logger


@dataclass
class ParsedGraphQLDefinition:
    """Represents a parsed GraphQL schema or operation definition."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None


@dataclass
class ParsedGraphQLFile:
    """Represents a fully parsed GraphQL file."""

    file_path: str
    definitions: List[ParsedGraphQLDefinition]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class GraphQLParser:
    """Parser for common GraphQL schema and operation documents."""

    DEFINITION_PATTERN = re.compile(
        r"^\s*(?P<extend>extend\s+)?"
        r"(?P<kind>schema|type|input|interface|enum|union|scalar|directive)\b"
        r"(?:\s+(?P<name>@?[A-Za-z_][A-Za-z0-9_]*))?"
    )
    OPERATION_PATTERN = re.compile(
        r"^\s*(?P<kind>query|mutation|subscription)\b(?:\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*))?"
    )
    FRAGMENT_PATTERN = re.compile(
        r"^\s*fragment\s+(?P<name>[A-Za-z_][A-Za-z0-9_]*)\s+on\s+(?P<target>[A-Za-z_][A-Za-z0-9_]*)"
    )

    def parse_file(self, file_path: str) -> Optional[ParsedGraphQLFile]:
        """Parse a GraphQL document and extract definitions."""
        try:
            source = Path(file_path).read_text(encoding="utf-8-sig", errors="replace")
            lines = source.splitlines()
            definitions = self._extract_definitions(lines)
            return ParsedGraphQLFile(
                file_path=file_path,
                definitions=definitions,
                total_lines=max(1, len(lines)),
            )
        except Exception as e:
            logger.error(f"Failed to parse GraphQL file {file_path}: {e}")
            return None

    def _extract_definitions(self, lines: List[str]) -> List[ParsedGraphQLDefinition]:
        definitions: List[ParsedGraphQLDefinition] = []
        index = 0
        while index < len(lines):
            stripped = lines[index].strip()
            if not stripped or stripped.startswith("#"):
                index += 1
                continue

            definition = self._definition_from_line(lines, index)
            if definition:
                definitions.append(definition)
                index = definition.end_line
                continue
            index += 1

        return definitions

    def _definition_from_line(
        self,
        lines: List[str],
        index: int,
    ) -> Optional[ParsedGraphQLDefinition]:
        line = lines[index]
        match = self.FRAGMENT_PATTERN.match(line)
        if match:
            return self._build_definition(
                lines,
                index,
                kind="fragment",
                name=match.group("name"),
            )

        match = self.OPERATION_PATTERN.match(line)
        if match:
            kind = match.group("kind")
            name = match.group("name") or f"anonymous {kind} line {index + 1}"
            return self._build_definition(lines, index, kind=kind, name=name)

        match = self.DEFINITION_PATTERN.match(line)
        if not match:
            return None

        kind = match.group("kind")
        name = match.group("name") or kind
        if match.group("extend"):
            kind = f"extend_{kind}"
            name = f"extend {name}"

        return self._build_definition(lines, index, kind=kind, name=name)

    def _build_definition(
        self,
        lines: List[str],
        index: int,
        kind: str,
        name: str,
    ) -> ParsedGraphQLDefinition:
        start_line = index + 1
        end_line = self._definition_end_line(lines, index)
        return ParsedGraphQLDefinition(
            name=name,
            code=self._slice_lines(lines, start_line, end_line),
            start_line=start_line,
            end_line=end_line,
            kind=kind,
            docstring=self._get_preceding_comment(lines, start_line),
        )

    def _definition_end_line(self, lines: List[str], start_index: int) -> int:
        depth = 0
        saw_open = False
        for index in range(start_index, len(lines)):
            line = self._strip_string_literals(lines[index])
            depth += line.count("{") - line.count("}")
            if "{" in line:
                saw_open = True
            if saw_open and depth <= 0:
                return index + 1
            if not saw_open and index > start_index:
                return index
        return start_index + 1

    def _get_preceding_comment(self, lines: List[str], start_line: int) -> Optional[str]:
        comments = []
        index = start_line - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped:
                break
            if stripped.startswith("#"):
                comments.insert(0, stripped[1:].strip())
                index -= 1
                continue
            break
        cleaned = [comment for comment in comments if comment]
        return "\n".join(cleaned) if cleaned else None

    def _slice_lines(self, lines: List[str], start_line: int, end_line: int) -> str:
        return "\n".join(lines[start_line - 1:end_line])

    def _strip_string_literals(self, line: str) -> str:
        return re.sub(r'"""(?:.|\n)*?"""|"[^"]*"', '""', line)
