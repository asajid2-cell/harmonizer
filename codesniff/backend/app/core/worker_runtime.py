"""Shared runtime wiring for CodeSniff persistent indexing workers."""

from __future__ import annotations

import os
from dataclasses import dataclass

from loguru import logger

from ..api import routes
from ..storage.active_repo_manager import ActiveRepoManager
from ..storage.repo_registry import RepoRegistry
from .artifact_recovery import (
    ArtifactRecoveryStats,
    queue_artifact_recovery_jobs,
    repair_repo_artifacts,
)
from .job_runner import IndexJobRunner


@dataclass
class CodeSniffJobRuntime:
    """Initialized registry, active-repo cache, and job runner."""

    registry: RepoRegistry
    active_repo_manager: ActiveRepoManager
    runner: IndexJobRunner
    recovered_jobs: int
    recovery: ArtifactRecoveryStats


def build_job_handlers(registry: RepoRegistry):
    """Build the production job handler map used by web and worker processes."""

    def run_fast_index_job(job):
        repo = registry.get_repo(job.repo_id)
        if not repo.source_url:
            raise RuntimeError(f"Repo {repo.id} has no source URL for fast indexing")
        routes._run_github_fast_index(job.repo_id, job.id, repo.source_url)

    def run_uploaded_fast_index_job(job):
        routes._run_uploaded_fast_index(job.repo_id, job.id)

    def run_refresh_job(job):
        routes._run_repo_refresh(job.repo_id, job.id)

    def run_deep_enrich_job(job):
        routes._run_repo_deep_enrichment(job.repo_id, job.id)

    def run_semantic_warm_job(job):
        routes._run_repo_semantic_warmup(job.repo_id, job.id)

    def run_artifact_repair_job(job):
        result = repair_repo_artifacts(registry, job.repo_id)
        registry.mark_job_complete(
            job.id,
            phase="lexical_ready",
            files_indexed=result.files_indexed,
            symbols_indexed=result.symbols_indexed,
        )

    return {
        "fast_index": run_fast_index_job,
        "upload_fast_index": run_uploaded_fast_index_job,
        "refresh": run_refresh_job,
        "deep_enrich": run_deep_enrich_job,
        "semantic_warm": run_semantic_warm_job,
        "artifact_repair": run_artifact_repair_job,
    }


def initialize_job_runtime(
    *,
    storage_dir: str,
    max_active_repos: int = 3,
    poll_interval: float = 1.0,
    recover_interrupted: bool = True,
    run_recovery_scan: bool = True,
    start_runner: bool = True,
) -> CodeSniffJobRuntime:
    """Initialize persistent repo/job state and optionally start the worker loop."""
    os.makedirs(storage_dir, exist_ok=True)
    registry = RepoRegistry(
        db_path=os.path.join(storage_dir, "registry.sqlite"),
        repos_dir=os.path.join(storage_dir, "repos"),
    )
    active_repo_manager = ActiveRepoManager(
        registry=registry,
        storage_dir=storage_dir,
        max_active_repos=max_active_repos,
        embedder_cache_dir=os.path.join(storage_dir, "embeddings_cache"),
    )

    routes.set_repo_registry(registry, storage_dir)
    routes.set_active_repo_manager(active_repo_manager)

    runner = IndexJobRunner(
        registry=registry,
        handlers=build_job_handlers(registry),
        poll_interval=poll_interval,
        recover_on_start=False,
    )
    routes.set_job_runner(runner)

    recovered = runner.recover_interrupted_jobs() if recover_interrupted else 0
    if recovered:
        logger.warning(f"Requeued {recovered} interrupted CodeSniff jobs after startup")

    recovery = ArtifactRecoveryStats()
    if run_recovery_scan:
        recovery = queue_artifact_recovery_jobs(registry)
        _log_recovery_scan(recovery)

    if start_runner:
        runner.start()

    return CodeSniffJobRuntime(
        registry=registry,
        active_repo_manager=active_repo_manager,
        runner=runner,
        recovered_jobs=recovered,
        recovery=recovery,
    )


def _log_recovery_scan(recovery: ArtifactRecoveryStats):
    if (
        recovery.manifests_rebuilt
        or recovery.semantic_repairs_queued
        or recovery.lexical_repairs_queued
        or recovery.lexical_degraded
    ):
        logger.warning(
            "CodeSniff artifact recovery scan: "
            f"rebuilt={recovery.manifests_rebuilt}, "
            f"repairs_queued={recovery.semantic_repairs_queued}, "
            f"lexical_repairs_queued={recovery.lexical_repairs_queued}, "
            f"lexical_degraded={recovery.lexical_degraded}"
        )
