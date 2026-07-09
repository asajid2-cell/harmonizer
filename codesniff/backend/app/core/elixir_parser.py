"""Elixir parser using a conservative declaration scanner."""

from dataclasses import dataclass
from pathlib import Path
import re
from typing import List, Optional

from loguru import logger


@dataclass
class ParsedElixirSymbol:
    """Represents a parsed Elixir function, macro, guard, delegate, or struct."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None


@dataclass
class ParsedElixirModule:
    """Represents a parsed Elixir module, protocol, or implementation."""

    name: str
    code: str
    start_line: int
    end_line: int
    kind: str
    docstring: Optional[str] = None
    members: List[ParsedElixirSymbol] = None

    def __post_init__(self):
        if self.members is None:
            self.members = []


@dataclass
class ParsedElixirFile:
    """Represents a fully parsed Elixir source file."""

    file_path: str
    modules: List[ParsedElixirModule]
    functions: List[ParsedElixirSymbol]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class ElixirParser:
    """Parser for common Elixir declarations."""

    MODULE_PATTERN = re.compile(
        r"^\s*(?P<kind>defmodule|defprotocol|defimpl)\s+(?P<name>[A-Z][\w.]*)(?:\s*,[^\n]*)?\s+do\b"
    )
    FUNCTION_PATTERN = re.compile(
        r"^\s*(?P<kind>defp?|defmacrop?|defguardp?|defdelegate)\s+"
        r"(?P<name>[a-zA-Z_][\w!?]*)\b"
    )
    STRUCT_PATTERN = re.compile(r"^\s*defstruct\b")
    DO_PATTERN = re.compile(r"\bdo\b(?!\s*:)")
    END_PATTERN = re.compile(r"\bend\b")

    def parse_file(self, file_path: str) -> Optional[ParsedElixirFile]:
        """Parse an Elixir file and extract common declarations."""
        try:
            source = Path(file_path).read_text(encoding="utf-8-sig", errors="replace")
            lines = source.splitlines()
            modules = self._extract_modules(lines)
            occupied_ranges = [(item.start_line, item.end_line) for item in modules]
            functions = self._extract_top_level_functions(lines, occupied_ranges)
            return ParsedElixirFile(
                file_path=file_path,
                modules=modules,
                functions=functions,
                total_lines=max(1, len(lines)),
            )
        except Exception as e:
            logger.error(f"Failed to parse Elixir file {file_path}: {e}")
            return None

    def _extract_modules(self, lines: List[str]) -> List[ParsedElixirModule]:
        modules: List[ParsedElixirModule] = []
        index = 0
        while index < len(lines):
            match = self.MODULE_PATTERN.match(self._strip_line(lines[index]))
            if not match:
                index += 1
                continue

            start_line = index + 1
            end_line = self._block_end_line(lines, index)
            kind = match.group("kind").replace("def", "")
            name = match.group("name")
            modules.append(ParsedElixirModule(
                name=name,
                code=self._slice_lines(lines, start_line, end_line),
                start_line=start_line,
                end_line=end_line,
                kind=kind,
                docstring=self._module_doc(lines, start_line, end_line),
                members=self._extract_module_members(lines, start_line, end_line),
            ))
            index = max(index + 1, end_line)
        return modules

    def _extract_module_members(
        self,
        lines: List[str],
        start_line: int,
        end_line: int,
    ) -> List[ParsedElixirSymbol]:
        members: List[ParsedElixirSymbol] = []
        depth = 1
        index = start_line
        while index < end_line - 1:
            line = self._strip_line(lines[index])
            current_depth = depth
            if current_depth == 1 and line:
                struct = self._parse_struct(lines, index)
                if struct:
                    members.append(struct)
                    index += 1
                    depth = max(1, depth + self._block_delta(line))
                    continue

                function = self._parse_function(lines, index)
                if function:
                    members.append(function)
                    index = function.end_line
                    depth = 1
                    continue

            depth = max(1, depth + self._block_delta(line))
            index += 1
        return members

    def _extract_top_level_functions(
        self,
        lines: List[str],
        occupied_ranges: List[tuple[int, int]],
    ) -> List[ParsedElixirSymbol]:
        functions: List[ParsedElixirSymbol] = []
        index = 0
        while index < len(lines):
            line_no = index + 1
            if self._line_in_ranges(line_no, occupied_ranges):
                index += 1
                continue
            function = self._parse_function(lines, index)
            if function:
                functions.append(function)
                index = function.end_line
                continue
            index += 1
        return functions

    def _parse_function(self, lines: List[str], index: int) -> Optional[ParsedElixirSymbol]:
        line = self._strip_line(lines[index])
        match = self.FUNCTION_PATTERN.match(line)
        if not match:
            return None
        start_line = index + 1
        end_line = self._block_end_line(lines, index)
        return ParsedElixirSymbol(
            name=match.group("name"),
            code=self._slice_lines(lines, start_line, end_line),
            start_line=start_line,
            end_line=end_line,
            kind=match.group("kind"),
            docstring=self._doc_before(lines, start_line),
        )

    def _parse_struct(self, lines: List[str], index: int) -> Optional[ParsedElixirSymbol]:
        if not self.STRUCT_PATTERN.match(self._strip_line(lines[index])):
            return None
        start_line = index + 1
        end_line = self._block_end_line(lines, index)
        return ParsedElixirSymbol(
            name="defstruct",
            code=self._slice_lines(lines, start_line, end_line),
            start_line=start_line,
            end_line=end_line,
            kind="struct",
            docstring=self._doc_before(lines, start_line),
        )

    def _block_end_line(self, lines: List[str], start_index: int) -> int:
        start_line = self._strip_line(lines[start_index])
        if not self.DO_PATTERN.search(start_line):
            return start_index + 1

        depth = 0
        saw_open = False
        for index in range(start_index, len(lines)):
            line = self._strip_line(lines[index])
            opens = len(self.DO_PATTERN.findall(line))
            closes = len(self.END_PATTERN.findall(line))
            if opens:
                saw_open = True
            depth += opens - closes
            if saw_open and depth <= 0:
                return index + 1
        return start_index + 1

    def _module_doc(self, lines: List[str], start_line: int, end_line: int) -> Optional[str]:
        for index in range(start_line, min(end_line, start_line + 12)):
            stripped = lines[index].strip() if index < len(lines) else ""
            if stripped.startswith("@moduledoc"):
                return self._read_doc_attribute(lines, index, "@moduledoc")
            if stripped and not stripped.startswith("#") and not stripped.startswith("@"):
                break
        return self._comments_before(lines, start_line)

    def _doc_before(self, lines: List[str], start_line: int) -> Optional[str]:
        index = start_line - 2
        while index >= 0 and not lines[index].strip():
            index -= 1
        if index < 0:
            return None
        stripped = lines[index].strip()
        if stripped == '"""':
            block = []
            index -= 1
            while index >= 0:
                current = lines[index].strip()
                if current.startswith('@doc """'):
                    lead = current[len('@doc """'):].strip()
                    if lead:
                        block.insert(0, lead)
                    return "\n".join(block).strip() or None
                block.insert(0, current)
                index -= 1
        if stripped.startswith("@doc"):
            return self._read_doc_attribute(lines, index, "@doc")
        return self._comments_before(lines, start_line)

    def _read_doc_attribute(self, lines: List[str], index: int, attribute: str) -> Optional[str]:
        stripped = lines[index].strip()
        rest = stripped[len(attribute):].strip()
        if rest in {"false", "nil"}:
            return None
        if rest.startswith('"""'):
            first = rest[3:].strip()
            if first.endswith('"""'):
                return first[:-3].strip() or None
            block = [first] if first else []
            for next_index in range(index + 1, len(lines)):
                current = lines[next_index].strip()
                if current.endswith('"""'):
                    tail = current[:-3].strip()
                    if tail:
                        block.append(tail)
                    break
                block.append(current)
            return "\n".join(item for item in block if item).strip() or None
        if rest.startswith('"') and rest.endswith('"') and len(rest) >= 2:
            return rest[1:-1].strip() or None
        return rest.strip() or None

    def _comments_before(self, lines: List[str], start_line: int) -> Optional[str]:
        comments = []
        index = start_line - 2
        while index >= 0:
            stripped = lines[index].strip()
            if not stripped:
                break
            if not stripped.startswith("#"):
                break
            comments.insert(0, stripped[1:].strip())
            index -= 1
        cleaned = [comment for comment in comments if comment]
        return "\n".join(cleaned) if cleaned else None

    def _line_in_ranges(self, line_no: int, ranges: List[tuple[int, int]]) -> bool:
        return any(start <= line_no <= end for start, end in ranges)

    def _block_delta(self, line: str) -> int:
        return len(self.DO_PATTERN.findall(line)) - len(self.END_PATTERN.findall(line))

    def _strip_line(self, line: str) -> str:
        line = re.sub(r'~[a-zA-Z]?"(?:\\.|[^"])*"', '""', line)
        line = re.sub(r'"(?:\\.|[^"])*"', '""', line)
        line = re.sub(r"'(?:\\.|[^'])*'", "''", line)
        if "#" in line:
            line = line.split("#", 1)[0]
        return line.strip()

    def _slice_lines(self, lines: List[str], start_line: int, end_line: int) -> str:
        return "\n".join(lines[start_line - 1:end_line])
