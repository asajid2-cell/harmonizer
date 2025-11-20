"""Simple Java/Kotlin parser using regex patterns"""

import re
from typing import List, Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class ParsedJavaFunction:
    """Represents a parsed function/method from Java/Kotlin code"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    file_path: str = ""


@dataclass
class ParsedJavaClass:
    """Represents a parsed class from Java/Kotlin code"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedJavaFunction] = None
    file_path: str = ""

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedJavaFile:
    """Represents a fully parsed Java/Kotlin file"""
    file_path: str
    functions: List[ParsedJavaFunction]
    classes: List[ParsedJavaClass]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class JavaParser:
    """Simple parser for Java/Kotlin using regex"""

    def __init__(self):
        """Initialize Java/Kotlin parser"""
        # Java method patterns
        self.java_method_patterns = [
            # public/private/protected methods with return types
            r'^\s*(?:public|private|protected|static|final|native|synchronized|abstract|transient)+[\s\w<>,\[\]]*\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{',
        ]

        # Kotlin function patterns
        self.kotlin_function_patterns = [
            # fun functionName(...): ReturnType {
            r'^\s*(?:public|private|protected|internal|inline|suspend)?\s*fun\s+(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>?,\s]+)?\s*[={]',
        ]

        # Java class pattern
        self.java_class_pattern = r'^\s*(?:public|private|protected|abstract|final)?\s*class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{'

        # Kotlin class pattern
        self.kotlin_class_pattern = r'^\s*(?:public|private|protected|internal|data|sealed|open|abstract)?\s*class\s+(\w+)(?:\s*\([^)]*\))?(?:\s*:\s*[\w,\s]+)?\s*\{'

        # Javadoc pattern
        self.javadoc_pattern = r'/\*\*\s*([\s\S]*?)\s*\*/'

        # KDoc pattern (same as Javadoc)
        self.kdoc_pattern = r'/\*\*\s*([\s\S]*?)\s*\*/'

        logger.info("JavaParser initialized for Java and Kotlin")

    def parse_file(self, file_path: str) -> Optional[ParsedJavaFile]:
        """
        Parse a Java or Kotlin file

        Args:
            file_path: Path to Java/Kotlin file

        Returns:
            ParsedJavaFile or None if parsing fails
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                code = f.read()

            lines = code.split('\n')
            total_lines = len(lines)

            # Detect if Kotlin or Java
            is_kotlin = file_path.endswith('.kt')

            # Parse classes and functions
            classes = self._parse_classes(code, lines, file_path, is_kotlin)
            functions = self._parse_functions(code, lines, file_path, is_kotlin)

            return ParsedJavaFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=total_lines
            )

        except Exception as e:
            logger.error(f"Failed to parse {file_path}: {e}")
            return None

    def _parse_classes(self, code: str, lines: List[str], file_path: str, is_kotlin: bool) -> List[ParsedJavaClass]:
        """Parse class definitions"""
        classes = []
        pattern = self.kotlin_class_pattern if is_kotlin else self.java_class_pattern

        for i, line in enumerate(lines):
            match = re.search(pattern, line)
            if match:
                class_name = match.group(1)

                # Find docstring above class
                docstring = self._find_docstring_above(lines, i)

                # Find class body (simplified - just find matching braces)
                start_line = i + 1
                end_line = self._find_closing_brace(lines, i)

                if end_line > start_line:
                    class_code = '\n'.join(lines[i:end_line + 1])

                    # Parse methods within class
                    class_lines = lines[i:end_line + 1]
                    methods = self._parse_methods_in_class(class_lines, i, file_path, is_kotlin)

                    classes.append(ParsedJavaClass(
                        name=class_name,
                        code=class_code,
                        start_line=start_line,
                        end_line=end_line + 1,
                        docstring=docstring,
                        methods=methods,
                        file_path=file_path
                    ))

        return classes

    def _parse_functions(self, code: str, lines: List[str], file_path: str, is_kotlin: bool) -> List[ParsedJavaFunction]:
        """Parse top-level functions (mainly for Kotlin)"""
        functions = []

        if not is_kotlin:
            return functions  # Java doesn't have top-level functions

        for pattern in self.kotlin_function_patterns:
            for i, line in enumerate(lines):
                match = re.search(pattern, line)
                if match:
                    func_name = match.group(1)

                    # Find docstring above function
                    docstring = self._find_docstring_above(lines, i)

                    # Find function body
                    start_line = i + 1
                    end_line = self._find_closing_brace(lines, i)

                    if end_line > start_line:
                        func_code = '\n'.join(lines[i:end_line + 1])

                        functions.append(ParsedJavaFunction(
                            name=func_name,
                            code=func_code,
                            start_line=start_line,
                            end_line=end_line + 1,
                            docstring=docstring,
                            file_path=file_path
                        ))

        return functions

    def _parse_methods_in_class(self, class_lines: List[str], class_start: int, file_path: str, is_kotlin: bool) -> List[ParsedJavaFunction]:
        """Parse methods within a class"""
        methods = []
        patterns = self.kotlin_function_patterns if is_kotlin else self.java_method_patterns

        for pattern in patterns:
            for i, line in enumerate(class_lines):
                match = re.search(pattern, line)
                if match and i > 0:  # Skip the class declaration line
                    method_name = match.group(1)

                    # Find docstring above method
                    docstring = self._find_docstring_above(class_lines, i)

                    # Find method body
                    start_line = class_start + i + 1
                    end_line = class_start + self._find_closing_brace(class_lines, i)

                    if end_line > start_line:
                        method_code = '\n'.join(class_lines[i:end_line - class_start + 1])

                        methods.append(ParsedJavaFunction(
                            name=method_name,
                            code=method_code,
                            start_line=start_line,
                            end_line=end_line + 1,
                            docstring=docstring,
                            file_path=file_path
                        ))

        return methods

    def _find_docstring_above(self, lines: List[str], line_idx: int) -> Optional[str]:
        """Find Javadoc/KDoc comment above a definition"""
        # Look backwards for /** ... */
        for i in range(line_idx - 1, max(0, line_idx - 20), -1):
            line = lines[i].strip()
            if line.endswith('*/'):
                # Found end of comment, collect lines
                comment_lines = []
                for j in range(i, max(0, i - 50), -1):
                    comment_lines.insert(0, lines[j].strip())
                    if lines[j].strip().startswith('/**'):
                        # Found start
                        comment_text = ' '.join(comment_lines)
                        match = re.search(self.javadoc_pattern, comment_text)
                        if match:
                            return match.group(1).strip()
                        break
            elif line and not line.startswith('//') and not line.startswith('*') and not line.startswith('/*'):
                # Hit non-comment code, stop searching
                break

        return None

    def _find_closing_brace(self, lines: List[str], start_idx: int) -> int:
        """Find the closing brace for a block starting at start_idx"""
        brace_count = 0
        started = False

        for i in range(start_idx, len(lines)):
            line = lines[i]

            # Count braces in this line
            for char in line:
                if char == '{':
                    brace_count += 1
                    started = True
                elif char == '}':
                    brace_count -= 1

                    if started and brace_count == 0:
                        return i

        return len(lines) - 1  # Return end of file if not found
