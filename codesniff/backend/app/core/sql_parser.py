"""SQL parser using Tree-sitter for database schema and query analysis"""

from typing import List, Optional
from dataclasses import dataclass
from pathlib import Path
import tree_sitter_sql as tssql
from tree_sitter import Parser, Node, Language
from loguru import logger


@dataclass
class ParsedSQLTable:
    """Represents a parsed SQL table definition"""
    name: str
    code: str
    start_line: int
    end_line: int
    columns: List[str] = None
    docstring: Optional[str] = None

    def __post_init__(self):
        if self.columns is None:
            self.columns = []


@dataclass
class ParsedSQLProcedure:
    """Represents a parsed SQL stored procedure/function"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    kind: str = "procedure"  # procedure, function, trigger


@dataclass
class ParsedSQLView:
    """Represents a parsed SQL view"""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


@dataclass
class ParsedSQLFile:
    """Represents a fully parsed SQL file"""
    file_path: str
    tables: List[ParsedSQLTable]
    procedures: List[ParsedSQLProcedure]
    views: List[ParsedSQLView]
    total_lines: int
    parse_errors: List[str] = None

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class SQLParser:
    """Parser for SQL files using Tree-sitter"""

    def __init__(self):
        """Initialize Tree-sitter parser with SQL grammar"""
        self.language = Language(tssql.language(), "sql")
        self.parser = Parser()
        self.parser.set_language(self.language)
        logger.info("SQLParser initialized")

    def parse_file(self, file_path: str) -> Optional[ParsedSQLFile]:
        """Parse a SQL file and extract tables, procedures, and views"""
        try:
            with open(file_path, 'rb') as f:
                source_bytes = f.read()

            # Handle BOM
            if source_bytes.startswith(b'\xef\xbb\xbf'):
                source_bytes = source_bytes[3:]

            source_code = source_bytes.decode('utf-8')
            tree = self.parser.parse(source_bytes)

            tables = []
            procedures = []
            views = []

            self._extract_definitions(tree.root_node, source_code, tables, procedures, views)

            return ParsedSQLFile(
                file_path=file_path,
                tables=tables,
                procedures=procedures,
                views=views,
                total_lines=source_code.count('\n') + 1
            )

        except Exception as e:
            logger.error(f"Failed to parse SQL file {file_path}: {e}")
            return None

    def _extract_definitions(self, node: Node, source_code: str,
                             tables: List[ParsedSQLTable],
                             procedures: List[ParsedSQLProcedure],
                             views: List[ParsedSQLView]):
        """Recursively extract SQL definitions"""
        for child in node.children:
            node_type = child.type.lower()

            # CREATE TABLE
            if node_type in ('create_table', 'create_table_statement'):
                table = self._parse_create_table(child, source_code)
                if table:
                    tables.append(table)

            # CREATE PROCEDURE/FUNCTION
            elif node_type in ('create_function', 'create_function_statement',
                              'create_procedure', 'create_procedure_statement'):
                proc = self._parse_create_procedure(child, source_code, "function" if "function" in node_type else "procedure")
                if proc:
                    procedures.append(proc)

            # CREATE TRIGGER
            elif node_type in ('create_trigger', 'create_trigger_statement'):
                trigger = self._parse_create_procedure(child, source_code, "trigger")
                if trigger:
                    procedures.append(trigger)

            # CREATE VIEW
            elif node_type in ('create_view', 'create_view_statement'):
                view = self._parse_create_view(child, source_code)
                if view:
                    views.append(view)

            # Also check for statement wrapper nodes
            elif 'statement' in node_type or node_type == 'program':
                self._extract_definitions(child, source_code, tables, procedures, views)

    def _parse_create_table(self, node: Node, source_code: str) -> Optional[ParsedSQLTable]:
        """Parse a CREATE TABLE statement"""
        code = self._get_node_text(node, source_code)
        name = self._extract_table_name(node, source_code)

        if not name:
            # Try to extract from code
            code_upper = code.upper()
            if 'CREATE TABLE' in code_upper:
                parts = code.split()
                for i, part in enumerate(parts):
                    if part.upper() == 'TABLE':
                        if i + 1 < len(parts):
                            name = parts[i + 1].strip('`"[]();')
                            # Handle IF NOT EXISTS
                            if name.upper() in ('IF', 'NOT', 'EXISTS'):
                                continue
                            break

        if not name:
            return None

        # Extract column names
        columns = self._extract_columns(node, source_code)
        docstring = self._get_preceding_comment(node, source_code)

        return ParsedSQLTable(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            columns=columns,
            docstring=docstring
        )

    def _extract_table_name(self, node: Node, source_code: str) -> Optional[str]:
        """Extract table name from CREATE TABLE node"""
        for child in node.children:
            if child.type in ('object_reference', 'table_reference', 'identifier', 'name'):
                return self._get_node_text(child, source_code).strip('`"[]')
            # Recurse for nested structures
            name = self._extract_table_name(child, source_code)
            if name and name.upper() not in ('TABLE', 'CREATE', 'IF', 'NOT', 'EXISTS'):
                return name
        return None

    def _extract_columns(self, node: Node, source_code: str) -> List[str]:
        """Extract column names from table definition"""
        columns = []
        for child in node.children:
            if child.type in ('column_definition', 'column_def'):
                for col_child in child.children:
                    if col_child.type in ('identifier', 'column_name', 'name'):
                        col_name = self._get_node_text(col_child, source_code).strip('`"[]')
                        if col_name.upper() not in ('PRIMARY', 'KEY', 'FOREIGN', 'UNIQUE', 'INDEX', 'CONSTRAINT'):
                            columns.append(col_name)
                        break
            elif hasattr(child, 'children'):
                columns.extend(self._extract_columns(child, source_code))
        return columns

    def _parse_create_procedure(self, node: Node, source_code: str, kind: str) -> Optional[ParsedSQLProcedure]:
        """Parse a CREATE PROCEDURE/FUNCTION/TRIGGER statement"""
        code = self._get_node_text(node, source_code)
        name = self._extract_procedure_name(node, source_code, kind)

        if not name:
            return None

        docstring = self._get_preceding_comment(node, source_code)

        return ParsedSQLProcedure(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring,
            kind=kind
        )

    def _extract_procedure_name(self, node: Node, source_code: str, kind: str) -> Optional[str]:
        """Extract procedure/function name"""
        for child in node.children:
            if child.type in ('object_reference', 'function_name', 'identifier', 'name'):
                return self._get_node_text(child, source_code).strip('`"[]')
            name = self._extract_procedure_name(child, source_code, kind)
            if name and name.upper() not in ('CREATE', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'OR', 'REPLACE'):
                return name
        return None

    def _parse_create_view(self, node: Node, source_code: str) -> Optional[ParsedSQLView]:
        """Parse a CREATE VIEW statement"""
        code = self._get_node_text(node, source_code)
        name = self._extract_view_name(node, source_code)

        if not name:
            return None

        docstring = self._get_preceding_comment(node, source_code)

        return ParsedSQLView(
            name=name,
            code=code,
            start_line=node.start_point[0] + 1,
            end_line=node.end_point[0] + 1,
            docstring=docstring
        )

    def _extract_view_name(self, node: Node, source_code: str) -> Optional[str]:
        """Extract view name"""
        for child in node.children:
            if child.type in ('object_reference', 'view_name', 'identifier', 'name'):
                return self._get_node_text(child, source_code).strip('`"[]')
            name = self._extract_view_name(child, source_code)
            if name and name.upper() not in ('CREATE', 'VIEW', 'OR', 'REPLACE', 'AS'):
                return name
        return None

    def _get_node_text(self, node: Node, source_code: str) -> str:
        """Extract text content of a node"""
        return source_code[node.start_byte:node.end_byte]

    def _get_preceding_comment(self, node: Node, source_code: str) -> Optional[str]:
        """Get comment immediately before a node"""
        comments = []
        sibling = node.prev_sibling

        while sibling and sibling.type in ('comment', 'line_comment', 'block_comment'):
            text = self._get_node_text(sibling, source_code)
            # Clean up comment markers
            text = text.strip()
            if text.startswith('--'):
                text = text[2:].strip()
            elif text.startswith('/*'):
                text = text[2:-2].strip() if text.endswith('*/') else text[2:].strip()
            comments.insert(0, text)
            sibling = sibling.prev_sibling

        return '\n'.join(comments) if comments else None


if __name__ == "__main__":
    import tempfile
    import os

    test_code = '''
-- Users table stores user account information
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products catalog
CREATE TABLE products (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    price DECIMAL(10, 2),
    category_id INT,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- View for active users
CREATE VIEW active_users AS
SELECT id, username, email
FROM users
WHERE is_active = 1;

-- Function to calculate order total
CREATE FUNCTION calculate_total(order_id INT)
RETURNS DECIMAL(10, 2)
BEGIN
    DECLARE total DECIMAL(10, 2);
    SELECT SUM(price * quantity) INTO total
    FROM order_items
    WHERE order_id = order_id;
    RETURN total;
END;

-- Trigger for audit logging
CREATE TRIGGER user_audit_trigger
AFTER INSERT ON users
FOR EACH ROW
BEGIN
    INSERT INTO audit_log (action, table_name, record_id)
    VALUES ('INSERT', 'users', NEW.id);
END;
'''

    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "schema.sql")
        with open(test_file, 'w') as f:
            f.write(test_code)

        parser = SQLParser()
        result = parser.parse_file(test_file)

        if result:
            print(f"Parsed {result.file_path}")
            print(f"Tables: {len(result.tables)}")
            print(f"Procedures/Functions: {len(result.procedures)}")
            print(f"Views: {len(result.views)}")

            for table in result.tables:
                print(f"\nTable: {table.name}")
                if table.docstring:
                    print(f"  Doc: {table.docstring}")
                if table.columns:
                    print(f"  Columns: {', '.join(table.columns)}")

            for proc in result.procedures:
                print(f"\n{proc.kind.capitalize()}: {proc.name}")
                if proc.docstring:
                    print(f"  Doc: {proc.docstring}")

            for view in result.views:
                print(f"\nView: {view.name}")
                if view.docstring:
                    print(f"  Doc: {view.docstring}")
