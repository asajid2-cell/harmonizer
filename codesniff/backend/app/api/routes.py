"""API routes for CodeScope"""

import time
import os
import sqlite3
import subprocess
import tempfile
import shutil
import zipfile
from pathlib import Path, PurePosixPath
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Query
from loguru import logger

from ..models.schemas import (
    IndexRequest, IndexResponse, IndexStats,
    SearchRequest, SearchResponse, SearchResult,
    SimilarCodeRequest, SymbolLookupRequest,
    StatsResponse, HealthResponse, ErrorResponse,
    GitHubRepoRequest, RepoResponse, JobResponse, RepoIndexResponse,
    RepoRefreshScheduleRequest,
    OperatorPolicyResponse,
    RepoOverviewResponse, RepoFactsResponse, RepoRelationshipsResponse,
    RepoTeachingResponse,
    RepoTeachingQueryResponse,
    RepoSearchQualityResponse,
    RepoStorageProfileResponse,
    RepoFilesResponse, RepoFileContentResponse, RepoModuleDetailResponse,
)
from ..core.indexer import Indexer, IndexingCanceled
from ..core.search import SearchEngine
from ..core.text_search import TextSearchEngine
from ..core.semantic_warmup import warm_repo_semantics
from ..core.job_runner import IndexJobRunner, REPO_EXCLUSIVE_JOB_KINDS
from ..core.repo_overview import build_repo_overview, persist_repo_overview, read_repo_facts, read_repo_relationships, read_repo_module_detail
from ..core.repo_teaching import build_repo_teaching, build_repo_teaching_query
from ..core.search_quality import evaluate_repo_search_smoke
from ..core.repo_storage_profile import build_repo_storage_profile
from ..core.artifact_manifest import read_repo_manifest, validate_repo_manifest, write_repo_manifest
from ..core.operator_policy import get_source_retention_policy
from ..chatbot.groq_chat import CodeSniffChatbot, CodeSniffRAG
from ..storage.metadata_store import MetadataStore, compute_file_hash
from ..storage.vector_store import VectorStore
from ..storage.repo_registry import RepoRegistry, RepoRecord, JobRecord
from ..storage.active_repo_manager import ActiveRepoManager


# Create router
router = APIRouter()

# Global instances (will be initialized in main.py)
indexer: Optional[Indexer] = None
search_engine: Optional[SearchEngine] = None
chatbot: Optional[CodeSniffChatbot] = None
rag_system: Optional[CodeSniffRAG] = None
repo_registry: Optional[RepoRegistry] = None
active_repo_manager: Optional[ActiveRepoManager] = None
job_runner: Optional[IndexJobRunner] = None
storage_dir: str = "./storage"


def set_indexer(idx: Indexer):
    """Set the global indexer instance"""
    global indexer
    indexer = idx


def set_search_engine(engine: SearchEngine):
    """Set the global search engine instance"""
    global search_engine
    search_engine = engine


def set_chatbot(bot: CodeSniffChatbot):
    """Set the global chatbot instance"""
    global chatbot
    chatbot = bot


def set_rag_system(rag: CodeSniffRAG):
    """Set the global RAG system instance"""
    global rag_system
    rag_system = rag


def set_repo_registry(registry: RepoRegistry, storage_path: str):
    """Set the global repo registry instance."""
    global repo_registry, active_repo_manager, job_runner, storage_dir
    repo_registry = registry
    storage_dir = storage_path
    job_runner = None
    active_repo_manager = ActiveRepoManager(
        registry=registry,
        storage_dir=storage_path,
        embedder_cache_dir=os.path.join(storage_path, "embeddings_cache"),
    )


def set_active_repo_manager(manager: ActiveRepoManager):
    """Set the active repo manager instance."""
    global active_repo_manager
    active_repo_manager = manager


def set_job_runner(runner: Optional[IndexJobRunner]):
    """Set the persistent job runner instance."""
    global job_runner
    job_runner = runner


def _derive_repo_name(repo_url: str) -> str:
    clean = repo_url.rstrip("/").split("?")[0]
    if clean.endswith(".git"):
        clean = clean[:-4]
    return clean.split("/")[-1] or "repo"


def _safe_upload_relative_path(filename: str) -> Path:
    """Return a safe relative path for uploaded folder or ZIP entries."""
    normalized = (filename or "").replace("\\", "/")
    parts = []
    for part in PurePosixPath(normalized).parts:
        if part in ("", ".", "/"):
            continue
        if part == ".." or ":" in part:
            raise ValueError(f"Unsafe upload path: {filename}")
        parts.append(part)

    if not parts:
        raise ValueError("Upload path is empty")
    return Path(*parts)


def _derive_upload_name(files: List[UploadFile], is_zip: bool, requested_name: Optional[str]) -> str:
    if requested_name and requested_name.strip():
        return requested_name.strip()[:120]

    first_name = files[0].filename if files else "upload"
    normalized = (first_name or "upload").replace("\\", "/")
    if is_zip:
        return Path(PurePosixPath(normalized).name).stem or "upload"
    return normalized.split("/", 1)[0] or "upload"


def _extract_zip_safely(zip_path: Path, target_dir: Path):
    """Extract ZIP contents without allowing absolute or parent traversal paths."""
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        for member in zip_ref.infolist():
            if member.is_dir():
                continue
            relative_path = _safe_upload_relative_path(member.filename)
            target_path = target_dir / relative_path
            target_path.parent.mkdir(parents=True, exist_ok=True)
            with zip_ref.open(member, "r") as src, open(target_path, "wb") as dst:
                shutil.copyfileobj(src, dst)


def _repo_stats(repo: RepoRecord) -> Dict[str, int]:
    db_path = Path(repo.storage_path) / "repo.sqlite"
    if not db_path.exists():
        return {"total_symbols": 0, "total_files": 0}

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        total_files = cursor.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        total_symbols = cursor.execute("SELECT COUNT(*) FROM symbols").fetchone()[0]
        conn.close()
        return {"total_symbols": total_symbols, "total_files": total_files}
    except Exception as e:
        logger.warning(f"Failed to read repo stats for repo {repo.id}: {e}")
        return {"total_symbols": 0, "total_files": 0}


def _semantic_artifact_ready(repo: RepoRecord, manifest_validation=None) -> bool:
    if manifest_validation and manifest_validation.manifest_present:
        if not manifest_validation.semantic_ok:
            return False

    vector_dir = Path(repo.storage_path) / "vector_index"
    if not (vector_dir / "vectors.index").exists():
        return False
    if not (vector_dir / "metadata.npy").exists():
        return False

    try:
        vector_store = VectorStore(dimension=768)
        vector_store.load(str(vector_dir))
        return vector_store.vector_count > 0
    except Exception as e:
        logger.warning(f"Repo {repo.id} semantic artifact is not loadable: {e}")
        return False


def _sqlite_sidecar_paths(db_path: Path) -> List[Path]:
    return [
        db_path.with_name(f"{db_path.name}-wal"),
        db_path.with_name(f"{db_path.name}-shm"),
    ]


def _remove_sqlite_artifact(db_path: Path):
    for path in [db_path, *_sqlite_sidecar_paths(db_path)]:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning(f"Failed to remove SQLite artifact {path}")


def _checkpoint_metadata_store(metadata_store: MetadataStore):
    try:
        if metadata_store.conn is not None:
            metadata_store.conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.Error as e:
        logger.warning(f"Failed to checkpoint temp metadata DB: {e}")


def _directory_size_bytes(root: Path) -> int:
    total = 0
    if not root.exists():
        return 0
    for current_root, dir_names, file_names in os.walk(root):
        kept_dirs = []
        for dir_name in dir_names:
            path = Path(current_root) / dir_name
            if path.is_symlink():
                continue
            kept_dirs.append(dir_name)
        dir_names[:] = kept_dirs
        for file_name in file_names:
            path = Path(current_root) / file_name
            try:
                if path.is_symlink() or not path.is_file():
                    continue
                total += path.stat().st_size
            except OSError:
                continue
    return total


def _source_state(repo: RepoRecord, manifest: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    repo_path = Path(repo.storage_path)
    source = manifest.get("source") if isinstance(manifest, dict) else None
    source_path_value = source.get("path") if isinstance(source, dict) else None
    source_path = repo_path / "source"
    if isinstance(source_path_value, str) and source_path_value:
        candidate = Path(source_path_value)
        source_path = candidate if candidate.is_absolute() else repo_path / candidate
    retention = source.get("retention") if isinstance(source, dict) else None
    retention = retention if isinstance(retention, dict) else {}
    available = source_path.exists()
    policy = str(retention.get("policy") or ("kept" if available else "unknown"))
    return {
        "available": available,
        "pruned": policy == "pruned" and not available,
        "policy": policy,
        "path": source_path,
        "retention": retention,
    }


def _managed_source_path(repo_path: Path) -> Path:
    return repo_path / "source"


def _is_managed_source_path(repo_path: Path, source_path: Path) -> bool:
    try:
        return source_path.resolve() == _managed_source_path(repo_path).resolve()
    except OSError:
        return False


def _maybe_prune_source_after_index(
    repo: RepoRecord,
    source_path: Path,
    index_mode: str,
    status: str,
    files_seen: int,
    files_indexed: int,
    symbols_indexed: int,
):
    """Prune large shallow GitHub source snapshots after cold search is durable."""
    retention_policy = get_source_retention_policy()
    if not retention_policy.enabled:
        return
    if index_mode != "shallow":
        return
    if repo.source_type != "github" or not repo.source_url:
        return

    repo_path = Path(repo.storage_path)
    source_path = Path(source_path)
    if not source_path.exists() or not _is_managed_source_path(repo_path, source_path):
        return

    source_bytes = _directory_size_bytes(source_path)
    if not retention_policy.should_prune(
        source_type=repo.source_type,
        source_url=repo.source_url,
        index_mode=index_mode,
        source_bytes=source_bytes,
    ):
        return

    retention = {
        "policy": "pruned",
        "reason": "large_shallow_github_source",
        "bytes": source_bytes,
        "threshold_bytes": retention_policy.prune_threshold_bytes,
        "pruned_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        shutil.rmtree(source_path)
        write_repo_manifest(
            repo_storage_path=repo.storage_path,
            status=status,
            source_path=source_path,
            files_seen=files_seen,
            files_indexed=files_indexed,
            symbols_indexed=symbols_indexed,
            index_mode=index_mode,
            source_retention=retention,
        )
        logger.info(
            f"Pruned source snapshot for repo {repo.id}: "
            f"{source_bytes} bytes >= {retention_policy.prune_threshold_bytes} byte threshold"
        )
    except OSError as e:
        logger.warning(f"Failed to prune source snapshot for repo {repo.id}: {e}")


def _make_job_progress_callback(job_id: int, files_seen: int):
    last_update = {"count": 0, "time": 0.0}

    def _callback(stats):
        if repo_registry is None:
            return

        completed_files = stats.files_processed + stats.files_failed
        now = time.time()
        should_update = (
            completed_files <= 3
            or completed_files == files_seen
            or completed_files - last_update["count"] >= 25
            or now - last_update["time"] >= 1.0
        )
        if not should_update:
            return

        last_update["count"] = completed_files
        last_update["time"] = now
        repo_registry.update_job(
            job_id,
            files_indexed=stats.files_processed,
            symbols_indexed=stats.total_symbols,
        )

    return _callback


def _replace_source_tree(source_from: Optional[Path], source_to: Path) -> Optional[Path]:
    if source_from is None:
        return None
    if source_from.resolve() == source_to.resolve():
        return None

    backup = source_to.with_name(f"{source_to.name}.backup.{os.getpid()}.{time.time_ns()}.tmp")
    if backup.exists():
        shutil.rmtree(backup)

    if source_to.exists():
        shutil.move(str(source_to), str(backup))
    shutil.move(str(source_from), str(source_to))
    return backup


def _restore_source_tree(backup: Optional[Path], source_to: Path):
    if backup is None:
        return
    if source_to.exists():
        shutil.rmtree(source_to)
    if backup.exists():
        shutil.move(str(backup), str(source_to))


def _commit_lexical_artifacts(
    repo_id: int,
    repo_path: Path,
    temp_db: Path,
    source_replace_from: Optional[Path] = None,
    drop_semantic: bool = True,
):
    final_db = repo_path / "repo.sqlite"
    final_source = repo_path / "source"
    source_backup: Optional[Path] = None

    if active_repo_manager:
        active_repo_manager.evict(repo_id)

    try:
        source_backup = _replace_source_tree(source_replace_from, final_source)
        for sidecar in _sqlite_sidecar_paths(final_db):
            sidecar.unlink(missing_ok=True)
        os.replace(temp_db, final_db)
        for sidecar in _sqlite_sidecar_paths(temp_db):
            sidecar.unlink(missing_ok=True)
    except Exception:
        _restore_source_tree(source_backup, final_source)
        raise

    if source_backup and source_backup.exists():
        shutil.rmtree(source_backup)

    if drop_semantic:
        vector_dir = repo_path / "vector_index"
        if vector_dir.exists():
            shutil.rmtree(vector_dir)


def _backup_sqlite_artifact(source_db: Path, target_db: Path):
    """Copy a SQLite DB through SQLite's backup API so WAL state is folded in."""
    _remove_sqlite_artifact(target_db)
    source = sqlite3.connect(f"file:{source_db}?mode=ro", uri=True)
    target = sqlite3.connect(str(target_db))
    try:
        source.backup(target)
        target.commit()
    finally:
        target.close()
        source.close()


def _run_incremental_refresh(
    repo_id: int,
    job_id: int,
    source_path: Path,
    previous_status: str,
) -> bool:
    """Refresh an existing lexical DB by reindexing only changed files."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return False

    from ..utils.github_clone import clean_repository

    repo = repo_registry.get_repo(repo_id)
    repo_path = Path(repo.storage_path)
    final_db = repo_path / "repo.sqlite"
    if not final_db.exists():
        return False

    phase = "cleaning"
    repo_registry.update_job(job_id, phase=phase)
    repo_registry.update_repo(repo_id, status="cleaning", error_summary=None)
    _raise_if_job_canceled(job_id)
    clean_repository(str(source_path))
    _raise_if_job_canceled(job_id)

    temp_db = repo_path / f"repo.sqlite.{job_id}.tmp"
    _backup_sqlite_artifact(final_db, temp_db)
    metadata_store = MetadataStore(db_path=str(temp_db))
    changed_files: List[Path] = []
    deleted_paths: List[str] = []
    stats = None
    temp_replaced_or_removed = False
    cleanup_temp_after_close = False

    try:
        vector_store = VectorStore(dimension=768)
        text_search = TextSearchEngine()
        repo_indexer = Indexer(
            embedder=None,
            embedder_cache_dir=os.path.join(storage_dir, "embeddings_cache"),
            vector_store=vector_store,
            metadata_store=metadata_store,
            text_search=text_search,
            build_text_index=False,
        )

        phase = "incremental_refreshing"
        repo_registry.update_job(job_id, phase=phase)
        all_files, directories_pruned = repo_indexer._discover_supported_files(source_path)
        current_hashes = {
            str(path): compute_file_hash(path)
            for path in all_files
        }
        existing_hashes = metadata_store.get_file_hashes()
        current_paths = set(current_hashes)
        deleted_paths = sorted(set(existing_hashes) - current_paths)
        changed_files = [
            path
            for path in all_files
            if existing_hashes.get(str(path)) != current_hashes.get(str(path))
        ]
        repo_registry.update_job(job_id, files_seen=len(all_files))

        if not changed_files and not deleted_paths:
            _checkpoint_metadata_store(metadata_store)
            metadata_store.close()
            restored_status = previous_status if previous_status in {"semantic_ready", "lexical_ready"} else "lexical_ready"
            persist_repo_overview(repo_id, temp_db, source_path)
            _raise_if_job_canceled(job_id)
            _commit_lexical_artifacts(
                repo_id=repo_id,
                repo_path=repo_path,
                temp_db=temp_db,
                drop_semantic=False,
            )
            temp_replaced_or_removed = True
            write_repo_manifest(
                repo_storage_path=repo.storage_path,
                status=restored_status,
                source_path=source_path,
                files_seen=len(all_files),
            )
            _maybe_prune_source_after_index(
                repo=repo,
                source_path=source_path,
                index_mode=_repo_manifest_index_mode(repo_path) or "deep",
                status=restored_status,
                files_seen=len(all_files),
                files_indexed=0,
                symbols_indexed=0,
            )
            repo_registry.mark_job_complete(
                job_id,
                phase="lexical_ready",
                files_indexed=0,
                symbols_indexed=0,
            )
            repo_registry.update_repo(repo_id, status=restored_status)
            logger.info(f"Repo {repo_id} incremental refresh found no changed files")
            return True

        stats = repo_indexer.index_changed_files(
            changed_files,
            deleted_paths=deleted_paths,
            semantic=False,
            cancel_check=lambda: _is_job_cancel_requested(job_id),
            progress_callback=_make_job_progress_callback(job_id, len(all_files)),
            files_discovered=len(all_files),
            directories_pruned=directories_pruned,
            source_root=source_path,
        )
        _raise_if_job_canceled(job_id)
        _checkpoint_metadata_store(metadata_store)
    except Exception:
        if not temp_replaced_or_removed:
            cleanup_temp_after_close = True
        raise
    finally:
        metadata_store.close()
        if cleanup_temp_after_close:
            _remove_sqlite_artifact(temp_db)
            temp_replaced_or_removed = True

    _raise_if_job_canceled(job_id)
    try:
        persist_repo_overview(repo_id, temp_db, source_path)
        _commit_lexical_artifacts(
            repo_id=repo_id,
            repo_path=repo_path,
            temp_db=temp_db,
            drop_semantic=bool(changed_files or deleted_paths),
        )
        temp_replaced_or_removed = True
    except Exception:
        if not temp_replaced_or_removed:
            _remove_sqlite_artifact(temp_db)
            temp_replaced_or_removed = True
        raise
    write_repo_manifest(
        repo_storage_path=repo.storage_path,
        status="lexical_ready",
        source_path=source_path,
        files_seen=len(all_files),
    )
    _maybe_prune_source_after_index(
        repo=repo,
        source_path=source_path,
        index_mode=_repo_manifest_index_mode(repo_path) or "deep",
        status="lexical_ready",
        files_seen=len(all_files),
        files_indexed=stats.files_processed if stats else 0,
        symbols_indexed=stats.total_symbols if stats else 0,
    )

    repo_registry.mark_job_complete(
        job_id,
        phase="lexical_ready",
        files_indexed=stats.files_processed if stats else 0,
        symbols_indexed=stats.total_symbols if stats else 0,
    )
    repo_registry.update_repo(repo_id, status="lexical_ready")
    logger.info(
        f"Repo {repo_id} incremental refresh complete: "
        f"{len(changed_files)} changed, {len(deleted_paths)} deleted"
    )
    return True


def _repo_response(repo: RepoRecord) -> RepoResponse:
    stats = _repo_stats(repo)
    manifest_validation = validate_repo_manifest(repo.storage_path)
    lexical_ready = stats["total_symbols"] > 0
    lexical_index_mode = "unknown"
    source_state = _source_state(
        repo,
        manifest_validation.manifest if manifest_validation.manifest_present else None,
    )
    if manifest_validation.manifest_present:
        lexical_ready = lexical_ready and manifest_validation.lexical_ok
        lexical = manifest_validation.manifest.get("lexical") if isinstance(manifest_validation.manifest, dict) else None
        index_mode = lexical.get("index_mode") if isinstance(lexical, dict) else None
        if isinstance(index_mode, str) and index_mode:
            lexical_index_mode = index_mode
    artifact_warnings = list(manifest_validation.warnings)
    if source_state["pruned"]:
        artifact_warnings.append(
            "Source snapshot was pruned after indexing; lexical search remains available, "
            "and GitHub refresh or deep enrichment can rehydrate it."
        )
    storage_bytes = repo_registry.storage_bytes(repo) if repo_registry else 0
    return RepoResponse(
        **repo.to_dict(),
        storage_bytes=storage_bytes,
        total_symbols=stats["total_symbols"],
        total_files=stats["total_files"],
        lexical_ready=lexical_ready,
        lexical_index_mode=lexical_index_mode,
        semantic_ready=_semantic_artifact_ready(repo, manifest_validation),
        artifact_health=manifest_validation.health,
        artifact_warnings=artifact_warnings,
        source_available=bool(source_state["available"]),
        source_pruned=bool(source_state["pruned"]),
        source_retention_policy=str(source_state["policy"]),
    )


def _job_response(job: JobRecord) -> JobResponse:
    return JobResponse(**job.to_dict())


def _repo_status_after_canceled_job(repo: RepoRecord, job: JobRecord) -> str:
    repo_db = Path(repo.storage_path) / "repo.sqlite"
    if repo_db.exists() and job.kind in {"semantic_warm", "artifact_repair"}:
        return "lexical_ready"
    if repo_db.exists() and job.kind in {"fast_index", "upload_fast_index", "refresh", "deep_enrich"}:
        return "lexical_ready"
    return "canceled"


def _repo_index_source_path(repo_path: Path) -> Path:
    """Return the source root used when files were indexed, even if now pruned."""
    try:
        manifest = read_repo_manifest(repo_path)
    except (OSError, ValueError):
        return repo_path / "source"

    source = manifest.get("source") if isinstance(manifest, dict) else None
    source_path = source.get("path") if isinstance(source, dict) else None
    if not isinstance(source_path, str) or not source_path:
        return repo_path / "source"

    path = Path(source_path)
    if path.is_absolute():
        return path
    return repo_path / path


def _repo_manifest_index_mode(repo_path: Path) -> Optional[str]:
    try:
        manifest = read_repo_manifest(repo_path)
    except (OSError, ValueError):
        return None
    lexical = manifest.get("lexical") if isinstance(manifest, dict) else None
    index_mode = lexical.get("index_mode") if isinstance(lexical, dict) else None
    return index_mode if isinstance(index_mode, str) and index_mode else None


def _is_job_cancel_requested(job_id: int) -> bool:
    return repo_registry is not None and repo_registry.is_cancel_requested(job_id)


def _raise_if_job_canceled(job_id: int):
    if _is_job_cancel_requested(job_id):
        raise IndexingCanceled("Canceled by user")


def _select_fast_index_mode(files_seen: int) -> str:
    """Choose the first-pass indexing mode for a repo job."""
    configured = os.getenv("CODESNIFF_INDEX_MODE", "auto").strip().lower()
    if configured in {"deep", "full"}:
        return "deep"
    if configured in {"shallow", "inventory", "shallow_first"}:
        return "shallow"
    if configured not in {"", "auto"}:
        logger.warning(f"Unknown CODESNIFF_INDEX_MODE={configured}; using auto")

    threshold_raw = os.getenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "50000")
    try:
        threshold = max(1, int(threshold_raw))
    except ValueError:
        logger.warning(f"Invalid CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD={threshold_raw}; using 50000")
        threshold = 50000
    return "shallow" if files_seen >= threshold else "deep"


def _auto_deep_enrich_enabled() -> bool:
    configured = os.getenv("CODESNIFF_AUTO_DEEP_ENRICH", "1").strip().lower()
    return configured not in {"0", "false", "no", "off"}


def _deep_enrich_transaction_batch_size() -> int:
    configured = os.getenv("CODESNIFF_DEEP_ENRICH_BATCH_SIZE", "250").strip()
    try:
        return max(1, int(configured))
    except ValueError:
        logger.warning(f"Invalid CODESNIFF_DEEP_ENRICH_BATCH_SIZE={configured}; using 250")
        return 250


def _deep_enrich_files_per_run() -> Optional[int]:
    if job_runner is None:
        return None
    configured = os.getenv("CODESNIFF_DEEP_ENRICH_FILES_PER_RUN", "1000").strip().lower()
    if configured in {"", "0", "off", "none", "unlimited", "unbounded"}:
        return None
    try:
        return max(1, int(configured))
    except ValueError:
        logger.warning(f"Invalid CODESNIFF_DEEP_ENRICH_FILES_PER_RUN={configured}; using 1000")
        return 1000


def _deep_enrich_seconds_per_run() -> Optional[float]:
    if job_runner is None:
        return None
    configured = os.getenv("CODESNIFF_DEEP_ENRICH_SECONDS_PER_RUN", "30").strip().lower()
    if configured in {"", "0", "off", "none", "unlimited", "unbounded"}:
        return None
    try:
        seconds = float(configured)
    except ValueError:
        logger.warning(f"Invalid CODESNIFF_DEEP_ENRICH_SECONDS_PER_RUN={configured}; using 30")
        return 30.0
    if seconds <= 0:
        return None
    return seconds


def _requeue_deep_enrichment_slice(repo_id: int, job_id: int, stats) -> JobRecord:
    job = repo_registry.update_job(
        job_id,
        status="queued",
        phase="queued_deep_enrich_slice",
        files_indexed=stats.files_processed,
        symbols_indexed=stats.total_symbols,
        started_at=None,
        error=None,
        cancel_requested=0,
    )
    repo_registry.update_repo(repo_id, status="deep_enrich_queued", error_summary=None)
    if job_runner is not None:
        job_runner.wake()
    return job


def _queue_deep_enrichment(repo_id: int) -> Optional[JobRecord]:
    """Queue a background deep pass for a shallow first-pass repo."""
    if repo_registry is None or not _auto_deep_enrich_enabled():
        return None
    if job_runner is None:
        logger.info(f"Skipping automatic deep enrichment for repo {repo_id}; no job runner is installed")
        return None

    repo = repo_registry.get_repo(repo_id)
    source_path = Path(repo.storage_path) / "source"
    if not source_path.exists():
        logger.warning(f"Skipping deep enrichment for repo {repo_id}; source snapshot is unavailable")
        return None

    active_job = repo_registry.get_active_job(repo_id, kind="deep_enrich")
    if active_job:
        return active_job

    job = repo_registry.create_job(repo_id, kind="deep_enrich", phase="queued_deep_enrich")
    logger.info(f"Queued deep enrichment for repo {repo_id} after shallow first pass")
    job_runner.wake()
    return job


def _mark_job_canceled(repo_id: int, job_id: int) -> Optional[JobRecord]:
    if repo_registry is None:
        return None

    canceled = repo_registry.mark_job_canceled(job_id, reason="Canceled by user")
    try:
        repo = repo_registry.get_repo(repo_id)
        repo_registry.update_repo(
            repo_id,
            status=_repo_status_after_canceled_job(repo, canceled),
            error_summary=canceled.error,
        )
    except KeyError:
        pass
    return canceled


def _run_prepared_fast_index(
    repo_id: int,
    job_id: int,
    source_path: Path,
    source_replace_from: Optional[Path] = None,
):
    """Clean and lexically index a repo source directory that already exists."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return

    from ..utils.github_clone import clean_repository

    phase = "starting"
    try:
        repo = repo_registry.get_repo(repo_id)
        source_path = Path(source_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Repo source path does not exist: {source_path}")

        phase = "cleaning"
        repo_registry.mark_job_running(job_id, phase)
        repo_registry.update_repo(repo_id, status="cleaning", error_summary=None)
        _raise_if_job_canceled(job_id)
        clean_repository(str(source_path))
        _raise_if_job_canceled(job_id)
        files_seen = sum(1 for path in source_path.rglob("*") if path.is_file())
        repo_registry.update_job(job_id, files_seen=files_seen)
        index_mode = _select_fast_index_mode(files_seen)

        phase = "shallow_indexing" if index_mode == "shallow" else "fast_indexing"
        repo_registry.update_job(job_id, phase=phase)
        _raise_if_job_canceled(job_id)
        repo_path = Path(repo.storage_path)
        temp_db = repo_path / f"repo.sqlite.{job_id}.tmp"
        _remove_sqlite_artifact(temp_db)
        metadata_store = MetadataStore(db_path=str(temp_db))
        try:
            vector_store = VectorStore(dimension=768)
            text_search = TextSearchEngine()
            repo_indexer = Indexer(
                embedder=None,
                embedder_cache_dir=os.path.join(storage_dir, "embeddings_cache"),
                vector_store=vector_store,
                metadata_store=metadata_store,
                text_search=text_search,
                build_text_index=False
            )
            stats = repo_indexer.index_directory(
                str(source_path),
                show_progress=False,
                semantic=False,
                progress_callback=_make_job_progress_callback(job_id, files_seen),
                cancel_check=lambda: _is_job_cancel_requested(job_id),
                shallow=(index_mode == "shallow"),
            )
            _raise_if_job_canceled(job_id)
            _checkpoint_metadata_store(metadata_store)
        finally:
            metadata_store.close()

        _raise_if_job_canceled(job_id)
        _commit_lexical_artifacts(
            repo_id=repo_id,
            repo_path=repo_path,
            temp_db=temp_db,
            source_replace_from=source_replace_from,
        )
        overview_source = (repo_path / "source") if (repo_path / "source").exists() else source_path
        persist_repo_overview(
            repo_id,
            repo_path / "repo.sqlite",
            overview_source,
            source_scan=(index_mode != "shallow"),
        )
        write_repo_manifest(
            repo_storage_path=repo.storage_path,
            status="lexical_ready",
            source_path=overview_source,
            files_seen=files_seen,
            files_indexed=stats.files_processed,
            symbols_indexed=stats.total_symbols,
            index_mode=index_mode,
        )
        _maybe_prune_source_after_index(
            repo=repo,
            source_path=overview_source,
            index_mode=index_mode,
            status="lexical_ready",
            files_seen=files_seen,
            files_indexed=stats.files_processed,
            symbols_indexed=stats.total_symbols,
        )

        repo_registry.mark_job_complete(
            job_id,
            phase="lexical_ready",
            files_indexed=stats.files_processed,
            symbols_indexed=stats.total_symbols
        )
        repo_registry.update_repo(repo_id, status="lexical_ready")
        if index_mode == "shallow":
            _queue_deep_enrichment(repo_id)
        logger.info(
            f"Repo {repo_id} {index_mode} lexical index complete: "
            f"{stats.files_processed} files, {stats.total_symbols} symbols"
        )

    except IndexingCanceled as e:
        logger.info(f"Repo {repo_id} indexing canceled in phase {phase}: {e}")
        try:
            repo = repo_registry.get_repo(repo_id)
            _remove_sqlite_artifact(Path(repo.storage_path) / f"repo.sqlite.{job_id}.tmp")
        except Exception:
            pass
        try:
            _mark_job_canceled(repo_id, job_id)
        except Exception as registry_error:
            logger.error(f"Failed to persist job cancellation: {registry_error}")

    except Exception as e:
        logger.exception(f"Repo {repo_id} indexing failed in phase {phase}: {e}")
        try:
            repo = repo_registry.get_repo(repo_id)
            _remove_sqlite_artifact(Path(repo.storage_path) / f"repo.sqlite.{job_id}.tmp")
        except Exception:
            pass
        try:
            repo_registry.mark_job_failed(job_id, phase=phase, error=str(e))
            repo_registry.update_repo(repo_id, status="failed", error_summary=str(e)[:500])
        except Exception as registry_error:
            logger.error(f"Failed to persist job failure: {registry_error}")


def _run_github_fast_index(repo_id: int, job_id: int, repo_url: str):
    """Clone and lexically index a repo into its own cold artifact directory."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return

    from ..utils.github_clone import clone_github_repo, clean_repository

    phase = "starting"
    try:
        repo = repo_registry.get_repo(repo_id)
        repo_path = Path(repo.storage_path)
        source_path = repo_path / "source"
        if source_path.exists():
            shutil.rmtree(source_path)

        phase = "cloning"
        repo_registry.mark_job_running(job_id, phase)
        repo_registry.update_repo(repo_id, status="cloning", error_summary=None)
        _raise_if_job_canceled(job_id)
        clone_github_repo(repo_url, target_dir=str(source_path))
        _raise_if_job_canceled(job_id)

        phase = "cleaning"
        _run_prepared_fast_index(repo_id, job_id, source_path)

    except IndexingCanceled as e:
        logger.info(f"Repo {repo_id} GitHub indexing canceled in phase {phase}: {e}")
        try:
            _mark_job_canceled(repo_id, job_id)
        except Exception as registry_error:
            logger.error(f"Failed to persist GitHub job cancellation: {registry_error}")

    except Exception as e:
        logger.exception(f"Repo {repo_id} indexing failed in phase {phase}: {e}")
        try:
            repo_registry.mark_job_failed(job_id, phase=phase, error=str(e))
            repo_registry.update_repo(repo_id, status="failed", error_summary=str(e)[:500])
        except Exception as registry_error:
            logger.error(f"Failed to persist job failure: {registry_error}")


def _run_uploaded_fast_index(repo_id: int, job_id: int):
    """Lexically index an uploaded repo whose source was staged at request time."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return

    repo = repo_registry.get_repo(repo_id)
    _run_prepared_fast_index(repo_id, job_id, Path(repo.storage_path) / "source")


def _run_repo_deep_enrichment(repo_id: int, job_id: int):
    """Replace a shallow first-pass artifact with a full deep lexical artifact."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return

    from ..utils.github_clone import clean_repository, clone_github_repo

    phase = "starting"
    temp_db: Optional[Path] = None
    try:
        repo = repo_registry.get_repo(repo_id)
        repo_path = Path(repo.storage_path)
        source_path = repo_path / "source"
        if not source_path.exists():
            if repo.source_type == "github" and repo.source_url:
                phase = "cloning"
                repo_registry.mark_job_running(job_id, phase)
                repo_registry.update_repo(repo_id, status="cloning", error_summary=None)
                clone_github_repo(repo.source_url, target_dir=str(source_path))
                _raise_if_job_canceled(job_id)
            else:
                raise FileNotFoundError(f"Repo source path does not exist: {source_path}")

        phase = "deep_enriching"
        repo_registry.mark_job_running(job_id, phase)
        repo_registry.update_repo(repo_id, status="deep_enriching", error_summary=None)
        _raise_if_job_canceled(job_id)
        clean_repository(str(source_path))
        _raise_if_job_canceled(job_id)

        files_seen = sum(1 for path in source_path.rglob("*") if path.is_file())
        repo_registry.update_job(job_id, files_seen=files_seen)

        temp_db = repo_path / f"repo.sqlite.{job_id}.tmp"
        resume_existing = temp_db.exists()
        if resume_existing:
            logger.info(f"Resuming deep enrichment for repo {repo_id} from {temp_db.name}")
        else:
            _remove_sqlite_artifact(temp_db)
        metadata_store = MetadataStore(db_path=str(temp_db))
        try:
            vector_store = VectorStore(dimension=768)
            text_search = TextSearchEngine()
            repo_indexer = Indexer(
                embedder=None,
                embedder_cache_dir=os.path.join(storage_dir, "embeddings_cache"),
                vector_store=vector_store,
                metadata_store=metadata_store,
                text_search=text_search,
                build_text_index=False,
            )
            stats = repo_indexer.index_directory(
                str(source_path),
                show_progress=False,
                semantic=False,
                progress_callback=_make_job_progress_callback(job_id, files_seen),
                cancel_check=lambda: _is_job_cancel_requested(job_id),
                shallow=False,
                resume_existing=resume_existing,
                transaction_batch_size=_deep_enrich_transaction_batch_size(),
                max_files=_deep_enrich_files_per_run(),
                max_seconds=_deep_enrich_seconds_per_run(),
            )
            _raise_if_job_canceled(job_id)
            _checkpoint_metadata_store(metadata_store)
        finally:
            metadata_store.close()

        _raise_if_job_canceled(job_id)
        if not stats.complete:
            _requeue_deep_enrichment_slice(repo_id, job_id, stats)
            logger.info(
                f"Repo {repo_id} deep enrichment yielded after "
                f"{stats.files_processed} files, {stats.total_symbols} symbols"
            )
            return

        _commit_lexical_artifacts(
            repo_id=repo_id,
            repo_path=repo_path,
            temp_db=temp_db,
            drop_semantic=True,
        )
        persist_repo_overview(
            repo_id,
            repo_path / "repo.sqlite",
            source_path,
            source_scan=True,
        )
        write_repo_manifest(
            repo_storage_path=repo.storage_path,
            status="lexical_ready",
            source_path=source_path,
            files_seen=files_seen,
            files_indexed=stats.files_processed,
            symbols_indexed=stats.total_symbols,
            index_mode="deep",
        )

        repo_registry.mark_job_complete(
            job_id,
            phase="lexical_ready",
            files_indexed=stats.files_processed,
            symbols_indexed=stats.total_symbols,
        )
        repo_registry.update_repo(repo_id, status="lexical_ready", error_summary=None)
        logger.info(
            f"Repo {repo_id} deep enrichment complete: "
            f"{stats.files_processed} files, {stats.total_symbols} symbols"
        )

    except IndexingCanceled as e:
        logger.info(f"Repo {repo_id} deep enrichment canceled in phase {phase}: {e}")
        if temp_db is not None:
            _remove_sqlite_artifact(temp_db)
        try:
            _mark_job_canceled(repo_id, job_id)
        except Exception as registry_error:
            logger.error(f"Failed to persist deep enrichment cancellation: {registry_error}")

    except Exception as e:
        logger.exception(f"Repo {repo_id} deep enrichment failed in phase {phase}: {e}")
        if temp_db is not None:
            _remove_sqlite_artifact(temp_db)
        try:
            repo = repo_registry.get_repo(repo_id)
            repo_db = Path(repo.storage_path) / "repo.sqlite"
            repo_registry.mark_job_failed(job_id, phase=phase, error=str(e))
            repo_registry.update_repo(
                repo_id,
                status="lexical_ready" if repo_db.exists() else "failed",
                error_summary=("Deep enrichment failed: " + str(e))[:500],
            )
        except Exception as registry_error:
            logger.error(f"Failed to persist deep enrichment failure: {registry_error}")


def _run_repo_refresh(repo_id: int, job_id: int):
    """Refresh a repo's lexical artifact from its stored or cloned source tree."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return

    phase = "refreshing"
    temp_source: Optional[Path] = None
    source_backup: Optional[Path] = None
    try:
        repo = repo_registry.get_repo(repo_id)
        previous_status = repo.status
        repo_path = Path(repo.storage_path)
        source_path = repo_path / "source"
        repo_registry.mark_job_running(job_id, phase)
        repo_registry.update_repo(repo_id, status="refreshing", error_summary=None)
        _raise_if_job_canceled(job_id)

        if repo.source_type == "github" and repo.source_url:
            from ..utils.github_clone import clone_github_repo

            temp_source = repo_path / f"source.refresh.{job_id}.tmp"
            if temp_source.exists():
                shutil.rmtree(temp_source)
            phase = "cloning"
            repo_registry.update_job(job_id, phase=phase)
            repo_registry.update_repo(repo_id, status="cloning", error_summary=None)
            clone_github_repo(repo.source_url, target_dir=str(temp_source))
            _raise_if_job_canceled(job_id)
            source_backup = _replace_source_tree(temp_source, source_path)
            _raise_if_job_canceled(job_id)
            if not _run_incremental_refresh(repo_id, job_id, source_path, previous_status):
                _run_prepared_fast_index(repo_id, job_id, source_path)
            if repo_registry.get_job(job_id).status == "complete":
                if source_backup and source_backup.exists():
                    shutil.rmtree(source_backup)
                source_backup = None
            else:
                _restore_source_tree(source_backup, source_path)
                source_backup = None
        else:
            if not source_path.exists():
                raise FileNotFoundError(f"Repo source path does not exist: {source_path}")
            if not _run_incremental_refresh(repo_id, job_id, source_path, previous_status):
                _run_prepared_fast_index(repo_id, job_id, source_path)

    except IndexingCanceled as e:
        try:
            _restore_source_tree(source_backup, Path(repo_registry.get_repo(repo_id).storage_path) / "source")
        except Exception:
            pass
        logger.info(f"Repo {repo_id} refresh canceled in phase {phase}: {e}")
        try:
            _mark_job_canceled(repo_id, job_id)
        except Exception as registry_error:
            logger.error(f"Failed to persist refresh cancellation: {registry_error}")

    except Exception as e:
        try:
            _restore_source_tree(source_backup, Path(repo_registry.get_repo(repo_id).storage_path) / "source")
        except Exception:
            pass
        logger.exception(f"Repo {repo_id} refresh failed in phase {phase}: {e}")
        try:
            repo_registry.mark_job_failed(job_id, phase=phase, error=str(e))
            repo_registry.update_repo(repo_id, status="failed", error_summary=str(e)[:500])
        except Exception as registry_error:
            logger.error(f"Failed to persist refresh failure: {registry_error}")
    finally:
        if temp_source and temp_source.exists():
            try:
                shutil.rmtree(temp_source)
            except OSError as cleanup_error:
                logger.warning(f"Failed to remove temp refresh source {temp_source}: {cleanup_error}")


def _run_repo_semantic_warmup(repo_id: int, job_id: int):
    """Build semantic vectors for a repo without blocking lexical readiness."""
    if repo_registry is None:
        logger.error("Repo registry is not initialized")
        return

    phase = "starting"
    try:
        repo = repo_registry.get_repo(repo_id)
        phase = "semantic_warming"
        repo_registry.mark_job_running(job_id, phase)
        repo_registry.update_repo(repo_id, status="semantic_warming", error_summary=None)
        _raise_if_job_canceled(job_id)

        stats = warm_repo_semantics(
            repo_storage_path=repo.storage_path,
            embedder_cache_dir=os.path.join(storage_dir, "embeddings_cache"),
            cancel_check=lambda: _is_job_cancel_requested(job_id),
        )
        _raise_if_job_canceled(job_id)

        repo_registry.mark_job_complete(
            job_id,
            phase="semantic_ready",
            files_indexed=0,
            symbols_indexed=stats.symbols_embedded
        )
        repo_registry.update_repo(repo_id, status="semantic_ready")
        if active_repo_manager:
            active_repo_manager.evict(repo_id)
        logger.info(f"Repo {repo_id} semantic warmup complete: {stats.symbols_embedded} vectors")

    except IndexingCanceled as e:
        logger.info(f"Repo {repo_id} semantic warmup canceled in phase {phase}: {e}")
        try:
            _mark_job_canceled(repo_id, job_id)
        except Exception as registry_error:
            logger.error(f"Failed to persist semantic warmup cancellation: {registry_error}")

    except Exception as e:
        logger.exception(f"Repo {repo_id} semantic warmup failed in phase {phase}: {e}")
        try:
            repo_registry.mark_job_failed(job_id, phase=phase, error=str(e))
            repo_registry.update_repo(repo_id, status="semantic_failed", error_summary=str(e)[:500])
        except Exception as registry_error:
            logger.error(f"Failed to persist semantic warmup failure: {registry_error}")


@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Health check endpoint

    Returns system status and readiness
    """
    ready = False
    if search_engine:
        stats = search_engine.get_stats()
        ready = stats.get('ready', False)

    return HealthResponse(
        status="healthy",
        version="1.0.0",
        ready=ready
    )


@router.get("/stats", response_model=StatsResponse, tags=["System"])
async def get_stats():
    """
    Get index statistics

    Returns information about indexed code:
    - Total symbols indexed
    - Total files indexed
    - Breakdown by type (functions, classes)
    - System readiness
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    stats = search_engine.get_stats()

    return StatsResponse(
        total_symbols=stats.get('total_symbols', 0),
        total_files=stats.get('total_files', 0),
        functions=stats.get('functions', 0),
        classes=stats.get('classes', 0),
        vector_count=stats.get('vector_count', 0),
        ready=stats.get('ready', False),
        lexical_ready=stats.get('lexical_ready', False),
        semantic_ready=stats.get('semantic_ready', False),
        index_status=(
            "semantic_ready" if stats.get('semantic_ready', False)
            else "lexical_ready" if stats.get('lexical_ready', False)
            else "empty"
        )
    )


@router.get("/operator-policy", response_model=OperatorPolicyResponse, tags=["System"])
async def get_operator_policy():
    """Return runtime policy knobs that affect repo storage and indexing behavior."""
    return OperatorPolicyResponse(
        source_retention=get_source_retention_policy().to_response()
    )


@router.get("/repos", response_model=List[RepoResponse], tags=["Repositories"])
async def list_repos():
    """List registered repos and their cold artifact readiness."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    return [_repo_response(repo) for repo in repo_registry.list_repos()]


@router.post("/repos/github", response_model=RepoIndexResponse, tags=["Repositories"])
async def create_github_repo(request: GitHubRepoRequest, background_tasks: BackgroundTasks):
    """Register a GitHub repo and start fast lexical indexing in the background."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    repo_name = request.name or _derive_repo_name(request.repo_url)
    repo = repo_registry.create_repo(
        name=repo_name,
        source_type="github",
        source_url=request.repo_url
    )
    job = repo_registry.create_job(repo.id, kind="fast_index", phase="queued")
    if job_runner:
        job_runner.wake()
    else:
        background_tasks.add_task(_run_github_fast_index, repo.id, job.id, request.repo_url)

    return RepoIndexResponse(
        repo=_repo_response(repo),
        job=_job_response(job),
        message="Repo queued for fast lexical indexing"
    )


@router.post("/repos/upload", response_model=RepoIndexResponse, tags=["Repositories"])
async def create_uploaded_repo(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    is_zip: bool = Form(False),
    name: Optional[str] = Form(None),
):
    """Stage uploaded source into cold repo storage and queue fast lexical indexing."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files uploaded")
    if is_zip and len(files) != 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ZIP upload expects exactly one file")

    repo = repo_registry.create_repo(
        name=_derive_upload_name(files, is_zip, name),
        source_type="upload",
        source_url=None,
    )
    repo_path = Path(repo.storage_path)
    source_path = repo_path / "source"

    try:
        repo_registry.update_repo(repo.id, status="uploading", error_summary=None)
        if source_path.exists():
            shutil.rmtree(source_path)
        source_path.mkdir(parents=True, exist_ok=True)

        if is_zip:
            zip_path = repo_path / "_upload.zip"
            with open(zip_path, "wb") as f:
                f.write(await files[0].read())

            try:
                _extract_zip_safely(zip_path, source_path)
            except zipfile.BadZipFile:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid ZIP file")
            finally:
                zip_path.unlink(missing_ok=True)
        else:
            for file in files:
                relative_path = _safe_upload_relative_path(file.filename)
                target_path = source_path / relative_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                with open(target_path, "wb") as f:
                    f.write(await file.read())

        job = repo_registry.create_job(repo.id, kind="upload_fast_index", phase="queued")
        repo = repo_registry.update_repo(repo.id, status="queued")
        if job_runner:
            job_runner.wake()
        else:
            background_tasks.add_task(_run_uploaded_fast_index, repo.id, job.id)

        return RepoIndexResponse(
            repo=_repo_response(repo),
            job=_job_response(job),
            message="Uploaded source staged and queued for fast lexical indexing"
        )

    except HTTPException:
        repo_registry.update_repo(repo.id, status="failed", error_summary="Upload staging failed")
        raise
    except ValueError as e:
        repo_registry.update_repo(repo.id, status="failed", error_summary=str(e)[:500])
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.exception(f"Upload staging failed for repo {repo.id}: {e}")
        repo_registry.update_repo(repo.id, status="failed", error_summary=str(e)[:500])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stage uploaded source: {str(e)}"
        )


@router.get("/jobs/{job_id}", response_model=JobResponse, tags=["Repositories"])
async def get_job(job_id: int):
    """Get indexing job status."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        return _job_response(repo_registry.get_job(job_id))
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")


@router.post("/jobs/{job_id}/cancel", response_model=JobResponse, tags=["Repositories"])
async def cancel_job(job_id: int):
    """Cancel a queued job or request cooperative cancellation of a running job."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        job = repo_registry.get_job(job_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status == "running":
        return _job_response(repo_registry.request_job_cancel(job.id))

    if job.status != "queued":
        return _job_response(job)

    canceled = repo_registry.cancel_queued_job(job.id)
    try:
        repo = repo_registry.get_repo(canceled.repo_id)
        remaining_active = [
            active_job for active_job in repo_registry.get_active_jobs(repo.id)
            if active_job.id != canceled.id
        ]
        if not remaining_active:
            repo_registry.update_repo(
                repo.id,
                status=_repo_status_after_canceled_job(repo, canceled),
                error_summary=canceled.error,
            )
    except KeyError:
        pass

    return _job_response(canceled)


@router.post("/repos/{repo_id}/refresh", response_model=RepoIndexResponse, tags=["Repositories"])
async def refresh_repo(repo_id: int, background_tasks: BackgroundTasks):
    """Queue a lexical refresh from the repo's stored source."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    active_refresh = repo_registry.get_active_job(repo.id, kind="refresh")
    if active_refresh:
        return RepoIndexResponse(
            repo=_repo_response(repo),
            job=_job_response(active_refresh),
            message="Repo refresh is already queued or running"
        )

    active_writers = [
        job for job in repo_registry.get_active_jobs(repo.id)
        if job.kind in REPO_EXCLUSIVE_JOB_KINDS
    ]
    if active_writers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repo already has an active writer job: {active_writers[0].kind}"
        )

    source_path = Path(repo.storage_path) / "source"
    if not source_path.exists() and not (repo.source_type == "github" and repo.source_url):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repo has no stored source to refresh"
        )

    job = repo_registry.create_job(repo.id, kind="refresh", phase="queued")
    repo = repo_registry.update_repo(repo.id, status="refresh_queued", error_summary=None)
    if job_runner:
        job_runner.wake()
    else:
        background_tasks.add_task(_run_repo_refresh, repo.id, job.id)

    return RepoIndexResponse(
        repo=_repo_response(repo),
        job=_job_response(job),
        message="Repo queued for lexical refresh"
    )


@router.post("/repos/{repo_id}/enrich", response_model=RepoIndexResponse, tags=["Repositories"])
async def enrich_repo(repo_id: int, background_tasks: BackgroundTasks):
    """Queue a deep lexical enrichment pass for a shallow repo artifact."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    active_enrich = repo_registry.get_active_job(repo.id, kind="deep_enrich")
    if active_enrich:
        return RepoIndexResponse(
            repo=_repo_response(repo),
            job=_job_response(active_enrich),
            message="Repo deep enrichment is already queued or running"
        )

    active_writers = [
        job for job in repo_registry.get_active_jobs(repo.id)
        if job.kind in REPO_EXCLUSIVE_JOB_KINDS
    ]
    if active_writers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Repo already has an active writer job: {active_writers[0].kind}"
        )

    source_path = Path(repo.storage_path) / "source"
    if not source_path.exists() and not (repo.source_type == "github" and repo.source_url):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repo has no stored source to enrich"
        )

    job = repo_registry.create_job(repo.id, kind="deep_enrich", phase="queued_deep_enrich")
    repo = repo_registry.update_repo(repo.id, status="deep_enrich_queued", error_summary=None)
    if job_runner:
        job_runner.wake()
    else:
        background_tasks.add_task(_run_repo_deep_enrichment, repo.id, job.id)

    return RepoIndexResponse(
        repo=_repo_response(repo),
        job=_job_response(job),
        message="Repo queued for deep lexical enrichment"
    )


@router.post("/repos/{repo_id}/refresh/schedule", response_model=RepoResponse, tags=["Repositories"])
async def set_repo_refresh_schedule(repo_id: int, request: RepoRefreshScheduleRequest):
    """Enable or disable periodic lexical refresh for one repo."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        updated = repo_registry.set_refresh_schedule(repo_id, request.interval_minutes)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if job_runner:
        job_runner.wake()
    return _repo_response(updated)


@router.delete("/repos/{repo_id}", tags=["Repositories"])
async def delete_repo(repo_id: int):
    """Delete one repo registry row and its managed cold artifacts."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    if active_repo_manager:
        active_repo_manager.evict(repo_id)

    try:
        deleted = repo_registry.delete_repo(repo_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except OSError as e:
        logger.exception(f"Failed to delete repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete repo artifacts: {str(e)}"
        )

    return {
        "success": True,
        "repo_id": deleted.id,
        "message": f"Deleted repo {repo.name}"
    }


@router.post("/repos/{repo_id}/search", response_model=SearchResponse, tags=["Repositories"])
async def search_repo(repo_id: int, request: SearchRequest):
    """Search one cold-stored repo. Lexical search works even without semantic vectors."""
    if not repo_registry or not active_repo_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    start_time = time.time()
    try:
        results = active_repo_manager.search(
            repo,
            query=request.query,
            limit=request.limit,
            min_similarity=request.min_similarity,
            symbol_type=request.symbol_type,
            file_path_filter=request.file_path_filter,
            language_filter=request.language_filter
        )
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repo is not searchable yet"
        )

    search_results = [
        SearchResult(
            symbol_name=r.symbol_name,
            symbol_type=r.symbol_type,
            file_path=r.file_path,
            code_snippet=r.code_snippet,
            start_line=r.start_line,
            end_line=r.end_line,
            similarity_score=r.similarity_score,
            docstring=r.docstring,
            match_info=r.match_info,
            highlighted_name=r.highlighted_name,
            highlighted_docstring=r.highlighted_docstring
        )
        for r in results
    ]

    return SearchResponse(
        query=request.query,
        results=search_results,
        total_results=len(search_results),
        search_time_ms=(time.time() - start_time) * 1000
    )


@router.post("/repos/{repo_id}/semantic/warm", response_model=RepoIndexResponse, tags=["Repositories"])
async def warm_repo_semantic_index(repo_id: int, background_tasks: BackgroundTasks):
    """Queue semantic vector warmup for a lexically indexed repo."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    repo_db = Path(repo.storage_path) / "repo.sqlite"
    if not repo_db.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repo needs a lexical index before semantic warmup"
        )

    active_job = repo_registry.get_active_job(repo.id, kind="semantic_warm")
    if active_job:
        return RepoIndexResponse(
            repo=_repo_response(repo),
            job=_job_response(active_job),
            message="Semantic vector warmup is already queued or running"
        )

    job = repo_registry.create_job(repo.id, kind="semantic_warm", phase="queued")
    repo = repo_registry.update_repo(repo.id, status="semantic_warming", error_summary=None)
    if job_runner:
        job_runner.wake()
    else:
        background_tasks.add_task(_run_repo_semantic_warmup, repo.id, job.id)
    return RepoIndexResponse(
        repo=_repo_response(repo),
        job=_job_response(job),
        message="Repo queued for semantic vector warmup"
    )


@router.post("/repos/{repo_id}/semantic/repair", response_model=RepoResponse, tags=["Repositories"])
async def repair_repo_semantic_index(repo_id: int):
    """Remove corrupt semantic artifacts and keep the lexical index searchable."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    repo_db = Path(repo.storage_path) / "repo.sqlite"
    if not repo_db.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repo needs a lexical index before semantic repair"
        )

    active_job = repo_registry.get_active_job(repo.id, kind="semantic_warm")
    if active_job:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Semantic warmup is queued or running"
        )

    if active_repo_manager:
        active_repo_manager.evict(repo_id)

    try:
        repaired = repo_registry.repair_semantic_artifacts(repo_id)
        write_repo_manifest(
            repo_storage_path=repaired.storage_path,
            status="lexical_ready",
            source_path=Path(repaired.storage_path) / "source",
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except OSError as e:
        logger.exception(f"Failed to repair semantic artifacts for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to repair semantic artifacts: {str(e)}"
        )

    return _repo_response(repaired)


@router.get("/repos/active", tags=["Repositories"])
async def get_active_repos():
    """Return active repo cache state."""
    if not active_repo_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Active repo manager not initialized"
        )
    return active_repo_manager.get_stats()


@router.get("/repos/{repo_id}/files", response_model=RepoFilesResponse, tags=["Repositories"])
async def list_repo_files(repo_id: int):
    """List files for one repo, activating its cold SQLite artifact if needed."""
    if not repo_registry or not active_repo_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        files = active_repo_manager.list_files(repo)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Repo is not searchable yet"
        )

    return {
        "repo_id": repo_id,
        "total_files": len(files),
        "files": files,
    }


@router.get("/repos/{repo_id}/file", response_model=RepoFileContentResponse, tags=["Repositories"])
async def get_repo_file(repo_id: int, path: str = Query(..., min_length=1)):
    """Return source text and symbol outline for one indexed repo file."""
    if not repo_registry or not active_repo_manager:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        return active_repo_manager.get_file(repo, path)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File is not indexed")
    except OverflowError as e:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e) or "Source snapshot is unavailable"
        )


@router.get("/repos/{repo_id}/overview", response_model=RepoOverviewResponse, tags=["Repositories"])
async def get_repo_overview(repo_id: int):
    """Return deterministic repo overview facts from cold artifacts."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        return RepoOverviewResponse(**build_repo_overview(repo.id, repo.storage_path))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except sqlite3.Error as e:
        logger.exception(f"Failed to read repo overview for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read repo overview: {str(e)}"
        )


@router.get("/repos/{repo_id}/facts", response_model=RepoFactsResponse, tags=["Repositories"])
async def get_repo_facts(
    repo_id: int,
    kind: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
):
    """Return normalized repo facts from the cold SQLite artifact."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        facts = read_repo_facts(Path(repo.storage_path) / "repo.sqlite", kind=kind, limit=limit)
        return RepoFactsResponse(repo_id=repo.id, total=len(facts), facts=facts)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except sqlite3.Error as e:
        logger.exception(f"Failed to read repo facts for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read repo facts: {str(e)}"
        )


@router.get("/repos/{repo_id}/teaching", response_model=RepoTeachingResponse, tags=["Repositories"])
async def get_repo_teaching(repo_id: int):
    """Return a cited deterministic repo walkthrough from cold artifacts."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        return RepoTeachingResponse(**build_repo_teaching(repo.id, repo.storage_path))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except sqlite3.Error as e:
        logger.exception(f"Failed to read repo teaching walkthrough for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read repo teaching walkthrough: {str(e)}"
        )


@router.get("/repos/{repo_id}/teaching/query", response_model=RepoTeachingQueryResponse, tags=["Repositories"])
async def get_repo_teaching_query(
    repo_id: int,
    question: str = Query(..., min_length=2, max_length=500),
    limit: int = Query(6, ge=1, le=8),
):
    """Return cited cold-artifact evidence for one repo question."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        return RepoTeachingQueryResponse(**build_repo_teaching_query(
            repo.id,
            repo.storage_path,
            question,
            limit=limit,
        ))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except sqlite3.Error as e:
        logger.exception(f"Failed to read repo teaching query for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read repo teaching query: {str(e)}"
        )


@router.get("/repos/{repo_id}/search-quality", response_model=RepoSearchQualityResponse, tags=["Repositories"])
async def get_repo_search_quality(
    repo_id: int,
    max_cases: int = Query(8, ge=1, le=40),
    top_k: int = Query(5, ge=1, le=20),
):
    """Return a generated cold lexical search-quality smoke report."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        report = evaluate_repo_search_smoke(repo.storage_path, max_cases=max_cases, top_k=top_k)
        return RepoSearchQualityResponse(repo_id=repo.id, **report)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except sqlite3.Error as e:
        logger.exception(f"Failed to evaluate search quality for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to evaluate search quality: {str(e)}"
        )


@router.get("/repos/{repo_id}/storage-profile", response_model=RepoStorageProfileResponse, tags=["Repositories"])
async def get_repo_storage_profile(
    repo_id: int,
    sample_blobs: int = Query(5, ge=0, le=25),
):
    """Return cold artifact byte breakdown and source-blob compression metrics."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    try:
        return RepoStorageProfileResponse(**build_repo_storage_profile(repo.id, repo.storage_path, sample_blobs=sample_blobs))
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except sqlite3.Error as e:
        logger.exception(f"Failed to profile storage for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to profile storage: {str(e)}"
        )


@router.get("/repos/{repo_id}/relationships", response_model=RepoRelationshipsResponse, tags=["Repositories"])
async def get_repo_relationships(
    repo_id: int,
    rel_type: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
):
    """Return normalized repo relationships from the cold SQLite artifact."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    repo_path = Path(repo.storage_path)
    try:
        relationships = read_repo_relationships(
            repo_path / "repo.sqlite",
            repo_path / "source",
            rel_type=rel_type,
            limit=limit,
        )
        return RepoRelationshipsResponse(repo_id=repo.id, total=len(relationships), relationships=relationships)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except sqlite3.Error as e:
        logger.exception(f"Failed to read repo relationships for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read repo relationships: {str(e)}"
        )


@router.get("/repos/{repo_id}/modules/{module_path:path}", response_model=RepoModuleDetailResponse, tags=["Repositories"])
async def get_repo_module_detail(repo_id: int, module_path: str):
    """Return files, symbols, exports, imports, and callers for one derived module."""
    if not repo_registry:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Repo registry not initialized"
        )

    try:
        repo = repo_registry.get_repo(repo_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Repo not found")

    repo_path = Path(repo.storage_path)
    try:
        return RepoModuleDetailResponse(**read_repo_module_detail(
            repo.id,
            repo_path / "repo.sqlite",
            _repo_index_source_path(repo_path),
            module_path,
        ))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module is not indexed")
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Repo is not indexed yet")
    except sqlite3.Error as e:
        logger.exception(f"Failed to read module detail for repo {repo_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read module detail: {str(e)}"
        )


@router.post("/index", response_model=IndexResponse, tags=["Indexing"])
async def index_directory(request: IndexRequest):
    """
    Index a directory of Python files

    This will:
    1. Scan the directory for Python files
    2. Parse each file to extract functions and classes
    3. Generate semantic embeddings
    4. Store in vector database for fast search

    Args:
        request: IndexRequest with directory_path

    Returns:
        IndexResponse with statistics about the indexing operation
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    try:
        logger.info(f"Starting indexing of directory: {request.directory_path}")

        # Perform indexing
        stats = indexer.index_directory(
            directory_path=request.directory_path,
            show_progress=request.show_progress,
            semantic=request.semantic
        )

        # Convert to response model
        index_stats = IndexStats(
            files_processed=stats.files_processed,
            files_failed=stats.files_failed,
            total_symbols=stats.total_symbols,
            functions_indexed=stats.functions_indexed,
            classes_indexed=stats.classes_indexed,
            methods_indexed=stats.methods_indexed,
            total_lines=stats.total_lines,
            time_taken=stats.time_taken
        )

        message = f"Successfully indexed {stats.files_processed} files with {stats.total_symbols} symbols"
        if stats.files_failed > 0:
            message += f" ({stats.files_failed} files failed)"

        logger.info(message)

        return IndexResponse(
            success=True,
            stats=index_stats,
            message=message
        )

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Indexing failed: {str(e)}"
        )


@router.post("/search", response_model=SearchResponse, tags=["Search"])
async def search_code(request: SearchRequest):
    """
    Search for code using natural language query

    Use natural language to find relevant code:
    - "authentication functions"
    - "database connections"
    - "error handling"
    - "user management classes"

    The search uses semantic embeddings to understand intent,
    not just keyword matching.

    Args:
        request: SearchRequest with query and options

    Returns:
        SearchResponse with matching code snippets
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        start_time = time.time()

        # Perform search
        results = search_engine.search(
            query=request.query,
            limit=request.limit,
            min_similarity=request.min_similarity,
            symbol_type=request.symbol_type,
            file_path_filter=request.file_path_filter,
            language_filter=request.language_filter
        )

        search_time_ms = (time.time() - start_time) * 1000

        # Convert to response models
        search_results = [
            SearchResult(
                symbol_name=r.symbol_name,
                symbol_type=r.symbol_type,
                file_path=r.file_path,
                code_snippet=r.code_snippet,
                start_line=r.start_line,
                end_line=r.end_line,
                similarity_score=r.similarity_score,
                docstring=r.docstring,
                match_info=r.match_info
            )
            for r in results
        ]

        return SearchResponse(
            query=request.query,
            results=search_results,
            total_results=len(search_results),
            search_time_ms=search_time_ms
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/search/similar", response_model=SearchResponse, tags=["Search"])
async def find_similar_code(request: SimilarCodeRequest):
    """
    Find code similar to a given snippet

    Provide a code snippet and find similar code in the index.
    Useful for finding duplicates, similar implementations, or related code.

    Args:
        request: SimilarCodeRequest with code snippet

    Returns:
        SearchResponse with similar code snippets
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        start_time = time.time()

        # Find similar code
        results = search_engine.find_similar_code(
            code_snippet=request.code_snippet,
            limit=request.limit,
            min_similarity=request.min_similarity
        )

        search_time_ms = (time.time() - start_time) * 1000

        # Convert to response models
        search_results = [
            SearchResult(
                symbol_name=r.symbol_name,
                symbol_type=r.symbol_type,
                file_path=r.file_path,
                code_snippet=r.code_snippet,
                start_line=r.start_line,
                end_line=r.end_line,
                similarity_score=r.similarity_score,
                docstring=r.docstring
            )
            for r in results
        ]

        return SearchResponse(
            query=f"Similar to: {request.code_snippet[:50]}...",
            results=search_results,
            total_results=len(search_results),
            search_time_ms=search_time_ms
        )

    except Exception as e:
        logger.error(f"Similar code search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Similar code search failed: {str(e)}"
        )


@router.post("/search/name", response_model=SearchResponse, tags=["Search"])
async def search_by_name(name: str, limit: int = 100):
    """
    Search for code by exact or partial name match

    Simple text-based search by symbol name.
    Faster than semantic search but less intelligent.

    Args:
        name: Symbol name to search for
        limit: Maximum results

    Returns:
        SearchResponse with matching symbols
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        start_time = time.time()

        # Search by name
        results = search_engine.search_by_name(name, limit=limit)

        search_time_ms = (time.time() - start_time) * 1000

        # Convert to response models
        search_results = [
            SearchResult(
                symbol_name=r.symbol_name,
                symbol_type=r.symbol_type,
                file_path=r.file_path,
                code_snippet=r.code_snippet,
                start_line=r.start_line,
                end_line=r.end_line,
                similarity_score=r.similarity_score,
                docstring=r.docstring
            )
            for r in results
        ]

        return SearchResponse(
            query=f"Name: {name}",
            results=search_results,
            total_results=len(search_results),
            search_time_ms=search_time_ms
        )

    except Exception as e:
        logger.error(f"Name search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Name search failed: {str(e)}"
        )


@router.get("/symbol/{name}", response_model=SearchResult, tags=["Search"])
async def get_symbol(name: str, file_path: Optional[str] = None):
    """
    Get a specific symbol by exact name

    Args:
        name: Exact symbol name
        file_path: Optional file path to narrow search

    Returns:
        SearchResult for the symbol
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        result = search_engine.get_symbol_by_name(name, file_path)

        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Symbol '{name}' not found"
            )

        return SearchResult(
            symbol_name=result.symbol_name,
            symbol_type=result.symbol_type,
            file_path=result.file_path,
            code_snippet=result.code_snippet,
            start_line=result.start_line,
            end_line=result.end_line,
            similarity_score=result.similarity_score,
            docstring=result.docstring
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Symbol lookup failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Symbol lookup failed: {str(e)}"
        )


@router.post("/index/clear", tags=["Indexing"])
async def clear_index():
    """
    Clear all indexed data

    WARNING: This will delete all indexed code and cannot be undone.

    Returns:
        Success message
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    try:
        indexer.clear_index()
        return {"success": True, "message": "Index cleared successfully"}

    except Exception as e:
        logger.error(f"Clear index failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clear index failed: {str(e)}"
        )


@router.post("/index/github", tags=["Indexing"])
async def index_github_repo(repo_url: str):
    """
    Clone and index a GitHub repository

    This endpoint will:
    1. Clone the repository to a temporary directory
    2. Clean up unnecessary files (media, archives, node_modules, etc.)
    3. Index the code
    4. Remove the temporary directory

    Args:
        repo_url: GitHub repository URL (e.g., https://github.com/user/repo)

    Returns:
        IndexResponse with statistics
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    from ..utils.github_clone import clone_github_repo, clean_repository, cleanup_temp_repo

    temp_dir = None
    try:
        # Clone repository
        logger.info(f"Cloning GitHub repository: {repo_url}")
        temp_dir = clone_github_repo(repo_url)

        # Clean repository
        logger.info("Cleaning repository")
        clean_stats = clean_repository(temp_dir)
        logger.info(f"Removed {clean_stats['files_removed']} files, {clean_stats['dirs_removed']} directories")

        # Index the cleaned repository
        logger.info(f"Indexing repository at {temp_dir}")
        stats = indexer.index_directory(temp_dir, show_progress=False, semantic=False)

        return {
            "success": True,
            "stats": stats,
            "message": f"Successfully built fast lexical index for GitHub repository. Cleaned {clean_stats['files_removed']} files.",
            "cleanup_stats": clean_stats
        }

    except subprocess.CalledProcessError as e:
        logger.error(f"Git clone failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to clone repository: {e.stderr if hasattr(e, 'stderr') else str(e)}"
        )
    except RuntimeError as e:
        logger.error(f"Git error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"GitHub indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to index repository: {str(e)}"
        )
    finally:
        # Don't clean up temp directory - keep it for code viewing
        # The directory will be cleaned up on next indexing operation
        if temp_dir:
            logger.info(f"Keeping cloned repository at {temp_dir} for code viewing")


@router.post("/index/upload", tags=["Indexing"])
async def upload_and_index(files: List[UploadFile] = File(...), is_zip: bool = Form(False)):
    """
    Upload and index files (folder or ZIP archive)

    This endpoint will:
    1. Save uploaded files to a temporary directory
    2. Extract ZIP if needed
    3. Clean up unnecessary files
    4. Index the code
    5. Remove the temporary directory

    Args:
        files: List of uploaded files
        is_zip: Whether the upload is a ZIP file

    Returns:
        IndexResponse with statistics
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    from ..utils.github_clone import clean_repository, cleanup_temp_repo

    temp_dir = None
    try:
        # Create temporary directory
        temp_dir = tempfile.mkdtemp(prefix='codescope_upload_')
        logger.info(f"Created temporary directory: {temp_dir}")

        if is_zip and len(files) == 1:
            # Handle ZIP file
            zip_path = Path(temp_dir) / files[0].filename
            with open(zip_path, 'wb') as f:
                content = await files[0].read()
                f.write(content)

            # Extract ZIP
            logger.info(f"Extracting ZIP file: {files[0].filename}")
            _extract_zip_safely(zip_path, Path(temp_dir))

            # Remove the ZIP file itself
            zip_path.unlink()
        else:
            # Handle folder upload (multiple files)
            logger.info(f"Saving {len(files)} uploaded files")
            for file in files:
                # Reconstruct directory structure
                file_path = Path(temp_dir) / _safe_upload_relative_path(file.filename)
                file_path.parent.mkdir(parents=True, exist_ok=True)

                # Save file
                with open(file_path, 'wb') as f:
                    content = await file.read()
                    f.write(content)

        # Clean repository
        logger.info("Cleaning uploaded files")
        clean_stats = clean_repository(temp_dir)
        logger.info(f"Removed {clean_stats['files_removed']} files, {clean_stats['dirs_removed']} directories")

        # Index the cleaned repository
        logger.info(f"Indexing uploaded files at {temp_dir}")
        stats = indexer.index_directory(temp_dir, show_progress=False, semantic=False)

        return {
            "success": True,
            "stats": stats,
            "message": f"Successfully built fast lexical index for uploaded files. Cleaned {clean_stats['files_removed']} files.",
            "cleanup_stats": clean_stats
        }

    except zipfile.BadZipFile:
        logger.error("Invalid ZIP file")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ZIP file"
        )
    except ValueError as e:
        logger.error(f"Unsafe upload path: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Upload indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to index uploaded files: {str(e)}"
        )
    finally:
        # Clean up temporary directory
        if temp_dir:
            try:
                cleanup_temp_repo(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup temp directory: {e}")


@router.get("/files", tags=["Indexing"])
async def list_indexed_files():
    """
    List all indexed files

    Returns:
        List of indexed file paths with stats
    """
    if not indexer:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Indexer not initialized"
        )

    try:
        cursor = indexer.metadata_store.conn.cursor()
        cursor.execute('''
            SELECT f.id, f.path, f.total_lines, f.indexed_at,
                   COUNT(s.id) as symbol_count
            FROM files f
            LEFT JOIN symbols s ON f.id = s.file_id
            GROUP BY f.id
            ORDER BY f.indexed_at DESC
        ''')

        files = []
        for row in cursor.fetchall():
            files.append({
                "id": row['id'],
                "path": row['path'],
                "total_lines": row['total_lines'],
                "indexed_at": row['indexed_at'],
                "symbol_count": row['symbol_count']
            })

        return {
            "total_files": len(files),
            "files": files
        }

    except Exception as e:
        logger.error(f"List files failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"List files failed: {str(e)}"
        )


@router.get("/autocomplete", tags=["Search"])
async def autocomplete(prefix: str, limit: int = 10):
    """
    Get autocomplete suggestions for search queries

    Args:
        prefix: Query prefix to autocomplete
        limit: Maximum number of suggestions

    Returns:
        List of suggested terms
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        suggestions = search_engine.text_search.autocomplete(prefix, limit)
        return {
            "prefix": prefix,
            "suggestions": suggestions
        }
    except Exception as e:
        logger.error(f"Autocomplete failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Autocomplete failed: {str(e)}"
        )


@router.get("/popular-terms", tags=["Search"])
async def get_popular_terms(limit: int = 20):
    """
    Get most popular search terms in the index

    Args:
        limit: Maximum number of terms

    Returns:
        List of popular terms
    """
    if not search_engine:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search engine not initialized"
        )

    try:
        terms = search_engine.text_search.get_popular_terms(limit)
        return {
            "terms": terms
        }
    except Exception as e:
        logger.error(f"Get popular terms failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Get popular terms failed: {str(e)}"
        )


@router.post("/chat", tags=["Chat"])
async def chat(
    message: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    use_rag: bool = True
):
    """
    Chat with AI assistant about the codebase

    Send a message and get an intelligent response. The chatbot can:
    - Answer questions about the code
    - Help troubleshoot issues
    - Explain how to run/build projects
    - Provide guidance on using CodeSniff

    Args:
        message: Your question or message
        conversation_history: Previous messages (optional, for context)
        use_rag: Whether to search codebase for relevant context (default: True)

    Returns:
        AI response with optional code sources
    """
    if not chatbot:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatbot not initialized. GROQ_API_KEY may be missing."
        )

    try:
        start_time = time.time()

        # Use RAG if enabled and search engine available
        if use_rag and rag_system:
            result = rag_system.answer_with_context(
                question=message,
                conversation_history=conversation_history
            )
            response_time_ms = (time.time() - start_time) * 1000

            return {
                "answer": result["answer"],
                "sources": result.get("sources", []),
                "used_rag": result["used_rag"],
                "response_time_ms": response_time_ms
            }
        else:
            # Direct chat without RAG
            answer = chatbot.chat(
                message=message,
                conversation_history=conversation_history
            )
            response_time_ms = (time.time() - start_time) * 1000

            return {
                "answer": answer,
                "sources": [],
                "used_rag": False,
                "response_time_ms": response_time_ms
            }

    except Exception as e:
        logger.error(f"Chat failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat failed: {str(e)}"
        )
