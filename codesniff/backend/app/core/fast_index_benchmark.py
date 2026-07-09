"""Synthetic fast-index benchmark helpers."""

import json
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Optional

from .indexer import Indexer
from .text_search import TextSearchEngine
from ..storage.metadata_store import MetadataStore


class BenchmarkEmbedderGuard:
    """Fails the benchmark if fast lexical indexing calls semantic embedding."""

    def batch_generate(self, codes, batch_size=8, use_cache=True):
        raise AssertionError("fast lexical benchmark called batch_generate")

    def embed_query(self, query):
        raise AssertionError("fast lexical benchmark called embed_query")


def create_synthetic_python_repo(
    root: Path,
    files: int,
    symbols_per_file: int,
    pruned_files: int = 0,
) -> Dict[str, int]:
    """Create a deterministic Python repo shape for indexer benchmark runs."""
    if files < 1:
        raise ValueError("files must be >= 1")
    if symbols_per_file < 1:
        raise ValueError("symbols_per_file must be >= 1")
    if pruned_files < 0:
        raise ValueError("pruned_files must be >= 0")

    source_dir = root / "source"
    if source_dir.exists():
        shutil.rmtree(source_dir)
    source_dir.mkdir(parents=True)

    for idx in range(files):
        package_dir = source_dir / "src" / f"pkg_{idx // 100:04d}"
        package_dir.mkdir(parents=True, exist_ok=True)
        file_path = package_dir / f"module_{idx:06d}.py"
        file_path.write_text(_python_file(idx, symbols_per_file), encoding="utf-8")

    if pruned_files:
        ignored_dir = source_dir / "node_modules" / "ignored_pkg"
        ignored_dir.mkdir(parents=True, exist_ok=True)
        for idx in range(pruned_files):
            ignored_path = ignored_dir / f"ignored_{idx:06d}.py"
            ignored_path.write_text(_python_file(idx, 1), encoding="utf-8")

    return {
        "source_files": files,
        "source_symbols": files * symbols_per_file,
        "pruned_files": pruned_files,
    }


def run_fast_index_benchmark(
    workdir: Optional[Path] = None,
    files: int = 1000,
    symbols_per_file: int = 3,
    pruned_files: int = 0,
    max_seconds: float = 180.0,
    shallow: bool = False,
) -> Dict[str, Any]:
    """Generate a synthetic repo, index it lexically, and return timing facts."""
    if workdir is None:
        with TemporaryDirectory(prefix="codesniff-fast-index-") as tmp:
            return run_fast_index_benchmark(
                workdir=Path(tmp),
                files=files,
            symbols_per_file=symbols_per_file,
            pruned_files=pruned_files,
            max_seconds=max_seconds,
            shallow=shallow,
        )

    workdir.mkdir(parents=True, exist_ok=True)
    generated = create_synthetic_python_repo(workdir, files, symbols_per_file, pruned_files)
    source_dir = workdir / "source"
    metadata = MetadataStore(db_path=str(workdir / "repo.sqlite"))
    indexer = Indexer(
        embedder=BenchmarkEmbedderGuard(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )

    try:
        stats = indexer.index_directory(str(source_dir), show_progress=False, semantic=False, shallow=shallow)
        db_stats = metadata.get_stats()
    finally:
        metadata.close()

    estimated_100k = None
    if stats.files_processed:
        estimated_100k = stats.time_taken * (100_000 / stats.files_processed)
    estimated_100k_symbols = None
    if stats.total_symbols:
        estimated_100k_symbols = stats.time_taken * (100_000 / stats.total_symbols)

    return {
        "requested_files": files,
        "requested_symbols_per_file": symbols_per_file,
        "requested_pruned_files": pruned_files,
        "index_mode": "shallow" if shallow else "deep",
        "generated": generated,
        "files_discovered": stats.files_discovered,
        "directories_pruned": stats.directories_pruned,
        "files_processed": stats.files_processed,
        "files_failed": stats.files_failed,
        "total_symbols": stats.total_symbols,
        "total_lines": stats.total_lines,
        "time_taken_seconds": stats.time_taken,
        "seconds_per_1000_files": (stats.time_taken / stats.files_processed * 1000) if stats.files_processed else None,
        "estimated_seconds_100k_files": estimated_100k,
        "estimated_seconds_100k_symbols": estimated_100k_symbols,
        "under_budget": stats.time_taken <= max_seconds,
        "max_seconds": max_seconds,
        "db_total_files": db_stats.get("total_files", 0),
        "db_total_symbols": db_stats.get("total_symbols", 0),
        "text_index_documents": indexer.text_search.doc_count,
    }


def benchmark_result_json(result: Dict[str, Any]) -> str:
    """Stable JSON representation for CLI output."""
    return json.dumps(result, indent=2, sort_keys=True)


def _python_file(file_idx: int, symbols_per_file: int) -> str:
    lines = [f'"""Synthetic module {file_idx} for CodeSniff fast-index benchmarking."""', ""]
    for symbol_idx in range(symbols_per_file):
        lines.extend([
            f"def function_{file_idx:06d}_{symbol_idx:03d}(value):",
            f'    """Return a deterministic value for symbol {symbol_idx}."""',
            f"    return value + {file_idx + symbol_idx}",
            "",
        ])
    return "\n".join(lines)
