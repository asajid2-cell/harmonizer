"""Metadata store for code symbols using SQLite"""

import sqlite3
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from loguru import logger


@dataclass
class SymbolRecord:
    """Record for a code symbol"""
    file_id: int
    name: str
    symbol_type: str  # 'function', 'class', 'method'
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None
    embedding_id: Optional[int] = None
    id: Optional[int] = None


class MetadataStore:
    """SQLite-based metadata store for code symbols"""

    def __init__(self, db_path: str = "codescope.db"):
        """
        Initialize metadata store

        Args:
            db_path: Path to SQLite database
        """
        self.db_path = db_path
        self.conn = None
        self._init_db()
        logger.info(f"Initialized metadata store at {db_path}")

    def _init_db(self):
        """Initialize database schema"""
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row

        cursor = self.conn.cursor()

        # Files table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                total_lines INTEGER DEFAULT 0,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Symbols table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS symbols (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                symbol_type TEXT NOT NULL,
                code TEXT NOT NULL,
                start_line INTEGER NOT NULL,
                end_line INTEGER NOT NULL,
                docstring TEXT,
                embedding_id INTEGER,
                FOREIGN KEY (file_id) REFERENCES files(id)
            )
        ''')

        # Create indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(symbol_type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_symbols_embedding ON symbols(embedding_id)')

        self.conn.commit()

    def add_file(self, path: str, total_lines: int = 0) -> int:
        """
        Add or update a file record

        Args:
            path: File path
            total_lines: Total lines in file

        Returns:
            File ID
        """
        cursor = self.conn.cursor()

        # Try to insert, or get existing
        cursor.execute('''
            INSERT OR REPLACE INTO files (path, total_lines, indexed_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        ''', (path, total_lines))

        self.conn.commit()

        # Get the file ID
        cursor.execute('SELECT id FROM files WHERE path = ?', (path,))
        result = cursor.fetchone()

        return result['id']

    def add_symbol(self, record: SymbolRecord) -> int:
        """
        Add a symbol record

        Args:
            record: SymbolRecord to add

        Returns:
            Symbol ID
        """
        cursor = self.conn.cursor()

        cursor.execute('''
            INSERT INTO symbols (file_id, name, symbol_type, code, start_line, end_line, docstring, embedding_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            record.file_id,
            record.name,
            record.symbol_type,
            record.code,
            record.start_line,
            record.end_line,
            record.docstring,
            record.embedding_id
        ))

        self.conn.commit()
        return cursor.lastrowid

    def add_symbols_batch(self, records: List[SymbolRecord]):
        """
        Add multiple symbol records in batch

        Args:
            records: List of SymbolRecords
        """
        cursor = self.conn.cursor()

        data = [
            (r.file_id, r.name, r.symbol_type, r.code, r.start_line, r.end_line, r.docstring, r.embedding_id)
            for r in records
        ]

        cursor.executemany('''
            INSERT INTO symbols (file_id, name, symbol_type, code, start_line, end_line, docstring, embedding_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', data)

        self.conn.commit()
        logger.debug(f"Added {len(records)} symbols in batch")

    def get_symbol_by_embedding_id(self, embedding_id: int) -> Optional[Dict[str, Any]]:
        """
        Get symbol by embedding ID

        Args:
            embedding_id: Embedding ID

        Returns:
            Symbol data or None
        """
        cursor = self.conn.cursor()

        cursor.execute('''
            SELECT s.*, f.path as file_path
            FROM symbols s
            JOIN files f ON s.file_id = f.id
            WHERE s.embedding_id = ?
        ''', (embedding_id,))

        row = cursor.fetchone()
        if row:
            return dict(row)
        return None

    def get_symbols_by_embedding_ids(self, embedding_ids: List[int]) -> List[Optional[SymbolRecord]]:
        """
        Get symbols by embedding IDs, preserving order

        Args:
            embedding_ids: List of embedding IDs

        Returns:
            List of SymbolRecords (or None for missing)
        """
        if not embedding_ids:
            return []

        cursor = self.conn.cursor()

        # Get all symbols
        placeholders = ','.join('?' * len(embedding_ids))
        cursor.execute(f'''
            SELECT * FROM symbols
            WHERE embedding_id IN ({placeholders})
        ''', embedding_ids)

        # Build lookup dict
        rows = cursor.fetchall()
        symbol_map = {}
        for row in rows:
            record = SymbolRecord(
                id=row['id'],
                file_id=row['file_id'],
                name=row['name'],
                symbol_type=row['symbol_type'],
                code=row['code'],
                start_line=row['start_line'],
                end_line=row['end_line'],
                docstring=row['docstring'],
                embedding_id=row['embedding_id']
            )
            symbol_map[row['embedding_id']] = record

        # Return in order
        return [symbol_map.get(eid) for eid in embedding_ids]

    def get_file(self, file_id: int):
        """
        Get file record by ID

        Args:
            file_id: File ID

        Returns:
            File record or None
        """
        cursor = self.conn.cursor()
        cursor.execute('SELECT * FROM files WHERE id = ?', (file_id,))
        row = cursor.fetchone()
        if row:
            # Return as simple object with path attribute
            class FileRecord:
                def __init__(self, row):
                    self.id = row['id']
                    self.path = row['path']
                    self.total_lines = row['total_lines']
            return FileRecord(row)
        return None

    def search_symbols(self, query: str, limit: int = 20) -> List[SymbolRecord]:
        """
        Search symbols by name, returning SymbolRecord objects

        Args:
            query: Search query
            limit: Maximum results

        Returns:
            List of matching SymbolRecords
        """
        cursor = self.conn.cursor()

        cursor.execute('''
            SELECT * FROM symbols
            WHERE name LIKE ?
            LIMIT ?
        ''', (f'%{query}%', limit))

        results = []
        for row in cursor.fetchall():
            record = SymbolRecord(
                id=row['id'],
                file_id=row['file_id'],
                name=row['name'],
                symbol_type=row['symbol_type'],
                code=row['code'],
                start_line=row['start_line'],
                end_line=row['end_line'],
                docstring=row['docstring'],
                embedding_id=row['embedding_id']
            )
            results.append(record)

        return results

    def search_by_name(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search symbols by name

        Args:
            query: Search query
            limit: Maximum results

        Returns:
            List of matching symbols
        """
        cursor = self.conn.cursor()

        cursor.execute('''
            SELECT s.*, f.path as file_path
            FROM symbols s
            JOIN files f ON s.file_id = f.id
            WHERE s.name LIKE ?
            LIMIT ?
        ''', (f'%{query}%', limit))

        return [dict(row) for row in cursor.fetchall()]

    def get_stats(self) -> Dict[str, Any]:
        """Get database statistics"""
        cursor = self.conn.cursor()

        cursor.execute('SELECT COUNT(*) as count FROM files')
        total_files = cursor.fetchone()['count']

        cursor.execute('SELECT COUNT(*) as count FROM symbols')
        total_symbols = cursor.fetchone()['count']

        cursor.execute('''
            SELECT symbol_type, COUNT(*) as count
            FROM symbols
            GROUP BY symbol_type
        ''')
        by_type = {row['symbol_type']: row['count'] for row in cursor.fetchall()}

        return {
            'total_files': total_files,
            'total_symbols': total_symbols,
            'by_type': by_type
        }

    def clear(self):
        """Clear all data"""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM symbols')
        cursor.execute('DELETE FROM files')
        self.conn.commit()
        logger.info("Metadata store cleared")

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            self.conn = None
