"""Run a synthetic benchmark through CodeSniff's repo job wrapper."""

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from loguru import logger

from app.api import routes
from app.core.artifact_manifest import read_repo_manifest
from app.core.fast_index_benchmark import (
    benchmark_result_json,
    create_synthetic_python_repo,
)
from app.core.repo_storage_profile import build_repo_storage_profile
from app.core.search import SearchEngine
from app.core.text_search import TextSearchEngine
from app.storage.metadata_store import MetadataStore
from app.storage.repo_registry import RepoRegistry


class _ExplodingSemanticDependency:
    def embed_query(self, query):
        raise AssertionError("repo-job benchmark cold search called semantic embed_query")

    def generate_embedding(self, code):
        raise AssertionError("repo-job benchmark cold search called semantic generate_embedding")

    def batch_generate(self, codes, batch_size=8, use_cache=True):
        raise AssertionError("repo-job benchmark cold search called semantic batch_generate")

    def search(self, *args, **kwargs):
        raise AssertionError("repo-job benchmark cold search called vector search")

    def get_stats(self):
        return {"total_vectors": 0, "dimension": 768, "index_type": None}

    @property
    def vector_count(self):
        return 0

    @property
    def index(self):
        return None


def run_repo_job_benchmark(
    workdir: Optional[Path] = None,
    files: int = 1000,
    symbols_per_file: int = 1,
    pruned_files: int = 1000,
    max_seconds: float = 180.0,
    index_mode: str = "auto",
    sample_blobs: int = 5,
    search_query: Optional[str] = None,
    source_dir: Optional[Path] = None,
    source_type: str = "upload",
    source_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate a repo and run the production fast-index job wrapper."""
    if workdir is None:
        with TemporaryDirectory(prefix="codesniff-repo-job-") as tmp:
            return run_repo_job_benchmark(
                workdir=Path(tmp),
                files=files,
                symbols_per_file=symbols_per_file,
                pruned_files=pruned_files,
                max_seconds=max_seconds,
                index_mode=index_mode,
                sample_blobs=sample_blobs,
                search_query=search_query,
                source_dir=source_dir,
                source_type=source_type,
                source_url=source_url,
            )

    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    registry = RepoRegistry(
        db_path=str(workdir / "registry.sqlite"),
        repos_dir=str(workdir / "repos"),
    )

    previous_index_mode = os.environ.get("CODESNIFF_INDEX_MODE")
    previous_auto_enrich = os.environ.get("CODESNIFF_AUTO_DEEP_ENRICH")
    previous_registry = routes.repo_registry
    previous_manager = routes.active_repo_manager
    previous_runner = routes.job_runner
    previous_storage_dir = routes.storage_dir
    if index_mode and index_mode != "auto":
        os.environ["CODESNIFF_INDEX_MODE"] = index_mode
    else:
        os.environ.pop("CODESNIFF_INDEX_MODE", None)
    os.environ["CODESNIFF_AUTO_DEEP_ENRICH"] = "0"

    try:
        routes.set_repo_registry(registry, str(workdir))
        routes.set_job_runner(None)
        repo_source_type = source_type if source_type in {"upload", "github", "synthetic"} else "upload"
        repo_source_url = source_url
        if repo_source_type == "github" and not repo_source_url:
            repo_source_url = "https://github.com/example/synthetic-vps-scale"
        repo = registry.create_repo("synthetic-vps-scale", repo_source_type, repo_source_url)
        if source_dir is not None:
            generated = _stage_existing_source(Path(source_dir), Path(repo.storage_path) / "source")
        else:
            generated = create_synthetic_python_repo(
                Path(repo.storage_path),
                files=files,
                symbols_per_file=symbols_per_file,
                pruned_files=pruned_files,
            )
        source_path = Path(repo.storage_path) / "source"
        job = registry.create_job(repo.id, kind="fast_index", phase="queued_benchmark")

        start = time.perf_counter()
        routes._run_prepared_fast_index(repo.id, job.id, source_path)
        elapsed = time.perf_counter() - start

        repo = registry.get_repo(repo.id)
        job = registry.get_job(job.id)
        stats = routes._repo_stats(repo)
        manifest = read_repo_manifest(repo.storage_path)
        storage_profile = build_repo_storage_profile(
            repo.id,
            repo.storage_path,
            sample_blobs=sample_blobs,
        )
        cold_search = _run_cold_search(
            Path(repo.storage_path) / "repo.sqlite",
            search_query or generated.get("sample_query") or f"module_{files - 1:06d}",
        )
        rate_file_count = int(generated.get("source_files") or files or 0)
        result = {
            "benchmark": "repo_job_wrapper",
            "requested_files": files,
            "requested_symbols_per_file": symbols_per_file,
            "requested_pruned_files": pruned_files,
            "generated": generated,
            "time_taken_seconds": elapsed,
            "seconds_per_1000_files": (elapsed / rate_file_count * 1000) if rate_file_count else None,
            "under_budget": elapsed <= max_seconds,
            "max_seconds": max_seconds,
            "repo_status": repo.status,
            "job_status": job.status,
            "job_phase": job.phase,
            "job_files_seen": job.files_seen,
            "job_files_indexed": job.files_indexed,
            "job_symbols_indexed": job.symbols_indexed,
            "db_total_files": stats.get("total_files", 0),
            "db_total_symbols": stats.get("total_symbols", 0),
            "manifest_index_mode": (
                manifest.get("lexical", {}).get("index_mode")
                if isinstance(manifest, dict)
                else None
            ),
            "manifest_status": manifest.get("status") if isinstance(manifest, dict) else None,
            "manifest_source_available": (
                manifest.get("source", {}).get("available")
                if isinstance(manifest, dict)
                else None
            ),
            "manifest_source_retention_policy": (
                manifest.get("source", {}).get("retention", {}).get("policy")
                if isinstance(manifest, dict)
                else None
            ),
            "manifest_source_retention_reason": (
                manifest.get("source", {}).get("retention", {}).get("reason")
                if isinstance(manifest, dict)
                else None
            ),
            "manifest_source_retention_bytes": (
                manifest.get("source", {}).get("retention", {}).get("bytes")
                if isinstance(manifest, dict)
                else None
            ),
            "manifest_source_retention_threshold_bytes": (
                manifest.get("source", {}).get("retention", {}).get("threshold_bytes")
                if isinstance(manifest, dict)
                else None
            ),
            "storage_total_bytes": storage_profile["total_bytes"],
            "storage_artifact_bytes": storage_profile["artifact_bytes"],
            "blob_count": storage_profile["blob_count"],
            "blob_coverage": storage_profile["blob_coverage"],
            "blob_compressed_bytes": storage_profile["blob_compressed_bytes"],
            "blob_uncompressed_bytes": storage_profile["blob_uncompressed_bytes"],
            "sampled_decompress_ms_max": storage_profile["sampled_decompress_ms_max"],
            "sampled_blob_count": storage_profile["sampled_blob_count"],
            "cold_search_query": cold_search["query"],
            "cold_search_results": cold_search["results"],
            "cold_search_elapsed_ms": cold_search["elapsed_ms"],
            "cold_search_first_symbol": cold_search["first_symbol"],
            "cold_search_first_file": cold_search["first_file"],
            "peak_rss_mb": _peak_rss_mb(),
        }
        return result
    finally:
        registry.conn.close()
        routes.repo_registry = previous_registry
        routes.active_repo_manager = previous_manager
        routes.job_runner = previous_runner
        routes.storage_dir = previous_storage_dir
        if previous_index_mode is None:
            os.environ.pop("CODESNIFF_INDEX_MODE", None)
        else:
            os.environ["CODESNIFF_INDEX_MODE"] = previous_index_mode
        if previous_auto_enrich is None:
            os.environ.pop("CODESNIFF_AUTO_DEEP_ENRICH", None)
        else:
            os.environ["CODESNIFF_AUTO_DEEP_ENRICH"] = previous_auto_enrich


def _peak_rss_mb() -> Optional[float]:
    try:
        import resource
    except ImportError:
        return None

    usage = resource.getrusage(resource.RUSAGE_SELF)
    rss = float(usage.ru_maxrss)
    if sys.platform == "darwin":
        return round(rss / (1024 * 1024), 2)
    return round(rss / 1024, 2)


def _run_cold_search(repo_db: Path, query: str) -> Dict[str, Any]:
    metadata = MetadataStore(db_path=str(repo_db), read_only=True)
    try:
        semantic_guard = _ExplodingSemanticDependency()
        search = SearchEngine(
            embedder=semantic_guard,
            vector_store=semantic_guard,
            metadata_store=metadata,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )
        start = time.perf_counter()
        results = search.search(query, limit=5)
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "query": query,
            "results": len(results),
            "elapsed_ms": round(elapsed_ms, 3),
            "first_symbol": results[0].symbol_name if results else None,
            "first_file": results[0].file_path if results else None,
        }
    finally:
        metadata.close()


def _stage_existing_source(source_dir: Path, target_source: Path) -> Dict[str, Any]:
    source_dir = source_dir.resolve()
    if not source_dir.exists() or not source_dir.is_dir():
        raise FileNotFoundError(f"Source directory does not exist: {source_dir}")

    if target_source.exists():
        shutil.rmtree(target_source)
    target_source.mkdir(parents=True, exist_ok=True)

    tracked_files = _git_tracked_files(source_dir)
    if tracked_files is not None:
        staged = _copy_selected_files(source_dir, target_source, tracked_files)
        mode = "git_tracked"
    else:
        shutil.rmtree(target_source)
        shutil.copytree(
            source_dir,
            target_source,
            ignore=_copytree_ignore,
            ignore_dangling_symlinks=True,
        )
        staged = [
            path.relative_to(target_source).as_posix()
            for path in target_source.rglob("*")
            if path.is_file()
        ]
        mode = "copytree_pruned"

    staged = sorted(staged)
    return {
        "source_dir": str(source_dir),
        "source_mode": mode,
        "source_files": len(staged),
        "source_symbols": None,
        "pruned_files": None,
        "sample_query": _sample_query(staged),
    }


def _git_tracked_files(source_dir: Path) -> Optional[list[str]]:
    if not (source_dir / ".git").exists():
        return None
    try:
        result = subprocess.run(
            ["git", "-C", str(source_dir), "ls-files", "-z"],
            check=True,
            capture_output=True,
            text=False,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return [
        raw.decode("utf-8", errors="replace")
        for raw in result.stdout.split(b"\0")
        if raw
    ]


def _copy_selected_files(source_dir: Path, target_source: Path, relative_paths: list[str]) -> list[str]:
    copied: list[str] = []
    for relative in relative_paths:
        rel_path = Path(relative)
        if rel_path.is_absolute() or ".." in rel_path.parts:
            continue
        src = source_dir / rel_path
        if not src.is_file() or src.is_symlink():
            continue
        dst = target_source / rel_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        copied.append(rel_path.as_posix())
    return copied


def _copytree_ignore(_dir: str, names: list[str]) -> set[str]:
    ignored = {
        ".git",
        "node_modules",
        "vendor",
        "dist",
        "build",
        ".next",
        ".nuxt",
        "target",
        "coverage",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".venv",
        "venv",
        "env",
        "uploads",
        "data",
        "audiobooks",
        "logs",
        "storage",
    }
    return {name for name in names if name in ignored}


def _sample_query(relative_paths: list[str]) -> Optional[str]:
    for relative in relative_paths:
        stem = Path(relative).stem
        if stem and stem.lower() not in {"readme", "index", "__init__"}:
            return stem
    if relative_paths:
        return Path(relative_paths[0]).stem or relative_paths[0]
    return None


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
    parser = argparse.ArgumentParser(
        description="Benchmark CodeSniff's production repo fast-index job wrapper."
    )
    parser.add_argument("--workdir", type=Path, default=None, help="Optional workspace to keep or inspect.")
    parser.add_argument("--fresh", action="store_true", help="Remove the workdir before running.")
    parser.add_argument("--files", type=int, default=1000, help="Number of source files to generate.")
    parser.add_argument("--symbols-per-file", type=int, default=1, help="Functions per generated Python file.")
    parser.add_argument("--pruned-files", type=int, default=1000, help="Ignored node_modules files to generate.")
    parser.add_argument("--max-seconds", type=float, default=180.0, help="Budget for this benchmark run.")
    parser.add_argument(
        "--index-mode",
        choices=["auto", "shallow", "deep"],
        default="auto",
        help="Override CODESNIFF_INDEX_MODE for the job.",
    )
    parser.add_argument("--sample-blobs", type=int, default=5, help="Number of source blobs to sample.")
    parser.add_argument("--search-query", default=None, help="Cold lexical search query to verify after indexing.")
    parser.add_argument("--source-dir", type=Path, default=None, help="Existing source tree to stage instead of generating a synthetic repo.")
    parser.add_argument(
        "--source-type",
        choices=["upload", "github", "synthetic"],
        default="upload",
        help="Repo source type to register before running the job.",
    )
    parser.add_argument(
        "--source-url",
        default=None,
        help="Repo source URL to register when --source-type=github.",
    )
    parser.add_argument("--verbose", action="store_true", help="Keep application logs during the benchmark.")
    args = parser.parse_args()

    if not args.verbose:
        logger.remove()

    workdir = _prepare_workdir(args.workdir, fresh=args.fresh)
    result = run_repo_job_benchmark(
        workdir=workdir,
        files=args.files,
        symbols_per_file=args.symbols_per_file,
        pruned_files=args.pruned_files,
        max_seconds=args.max_seconds,
        index_mode=args.index_mode,
        sample_blobs=args.sample_blobs,
        search_query=args.search_query,
        source_dir=args.source_dir,
        source_type=args.source_type,
        source_url=args.source_url,
    )
    print(benchmark_result_json(result))
    return 0 if (
        result["under_budget"]
        and result["job_status"] == "complete"
        and result["cold_search_results"] > 0
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
