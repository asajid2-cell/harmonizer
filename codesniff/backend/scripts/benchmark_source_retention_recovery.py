"""Benchmark recovery paths for pruned shallow GitHub source snapshots."""

import argparse
import json
import os
import shutil
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from loguru import logger

from app.api import routes
from app.core.artifact_manifest import read_repo_manifest
from app.core.repo_storage_profile import build_repo_storage_profile
from app.core.search import SearchEngine
from app.core.text_search import TextSearchEngine
from app.storage.metadata_store import MetadataStore
from app.storage.repo_registry import RepoRegistry
from app.utils import github_clone


class _NoSemantic:
    vector_count = 0
    index = None

    def embed_query(self, query):
        raise AssertionError("source-retention benchmark should not call semantic embedding")

    def search(self, *args, **kwargs):
        raise AssertionError("source-retention benchmark should not call vector search")

    def get_stats(self):
        return {"total_vectors": 0, "dimension": 768, "index_type": None}


def run_source_retention_recovery_benchmark(
    workdir: Optional[Path] = None,
    files: int = 100,
    operation: str = "both",
    max_seconds: float = 60.0,
    prune_threshold_bytes: int = 1,
) -> Dict[str, Any]:
    """Prove pruned GitHub source can be recloned for refresh and deep enrichment."""
    if workdir is None:
        with TemporaryDirectory(prefix="codesniff-source-retention-") as tmp:
            return run_source_retention_recovery_benchmark(
                workdir=Path(tmp),
                files=files,
                operation=operation,
                max_seconds=max_seconds,
                prune_threshold_bytes=prune_threshold_bytes,
            )

    if operation not in {"refresh", "deep", "both"}:
        raise ValueError("operation must be refresh, deep, or both")

    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    registry = RepoRegistry(
        db_path=str(workdir / "registry.sqlite"),
        repos_dir=str(workdir / "repos"),
    )

    previous_registry = routes.repo_registry
    previous_manager = routes.active_repo_manager
    previous_runner = routes.job_runner
    previous_storage_dir = routes.storage_dir
    previous_index_mode = os.environ.get("CODESNIFF_INDEX_MODE")
    previous_auto_enrich = os.environ.get("CODESNIFF_AUTO_DEEP_ENRICH")
    previous_prune_threshold = os.environ.get("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES")
    previous_shallow_threshold = os.environ.get("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD")
    previous_clone = github_clone.clone_github_repo
    clone_source: Dict[str, Path] = {}

    os.environ["CODESNIFF_INDEX_MODE"] = "shallow"
    os.environ["CODESNIFF_AUTO_DEEP_ENRICH"] = "0"
    os.environ["CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES"] = str(prune_threshold_bytes)
    os.environ["CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD"] = "1"

    def fake_clone(_repo_url: str, target_dir: Optional[str] = None) -> str:
        if target_dir is None:
            raise ValueError("benchmark fake clone requires target_dir")
        target = Path(target_dir)
        shutil.copytree(clone_source["path"], target)
        return str(target)

    github_clone.clone_github_repo = fake_clone

    try:
        routes.set_repo_registry(registry, str(workdir))
        routes.set_job_runner(None)
        repo = registry.create_repo(
            "source-retention-recovery",
            "github",
            "https://github.com/example/source-retention-recovery",
        )
        repo_path = Path(repo.storage_path)
        source_path = repo_path / "source"
        initial_source = _write_marker_repo(source_path, marker="oldalpha", files=files)

        initial_job = registry.create_job(repo.id, kind="fast_index", phase="queued_initial")
        initial_start = time.perf_counter()
        routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
        initial_seconds = time.perf_counter() - initial_start
        initial_manifest = read_repo_manifest(repo.storage_path)
        initial_search = _cold_search(repo_path / "repo.sqlite", initial_source["query"])

        result: Dict[str, Any] = {
            "benchmark": "source_retention_recovery",
            "operation": operation,
            "files": files,
            "max_seconds": max_seconds,
            "initial_index_seconds": round(initial_seconds, 3),
            "initial_job_status": registry.get_job(initial_job.id).status,
            "initial_index_mode": _index_mode(initial_manifest),
            "initial_source_available": _source_available(initial_manifest),
            "initial_source_retention_policy": _source_retention_policy(initial_manifest),
            "initial_search_results": initial_search["results"],
            "initial_search_elapsed_ms": initial_search["elapsed_ms"],
        }

        if operation in {"refresh", "both"}:
            refresh_source = _write_marker_repo(workdir / "refresh-source", marker="freshbeta", files=files)
            clone_source["path"] = refresh_source["path"]
            refresh_job = registry.create_job(repo.id, kind="refresh", phase="queued_refresh")
            refresh_start = time.perf_counter()
            routes._run_repo_refresh(repo.id, refresh_job.id)
            refresh_seconds = time.perf_counter() - refresh_start
            refresh_manifest = read_repo_manifest(repo.storage_path)
            refreshed_search = _cold_search(repo_path / "repo.sqlite", refresh_source["query"])
            stale_search = _cold_search(repo_path / "repo.sqlite", initial_source["query"])
            stale_path_count = _path_marker_count(repo_path / "repo.sqlite", "oldalpha")
            result.update({
                "refresh_seconds": round(refresh_seconds, 3),
                "refresh_under_budget": refresh_seconds <= max_seconds,
                "refresh_job_status": registry.get_job(refresh_job.id).status,
                "refresh_index_mode": _index_mode(refresh_manifest),
                "refresh_source_available": _source_available(refresh_manifest),
                "refresh_source_retention_policy": _source_retention_policy(refresh_manifest),
                "refresh_search_results": refreshed_search["results"],
                "refresh_search_elapsed_ms": refreshed_search["elapsed_ms"],
                "refresh_stale_search_results": stale_search["results"],
                "refresh_stale_path_count": stale_path_count,
            })

        if operation in {"deep", "both"}:
            deep_source = _write_marker_repo(workdir / "deep-source", marker="deepgamma", files=files)
            clone_source["path"] = deep_source["path"]
            deep_job = registry.create_job(repo.id, kind="deep_enrich", phase="queued_deep")
            deep_start = time.perf_counter()
            routes._run_repo_deep_enrichment(repo.id, deep_job.id)
            deep_seconds = time.perf_counter() - deep_start
            deep_manifest = read_repo_manifest(repo.storage_path)
            deep_search = _cold_search(repo_path / "repo.sqlite", deep_source["query"])
            result.update({
                "deep_seconds": round(deep_seconds, 3),
                "deep_under_budget": deep_seconds <= max_seconds,
                "deep_job_status": registry.get_job(deep_job.id).status,
                "deep_index_mode": _index_mode(deep_manifest),
                "deep_source_available": _source_available(deep_manifest),
                "deep_source_retention_policy": _source_retention_policy(deep_manifest),
                "deep_search_results": deep_search["results"],
                "deep_search_elapsed_ms": deep_search["elapsed_ms"],
            })

        repo = registry.get_repo(repo.id)
        storage_profile = build_repo_storage_profile(repo.id, repo.storage_path, sample_blobs=0)
        result.update({
            "repo_status": repo.status,
            "storage_total_bytes": storage_profile["total_bytes"],
            "storage_artifact_bytes": storage_profile["artifact_bytes"],
            "peak_rss_mb": _peak_rss_mb(),
        })
        return result
    finally:
        registry.conn.close()
        routes.repo_registry = previous_registry
        routes.active_repo_manager = previous_manager
        routes.job_runner = previous_runner
        routes.storage_dir = previous_storage_dir
        github_clone.clone_github_repo = previous_clone
        _restore_env("CODESNIFF_INDEX_MODE", previous_index_mode)
        _restore_env("CODESNIFF_AUTO_DEEP_ENRICH", previous_auto_enrich)
        _restore_env("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", previous_prune_threshold)
        _restore_env("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", previous_shallow_threshold)


def _write_marker_repo(root: Path, marker: str, files: int) -> Dict[str, Any]:
    if root.exists():
        shutil.rmtree(root)
    root.mkdir(parents=True, exist_ok=True)
    for idx in range(files):
        package_dir = root / "src" / f"pkg_{idx // 100:04d}"
        package_dir.mkdir(parents=True, exist_ok=True)
        name = f"{marker}_{idx:06d}"
        (package_dir / f"{name}.py").write_text(
            f"def {name}():\n"
            f"    return '{marker}'\n",
            encoding="utf-8",
        )
    query = f"{marker}_{max(files - 1, 0):06d}" if files else marker
    return {"path": root, "files": files, "query": query}


def _index_mode(manifest: Dict[str, Any]) -> Optional[str]:
    lexical = manifest.get("lexical") if isinstance(manifest, dict) else None
    return lexical.get("index_mode") if isinstance(lexical, dict) else None


def _source_available(manifest: Dict[str, Any]) -> Optional[bool]:
    source = manifest.get("source") if isinstance(manifest, dict) else None
    return source.get("available") if isinstance(source, dict) else None


def _source_retention_policy(manifest: Dict[str, Any]) -> Optional[str]:
    source = manifest.get("source") if isinstance(manifest, dict) else None
    retention = source.get("retention") if isinstance(source, dict) else None
    return retention.get("policy") if isinstance(retention, dict) else None


def _cold_search(repo_db: Path, query: str) -> Dict[str, Any]:
    metadata = MetadataStore(db_path=str(repo_db), read_only=True)
    try:
        search = SearchEngine(
            embedder=_NoSemantic(),
            vector_store=_NoSemantic(),
            metadata_store=metadata,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )
        start = time.perf_counter()
        results = search.search(query, limit=5)
        return {
            "query": query,
            "results": len(results),
            "elapsed_ms": round((time.perf_counter() - start) * 1000, 3),
        }
    finally:
        metadata.close()


def _path_marker_count(repo_db: Path, marker: str) -> int:
    metadata = MetadataStore(db_path=str(repo_db), read_only=True)
    try:
        row = metadata.conn.execute(
            "SELECT COUNT(*) AS count FROM files WHERE path LIKE ?",
            (f"%{marker}%",),
        ).fetchone()
        return int(row["count"] if row else 0)
    finally:
        metadata.close()


def _peak_rss_mb() -> Optional[float]:
    try:
        import resource
    except ImportError:
        return None
    rss = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if sys.platform == "darwin":
        return round(rss / (1024 * 1024), 2)
    return round(rss / 1024, 2)


def _restore_env(name: str, value: Optional[str]) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value


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
    parser = argparse.ArgumentParser(description="Benchmark pruned-source recovery paths.")
    parser.add_argument("--workdir", type=Path, default=None, help="Optional workspace to keep or inspect.")
    parser.add_argument("--fresh", action="store_true", help="Remove the workdir before running.")
    parser.add_argument("--files", type=int, default=100, help="Files to generate in each source snapshot.")
    parser.add_argument(
        "--operation",
        choices=["refresh", "deep", "both"],
        default="both",
        help="Recovery path to exercise.",
    )
    parser.add_argument("--max-seconds", type=float, default=60.0, help="Per-recovery-path time budget.")
    parser.add_argument("--json", action="store_true", help="Print compact JSON.")
    parser.add_argument("--verbose", action="store_true", help="Keep application logs during the benchmark.")
    args = parser.parse_args()

    if not args.verbose:
        logger.remove()

    result = run_source_retention_recovery_benchmark(
        workdir=_prepare_workdir(args.workdir, fresh=args.fresh),
        files=args.files,
        operation=args.operation,
        max_seconds=args.max_seconds,
    )
    print(json.dumps(result, indent=None if args.json else 2, sort_keys=True))
    ok = (
        result["initial_job_status"] == "complete"
        and result["initial_index_mode"] == "shallow"
        and result["initial_source_retention_policy"] == "pruned"
        and result["initial_search_results"] > 0
        and result["repo_status"] == "lexical_ready"
    )
    if args.operation in {"refresh", "both"}:
        ok = ok and (
            result.get("refresh_under_budget") is True
            and result.get("refresh_job_status") == "complete"
            and result.get("refresh_source_retention_policy") == "pruned"
            and result.get("refresh_source_available") is False
            and result.get("refresh_search_results", 0) > 0
            and result.get("refresh_stale_path_count") == 0
        )
    if args.operation in {"deep", "both"}:
        ok = ok and (
            result.get("deep_under_budget") is True
            and result.get("deep_job_status") == "complete"
            and result.get("deep_index_mode") == "deep"
            and result.get("deep_source_retention_policy") == "kept"
            and result.get("deep_source_available") is True
            and result.get("deep_search_results", 0) > 0
        )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
