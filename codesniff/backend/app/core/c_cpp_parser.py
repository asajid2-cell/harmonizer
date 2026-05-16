"""C/C++ parser using Tree-sitter"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
from tree_sitter import Language, Parser, Node
import tree_sitter_c as tsc
import tree_sitter_cpp as tscpp
from loguru import logger


@dataclass
class ParsedCFunction:
    """Represents a parsed C/C++ function"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    return_type: Optional[str] = None


@dataclass
class ParsedCClass:
    """Represents a parsed C++ class/struct"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    methods: List[ParsedCFunction] = None

    def __post_init__(self):
        if self.methods is None:
            self.methods = []


@dataclass
class ParsedCFile:
    """Represents a parsed C/C++ file"""
    file_path: str
    functions: List[ParsedCFunction]
    classes: List[ParsedCClass]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class CCppParser:
    """Parser for C and C++ source code using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parsers for C and C++"""
        # Initialize C parser
        self.c_language = Language(tsc.language(), "c")
        self.c_parser = Parser()
        self.c_parser.set_language(self.c_language)

        # Initialize C++ parser
        self.cpp_language = Language(tscpp.language(), "cpp")
        self.cpp_parser = Parser()
        self.cpp_parser.set_language(self.cpp_language)

        logger.info("CCppParser initialized for C and C++")

    def parse_file(self, file_path: str) -> Optional[ParsedCFile]:
        """
        Parse a C or C++ file

        Args:
            file_path: Path to C/C++ file

        Returns:
            ParsedCFile or None if parsing fails
        """
        try:
            # Determine if C or C++ based on extension
            ext = Path(file_path).suffix.lower()
            is_cpp = ext in {'.cpp', '.cxx', '.cc', '.hpp', '.hxx', '.hh', '.h'}
            parser = self.cpp_parser if is_cpp else self.c_parser

            # Read file as binary
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Strip BOM if present
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            # Decode for text operations
            source_code = source_bytes.decode('utf-8')
            lines = source_code.split('\n')
            total_lines = len(lines)

            # Parse with tree-sitter
            tree = parser.parse(source_bytes)
            root_node = tree.root_node

            # Extract functions and classes
            functions = []
            classes = []

            if is_cpp:
                # C++ can have classes
                classes = self._extract_classes(root_node, source_code, lines)
                functions = self._extract_functions(root_node, source_code, lines, in_class=False)
            else:
                # C only has functions (and structs, but we treat them as classes)
                classes = self._extract_structs(root_node, source_code, lines)
                functions = self._extract_functions(root_node, source_code, lines, in_class=False)

            parse_errors = []
            if root_node.has_error:
                parse_errors.append("Syntax errors detected in file")

            return ParsedCFile(
                file_path=file_path,
                functions=functions,
                classes=classes,
                total_lines=total_lines,
                parse_errors=parse_errors
            )

        except Exception as e:
            logger.error(f"Error parsing C/C++ file {file_path}: {e}")
            logger.exception("Full traceback:")
            return None

    def _extract_functions(self, node: Node, source_code: str, lines: List[str],
                          in_class: bool = False, parent_class: Optional[str] = None) -> List[ParsedCFunction]:
        """Extract function definitions"""
        functions = []

        for child in node.children:
            # Function definitions in C/C++
            if child.type == 'function_definition':
                func = self._parse_function(child, source_code, lines)
                if func:
                    functions.append(func)

            # Recursively search in namespaces, extern blocks, etc.
            elif child.type in ['namespace_definition', 'linkage_specification', 'declaration_list']:
                functions.extend(self._extract_functions(child, source_code, lines, in_class, parent_class))

        return functions

    def _parse_function(self, node: Node, source_code: str, lines: List[str]) -> Optional[ParsedCFunction]:
        """Parse a single function definition"""
        try:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            code = source_code[node.start_byte:node.end_byte]

            # Extract function name from declarator
            name = "unknown"
            return_type = None

            for child in node.children:
                if child.type == 'function_declarator':
                    # Get the function name
                    for subchild in child.children:
                        if subchild.type in ['identifier', 'field_identifier', 'destructor_name']:
                            name = source_code[subchild.start_byte:subchild.end_byte]
                            break
                        elif subchild.type == 'qualified_identifier':
                            # For qualified names like namespace::function
                            name = source_code[subchild.start_byte:subchild.end_byte]
                            break

                # Try to extract return type
                elif child.type in ['primitive_type', 'type_identifier', 'qualified_identifier']:
                    return_type = source_code[child.start_byte:child.end_byte]

            # Extract docstring (comment above function)
            docstring = self._extract_docstring(node, lines, start_line)

            return ParsedCFunction(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                return_type=return_type
            )

        except Exception as e:
            logger.debug(f"Error parsing function: {e}")
            return None

    def _extract_classes(self, node: Node, source_code: str, lines: List[str]) -> List[ParsedCClass]:
        """Extract C++ class definitions"""
        classes = []

        for child in node.children:
            if child.type == 'class_specifier':
                cls = self._parse_class(child, source_code, lines)
                if cls:
                    classes.append(cls)

            # Recursively search in namespaces
            elif child.type in ['namespace_definition', 'declaration_list']:
                classes.extend(self._extract_classes(child, source_code, lines))

        return classes

    def _extract_structs(self, node: Node, source_code: str, lines: List[str]) -> List[ParsedCClass]:
        """Extract C struct definitions (treated as classes)"""
        structs = []

        for child in node.children:
            if child.type == 'struct_specifier':
                struct = self._parse_struct(child, source_code, lines)
                if struct:
                    structs.append(struct)

            # Recursively search
            elif child.type in ['declaration_list']:
                structs.extend(self._extract_structs(child, source_code, lines))

        return structs

    def _parse_class(self, node: Node, source_code: str, lines: List[str]) -> Optional[ParsedCClass]:
        """Parse a C++ class definition"""
        try:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            code = source_code[node.start_byte:node.end_byte]

            # Extract class name
            name = "unknown"
            for child in node.children:
                if child.type == 'type_identifier':
                    name = source_code[child.start_byte:child.end_byte]
                    break

            # Extract methods
            methods = []
            for child in node.children:
                if child.type == 'field_declaration_list':
                    methods = self._extract_methods(child, source_code, lines)
                    break

            # Extract docstring
            docstring = self._extract_docstring(node, lines, start_line)

            return ParsedCClass(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                methods=methods
            )

        except Exception as e:
            logger.debug(f"Error parsing class: {e}")
            return None

    def _parse_struct(self, node: Node, source_code: str, lines: List[str]) -> Optional[ParsedCClass]:
        """Parse a C struct definition"""
        try:
            start_line = node.start_point[0] + 1
            end_line = node.end_point[0] + 1
            code = source_code[node.start_byte:node.end_byte]

            # Extract struct name
            name = "unknown"
            for child in node.children:
                if child.type == 'type_identifier':
                    name = source_code[child.start_byte:child.end_byte]
                    break

            # Structs don't have methods in C, but might have functions in C++
            methods = []

            # Extract docstring
            docstring = self._extract_docstring(node, lines, start_line)

            return ParsedCClass(
                name=name,
                code=code,
                start_line=start_line,
                end_line=end_line,
                docstring=docstring,
                methods=methods
            )

        except Exception as e:
            logger.debug(f"Error parsing struct: {e}")
            return None

    def _extract_methods(self, node: Node, source_code: str, lines: List[str]) -> List[ParsedCFunction]:
        """Extract methods from class body"""
        methods = []

        for child in node.children:
            if child.type == 'function_definition':
                method = self._parse_function(child, source_code, lines)
                if method:
                    methods.append(method)

        return methods

    def _extract_docstring(self, node: Node, lines: List[str], start_line: int) -> Optional[str]:
        """Extract comment above the node as docstring"""
        try:
            if start_line < 2:
                return None

            # Check line above for comment
            prev_line = lines[start_line - 2].strip()

            docstring_lines = []
            idx = start_line - 2

            # Collect multi-line comments (// or /* */)
            while idx >= 0:
                line = lines[idx].strip()
                if line.startswith('//'):
                    docstring_lines.insert(0, line[2:].strip())
                    idx -= 1
                elif '*/' in line or '/*' in line:
                    # Multi-line comment
                    docstring_lines.insert(0, line.replace('/*', '').replace('*/', '').replace('*', '').strip())
                    idx -= 1
                    if '/*' in line:
                        break
                else:
                    break

            if docstring_lines:
                return ' '.join(docstring_lines)

            return None

        except:
            return None


def main():
    """Test the C/C++ parser"""
    import tempfile
    import os

    # Create test C++ file
    test_dir = tempfile.mkdtemp()
    test_file = os.path.join(test_dir, 'test.cpp')

    with open(test_file, 'w') as f:
        f.write('''
// User authentication class
class UserAuth {
public:
    // Validates user credentials
    bool validateUser(const std::string& username, const std::string& password) {
        return checkCredentials(username, password);
    }

    // Logs in a user
    void login(const std::string& email) {
        // Login logic
    }
};

// Helper function
int calculateHash(const std::string& data) {
    return data.length();
}
''')

    try:
        parser = CCppParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Functions: {len(result.functions)}")
            print(f"Classes: {len(result.classes)}")

            for cls in result.classes:
                print(f"\nClass: {cls.name}")
                print(f"  Methods: {len(cls.methods)}")
                for method in cls.methods:
                    print(f"    - {method.name}()")

            for func in result.functions:
                print(f"\nFunction: {func.name}()")

    finally:
        import shutil
        shutil.rmtree(test_dir)


if __name__ == "__main__":
    main()
