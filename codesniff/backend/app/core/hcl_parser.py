"""HCL and Terraform parser using a conservative block scanner."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import List, Optional

from loguru import logger


@dataclass
class ParsedHCLBlock:
    """Represents a parsed HCL or Terraform block."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    labels: List[str]
    docstring: Optional[str] = None


@dataclass
class ParsedHCLAttribute:
    """Represents a parsed top-level HCL attribute."""

    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedHCLFile:
    """Represents a fully parsed HCL/Terraform file."""

    file_path: str
    blocks: List[ParsedHCLBlock]
    attributes: List[ParsedHCLAttribute]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class HCLParser:
    """Parser for common HCL/Terraform blocks and attributes."""

    BLOCK_PATTERN = re.compile(
        r'^\s*(?P<kind>[A-Za-z_][\w-]*)'
        r'(?P<labels>(?:\s+"[^"]+"|\s+[A-Za-z_][\w-]*)*)\s*\{\s*(?:#.*)?$'
    )
    ATTRIBUTE_PATTERN = re.compile(r'^\s*(?P<name>[A-Za-z_][\w-]*)\s*=')

    def parse_file(self, file_path: str) -> Optional[ParsedHCLFile]:
        """Parse an HCL/Terraform file and extract top-level blocks/attributes."""
        try:
            source = Path(file_path).read_text(encoding="utf-8-sig", errors="replace")
            lines = source.splitlines()
            blocks = self._extract_blocks(lines)
            occupied_ranges = [(block.start_line, block.end_line) for block in blocks]
            attributes = self._extract_attributes(lines, occupied_ranges)
            return ParsedHCLFile(
                file_path=file_path,
                blocks=blocks,
                attributes=attributes,
                total_lines=max(1, len(lines)),
            )
        except Exception as e:
            logger.error(f"Failed to parse HCL file {file_path}: {e}")
            return None

    def _extract_blocks(self, lines: List[str]) -> List[ParsedHCLBlock]:
        blocks: List[ParsedHCLBlock] = []
        index = 0
        while index < len(lines):
            stripped = lines[index].strip()
            if not stripped or self._is_comment_line(stripped):
                index += 1
                continue

            match = self.BLOCK_PATTERN.match(lines[index])
            if not match:
                index += 1
                continue

            start_line = index + 1
            end_line = self._block_end_line(lines, index)
            kind = match.group("kind")
            labels = self._parse_labels(match.group("labels") or "")
            name = self._block_name(kind, labels)
            blocks.append(ParsedHCLBlock(
                name=name,
                code=self._slice_lines(lines, start_line, end_line),
                start_line=start_line,
                end_line=end_line,
                kind=kind,
                labels=labels,
                docstring=self._get_preceding_comment(lines, start_line),
            ))
            index = max(index + 1, end_line)
        return blocks

    def _extract_attributes(
        self,
        lines: List[str],
        occupied_ranges: List[tuple[int, int]],
    ) -> List[ParsedHCLAttribute]:
        attributes: List[ParsedHCLAttribute] = []
        for index, line in enumerate(lines):
            line_no = index + 1
            stripped = line.strip()
            if self._line_in_ranges(line_no, occupied_ranges):
                continue
            if not stripped or self._is_comment_line(stripped):
                continue
            match = self.ATTRIBUTE_PATTERN.match(line)
            if not match:
                continue
            end_line = self._attribute_end_line(lines, index)
            attributes.append(ParsedHCLAttribute(
                name=match.group("name"),
                code=self._slice_lines(lines, line_no, end_line),
                start_line=line_no,
                end_line=end_line,
                docstring=self._get_preceding_comment(lines, line_no),
            ))
        return attributes

    def _block_end_line(self, lines: List[str], start_index: int) -> int:
        depth = 0
        for index in range(start_index, len(lines)):
            depth += self._brace_delta(lines[index])
            if depth <= 0 and index > start_index:
                return index + 1
        return start_index + 1

    def _attribute_end_line(self, lines: List[str], start_index: int) -> int:
        depth = self._brace_delta(lines[start_index])
        if depth <= 0:
            return start_index + 1
        for index in range(start_index + 1, len(lines)):
            depth += self._brace_delta(lines[index])
            if depth <= 0:
                return index + 1
        return start_index + 1

    def _parse_labels(self, labels_text: str) -> List[str]:
        labels = []
        for token in re.finditer(r'"([^"]+)"|([A-Za-z_][\w-]*)', labels_text):
            labels.append(token.group(1) or token.group(2))
        return labels

    def _block_name(self, kind: str, labels: List[str]) -> str:
        if not labels:
            return kind
        return f"{kind} {'.'.join(labels)}"

    def _get_preceding_comment(self, lines: List[str], start_line: int) -> Optional[str]:
        comments = []
        index = start_line - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped:
                break
            if stripped.startswith("#") or stripped.startswith("//"):
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
        if stripped.startswith("#"):
            return stripped[1:].strip()
        if stripped.startswith("//"):
            return stripped[2:].strip()
        if stripped.startswith("/*") and stripped.endswith("*/"):
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
        return stripped.startswith("#") or stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*")

    def _brace_delta(self, line: str) -> int:
        scrubbed = self._strip_string_literals(line)
        return scrubbed.count("{") - scrubbed.count("}")

    def _strip_string_literals(self, line: str) -> str:
        return re.sub(r"(['\"])(?:\\.|(?!\1).)*\1", '""', line)
