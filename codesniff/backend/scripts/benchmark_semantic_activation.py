"""Measure per-repo semantic vector warmup and cold activation cost."""

import argparse
import json
import shutil
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Optional

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from loguru import logger

from app.core.artifact_manifest import write_repo_manifest
from app.core.semantic_warmup import warm_repo_semantics
from app.storage.active_repo_manager import ActiveRepoManager
from app.storage.metadata_store import MetadataStore, SymbolRecord
from app.storage.repo_registry import RepoRegistry


class DeterministicSemanticEmbedder:
    """Fast deterministic embedder for vector-store measurement."""

    dimension = 768

    def batch_generate(self, codes, batch_size=16, use_cache=True):
        return [self._vector(code) for code in codes]

    def embed_query(self, query):
        return self._vector(query)

    def _vector(self, text):
        vec = np.zeros(self.dimension, dtype=np.float32)
        value = sum(text.encode("utf-8", errors="ignore"))
        vec[value % self.dimension] = 1.0
        vec[(value * 31 + 7) % self.dimension] = 0.5
        return vec


def run_semantic_activation_benchmark(
    workdir: Optional[Path] = None,
    symbols: int = 10000,
    files: int = 1000,
    warm_batch_size: int = 256,
) -> Dict[str, Any]:
    """Build a cold repo, warm vectors, then lazy-load them through ActiveRepoManager."""
    if workdir is None:
        with TemporaryDirectory(prefix="codesniff-semantic-activation-") as tmp:
            return run_semantic_activation_benchmark(
                workdir=Path(tmp),
                symbols=symbols,
                files=files,
                warm_batch_size=warm_batch_size,
            )

    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    registry = RepoRegistry(
        db_path=str(workdir / "registry.sqlite"),
        repos_dir=str(workdir / "repos"),
    )
    embedder = DeterministicSemanticEmbedder()

    try:
        repo = registry.create_repo("semantic-activation", "synthetic", None)
        repo_path = Path(repo.storage_path)
        source_dir = repo_path / "source"
        source_dir.mkdir(parents=True, exist_ok=True)
        _seed_symbol_repo(repo_path / "repo.sqlite", source_dir, symbols=symbols, files=files)
        write_repo_manifest(
            repo_storage_path=repo_path,
            status="lexical_ready",
            source_path=source_dir,
            files_seen=files,
            files_indexed=files,
            symbols_indexed=symbols,
            index_mode="deep",
        )
        registry.update_repo(repo.id, status="lexical_ready")
        repo = registry.get_repo(repo.id)

        lexical_manager = ActiveRepoManager(
            registry=registry,
            storage_dir=str(workdir),
            max_active_repos=1,
            embedder=embedder,
        )
        lexical_start = time.perf_counter()
        lexical_handle = lexical_manager.activate(repo)
        lexical_activate_ms = (time.perf_counter() - lexical_start) * 1000
        lexical_semantic_loaded = lexical_handle.semantic_loaded
        lexical_manager.close_all()

        warm_start = time.perf_counter()
        warm_stats = warm_repo_semantics(
            repo.storage_path,
            embedder=embedder,
            batch_size=warm_batch_size,
        )
        warm_seconds = time.perf_counter() - warm_start
        registry.update_repo(repo.id, status="semantic_ready")
        repo = registry.get_repo(repo.id)

        manager = ActiveRepoManager(
            registry=registry,
            storage_dir=str(workdir),
            max_active_repos=1,
            embedder=embedder,
        )
        first_query = f"semantic_symbol_{symbols - 1:06d}"
        search_start = time.perf_counter()
        results = manager.search(repo, query=first_query, limit=5)
        first_semantic_search_ms = (time.perf_counter() - search_start) * 1000
        handle = manager.get_handle(repo.id)

        warm_search_start = time.perf_counter()
        warm_results = manager.search(repo, query="semantic_symbol_000000", limit=5)
        warm_search_ms = (time.perf_counter() - warm_search_start) * 1000

        vector_dir = Path(warm_stats.vector_dir)
        result = {
            "benchmark": "semantic_activation",
            "symbols": symbols,
            "files": files,
            "warm_batch_size": warm_batch_size,
            "lexical_activate_ms": round(lexical_activate_ms, 3),
            "lexical_semantic_loaded": lexical_semantic_loaded,
            "semantic_warm_seconds": round(warm_seconds, 3),
            "symbols_embedded": warm_stats.symbols_embedded,
            "vector_index_bytes": _file_size(vector_dir / "vectors.index"),
            "vector_metadata_bytes": _file_size(vector_dir / "metadata.npy"),
            "vector_total_bytes": _directory_size(vector_dir),
            "first_semantic_search_ms": round(first_semantic_search_ms, 3),
            "first_semantic_results": len(results),
            "warm_semantic_search_ms": round(warm_search_ms, 3),
            "warm_semantic_results": len(warm_results),
            "semantic_loaded": bool(handle and handle.semantic_loaded),
            "loaded_vector_count": int(handle.vector_store.vector_count if handle else 0),
            "peak_rss_mb": _peak_rss_mb(),
        }
        manager.close_all()
        return result
    finally:
        registry.conn.close()


def _seed_symbol_repo(repo_db: Path, source_dir: Path, symbols: int, files: int) -> None:
    if symbols < 1:
        raise ValueError("symbols must be >= 1")
    files = max(1, min(int(files), int(symbols)))
    metadata = MetadataStore(db_path=str(repo_db))
    try:
        file_ids = []
        for file_idx in range(files):
            source_path = source_dir / f"module_{file_idx:06d}.py"
            file_ids.append(
                metadata.add_file(
                    str(source_path),
                    total_lines=3,
                    content_hash=f"synthetic:{file_idx}",
                )
            )

        pending = []
        for symbol_idx in range(symbols):
            file_id = file_ids[symbol_idx % len(file_ids)]
            pending.append(
                SymbolRecord(
                    file_id=file_id,
                    name=f"semantic_symbol_{symbol_idx:06d}",
                    symbol_type="function",
                    code=(
                        f"def semantic_symbol_{symbol_idx:06d}(value):\n"
                        f"    return value + {symbol_idx}\n"
                    ),
                    start_line=1,
                    end_line=2,
                    docstring=f"Synthetic semantic benchmark symbol {symbol_idx}",
                    embedding_id=symbol_idx,
                )
            )
            if len(pending) >= 2000:
                metadata.add_symbols_batch(pending)
                pending.clear()
        if pending:
            metadata.add_symbols_batch(pending)
    finally:
        metadata.close()


def _file_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def _directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        if item.is_file() and not item.is_symlink():
            total += item.stat().st_size
    return total


def _peak_rss_mb() -> Optional[float]:
    try:
        import resource
    except ImportError:
        return None
    rss = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if sys.platform == "darwin":
        return round(rss / (1024 * 1024), 2)
    return round(rss / 1024, 2)


def _prepare_workdir(workdir: Optional[Path], fresh: bool) -> Optional[Path]:
    if workdir is None:
        return None
    workdir = Path(workdir)
    if fresh and workdir.exists():
        resolved = workdir.resolve()
        if resolved.anchor == str(resolved) or len(resolved.parts) < 3:
            raise ValueError(f"Refusing to remove unsafe benchmark workdir: {resolved}")
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    return workdir


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark CodeSniff semantic vector activation.")
    parser.add_argument("--workdir", type=Path, default=None, help="Optional workspace to keep or inspect.")
    parser.add_argument("--fresh", action="store_true", help="Remove the workdir before running.")
    parser.add_argument("--symbols", type=int, default=10000, help="Synthetic symbols/vectors to create.")
    parser.add_argument("--files", type=int, default=1000, help="Synthetic files to spread symbols across.")
    parser.add_argument("--warm-batch-size", type=int, default=256, help="Semantic warmup batch size.")
    parser.add_argument("--json", action="store_true", help="Print compact JSON.")
    parser.add_argument("--verbose", action="store_true", help="Keep application logs during the benchmark.")
    args = parser.parse_args()

    if not args.verbose:
        logger.remove()

    result = run_semantic_activation_benchmark(
        workdir=_prepare_workdir(args.workdir, fresh=args.fresh),
        symbols=args.symbols,
        files=args.files,
        warm_batch_size=args.warm_batch_size,
    )
    print(json.dumps(result, indent=None if args.json else 2, sort_keys=True))
    return 0 if (
        result["symbols_embedded"] == args.symbols
        and result["semantic_loaded"]
        and result["loaded_vector_count"] == args.symbols
        and result["first_semantic_results"] > 0
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
