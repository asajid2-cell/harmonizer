"""Indexer orchestrates parsing, embedding, and storage of code"""

from __future__ import annotations

import ast
import gc
import hashlib
import os
import re
import time
from pathlib import Path
from typing import TYPE_CHECKING, Callable, List, Dict, Any, Optional
from dataclasses import dataclass
from loguru import logger
from tqdm import tqdm
import numpy as np

from .parser import CodeParser, ParsedFile, ParsedFunction, ParsedClass
from .js_parser import JSParser, ParsedJSFile, ParsedJSFunction, ParsedJSClass
from .java_parser import JavaParser, ParsedJavaFile, ParsedJavaFunction, ParsedJavaClass
from .html_css_parser import HTMLCSSParser, ParsedHTMLCSSFile, ParsedHTMLElement, ParsedCSSRule
from .c_cpp_parser import CCppParser, ParsedCFile, ParsedCFunction, ParsedCClass
from .csharp_parser import CSharpParser, ParsedCSharpFile, ParsedCSharpMethod, ParsedCSharpClass
from .go_parser import GoParser, ParsedGoFile, ParsedGoFunction, ParsedGoStruct
from .rust_parser import RustParser, ParsedRustFile, ParsedRustFunction, ParsedRustStruct
from .ruby_parser import RubyParser, ParsedRubyFile, ParsedRubyMethod, ParsedRubyClass
from .php_parser import PHPParser, ParsedPHPFile, ParsedPHPFunction, ParsedPHPClass
from .bash_parser import BashParser, ParsedBashFile, ParsedBashFunction
from .sql_parser import SQLParser, ParsedSQLFile, ParsedSQLTable, ParsedSQLProcedure, ParsedSQLView
from .shader_parser import ShaderParser, ParsedShaderFile, ParsedShaderFunction
from .scala_parser import ScalaParser, ParsedScalaFile
from .lua_parser import LuaParser, ParsedLuaFile
from .swift_parser import SwiftParser, ParsedSwiftFile
from .dart_parser import DartParser, ParsedDartFile
from .hcl_parser import HCLParser, ParsedHCLFile
from .graphql_parser import GraphQLParser, ParsedGraphQLFile
from .protobuf_parser import ProtobufParser, ParsedProtoFile
from .powershell_parser import PowerShellParser, ParsedPowerShellFile
from .elixir_parser import ElixirParser, ParsedElixirFile
from .text_search import TextSearchEngine
from ..storage.vector_store import VectorStore
from ..storage.metadata_store import MetadataStore, SymbolRecord, RelationshipRecord

if TYPE_CHECKING:
    from .embedder import CodeEmbedder


@dataclass
class IndexStats:
    """Statistics from indexing operation"""
    files_discovered: int = 0
    directories_pruned: int = 0
    files_processed: int = 0
    files_skipped: int = 0
    files_failed: int = 0
    total_symbols: int = 0
    functions_indexed: int = 0
    classes_indexed: int = 0
    methods_indexed: int = 0
    time_taken: float = 0.0
    total_lines: int = 0
    complete: bool = True


class IndexingCanceled(Exception):
    """Raised when a caller requests cooperative cancellation."""


@dataclass
class ParsedGenericChunk:
    """Searchable chunk for files without a symbol-aware parser."""
    name: str
    code: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


class Indexer:
    """Orchestrates the code indexing pipeline"""

    # Maximum symbols to process at once to avoid OOM
    SYMBOLS_BATCH_SIZE = 100
    MAX_STORED_SYMBOL_CODE_CHARS = 16000
    SYMBOL_TRUNCATION_MARKER = "\n...[truncated by CodeSniff]..."
    GC_BATCH_INTERVAL = 5000
    SOURCE_PREFETCH_BATCH_SIZE = 256
    DEFERRED_SYMBOL_FLUSH_SIZE = 2000
    SHALLOW_FILE_BATCH_SIZE = 5000
    BOUNDED_SOURCE_FALLBACK = "__codesniff_bounded_source_fallback__"
    DEFAULT_FULL_SOURCE_READ_MAX_BYTES = 2_000_000
    DEFAULT_SYMBOL_PARSE_MAX_BYTES = 1_000_000
    DEFAULT_SYMBOL_PARSE_MAX_LINES = 20_000
    DEFAULT_SYMBOL_PARSE_MAX_LINE_CHARS = 20_000
    DEFAULT_GENERIC_CHUNK_MAX_BYTES = 1_000_000
    DEFAULT_BOUNDED_FALLBACK_SAMPLE_BYTES = 96_000
    DEFAULT_FILE_BLOB_MAX_BYTES = 2_000_000
    BOUNDED_FALLBACK_CHUNK_LINES = 80
    BOUNDED_FALLBACK_MAX_CHUNKS = 4
    EXCLUDED_DIRS = {
        '.git', '.hg', '.svn',
        '__pycache__', '.mypy_cache', '.pytest_cache', '.ruff_cache',
        'node_modules', 'bower_components',
        'dist', 'build', 'coverage', '.next', '.nuxt', 'codesniff-app',
        'target', 'vendor',
        'venv', 'env', '.venv',
    }
    EXCLUDED_FILENAMES = {
        'package-lock.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'bun.lock',
        'bun.lockb',
        'cargo.lock',
        'poetry.lock',
        'uv.lock',
        'pipfile.lock',
        'composer.lock',
    }

    def __init__(
        self,
        parser: Optional[CodeParser] = None,
        embedder: Optional[CodeEmbedder] = None,
        embedder_cache_dir: Optional[str] = None,
        vector_store: Optional[VectorStore] = None,
        metadata_store: Optional[MetadataStore] = None,
        text_search: Optional[TextSearchEngine] = None,
        build_text_index: bool = True
    ):
        """
        Initialize indexer with components

        Args:
            parser: CodeParser instance
            embedder: CodeEmbedder instance
            vector_store: VectorStore instance
            metadata_store: MetadataStore instance
            text_search: TextSearchEngine instance
        """
        self.parser = parser or CodeParser()
        self.js_parser = JSParser()
        self.java_parser = JavaParser()
        self.html_css_parser = HTMLCSSParser()
        self.c_cpp_parser = CCppParser()
        self.csharp_parser = CSharpParser()
        self.go_parser = GoParser()
        self.rust_parser = RustParser()
        self.ruby_parser = RubyParser()
        self.php_parser = PHPParser()
        self.bash_parser = BashParser()
        self.sql_parser = SQLParser()
        self.shader_parser = ShaderParser()
        self.scala_parser = ScalaParser()
        self.lua_parser = LuaParser()
        self.swift_parser = SwiftParser()
        self.dart_parser = DartParser()
        self.hcl_parser = HCLParser()
        self.graphql_parser = GraphQLParser()
        self.protobuf_parser = ProtobufParser()
        self.powershell_parser = PowerShellParser()
        self.elixir_parser = ElixirParser()
        self.embedder = embedder
        self.embedder_cache_dir = embedder_cache_dir
        self.vector_store = vector_store or VectorStore()
        self.metadata_store = metadata_store or MetadataStore()
        self.text_search = text_search or TextSearchEngine()
        self.build_text_index = build_text_index
        self._batches_since_gc = 0
        self._active_index_root: Optional[Path] = None

        # Supported file extensions
        self.python_extensions = {'.py'}
        self.js_extensions = {'.js', '.jsx', '.ts', '.tsx'}
        self.java_extensions = {'.java', '.kt'}
        self.html_css_extensions = {'.html', '.htm', '.css'}
        self.c_cpp_extensions = {'.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'}
        self.csharp_extensions = {'.cs'}
        self.go_extensions = {'.go'}
        self.rust_extensions = {'.rs'}
        self.ruby_extensions = {'.rb', '.rake'}
        self.php_extensions = {'.php', '.phtml'}
        self.bash_extensions = {'.sh', '.bash', '.zsh'}
        self.sql_extensions = {'.sql'}
        self.scala_extensions = {'.scala', '.sc'}
        self.lua_extensions = {'.lua'}
        self.swift_extensions = {'.swift'}
        self.dart_extensions = {'.dart'}
        self.hcl_extensions = {'.tf', '.tfvars', '.hcl'}
        self.graphql_extensions = {'.graphql', '.gql'}
        self.protobuf_extensions = {'.proto'}
        self.powershell_extensions = {'.ps1', '.psm1'}
        self.elixir_extensions = {'.ex', '.exs'}
        self.shader_extensions = {
            '.glsl', '.vert', '.frag', '.geom', '.tesc', '.tese', '.comp',
            '.hlsl', '.fx', '.fxh', '.hlsli',
            '.wgsl', '.metal', '.shader', '.cginc'
        }
        self.generic_extensions = {
            '.pyi', '.mjs', '.cjs',
            '.scss', '.sass', '.vue', '.svelte',
            '.kts',
            '.r', '.pl', '.pm',
            '.erl', '.hrl',
            '.m', '.mm', '.groovy', '.gradle',
            '.jl', '.fs', '.fsx', '.fsi',
            '.clj', '.cljs', '.cljc', '.edn',
            '.zig',
            '.fish',
            '.prisma',
            '.yaml', '.yml', '.json', '.toml', '.xml', '.ini',
            '.md', '.mdx',
        }
        self.generic_filenames = {
            'dockerfile', 'makefile', 'justfile', 'rakefile',
            '.env.example', '.env.sample'
        }
        self.all_extensions = (self.python_extensions | self.js_extensions | self.java_extensions |
                              self.html_css_extensions | self.c_cpp_extensions | self.csharp_extensions |
                              self.go_extensions | self.rust_extensions | self.ruby_extensions |
                              self.php_extensions | self.bash_extensions | self.sql_extensions |
                              self.scala_extensions | self.lua_extensions | self.swift_extensions |
                              self.dart_extensions |
                              self.hcl_extensions |
                              self.graphql_extensions |
                              self.protobuf_extensions |
                              self.powershell_extensions |
                              self.elixir_extensions |
                              self.shader_extensions | self.generic_extensions)

        logger.info("Indexer initialized with multi-language support (symbol-aware parsers plus generic chunks for common source/config languages)")

    @staticmethod
    def _raise_if_canceled(cancel_check: Optional[Callable[[], bool]]):
        if cancel_check and cancel_check():
            raise IndexingCanceled("Canceled by user")

    def _ensure_embedder(self) -> CodeEmbedder:
        """Load CodeBERT only when semantic embeddings are actually requested."""
        if self.embedder is None:
            from .embedder import CodeEmbedder

            self.embedder = CodeEmbedder(cache_dir=self.embedder_cache_dir)
        return self.embedder

    @staticmethod
    def _env_int(name: str, default: int, minimum: int = 0) -> int:
        configured = os.getenv(name)
        if configured is None:
            return default
        try:
            return max(minimum, int(configured))
        except ValueError:
            logger.warning(f"Invalid {name} value: {configured}; using {default}")
            return default

    def _full_source_read_max_bytes(self) -> int:
        return self._env_int(
            "CODESNIFF_FULL_SOURCE_READ_MAX_BYTES",
            self.DEFAULT_FULL_SOURCE_READ_MAX_BYTES,
            minimum=1,
        )

    def _symbol_parse_max_bytes(self) -> int:
        return self._env_int(
            "CODESNIFF_SYMBOL_PARSE_MAX_BYTES",
            self.DEFAULT_SYMBOL_PARSE_MAX_BYTES,
            minimum=1,
        )

    def _symbol_parse_max_lines(self) -> int:
        return self._env_int(
            "CODESNIFF_SYMBOL_PARSE_MAX_LINES",
            self.DEFAULT_SYMBOL_PARSE_MAX_LINES,
            minimum=1,
        )

    def _symbol_parse_max_line_chars(self) -> int:
        return self._env_int(
            "CODESNIFF_SYMBOL_PARSE_MAX_LINE_CHARS",
            self.DEFAULT_SYMBOL_PARSE_MAX_LINE_CHARS,
            minimum=1,
        )

    def _generic_chunk_max_bytes(self) -> int:
        return self._env_int(
            "CODESNIFF_GENERIC_CHUNK_MAX_BYTES",
            self.DEFAULT_GENERIC_CHUNK_MAX_BYTES,
            minimum=1,
        )

    def _bounded_fallback_sample_bytes(self) -> int:
        return self._env_int(
            "CODESNIFF_BOUNDED_FALLBACK_SAMPLE_BYTES",
            self.DEFAULT_BOUNDED_FALLBACK_SAMPLE_BYTES,
            minimum=0,
        )

    def _file_blob_max_bytes(self) -> int:
        return self._env_int(
            "CODESNIFF_FILE_BLOB_MAX_BYTES",
            self.DEFAULT_FILE_BLOB_MAX_BYTES,
            minimum=0,
        )

    def _is_supported_file(self, path: Path) -> bool:
        """Return whether the file should be indexed by a parser or generic chunks."""
        if self._is_excluded_file(path):
            return False
        return path.suffix.lower() in self.all_extensions or path.name.lower() in self.generic_filenames

    def _is_excluded_file(self, path: Path) -> bool:
        name = path.name.lower()
        if name in self.EXCLUDED_FILENAMES:
            return True
        if name.endswith(('.min.js', '.min.css')):
            return True
        return False

    def _bounded_symbol_code(self, code: Optional[str]) -> str:
        text = code or ""
        if len(text) <= self.MAX_STORED_SYMBOL_CODE_CHARS:
            return text
        return text[:self.MAX_STORED_SYMBOL_CODE_CHARS] + self.SYMBOL_TRUNCATION_MARKER

    def _path_content_hash(self, path: Path) -> str:
        try:
            stat = path.stat()
            return f"bounded:{stat.st_size}:{stat.st_mtime_ns}"
        except OSError:
            return "bounded:missing"

    def _content_hash_for_source(self, path: Path, source_bytes: Optional[bytes]) -> str:
        if source_bytes is None:
            return self._path_content_hash(path)
        return self._hash_source_bytes(source_bytes)

    def _should_defer_full_source_read(self, path: Path) -> bool:
        try:
            return path.stat().st_size > self._full_source_read_max_bytes()
        except OSError:
            return False

    def _bounded_read_reason(self, path: Path) -> str:
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        return (
            f"source file is {size} bytes, above the "
            f"{self._full_source_read_max_bytes()} byte full-read limit"
        )

    def _bounded_parse_reason(
        self,
        file_path: str,
        source_bytes: Optional[bytes],
        is_generic_file: bool,
    ) -> Optional[str]:
        if source_bytes is None:
            return self._bounded_read_reason(Path(file_path))

        size = len(source_bytes)
        if is_generic_file and size > self._generic_chunk_max_bytes():
            return (
                f"generic file is {size} bytes, above the "
                f"{self._generic_chunk_max_bytes()} byte chunking limit"
            )
        if not is_generic_file and size > self._symbol_parse_max_bytes():
            return (
                f"source file is {size} bytes, above the "
                f"{self._symbol_parse_max_bytes()} byte symbol-parse limit"
            )

        if not is_generic_file:
            line_count = source_bytes.count(b"\n") + 1
            if line_count > self._symbol_parse_max_lines():
                return (
                    f"source file has {line_count} lines, above the "
                    f"{self._symbol_parse_max_lines()} line symbol-parse limit"
                )

            max_line_chars = self._symbol_parse_max_line_chars()
            for raw_line in source_bytes.splitlines():
                if len(raw_line) > max_line_chars:
                    return (
                        f"source file contains a line longer than "
                        f"{max_line_chars} bytes"
                    )

        return None

    def _relative_index_path(self, path: Path) -> str:
        try:
            if self._active_index_root is not None:
                return path.relative_to(self._active_index_root).as_posix()
        except ValueError:
            pass
        return path.as_posix()

    def _fallback_total_lines(self, source_bytes: Optional[bytes]) -> int:
        if not source_bytes:
            return 1
        return max(1, source_bytes.count(b"\n") + 1)

    def _fallback_chunks_from_sample(
        self,
        path: Path,
        source_bytes: Optional[bytes],
        total_lines: int,
        reason: str,
    ) -> List[Dict]:
        relative_path = self._relative_index_path(path)
        symbols_to_index: List[Dict] = [
            {
                "type": "file",
                "data": ParsedGenericChunk(
                    name=f"{path.name} bounded file",
                    code=(
                        f"{relative_path}\n"
                        f"{path.name}\n"
                        f"{path.suffix.lower().lstrip('.')}\n"
                        f"Bounded fallback: {reason}"
                    ),
                    start_line=1,
                    end_line=max(1, total_lines),
                    docstring=(
                        "Bounded fallback entry; CodeSniff skipped full parsing "
                        "to keep indexing responsive."
                    ),
                ),
            }
        ]

        if not source_bytes:
            return symbols_to_index

        sample_size = self._bounded_fallback_sample_bytes()
        if sample_size <= 0:
            return symbols_to_index

        sample = source_bytes[:sample_size]
        source = self._decode_source_text(sample)
        lines = source.splitlines()
        if not lines:
            return symbols_to_index

        start = 0
        chunk_number = 1
        while start < len(lines) and chunk_number <= self.BOUNDED_FALLBACK_MAX_CHUNKS:
            end = min(len(lines), start + self.BOUNDED_FALLBACK_CHUNK_LINES)
            text = "\n".join(lines[start:end]).strip()
            if text:
                symbols_to_index.append({
                    "type": "chunk",
                    "data": ParsedGenericChunk(
                        name=f"{path.name} bounded chunk {chunk_number}",
                        code=text,
                        start_line=start + 1,
                        end_line=end,
                        docstring=(
                            "Bounded sample from a file that skipped full parsing."
                        ),
                    ),
                })
            start = end
            chunk_number += 1

        return symbols_to_index

    def _index_file_bounded_fallback(
        self,
        file_path: str,
        stats: IndexStats,
        reason: str,
        semantic: bool,
        cancel_check: Optional[Callable[[], bool]],
        replace_existing: bool,
        source_bytes: Optional[bytes],
        deferred_symbol_records: Optional[List[SymbolRecord]],
    ) -> IndexStats:
        path = Path(file_path)
        total_lines = self._fallback_total_lines(source_bytes)
        file_id = self.metadata_store.add_file(
            path=file_path,
            total_lines=total_lines,
            content_hash=self._content_hash_for_source(path, source_bytes),
            replace_existing=replace_existing,
        )
        stats.total_lines = total_lines
        symbols_to_index = self._fallback_chunks_from_sample(path, source_bytes, total_lines, reason)
        stats.total_symbols = len(symbols_to_index)

        if symbols_to_index:
            self._index_symbols(
                symbols_to_index,
                file_id,
                file_path,
                semantic=semantic,
                cancel_check=cancel_check,
                deferred_symbol_records=deferred_symbol_records,
            )

        logger.info(f"Indexed {file_path} with bounded fallback: {reason}")
        stats.files_processed = 1
        return stats

    def _discover_supported_files(self, directory: Path) -> tuple[List[Path], int]:
        """
        Walk a repo without descending into directories that cannot affect the fast index.

        Path.rglob filters ignored files after recursion, which still burns time on
        huge dependency/build trees. os.walk lets us prune dirs before traversal.
        """
        all_files: List[Path] = []
        directories_pruned = 0

        for root, dir_names, file_names in os.walk(directory):
            kept_dirs = []
            for dir_name in dir_names:
                if dir_name.lower() in self.EXCLUDED_DIRS:
                    directories_pruned += 1
                    continue
                kept_dirs.append(dir_name)
            dir_names[:] = kept_dirs

            root_path = Path(root)
            for file_name in file_names:
                path = root_path / file_name
                if self._is_supported_file(path):
                    all_files.append(path)

        all_files.sort(key=lambda item: item.as_posix().lower())
        return all_files, directories_pruned

    def index_directory(
        self,
        directory_path: str,
        show_progress: bool = True,
        semantic: bool = True,
        progress_callback: Optional[Callable[[IndexStats], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
        shallow: bool = False,
        resume_existing: bool = False,
        transaction_batch_size: Optional[int] = None,
        max_files: Optional[int] = None,
        max_seconds: Optional[float] = None,
    ) -> IndexStats:
        """
        Index all supported code files in a directory

        Args:
            directory_path: Path to directory containing code files
            show_progress: Whether to show progress bar
            semantic: Whether to generate CodeBERT vectors during indexing
            progress_callback: Optional callback after each file updates stats
            cancel_check: Optional callback returning True when indexing should stop
            shallow: Index file inventory/path chunks only, without reading source contents
            resume_existing: Skip files already present with the same content hash
            transaction_batch_size: Commit every N files instead of one repo-wide transaction
            max_files: Stop after indexing this many changed/unindexed files
            max_seconds: Stop after this many elapsed seconds, checked between files

        Returns:
            IndexStats with indexing statistics
        """
        start_time = time.time()
        stats = IndexStats()

        directory = Path(directory_path).resolve()
        all_files, directories_pruned = self._discover_supported_files(directory)
        stats.files_discovered = len(all_files)
        stats.directories_pruned = directories_pruned
        replace_existing_files = self.metadata_store.has_files()

        logger.info(
            f"Found {len(all_files)} code files in {directory_path}; "
            f"pruned {directories_pruned} ignored directories"
        )

        self._raise_if_canceled(cancel_check)

        if shallow:
            return self._index_directory_shallow(
                directory=directory,
                all_files=all_files,
                directories_pruned=directories_pruned,
                start_time=start_time,
                show_progress=show_progress,
                semantic=semantic,
                progress_callback=progress_callback,
                cancel_check=cancel_check,
                replace_existing_files=replace_existing_files,
            )

        self._index_directory_deep(
            directory=directory,
            all_files=all_files,
            stats=stats,
            show_progress=show_progress,
            semantic=semantic,
            progress_callback=progress_callback,
            cancel_check=cancel_check,
            replace_existing_files=replace_existing_files,
            resume_existing=resume_existing,
            transaction_batch_size=transaction_batch_size,
            max_files=max_files,
            max_seconds=max_seconds,
            start_time=start_time,
        )

        stats.time_taken = time.time() - start_time

        logger.info(f"Indexing complete: {stats.files_processed} files, {stats.total_symbols} symbols in {stats.time_taken:.2f}s")

        return stats

    def _index_directory_deep(
        self,
        directory: Path,
        all_files: List[Path],
        stats: IndexStats,
        show_progress: bool,
        semantic: bool,
        progress_callback: Optional[Callable[[IndexStats], None]],
        cancel_check: Optional[Callable[[], bool]],
        replace_existing_files: bool,
        resume_existing: bool,
        transaction_batch_size: Optional[int],
        max_files: Optional[int],
        max_seconds: Optional[float],
        start_time: float,
    ):
        previous_root = self._active_index_root
        self._active_index_root = directory.resolve()
        progress_bar = tqdm(total=len(all_files), desc="Indexing files") if show_progress else None
        deferred_symbol_records: Optional[List[SymbolRecord]] = [] if not semantic and not self.build_text_index else None
        existing_hashes = self.metadata_store.get_file_hashes() if resume_existing and replace_existing_files else {}
        batch_size = self._normalize_transaction_batch_size(transaction_batch_size)
        file_budget = self._normalize_max_files(max_files)
        time_budget = self._normalize_max_seconds(max_seconds)
        changed_files_attempted = 0
        files_examined = 0
        limit_hit = False

        try:
            self._delete_missing_resumable_files(existing_hashes, all_files)
            batches = self._file_batches(all_files, batch_size)
            for batch_files in batches:
                with self.metadata_store.transaction():
                    for code_file, source_bytes, read_error in self._iter_prefetched_sources(batch_files, cancel_check):
                        if file_budget is not None and changed_files_attempted >= file_budget:
                            limit_hit = True
                            break
                        try:
                            if read_error is not None and read_error != self.BOUNDED_SOURCE_FALLBACK:
                                changed_files_attempted += 1
                                file_stats = IndexStats(files_failed=1)
                            elif self._should_skip_resumable_file(code_file, source_bytes, existing_hashes):
                                file_stats = IndexStats(files_processed=1, files_skipped=1)
                            else:
                                changed_files_attempted += 1
                                bounded_reason = (
                                    self._bounded_read_reason(code_file)
                                    if read_error == self.BOUNDED_SOURCE_FALLBACK
                                    else None
                                )
                                file_stats = self.index_file(
                                    str(code_file),
                                    semantic=semantic,
                                    cancel_check=cancel_check,
                                    replace_existing=replace_existing_files,
                                    source_bytes=source_bytes,
                                    source_loaded=True,
                                    force_bounded_reason=bounded_reason,
                                    deferred_symbol_records=deferred_symbol_records,
                                )

                            self._merge_file_stats(stats, file_stats)

                        except IndexingCanceled:
                            raise
                        except Exception as e:
                            logger.error(f"Failed to index {code_file}: {e}")
                            stats.files_failed += 1

                        files_examined += 1
                        self._report_index_progress(stats, progress_callback, progress_bar)
                        self._flush_deferred_symbol_records(deferred_symbol_records, force=False)
                        if (
                            time_budget is not None
                            and changed_files_attempted > 0
                            and files_examined < len(all_files)
                            and time.time() - start_time >= time_budget
                        ):
                            limit_hit = True
                            break
                    self._flush_deferred_symbol_records(deferred_symbol_records, force=True)
                if limit_hit:
                    stats.complete = False
                    break
        finally:
            if progress_bar:
                progress_bar.close()
            self._active_index_root = previous_root

        if resume_existing:
            db_stats = self.metadata_store.get_stats()
            stats.files_processed = db_stats["total_files"]
            stats.total_symbols = db_stats["total_symbols"]

    @staticmethod
    def _normalize_transaction_batch_size(value: Optional[int]) -> int:
        if value is None:
            return 0
        try:
            return max(1, int(value))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _normalize_max_files(value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        try:
            return max(1, int(value))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _normalize_max_seconds(value: Optional[float]) -> Optional[float]:
        if value is None:
            return None
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            return None
        if seconds <= 0:
            return None
        return seconds

    @staticmethod
    def _file_batches(all_files: List[Path], batch_size: int):
        if batch_size <= 0:
            yield all_files
            return
        for start in range(0, len(all_files), batch_size):
            yield all_files[start:start + batch_size]

    def _delete_missing_resumable_files(self, existing_hashes: Dict[str, Optional[str]], all_files: List[Path]):
        if not existing_hashes:
            return
        current_paths = {str(path) for path in all_files}
        stale_paths = sorted(set(existing_hashes) - current_paths)
        if not stale_paths:
            return
        with self.metadata_store.transaction():
            for path in stale_paths:
                self.metadata_store.delete_file_by_path(path)

    def _should_skip_resumable_file(
        self,
        code_file: Path,
        source_bytes: Optional[bytes],
        existing_hashes: Dict[str, Optional[str]],
    ) -> bool:
        if not existing_hashes:
            return False
        return existing_hashes.get(str(code_file)) == self._content_hash_for_source(code_file, source_bytes)

    @staticmethod
    def _merge_file_stats(stats: IndexStats, file_stats: IndexStats):
        if file_stats.files_failed > 0:
            stats.files_failed += file_stats.files_failed
            return
        stats.files_processed += file_stats.files_processed
        stats.files_skipped += file_stats.files_skipped
        stats.total_symbols += file_stats.total_symbols
        stats.functions_indexed += file_stats.functions_indexed
        stats.classes_indexed += file_stats.classes_indexed
        stats.methods_indexed += file_stats.methods_indexed
        stats.total_lines += file_stats.total_lines

    @staticmethod
    def _report_index_progress(
        stats: IndexStats,
        progress_callback: Optional[Callable[[IndexStats], None]],
        progress_bar,
    ):
        if progress_callback:
            try:
                progress_callback(stats)
            except Exception as e:
                logger.warning(f"Index progress callback failed: {e}")
        if progress_bar:
            progress_bar.update(1)

    def _index_directory_shallow(
        self,
        directory: Path,
        all_files: List[Path],
        directories_pruned: int,
        start_time: float,
        show_progress: bool,
        semantic: bool,
        progress_callback: Optional[Callable[[IndexStats], None]],
        cancel_check: Optional[Callable[[], bool]],
        replace_existing_files: bool,
    ) -> IndexStats:
        """Index a large repo as a searchable file inventory without source reads."""
        if not semantic and not self.build_text_index and not replace_existing_files:
            return self._index_directory_shallow_batched(
                directory=directory,
                all_files=all_files,
                directories_pruned=directories_pruned,
                start_time=start_time,
                show_progress=show_progress,
                progress_callback=progress_callback,
                cancel_check=cancel_check,
            )

        stats = IndexStats(
            files_discovered=len(all_files),
            directories_pruned=directories_pruned,
        )
        previous_root = self._active_index_root
        self._active_index_root = directory.resolve()
        progress_bar = tqdm(total=len(all_files), desc="Inventory indexing files") if show_progress else None
        deferred_symbol_records: Optional[List[SymbolRecord]] = [] if not semantic and not self.build_text_index else None
        try:
            with self.metadata_store.transaction():
                for code_file in all_files:
                    try:
                        file_stats = self._index_file_shallow(
                            code_file,
                            source_root=directory,
                            semantic=semantic,
                            cancel_check=cancel_check,
                            replace_existing=replace_existing_files,
                            deferred_symbol_records=deferred_symbol_records,
                        )

                        if file_stats.files_failed > 0:
                            stats.files_failed += file_stats.files_failed
                        else:
                            stats.files_processed += file_stats.files_processed
                            stats.total_symbols += file_stats.total_symbols
                            stats.total_lines += file_stats.total_lines

                    except IndexingCanceled:
                        raise
                    except Exception as e:
                        logger.error(f"Failed to shallow-index {code_file}: {e}")
                        stats.files_failed += 1

                    if progress_callback:
                        try:
                            progress_callback(stats)
                        except Exception as e:
                            logger.warning(f"Index progress callback failed: {e}")
                    if progress_bar:
                        progress_bar.update(1)
                    self._flush_deferred_symbol_records(deferred_symbol_records, force=False)
                self._flush_deferred_symbol_records(deferred_symbol_records, force=True)
        finally:
            if progress_bar:
                progress_bar.close()
            self._active_index_root = previous_root

        stats.time_taken = time.time() - start_time
        logger.info(
            f"Shallow indexing complete: {stats.files_processed} files, "
            f"{stats.total_symbols} file entries in {stats.time_taken:.2f}s"
        )
        return stats

    def _index_directory_shallow_batched(
        self,
        directory: Path,
        all_files: List[Path],
        directories_pruned: int,
        start_time: float,
        show_progress: bool,
        progress_callback: Optional[Callable[[IndexStats], None]],
        cancel_check: Optional[Callable[[], bool]],
    ) -> IndexStats:
        """Write shallow file inventory rows in batches for large repos."""
        stats = IndexStats(
            files_discovered=len(all_files),
            directories_pruned=directories_pruned,
        )
        previous_root = self._active_index_root
        self._active_index_root = directory.resolve()
        progress_bar = tqdm(total=len(all_files), desc="Inventory indexing files") if show_progress else None

        try:
            for batch_files in self._file_batches(all_files, self.SHALLOW_FILE_BATCH_SIZE):
                self._raise_if_canceled(cancel_check)
                file_records: List[Dict[str, Any]] = []
                symbol_inputs: List[tuple[str, str, str, str]] = []

                for code_file in batch_files:
                    try:
                        file_stat = code_file.stat()
                    except OSError as e:
                        logger.warning(f"Failed to stat source file for shallow index {code_file}: {e}")
                        stats.files_failed += 1
                        continue

                    try:
                        relative_path = code_file.relative_to(directory).as_posix()
                    except ValueError:
                        relative_path = code_file.as_posix()

                    path_text = str(code_file)
                    file_records.append({
                        "path": path_text,
                        "total_lines": 0,
                        "content_hash": f"shallow:{file_stat.st_size}:{file_stat.st_mtime_ns}",
                    })
                    symbol_inputs.append((
                        path_text,
                        relative_path,
                        code_file.name,
                        code_file.suffix.lower().lstrip("."),
                    ))

                if file_records:
                    with self.metadata_store.transaction():
                        file_ids = self.metadata_store.add_files_batch(file_records)
                        start_embedding_id = self.metadata_store.reserve_embedding_ids(len(symbol_inputs))
                        symbol_records: List[SymbolRecord] = []
                        for offset, (path_text, relative_path, file_name, extension) in enumerate(symbol_inputs):
                            file_id = file_ids.get(path_text)
                            if file_id is None:
                                raise RuntimeError(f"Missing shallow file row for {path_text}")
                            symbol_records.append(SymbolRecord(
                                file_id=file_id,
                                name=relative_path,
                                symbol_type="file",
                                code=f"{relative_path}\n{file_name}\n{extension}",
                                start_line=1,
                                end_line=1,
                                docstring="Shallow file inventory entry; content indexing pending.",
                                embedding_id=start_embedding_id + offset,
                            ))
                        self.metadata_store.add_symbols_batch(symbol_records)

                    stats.files_processed += len(symbol_inputs)
                    stats.total_symbols += len(symbol_inputs)

                if progress_callback:
                    try:
                        progress_callback(stats)
                    except Exception as e:
                        logger.warning(f"Index progress callback failed: {e}")
                if progress_bar:
                    progress_bar.update(len(batch_files))
        finally:
            if progress_bar:
                progress_bar.close()
            self._active_index_root = previous_root

        stats.time_taken = time.time() - start_time
        logger.info(
            f"Shallow batch indexing complete: {stats.files_processed} files, "
            f"{stats.total_symbols} file entries in {stats.time_taken:.2f}s"
        )
        return stats

    def _index_file_shallow(
        self,
        file_path: Path,
        source_root: Path,
        semantic: bool,
        cancel_check: Optional[Callable[[], bool]],
        replace_existing: bool,
        deferred_symbol_records: Optional[List[SymbolRecord]],
    ) -> IndexStats:
        """Write one path-level searchable file entry without parsing source."""
        self._raise_if_canceled(cancel_check)
        stats = IndexStats()
        try:
            file_stat = file_path.stat()
        except OSError as e:
            logger.warning(f"Failed to stat source file for shallow index {file_path}: {e}")
            stats.files_failed = 1
            return stats

        try:
            relative_path = file_path.relative_to(source_root).as_posix()
        except ValueError:
            relative_path = file_path.as_posix()

        content_hash = f"shallow:{file_stat.st_size}:{file_stat.st_mtime_ns}"
        file_id = self.metadata_store.add_file(
            path=str(file_path),
            total_lines=0,
            content_hash=content_hash,
            replace_existing=replace_existing,
        )
        file_entry = ParsedGenericChunk(
            name=relative_path,
            code=f"{relative_path}\n{file_path.name}\n{file_path.suffix.lower().lstrip('.')}",
            start_line=1,
            end_line=1,
            docstring="Shallow file inventory entry; content indexing pending.",
        )
        symbols_to_index = [{"type": "file", "data": file_entry}]
        self._index_symbols(
            symbols_to_index,
            file_id,
            str(file_path),
            semantic=semantic,
            cancel_check=cancel_check,
            deferred_symbol_records=deferred_symbol_records,
        )
        stats.files_processed = 1
        stats.total_symbols = 1
        return stats

    def index_changed_files(
        self,
        changed_files: List[Path],
        deleted_paths: Optional[List[str]] = None,
        show_progress: bool = False,
        semantic: bool = True,
        progress_callback: Optional[Callable[[IndexStats], None]] = None,
        cancel_check: Optional[Callable[[], bool]] = None,
        files_discovered: Optional[int] = None,
        directories_pruned: int = 0,
        source_root: Optional[Path] = None,
    ) -> IndexStats:
        """
        Update an existing metadata store for a diff-aware refresh.

        Deleted paths are removed first, then changed files are reindexed. The
        caller owns atomic artifact replacement; this method only mutates the
        provided metadata store.
        """
        start_time = time.time()
        stats = IndexStats(
            files_discovered=files_discovered if files_discovered is not None else len(changed_files),
            directories_pruned=directories_pruned,
        )
        deleted_paths = deleted_paths or []
        iterator = tqdm(changed_files, desc="Indexing changed files") if show_progress else changed_files

        previous_root = self._active_index_root
        self._active_index_root = Path(source_root).resolve() if source_root else previous_root
        try:
            with self.metadata_store.transaction():
                for file_path in deleted_paths:
                    self._raise_if_canceled(cancel_check)
                    self.metadata_store.delete_file_by_path(file_path)

                for code_file in iterator:
                    try:
                        self._raise_if_canceled(cancel_check)
                        self.metadata_store.delete_file_by_path(str(code_file))
                        file_stats = self.index_file(
                            str(code_file),
                            semantic=semantic,
                            cancel_check=cancel_check,
                            replace_existing=False,
                        )

                        if file_stats.files_failed > 0:
                            stats.files_failed += file_stats.files_failed
                        else:
                            stats.files_processed += file_stats.files_processed
                            stats.total_symbols += file_stats.total_symbols
                            stats.functions_indexed += file_stats.functions_indexed
                            stats.classes_indexed += file_stats.classes_indexed
                            stats.methods_indexed += file_stats.methods_indexed
                            stats.total_lines += file_stats.total_lines

                    except IndexingCanceled:
                        raise
                    except Exception as e:
                        logger.error(f"Failed to index changed file {code_file}: {e}")
                        stats.files_failed += 1

                    if progress_callback:
                        try:
                            progress_callback(stats)
                        except Exception as e:
                            logger.warning(f"Index progress callback failed: {e}")
        finally:
            self._active_index_root = previous_root

        stats.time_taken = time.time() - start_time
        logger.info(
            f"Incremental indexing complete: {stats.files_processed} changed files, "
            f"{len(deleted_paths)} deleted files, {stats.total_symbols} symbols in {stats.time_taken:.2f}s"
        )
        return stats

    def index_file(
        self,
        file_path: str,
        semantic: bool = True,
        cancel_check: Optional[Callable[[], bool]] = None,
        replace_existing: bool = True,
        source_bytes: Optional[bytes] = None,
        source_loaded: bool = False,
        force_bounded_reason: Optional[str] = None,
        deferred_symbol_records: Optional[List[SymbolRecord]] = None,
    ) -> IndexStats:
        """
        Index a single code file (Python, JavaScript/TypeScript, Java, or Kotlin)

        Args:
            file_path: Path to code file
            semantic: Whether to generate CodeBERT vectors during indexing
            cancel_check: Optional callback returning True when indexing should stop

        Returns:
            IndexStats for this file
        """
        stats = IndexStats()
        path = Path(file_path)
        file_ext = path.suffix.lower()
        self._raise_if_canceled(cancel_check)
        is_generic_file = file_ext in self.generic_extensions or path.name.lower() in self.generic_filenames

        if force_bounded_reason is not None:
            return self._index_file_bounded_fallback(
                file_path,
                stats,
                reason=force_bounded_reason,
                semantic=semantic,
                cancel_check=cancel_check,
                replace_existing=replace_existing,
                source_bytes=source_bytes,
                deferred_symbol_records=deferred_symbol_records,
            )

        if source_loaded and source_bytes is None:
            return self._index_file_bounded_fallback(
                file_path,
                stats,
                reason=self._bounded_read_reason(path),
                semantic=semantic,
                cancel_check=cancel_check,
                replace_existing=replace_existing,
                source_bytes=None,
                deferred_symbol_records=deferred_symbol_records,
            )

        if not source_loaded and self._should_defer_full_source_read(path):
            return self._index_file_bounded_fallback(
                file_path,
                stats,
                reason=self._bounded_read_reason(path),
                semantic=semantic,
                cancel_check=cancel_check,
                replace_existing=replace_existing,
                source_bytes=None,
                deferred_symbol_records=deferred_symbol_records,
            )

        if is_generic_file:
            if not source_loaded:
                source_bytes = self._read_source_bytes(file_path)
            if source_bytes is None:
                stats.files_failed = 1
                return stats
            bounded_reason = self._bounded_parse_reason(file_path, source_bytes, is_generic_file=True)
            if bounded_reason is not None:
                return self._index_file_bounded_fallback(
                    file_path,
                    stats,
                    reason=bounded_reason,
                    semantic=semantic,
                    cancel_check=cancel_check,
                    replace_existing=replace_existing,
                    source_bytes=source_bytes,
                    deferred_symbol_records=deferred_symbol_records,
                )
            file_id, symbols_to_index, source_bytes = self._extract_generic_chunks(
                file_path,
                stats,
                replace_existing=replace_existing,
                source_bytes=source_bytes,
            )
            if stats.files_failed:
                return stats
            source_text = None
        else:
            source_bytes = source_bytes if source_loaded else self._read_source_bytes(file_path)
            if source_bytes is None:
                stats.files_failed = 1
                return stats
            bounded_reason = self._bounded_parse_reason(file_path, source_bytes, is_generic_file=False)
            if bounded_reason is not None:
                return self._index_file_bounded_fallback(
                    file_path,
                    stats,
                    reason=bounded_reason,
                    semantic=semantic,
                    cancel_check=cancel_check,
                    replace_existing=replace_existing,
                    source_bytes=source_bytes,
                    deferred_symbol_records=deferred_symbol_records,
                )
            source_hash = self._hash_source_bytes(source_bytes)
            source_text = None

        # Parse file based on extension
        if file_ext in self.python_extensions:
            parsed_file = self.parser.parse_source_bytes(file_path, source_bytes or b"")
            if not parsed_file:
                logger.warning(f"Failed to parse Python file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Python file
            symbols_to_index = self._extract_python_symbols(parsed_file, stats)

        elif file_ext in self.js_extensions:
            parsed_file = self.js_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse JS/TS file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from JS/TS file
            symbols_to_index = self._extract_js_symbols(parsed_file, stats)

        elif file_ext in self.java_extensions:
            parsed_file = self.java_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Java/Kotlin file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Java/Kotlin file
            symbols_to_index = self._extract_java_symbols(parsed_file, stats)

        elif file_ext in self.html_css_extensions:
            parsed_file = self.html_css_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse HTML/CSS file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from HTML/CSS file
            symbols_to_index = self._extract_html_css_symbols(parsed_file, stats)

        elif file_ext in self.c_cpp_extensions:
            parsed_file = self.c_cpp_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse C/C++ file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from C/C++ file
            symbols_to_index = self._extract_c_cpp_symbols(parsed_file, stats)

        elif file_ext in self.csharp_extensions:
            parsed_file = self.csharp_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse C# file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from C# file
            symbols_to_index = self._extract_csharp_symbols(parsed_file, stats)

        elif file_ext in self.go_extensions:
            parsed_file = self.go_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Go file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Go file
            symbols_to_index = self._extract_go_symbols(parsed_file, stats)

        elif file_ext in self.rust_extensions:
            parsed_file = self.rust_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Rust file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Rust file
            symbols_to_index = self._extract_rust_symbols(parsed_file, stats)

        elif file_ext in self.ruby_extensions:
            parsed_file = self.ruby_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Ruby file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Ruby file
            symbols_to_index = self._extract_ruby_symbols(parsed_file, stats)

        elif file_ext in self.php_extensions:
            parsed_file = self.php_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse PHP file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from PHP file
            symbols_to_index = self._extract_php_symbols(parsed_file, stats)

        elif file_ext in self.bash_extensions:
            parsed_file = self.bash_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Bash file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Bash file
            symbols_to_index = self._extract_bash_symbols(parsed_file, stats)

        elif file_ext in self.sql_extensions:
            parsed_file = self.sql_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse SQL file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from SQL file
            symbols_to_index = self._extract_sql_symbols(parsed_file, stats)

        elif file_ext in self.shader_extensions:
            parsed_file = self.shader_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse shader file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from shader file
            symbols_to_index = self._extract_shader_symbols(parsed_file, stats)

        elif file_ext in self.scala_extensions:
            parsed_file = self.scala_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Scala file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_scala_symbols(parsed_file, stats)

        elif file_ext in self.lua_extensions:
            parsed_file = self.lua_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Lua file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_lua_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable Lua chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.swift_extensions:
            parsed_file = self.swift_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Swift file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_swift_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable Swift chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.dart_extensions:
            parsed_file = self.dart_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Dart file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_dart_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable Dart chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.hcl_extensions:
            parsed_file = self.hcl_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse HCL/Terraform file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_hcl_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable HCL/Terraform chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.graphql_extensions:
            parsed_file = self.graphql_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse GraphQL file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_graphql_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable GraphQL chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.protobuf_extensions:
            parsed_file = self.protobuf_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse protobuf file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_protobuf_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable protobuf chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.powershell_extensions:
            parsed_file = self.powershell_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse PowerShell file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_powershell_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable PowerShell chunk from {path.name}"
                        )
                    }]

        elif file_ext in self.elixir_extensions:
            parsed_file = self.elixir_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Elixir file {file_path}")
                stats.files_failed = 1
                return stats

            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines,
                content_hash=source_hash,
                replace_existing=replace_existing,
            )
            stats.total_lines = parsed_file.total_lines

            symbols_to_index = self._extract_elixir_symbols(parsed_file, stats)
            if not symbols_to_index:
                fallback_text = self._decode_source_text(source_bytes).strip() if source_bytes else ""
                if fallback_text:
                    symbols_to_index = [{
                        'type': 'chunk',
                        'data': ParsedGenericChunk(
                            name=f"{path.name} chunk 1",
                            code=fallback_text,
                            start_line=1,
                            end_line=parsed_file.total_lines,
                            docstring=f"Searchable Elixir chunk from {path.name}"
                        )
                    }]

        elif not is_generic_file:
            logger.warning(f"Unsupported file type: {file_path}")
            stats.files_failed = 1
            return stats

        stats.total_symbols = len(symbols_to_index)

        self._store_file_blob(file_id, file_path, source_bytes)

        self._raise_if_canceled(cancel_check)
        relationships = self._extract_import_relationships(file_path, file_id, source_text=source_text, source_bytes=source_bytes)
        if relationships:
            self.metadata_store.add_relationships_batch(relationships)

        if symbols_to_index:
            # Generate embeddings for all symbols
            self._index_symbols(
                symbols_to_index,
                file_id,
                file_path,
                semantic=semantic,
                cancel_check=cancel_check,
                deferred_symbol_records=deferred_symbol_records,
            )

        stats.files_processed = 1
        return stats

    @staticmethod
    def _hash_source_bytes(source_bytes: bytes) -> str:
        return hashlib.sha256(source_bytes).hexdigest()

    @staticmethod
    def _decode_source_text(source_bytes: bytes) -> str:
        return source_bytes.decode("utf-8-sig", errors="replace")

    def _read_source_bytes(self, file_path: str) -> Optional[bytes]:
        try:
            return Path(file_path).read_bytes()
        except OSError as e:
            logger.warning(f"Failed to read source bytes for {file_path}: {e}")
            return None

    def _read_source_for_prefetch(self, path: Path) -> tuple[Optional[bytes], Optional[str]]:
        if self._should_defer_full_source_read(path):
            return None, self.BOUNDED_SOURCE_FALLBACK
        try:
            return path.read_bytes(), None
        except OSError as e:
            return None, str(e)

    def _source_prefetch_worker(self, path: Path) -> tuple[Path, Optional[bytes], Optional[str]]:
        source_bytes, error = self._read_source_for_prefetch(path)
        return path, source_bytes, error

    def _source_prefetch_workers(self) -> int:
        configured = os.getenv("CODESNIFF_INDEX_READ_WORKERS")
        if configured:
            try:
                return max(1, int(configured))
            except ValueError:
                logger.warning(f"Invalid CODESNIFF_INDEX_READ_WORKERS value: {configured}")
        cpu_count = os.cpu_count() or 4
        return max(4, min(16, cpu_count * 4))

    def _iter_prefetched_sources(
        self,
        paths: List[Path],
        cancel_check: Optional[Callable[[], bool]] = None,
    ):
        workers = self._source_prefetch_workers()
        if workers <= 1 or len(paths) <= 1:
            for path in paths:
                self._raise_if_canceled(cancel_check)
                source_bytes, error = self._read_source_for_prefetch(path)
                if error and error != self.BOUNDED_SOURCE_FALLBACK:
                    logger.warning(f"Failed to read source bytes for {path}: {error}")
                yield path, source_bytes, error
            return

        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="codesniff-read") as executor:
            starts = list(range(0, len(paths), self.SOURCE_PREFETCH_BATCH_SIZE))
            if not starts:
                return

            current = executor.map(
                self._source_prefetch_worker,
                paths[starts[0]:starts[0] + self.SOURCE_PREFETCH_BATCH_SIZE],
            )
            for start in starts[1:]:
                self._raise_if_canceled(cancel_check)
                next_results = executor.map(
                    self._source_prefetch_worker,
                    paths[start:start + self.SOURCE_PREFETCH_BATCH_SIZE],
                )
                for path, source_bytes, error in current:
                    self._raise_if_canceled(cancel_check)
                    if error and error != self.BOUNDED_SOURCE_FALLBACK:
                        logger.warning(f"Failed to read source bytes for {path}: {error}")
                    yield path, source_bytes, error
                current = next_results

            for path, source_bytes, error in current:
                self._raise_if_canceled(cancel_check)
                if error and error != self.BOUNDED_SOURCE_FALLBACK:
                    logger.warning(f"Failed to read source bytes for {path}: {error}")
                yield path, source_bytes, error

    def _store_file_blob(self, file_id: int, file_path: str, source_bytes: Optional[bytes] = None):
        try:
            if source_bytes is None and self._should_defer_full_source_read(Path(file_path)):
                logger.info(f"Skipping source blob over {self._full_source_read_max_bytes()} bytes: {file_path}")
                return
            content = source_bytes if source_bytes is not None else Path(file_path).read_bytes()
            max_blob_bytes = self._file_blob_max_bytes()
            if max_blob_bytes and len(content) > max_blob_bytes:
                logger.info(f"Skipping source blob over {max_blob_bytes} bytes: {file_path}")
                return
            self.metadata_store.set_file_blob(file_id, content)
        except OSError as e:
            logger.warning(f"Failed to store source blob for {file_path}: {e}")

    def _flush_deferred_symbol_records(
        self,
        deferred_symbol_records: Optional[List[SymbolRecord]],
        force: bool = False,
    ):
        if deferred_symbol_records is None:
            return
        if not deferred_symbol_records:
            return
        if not force and len(deferred_symbol_records) < self.DEFERRED_SYMBOL_FLUSH_SIZE:
            return
        records = list(deferred_symbol_records)
        deferred_symbol_records.clear()
        self.metadata_store.add_symbols_batch(records)

    def _extract_import_relationships(
        self,
        file_path: str,
        file_id: int,
        source_text: Optional[str] = None,
        source_bytes: Optional[bytes] = None,
    ) -> List[RelationshipRecord]:
        """Extract cheap file-level import edges without claiming deeper graph precision."""
        suffix = Path(file_path).suffix.lower()
        import_extensions = (
            self.python_extensions
            | {'.pyi'}
            | self.js_extensions
            | {'.mjs', '.cjs'}
            | self.go_extensions
            | self.java_extensions
            | self.csharp_extensions
            | self.ruby_extensions
            | self.php_extensions
            | self.rust_extensions
            | self.bash_extensions
            | self.scala_extensions
            | self.lua_extensions
            | self.swift_extensions
            | self.dart_extensions
            | self.hcl_extensions
            | self.protobuf_extensions
            | self.powershell_extensions
            | self.elixir_extensions
        )
        if suffix not in import_extensions:
            return []

        source = source_text
        if source is None and source_bytes is not None:
            source = self._decode_source_text(source_bytes)
        if source is None:
            try:
                source = Path(file_path).read_text(encoding='utf-8-sig', errors='replace')
            except Exception as e:
                logger.warning(f"Failed to read imports from {file_path}: {e}")
                return []

        if suffix in self.python_extensions or suffix == '.pyi':
            if "import " not in source and "from " not in source:
                return []
            return self._extract_python_import_relationships(source, file_id, file_path)
        source_path = self._relationship_source_path(file_path)
        if suffix in self.js_extensions or suffix in {'.mjs', '.cjs'}:
            if "import" not in source and "require" not in source:
                return []
            return self._extract_js_import_relationships(source, file_id, source_path)
        if suffix in self.go_extensions:
            if "import" not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*import\s+(?:[._A-Za-z]\w*\s+)?["`]([^"`]+)["`]'), 'go-import'),
                    (re.compile(r'^\s*(?:[._A-Za-z]\w*\s+)?["`]([^"`]+)["`]\s*$'), 'go-import-block'),
                ],
            )
        if suffix in self.java_extensions:
            if "import " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*import\s+(?:static\s+)?([A-Za-z_][\w.]*\.?\*?)\s*;?'), 'jvm-import'),
                ],
            )
        if suffix in self.csharp_extensions:
            if "using " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*using\s+(?:static\s+)?(?:[A-Za-z_][\w]*\s*=\s*)?([A-Za-z_][\w.]*)(?:\s*;|\s*$)'), 'csharp-using'),
                ],
            )
        if suffix in self.ruby_extensions:
            if "require" not in source and "load " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*require(?:_relative)?\s+["\']([^"\']+)["\']'), 'ruby-require'),
                    (re.compile(r'^\s*load\s+["\']([^"\']+)["\']'), 'ruby-load'),
                ],
            )
        if suffix in self.php_extensions:
            if "use " not in source and "require" not in source and "include" not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*use\s+(?:function\s+|const\s+)?([A-Za-z_\\][\w\\]*)(?:\s+as\s+[A-Za-z_][\w]*)?\s*;'), 'php-use'),
                    (re.compile(r'\b(?:require|require_once|include|include_once)\s*(?:\(?\s*)["\']([^"\']+)["\']'), 'php-include'),
                ],
            )
        if suffix in self.rust_extensions:
            if "use " not in source and "extern crate" not in source and "mod " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*use\s+([^;]+);'), 'rust-use'),
                    (re.compile(r'^\s*extern\s+crate\s+([A-Za-z_][\w]*)\s*;'), 'rust-extern-crate'),
                    (re.compile(r'^\s*(?:pub\s+)?mod\s+([A-Za-z_][\w]*)\s*;'), 'rust-mod'),
                ],
            )
        if suffix in self.bash_extensions:
            if "source " not in source and ". " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*source\s+([^\s#;&|]+)'), 'shell-source'),
                    (re.compile(r'^\s*\.\s+([^\s#;&|]+)'), 'shell-dot-source'),
                ],
            )
        if suffix in self.scala_extensions:
            if "import " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*import\s+([^;\n]+)$'), 'scala-import'),
                ],
            )
        if suffix in self.lua_extensions:
            if "require" not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'\brequire\s*(?:\(\s*)?["\']([^"\']+)["\']'), 'lua-require'),
                ],
            )
        if suffix in self.swift_extensions:
            if "import " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*(?:@(?:_exported|testable)\s+)?import\s+([A-Za-z_][\w.]*)'), 'swift-import'),
                ],
            )
        if suffix in self.dart_extensions:
            if "import " not in source and "export " not in source and "part " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*import\s+["\']([^"\']+)["\']'), 'dart-import'),
                    (re.compile(r'^\s*export\s+["\']([^"\']+)["\']'), 'dart-export'),
                    (re.compile(r'^\s*part\s+["\']([^"\']+)["\']'), 'dart-part'),
                ],
            )
        if suffix in self.hcl_extensions:
            if "source" not in source:
                return []
            return self._extract_hcl_module_source_relationships(source, file_id, source_path)
        if suffix in self.protobuf_extensions:
            if "import " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*import\s+(?:public\s+|weak\s+)?["\']([^"\']+)["\']\s*;'), 'proto-import'),
                ],
            )
        if suffix in self.powershell_extensions:
            lowered = source.lower()
            if "using " not in lowered and "import-module" not in lowered and ". " not in source:
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*using\s+module\s+["\']?([^"\'\s]+)["\']?', re.IGNORECASE), 'powershell-using-module'),
                    (re.compile(r'^\s*using\s+namespace\s+["\']?([^"\'\s]+)["\']?', re.IGNORECASE), 'powershell-using-namespace'),
                    (re.compile(r'^\s*using\s+assembly\s+["\']?([^"\'\s]+)["\']?', re.IGNORECASE), 'powershell-using-assembly'),
                    (re.compile(r'^\s*Import-Module\s+(?:-Name\s+)?["\']?([^"\'\s]+)["\']?', re.IGNORECASE), 'powershell-import-module'),
                    (re.compile(r'^\s*\.\s+["\']([^"\']+)["\']'), 'powershell-dot-source'),
                    (re.compile(r'^\s*\.\s+([^\s#;&|]+)'), 'powershell-dot-source'),
                ],
            )
        if suffix in self.elixir_extensions:
            if not any(token in source for token in ("alias ", "import ", "require ", "use ")):
                return []
            return self._extract_regex_import_relationships(
                source,
                file_id,
                source_path,
                [
                    (re.compile(r'^\s*alias\s+([A-Z][\w.]+)'), 'elixir-alias'),
                    (re.compile(r'^\s*import\s+([A-Z][\w.]+)'), 'elixir-import'),
                    (re.compile(r'^\s*require\s+([A-Z][\w.]+)'), 'elixir-require'),
                    (re.compile(r'^\s*use\s+([A-Z][\w.]+)'), 'elixir-use'),
                ],
            )
        return []

    def _extract_hcl_module_source_relationships(
        self,
        source: str,
        file_id: int,
        source_path: Optional[str],
    ) -> List[RelationshipRecord]:
        """Extract Terraform/Terragrunt local module source edges."""
        records: List[RelationshipRecord] = []
        seen = set()
        lines = source.splitlines()
        index = 0
        while index < len(lines):
            line = lines[index]
            block_match = re.match(r'^\s*(module|terraform)\s*(?:"([^"]+)")?\s*\{', line)
            if not block_match:
                index += 1
                continue

            block_kind = block_match.group(1)
            block_name = block_match.group(2) or block_kind
            depth = line.count("{") - line.count("}")
            index += 1
            while index < len(lines) and depth > 0:
                current = lines[index]
                source_match = re.match(r'^\s*source\s*=\s*"([^"]+)"', current)
                if source_match:
                    target = source_match.group(1)
                    syntax = "terraform-module-source" if block_kind == "module" else "hcl-source"
                    key = (target, index + 1, syntax, block_name)
                    if key not in seen:
                        seen.add(key)
                        metadata = {
                            "syntax": syntax,
                            "block_kind": block_kind,
                            "block_name": block_name,
                        }
                        if source_path:
                            metadata["source_path"] = source_path
                        records.append(RelationshipRecord(
                            src_kind='file',
                            src_id=file_id,
                            dst_kind='module',
                            dst_id=None,
                            rel_type='imports',
                            target=target,
                            confidence='heuristic',
                            source_line=index + 1,
                            metadata=metadata,
                        ))
                depth += current.count("{") - current.count("}")
                index += 1

        return sorted(records, key=lambda item: (item.source_line or 0, item.target))

    def _relationship_source_path(self, file_path: str) -> Optional[str]:
        """Return repo-relative path metadata for relationship rows when an index root is active."""
        if self._active_index_root is None:
            return None
        path = Path(file_path)
        try:
            return path.relative_to(self._active_index_root).as_posix()
        except ValueError:
            try:
                return path.resolve().relative_to(self._active_index_root).as_posix()
            except ValueError:
                return None

    def _extract_python_import_relationships(
        self,
        source: str,
        file_id: int,
        file_path: str,
    ) -> List[RelationshipRecord]:
        """Extract Python import edges using the standard AST parser."""
        try:
            tree = ast.parse(source, filename=file_path)
        except SyntaxError as e:
            logger.debug(f"Skipping Python import relationships for unparsable file {file_path}: {e}")
            return []

        records: List[RelationshipRecord] = []
        seen = set()
        source_path = self._relationship_source_path(file_path)

        def add_record(target: str, source_line: int, metadata: Dict[str, Any]):
            if not target:
                return
            key = (target, source_line, metadata.get("syntax"))
            if key in seen:
                return
            seen.add(key)
            if source_path:
                metadata = {**metadata, "source_path": source_path}
            records.append(RelationshipRecord(
                src_kind='file',
                src_id=file_id,
                dst_kind='module',
                dst_id=None,
                rel_type='imports',
                target=target,
                confidence='parsed',
                source_line=source_line,
                metadata=metadata,
            ))

        for node in ast.walk(tree):
            source_line = int(getattr(node, 'lineno', 0) or 0)
            if isinstance(node, ast.Import):
                for alias in node.names:
                    add_record(alias.name, source_line, {
                        'syntax': 'import',
                        'alias': alias.asname,
                    })
            elif isinstance(node, ast.ImportFrom):
                prefix = "." * int(getattr(node, 'level', 0) or 0)
                imported = [alias.name for alias in node.names]
                aliases = {
                    alias.name: alias.asname
                    for alias in node.names
                    if alias.asname
                }
                if node.module:
                    add_record(f"{prefix}{node.module}", source_line, {
                        'syntax': 'from',
                        'imports': imported,
                        'aliases': aliases,
                    })
                else:
                    for alias in node.names:
                        add_record(f"{prefix}{alias.name}", source_line, {
                            'syntax': 'from',
                            'imports': [alias.name],
                            'aliases': {alias.name: alias.asname} if alias.asname else {},
                        })

        return sorted(records, key=lambda item: (item.source_line or 0, item.target))

    def _extract_regex_import_relationships(
        self,
        source: str,
        file_id: int,
        source_path: Optional[str],
        patterns: List[tuple[re.Pattern[str], str]],
    ) -> List[RelationshipRecord]:
        """Extract simple language import/use/include edges from line-oriented syntax."""
        records: List[RelationshipRecord] = []
        seen = set()

        def add_record(target: str, source_line: int, syntax: str):
            target = target.strip()
            if not target:
                return
            key = (target, source_line, syntax)
            if key in seen:
                return
            seen.add(key)
            metadata = {"syntax": syntax}
            if source_path:
                metadata["source_path"] = source_path
            records.append(RelationshipRecord(
                src_kind='file',
                src_id=file_id,
                dst_kind='module',
                dst_id=None,
                rel_type='imports',
                target=target,
                confidence='heuristic',
                source_line=source_line,
                metadata=metadata,
            ))

        in_go_import_block = False
        for line_no, line in enumerate(source.splitlines(), 1):
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith(("//", "#", "--")):
                continue
            if stripped.startswith("import ("):
                in_go_import_block = True
                continue
            if in_go_import_block and stripped.startswith(")"):
                in_go_import_block = False
                continue

            for pattern, syntax in patterns:
                if syntax == "go-import-block" and not in_go_import_block:
                    continue
                if syntax != "go-import-block" and in_go_import_block and syntax == "go-import":
                    continue
                match = pattern.search(line)
                if match:
                    add_record(match.group(1), line_no, syntax)

        return sorted(records, key=lambda item: (item.source_line or 0, item.target))

    def _extract_js_import_relationships(
        self,
        source: str,
        file_id: int,
        source_path: Optional[str] = None,
    ) -> List[RelationshipRecord]:
        """Extract JS/TS import and require edges with conservative regexes."""
        records: List[RelationshipRecord] = []
        seen = set()

        import_from_re = re.compile(
            r"^\s*import(?:\s+type)?\s+.+?\s+from\s*['\"]([^'\"]+)['\"]"
        )
        bare_import_re = re.compile(r"^\s*import\s*['\"]([^'\"]+)['\"]")
        require_re = re.compile(r"\brequire\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")
        dynamic_import_re = re.compile(r"(?<![\w$])import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)")

        def add_record(target: str, source_line: int, syntax: str):
            key = (target, source_line, syntax)
            if not target or key in seen:
                return
            seen.add(key)
            metadata = {'syntax': syntax}
            if source_path:
                metadata["source_path"] = source_path
            records.append(RelationshipRecord(
                src_kind='file',
                src_id=file_id,
                dst_kind='module',
                dst_id=None,
                rel_type='imports',
                target=target,
                confidence='heuristic',
                source_line=source_line,
                metadata=metadata,
            ))

        for line_no, line in enumerate(source.splitlines(), 1):
            stripped = line.strip()
            if not stripped or stripped.startswith("//"):
                continue

            for syntax, pattern in (
                ('import-from', import_from_re),
                ('import-bare', bare_import_re),
            ):
                match = pattern.search(line)
                if match:
                    add_record(match.group(1), line_no, syntax)

            for match in require_re.finditer(line):
                add_record(match.group(1), line_no, 'require')

            for match in dynamic_import_re.finditer(line):
                add_record(match.group(1), line_no, 'dynamic-import')

        return sorted(records, key=lambda item: (item.source_line or 0, item.target))

    def _extract_python_symbols(self, parsed_file: ParsedFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Python file"""
        symbols_to_index = []

        # Add module-level functions
        for func in parsed_file.functions:
            symbols_to_index.append({
                'type': 'function',
                'data': func
            })
            stats.functions_indexed += 1

        # Add classes and their methods
        for cls in parsed_file.classes:
            # Add the class itself
            symbols_to_index.append({
                'type': 'class',
                'data': cls
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                symbols_to_index.append({
                    'type': 'method',
                    'data': method,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_generic_chunks(
        self,
        file_path: str,
        stats: IndexStats,
        replace_existing: bool = True,
        source_bytes: Optional[bytes] = None,
    ) -> tuple[int, List[Dict], Optional[bytes]]:
        """Index a common text/code file without claiming symbol-level parsing."""
        path = Path(file_path)
        try:
            if source_bytes is None:
                source_bytes = path.read_bytes()
            source = self._decode_source_text(source_bytes)
        except Exception as e:
            logger.warning(f"Failed to read generic file {file_path}: {e}")
            stats.files_failed = 1
            return 0, [], None

        lines = source.splitlines()
        total_lines = max(1, len(lines))
        file_id = self.metadata_store.add_file(
            path=file_path,
            total_lines=total_lines,
            content_hash=self._hash_source_bytes(source_bytes),
            replace_existing=replace_existing,
        )
        stats.total_lines = total_lines

        chunk_size = 120
        overlap = 15
        symbols_to_index = []
        start = 0
        chunk_number = 1
        while start < total_lines:
            end = min(total_lines, start + chunk_size)
            chunk_lines = lines[start:end]
            text = "\n".join(chunk_lines).strip()
            if text:
                chunk = ParsedGenericChunk(
                    name=f"{path.name} chunk {chunk_number}",
                    code=text,
                    start_line=start + 1,
                    end_line=end,
                    docstring=f"Generic searchable chunk from {path.name}"
                )
                symbols_to_index.append({
                    'type': 'chunk',
                    'data': chunk
                })
            if end >= total_lines:
                break
            start = max(end - overlap, start + 1)
            chunk_number += 1

        return file_id, symbols_to_index, source_bytes

    def _extract_js_symbols(self, parsed_file: ParsedJSFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed JavaScript/TypeScript file"""
        symbols_to_index = []

        # Add functions (including React components)
        for func in parsed_file.functions:
            # Create a compatible data object
            func_data = type('JSFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes and their methods
        for cls in parsed_file.classes:
            # Create compatible class data object
            cls_data = type('JSClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            symbols_to_index.append({
                'type': 'class',
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('JSMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_java_symbols(self, parsed_file: ParsedJavaFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Java/Kotlin file"""
        symbols_to_index = []

        # Add top-level functions (mainly for Kotlin)
        for func in parsed_file.functions:
            # Create a compatible data object
            func_data = type('JavaFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes and their methods
        for cls in parsed_file.classes:
            # Create compatible class data object
            cls_data = type('JavaClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            symbols_to_index.append({
                'type': 'class',
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('JavaMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_html_css_symbols(self, parsed_file: ParsedHTMLCSSFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed HTML/CSS file"""
        symbols_to_index = []

        # Add HTML elements (templates, sections, etc.)
        for element in parsed_file.elements:
            # Create a compatible data object
            element_data = type('HTMLElement', (), {
                'name': element.name,
                'code': element.code,
                'start_line': element.start_line,
                'end_line': element.end_line,
                'docstring': None  # HTML elements don't have docstrings
            })()

            symbols_to_index.append({
                'type': element.element_type,  # 'template', 'section', etc.
                'data': element_data
            })
            stats.functions_indexed += 1  # Count elements as functions for stats

        # Add CSS rules
        for rule in parsed_file.css_rules:
            # Create compatible rule data object
            rule_data = type('CSSRule', (), {
                'name': rule.selector,
                'code': rule.code,
                'start_line': rule.start_line,
                'end_line': rule.end_line,
                'docstring': None  # CSS rules don't have docstrings
            })()

            symbols_to_index.append({
                'type': 'css_rule',
                'data': rule_data
            })
            stats.functions_indexed += 1  # Count CSS rules as functions for stats

        return symbols_to_index

    def _extract_c_cpp_symbols(self, parsed_file: ParsedCFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed C/C++ file"""
        symbols_to_index = []

        # Add top-level functions
        for func in parsed_file.functions:
            # Create a compatible data object
            func_data = type('CFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes/structs and their methods
        for cls in parsed_file.classes:
            # Create compatible class data object
            cls_data = type('CClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            symbols_to_index.append({
                'type': 'class',
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('CMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_csharp_symbols(self, parsed_file: ParsedCSharpFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed C# file"""
        symbols_to_index = []

        # Add top-level functions (rare in C#, but possible with top-level statements)
        for func in parsed_file.functions:
            # Create a compatible data object
            func_data = type('CSharpFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes/interfaces and their methods
        for cls in parsed_file.classes:
            # Create compatible class data object
            cls_data = type('CSharpClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            # Use 'interface' type if it's an interface
            symbol_type = 'interface' if cls.is_interface else 'class'

            symbols_to_index.append({
                'type': symbol_type,
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('CSharpMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_go_symbols(self, parsed_file: ParsedGoFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Go file"""
        symbols_to_index = []

        # Add functions
        for func in parsed_file.functions:
            func_data = type('GoFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            # Methods have a receiver
            if func.receiver:
                symbols_to_index.append({
                    'type': 'method',
                    'data': func_data,
                    'parent_class': func.receiver
                })
                stats.methods_indexed += 1
            else:
                symbols_to_index.append({
                    'type': 'function',
                    'data': func_data
                })
                stats.functions_indexed += 1

        # Add structs/interfaces
        for struct in parsed_file.structs:
            struct_data = type('GoStruct', (), {
                'name': struct.name,
                'code': struct.code,
                'start_line': struct.start_line,
                'end_line': struct.end_line,
                'docstring': struct.docstring
            })()

            symbol_type = 'interface' if struct.is_interface else 'struct'
            symbols_to_index.append({
                'type': symbol_type,
                'data': struct_data
            })
            stats.classes_indexed += 1

        return symbols_to_index

    def _extract_rust_symbols(self, parsed_file: ParsedRustFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Rust file"""
        symbols_to_index = []

        # Add functions
        for func in parsed_file.functions:
            func_data = type('RustFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add structs/enums/traits and their methods
        for struct in parsed_file.structs:
            struct_data = type('RustStruct', (), {
                'name': struct.name,
                'code': struct.code,
                'start_line': struct.start_line,
                'end_line': struct.end_line,
                'docstring': struct.docstring
            })()

            symbols_to_index.append({
                'type': struct.kind,  # struct, enum, or trait
                'data': struct_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in struct.methods:
                method_data = type('RustMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': struct.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_ruby_symbols(self, parsed_file: ParsedRubyFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Ruby file"""
        symbols_to_index = []

        # Add functions
        for func in parsed_file.functions:
            func_data = type('RubyFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes/modules and their methods
        for cls in parsed_file.classes:
            cls_data = type('RubyClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            symbol_type = 'module' if cls.is_module else 'class'
            symbols_to_index.append({
                'type': symbol_type,
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('RubyMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_php_symbols(self, parsed_file: ParsedPHPFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed PHP file"""
        symbols_to_index = []

        # Add functions
        for func in parsed_file.functions:
            func_data = type('PHPFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes/interfaces/traits and their methods
        for cls in parsed_file.classes:
            cls_data = type('PHPClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            symbols_to_index.append({
                'type': cls.kind,  # class, interface, or trait
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('PHPMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_bash_symbols(self, parsed_file: ParsedBashFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Bash file"""
        symbols_to_index = []

        # Add functions
        for func in parsed_file.functions:
            func_data = type('BashFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        return symbols_to_index

    def _extract_sql_symbols(self, parsed_file: ParsedSQLFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed SQL file"""
        symbols_to_index = []

        # Add tables
        for table in parsed_file.tables:
            table_data = type('SQLTable', (), {
                'name': table.name,
                'code': table.code,
                'start_line': table.start_line,
                'end_line': table.end_line,
                'docstring': table.docstring
            })()

            symbols_to_index.append({
                'type': 'table',
                'data': table_data
            })
            stats.classes_indexed += 1  # Count tables as classes

        # Add procedures/functions/triggers
        for proc in parsed_file.procedures:
            proc_data = type('SQLProcedure', (), {
                'name': proc.name,
                'code': proc.code,
                'start_line': proc.start_line,
                'end_line': proc.end_line,
                'docstring': proc.docstring
            })()

            symbols_to_index.append({
                'type': proc.kind,  # procedure, function, or trigger
                'data': proc_data
            })
            stats.functions_indexed += 1

        # Add views
        for view in parsed_file.views:
            view_data = type('SQLView', (), {
                'name': view.name,
                'code': view.code,
                'start_line': view.start_line,
                'end_line': view.end_line,
                'docstring': view.docstring
            })()

            symbols_to_index.append({
                'type': 'view',
                'data': view_data
            })
            stats.classes_indexed += 1  # Count views as classes

        return symbols_to_index

    def _extract_shader_symbols(self, parsed_file: ParsedShaderFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed shader file"""
        symbols_to_index = []

        for func in parsed_file.functions:
            func_data = type('ShaderFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        return symbols_to_index

    def _extract_scala_symbols(self, parsed_file: ParsedScalaFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Scala file."""
        symbols_to_index = []

        for function in parsed_file.functions:
            function_data = type('ScalaFunction', (), {
                'name': function.name,
                'code': function.code,
                'start_line': function.start_line,
                'end_line': function.end_line,
                'docstring': function.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': function_data
            })
            stats.functions_indexed += 1

        for scala_type in parsed_file.types:
            type_data = type('ScalaType', (), {
                'name': scala_type.name,
                'code': scala_type.code,
                'start_line': scala_type.start_line,
                'end_line': scala_type.end_line,
                'docstring': scala_type.docstring
            })()

            symbols_to_index.append({
                'type': scala_type.kind,
                'data': type_data
            })
            stats.classes_indexed += 1

            for method in scala_type.methods:
                method_data = type('ScalaMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': scala_type.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_lua_symbols(self, parsed_file: ParsedLuaFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Lua file."""
        symbols_to_index = []

        for function in parsed_file.functions:
            function_data = type('LuaFunction', (), {
                'name': function.name,
                'code': function.code,
                'start_line': function.start_line,
                'end_line': function.end_line,
                'docstring': function.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': function_data
            })
            stats.functions_indexed += 1

        for table in parsed_file.tables:
            table_data = type('LuaTable', (), {
                'name': table.name,
                'code': table.code,
                'start_line': table.start_line,
                'end_line': table.end_line,
                'docstring': table.docstring
            })()

            symbols_to_index.append({
                'type': 'table',
                'data': table_data
            })
            stats.classes_indexed += 1

            for method in table.methods:
                method_data = type('LuaMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': table.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_swift_symbols(self, parsed_file: ParsedSwiftFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Swift file."""
        symbols_to_index = []

        for function in parsed_file.functions:
            function_data = type('SwiftFunction', (), {
                'name': function.name,
                'code': function.code,
                'start_line': function.start_line,
                'end_line': function.end_line,
                'docstring': function.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': function_data
            })
            stats.functions_indexed += 1

        for property_symbol in parsed_file.properties:
            property_data = type('SwiftProperty', (), {
                'name': property_symbol.name,
                'code': property_symbol.code,
                'start_line': property_symbol.start_line,
                'end_line': property_symbol.end_line,
                'docstring': property_symbol.docstring
            })()

            symbols_to_index.append({
                'type': 'property',
                'data': property_data
            })
            stats.methods_indexed += 1

        for swift_type in parsed_file.types:
            type_data = type('SwiftType', (), {
                'name': swift_type.name,
                'code': swift_type.code,
                'start_line': swift_type.start_line,
                'end_line': swift_type.end_line,
                'docstring': swift_type.docstring
            })()

            symbols_to_index.append({
                'type': swift_type.kind,
                'data': type_data
            })
            stats.classes_indexed += 1

            for member in swift_type.members:
                member_data = type('SwiftMember', (), {
                    'name': member.name,
                    'code': member.code,
                    'start_line': member.start_line,
                    'end_line': member.end_line,
                    'docstring': member.docstring
                })()

                symbols_to_index.append({
                    'type': member.kind,
                    'data': member_data,
                    'parent_class': swift_type.name
                })
                if member.kind == 'method':
                    stats.methods_indexed += 1
                elif member.kind == 'property':
                    stats.methods_indexed += 1

        return symbols_to_index

    def _extract_dart_symbols(self, parsed_file: ParsedDartFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Dart file."""
        symbols_to_index = []

        for function in parsed_file.functions:
            function_data = type('DartFunction', (), {
                'name': function.name,
                'code': function.code,
                'start_line': function.start_line,
                'end_line': function.end_line,
                'docstring': function.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': function_data
            })
            stats.functions_indexed += 1

        for property_symbol in parsed_file.properties:
            property_data = type('DartProperty', (), {
                'name': property_symbol.name,
                'code': property_symbol.code,
                'start_line': property_symbol.start_line,
                'end_line': property_symbol.end_line,
                'docstring': property_symbol.docstring
            })()

            symbols_to_index.append({
                'type': 'property',
                'data': property_data
            })
            stats.methods_indexed += 1

        for dart_type in parsed_file.types:
            type_data = type('DartType', (), {
                'name': dart_type.name,
                'code': dart_type.code,
                'start_line': dart_type.start_line,
                'end_line': dart_type.end_line,
                'docstring': dart_type.docstring
            })()

            symbols_to_index.append({
                'type': dart_type.kind,
                'data': type_data
            })
            stats.classes_indexed += 1

            for member in dart_type.members:
                member_data = type('DartMember', (), {
                    'name': member.name,
                    'code': member.code,
                    'start_line': member.start_line,
                    'end_line': member.end_line,
                    'docstring': member.docstring
                })()

                symbols_to_index.append({
                    'type': member.kind,
                    'data': member_data,
                    'parent_class': dart_type.name
                })
                if member.kind == 'method':
                    stats.methods_indexed += 1
                elif member.kind == 'constructor':
                    stats.methods_indexed += 1
                elif member.kind == 'property':
                    stats.methods_indexed += 1

        return symbols_to_index

    def _extract_hcl_symbols(self, parsed_file: ParsedHCLFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed HCL/Terraform file."""
        symbols_to_index = []

        for block in parsed_file.blocks:
            block_data = type('HCLBlock', (), {
                'name': block.name,
                'code': block.code,
                'start_line': block.start_line,
                'end_line': block.end_line,
                'docstring': block.docstring
            })()

            symbols_to_index.append({
                'type': block.kind,
                'data': block_data
            })
            stats.classes_indexed += 1

        for attribute in parsed_file.attributes:
            attribute_data = type('HCLAttribute', (), {
                'name': attribute.name,
                'code': attribute.code,
                'start_line': attribute.start_line,
                'end_line': attribute.end_line,
                'docstring': attribute.docstring
            })()

            symbols_to_index.append({
                'type': 'attribute',
                'data': attribute_data
            })
            stats.methods_indexed += 1

        return symbols_to_index

    def _extract_graphql_symbols(self, parsed_file: ParsedGraphQLFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed GraphQL schema and operation files."""
        symbols_to_index = []

        for definition in parsed_file.definitions:
            definition_data = type('GraphQLDefinition', (), {
                'name': definition.name,
                'code': definition.code,
                'start_line': definition.start_line,
                'end_line': definition.end_line,
                'docstring': definition.docstring
            })()

            symbol_type = f"graphql_{definition.kind}"
            symbols_to_index.append({
                'type': symbol_type,
                'data': definition_data
            })
            if definition.kind in {"query", "mutation", "subscription", "fragment"}:
                stats.functions_indexed += 1
            else:
                stats.classes_indexed += 1

        return symbols_to_index

    def _extract_protobuf_symbols(self, parsed_file: ParsedProtoFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed protobuf files."""
        symbols_to_index = []

        for definition in parsed_file.definitions:
            definition_data = type('ProtoDefinition', (), {
                'name': definition.name,
                'code': definition.code,
                'start_line': definition.start_line,
                'end_line': definition.end_line,
                'docstring': definition.docstring
            })()

            symbol_type = f"protobuf_{definition.kind}"
            symbols_to_index.append({
                'type': symbol_type,
                'data': definition_data
            })
            stats.classes_indexed += 1

            for rpc in definition.rpcs:
                rpc_data = type('ProtoRPC', (), {
                    'name': rpc.name,
                    'code': rpc.code,
                    'start_line': rpc.start_line,
                    'end_line': rpc.end_line,
                    'docstring': rpc.docstring
                })()

                symbols_to_index.append({
                    'type': 'protobuf_rpc',
                    'data': rpc_data,
                    'parent_class': definition.name
                })
                stats.functions_indexed += 1

        return symbols_to_index

    def _extract_powershell_symbols(self, parsed_file: ParsedPowerShellFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed PowerShell scripts and modules."""
        symbols_to_index = []

        for function in parsed_file.functions:
            function_data = type('PowerShellFunction', (), {
                'name': function.name,
                'code': function.code,
                'start_line': function.start_line,
                'end_line': function.end_line,
                'docstring': function.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': function_data
            })
            stats.functions_indexed += 1

        for variable in parsed_file.variables:
            variable_data = type('PowerShellVariable', (), {
                'name': variable.name,
                'code': variable.code,
                'start_line': variable.start_line,
                'end_line': variable.end_line,
                'docstring': variable.docstring
            })()

            symbols_to_index.append({
                'type': 'variable',
                'data': variable_data
            })
            stats.methods_indexed += 1

        for powershell_type in parsed_file.types:
            type_data = type('PowerShellType', (), {
                'name': powershell_type.name,
                'code': powershell_type.code,
                'start_line': powershell_type.start_line,
                'end_line': powershell_type.end_line,
                'docstring': powershell_type.docstring
            })()

            symbols_to_index.append({
                'type': powershell_type.kind,
                'data': type_data
            })
            stats.classes_indexed += 1

            for member in powershell_type.members:
                member_data = type('PowerShellMember', (), {
                    'name': member.name,
                    'code': member.code,
                    'start_line': member.start_line,
                    'end_line': member.end_line,
                    'docstring': member.docstring
                })()

                symbols_to_index.append({
                    'type': member.kind,
                    'data': member_data,
                    'parent_class': powershell_type.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_elixir_symbols(self, parsed_file: ParsedElixirFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Elixir source files."""
        symbols_to_index = []

        for function in parsed_file.functions:
            function_data = type('ElixirFunction', (), {
                'name': function.name,
                'code': function.code,
                'start_line': function.start_line,
                'end_line': function.end_line,
                'docstring': function.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': function_data
            })
            stats.functions_indexed += 1

        for module in parsed_file.modules:
            module_data = type('ElixirModule', (), {
                'name': module.name,
                'code': module.code,
                'start_line': module.start_line,
                'end_line': module.end_line,
                'docstring': module.docstring
            })()

            symbols_to_index.append({
                'type': module.kind,
                'data': module_data
            })
            stats.classes_indexed += 1

            for member in module.members:
                member_data = type('ElixirMember', (), {
                    'name': member.name,
                    'code': member.code,
                    'start_line': member.start_line,
                    'end_line': member.end_line,
                    'docstring': member.docstring
                })()

                symbols_to_index.append({
                    'type': member.kind,
                    'data': member_data,
                    'parent_class': module.name
                })
                if member.kind == 'struct':
                    stats.classes_indexed += 1
                else:
                    stats.methods_indexed += 1

        return symbols_to_index

    def _index_symbols(
        self,
        symbols: List[Dict],
        file_id: int,
        file_path: str,
        semantic: bool = True,
        cancel_check: Optional[Callable[[], bool]] = None,
        deferred_symbol_records: Optional[List[SymbolRecord]] = None,
    ):
        """
        Store symbols in batches and optionally generate embeddings.

        Args:
            symbols: List of symbol dictionaries
            file_id: Database file ID
            file_path: Path to source file
            semantic: Whether to generate CodeBERT vectors
            cancel_check: Optional callback returning True when indexing should stop
        """
        if not symbols:
            logger.debug(f"No symbols to index from {file_path}")
            return

        if deferred_symbol_records is not None and not semantic and not self.build_text_index:
            start_embedding_id = self.metadata_store.reserve_embedding_ids(len(symbols))
            for i, symbol in enumerate(symbols):
                data = symbol['data']
                code = self._bounded_symbol_code(data.code)
                deferred_symbol_records.append(SymbolRecord(
                    file_id=file_id,
                    name=data.name,
                    symbol_type=symbol['type'],
                    code=code,
                    start_line=data.start_line,
                    end_line=data.end_line,
                    docstring=data.docstring,
                    embedding_id=start_embedding_id + i,
                ))
                symbols[i] = None
            return

        total_symbols = len(symbols)
        num_batches = (total_symbols + self.SYMBOLS_BATCH_SIZE - 1) // self.SYMBOLS_BATCH_SIZE

        logger.debug(
            f"Indexing {total_symbols} symbols from {file_path} in "
            f"{num_batches} batches (max {self.SYMBOLS_BATCH_SIZE} per batch)"
        )

        for batch_num, batch_start in enumerate(range(0, total_symbols, self.SYMBOLS_BATCH_SIZE), 1):
            self._raise_if_canceled(cancel_check)
            batch_end = min(batch_start + self.SYMBOLS_BATCH_SIZE, total_symbols)
            batch_symbols = symbols[batch_start:batch_end]
            batch_size = len(batch_symbols)

            logger.debug(
                f"Processing batch {batch_num}/{num_batches}: symbols "
                f"{batch_start}-{batch_end} ({batch_size} symbols)"
            )

            codes = embeddings = embeddings_array = vector_metadata = symbol_records = text_docs = None

            try:
                codes = []
                for symbol in batch_symbols:
                    data = symbol['data']
                    code = self._bounded_symbol_code(data.code)
                    code_text = f"{data.name}\n{data.docstring or ''}\n{code}"
                    codes.append(code_text)

                if semantic:
                    embedder = self._ensure_embedder()
                    logger.debug(f"Generating embeddings for {len(codes)} codes...")
                    embeddings = embedder.batch_generate(codes, batch_size=16)

                    if len(embeddings) != len(codes):
                        raise ValueError(f"Embedding count mismatch: expected {len(codes)}, got {len(embeddings)}")

                    embeddings_array = np.array(embeddings, dtype=np.float32)
                    logger.debug(f"Generated embeddings array shape: {embeddings_array.shape}")

                    start_embedding_id = self.vector_store.vector_count

                    vector_metadata = []
                    for i, symbol in enumerate(batch_symbols):
                        data = symbol['data']
                        vector_metadata.append({
                            'embedding_id': start_embedding_id + i,
                            'file_path': file_path,
                            'symbol_name': data.name,
                            'symbol_type': symbol['type'],
                            'start_line': data.start_line,
                            'end_line': data.end_line
                        })

                    logger.debug(f"Writing {len(embeddings_array)} vectors to vector store...")
                    self.vector_store.add(embeddings_array, vector_metadata)
                else:
                    start_embedding_id = self.metadata_store.get_next_embedding_id()

                self._raise_if_canceled(cancel_check)

                symbol_records = []
                for i, symbol in enumerate(batch_symbols):
                    data = symbol['data']
                    embedding_id = start_embedding_id + i
                    code = self._bounded_symbol_code(data.code)

                    record = SymbolRecord(
                        file_id=file_id,
                        name=data.name,
                        symbol_type=symbol['type'],
                        code=code,
                        start_line=data.start_line,
                        end_line=data.end_line,
                        docstring=data.docstring,
                        embedding_id=embedding_id
                    )
                    symbol_records.append(record)

                logger.debug(f"Writing {len(symbol_records)} records to metadata store...")
                self.metadata_store.add_symbols_batch(symbol_records)

                if self.build_text_index:
                    text_docs = []
                    for i, symbol in enumerate(batch_symbols):
                        data = symbol['data']
                        embedding_id = start_embedding_id + i
                        text_docs.append((embedding_id, {
                            'name': data.name,
                            'symbol_type': symbol['type'],
                            'code': self._bounded_symbol_code(data.code),
                            'docstring': data.docstring
                        }))

                    logger.debug(f"Writing {len(text_docs)} documents to text search index...")
                    self.text_search.add_documents_batch(text_docs)

                mode = "semantic" if semantic else "lexical"
                logger.debug(f"Batch {batch_num}/{num_batches} complete: indexed {batch_size} symbols ({mode})")

            except IndexingCanceled:
                raise
            except Exception as e:
                logger.error(
                    f"Error processing batch {batch_num}/{num_batches} "
                    f"(symbols {batch_start}-{batch_end}): {e}"
                )
                logger.exception("Full traceback:")
                raise RuntimeError(f"Failed to index batch {batch_num} from {file_path}: {e}") from e

            finally:
                # Drop references so long files do not keep processed symbols alive
                for idx in range(batch_start, batch_end):
                    symbols[idx] = None

                codes = embeddings = embeddings_array = vector_metadata = symbol_records = text_docs = None
                batch_symbols = None
                self._batches_since_gc += 1
                if self._batches_since_gc >= self.GC_BATCH_INTERVAL:
                    gc.collect()
                    self._batches_since_gc = 0

        logger.debug(
            f"Successfully indexed all {total_symbols} symbols from {file_path} in {num_batches} batches"
        )

    def get_stats(self) -> Dict[str, Any]:
        """
        Get current index statistics

        Returns:
            Dictionary with statistics
        """
        db_stats = self.metadata_store.get_stats()
        vector_stats = self.vector_store.get_stats()

        return {
            'database': db_stats,
            'vector_store': vector_stats,
            'total_indexed_symbols': db_stats.get('total_symbols', 0)
        }

    def clear_index(self):
        """Clear all indexed data"""
        logger.warning("Clearing index...")
        self.metadata_store.clear()
        self.vector_store.clear()
        self.text_search.clear()
        logger.info("Index cleared")

    def save_index(self, save_dir: str):
        """
        Save vector store to disk (metadata store auto-persists)

        Args:
            save_dir: Directory to save to
        """
        logger.info(f"Saving index to {save_dir}")
        self.vector_store.save(save_dir)
        logger.info("Index saved")

    def load_index(self, load_dir: str):
        """
        Load vector store from disk

        Args:
            load_dir: Directory to load from
        """
        logger.info(f"Loading index from {load_dir}")
        self.vector_store.load(load_dir)
        logger.info("Index loaded")


def main():
    """Test the indexer"""
    import tempfile
    import os

    # Create test Python files
    test_dir = tempfile.mkdtemp()

    test_file1 = os.path.join(test_dir, 'test1.py')
    with open(test_file1, 'w') as f:
        f.write('''
def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user with credentials"""
    return check_credentials(username, password)

def login(email: str, pwd: str):
    """User login function"""
    return authenticate_user(email, pwd)

class UserManager:
    """Manages user accounts"""

    def create_user(self, username: str):
        """Create a new user"""
        pass

    def delete_user(self, user_id: int):
        """Delete a user"""
        pass
''')

    test_file2 = os.path.join(test_dir, 'test2.py')
    with open(test_file2, 'w') as f:
        f.write('''
def connect_database(host: str, port: int):
    """Connect to database server"""
    return create_connection(host, port)

def query_data(sql: str):
    """Execute SQL query"""
    return execute_query(sql)
''')

    try:
        # Create indexer
        indexer = Indexer()

        # Index directory
        print(f"Indexing directory: {test_dir}")
        stats = indexer.index_directory(test_dir, show_progress=False)

        print(f"\nIndexing Stats:")
        print(f"  Files processed: {stats.files_processed}")
        print(f"  Total symbols: {stats.total_symbols}")
        print(f"  Functions: {stats.functions_indexed}")
        print(f"  Classes: {stats.classes_indexed}")
        print(f"  Methods: {stats.methods_indexed}")
        print(f"  Time taken: {stats.time_taken:.2f}s")

        # Get stats
        index_stats = indexer.get_stats()
        print(f"\nIndex Stats:")
        print(f"  {index_stats}")

    finally:
        # Cleanup
        import shutil
        shutil.rmtree(test_dir)


if __name__ == "__main__":
    main()
