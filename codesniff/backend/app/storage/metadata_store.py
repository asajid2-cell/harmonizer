"""Metadata store for code symbols using SQLite"""

import hashlib
import json
import re
import sqlite3
import zlib
from contextlib import contextmanager
from pathlib import Path, PurePosixPath
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from loguru import logger


FACT_KIND_RANK = {
    "entry_point": 10,
    "runbook_command": 20,
    "cli_command": 22,
    "package_script": 30,
    "route_endpoint": 40,
    "mobile_surface": 44,
    "dependency_manifest": 50,
    "stack_component": 52,
    "service_integration": 53,
    "graphql_surface": 54,
    "message_bus": 54,
    "data_store": 54,
    "ai_surface": 54,
    "payment_surface": 54,
    "auth_surface": 54,
    "background_job": 54,
    "webhook_surface": 54,
    "observability_surface": 54,
    "feature_flag": 54,
    "notification_surface": 54,
    "ci_workflow": 55,
    "container_service": 57,
    "runtime_requirement": 58,
    "repo_policy": 59,
    "code_owner": 59,
    "deploy_target": 59,
    "config": 60,
    "secret_signal": 61,
    "env_var": 62,
    "schema": 65,
    "module": 75,
    "test": 70,
    "doc": 80,
    "doc_section": 82,
    "import": 90,
    "symbol": 100,
    "dependency": 110,
    "language": 120,
    "directory": 130,
}

SOURCE_BLOB_COMPRESSION = "zlib"

RUNBOOK_CATEGORY_RANK = {
    "install": 0,
    "run": 1,
    "test": 2,
    "build": 3,
    "container": 4,
}


def compute_file_hash(path: str | Path) -> Optional[str]:
    """Return a stable content hash for a source file, or None when unreadable."""
    try:
        digest = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


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


@dataclass
class RelationshipRecord:
    """Record for a deterministic relationship extracted from source code."""
    src_kind: str
    src_id: int
    dst_kind: str
    rel_type: str
    target: str
    confidence: str
    dst_id: Optional[int] = None
    source_line: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None
    id: Optional[int] = None


@dataclass
class RepoFactRecord:
    """Record for a normalized repo-level fact extracted from cold artifacts."""
    kind: str
    key: str
    value: str
    source_path: Optional[str] = None
    source_line: Optional[int] = None
    confidence: str = "derived"
    metadata: Optional[Dict[str, Any]] = None
    id: Optional[int] = None


def _repo_fact_sort_key(item: Dict[str, Any]) -> tuple[Any, ...]:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    try:
        rank = int(metadata.get("rank"))
    except (TypeError, ValueError):
        rank = _repo_fact_fallback_rank(item, metadata)
    return (
        rank,
        item.get("kind") or "",
        item.get("key") or "",
        item.get("source_path") or "",
        item.get("source_line") or 0,
        item.get("value") or "",
    )


def _repo_fact_fallback_rank(item: Dict[str, Any], metadata: Dict[str, Any]) -> int:
    kind = str(item.get("kind") or "")
    rank = FACT_KIND_RANK.get(kind, 900) * 1000

    if kind == "runbook_command":
        rank += RUNBOOK_CATEGORY_RANK.get(str(metadata.get("category") or ""), 9) * 100
    elif kind == "route_endpoint":
        method = str(metadata.get("method") or str(item.get("key") or "").split(" ", 1)[0]).upper()
        rank += {"GET": 0, "POST": 1, "PUT": 2, "PATCH": 3, "DELETE": 4}.get(method, 8) * 10
    elif kind == "dependency":
        rank += {"runtime": 0, "dev": 1, "build": 2, "test": 3}.get(str(metadata.get("scope") or ""), 8) * 10

    rank += _repo_fact_source_rank(item.get("source_path"))
    try:
        source_line = int(item.get("source_line") or 0)
    except (TypeError, ValueError):
        source_line = 0
    if source_line:
        rank += min(source_line, 99)
    return rank


def _repo_fact_source_rank(source_path: Optional[str]) -> int:
    if not source_path:
        return 40
    pure = PurePosixPath(str(source_path).replace("\\", "/"))
    name = pure.name.lower()
    if len(pure.parts) == 1:
        if name in {"package.json", "pyproject.toml", "go.mod", "cargo.toml", "composer.json", "gemfile", "makefile", "justfile"}:
            return 0
        return 10
    if pure.parts and pure.parts[0].lower() in {"src", "app", "lib", "cmd"}:
        return 20
    if pure.parts and pure.parts[0].lower() in {"tests", "test", "__tests__"}:
        return 30
    if pure.parts and pure.parts[0].lower() in {"docs", "doc"}:
        return 50
    return 35


class MetadataStore:
    """SQLite-based metadata store for code symbols."""

    def __init__(self, db_path: str = ":memory:", read_only: bool = False):
        """
        Initialize metadata store

        Args:
            db_path: Path to SQLite database. Bare test/local instances default
                to an isolated in-memory DB; production and per-repo artifacts
                pass explicit file paths.
            read_only: Open an existing artifact DB without running schema setup.
        """
        self.db_path = db_path
        self.read_only = read_only
        self.conn = None
        self.fts_available = False
        self._transaction_depth = 0
        self._next_embedding_id = None
        self._init_db()
        logger.info(f"Initialized metadata store at {db_path}")

    def _init_db(self):
        """Initialize database schema"""
        if self.read_only and self.db_path != ":memory:":
            self.conn = sqlite3.connect(
                f"file:{self.db_path}?mode=ro",
                uri=True,
                check_same_thread=False,
            )
            self.conn.row_factory = sqlite3.Row
            self.conn.execute('PRAGMA foreign_keys = ON')
            row = self.conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'symbol_fts'"
            ).fetchone()
            self.fts_available = row is not None
            return

        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute('PRAGMA foreign_keys = ON')
        self.conn.execute('PRAGMA journal_mode = WAL')

        cursor = self.conn.cursor()

        # Files table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                content_hash TEXT,
                total_lines INTEGER DEFAULT 0,
                indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        file_columns = {
            row['name']
            for row in cursor.execute("PRAGMA table_info(files)").fetchall()
        }
        if 'content_hash' not in file_columns:
            cursor.execute('ALTER TABLE files ADD COLUMN content_hash TEXT')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS file_blobs (
                file_id INTEGER PRIMARY KEY,
                compression TEXT NOT NULL,
                content BLOB NOT NULL,
                size_bytes INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
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
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS relationships (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                src_kind TEXT NOT NULL,
                src_id INTEGER NOT NULL,
                dst_kind TEXT NOT NULL,
                dst_id INTEGER,
                rel_type TEXT NOT NULL,
                target TEXT NOT NULL,
                confidence TEXT NOT NULL,
                source_line INTEGER,
                metadata_json TEXT
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_relationships_src ON relationships(src_kind, src_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships(rel_type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target)')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS repo_overview_cache (
                cache_key TEXT PRIMARY KEY,
                generated_at TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS repo_facts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT NOT NULL,
                source_path TEXT,
                source_line INTEGER,
                confidence TEXT NOT NULL,
                metadata_json TEXT
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_repo_facts_kind_key ON repo_facts(kind, key)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_repo_facts_source ON repo_facts(source_path)')

        try:
            cursor.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
                    name,
                    symbol_type,
                    code,
                    docstring,
                    embedding_id UNINDEXED,
                    tokenize = 'unicode61'
                )
            ''')
            self.fts_available = True
        except sqlite3.OperationalError as e:
            self.fts_available = False
            logger.warning(f"SQLite FTS5 unavailable; falling back to in-memory lexical search: {e}")

        self.conn.commit()

    def _commit(self):
        """Commit immediately unless a caller owns a wider transaction."""
        if self._transaction_depth == 0:
            self.conn.commit()

    @contextmanager
    def transaction(self):
        """Batch metadata writes into one SQLite transaction."""
        outermost = self._transaction_depth == 0
        if outermost:
            self.conn.execute("BEGIN")
        self._transaction_depth += 1
        try:
            yield
            self._transaction_depth -= 1
            if outermost:
                self.conn.commit()
        except Exception:
            self._transaction_depth -= 1
            if outermost:
                self.conn.rollback()
            raise

    def _delete_fts_by_embedding_ids(self, embedding_ids: List[int]):
        """Remove FTS rows for embedding IDs when a file is reindexed."""
        if not self.fts_available or not embedding_ids:
            return

        cursor = self.conn.cursor()
        cursor.executemany(
            'DELETE FROM symbol_fts WHERE embedding_id = ?',
            [(embedding_id,) for embedding_id in embedding_ids if embedding_id is not None]
        )

    def _add_fts_rows(self, records: List[SymbolRecord]):
        """Add symbol rows to the disk-backed FTS table when available."""
        if not self.fts_available or not records:
            return

        cursor = self.conn.cursor()
        cursor.executemany('''
            INSERT INTO symbol_fts (name, symbol_type, code, docstring, embedding_id)
            VALUES (?, ?, ?, ?, ?)
        ''', [
            (r.name, r.symbol_type, r.code, r.docstring or '', r.embedding_id)
            for r in records
            if r.embedding_id is not None
        ])

    def add_file(
        self,
        path: str,
        total_lines: int = 0,
        content_hash: Optional[str] = None,
        replace_existing: bool = True,
    ) -> int:
        """
        Add or update a file record

        Args:
            path: File path
            total_lines: Total lines in file
            content_hash: Optional precomputed file content hash
            replace_existing: Delete previous symbols/relationships for this path

        Returns:
            File ID
        """
        cursor = self.conn.cursor()
        if content_hash is None:
            content_hash = compute_file_hash(path)

        cursor.execute('''
            INSERT INTO files (path, content_hash, total_lines, indexed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(path) DO UPDATE SET
                content_hash = excluded.content_hash,
                total_lines = excluded.total_lines,
                indexed_at = CURRENT_TIMESTAMP
        ''', (path, content_hash, total_lines))

        self._commit()

        # Get the file ID
        cursor.execute('SELECT id FROM files WHERE path = ?', (path,))
        result = cursor.fetchone()
        file_id = result['id']

        if replace_existing:
            # Reindexing a file should replace its symbol rows, not duplicate them.
            rows = cursor.execute('SELECT embedding_id FROM symbols WHERE file_id = ?', (file_id,)).fetchall()
            self.delete_relationships_for_file(file_id)
            self._delete_fts_by_embedding_ids([row['embedding_id'] for row in rows])
            cursor.execute('DELETE FROM symbols WHERE file_id = ?', (file_id,))
            self._commit()

        return file_id

    def add_files_batch(self, records: List[Dict[str, Any]]) -> Dict[str, int]:
        """Insert or update many file rows and return their IDs by path."""
        if not records:
            return {}

        cursor = self.conn.cursor()
        cursor.executemany('''
            INSERT INTO files (path, content_hash, total_lines, indexed_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(path) DO UPDATE SET
                content_hash = excluded.content_hash,
                total_lines = excluded.total_lines,
                indexed_at = CURRENT_TIMESTAMP
        ''', [
            (record["path"], record.get("content_hash"), int(record.get("total_lines") or 0))
            for record in records
        ])
        self._commit()

        ids_by_path: Dict[str, int] = {}
        paths = [record["path"] for record in records]
        for start in range(0, len(paths), 500):
            batch = paths[start:start + 500]
            placeholders = ",".join("?" for _ in batch)
            rows = cursor.execute(
                f"SELECT id, path FROM files WHERE path IN ({placeholders})",
                batch,
            ).fetchall()
            ids_by_path.update({row["path"]: row["id"] for row in rows})
        return ids_by_path

    def has_files(self) -> bool:
        """Return whether the metadata DB already has indexed file rows."""
        cursor = self.conn.cursor()
        row = cursor.execute('SELECT 1 FROM files LIMIT 1').fetchone()
        return row is not None

    def set_file_blob(self, file_id: int, content: bytes):
        """Store compressed source bytes for an indexed file."""
        compressed = zlib.compress(content)
        cursor = self.conn.cursor()
        cursor.execute(
            '''
            INSERT INTO file_blobs (file_id, compression, content, size_bytes, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(file_id) DO UPDATE SET
                compression = excluded.compression,
                content = excluded.content,
                size_bytes = excluded.size_bytes,
                updated_at = CURRENT_TIMESTAMP
            ''',
            (file_id, SOURCE_BLOB_COMPRESSION, compressed, len(content)),
        )
        self._commit()

    def get_file_blob(self, file_id: int) -> Optional[Dict[str, Any]]:
        """Return decompressed source bytes for an indexed file when present."""
        cursor = self.conn.cursor()
        try:
            row = cursor.execute(
                '''
                SELECT compression, content, size_bytes
                FROM file_blobs
                WHERE file_id = ?
                ''',
                (file_id,),
            ).fetchone()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e).lower():
                return None
            raise
        if row is None:
            return None

        compression = row["compression"]
        raw_content = bytes(row["content"])
        if compression == SOURCE_BLOB_COMPRESSION:
            content = zlib.decompress(raw_content)
        elif compression == "none":
            content = raw_content
        else:
            raise ValueError(f"Unsupported source blob compression: {compression}")

        return {
            "content": content,
            "size_bytes": row["size_bytes"],
            "compression": compression,
        }

    def delete_file_by_path(self, path: str) -> bool:
        """Delete one file and its symbol/FTS rows."""
        cursor = self.conn.cursor()
        row = cursor.execute('SELECT id FROM files WHERE path = ?', (path,)).fetchone()
        if row is None:
            return False

        file_id = row['id']
        rows = cursor.execute('SELECT embedding_id FROM symbols WHERE file_id = ?', (file_id,)).fetchall()
        self.delete_relationships_for_file(file_id)
        self._delete_fts_by_embedding_ids([item['embedding_id'] for item in rows])
        cursor.execute('DELETE FROM file_blobs WHERE file_id = ?', (file_id,))
        cursor.execute('DELETE FROM symbols WHERE file_id = ?', (file_id,))
        cursor.execute('DELETE FROM files WHERE id = ?', (file_id,))
        self._commit()
        return True

    def get_file_hashes(self) -> Dict[str, Optional[str]]:
        """Return indexed file paths and their stored content hashes."""
        cursor = self.conn.cursor()
        rows = cursor.execute('SELECT path, content_hash FROM files').fetchall()
        return {row['path']: row['content_hash'] for row in rows}

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

        self._commit()
        self._add_fts_rows([record])
        self._commit()
        self._remember_next_embedding_id([record.embedding_id])
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

        self._commit()
        self._add_fts_rows(records)
        self._commit()
        self._remember_next_embedding_id([record.embedding_id for record in records])
        logger.debug(f"Added {len(records)} symbols in batch")

    def delete_relationships_for_file(self, file_id: int) -> int:
        """Delete relationship rows where a file is the source or target."""
        cursor = self.conn.cursor()
        try:
            cursor.execute('''
                DELETE FROM relationships
                WHERE (src_kind = 'file' AND src_id = ?)
                   OR (dst_kind = 'file' AND dst_id = ?)
            ''', (file_id, file_id))
        except sqlite3.OperationalError as e:
            if "no such table" in str(e).lower():
                return 0
            raise

        deleted = cursor.rowcount
        self._commit()
        return deleted

    def add_relationships_batch(self, records: List[RelationshipRecord]):
        """Add relationship records in batch."""
        if not records:
            return

        cursor = self.conn.cursor()
        data = []
        for record in records:
            metadata_json = None
            if record.metadata is not None:
                metadata_json = json.dumps(record.metadata, sort_keys=True)
            data.append((
                record.src_kind,
                record.src_id,
                record.dst_kind,
                record.dst_id,
                record.rel_type,
                record.target,
                record.confidence,
                record.source_line,
                metadata_json,
            ))

        cursor.executemany('''
            INSERT INTO relationships (
                src_kind, src_id, dst_kind, dst_id, rel_type, target,
                confidence, source_line, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', data)

        self._commit()
        logger.debug(f"Added {len(records)} relationships in batch")

    def get_relationships(
        self,
        src_file_id: Optional[int] = None,
        rel_type: Optional[str] = None,
        target: Optional[str] = None,
        limit: int = 1000,
    ) -> List[Dict[str, Any]]:
        """Return persisted relationship rows for tests and graph consumers."""
        clauses = []
        params: List[Any] = []

        if src_file_id is not None:
            clauses.append("src_kind = 'file' AND src_id = ?")
            params.append(src_file_id)
        if rel_type is not None:
            clauses.append("rel_type = ?")
            params.append(rel_type)
        if target is not None:
            clauses.append("target = ?")
            params.append(target)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(limit)

        try:
            rows = self.conn.execute(f'''
                SELECT *
                FROM relationships
                {where_sql}
                ORDER BY src_kind, src_id, rel_type, target, source_line
                LIMIT ?
            ''', params).fetchall()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e).lower():
                return []
            raise

        relationships = []
        for row in rows:
            item = dict(row)
            metadata_json = item.get("metadata_json")
            item["metadata"] = json.loads(metadata_json) if metadata_json else None
            relationships.append(item)

        return relationships

    def replace_repo_facts(self, records: List[RepoFactRecord]):
        """Replace all persisted repo facts with a deterministic batch."""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM repo_facts')
        if records:
            self._insert_repo_facts(cursor, records)
        self._commit()

    def add_repo_facts_batch(self, records: List[RepoFactRecord]):
        """Add normalized repo facts in batch."""
        if not records:
            return

        cursor = self.conn.cursor()
        self._insert_repo_facts(cursor, records)
        self._commit()
        logger.debug(f"Added {len(records)} repo facts in batch")

    def _insert_repo_facts(self, cursor: sqlite3.Cursor, records: List[RepoFactRecord]):
        """Insert repo fact records with an existing cursor."""
        data = []
        for record in records:
            metadata_json = None
            if record.metadata is not None:
                metadata_json = json.dumps(record.metadata, sort_keys=True, separators=(",", ":"))
            data.append((
                record.kind,
                record.key,
                record.value,
                record.source_path,
                record.source_line,
                record.confidence,
                metadata_json,
            ))

        cursor.executemany('''
            INSERT INTO repo_facts (
                kind, key, value, source_path, source_line, confidence, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', data)

    def get_repo_facts(
        self,
        kind: Optional[str] = None,
        key: Optional[str] = None,
        source_path: Optional[str] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        """Return persisted repo-level facts for API and tests."""
        clauses = []
        params: List[Any] = []

        if kind is not None:
            clauses.append("kind = ?")
            params.append(kind)
        if key is not None:
            clauses.append("key = ?")
            params.append(key)
        if source_path is not None:
            clauses.append("source_path = ?")
            params.append(source_path)

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        limit = max(1, min(int(limit), 1000))

        try:
            rows = self.conn.execute(f'''
                SELECT *
                FROM repo_facts
                {where_sql}
            ''', params).fetchall()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e).lower():
                return []
            raise

        facts = []
        for row in rows:
            item = dict(row)
            metadata_json = item.pop("metadata_json", None)
            try:
                parsed_metadata = json.loads(metadata_json) if metadata_json else {}
            except json.JSONDecodeError:
                parsed_metadata = {}
            item["metadata"] = parsed_metadata if isinstance(parsed_metadata, dict) else {}
            facts.append(item)

        return sorted(facts, key=_repo_fact_sort_key)[:limit]

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

    def search_fts(
        self,
        query: str,
        limit: int = 100,
        terms: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Search symbols using SQLite FTS5 without rebuilding a Python text index.

        Returns rows ordered by FTS rank with a positive score suitable for
        normalization in the hybrid search layer.
        """
        if not self.fts_available:
            return []

        tokens = terms or [
            token.lower()
            for token in re.findall(r'[A-Za-z]+[0-9]*|[0-9]+', query)
            if len(token) >= 2
        ]
        tokens = [
            token.lower().lstrip("~")
            for token in tokens
            if re.fullmatch(r'[A-Za-z]+[0-9]*|[0-9]+', token.lstrip("~"))
        ]
        if not tokens:
            return []

        # Prefix terms keep symbol/name searches useful without exposing raw FTS syntax.
        match_expr = ' OR '.join(f'{token}*' for token in tokens[:8])

        try:
            cursor = self.conn.cursor()
            rows = cursor.execute('''
                SELECT embedding_id, bm25(symbol_fts, 4.0, 1.0, 1.0, 2.0) AS rank
                FROM symbol_fts
                WHERE symbol_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            ''', (match_expr, limit)).fetchall()
        except sqlite3.OperationalError as e:
            logger.warning(f"SQLite FTS search failed for query '{query}': {e}")
            return []

        total = len(rows)
        return [
            {
                'embedding_id': row['embedding_id'],
                'score': float(total - idx),
                'matched_terms': tokens
            }
            for idx, row in enumerate(rows)
            if row['embedding_id'] is not None
        ]

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

    def get_next_embedding_id(self) -> int:
        """Return the next document/vector id for lexical-only indexing."""
        if self._next_embedding_id is not None:
            return self._next_embedding_id

        cursor = self.conn.cursor()
        cursor.execute('SELECT COALESCE(MAX(embedding_id), -1) + 1 as next_id FROM symbols')
        row = cursor.fetchone()
        self._next_embedding_id = int(row['next_id'] if row else 0)
        return self._next_embedding_id

    def reserve_embedding_ids(self, count: int) -> int:
        """Reserve a contiguous lexical embedding-id range without writing rows."""
        start_id = self.get_next_embedding_id()
        self._next_embedding_id = start_id + max(0, count)
        return start_id

    def _remember_next_embedding_id(self, embedding_ids):
        """Keep lexical embedding IDs monotonic without querying MAX for every file."""
        numeric_ids = [embedding_id for embedding_id in embedding_ids if embedding_id is not None]
        if not numeric_ids:
            return
        next_id = max(int(embedding_id) for embedding_id in numeric_ids) + 1
        if self._next_embedding_id is None or next_id > self._next_embedding_id:
            self._next_embedding_id = next_id

    def clear(self):
        """Clear all data"""
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM relationships')
        cursor.execute('DELETE FROM repo_facts')
        cursor.execute('DELETE FROM file_blobs')
        cursor.execute('DELETE FROM symbols')
        cursor.execute('DELETE FROM files')
        if self.fts_available:
            cursor.execute('DELETE FROM symbol_fts')
        self._commit()
        self._next_embedding_id = 0
        logger.info("Metadata store cleared")

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            self.conn = None
