"""Run a scheduled refresh proof through the persistent job runner."""

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
from app.core.job_runner import IndexJobRunner
from app.core.search import SearchEngine
from app.core.text_search import TextSearchEngine
from app.storage.metadata_store import MetadataStore
from app.storage.repo_registry import RepoRegistry


class _NoSemantic:
    vector_count = 0
    index = None

    def embed_query(self, query):
        raise AssertionError("scheduled-refresh benchmark should not call semantic embedding")

    def search(self, *args, **kwargs):
        raise AssertionError("scheduled-refresh benchmark should not call vector search")

    def get_stats(self):
        return {"total_vectors": 0, "dimension": 768, "index_type": None}


def run_scheduled_refresh_benchmark(workdir: Optional[Path] = None) -> Dict[str, Any]:
    """Create a repo, make scheduled refresh due, and run it through the runner."""
    if workdir is None:
        with TemporaryDirectory(prefix="codesniff-scheduled-refresh-") as tmp:
            return run_scheduled_refresh_benchmark(Path(tmp))

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
    previous_auto_enrich = os.environ.get("CODESNIFF_AUTO_DEEP_ENRICH")
    os.environ["CODESNIFF_AUTO_DEEP_ENRICH"] = "0"

    try:
        routes.set_repo_registry(registry, str(workdir))
        routes.set_job_runner(None)
        repo = registry.create_repo("scheduled-refresh", "upload", None)
        source_dir = Path(repo.storage_path) / "source"
        source_dir.mkdir(parents=True, exist_ok=True)
        source_file = source_dir / "app.py"
        source_file.write_text(
            "def vanishedalpha():\n"
            "    return 'old'\n",
            encoding="utf-8",
        )

        initial_job = registry.create_job(repo.id, kind="fast_index", phase="queued_initial")
        initial_start = time.perf_counter()
        routes._run_prepared_fast_index(repo.id, initial_job.id, source_dir)
        initial_seconds = time.perf_counter() - initial_start

        repo = registry.get_repo(repo.id)
        initial_search = _cold_search(Path(repo.storage_path) / "repo.sqlite", "vanishedalpha")

        source_file.write_text(
            "def freshbeta():\n"
            "    return 'new'\n",
            encoding="utf-8",
        )
        due_at = "2000-01-01T00:00:00Z"
        registry.set_refresh_schedule(repo.id, interval_minutes=5, next_refresh_at=due_at)

        runner = IndexJobRunner(
            registry=registry,
            handlers={"refresh": lambda job: routes._run_repo_refresh(job.repo_id, job.id)},
            poll_interval=0.01,
            recover_on_start=False,
        )
        routes.set_job_runner(runner)

        refresh_start = time.perf_counter()
        ran = runner.run_once()
        refresh_seconds = time.perf_counter() - refresh_start
        repo = registry.get_repo(repo.id)
        refresh_job = _latest_job(registry, repo.id, "refresh")
        updated_search = _cold_search(Path(repo.storage_path) / "repo.sqlite", "freshbeta")
        stale_search = _cold_search(Path(repo.storage_path) / "repo.sqlite", "vanishedalpha")

        return {
            "benchmark": "scheduled_refresh",
            "runner_ran_work": ran,
            "initial_index_seconds": round(initial_seconds, 3),
            "initial_job_status": registry.get_job(initial_job.id).status,
            "initial_search_results": initial_search["results"],
            "refresh_seconds": round(refresh_seconds, 3),
            "refresh_job_status": refresh_job["status"] if refresh_job else None,
            "refresh_job_phase": refresh_job["phase"] if refresh_job else None,
            "refresh_files_indexed": refresh_job["files_indexed"] if refresh_job else None,
            "refresh_symbols_indexed": refresh_job["symbols_indexed"] if refresh_job else None,
            "repo_status": repo.status,
            "last_scheduled_refresh_at": repo.last_scheduled_refresh_at,
            "next_refresh_at": repo.next_refresh_at,
            "updated_search_results": updated_search["results"],
            "stale_search_results": stale_search["results"],
            "peak_rss_mb": _peak_rss_mb(),
        }
    finally:
        registry.conn.close()
        routes.repo_registry = previous_registry
        routes.active_repo_manager = previous_manager
        routes.job_runner = previous_runner
        routes.storage_dir = previous_storage_dir
        if previous_auto_enrich is None:
            os.environ.pop("CODESNIFF_AUTO_DEEP_ENRICH", None)
        else:
            os.environ["CODESNIFF_AUTO_DEEP_ENRICH"] = previous_auto_enrich


def _latest_job(registry: RepoRegistry, repo_id: int, kind: str) -> Optional[Dict[str, Any]]:
    row = registry.conn.execute(
        """
        SELECT *
        FROM index_jobs
        WHERE repo_id = ? AND kind = ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (repo_id, kind),
    ).fetchone()
    return dict(row) if row else None


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
    parser = argparse.ArgumentParser(description="Benchmark CodeSniff scheduled refresh through the runner.")
    parser.add_argument("--workdir", type=Path, default=None, help="Optional workspace to keep or inspect.")
    parser.add_argument("--fresh", action="store_true", help="Remove the workdir before running.")
    parser.add_argument("--json", action="store_true", help="Print compact JSON.")
    parser.add_argument("--verbose", action="store_true", help="Keep application logs during the benchmark.")
    args = parser.parse_args()

    if not args.verbose:
        logger.remove()

    result = run_scheduled_refresh_benchmark(
        workdir=_prepare_workdir(args.workdir, fresh=args.fresh),
    )
    print(json.dumps(result, indent=None if args.json else 2, sort_keys=True))
    return 0 if (
        result["runner_ran_work"]
        and result["initial_search_results"] > 0
        and result["updated_search_results"] > 0
        and result["stale_search_results"] == 0
        and result["refresh_job_status"] == "complete"
        and result["repo_status"] == "lexical_ready"
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
