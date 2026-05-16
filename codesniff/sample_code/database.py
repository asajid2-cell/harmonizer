"""Database connection and query management"""

import sqlite3
from typing import List, Dict, Any, Optional
from contextlib import contextmanager


class DatabaseConnection:
    """Manages database connections"""

    def __init__(self, db_path: str):
        """
        Initialize database connection

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.connection = None

    def connect(self):
        """Establish connection to database"""
        self.connection = sqlite3.connect(self.db_path)
        self.connection.row_factory = sqlite3.Row

    def disconnect(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            self.connection = None

    def execute_query(self, query: str, params: tuple = ()) -> List[Dict]:
        """
        Execute a SELECT query and return results

        Args:
            query: SQL query string
            params: Query parameters

        Returns:
            List of result rows as dictionaries
        """
        if not self.connection:
            self.connect()

        cursor = self.connection.cursor()
        cursor.execute(query, params)

        results = []
        for row in cursor.fetchall():
            results.append(dict(row))

        return results

    def execute_update(self, query: str, params: tuple = ()) -> int:
        """
        Execute an INSERT/UPDATE/DELETE query

        Args:
            query: SQL query string
            params: Query parameters

        Returns:
            Number of affected rows
        """
        if not self.connection:
            self.connect()

        cursor = self.connection.cursor()
        cursor.execute(query, params)
        self.connection.commit()

        return cursor.rowcount


def create_connection_pool(db_path: str, pool_size: int = 5) -> List[DatabaseConnection]:
    """
    Create a pool of database connections

    Args:
        db_path: Path to database
        pool_size: Number of connections in pool

    Returns:
        List of database connections
    """
    pool = []
    for _ in range(pool_size):
        conn = DatabaseConnection(db_path)
        conn.connect()
        pool.append(conn)

    return pool


@contextmanager
def get_db_connection(db_path: str):
    """
    Context manager for database connections

    Args:
        db_path: Path to database file

    Yields:
        Database connection
    """
    conn = sqlite3.connect(db_path)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def migrate_database(db_path: str, migrations: List[str]):
    """
    Run database migrations

    Args:
        db_path: Path to database
        migrations: List of SQL migration scripts
    """
    with get_db_connection(db_path) as conn:
        cursor = conn.cursor()

        for migration in migrations:
            cursor.execute(migration)

        conn.commit()


class QueryBuilder:
    """Build SQL queries programmatically"""

    def __init__(self, table: str):
        """
        Initialize query builder

        Args:
            table: Table name
        """
        self.table = table
        self.conditions = []
        self.order_by = None
        self.limit_val = None

    def where(self, condition: str, *params):
        """
        Add WHERE condition

        Args:
            condition: SQL condition string
            *params: Condition parameters
        """
        self.conditions.append((condition, params))
        return self

    def order(self, column: str, direction: str = 'ASC'):
        """
        Add ORDER BY clause

        Args:
            column: Column to order by
            direction: ASC or DESC
        """
        self.order_by = f"{column} {direction}"
        return self

    def limit(self, count: int):
        """
        Add LIMIT clause

        Args:
            count: Maximum rows to return
        """
        self.limit_val = count
        return self

    def build_select(self, columns: str = '*') -> tuple[str, tuple]:
        """
        Build SELECT query

        Args:
            columns: Columns to select

        Returns:
            Tuple of (query, params)
        """
        query = f"SELECT {columns} FROM {self.table}"
        params = []

        if self.conditions:
            where_clauses = []
            for condition, cond_params in self.conditions:
                where_clauses.append(condition)
                params.extend(cond_params)

            query += " WHERE " + " AND ".join(where_clauses)

        if self.order_by:
            query += f" ORDER BY {self.order_by}"

        if self.limit_val:
            query += f" LIMIT {self.limit_val}"

        return query, tuple(params)
