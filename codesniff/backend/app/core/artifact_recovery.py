"""Startup recovery for cold repo artifacts."""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from loguru import logger

from .artifact_manifest import validate_repo_manifest, write_repo_manifest
from ..storage.repo_registry import JobRecord, RepoRecord, RepoRegistry
from ..storage.vector_store import VectorStore


@dataclass
class ArtifactRecoveryStats:
    """Summary of one startup artifact recovery scan."""

    scanned: int = 0
    manifests_rebuilt: int = 0
    semantic_repairs_queued: int = 0
    lexical_repairs_queued: int = 0
    lexical_degraded: int = 0
    skipped: int = 0


@dataclass
class ArtifactRepairResult:
    """Result from repairing optional artifacts for one repo."""

    repo_id: int
    files_indexed: int
    symbols_indexed: int
    semantic_artifacts_removed: bool


def queue_artifact_recovery_jobs(registry: RepoRegistry) -> ArtifactRecoveryStats:
    """Rebuild missing manifests and queue repairs for bad optional artifacts."""
    stats = ArtifactRecoveryStats()
    for repo in registry.list_repos():
        stats.scanned += 1
        repo_path = Path(repo.storage_path)
        repo_db = repo_path / "repo.sqlite"
        if not repo_db.exists():
            stats.skipped += 1
            continue
        if _repo_has_active_artifact_job(registry, repo):
            stats.skipped += 1
            continue

        validation = validate_repo_manifest(repo.storage_path)
        if not validation.manifest_present:
            if _semantic_artifacts_exist(repo_path) and _semantic_vector_count(repo_path) is None:
                if _queue_artifact_repair(registry, repo):
                    stats.semantic_repairs_queued += 1
                continue

            semantic_vectors = _semantic_vector_count(repo_path)
            status = "semantic_ready" if semantic_vectors else "lexical_ready"
            write_repo_manifest(
                repo_storage_path=repo.storage_path,
                status=status,
                source_path=repo_path / "source",
                semantic_vectors=semantic_vectors,
            )
            if repo.status not in {"queued", "cloning", "uploading", "cleaning", "fast_indexing", "shallow_indexing", "refresh_queued", "refreshing", "deep_enrich_queued", "deep_enriching", "semantic_warming"}:
                registry.update_repo(repo.id, status=status, error_summary=None)
            stats.manifests_rebuilt += 1
            continue

        if validation.health != "degraded":
            continue

        if validation.lexical_ok and _manifest_declares_semantic(validation):
            if _queue_artifact_repair(registry, repo):
                stats.semantic_repairs_queued += 1
            continue

        if not validation.lexical_ok:
            if _repo_can_refresh_lexical(repo):
                if _queue_lexical_refresh(registry, repo, validation.warnings):
                    stats.lexical_repairs_queued += 1
                continue

            registry.update_repo(
                repo.id,
                status="artifact_degraded",
                error_summary="; ".join(validation.warnings)[:500],
            )
            stats.lexical_degraded += 1

    return stats


def _repo_can_refresh_lexical(repo: RepoRecord) -> bool:
    source_path = Path(repo.storage_path) / "source"
    if source_path.exists():
        return True
    return repo.source_type == "github" and bool(repo.source_url)


def repair_repo_artifacts(registry: RepoRegistry, repo_id: int) -> ArtifactRepairResult:
    """Remove optional semantic artifacts and rewrite a lexical manifest."""
    repo = registry.get_repo(repo_id)
    repo_path = Path(repo.storage_path)
    vector_dir = repo_path / "vector_index"
    semantic_artifacts_removed = vector_dir.exists()

    repaired = registry.repair_semantic_artifacts(repo_id)
    manifest = write_repo_manifest(
        repo_storage_path=repaired.storage_path,
        status="lexical_ready",
        source_path=Path(repaired.storage_path) / "source",
    )
    return ArtifactRepairResult(
        repo_id=repo_id,
        files_indexed=int(manifest.get("lexical", {}).get("files") or 0),
        symbols_indexed=int(manifest.get("lexical", {}).get("symbols") or 0),
        semantic_artifacts_removed=semantic_artifacts_removed,
    )


def _queue_artifact_repair(registry: RepoRegistry, repo: RepoRecord) -> Optional[JobRecord]:
    if registry.get_active_job(repo.id, kind="semantic_warm"):
        logger.info(f"Skipping artifact repair queue for repo {repo.id}; semantic warmup is active")
        return None
    if registry.get_active_job(repo.id, kind="artifact_repair"):
        return None

    job = registry.create_job(repo.id, kind="artifact_repair", phase="queued_artifact_repair")
    registry.update_repo(repo.id, status="artifact_repair_queued", error_summary=None)
    logger.warning(f"Queued artifact repair for repo {repo.id}")
    return job


def _queue_lexical_refresh(registry: RepoRegistry, repo: RepoRecord, warnings: list[str]) -> Optional[JobRecord]:
    if registry.get_active_job(repo.id, kind="refresh"):
        return None

    job = registry.create_job(repo.id, kind="refresh", phase="queued_lexical_repair")
    registry.update_repo(
        repo.id,
        status="refresh_queued",
        error_summary=("Queued lexical repair: " + "; ".join(warnings))[:500],
    )
    logger.warning(f"Queued lexical refresh repair for repo {repo.id}")
    return job


def _repo_has_active_artifact_job(registry: RepoRegistry, repo: RepoRecord) -> bool:
    for kind in ("fast_index", "upload_fast_index", "refresh", "deep_enrich", "semantic_warm", "artifact_repair"):
        if registry.get_active_job(repo.id, kind=kind):
            return True
    return False


def _semantic_artifacts_exist(repo_path: Path) -> bool:
    vector_dir = repo_path / "vector_index"
    return (vector_dir / "vectors.index").exists() or (vector_dir / "metadata.npy").exists()


def _semantic_vector_count(repo_path: Path) -> Optional[int]:
    vector_dir = repo_path / "vector_index"
    if not (vector_dir / "vectors.index").exists() or not (vector_dir / "metadata.npy").exists():
        return None

    try:
        vector_store = VectorStore(dimension=768)
        vector_store.load(str(vector_dir))
    except Exception as e:
        logger.warning(f"Semantic artifact load failed during recovery scan: {e}")
        return None

    return vector_store.vector_count if vector_store.vector_count > 0 else None


def _manifest_declares_semantic(validation) -> bool:
    manifest = validation.manifest or {}
    return bool(manifest.get("semantic", {}).get("ready") or manifest.get("semantic", {}).get("artifacts"))
