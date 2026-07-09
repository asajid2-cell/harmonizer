"""Bounded cache of activated repo artifacts."""

from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from threading import RLock
from typing import TYPE_CHECKING, Dict, List, Optional

from loguru import logger

from ..core.artifact_manifest import validate_repo_manifest
from ..core.search import SearchEngine
from ..core.text_search import TextSearchEngine
from ..storage.metadata_store import MetadataStore
from ..storage.repo_registry import RepoRecord, RepoRegistry
from ..storage.vector_store import VectorStore

if TYPE_CHECKING:
    from ..core.embedder import CodeEmbedder


MAX_FILE_VIEW_BYTES = 1024 * 1024


@dataclass
class ActiveRepoHandle:
    """Open handles for a repo's cold artifacts."""

    repo_id: int
    storage_path: str
    metadata_store: MetadataStore
    vector_store: VectorStore
    search_engine: SearchEngine
    opened_at: float
    last_used_at: float
    semantic_loaded: bool = False

    def touch(self):
        self.last_used_at = time.time()

    def close(self):
        self.metadata_store.close()


class ActiveRepoManager:
    """Activate cold repo artifacts and keep only a bounded working set warm."""

    def __init__(
        self,
        registry: RepoRegistry,
        storage_dir: str,
        max_active_repos: int = 3,
        embedder_cache_dir: Optional[str] = None,
        embedder: Optional[CodeEmbedder] = None,
    ):
        self.registry = registry
        self.storage_dir = storage_dir
        self.max_active_repos = max(1, max_active_repos)
        self.embedder_cache_dir = embedder_cache_dir
        self.embedder = embedder
        self._handles: OrderedDict[int, ActiveRepoHandle] = OrderedDict()
        self._lock = RLock()

    def activate(self, repo: RepoRecord) -> ActiveRepoHandle:
        """Open or reuse a repo handle, then update LRU state."""
        with self._lock:
            existing = self._handles.get(repo.id)
            if existing:
                existing.touch()
                self._handles.move_to_end(repo.id)
                self.registry.update_repo(repo.id, last_opened_at=_now_from_epoch(existing.last_used_at))
                return existing

            repo_path = Path(repo.storage_path)
            repo_db = repo_path / "repo.sqlite"
            if not repo_db.exists():
                raise FileNotFoundError(f"Repo is not searchable yet: {repo_db}")

            metadata_store = MetadataStore(db_path=str(repo_db), read_only=True)
            vector_store = VectorStore(dimension=768)
            text_search = TextSearchEngine()
            search_engine = SearchEngine(
                embedder=self.embedder,
                embedder_cache_dir=self.embedder_cache_dir,
                vector_store=vector_store,
                metadata_store=metadata_store,
                text_search=text_search,
                build_text_index=False,
            )

            now = time.time()
            handle = ActiveRepoHandle(
                repo_id=repo.id,
                storage_path=repo.storage_path,
                metadata_store=metadata_store,
                vector_store=vector_store,
                search_engine=search_engine,
                opened_at=now,
                last_used_at=now,
            )
            self._handles[repo.id] = handle
            self._handles.move_to_end(repo.id)
            self.registry.update_repo(repo.id, last_opened_at=_now_from_epoch(now))
            self._evict_if_needed()
            logger.info(f"Activated repo {repo.id} from {repo.storage_path}")
            return handle

    def get_handle(self, repo_id: int) -> Optional[ActiveRepoHandle]:
        with self._lock:
            return self._handles.get(repo_id)

    def evict(self, repo_id: int) -> bool:
        with self._lock:
            handle = self._handles.pop(repo_id, None)
            if not handle:
                return False
            handle.close()
            logger.info(f"Evicted active repo {repo_id}")
            return True

    def close_all(self):
        with self._lock:
            for repo_id in list(self._handles.keys()):
                self.evict(repo_id)

    def get_stats(self) -> Dict[str, object]:
        with self._lock:
            return {
                "max_active_repos": self.max_active_repos,
                "active_count": len(self._handles),
                "active_repo_ids": list(self._handles.keys()),
            }

    def search(self, repo: RepoRecord, **search_kwargs):
        with self._lock:
            handle = self.activate(repo)
            self._load_semantic_if_available(handle)
            results = handle.search_engine.search(**search_kwargs)
            handle.touch()
            self._handles.move_to_end(repo.id)
            return results

    def list_files(self, repo: RepoRecord) -> List[Dict[str, object]]:
        with self._lock:
            handle = self.activate(repo)
            source_dir = Path(repo.storage_path) / "source"
            cursor = handle.metadata_store.conn.cursor()
            rows = cursor.execute(
                """
                SELECT f.id, f.path, f.total_lines, f.indexed_at,
                       COUNT(s.id) as symbol_count
                FROM files f
                LEFT JOIN symbols s ON f.id = s.file_id
                GROUP BY f.id
                ORDER BY f.path
                """
            ).fetchall()
            handle.touch()
            self._handles.move_to_end(repo.id)
            return [
                {
                    "id": row["id"],
                    "path": _repo_relative_path(row["path"], source_dir),
                    "total_lines": row["total_lines"],
                    "indexed_at": row["indexed_at"],
                    "symbol_count": row["symbol_count"],
                }
                for row in rows
            ]

    def get_file(self, repo: RepoRecord, requested_path: str) -> Dict[str, object]:
        """Return source text and symbol outline for one indexed repo file."""
        with self._lock:
            handle = self.activate(repo)
            source_dir = Path(repo.storage_path) / "source"
            repo_path = _clean_repo_relative_path(requested_path)
            target_path = source_dir.joinpath(*PurePosixPath(repo_path).parts).resolve()
            source_root = source_dir.resolve()
            try:
                target_path.relative_to(source_root)
            except ValueError as exc:
                raise ValueError("File path escapes repo source") from exc

            cursor = handle.metadata_store.conn.cursor()
            rows = cursor.execute(
                """
                SELECT id, path, total_lines, indexed_at
                FROM files
                ORDER BY path
                """
            ).fetchall()
            file_row = None
            for row in rows:
                if _repo_relative_path(row["path"], source_dir) == repo_path:
                    file_row = row
                    break
            if file_row is None:
                raise KeyError(repo_path)

            blob = handle.metadata_store.get_file_blob(file_row["id"])
            content_bytes: Optional[bytes] = None
            size_bytes = 0
            if target_path.is_file():
                size_bytes = target_path.stat().st_size
                if size_bytes <= MAX_FILE_VIEW_BYTES:
                    content_bytes = target_path.read_bytes()
            elif blob:
                size_bytes = int(blob["size_bytes"] or len(blob["content"]))
                if size_bytes <= MAX_FILE_VIEW_BYTES:
                    content_bytes = blob["content"]
            else:
                raise FileNotFoundError(f"Source snapshot is unavailable for {repo_path}")

            if size_bytes > MAX_FILE_VIEW_BYTES:
                raise OverflowError(f"File is too large to display: {size_bytes} bytes")

            if content_bytes is None:
                raise FileNotFoundError(f"Source file is unavailable: {repo_path}")

            content = content_bytes.decode("utf-8-sig", errors="replace")
            symbol_rows = cursor.execute(
                """
                SELECT id, name, symbol_type, start_line, end_line, docstring
                FROM symbols
                WHERE file_id = ?
                ORDER BY start_line, end_line, name
                """,
                (file_row["id"],),
            ).fetchall()
            handle.touch()
            self._handles.move_to_end(repo.id)
            return {
                "repo_id": repo.id,
                "file": {
                    "id": file_row["id"],
                    "path": repo_path,
                    "total_lines": file_row["total_lines"],
                    "indexed_at": file_row["indexed_at"],
                    "symbol_count": len(symbol_rows),
                },
                "content": content,
                "size_bytes": size_bytes,
                "symbols": [
                    {
                        "id": row["id"],
                        "name": row["name"],
                        "symbol_type": row["symbol_type"],
                        "start_line": row["start_line"],
                        "end_line": row["end_line"],
                        "docstring": row["docstring"],
                    }
                    for row in symbol_rows
                ],
            }

    def _evict_if_needed(self):
        while len(self._handles) > self.max_active_repos:
            repo_id, handle = self._handles.popitem(last=False)
            handle.close()
            logger.info(f"LRU evicted active repo {repo_id}")

    def _load_semantic_if_available(self, handle: ActiveRepoHandle):
        if handle.semantic_loaded:
            return

        manifest_validation = validate_repo_manifest(handle.storage_path)
        if manifest_validation.manifest_present and not manifest_validation.semantic_ok:
            logger.warning(
                f"Repo {handle.repo_id} semantic vectors skipped: "
                f"{'; '.join(manifest_validation.warnings) or 'manifest is not semantic-ready'}"
            )
            return

        vector_dir = Path(handle.storage_path) / "vector_index"
        if not (vector_dir / "vectors.index").exists():
            return

        try:
            handle.vector_store.load(str(vector_dir))
            handle.semantic_loaded = handle.vector_store.vector_count > 0
        except Exception as e:
            handle.semantic_loaded = False
            logger.warning(f"Repo {handle.repo_id} semantic vectors unavailable: {e}")


def _now_from_epoch(epoch_seconds: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch_seconds))


def _clean_repo_relative_path(raw_path: str) -> str:
    normalized = str(raw_path or "").replace("\\", "/").strip()
    if not normalized:
        raise ValueError("File path is required")
    pure = PurePosixPath(normalized)
    if normalized.startswith("/") or ":" in pure.parts[0]:
        raise ValueError("File path must be repo-relative")
    if any(part in {"", ".", ".."} for part in pure.parts):
        raise ValueError("File path must not contain traversal segments")
    return pure.as_posix()


def _repo_relative_path(indexed_path: str, source_dir: Path) -> str:
    raw = str(indexed_path or "")
    candidate = Path(raw)
    if candidate.is_absolute():
        try:
            return PurePosixPath(candidate.resolve().relative_to(source_dir.resolve())).as_posix()
        except ValueError:
            return PurePosixPath(raw.replace("\\", "/")).name
    return PurePosixPath(raw.replace("\\", "/")).as_posix()
