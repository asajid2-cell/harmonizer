"""Tests for the persistent repo/job registry."""

import io
import json
import hashlib
import shutil
import sqlite3
import time
import zipfile
from pathlib import Path

import numpy as np
import pytest

from app.core.semantic_warmup import warm_repo_semantics
from app.core.artifact_manifest import read_repo_manifest, write_repo_manifest
from app.core.artifact_recovery import queue_artifact_recovery_jobs, repair_repo_artifacts
from app.core.job_runner import IndexJobRunner, REPO_EXCLUSIVE_JOB_KINDS
from app.core.operator_policy import (
    DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES,
    get_source_retention_policy,
)
from app.core.repo_overview import persist_repo_overview
from app.core.search_quality import build_smoke_queries_from_overview
from app.core.worker_runtime import initialize_job_runtime
from app.main import _web_runner_enabled
from app.storage.repo_registry import RepoRegistry
from app.storage.active_repo_manager import ActiveRepoManager
from app.storage.metadata_store import MetadataStore, RepoFactRecord
from app.storage.vector_store import VectorStore
from app.core.indexer import Indexer
from app.core.parser import CodeParser
from app.core.search import SearchEngine
from app.core.text_search import TextSearchEngine
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api import routes


class ExplodingEmbedder:
    def batch_generate(self, codes, batch_size=8, use_cache=True):
        raise AssertionError("batch_generate should not be called")

    def embed_query(self, query):
        raise AssertionError("embed_query should not be called")


class FakeSemanticEmbedder:
    def _vector(self, text):
        vec = np.zeros(768, dtype=np.float32)
        lower = text.lower()
        if "database" in lower or "relational" in lower or "storage" in lower:
            vec[1] = 1.0
        else:
            vec[0] = 1.0
        return vec

    def batch_generate(self, codes, batch_size=8, use_cache=True):
        return [self._vector(code) for code in codes]

    def embed_query(self, query):
        return self._vector(query)


class WakeOnlyRunner:
    def __init__(self):
        self.wake_count = 0

    def wake(self):
        self.wake_count += 1


def build_repo_index(repo, filename="auth.py", code=None):
    repo_path = Path(repo.storage_path)
    source_path = repo_path / "source"
    source_path.mkdir(parents=True, exist_ok=True)
    code_path = source_path / filename
    code_path.write_text(
        code or "def authenticate_user(username, password):\n    return username and password\n",
        encoding="utf-8",
    )
    metadata = MetadataStore(db_path=str(repo_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )
    stats = indexer.index_directory(str(source_path), show_progress=False, semantic=False)
    metadata.close()
    return stats


def build_repo_index_from_files(repo, files):
    repo_path = Path(repo.storage_path)
    source_path = repo_path / "source"
    source_path.mkdir(parents=True, exist_ok=True)
    for filename, content in files.items():
        file_path = source_path / filename
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    metadata = MetadataStore(db_path=str(repo_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )
    stats = indexer.index_directory(str(source_path), show_progress=False, semantic=False)
    metadata.close()
    return stats


def assert_artifact_checksum(manifest, artifact_path):
    artifact = manifest["artifacts"][artifact_path]
    assert artifact["path"] == artifact_path
    assert artifact["bytes"] > 0
    assert len(artifact["sha256"]) == 64


def write_manifest(repo, manifest):
    Path(repo.storage_path, "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def test_repo_registry_persists_repos_and_jobs(tmp_path):
    db_path = tmp_path / "registry.sqlite"
    repos_dir = tmp_path / "repos"

    registry = RepoRegistry(db_path=str(db_path), repos_dir=str(repos_dir))
    repo = registry.create_repo(
        name="alarmonizer",
        source_type="github",
        source_url="https://github.com/example/alarmonizer",
    )
    job = registry.create_job(repo.id, kind="fast_index")
    registry.mark_job_running(job.id, phase="fast_indexing")
    registry.mark_job_complete(job.id, phase="lexical_ready", files_indexed=12, symbols_indexed=34)
    registry.update_repo(repo.id, status="lexical_ready")

    reopened = RepoRegistry(db_path=str(db_path), repos_dir=str(repos_dir))
    repos = reopened.list_repos()
    saved_job = reopened.get_job(job.id)

    assert len(repos) == 1
    assert repos[0].id == repo.id
    assert repos[0].status == "lexical_ready"
    assert repos_dir.joinpath(str(repo.id)).exists()
    assert saved_job.status == "complete"
    assert saved_job.files_indexed == 12
    assert saved_job.symbols_indexed == 34


def test_queue_github_repo_endpoint_returns_repo_and_job(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    def fake_worker(repo_id: int, job_id: int, repo_url: str):
        registry.mark_job_running(job_id, "fast_indexing")
        registry.mark_job_complete(job_id, "lexical_ready", files_indexed=1, symbols_indexed=2)
        registry.update_repo(repo_id, status="lexical_ready")

    monkeypatch.setattr(routes, "_run_github_fast_index", fake_worker)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(
            "/api/repos/github",
            json={"repo_url": "https://github.com/example/project"}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["repo"]["name"] == "project"
    assert body["repo"]["source_type"] == "github"
    assert body["job"]["kind"] == "fast_index"

    saved_job = registry.get_job(body["job"]["id"])
    assert saved_job.status == "complete"


def test_queue_github_repo_endpoint_uses_persistent_runner_when_available(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)

    def fail_if_called(repo_id: int, job_id: int, repo_url: str):
        raise AssertionError("Fast index should be claimed by the persistent runner")

    monkeypatch.setattr(routes, "_run_github_fast_index", fail_if_called)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/repos/github",
                json={"repo_url": "https://github.com/example/project"}
            )
    finally:
        routes.set_job_runner(None)

    assert response.status_code == 200
    body = response.json()
    saved_job = registry.get_job(body["job"]["id"])
    assert saved_job.status == "queued"
    assert runner.wake_count == 1


def test_cancel_queued_fast_index_job_marks_repo_canceled(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            queued = client.post(
                "/api/repos/github",
                json={"repo_url": "https://github.com/example/project"},
            )
            job_id = queued.json()["job"]["id"]
            canceled = client.post(f"/api/jobs/{job_id}/cancel")
    finally:
        routes.set_job_runner(None)

    assert queued.status_code == 200
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "canceled"
    assert canceled.json()["phase"] == "canceled"
    repo = registry.get_repo(queued.json()["repo"]["id"])
    assert repo.status == "canceled"
    assert repo.error_summary == "Canceled by user"
    assert registry.claim_next_queued_job(["fast_index"]) is None


def test_refresh_repo_endpoint_queues_stored_source_reindex(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            response = client.post(f"/api/repos/{repo.id}/refresh")
    finally:
        routes.set_job_runner(None)

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["kind"] == "refresh"
    assert body["job"]["status"] == "queued"
    assert body["repo"]["status"] == "refresh_queued"
    assert runner.wake_count == 1
    assert registry.get_repo(repo.id).status == "refresh_queued"


def test_refresh_repo_endpoint_rejects_active_writer_job(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index(repo)
    registry.update_repo(repo.id, status="semantic_warming")
    semantic_job = registry.create_job(repo.id, kind="semantic_warm")
    registry.mark_job_running(semantic_job.id, "semantic_warming")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(f"/api/repos/{repo.id}/refresh")

    assert response.status_code == 409
    assert response.json()["detail"] == "Repo already has an active writer job: semantic_warm"
    assert registry.get_active_job(repo.id, kind="refresh") is None


def test_enrich_repo_endpoint_queues_deep_enrichment(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            response = client.post(f"/api/repos/{repo.id}/enrich")
    finally:
        routes.set_job_runner(None)

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["kind"] == "deep_enrich"
    assert body["job"]["status"] == "queued"
    assert body["repo"]["status"] == "deep_enrich_queued"
    assert runner.wake_count == 1


def test_refresh_schedule_endpoint_sets_and_disables_schedule(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    repo = registry.create_repo("scheduled", "github", "https://github.com/example/scheduled")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            enabled = client.post(
                f"/api/repos/{repo.id}/refresh/schedule",
                json={"interval_minutes": 60},
            )
            disabled = client.post(
                f"/api/repos/{repo.id}/refresh/schedule",
                json={"interval_minutes": 0},
            )
    finally:
        routes.set_job_runner(None)

    assert enabled.status_code == 200
    enabled_body = enabled.json()
    assert enabled_body["refresh_interval_minutes"] == 60
    assert enabled_body["next_refresh_at"]

    assert disabled.status_code == 200
    disabled_body = disabled.json()
    assert disabled_body["refresh_interval_minutes"] is None
    assert disabled_body["next_refresh_at"] is None
    assert runner.wake_count == 2


def test_job_runner_queues_due_scheduled_refresh(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.storage.repo_registry._now",
        lambda: "2026-01-01T00:00:00Z",
    )
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("scheduled", "github", "https://github.com/example/scheduled")
    registry.update_repo(repo.id, status="lexical_ready")
    registry.set_refresh_schedule(repo.id, 15, next_refresh_at="2026-01-01T00:00:00Z")
    handled = []

    def complete_refresh(claimed_job):
        handled.append((claimed_job.kind, claimed_job.status, claimed_job.phase))
        registry.mark_job_complete(claimed_job.id, "lexical_ready", files_indexed=1, symbols_indexed=1)
        registry.update_repo(claimed_job.repo_id, status="lexical_ready")

    runner = IndexJobRunner(
        registry,
        handlers={"refresh": complete_refresh},
        recover_on_start=False,
    )

    assert runner.run_once() is True

    assert handled == [("refresh", "running", "queued_scheduled_refresh")]
    completed = registry.get_active_job(repo.id, kind="refresh")
    assert completed is None
    updated = registry.get_repo(repo.id)
    assert updated.last_scheduled_refresh_at == "2026-01-01T00:00:00Z"
    assert updated.next_refresh_at == "2026-01-01T00:15:00Z"


def test_scheduled_refresh_waits_behind_active_writer(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "app.storage.repo_registry._now",
        lambda: "2026-01-01T00:00:00Z",
    )
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("scheduled", "github", "https://github.com/example/scheduled")
    registry.update_repo(repo.id, status="semantic_warming")
    registry.set_refresh_schedule(repo.id, 15, next_refresh_at="2026-01-01T00:00:00Z")
    running = registry.create_job(repo.id, kind="semantic_warm", phase="semantic_warming")
    registry.mark_job_running(running.id, "semantic_warming")
    runner = IndexJobRunner(
        registry,
        handlers={"refresh": lambda job: (_ for _ in ()).throw(AssertionError("refresh should wait"))},
        recover_on_start=False,
    )

    assert runner.run_once() is False

    assert registry.get_active_job(repo.id, kind="refresh") is None
    assert registry.get_repo(repo.id).next_refresh_at == "2026-01-01T00:00:00Z"


def test_upload_repo_endpoint_stages_files_and_uses_persistent_runner(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            response = client.post(
                "/api/repos/upload",
                data={"is_zip": "false", "name": "uploaded-project"},
                files=[
                    (
                        "files",
                        (
                            "project/auth.py",
                            b"def authenticate_user(username, password):\n    return username and password\n",
                            "text/x-python",
                        ),
                    )
                ],
            )
    finally:
        routes.set_job_runner(None)

    assert response.status_code == 200
    body = response.json()
    repo = registry.get_repo(body["repo"]["id"])
    saved_job = registry.get_job(body["job"]["id"])

    assert repo.name == "uploaded-project"
    assert repo.source_type == "upload"
    assert repo.status == "queued"
    assert saved_job.kind == "upload_fast_index"
    assert saved_job.status == "queued"
    assert runner.wake_count == 1
    assert Path(repo.storage_path, "source", "project", "auth.py").exists()


def test_upload_repo_fallback_background_indexes_staged_source(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(
            "/api/repos/upload",
            data={"is_zip": "false", "name": "uploaded-project"},
            files=[
                (
                    "files",
                    (
                        "project/auth.py",
                        b"def authenticate_user(username, password):\n    return username and password\n",
                        "text/x-python",
                    ),
                )
            ],
        )
        body = response.json()
        search = client.post(
            f"/api/repos/{body['repo']['id']}/search",
            json={"query": "authenticate user", "limit": 5},
        )

    assert response.status_code == 200
    assert registry.get_job(body["job"]["id"]).status == "complete"
    assert registry.get_repo(body["repo"]["id"]).status == "lexical_ready"
    assert search.status_code == 200
    assert search.json()["results"][0]["symbol_name"] == "authenticate_user"


def test_upload_zip_rejects_path_traversal(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w") as zip_ref:
        zip_ref.writestr("../escape.py", "def escape():\n    return True\n")
    archive.seek(0)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(
            "/api/repos/upload",
            data={"is_zip": "true", "name": "bad-archive"},
            files=[("files", ("bad.zip", archive.getvalue(), "application/zip"))],
        )

    assert response.status_code == 400
    assert "Unsafe upload path" in response.json()["detail"]
    assert not tmp_path.joinpath("escape.py").exists()


def test_job_runner_requeues_interrupted_jobs_and_runs_once(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    job = registry.create_job(repo.id, kind="fast_index", phase="fast_indexing")
    registry.mark_job_running(job.id, "fast_indexing")

    handled = []

    def complete_fast_index(claimed_job):
        handled.append((claimed_job.id, claimed_job.status, claimed_job.phase))
        registry.mark_job_complete(
            claimed_job.id,
            phase="lexical_ready",
            files_indexed=1,
            symbols_indexed=2,
        )
        registry.update_repo(claimed_job.repo_id, status="lexical_ready")

    runner = IndexJobRunner(
        registry=registry,
        handlers={"fast_index": complete_fast_index},
        recover_on_start=False,
    )

    recovered = runner.recover_interrupted_jobs()
    requeued_job = registry.get_job(job.id)

    assert recovered == 1
    assert requeued_job.status == "queued"
    assert requeued_job.phase == "queued_after_restart"

    assert runner.run_once() is True
    assert handled == [(job.id, "running", "queued_after_restart")]
    assert registry.get_job(job.id).status == "complete"
    assert registry.get_repo(repo.id).status == "lexical_ready"


def test_external_worker_runtime_runs_upload_fast_index_without_web_lifespan(tmp_path, monkeypatch):
    monkeypatch.setenv("CODESNIFF_AUTO_DEEP_ENRICH", "0")
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    previous_registry = routes.repo_registry
    previous_manager = routes.active_repo_manager
    previous_runner = routes.job_runner
    previous_storage_dir = routes.storage_dir
    runtime = None

    try:
        runtime = initialize_job_runtime(
            storage_dir=str(tmp_path / "storage"),
            max_active_repos=1,
            poll_interval=0.01,
            recover_interrupted=False,
            run_recovery_scan=False,
            start_runner=False,
        )
        repo = runtime.registry.create_repo("external-worker", "upload", None)
        source_path = Path(repo.storage_path) / "source"
        source_path.mkdir(parents=True)
        (source_path / "app.py").write_text(
            "def external_worker_symbol():\n    return True\n",
            encoding="utf-8",
        )
        job = runtime.registry.create_job(repo.id, kind="upload_fast_index")

        assert runtime.runner.run_once() is True

        assert runtime.registry.get_job(job.id).status == "complete"
        assert runtime.registry.get_repo(repo.id).status == "lexical_ready"
        metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
        try:
            names = {symbol.name for symbol in metadata.search_symbols("external_worker_symbol")}
        finally:
            metadata.close()
        assert "external_worker_symbol" in names
        assert routes.repo_registry is runtime.registry
        assert routes.active_repo_manager is runtime.active_repo_manager
        assert routes.job_runner is runtime.runner
        assert runtime.active_repo_manager.max_active_repos == 1
    finally:
        if runtime is not None:
            runtime.runner.stop(timeout=1.0)
            runtime.active_repo_manager.close_all()
            runtime.registry.conn.close()
        routes.repo_registry = previous_registry
        routes.active_repo_manager = previous_manager
        routes.job_runner = previous_runner
        routes.storage_dir = previous_storage_dir


def test_external_worker_runtime_requeues_interrupted_jobs_on_startup(tmp_path):
    storage_dir = tmp_path / "storage"
    seed_registry = RepoRegistry(
        db_path=str(storage_dir / "registry.sqlite"),
        repos_dir=str(storage_dir / "repos"),
    )
    repo = seed_registry.create_repo("interrupted", "github", "https://github.com/example/interrupted")
    job = seed_registry.create_job(repo.id, kind="fast_index", phase="fast_indexing")
    seed_registry.mark_job_running(job.id, "fast_indexing")
    seed_registry.conn.close()

    previous_registry = routes.repo_registry
    previous_manager = routes.active_repo_manager
    previous_runner = routes.job_runner
    previous_storage_dir = routes.storage_dir
    runtime = None

    try:
        runtime = initialize_job_runtime(
            storage_dir=str(storage_dir),
            max_active_repos=1,
            poll_interval=0.01,
            recover_interrupted=True,
            run_recovery_scan=False,
            start_runner=False,
        )

        assert runtime.recovered_jobs == 1
        recovered_job = runtime.registry.get_job(job.id)
        assert recovered_job.status == "queued"
        assert recovered_job.phase == "queued_after_restart"
    finally:
        if runtime is not None:
            runtime.runner.stop(timeout=1.0)
            runtime.active_repo_manager.close_all()
            runtime.registry.conn.close()
        routes.repo_registry = previous_registry
        routes.active_repo_manager = previous_manager
        routes.job_runner = previous_runner
        routes.storage_dir = previous_storage_dir


def test_web_runner_env_switch_defaults_on_and_accepts_disable_aliases(monkeypatch):
    monkeypatch.delenv("CODESNIFF_WEB_RUNNER_ENABLED", raising=False)
    assert _web_runner_enabled() is True

    for value in ("0", "false", "no", "off"):
        monkeypatch.setenv("CODESNIFF_WEB_RUNNER_ENABLED", value)
        assert _web_runner_enabled() is False

    monkeypatch.setenv("CODESNIFF_WEB_RUNNER_ENABLED", "1")
    assert _web_runner_enabled() is True


def test_claim_next_queued_job_skips_same_repo_writer_lock(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    first = registry.create_repo("first", "github", "https://github.com/example/first")
    second = registry.create_repo("second", "github", "https://github.com/example/second")
    running = registry.create_job(first.id, kind="fast_index")
    registry.mark_job_running(running.id, "fast_indexing")
    blocked = registry.create_job(first.id, kind="semantic_warm")
    other = registry.create_job(second.id, kind="fast_index")

    claimed = registry.claim_next_queued_job(
        ["semantic_warm", "fast_index"],
        exclusive_repo_job_kinds=REPO_EXCLUSIVE_JOB_KINDS,
    )

    assert claimed.id == other.id
    assert claimed.repo_id == second.id
    assert registry.get_job(blocked.id).status == "queued"
    assert registry.get_job(other.id).status == "running"


def test_claim_next_queued_job_prioritizes_fast_work_over_deep_enrichment(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    first = registry.create_repo("first", "github", "https://github.com/example/first")
    second = registry.create_repo("second", "github", "https://github.com/example/second")
    enrich = registry.create_job(first.id, kind="deep_enrich")
    upload = registry.create_job(second.id, kind="upload_fast_index")

    claimed = registry.claim_next_queued_job(
        ["deep_enrich", "upload_fast_index"],
        exclusive_repo_job_kinds=REPO_EXCLUSIVE_JOB_KINDS,
    )

    assert claimed.id == upload.id
    assert registry.get_job(enrich.id).status == "queued"
    assert registry.get_job(upload.id).status == "running"


def test_job_runner_leaves_same_repo_writer_queued_until_lock_released(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    running = registry.create_job(repo.id, kind="fast_index")
    registry.mark_job_running(running.id, "fast_indexing")
    blocked = registry.create_job(repo.id, kind="semantic_warm")
    handled = []

    def handle_semantic(job):
        handled.append(job.id)
        registry.mark_job_complete(job.id, "semantic_ready", files_indexed=0, symbols_indexed=1)

    runner = IndexJobRunner(
        registry=registry,
        handlers={"semantic_warm": handle_semantic},
        recover_on_start=False,
    )

    assert runner.run_once() is False
    assert handled == []
    assert registry.get_job(blocked.id).status == "queued"

    registry.mark_job_complete(running.id, "lexical_ready", files_indexed=1, symbols_indexed=1)

    assert runner.run_once() is True
    assert handled == [blocked.id]
    assert registry.get_job(blocked.id).status == "complete"


def test_startup_recovery_rebuilds_missing_lexical_manifest(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")

    manifest_path = Path(repo.storage_path, "manifest.json")
    assert not manifest_path.exists()

    recovery = queue_artifact_recovery_jobs(registry)
    manifest = read_repo_manifest(repo.storage_path)

    assert recovery.scanned == 1
    assert recovery.manifests_rebuilt == 1
    assert recovery.semantic_repairs_queued == 0
    assert registry.count_jobs() == 0
    assert registry.get_repo(repo.id).status == "lexical_ready"
    assert manifest["status"] == "lexical_ready"
    assert manifest["lexical"]["ready"] is True
    assert manifest["semantic"]["ready"] is False
    assert_artifact_checksum(manifest, "repo.sqlite")


def test_startup_recovery_queues_and_runs_semantic_artifact_repair(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(
        repo,
        code=(
            "def authenticate_user(username, password):\n"
            "    return username and password\n\n"
            "def connect_database(host):\n"
            "    return host\n"
        )
    )
    stats = warm_repo_semantics(
        repo_storage_path=repo.storage_path,
        embedder=FakeSemanticEmbedder(),
        batch_size=1,
    )
    registry.update_repo(repo.id, status="semantic_ready")

    metadata_path = Path(stats.vector_dir, "metadata.npy")
    metadata = np.load(str(metadata_path), allow_pickle=True).tolist()
    metadata[0]["symbol_name"] = "tampered_but_loadable"
    with open(metadata_path, "wb") as f:
        np.save(f, metadata, allow_pickle=True)

    recovery = queue_artifact_recovery_jobs(registry)
    queued_job = registry.get_active_job(repo.id, kind="artifact_repair")

    assert recovery.semantic_repairs_queued == 1
    assert queued_job is not None
    assert registry.get_repo(repo.id).status == "artifact_repair_queued"

    def run_artifact_repair(job):
        result = repair_repo_artifacts(registry, job.repo_id)
        registry.mark_job_complete(
            job.id,
            phase="lexical_ready",
            files_indexed=result.files_indexed,
            symbols_indexed=result.symbols_indexed,
        )

    runner = IndexJobRunner(
        registry=registry,
        handlers={"artifact_repair": run_artifact_repair},
        recover_on_start=False,
    )

    assert runner.run_once() is True
    completed_job = registry.get_job(queued_job.id)
    repaired_repo = registry.get_repo(repo.id)
    manifest = read_repo_manifest(repo.storage_path)

    assert completed_job.status == "complete"
    assert completed_job.phase == "lexical_ready"
    assert repaired_repo.status == "lexical_ready"
    assert not Path(repo.storage_path, "vector_index").exists()
    assert manifest["semantic"]["ready"] is False
    assert manifest["semantic"]["artifacts"] == []
    assert_artifact_checksum(manifest, "repo.sqlite")


def test_artifact_repair_blocks_same_repo_semantic_warm_claim(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    repair = registry.create_job(repo.id, kind="artifact_repair", phase="artifact_repair")
    registry.mark_job_running(repair.id, "artifact_repair")
    warm = registry.create_job(repo.id, kind="semantic_warm", phase="queued")

    claimed = registry.claim_next_queued_job(
        ["semantic_warm"],
        exclusive_repo_job_kinds=REPO_EXCLUSIVE_JOB_KINDS,
    )

    assert claimed is None
    assert registry.get_job(warm.id).status == "queued"

    registry.mark_job_complete(repair.id, "lexical_ready", files_indexed=1, symbols_indexed=1)

    claimed_after_repair = registry.claim_next_queued_job(
        ["semantic_warm"],
        exclusive_repo_job_kinds=REPO_EXCLUSIVE_JOB_KINDS,
    )

    assert claimed_after_repair.id == warm.id
    assert registry.get_job(warm.id).status == "running"


def test_startup_recovery_queues_and_runs_lexical_refresh_repair(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")
    write_repo_manifest(
        repo_storage_path=repo.storage_path,
        status="lexical_ready",
        source_path=Path(repo.storage_path) / "source",
    )

    manifest = read_repo_manifest(repo.storage_path)
    manifest["artifacts"]["repo.sqlite"]["sha256"] = "0" * 64
    write_manifest(repo, manifest)
    Path(repo.storage_path, "source", "auth.py").write_text(
        "def repaired_symbol():\n    return True\n",
        encoding="utf-8",
    )

    recovery = queue_artifact_recovery_jobs(registry)
    queued_job = registry.get_active_job(repo.id, kind="refresh")

    assert recovery.lexical_repairs_queued == 1
    assert recovery.lexical_degraded == 0
    assert recovery.semantic_repairs_queued == 0
    assert registry.get_active_job(repo.id, kind="artifact_repair") is None
    assert queued_job is not None
    assert queued_job.phase == "queued_lexical_repair"
    assert registry.get_repo(repo.id).status == "refresh_queued"

    runner = IndexJobRunner(
        registry=registry,
        handlers={"refresh": lambda job: routes._run_repo_refresh(job.repo_id, job.id)},
        recover_on_start=False,
    )

    assert runner.run_once() is True
    completed_job = registry.get_job(queued_job.id)
    repo_after_repair = registry.get_repo(repo.id)
    repaired_manifest = read_repo_manifest(repo.storage_path)

    assert completed_job.status == "complete"
    assert repo_after_repair.status == "lexical_ready"
    assert repaired_manifest["artifacts"]["repo.sqlite"]["sha256"] != "0" * 64

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        names = {row["name"] for row in metadata.conn.execute("SELECT name FROM symbols").fetchall()}
    finally:
        metadata.close()
    assert names == {"repaired_symbol"}


def test_startup_recovery_marks_unrepairable_lexical_checksum_mismatch_degraded(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")
    write_repo_manifest(
        repo_storage_path=repo.storage_path,
        status="lexical_ready",
        source_path=Path(repo.storage_path) / "source",
    )

    manifest = read_repo_manifest(repo.storage_path)
    manifest["artifacts"]["repo.sqlite"]["sha256"] = "0" * 64
    write_manifest(repo, manifest)
    shutil.rmtree(Path(repo.storage_path) / "source")

    recovery = queue_artifact_recovery_jobs(registry)
    repo_after_recovery = registry.get_repo(repo.id)

    assert recovery.lexical_repairs_queued == 0
    assert recovery.lexical_degraded == 1
    assert registry.get_active_job(repo.id, kind="refresh") is None
    assert repo_after_recovery.status == "artifact_degraded"
    assert "repo.sqlite checksum changed" in repo_after_recovery.error_summary


def test_startup_recovery_skips_repo_with_active_writer_job(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="semantic_warming")
    write_repo_manifest(
        repo_storage_path=repo.storage_path,
        status="lexical_ready",
        source_path=Path(repo.storage_path) / "source",
    )
    manifest = read_repo_manifest(repo.storage_path)
    manifest["artifacts"]["repo.sqlite"]["sha256"] = "0" * 64
    write_manifest(repo, manifest)
    semantic_job = registry.create_job(repo.id, kind="semantic_warm", phase="semantic_warming")
    registry.mark_job_running(semantic_job.id, "semantic_warming")

    recovery = queue_artifact_recovery_jobs(registry)

    assert recovery.skipped == 1
    assert recovery.lexical_degraded == 0
    assert recovery.semantic_repairs_queued == 0
    assert registry.get_repo(repo.id).status == "semantic_warming"
    assert registry.get_active_job(repo.id, kind="semantic_warm").id == semantic_job.id


def test_fast_indexed_repo_is_searchable_from_cold_sqlite(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    source_file = source_repo / "auth.py"
    source_file.write_text(
        "def authenticate_user(username, password):\n"
        "    \"\"\"Authenticate a user account.\"\"\"\n"
        "    return username and password\n",
        encoding="utf-8",
    )

    def fake_clone(repo_url: str, target_dir: str | None = None):
        target = Path(target_dir)
        shutil.copytree(source_repo, target)
        return str(target)

    def fake_clean(repo_path: str):
        return {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0}

    monkeypatch.setattr("app.utils.github_clone.clone_github_repo", fake_clone)
    monkeypatch.setattr("app.utils.github_clone.clean_repository", fake_clean)

    repo = registry.create_repo(
        name="sample",
        source_type="github",
        source_url="https://github.com/example/sample",
    )
    job = registry.create_job(repo.id, kind="fast_index")

    routes._run_github_fast_index(repo.id, job.id, repo.source_url)

    assert registry.get_job(job.id).status == "complete"
    assert registry.get_repo(repo.id).status == "lexical_ready"

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(
            f"/api/repos/{repo.id}/search",
            json={"query": "authenticate user", "limit": 5},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total_results"] >= 1
    assert body["results"][0]["symbol_name"] == "authenticate_user"
    assert "lexical" in body["results"][0]["match_info"]


def test_fast_index_job_writes_lexical_manifest(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    source_repo.joinpath("auth.py").write_text(
        "def authenticate_user(username, password):\n"
        "    return username and password\n",
        encoding="utf-8",
    )

    def fake_clean(repo_path: str):
        return {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0}

    monkeypatch.setattr("app.utils.github_clone.clean_repository", fake_clean)

    repo = registry.create_repo("sample", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")

    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["version"] == 1
    assert manifest["status"] == "lexical_ready"
    assert manifest["source"]["available"] is True
    assert manifest["source"]["files_seen"] == 1
    assert manifest["lexical"]["ready"] is True
    assert manifest["lexical"]["files"] == 1
    assert manifest["lexical"]["symbols"] == 1
    assert manifest["lexical"]["artifacts"] == ["repo.sqlite"]
    assert manifest["semantic"]["ready"] is False
    assert manifest["semantic"]["artifacts"] == []
    assert_artifact_checksum(manifest, "repo.sqlite")


def test_fast_index_job_uses_shallow_mode_above_file_threshold(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "2")

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    for idx in range(3):
        (source_repo / f"module_{idx}.py").write_text(
            f"def symbol_{idx}():\n    return {idx}\n",
            encoding="utf-8",
        )

    repo = registry.create_repo("sample", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")

    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["lexical"]["index_mode"] == "shallow"
    assert manifest["lexical"]["files"] == 3
    assert manifest["lexical"]["symbols"] == 3
    assert routes._repo_response(repo).lexical_index_mode == "shallow"

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        assert metadata.get_stats()["by_type"] == {"file": 3}
        assert metadata.conn.execute("SELECT COUNT(*) FROM file_blobs").fetchone()[0] == 0
        row = metadata.conn.execute(
            "SELECT payload_json FROM repo_overview_cache WHERE cache_key = 'repo_overview_v1'"
        ).fetchone()
        overview = json.loads(row["payload_json"])
    finally:
        metadata.close()

    assert "Route and schema source scans were skipped" in " ".join(overview["warnings"])


def test_shallow_fast_index_queues_deep_enrichment_when_runner_is_available(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "2")

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    for idx in range(3):
        (source_path / f"module_{idx}.py").write_text(
            f"def symbol_{idx}():\n    return {idx}\n",
            encoding="utf-8",
        )
    job = registry.create_job(repo.id, kind="upload_fast_index")

    try:
        routes._run_prepared_fast_index(repo.id, job.id, source_path)
    finally:
        routes.set_job_runner(None)

    queued = registry.get_active_job(repo.id, kind="deep_enrich")
    assert queued is not None
    assert queued.status == "queued"
    assert queued.phase == "queued_deep_enrich"
    assert runner.wake_count == 1
    assert registry.get_repo(repo.id).status == "lexical_ready"


def test_operator_policy_endpoint_reports_source_retention_defaults(monkeypatch):
    monkeypatch.delenv("CODESNIFF_SOURCE_RETENTION_MODE", raising=False)
    monkeypatch.delenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", raising=False)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        response = client.get("/api/operator-policy")

    assert response.status_code == 200
    source_retention = response.json()["source_retention"]
    assert source_retention["mode"] == "auto"
    assert source_retention["enabled"] is True
    assert source_retention["prune_threshold_bytes"] == DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES
    assert source_retention["cleanup_policy"] == "prune_managed_shallow_github_source_after_manifest_commit"
    assert source_retention["applies_to_source_types"] == ["github"]
    assert source_retention["applies_to_index_modes"] == ["shallow"]
    assert source_retention["rehydrate_on"] == ["refresh", "deep_enrich"]
    assert source_retention["managed_source_only"] is True
    assert source_retention["warnings"] == []


def test_source_retention_policy_normalizes_aliases_and_invalid_threshold(monkeypatch):
    monkeypatch.setenv("CODESNIFF_SOURCE_RETENTION_MODE", "off")
    monkeypatch.setenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", "not-a-number")

    policy = get_source_retention_policy()

    assert policy.mode == "keep"
    assert policy.enabled is False
    assert policy.cleanup_policy == "keep_managed_source_snapshots"
    assert policy.prune_threshold_bytes == DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES
    assert policy.should_prune(
        source_type="github",
        source_url="https://github.com/example/repo",
        index_mode="shallow",
        source_bytes=DEFAULT_SOURCE_PRUNE_THRESHOLD_BYTES + 1,
    ) is False
    assert any("Invalid CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES" in warning for warning in policy.warnings)


def test_large_shallow_github_prunes_source_snapshot_after_index(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)
    routes.set_job_runner(None)
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", "1")

    repo = registry.create_repo("linux-sized", "github", "https://github.com/example/linux-sized")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "kernel").mkdir()
    (source_path / "kernel" / "sched.py").write_text(
        "def schedule_tick():\n    return 'tick'\n",
        encoding="utf-8",
    )
    job = registry.create_job(repo.id, kind="fast_index")

    routes._run_prepared_fast_index(repo.id, job.id, source_path)

    assert registry.get_job(job.id).status == "complete"
    assert registry.get_repo(repo.id).status == "lexical_ready"
    assert not source_path.exists()
    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["source"]["available"] is False
    assert manifest["source"]["retention"]["policy"] == "pruned"
    assert manifest["source"]["retention"]["reason"] == "large_shallow_github_source"
    assert manifest["lexical"]["index_mode"] == "shallow"

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        repos_response = client.get("/api/repos")
        search_response = client.post(
            f"/api/repos/{repo.id}/search",
            json={"query": "kernel sched", "limit": 5},
        )
        files_response = client.get(f"/api/repos/{repo.id}/files")
        file_response = client.get(
            f"/api/repos/{repo.id}/file",
            params={"path": "kernel/sched.py"},
        )

    assert repos_response.status_code == 200
    body = repos_response.json()[0]
    assert body["source_available"] is False
    assert body["source_pruned"] is True
    assert body["source_retention_policy"] == "pruned"
    assert any("Source snapshot was pruned" in warning for warning in body["artifact_warnings"])
    assert search_response.status_code == 200
    assert search_response.json()["total_results"] >= 1
    assert files_response.status_code == 200
    assert files_response.json()["total_files"] == 1
    assert file_response.status_code == 409
    assert "Source snapshot" in file_response.json()["detail"]


def test_source_retention_keep_mode_disables_large_shallow_pruning(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)
    routes.set_job_runner(None)
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", "1")
    monkeypatch.setenv("CODESNIFF_SOURCE_RETENTION_MODE", "keep")

    repo = registry.create_repo("keep-source", "github", "https://github.com/example/keep-source")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "module.py").write_text("def kept_source():\n    return True\n", encoding="utf-8")
    job = registry.create_job(repo.id, kind="fast_index")

    routes._run_prepared_fast_index(repo.id, job.id, source_path)

    assert registry.get_job(job.id).status == "complete"
    assert source_path.exists()
    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["lexical"]["index_mode"] == "shallow"
    assert manifest["source"]["available"] is True
    assert manifest["source"]["retention"]["policy"] == "kept"


def test_deep_enrichment_rehydrates_pruned_github_source(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)
    routes.set_job_runner(None)
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", "1")

    repo = registry.create_repo("rehydrate", "github", "https://github.com/example/rehydrate")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "shallow.py").write_text("def shallow_marker():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
    assert not source_path.exists()

    def fake_clone(repo_url: str, target_dir: str | None = None):
        target = Path(target_dir)
        target.mkdir(parents=True, exist_ok=True)
        (target / "rehydrated.py").write_text(
            "def rehydrated_symbol():\n    return True\n",
            encoding="utf-8",
        )
        return str(target)

    monkeypatch.setattr("app.utils.github_clone.clone_github_repo", fake_clone)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        response = client.post(f"/api/repos/{repo.id}/enrich")

    assert response.status_code == 200
    enrich_job = registry.get_job(response.json()["job"]["id"])
    assert enrich_job.status == "complete"
    assert source_path.exists()
    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["source"]["available"] is True
    assert manifest["source"]["retention"]["policy"] == "kept"
    assert manifest["lexical"]["index_mode"] == "deep"

    with TestClient(app) as client:
        search_response = client.post(
            f"/api/repos/{repo.id}/search",
            json={"query": "rehydrated symbol", "limit": 5},
        )

    assert search_response.status_code == 200
    assert search_response.json()["results"][0]["symbol_name"] == "rehydrated_symbol"


def test_refresh_rehydrates_then_reprunes_shallow_github_source(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)
    routes.set_job_runner(None)
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_SOURCE_PRUNE_THRESHOLD_BYTES", "1")

    repo = registry.create_repo("refresh-pruned", "github", "https://github.com/example/refresh-pruned")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "old_marker.py").write_text("def old_marker():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    assert registry.get_job(initial_job.id).status == "complete"
    assert not source_path.exists()
    initial_manifest = read_repo_manifest(repo.storage_path)
    assert initial_manifest["lexical"]["index_mode"] == "shallow"
    assert initial_manifest["source"]["retention"]["policy"] == "pruned"

    new_source = tmp_path / "new_source"
    new_source.mkdir()
    (new_source / "new_marker.py").write_text("def new_marker():\n    return True\n", encoding="utf-8")

    def fake_clone(repo_url: str, target_dir: str | None = None):
        shutil.copytree(new_source, Path(target_dir))
        return str(target_dir)

    monkeypatch.setattr("app.utils.github_clone.clone_github_repo", fake_clone)

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    assert registry.get_repo(repo.id).status == "lexical_ready"
    assert not source_path.exists()
    refreshed_manifest = read_repo_manifest(repo.storage_path)
    assert refreshed_manifest["lexical"]["index_mode"] == "shallow"
    assert refreshed_manifest["source"]["available"] is False
    assert refreshed_manifest["source"]["retention"]["policy"] == "pruned"
    assert refreshed_manifest["source"]["retention"]["reason"] == "large_shallow_github_source"

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        new_search = client.post(f"/api/repos/{repo.id}/search", json={"query": "new marker", "limit": 5})
        old_search = client.post(f"/api/repos/{repo.id}/search", json={"query": "old marker", "limit": 5})
        files_response = client.get(f"/api/repos/{repo.id}/files")

    assert new_search.status_code == 200
    assert new_search.json()["total_results"] >= 1
    assert old_search.status_code == 200
    assert all(
        "old_marker" not in f"{item['symbol_name']} {item['file_path']}"
        for item in old_search.json()["results"]
    )
    assert files_response.status_code == 200
    assert [item["path"] for item in files_response.json()["files"]] == ["new_marker.py"]


def test_deep_enrichment_replaces_shallow_inventory_with_symbols(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "auth.py").write_text(
        "def authenticate_user():\n    return True\n",
        encoding="utf-8",
    )
    (source_path / "billing.py").write_text(
        "def reconcile_invoice():\n    return True\n",
        encoding="utf-8",
    )

    shallow_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, shallow_job.id, source_path)
    assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "shallow"

    enrich_job = registry.create_job(repo.id, kind="deep_enrich")
    routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["lexical"]["index_mode"] == "deep"
    assert manifest["lexical"]["files"] == 2
    assert manifest["lexical"]["symbols"] == 2
    assert routes._repo_response(repo).lexical_index_mode == "deep"
    assert registry.get_job(enrich_job.id).status == "complete"
    assert registry.get_repo(repo.id).status == "lexical_ready"

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        stats = metadata.get_stats()
        names = {
            row["name"]
            for row in metadata.conn.execute("SELECT name FROM symbols").fetchall()
        }
        blob_count = metadata.conn.execute("SELECT COUNT(*) FROM file_blobs").fetchone()[0]
    finally:
        metadata.close()

    assert stats["by_type"] == {"function": 2}
    assert names == {"authenticate_user", "reconcile_invoice"}
    assert blob_count == 2


def test_deep_enrichment_resumes_temp_artifact_after_restart(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_BATCH_SIZE", "1")

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    auth_file = source_path / "auth.py"
    billing_file = source_path / "billing.py"
    auth_file.write_text(
        "def authenticate_user():\n    return True\n",
        encoding="utf-8",
    )
    billing_file.write_text(
        "def reconcile_invoice():\n    return True\n",
        encoding="utf-8",
    )

    shallow_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, shallow_job.id, source_path)
    assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "shallow"

    enrich_job = registry.create_job(repo.id, kind="deep_enrich")
    temp_db = Path(repo.storage_path) / f"repo.sqlite.{enrich_job.id}.tmp"
    metadata = MetadataStore(db_path=str(temp_db))
    try:
        partial_indexer = Indexer(
            embedder=None,
            vector_store=VectorStore(dimension=768),
            metadata_store=metadata,
            text_search=TextSearchEngine(),
            build_text_index=False,
        )
        partial_indexer.index_file(str(auth_file), semantic=False)
    finally:
        metadata.close()

    registry.mark_job_running(enrich_job.id, "deep_enriching")
    registry.requeue_interrupted_jobs()
    assert registry.get_job(enrich_job.id).status == "queued"

    original_index_file = Indexer.index_file

    def fail_if_auth_reindexed(self, file_path, *args, **kwargs):
        if Path(file_path).name == "auth.py":
            raise AssertionError("resumed deep enrichment should not reindex unchanged files")
        return original_index_file(self, file_path, *args, **kwargs)

    monkeypatch.setattr(Indexer, "index_file", fail_if_auth_reindexed)

    routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["lexical"]["index_mode"] == "deep"
    assert manifest["lexical"]["files"] == 2
    assert manifest["lexical"]["symbols"] == 2
    assert registry.get_job(enrich_job.id).status == "complete"
    assert registry.get_job(enrich_job.id).files_indexed == 2
    assert registry.get_job(enrich_job.id).symbols_indexed == 2
    assert not temp_db.exists()

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        names = {
            row["name"]
            for row in metadata.conn.execute("SELECT name FROM symbols").fetchall()
        }
    finally:
        metadata.close()

    assert names == {"authenticate_user", "reconcile_invoice"}


def test_deep_enrichment_yields_and_requeues_without_publishing_partial_db(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_FILES_PER_RUN", "1")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_BATCH_SIZE", "1")

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "auth.py").write_text(
        "def authenticate_user():\n    return True\n",
        encoding="utf-8",
    )
    (source_path / "billing.py").write_text(
        "def reconcile_invoice():\n    return True\n",
        encoding="utf-8",
    )

    shallow_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, shallow_job.id, source_path)
    assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "shallow"

    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    enrich_job = registry.create_job(repo.id, kind="deep_enrich")
    temp_db = Path(repo.storage_path) / f"repo.sqlite.{enrich_job.id}.tmp"

    try:
        routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

        yielded_job = registry.get_job(enrich_job.id)
        assert yielded_job.status == "queued"
        assert yielded_job.phase == "queued_deep_enrich_slice"
        assert yielded_job.files_indexed == 1
        assert registry.get_repo(repo.id).status == "deep_enrich_queued"
        assert runner.wake_count == 1
        assert temp_db.exists()

        manifest = read_repo_manifest(repo.storage_path)
        assert manifest["lexical"]["index_mode"] == "shallow"
        live_metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
        temp_metadata = MetadataStore(db_path=str(temp_db), read_only=True)
        try:
            assert live_metadata.get_stats()["by_type"] == {"file": 2}
            assert temp_metadata.get_stats()["by_type"] == {"function": 1}
        finally:
            live_metadata.close()
            temp_metadata.close()

        routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

        complete_job = registry.get_job(enrich_job.id)
        final_manifest = read_repo_manifest(repo.storage_path)
        assert complete_job.status == "complete"
        assert complete_job.files_indexed == 2
        assert complete_job.symbols_indexed == 2
        assert final_manifest["lexical"]["index_mode"] == "deep"
        assert not temp_db.exists()
    finally:
        routes.set_job_runner(None)


def test_deep_enrichment_yields_on_time_budget_between_files(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_FILES_PER_RUN", "0")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_SECONDS_PER_RUN", "0.01")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_BATCH_SIZE", "1")

    repo = registry.create_repo("time-sliced", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "auth.py").write_text(
        "def authenticate_user():\n    return True\n",
        encoding="utf-8",
    )
    (source_path / "billing.py").write_text(
        "def reconcile_invoice():\n    return True\n",
        encoding="utf-8",
    )

    shallow_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, shallow_job.id, source_path)
    assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "shallow"

    original_index_file = Indexer.index_file

    def slow_index_file(self, *args, **kwargs):
        result = original_index_file(self, *args, **kwargs)
        time.sleep(0.02)
        return result

    monkeypatch.setattr(Indexer, "index_file", slow_index_file)

    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    enrich_job = registry.create_job(repo.id, kind="deep_enrich")
    temp_db = Path(repo.storage_path) / f"repo.sqlite.{enrich_job.id}.tmp"

    try:
        routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

        yielded_job = registry.get_job(enrich_job.id)
        assert yielded_job.status == "queued"
        assert yielded_job.phase == "queued_deep_enrich_slice"
        assert yielded_job.files_indexed == 1
        assert runner.wake_count == 1
        assert temp_db.exists()
        assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "shallow"

        live_metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
        temp_metadata = MetadataStore(db_path=str(temp_db), read_only=True)
        try:
            assert live_metadata.get_stats()["by_type"] == {"file": 2}
            assert temp_metadata.get_stats()["by_type"] == {"function": 1}
        finally:
            live_metadata.close()
            temp_metadata.close()

        routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

        complete_job = registry.get_job(enrich_job.id)
        assert complete_job.status == "complete"
        assert complete_job.files_indexed == 2
        assert complete_job.symbols_indexed == 2
        assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "deep"
        assert not temp_db.exists()
    finally:
        routes.set_job_runner(None)


def test_deep_enrichment_indexes_pathological_file_with_bounded_fallback(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")
    monkeypatch.setenv("CODESNIFF_FULL_SOURCE_READ_MAX_BYTES", "4096")
    monkeypatch.setenv("CODESNIFF_SYMBOL_PARSE_MAX_BYTES", "120")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_FILES_PER_RUN", "0")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_SECONDS_PER_RUN", "0")
    monkeypatch.setenv("CODESNIFF_DEEP_ENRICH_BATCH_SIZE", "1")

    repo = registry.create_repo("pathological", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "huge.py").write_text(
        "def generated_blob():\n"
        "    return 'searchable but not parser-owned'\n"
        + "\n".join(f"VALUE_{idx} = {idx}" for idx in range(80)),
        encoding="utf-8",
    )
    (source_path / "small.py").write_text(
        "def parsed_normally():\n    return True\n",
        encoding="utf-8",
    )

    original_parse = CodeParser.parse_source_bytes

    def fail_if_huge(self, file_path, source_bytes):
        if Path(file_path).name == "huge.py":
            raise AssertionError("pathological file should use bounded fallback")
        return original_parse(self, file_path, source_bytes)

    monkeypatch.setattr(CodeParser, "parse_source_bytes", fail_if_huge)

    shallow_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, shallow_job.id, source_path)
    assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "shallow"

    enrich_job = registry.create_job(repo.id, kind="deep_enrich")
    routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

    complete_job = registry.get_job(enrich_job.id)
    assert complete_job.status == "complete"
    assert complete_job.files_indexed == 2
    assert read_repo_manifest(repo.storage_path)["lexical"]["index_mode"] == "deep"

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        rows = metadata.conn.execute(
            """
            SELECT f.path, s.name, s.symbol_type, s.code
            FROM symbols s
            JOIN files f ON f.id = s.file_id
            ORDER BY f.path, s.id
            """
        ).fetchall()
    finally:
        metadata.close()

    huge_rows = [row for row in rows if row["path"].endswith("huge.py")]
    small_rows = [row for row in rows if row["path"].endswith("small.py")]
    assert any(row["symbol_type"] == "file" and "Bounded fallback" in row["code"] for row in huge_rows)
    assert not any(row["symbol_type"] == "function" for row in huge_rows)
    assert any(row["name"] == "parsed_normally" and row["symbol_type"] == "function" for row in small_rows)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts?kind=index_fallback")

    assert overview_response.status_code == 200
    overview = overview_response.json()
    assert len(overview["index_fallbacks"]) == 1
    assert overview["index_fallbacks"][0]["path"] == "huge.py"
    assert "symbol-parse limit" in overview["index_fallbacks"][0]["reason"]
    assert "bounded indexing fallback" in " ".join(overview["warnings"])

    assert facts_response.status_code == 200
    fallback_facts = facts_response.json()["facts"]
    assert len(fallback_facts) == 1
    assert fallback_facts[0]["kind"] == "index_fallback"
    assert fallback_facts[0]["key"] == "huge.py"
    assert "symbol-parse limit" in fallback_facts[0]["value"]


def test_deep_enrichment_failure_keeps_shallow_artifact_searchable(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )
    monkeypatch.setenv("CODESNIFF_SHALLOW_FIRST_FILE_THRESHOLD", "1")

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "auth.py").write_text(
        "def authenticate_user():\n    return True\n",
        encoding="utf-8",
    )
    shallow_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, shallow_job.id, source_path)
    before_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")

    original_index_directory = Indexer.index_directory

    def fail_deep_index(self, *args, **kwargs):
        if kwargs.get("shallow") is False:
            raise RuntimeError("deep parser failed")
        return original_index_directory(self, *args, **kwargs)

    monkeypatch.setattr(Indexer, "index_directory", fail_deep_index)

    enrich_job = registry.create_job(repo.id, kind="deep_enrich")
    routes._run_repo_deep_enrichment(repo.id, enrich_job.id)

    failed = registry.get_job(enrich_job.id)
    repo_after = registry.get_repo(repo.id)
    manifest = read_repo_manifest(repo.storage_path)
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        stats = metadata.get_stats()
    finally:
        metadata.close()

    assert failed.status == "failed"
    assert failed.phase == "deep_enriching"
    assert "deep parser failed" in failed.error
    assert repo_after.status == "lexical_ready"
    assert "Deep enrichment failed" in repo_after.error_summary
    assert manifest["lexical"]["index_mode"] == "shallow"
    assert stats["by_type"] == {"file": 1}
    assert sha256_file(Path(repo.storage_path) / "repo.sqlite") == before_sha
    assert not Path(repo.storage_path, f"repo.sqlite.{enrich_job.id}.tmp").exists()


def test_fast_index_job_reports_file_progress_before_completion(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    for index in range(4):
        source_repo.joinpath(f"module_{index}.py").write_text(
            f"def symbol_{index}():\n    return {index}\n",
            encoding="utf-8",
        )

    repo = registry.create_repo("sample", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    original_update_job = registry.update_job
    progress_updates = []

    def recording_update_job(job_id, **fields):
        if "files_indexed" in fields and "status" not in fields:
            progress_updates.append((fields["files_indexed"], fields["symbols_indexed"]))
        return original_update_job(job_id, **fields)

    registry.update_job = recording_update_job

    try:
        routes._run_prepared_fast_index(repo.id, job.id, source_repo)
    finally:
        registry.update_job = original_update_job

    completed = registry.get_job(job.id)
    assert completed.status == "complete"
    assert completed.files_seen == 4
    assert completed.files_indexed == 4
    assert completed.symbols_indexed == 4
    assert progress_updates[:3] == [(1, 1), (2, 2), (3, 3)]
    assert progress_updates[-1] == (4, 4)


def test_refresh_rebuilds_lexical_db_drops_deleted_files_and_semantic_artifacts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "keep.py").write_text("def old_symbol():\n    return True\n", encoding="utf-8")
    (source_path / "deleted.py").write_text("def deleted_symbol():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
    warm_repo_semantics(repo.storage_path, embedder=FakeSemanticEmbedder())
    registry.update_repo(repo.id, status="semantic_ready")
    assert (Path(repo.storage_path) / "vector_index" / "vectors.index").exists()

    (source_path / "keep.py").write_text("def fresh_symbol():\n    return True\n", encoding="utf-8")
    (source_path / "deleted.py").unlink()
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    refreshed_repo = registry.get_repo(repo.id)
    assert refreshed_repo.status == "lexical_ready"
    assert not (Path(repo.storage_path) / "vector_index").exists()
    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["lexical"]["files"] == 1
    assert manifest["semantic"]["ready"] is False
    assert manifest["semantic"]["artifacts"] == []

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        fresh = client.post(f"/api/repos/{repo.id}/search", json={"query": "fresh symbol", "limit": 5})

    assert fresh.status_code == 200
    assert fresh.json()["total_results"] >= 1
    assert {result["symbol_name"] for result in fresh.json()["results"]} == {"fresh_symbol"}
    conn = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        names = {row["name"] for row in conn.conn.execute("SELECT name FROM symbols").fetchall()}
        paths = {Path(row["path"]).name for row in conn.conn.execute("SELECT path FROM files").fetchall()}
    finally:
        conn.close()
    assert names == {"fresh_symbol"}
    assert paths == {"keep.py"}


def test_incremental_refresh_skips_unchanged_files_and_preserves_semantic_artifacts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "auth.py").write_text("def authenticate_user():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
    warm_repo_semantics(repo.storage_path, embedder=FakeSemanticEmbedder())
    registry.update_repo(repo.id, status="semantic_ready")

    def fail_if_reindexed(self, file_path, *args, **kwargs):
        raise AssertionError(f"unchanged refresh should not reindex {file_path}")

    monkeypatch.setattr(Indexer, "index_file", fail_if_reindexed)

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    completed = registry.get_job(refresh_job.id)
    refreshed_repo = registry.get_repo(repo.id)
    manifest = read_repo_manifest(repo.storage_path)

    assert completed.status == "complete"
    assert completed.files_seen == 1
    assert completed.files_indexed == 0
    assert completed.symbols_indexed == 0
    assert refreshed_repo.status == "semantic_ready"
    assert (Path(repo.storage_path) / "vector_index" / "vectors.index").exists()
    assert manifest["semantic"]["ready"] is True
    assert manifest["lexical"]["db_files"] == 1
    assert manifest["lexical"]["db_symbols"] == 1


def test_incremental_refresh_indexes_only_changed_files_and_removes_deleted_rows(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "keep.py").write_text("def old_symbol():\n    return True\n", encoding="utf-8")
    (source_path / "same.py").write_text("def stable_symbol():\n    return True\n", encoding="utf-8")
    (source_path / "deleted.py").write_text("def deleted_symbol():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "keep.py").write_text("def fresh_symbol():\n    return True\n", encoding="utf-8")
    (source_path / "added.py").write_text("def added_symbol():\n    return True\n", encoding="utf-8")
    (source_path / "deleted.py").unlink()

    original_index_file = Indexer.index_file
    reindexed_names = []

    def recording_index_file(self, file_path, *args, **kwargs):
        reindexed_names.append(Path(file_path).name)
        return original_index_file(self, file_path, *args, **kwargs)

    monkeypatch.setattr(Indexer, "index_file", recording_index_file)

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    assert set(reindexed_names) == {"added.py", "keep.py"}

    conn = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        names = {row["name"] for row in conn.conn.execute("SELECT name FROM symbols").fetchall()}
        paths = {Path(row["path"]).name for row in conn.conn.execute("SELECT path FROM files").fetchall()}
        blob_paths = {
            Path(row["path"]).name
            for row in conn.conn.execute(
                "SELECT f.path FROM files f JOIN file_blobs b ON b.file_id = f.id"
            ).fetchall()
        }
        keep_row = conn.conn.execute(
            "SELECT id FROM files WHERE path LIKE ?",
            ("%keep.py",),
        ).fetchone()
        keep_blob = conn.get_file_blob(keep_row["id"])
    finally:
        conn.close()

    assert names == {"fresh_symbol", "stable_symbol", "added_symbol"}
    assert paths == {"keep.py", "same.py", "added.py"}
    assert blob_paths == {"keep.py", "same.py", "added.py"}
    assert b"fresh_symbol" in keep_blob["content"]
    assert b"old_symbol" not in keep_blob["content"]
    assert "deleted.py" not in paths
    assert "deleted.py" not in blob_paths
    assert "same.py" not in reindexed_names


def test_index_persists_python_and_js_import_relationships(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("imports", "upload", None)
    build_repo_index_from_files(repo, {
        "app/main.py": (
            "import os\n"
            "from collections import defaultdict\n"
            "from .services import auth as auth_service\n\n"
            "def run():\n"
            "    return defaultdict\n"
        ),
        "web/app.tsx": (
            "import React from 'react';\n"
            "import './polyfills';\n"
            "const express = require(\"express\");\n"
            "async function load() { return import('./lazy') }\n"
            "export function App() { return React.createElement('div') }\n"
        ),
    })

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        relationships = metadata.get_relationships(rel_type="imports")
    finally:
        metadata.close()

    by_target = {row["target"]: row for row in relationships}
    assert {
        "os",
        "collections",
        ".services",
        "react",
        "./polyfills",
        "express",
        "./lazy",
    }.issubset(by_target)
    assert by_target["collections"]["confidence"] == "parsed"
    assert by_target["collections"]["source_line"] == 2
    assert by_target["collections"]["metadata"]["imports"] == ["defaultdict"]
    assert by_target["react"]["confidence"] == "heuristic"
    assert by_target["react"]["source_line"] == 1
    assert all(row["src_kind"] == "file" and row["dst_kind"] == "module" for row in relationships)


def test_index_persists_common_language_import_relationships(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("common-imports", "upload", None)
    build_repo_index_from_files(repo, {
        "cmd/server.go": (
            "package main\n\n"
            "import (\n"
            "    \"context\"\n"
            "    httpalias \"net/http\"\n"
            "    \"example.com/acme/app/internal/billing\"\n"
            ")\n\n"
            "func main() { _ = context.Background(); _ = httpalias.MethodGet; _ = billing.Charge }\n"
        ),
        "internal/billing/service.go": (
            "package billing\n\n"
            "func Charge() bool { return true }\n"
        ),
        "src/main/java/example/App.java": (
            "package example;\n\n"
            "import java.util.List;\n"
            "import static java.util.Collections.emptyList;\n\n"
            "import example.LocalThing;\n\n"
            "public class App { List<String> names() { return emptyList(); } LocalThing local; }\n"
        ),
        "src/main/java/example/LocalThing.java": (
            "package example;\n\n"
            "public class LocalThing { }\n"
        ),
        "src/main/kotlin/example/Worker.kt": (
            "package example\n\n"
            "import kotlinx.coroutines.CoroutineScope\n\n"
            "import example.LocalWorker\n\n"
            "class Worker\n"
        ),
        "src/main/kotlin/example/LocalWorker.kt": (
            "package example\n\n"
            "class LocalWorker\n"
        ),
        "src/main/scala/example/ScalaWorker.scala": (
            "package example\n\n"
            "import scala.concurrent.Future\n"
            "import example.LocalScalaThing\n\n"
            "object ScalaWorker { def run(): Future[LocalScalaThing] = ??? }\n"
        ),
        "src/main/scala/example/LocalScalaThing.scala": (
            "package example\n\n"
            "case class LocalScalaThing(id: String)\n"
        ),
        "Services/Mailer.cs": (
            "using System.Net.Http;\n"
            "using Json = System.Text.Json;\n"
            "using CSharpApp.Services.JsonHelper;\n\n"
            "public class Mailer { }\n"
        ),
        "CSharpApp/Services/JsonHelper.cs": (
            "namespace CSharpApp.Services { public class JsonHelper { } }\n"
        ),
        "lib/tasks/imports.rake": (
            "require 'json'\n"
            "require_relative '../support/task_loader'\n"
            "load 'tasks/shared.rake'\n"
        ),
        "lib/support/task_loader.rb": (
            "module TaskLoader; end\n"
        ),
        "tasks/shared.rake": (
            "task :shared do; end\n"
        ),
        "app/Controller.php": (
            "<?php\n"
            "use App\\Services\\Mailer as Mailer;\n"
            "use function App\\Support\\normalize;\n"
            "require_once 'vendor/autoload.php';\n"
        ),
        "app/Services/Mailer.php": (
            "<?php\n"
            "namespace App\\Services;\n"
            "class Mailer {}\n"
        ),
        "src/lib.rs": (
            "use crate::payments::{Ledger, Invoice};\n"
            "extern crate serde;\n"
            "pub mod billing;\n"
        ),
        "src/payments.rs": (
            "pub struct Ledger;\n"
            "pub struct Invoice;\n"
        ),
        "src/billing.rs": (
            "pub fn bill() {}\n"
        ),
        "scripts/bootstrap.sh": (
            "source ./config/common.sh\n"
            ". ./lib/functions.sh\n"
        ),
        "scripts/config/common.sh": (
            "export APP_ENV=test\n"
        ),
        "scripts/lib/functions.sh": (
            "say_hi() { echo hi; }\n"
        ),
        "scripts/deploy.ps1": (
            "using module './models.psm1'\n"
            "using namespace System.Management.Automation\n"
            "Import-Module Pester\n"
            ". ./shared/common.ps1\n"
            "function Invoke-LedgerDeploy { }\n"
        ),
        "scripts/models.psm1": (
            "class DeploymentModel { [string] $Name }\n"
        ),
        "scripts/shared/common.ps1": (
            "function Write-LedgerLog { }\n"
        ),
        "lua/app.lua": (
            "local payments = require('lua.payments')\n"
            "local util = require \"lua.util\"\n"
            "return payments.capture(util.id())\n"
        ),
        "lua/payments.lua": (
            "local Payments = {}\n"
            "function Payments.capture(id) return id end\n"
            "return Payments\n"
        ),
        "lua/util.lua": (
            "local M = {}\n"
            "function M.id() return 'id' end\n"
            "return M\n"
        ),
        "lib/main.dart": (
            "import 'package:flutter/widgets.dart';\n"
            "import 'package:ledger_app/src/payments.dart';\n"
            "import 'src/widgets/card.dart' as cards;\n"
            "export 'src/api.dart';\n"
            "part 'src/generated.g.dart';\n\n"
            "class LedgerApp { }\n"
        ),
        "lib/src/payments.dart": (
            "class DartPayment { }\n"
        ),
        "lib/src/widgets/card.dart": (
            "class LedgerCard { }\n"
        ),
        "lib/src/api.dart": (
            "class LedgerApi { }\n"
        ),
        "lib/src/generated.g.dart": (
            "part of '../main.dart';\n"
        ),
        "proto/billing.proto": (
            'syntax = "proto3";\n'
            'import "proto/common/money.proto";\n'
            'import "google/protobuf/timestamp.proto";\n'
            "message BillingEvent { string id = 1; }\n"
            "service BillingService { rpc Capture (BillingEvent) returns (BillingEvent); }\n"
        ),
        "proto/common/money.proto": (
            'syntax = "proto3";\n'
            "message Money { int64 cents = 1; }\n"
        ),
        "infra/main.tf": (
            "module \"vpc\" {\n"
            "  source = \"../modules/vpc\"\n"
            "}\n"
        ),
        "infra/terragrunt.hcl": (
            "terraform {\n"
            "  source = \"../modules/app\"\n"
            "}\n"
        ),
        "modules/vpc/main.tf": (
            "variable \"name\" { default = \"vpc\" }\n"
        ),
        "modules/app/main.tf": (
            "resource \"null_resource\" \"app\" {}\n"
        ),
        "ios/App.swift": (
            "import Foundation\n"
            "@testable import LedgerCore\n\n"
            "struct LedgerView { }\n"
        ),
    })

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        relationships = metadata.get_relationships(rel_type="imports", limit=100)
    finally:
        metadata.close()

    edges = {
        (row["metadata"].get("source_path"), row["target"], row["metadata"].get("syntax"), row["source_line"])
        for row in relationships
    }
    assert ("cmd/server.go", "context", "go-import-block", 4) in edges
    assert ("cmd/server.go", "net/http", "go-import-block", 5) in edges
    assert ("cmd/server.go", "example.com/acme/app/internal/billing", "go-import-block", 6) in edges
    assert ("src/main/java/example/App.java", "java.util.List", "jvm-import", 3) in edges
    assert ("src/main/java/example/App.java", "java.util.Collections.emptyList", "jvm-import", 4) in edges
    assert ("src/main/java/example/App.java", "example.LocalThing", "jvm-import", 6) in edges
    assert ("src/main/kotlin/example/Worker.kt", "kotlinx.coroutines.CoroutineScope", "jvm-import", 3) in edges
    assert ("src/main/kotlin/example/Worker.kt", "example.LocalWorker", "jvm-import", 5) in edges
    assert ("src/main/scala/example/ScalaWorker.scala", "scala.concurrent.Future", "scala-import", 3) in edges
    assert ("src/main/scala/example/ScalaWorker.scala", "example.LocalScalaThing", "scala-import", 4) in edges
    assert ("Services/Mailer.cs", "System.Net.Http", "csharp-using", 1) in edges
    assert ("Services/Mailer.cs", "System.Text.Json", "csharp-using", 2) in edges
    assert ("Services/Mailer.cs", "CSharpApp.Services.JsonHelper", "csharp-using", 3) in edges
    assert ("lib/tasks/imports.rake", "json", "ruby-require", 1) in edges
    assert ("lib/tasks/imports.rake", "../support/task_loader", "ruby-require", 2) in edges
    assert ("lib/tasks/imports.rake", "tasks/shared.rake", "ruby-load", 3) in edges
    assert ("app/Controller.php", "App\\Services\\Mailer", "php-use", 2) in edges
    assert ("app/Controller.php", "App\\Support\\normalize", "php-use", 3) in edges
    assert ("app/Controller.php", "vendor/autoload.php", "php-include", 4) in edges
    assert ("src/lib.rs", "crate::payments::{Ledger, Invoice}", "rust-use", 1) in edges
    assert ("src/lib.rs", "serde", "rust-extern-crate", 2) in edges
    assert ("src/lib.rs", "billing", "rust-mod", 3) in edges
    assert ("scripts/bootstrap.sh", "./config/common.sh", "shell-source", 1) in edges
    assert ("scripts/bootstrap.sh", "./lib/functions.sh", "shell-dot-source", 2) in edges
    assert ("scripts/deploy.ps1", "./models.psm1", "powershell-using-module", 1) in edges
    assert ("scripts/deploy.ps1", "System.Management.Automation", "powershell-using-namespace", 2) in edges
    assert ("scripts/deploy.ps1", "Pester", "powershell-import-module", 3) in edges
    assert ("scripts/deploy.ps1", "./shared/common.ps1", "powershell-dot-source", 4) in edges
    assert ("lua/app.lua", "lua.payments", "lua-require", 1) in edges
    assert ("lua/app.lua", "lua.util", "lua-require", 2) in edges
    assert ("lib/main.dart", "package:flutter/widgets.dart", "dart-import", 1) in edges
    assert ("lib/main.dart", "package:ledger_app/src/payments.dart", "dart-import", 2) in edges
    assert ("lib/main.dart", "src/widgets/card.dart", "dart-import", 3) in edges
    assert ("lib/main.dart", "src/api.dart", "dart-export", 4) in edges
    assert ("lib/main.dart", "src/generated.g.dart", "dart-part", 5) in edges
    assert ("proto/billing.proto", "proto/common/money.proto", "proto-import", 2) in edges
    assert ("proto/billing.proto", "google/protobuf/timestamp.proto", "proto-import", 3) in edges
    assert ("infra/main.tf", "../modules/vpc", "terraform-module-source", 2) in edges
    assert ("infra/terragrunt.hcl", "../modules/app", "hcl-source", 2) in edges
    assert ("ios/App.swift", "Foundation", "swift-import", 1) in edges
    assert ("ios/App.swift", "LedgerCore", "swift-import", 2) in edges

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")
        relationships_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "imports", "limit": 100},
        )

    assert response.status_code == 200
    overview_edges = {
        (item["source_path"], item["target"], item["syntax"], item.get("target_path"))
        for item in response.json()["import_relationships"]
    }
    assert ("cmd/server.go", "net/http", "go-import-block", None) in overview_edges
    assert ("cmd/server.go", "example.com/acme/app/internal/billing", "go-import-block", "internal/billing/service.go") in overview_edges
    assert ("src/main/java/example/App.java", "example.LocalThing", "jvm-import", "src/main/java/example/LocalThing.java") in overview_edges
    assert ("src/main/kotlin/example/Worker.kt", "example.LocalWorker", "jvm-import", "src/main/kotlin/example/LocalWorker.kt") in overview_edges
    assert ("src/main/scala/example/ScalaWorker.scala", "example.LocalScalaThing", "scala-import", "src/main/scala/example/LocalScalaThing.scala") in overview_edges
    assert ("Services/Mailer.cs", "System.Text.Json", "csharp-using", None) in overview_edges
    assert ("Services/Mailer.cs", "CSharpApp.Services.JsonHelper", "csharp-using", "CSharpApp/Services/JsonHelper.cs") in overview_edges
    assert ("lib/tasks/imports.rake", "../support/task_loader", "ruby-require", "lib/support/task_loader.rb") in overview_edges
    assert ("app/Controller.php", "App\\Services\\Mailer", "php-use", "app/Services/Mailer.php") in overview_edges
    assert ("src/lib.rs", "crate::payments::{Ledger, Invoice}", "rust-use", "src/payments.rs") in overview_edges
    assert ("src/lib.rs", "billing", "rust-mod", "src/billing.rs") in overview_edges
    assert ("scripts/bootstrap.sh", "./config/common.sh", "shell-source", "scripts/config/common.sh") in overview_edges
    assert ("scripts/bootstrap.sh", "./lib/functions.sh", "shell-dot-source", "scripts/lib/functions.sh") in overview_edges
    assert ("scripts/deploy.ps1", "./models.psm1", "powershell-using-module", "scripts/models.psm1") in overview_edges
    assert ("scripts/deploy.ps1", "System.Management.Automation", "powershell-using-namespace", None) in overview_edges
    assert ("scripts/deploy.ps1", "Pester", "powershell-import-module", None) in overview_edges
    assert ("scripts/deploy.ps1", "./shared/common.ps1", "powershell-dot-source", "scripts/shared/common.ps1") in overview_edges
    assert ("lua/app.lua", "lua.payments", "lua-require", "lua/payments.lua") in overview_edges
    assert ("lua/app.lua", "lua.util", "lua-require", "lua/util.lua") in overview_edges
    assert ("lib/main.dart", "package:flutter/widgets.dart", "dart-import", None) in overview_edges
    assert ("lib/main.dart", "package:ledger_app/src/payments.dart", "dart-import", "lib/src/payments.dart") in overview_edges
    assert ("lib/main.dart", "src/widgets/card.dart", "dart-import", "lib/src/widgets/card.dart") in overview_edges
    assert ("lib/main.dart", "src/api.dart", "dart-export", "lib/src/api.dart") in overview_edges
    assert ("lib/main.dart", "src/generated.g.dart", "dart-part", "lib/src/generated.g.dart") in overview_edges
    assert ("proto/billing.proto", "proto/common/money.proto", "proto-import", "proto/common/money.proto") in overview_edges
    assert ("proto/billing.proto", "google/protobuf/timestamp.proto", "proto-import", None) in overview_edges
    assert ("infra/main.tf", "../modules/vpc", "terraform-module-source", "modules/vpc/main.tf") in overview_edges
    assert ("infra/terragrunt.hcl", "../modules/app", "hcl-source", "modules/app/main.tf") in overview_edges
    assert ("ios/App.swift", "Foundation", "swift-import", None) in overview_edges
    assert ("ios/App.swift", "LedgerCore", "swift-import", None) in overview_edges

    assert relationships_response.status_code == 200
    relationship_edges = {
        (item["source_path"], item["target"], item["metadata"].get("target_path"))
        for item in relationships_response.json()["relationships"]
    }
    assert ("cmd/server.go", "example.com/acme/app/internal/billing", "internal/billing/service.go") in relationship_edges
    assert ("src/main/scala/example/ScalaWorker.scala", "example.LocalScalaThing", "src/main/scala/example/LocalScalaThing.scala") in relationship_edges
    assert ("lua/app.lua", "lua.payments", "lua/payments.lua") in relationship_edges
    assert ("app/Controller.php", "App\\Services\\Mailer", "app/Services/Mailer.php") in relationship_edges
    assert ("scripts/bootstrap.sh", "./lib/functions.sh", "scripts/lib/functions.sh") in relationship_edges
    assert ("scripts/deploy.ps1", "./models.psm1", "scripts/models.psm1") in relationship_edges
    assert ("scripts/deploy.ps1", "./shared/common.ps1", "scripts/shared/common.ps1") in relationship_edges
    assert ("ios/App.swift", "LedgerCore", None) in relationship_edges
    assert ("lib/main.dart", "package:ledger_app/src/payments.dart", "lib/src/payments.dart") in relationship_edges
    assert ("lib/main.dart", "src/widgets/card.dart", "lib/src/widgets/card.dart") in relationship_edges
    assert ("proto/billing.proto", "proto/common/money.proto", "proto/common/money.proto") in relationship_edges
    assert ("infra/main.tf", "../modules/vpc", "modules/vpc/main.tf") in relationship_edges
    assert ("infra/terragrunt.hcl", "../modules/app", "modules/app/main.tf") in relationship_edges


def test_reindexing_same_file_replaces_import_relationships(tmp_path):
    source = tmp_path / "src"
    source.mkdir()
    code_path = source / "module.py"
    code_path.write_text(
        "import old_dependency\n\n"
        "def marker():\n"
        "    return True\n",
        encoding="utf-8",
    )
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    indexer = Indexer(
        embedder=ExplodingEmbedder(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
    )

    indexer.index_directory(str(source), show_progress=False, semantic=False)
    code_path.write_text(
        "import new_dependency\n\n"
        "def marker():\n"
        "    return True\n",
        encoding="utf-8",
    )
    indexer.index_directory(str(source), show_progress=False, semantic=False)

    targets = {
        row["target"]
        for row in metadata.get_relationships(rel_type="imports")
    }
    assert targets == {"new_dependency"}


def test_incremental_refresh_updates_import_relationships_for_changed_and_deleted_files(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("sample", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "keep.py").write_text(
        "import old_dependency\n\n"
        "def keep():\n"
        "    return True\n",
        encoding="utf-8",
    )
    (source_path / "same.py").write_text(
        "import stable_dependency\n\n"
        "def stable():\n"
        "    return True\n",
        encoding="utf-8",
    )
    (source_path / "deleted.py").write_text(
        "import deleted_dependency\n\n"
        "def deleted():\n"
        "    return True\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "keep.py").write_text(
        "import fresh_dependency\n\n"
        "def keep():\n"
        "    return True\n",
        encoding="utf-8",
    )
    (source_path / "added.py").write_text(
        "import added_dependency\n\n"
        "def added():\n"
        "    return True\n",
        encoding="utf-8",
    )
    (source_path / "deleted.py").unlink()

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        targets = {
            row["target"]
            for row in metadata.get_relationships(rel_type="imports")
        }
    finally:
        metadata.close()

    assert {"fresh_dependency", "stable_dependency", "added_dependency"}.issubset(targets)
    assert "old_dependency" not in targets
    assert "deleted_dependency" not in targets


def test_github_refresh_reclones_source_and_indexes_final_source_path(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "old.py").write_text("def old_symbol():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
    registry.update_repo(repo.id, status="lexical_ready")

    new_source = tmp_path / "new_source"
    new_source.mkdir()
    (new_source / "new.py").write_text("def new_symbol():\n    return True\n", encoding="utf-8")

    def fake_clone(repo_url: str, target_dir: str | None = None):
        shutil.copytree(new_source, Path(target_dir))
        return str(target_dir)

    monkeypatch.setattr("app.utils.github_clone.clone_github_repo", fake_clone)

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    assert registry.get_repo(repo.id).status == "lexical_ready"
    assert not (source_path / "old.py").exists()
    assert (source_path / "new.py").exists()

    conn = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        paths = [row["path"] for row in conn.conn.execute("SELECT path FROM files").fetchall()]
    finally:
        conn.close()

    assert len(paths) == 1
    assert Path(paths[0]).parts[-2:] == ("source", "new.py")
    assert "source.refresh" not in paths[0]


def test_github_refresh_failure_restores_previous_source_and_lexical_artifact(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "old.py").write_text("def old_symbol():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
    registry.update_repo(repo.id, status="lexical_ready")

    new_source = tmp_path / "new_source"
    new_source.mkdir()
    (new_source / "new.py").write_text("def new_symbol():\n    return True\n", encoding="utf-8")

    def fake_clone(repo_url: str, target_dir: str | None = None):
        shutil.copytree(new_source, Path(target_dir))
        return str(target_dir)

    def failing_clean(repo_path: str):
        raise RuntimeError("clean failed")

    monkeypatch.setattr("app.utils.github_clone.clone_github_repo", fake_clone)
    monkeypatch.setattr("app.utils.github_clone.clean_repository", failing_clean)

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "failed"
    assert (source_path / "old.py").exists()
    assert not (source_path / "new.py").exists()

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")
    with TestClient(app) as client:
        old = client.post(f"/api/repos/{repo.id}/search", json={"query": "old symbol", "limit": 5})

    assert old.status_code == 200
    assert old.json()["total_results"] >= 1
    conn = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        names = {row["name"] for row in conn.conn.execute("SELECT name FROM symbols").fetchall()}
        paths = {Path(row["path"]).name for row in conn.conn.execute("SELECT path FROM files").fetchall()}
    finally:
        conn.close()
    assert names == {"old_symbol"}
    assert paths == {"old.py"}


def test_repo_response_marks_lexical_manifest_mismatch_degraded(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    source_repo.joinpath("auth.py").write_text(
        "def authenticate_user(username, password):\n"
        "    return username and password\n",
        encoding="utf-8",
    )

    def fake_clean(repo_path: str):
        return {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0}

    monkeypatch.setattr("app.utils.github_clone.clean_repository", fake_clean)

    repo = registry.create_repo("sample", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    manifest = read_repo_manifest(repo.storage_path)
    manifest["artifacts"]["repo.sqlite"]["sha256"] = "0" * 64
    write_manifest(repo, manifest)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get("/api/repos")
        search = client.post(
            f"/api/repos/{repo.id}/search",
            json={"query": "authenticate user", "limit": 5},
        )

    assert response.status_code == 200
    body = response.json()[0]
    assert body["artifact_health"] == "degraded"
    assert body["lexical_ready"] is False
    assert "repo.sqlite checksum changed" in body["artifact_warnings"]
    assert search.status_code == 200
    assert search.json()["results"][0]["symbol_name"] == "authenticate_user"


def test_active_repo_activation_does_not_mutate_manifested_sqlite(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    source_repo.joinpath("auth.py").write_text(
        "def authenticate_user(username, password):\n"
        "    return username and password\n",
        encoding="utf-8",
    )

    def fake_clean(repo_path: str):
        return {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0}

    monkeypatch.setattr("app.utils.github_clone.clean_repository", fake_clean)

    repo = registry.create_repo("sample", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)
    manifest = read_repo_manifest(repo.storage_path)
    before_sha = manifest["artifacts"]["repo.sqlite"]["sha256"]

    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=1)
    files = manager.list_files(registry.get_repo(repo.id))
    manager.close_all()

    assert files[0]["path"].endswith("auth.py")
    assert sha256_file(Path(repo.storage_path) / "repo.sqlite") == before_sha


def test_active_repo_manager_reuses_handles_and_lru_evicts(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    first = registry.create_repo("first", "github", "https://github.com/example/first")
    second = registry.create_repo("second", "github", "https://github.com/example/second")
    build_repo_index(first)
    build_repo_index(second, code="def connect_database(host):\n    return host\n")

    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=1)

    first_handle = manager.activate(first)
    same_first_handle = manager.activate(first)

    assert same_first_handle is first_handle
    assert manager.get_stats()["active_repo_ids"] == [first.id]
    assert registry.get_repo(first.id).last_opened_at is not None

    second_handle = manager.activate(second)

    assert second_handle.repo_id == second.id
    assert manager.get_stats()["active_repo_ids"] == [second.id]
    assert manager.get_handle(first.id) is None
    assert first_handle.metadata_store.conn is None


def test_repo_files_endpoint_activates_cold_repo(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)

    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo, filename="README.md", code="# Runbook\n\nUse redis recovery steps.\n")
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/files")
        active = client.get("/api/repos/active")

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total_files"] == 1
    assert body["files"][0]["path"].endswith("README.md")
    assert active.status_code == 200
    assert active.json()["active_repo_ids"] == [repo.id]


def test_repo_file_endpoint_returns_source_and_symbol_outline(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)

    repo = registry.create_repo("browser", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "src/auth.py": (
                "class Session:\n"
                "    pass\n\n"
                "def authenticate_user(username, password):\n"
                "    return Session()\n"
            ),
            "README.md": "# Browser\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    before_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        files_response = client.get(f"/api/repos/{repo.id}/files")
        file_response = client.get(f"/api/repos/{repo.id}/file", params={"path": "src/auth.py"})
        traversal_response = client.get(f"/api/repos/{repo.id}/file", params={"path": "../repo.sqlite"})
        absolute_response = client.get(f"/api/repos/{repo.id}/file", params={"path": "/src/auth.py"})

    after_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")
    assert files_response.status_code == 200
    assert {item["path"] for item in files_response.json()["files"]} == {"README.md", "src/auth.py"}
    assert file_response.status_code == 200
    body = file_response.json()
    assert body["repo_id"] == repo.id
    assert body["file"]["path"] == "src/auth.py"
    assert "def authenticate_user" in body["content"]
    assert body["size_bytes"] > 0
    assert {
        (symbol["name"], symbol["symbol_type"], symbol["start_line"])
        for symbol in body["symbols"]
    } >= {
        ("Session", "class", 1),
        ("authenticate_user", "function", 4),
    }
    assert traversal_response.status_code == 400
    assert absolute_response.status_code == 400
    assert before_sha == after_sha


def test_repo_file_endpoint_uses_blob_when_source_snapshot_is_missing(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)

    repo = registry.create_repo("source-pruned", "upload", None)
    build_repo_index_from_files(
        repo,
        {"src/main.py": "def main():\n    return True\n"},
    )
    registry.update_repo(repo.id, status="lexical_ready")
    shutil.rmtree(Path(repo.storage_path) / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/file", params={"path": "src/main.py"})

    assert response.status_code == 200
    body = response.json()
    assert body["file"]["path"] == "src/main.py"
    assert "def main" in body["content"]
    assert {
        (symbol["name"], symbol["symbol_type"], symbol["start_line"])
        for symbol in body["symbols"]
    } == {("main", "function", 1)}


def test_repo_file_endpoint_reports_missing_source_snapshot_for_legacy_db_without_blob(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)

    repo = registry.create_repo("legacy-source-pruned", "upload", None)
    build_repo_index_from_files(
        repo,
        {"src/main.py": "def main():\n    return True\n"},
    )
    registry.update_repo(repo.id, status="lexical_ready")
    db_path = Path(repo.storage_path) / "repo.sqlite"
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("DELETE FROM file_blobs")
        conn.commit()
    finally:
        conn.close()
    shutil.rmtree(Path(repo.storage_path) / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/file", params={"path": "src/main.py"})

    assert response.status_code == 409
    assert "Source snapshot" in response.json()["detail"]


def test_repo_overview_endpoint_extracts_repo_intelligence(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": "# Sample\n\nRun the API with npm scripts.\n",
            "package.json": json.dumps({
                "scripts": {
                    "dev": "vite --host 0.0.0.0",
                    "test": "vitest run"
                }
            }),
            "schema.graphql": "type Query { accountLedger: String }\n",
            "proto/events.proto": "message AccountEvent { string id = 1; }\n",
            "infra/policy.hcl": "boundary = \"repo-overview\"\n",
            "pyproject.toml": "[project]\nname = 'sample'\n",
            "src/main.py": "import fastapi\nfrom .services import auth\n\ndef start_api():\n    return True\n",
            "src/auth/service.py": "from .models import Account\n\ndef authenticate_user(token):\n    return Account(token)\n",
            "src/auth/models.py": "class Account:\n    def __init__(self, token):\n        self.token = token\n",
            "packages/api/index.ts": "export function listAccounts() { return [] }\n",
            "tests/test_api.py": "def test_start_api():\n    assert True\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total_files"] == 11
    assert body["symbol_types"]["function"] >= 3
    assert {item["language"] for item in body["languages"]} >= {
        "Python",
        "JSON",
        "Markdown",
        "TOML",
        "GraphQL",
        "Protocol Buffers",
        "HCL",
        "TypeScript",
    }
    languages_by_name = {item["language"]: item for item in body["languages"]}
    assert languages_by_name["Python"]["support_level"] == "symbol-aware"
    assert languages_by_name["Python"]["symbol_aware"] is True
    assert languages_by_name["GraphQL"]["support_level"] == "symbol-aware"
    assert languages_by_name["GraphQL"]["symbol_aware"] is True
    assert languages_by_name["GraphQL"]["searchable"] is True
    assert {item["path"] for item in body["docs"]} == {"README.md"}
    assert {item["path"] for item in body["tests"]} == {"tests/test_api.py"}
    assert {item["path"] for item in body["entry_points"]} >= {"src/main.py", "packages/api/index.ts"}
    assert {item["path"] for item in body["configs"]} >= {"package.json", "pyproject.toml"}
    assert {script["name"] for script in body["package_scripts"]} == {"dev", "test"}
    assert body["top_directories"][0]["path"] in {"(root)", "src", "tests"}
    modules_by_path = {item["path"]: item for item in body["modules"]}
    assert {"src", "src/auth", "packages/api"}.issubset(modules_by_path)
    assert modules_by_path["src/auth"]["file_count"] == 2
    assert modules_by_path["src/auth"]["symbol_count"] >= 2
    assert modules_by_path["src/auth"]["languages"] == ["Python"]
    assert set(modules_by_path["src/auth"]["sample_files"]) == {"src/auth/service.py", "src/auth/models.py"}
    assert modules_by_path["packages/api"]["sample_files"] == ["packages/api/index.ts"]
    assert {symbol["name"] for symbol in body["top_symbols"]} >= {"start_api", "test_start_api"}
    imports = {
        (item["source_path"], item["target"], item["source_line"], item["confidence"])
        for item in body["import_relationships"]
    }
    assert ("src/main.py", "fastapi", 1, "parsed") in imports
    assert ("src/main.py", ".services", 2, "parsed") in imports


def test_language_support_matrix_is_backed_by_cold_fixtures(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("language-matrix", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "src/auth.py": (
                "def python_language_matrix_auth():\n"
                "    return 'pylangalpha'\n"
            ),
            "web/router.ts": (
                "export function typescriptLanguageMatrixRouter() {\n"
                "  return 'tslangbeta';\n"
                "}\n"
            ),
            "server/JavaLanguageMatrixService.java": (
                "public class JavaLanguageMatrixService {\n"
                "  public String javaLanguageMatrixToken() { return \"javalanggamma\"; }\n"
                "}\n"
            ),
            "server/CsharpLanguageMatrixService.cs": (
                "public class CsharpLanguageMatrixService {\n"
                "  public string CsharpLanguageMatrixToken() { return \"csharplangdelta\"; }\n"
                "}\n"
            ),
            "cmd/worker.go": (
                "package main\n"
                "func GoLanguageMatrixWorker() string { return \"golangepsilon\" }\n"
            ),
            "crates/lib.rs": (
                "pub fn rust_language_matrix_worker() -> &'static str { \"rustlangzeta\" }\n"
            ),
            "jobs/language_matrix_job.rb": (
                "def ruby_language_matrix_job\n"
                "  'rubylangeta'\n"
                "end\n"
            ),
            "app/Controller.php": (
                "<?php\n"
                "function phpLanguageMatrixController() { return 'phplangtheta'; }\n"
            ),
            "db/schema.sql": (
                "CREATE TABLE language_matrix_invoices (\n"
                "  id integer primary key,\n"
                "  sqllangiota text\n"
                ");\n"
            ),
            "ios/App.swift": (
                "import SwiftUI\n"
                "/// Matrix Swift fixture.\n"
                "struct SwiftLanguageMatrixView {\n"
                "  let swiftLanguageMatrixToken = \"swiftlangkappa\"\n"
                "}\n"
            ),
            "flutter/lib/main.dart": (
                "import 'package:flutter/widgets.dart';\n"
                "/// Matrix Dart fixture.\n"
                "class DartLanguageMatrixApp extends StatelessWidget {\n"
                "  final dartLanguageMatrixToken = 'dartlanglambda';\n"
                "  Widget build(BuildContext context) => const Text('dart');\n"
                "}\n"
            ),
            "components/Checkout.vue": (
                "<template><section>vuelanglambda</section></template>\n"
                "<script setup>const vueLanguageMatrixToken = 'checkout'</script>\n"
            ),
            "infra/main.tf": (
                "variable \"terraform_language_matrix_token\" {\n"
                "  default = \"terraformlangmu\"\n"
                "}\n"
            ),
            "jvm/Payments.scala": (
                "package billing\n"
                "case class ScalaLanguageMatrixPayment(id: String)\n"
                "object ScalaLanguageMatrixRoutes {\n"
                "  def token: String = \"scalalangnu2\"\n"
                "}\n"
            ),
            "jvm/build.sc": (
                "def scalaScriptLanguageMatrixToken = \"scalascriptlangxi2\"\n"
            ),
            "stats/cohort.R": (
                "cohort_token <- \"rlangnu\"\n"
                "print(cohort_token)\n"
            ),
            "scripts/report.lua": (
                "local LuaLanguageMatrix = {}\n"
                "function LuaLanguageMatrix.token()\n"
                "  return \"lualangxi\"\n"
                "end\n"
                "return LuaLanguageMatrix\n"
            ),
            "scripts/transform.pl": (
                "my $perl_language_matrix_token = 'perllangomicron';\n"
                "print $perl_language_matrix_token;\n"
            ),
            "lib/CachePolicy.pm": (
                "package CachePolicy;\n"
                "our $PERL_MODULE_LANGUAGE_MATRIX_TOKEN = 'perlmodulelangpi';\n"
                "1;\n"
            ),
            "lib/router.ex": (
                "defmodule LanguageMatrix.Router do\n"
                "  def token, do: \"elixirlangrho\"\n"
                "end\n"
            ),
            "lib/mix_task.exs": (
                "defmodule Mix.Tasks.LanguageMatrix do\n"
                "  def run(_), do: IO.puts(\"elixirscripttau\")\n"
                "end\n"
            ),
            "src/server.erl": (
                "-module(server).\n"
                "-export([token/0]).\n"
                "token() -> \"erlangupsilon\".\n"
            ),
            "include/session.hrl": (
                "-define(LANGUAGE_MATRIX_HEADER_TOKEN, \"erlangheaderphi\").\n"
            ),
            "native/AlarmBridge.m": (
                "@interface AlarmBridge\n"
                "- (NSString *)token;\n"
                "@end\n"
                "@implementation AlarmBridge\n"
                "- (NSString *)token { return @\"objclangchi\"; }\n"
                "@end\n"
            ),
            "native/AlarmBridge.mm": (
                "#include <string>\n"
                "std::string objectiveCppLanguageMatrixToken() { return \"objcpplangpsi\"; }\n"
            ),
            "build.gradle": (
                "tasks.register('languageMatrix') {\n"
                "  ext.languageMatrixToken = 'gradlelangomega'\n"
                "}\n"
            ),
            "notebooks/analysis.jl": (
                "julia_language_matrix_token = \"julialangalpha2\"\n"
            ),
            "dotnet/Rules.fs": (
                "module Rules\n"
                "let fsharpLanguageMatrixToken = \"fsharplangbeta2\"\n"
            ),
            "lisp/core.clj": (
                "(ns language-matrix.core)\n"
                "(def clojure-language-matrix-token \"clojurelanggamma2\")\n"
            ),
            "tools/allocator.zig": (
                "const zig_language_matrix_token = \"ziglangdelta2\";\n"
            ),
            "ops/deploy.ps1": (
                "$PowerShellLanguageMatrixToken = \"powershelllangepsilon2\"\n"
            ),
            "contracts/payments.graphql": (
                "# Matrix GraphQL fixture.\n"
                "type Payment { graphqlLanguageMatrixToken: String }\n"
                "query GraphqlLanguageMatrixQuery { payment { graphqlLanguageMatrixToken } }\n"
            ),
            "proto/billing.proto": (
                "syntax = \"proto3\";\n"
                "message BillingLanguageMatrix { string protobuf_language_matrix_token = 1; }\n"
            ),
            "db/schema.prisma": (
                "model LanguageMatrixPrisma {\n"
                "  id Int @id\n"
                "  prismalanguagezeta2 String\n"
                "}\n"
            ),
            "infra/service.hcl": (
                "service = \"hcllanguageeta2\"\n"
            ),
            "Dockerfile": (
                "FROM python:3.11-slim\n"
                "ENV DOCKERLANGTHETA2=1\n"
            ),
            "Makefile": (
                "language-matrix:\n"
                "\t@echo makelangiota2\n"
            ),
            "Justfile": (
                "language-matrix:\n"
                "    echo justlangkappa2\n"
            ),
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_db = Path(repo.storage_path) / "repo.sqlite"
    source_dir = Path(repo.storage_path) / "source"
    persist_repo_overview(repo.id, repo_db, source_dir)
    shutil.rmtree(source_dir)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")

    assert response.status_code == 200
    body = response.json()
    assert body["total_files"] == 38
    languages = {item["language"]: item for item in body["languages"]}
    expected_support = {
        "Python": "symbol-aware",
        "TypeScript": "symbol-aware",
        "Java": "symbol-aware",
        "C#": "symbol-aware",
        "Go": "symbol-aware",
        "Rust": "symbol-aware",
        "Ruby": "symbol-aware",
        "PHP": "symbol-aware",
        "SQL": "symbol-aware",
        "Swift": "symbol-aware",
        "Dart": "symbol-aware",
        "Vue": "searchable",
        "Terraform": "symbol-aware",
        "Scala": "symbol-aware",
        "R": "searchable",
        "Lua": "symbol-aware",
        "Perl": "searchable",
        "Elixir": "searchable",
        "Erlang": "searchable",
        "Objective-C/MATLAB": "searchable",
        "Objective-C++": "searchable",
        "Gradle": "searchable",
        "Julia": "searchable",
        "F#": "searchable",
        "Clojure": "searchable",
        "Zig": "searchable",
        "PowerShell": "symbol-aware",
        "GraphQL": "symbol-aware",
        "Protocol Buffers": "symbol-aware",
        "Prisma": "searchable",
        "HCL": "symbol-aware",
        "Dockerfile": "searchable",
        "Makefile": "searchable",
        "Just": "searchable",
    }
    missing_languages = set(expected_support) - set(languages)
    assert not missing_languages, f"missing languages: {sorted(missing_languages)}; got {sorted(languages)}"
    for language, support_level in expected_support.items():
        assert languages[language]["support_level"] == support_level
        assert languages[language]["searchable"] is True
        assert languages[language]["symbol_aware"] is (support_level == "symbol-aware")

    metadata = MetadataStore(db_path=str(repo_db), read_only=True)
    cold_search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=VectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )
    try:
        search_cases = [
            ("pylangalpha", "src/auth.py", "python"),
            ("tslangbeta", "web/router.ts", "typescript"),
            ("javalanggamma", "server/JavaLanguageMatrixService.java", "java"),
            ("csharplangdelta", "server/CsharpLanguageMatrixService.cs", "csharp"),
            ("golangepsilon", "cmd/worker.go", "go"),
            ("rustlangzeta", "crates/lib.rs", "rust"),
            ("rubylangeta", "jobs/language_matrix_job.rb", "ruby"),
            ("phplangtheta", "app/Controller.php", "php"),
            ("sqllangiota", "db/schema.sql", "sql"),
            ("swiftlangkappa", "ios/App.swift", "swift"),
            ("dartlanglambda", "flutter/lib/main.dart", "dart"),
            ("vuelanglambda", "components/Checkout.vue", "vue"),
            ("terraformlangmu", "infra/main.tf", "terraform"),
            ("scalalangnu2", "jvm/Payments.scala", "scala"),
            ("scalascriptlangxi2", "jvm/build.sc", "scala"),
            ("rlangnu", "stats/cohort.R", "r"),
            ("lualangxi", "scripts/report.lua", "lua"),
            ("perllangomicron", "scripts/transform.pl", "perl"),
            ("perlmodulelangpi", "lib/CachePolicy.pm", "perl"),
            ("elixirlangrho", "lib/router.ex", "elixir"),
            ("elixirscripttau", "lib/mix_task.exs", "elixir"),
            ("erlangupsilon", "src/server.erl", "erlang"),
            ("erlangheaderphi", "include/session.hrl", "erlang"),
            ("objclangchi", "native/AlarmBridge.m", "objective-c"),
            ("objclangchi", "native/AlarmBridge.m", "matlab"),
            ("objcpplangpsi", "native/AlarmBridge.mm", "objective-c++"),
            ("gradlelangomega", "build.gradle", "gradle"),
            ("julialangalpha2", "notebooks/analysis.jl", "julia"),
            ("fsharplangbeta2", "dotnet/Rules.fs", "fsharp"),
            ("clojurelanggamma2", "lisp/core.clj", "clojure"),
            ("ziglangdelta2", "tools/allocator.zig", "zig"),
            ("powershelllangepsilon2", "ops/deploy.ps1", "powershell"),
            ("graphqlLanguageMatrixToken", "contracts/payments.graphql", "graphql"),
            ("protobuf_language_matrix_token", "proto/billing.proto", "protobuf"),
            ("prismalanguagezeta2", "db/schema.prisma", "prisma"),
            ("hcllanguageeta2", "infra/service.hcl", "hcl"),
            ("DOCKERLANGTHETA2", "Dockerfile", "dockerfile"),
            ("makelangiota2", "Makefile", "makefile"),
            ("justlangkappa2", "Justfile", "just"),
        ]
        for query, expected_path, language in search_cases:
            results = cold_search.search(query, limit=3, language_filter=[language])
            assert results, f"expected {language} result for {query}"
            result_path = Path(results[0].file_path).as_posix()
            assert result_path.endswith(expected_path)
    finally:
        metadata.close()


def test_language_filter_includes_extensionless_project_files(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("extensionless-language-files", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "Rakefile": (
                "task :language_matrix do\n"
                "  puts 'rakelanglambda2'\n"
                "end\n"
            ),
            "Justfile": (
                "language-matrix:\n"
                "    echo justlangmu2\n"
            ),
            "Dockerfile": (
                "FROM alpine:3.20\n"
                "ENV DOCKERLANGNU2=1\n"
            ),
            "Makefile": (
                "language-matrix:\n"
                "\t@echo makelangxi2\n"
            ),
        },
    )

    repo_db = Path(repo.storage_path) / "repo.sqlite"
    metadata = MetadataStore(db_path=str(repo_db), read_only=True)
    cold_search = SearchEngine(
        embedder=ExplodingEmbedder(),
        vector_store=VectorStore(),
        metadata_store=metadata,
        text_search=TextSearchEngine(),
        build_text_index=False,
    )
    try:
        search_cases = [
            ("rakelanglambda2", "Rakefile", "ruby"),
            ("justlangmu2", "Justfile", "just"),
            ("DOCKERLANGNU2", "Dockerfile", "dockerfile"),
            ("makelangxi2", "Makefile", "makefile"),
        ]
        for query, expected_path, language in search_cases:
            results = cold_search.search(query, limit=3, language_filter=[language])
            assert results, f"expected {language} result for {query}"
            assert Path(results[0].file_path).as_posix().endswith(expected_path)
    finally:
        metadata.close()


def test_repo_teaching_endpoint_returns_cited_walkthrough_without_cross_repo_leak(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("teacher", "upload", None)
    other_repo = registry.create_repo("unrelated", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": "# Teacher\n\nThe service handles account billing.\n",
            "package.json": json.dumps({
                "scripts": {
                    "dev": "uvicorn src.main:app",
                    "test": "pytest tests",
                },
                "dependencies": {"fastapi": "^0.115.0"},
            }),
            "src/main.py": (
                "from fastapi import FastAPI\n"
                "app = FastAPI()\n\n"
                "@app.get('/health')\n"
                "def health_check():\n"
                "    return {'ok': True}\n"
            ),
            "src/billing/service.py": "def collect_invoice(payment_id):\n    return payment_id\n",
            "db/schema.sql": "CREATE TABLE payments (id integer primary key, amount integer);\n",
            "tests/test_billing.py": "def test_collect_invoice():\n    assert True\n",
        },
    )
    build_repo_index_from_files(
        other_repo,
        {
            "src/other_secret.py": "def unrelated_payment_flow():\n    return 'do-not-cite'\n",
            "README.md": "# Other repo\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    registry.update_repo(other_repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/teaching")

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    steps = {step["id"]: step for step in body["steps"]}
    assert {"start", "run", "api", "data", "tests", "modules"}.issubset(steps)
    assert any(citation["source_path"] == "src/main.py" for citation in steps["start"]["citations"])
    assert any(citation["source_path"] == "package.json" for citation in steps["run"]["citations"])
    assert any(
        citation["source_path"] == "src/main.py"
        and citation["source_line"] > 0
        and citation["label"] == "GET /health"
        for citation in steps["api"]["citations"]
    )
    assert any(citation["source_path"] == "db/schema.sql" for citation in steps["data"]["citations"])
    assert any(citation["source_path"] == "tests/test_billing.py" for citation in steps["tests"]["citations"])

    serialized = json.dumps(body)
    assert "other_secret.py" not in serialized
    assert "do-not-cite" not in serialized


def test_repo_teaching_query_returns_cited_cold_evidence_without_cross_repo_leak(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("query-teacher", "upload", None)
    other_repo = registry.create_repo("query-unrelated", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": (
                "# Query Teacher\n\n"
                "Billing invoices and payment routing live here.\n\n"
                "## Billing invoice routing\n\n"
                "The billing route creates invoices before payment collection.\n"
            ),
            "package.json": json.dumps({"scripts": {"test": "pytest tests"}}),
            ".env.example": "BILLING_API_TOKEN=\nBILLING_WEBHOOK_SECRET=\n",
            "src/main.py": (
                "from fastapi import FastAPI\n"
                "from src.billing.service import collect_invoice\n"
                "app = FastAPI()\n\n"
                "@app.post('/billing/invoices')\n"
                "def create_invoice():\n"
                "    return collect_invoice('p1')\n"
            ),
            "src/billing/service.py": (
                "def collect_invoice(payment_id):\n"
                "    return {'payment_id': payment_id}\n"
            ),
            "db/schema.sql": "CREATE TABLE invoices (id integer primary key, payment_id text);\n",
            "tests/test_billing.py": "def test_collect_invoice():\n    assert True\n",
        },
    )
    build_repo_index_from_files(
        other_repo,
        {
            "src/secret.py": "def secret_invoice_backdoor():\n    return 'do-not-cite'\n",
            "README.md": "# Other repo\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    registry.update_repo(other_repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "How does billing invoice routing env setup work?", "limit": 8},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["generated_from"] == "cold_teaching_query_v1"
    assert "billing" in body["question"].lower()
    assert body["evidence"]
    serialized = json.dumps(body)
    assert "src/billing/service.py" in serialized or "src/main.py" in serialized
    assert "POST /billing/invoices" in serialized
    assert "secret_invoice_backdoor" not in serialized
    assert "do-not-cite" not in serialized
    assert all(item["citations"] for item in body["evidence"])

    with TestClient(app) as client:
        env_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "BILLING_API_TOKEN environment variable setup", "limit": 8},
        )

    assert env_response.status_code == 200
    env_body = env_response.json()
    assert any(item["kind"] == "env_var" and item["title"] == "BILLING_API_TOKEN" for item in env_body["evidence"])


def test_repo_teaching_uses_cached_cold_facts_when_source_is_pruned(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("cold-teacher", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": "# Cold Teacher\n",
            "package.json": json.dumps({"scripts": {"test": "vitest run"}}),
            "src/main.ts": "export function startApp() { return true }\n",
            "tests/main.test.ts": "test('start', () => expect(true).toBe(true))\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_path = Path(repo.storage_path)
    persist_repo_overview(repo.id, repo_path / "repo.sqlite", repo_path / "source")
    before_checksum = sha256_file(repo_path / "repo.sqlite")
    shutil.rmtree(repo_path / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/teaching")

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert any(
        citation["source_path"] == "src/main.ts"
        for step in body["steps"]
        for citation in step["citations"]
    )
    assert any(step["id"] == "run" for step in body["steps"])
    assert sha256_file(repo_path / "repo.sqlite") == before_checksum


def test_repo_teaching_query_uses_cold_artifacts_when_source_is_pruned(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("cold-query-teacher", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": "# Cold Query Teacher\n\n## Billing worker startup\n\nStart the billing worker from src/main.ts.\n",
            "package.json": json.dumps({
                "scripts": {"dev": "next dev"},
                "dependencies": {
                    "next": "^14.2.0",
                    "react": "^18.3.0",
                    "prisma": "^5.12.0",
                    "stripe": "^16.0.0",
                    "@sentry/react": "^8.0.0",
                    "prom-client": "^15.1.0",
                    "launchdarkly-node-server-sdk": "^9.5.0",
                    "@sendgrid/mail": "^8.1.0",
                    "twilio": "^5.2.0",
                    "openai": "^4.0.0",
                    "@anthropic-ai/sdk": "^0.24.0",
                    "langchain": "^0.2.0",
                    "graphql": "^16.9.0",
                    "@apollo/server": "^4.11.0",
                    "@apollo/client": "^3.10.0",
                    "graphql-yoga": "^5.6.0",
                    "kafkajs": "^2.2.4",
                    "amqplib": "^0.10.4",
                    "@aws-sdk/client-sqs": "^3.620.0",
                    "pg": "^8.0.0",
                    "@aws-sdk/client-s3": "^3.620.0",
                    "next-auth": "^4.24.0",
                    "passport-jwt": "^4.0.1",
                    "bullmq": "^5.7.0",
                    "node-cron": "^3.0.3",
                },
                "devDependencies": {"vitest": "^1.6.0"},
            }),
            "LICENSE": "Apache License\nVersion 2.0, January 2004\n",
            "SECURITY.md": "# Security policy\n\nReport vulnerabilities privately.\n",
            ".github/CODEOWNERS": "/src/private/* @platform/maintainers @security/reviewers\n",
            "deploy/payments.yaml": (
                "apiVersion: apps/v1\n"
                "kind: Deployment\n"
                "metadata:\n"
                "  name: payments-api\n"
                "spec:\n"
                "  template:\n"
                "    spec:\n"
                "      containers:\n"
                "        - name: api\n"
                "          image: ghcr.io/example/payments-api:2026.07\n"
            ),
            ".github/workflows/ci.yml": (
                "name: Worker CI\n"
                "on: [push, pull_request]\n"
                "jobs:\n"
                "  test:\n"
                "    runs-on: ubuntu-latest\n"
                "    steps:\n"
                "      - run: npm test\n"
            ),
            "docker-compose.yml": (
                "services:\n"
                "  worker:\n"
                "    image: billing-worker:latest\n"
                "    ports:\n"
                "      - '9000:9000'\n"
                "    depends_on:\n"
                "      - redis\n"
                "  redis:\n"
                "    image: redis:7\n"
            ),
            ".env.example": (
                "DATABASE_URL=postgres://db_should_not_be_stored_13579\n"
                "S3_BUCKET=invoice-archive\n"
                "KAFKA_BROKERS=kafka_should_not_be_stored_13579\n"
                "SQS_QUEUE_URL=https://sqs.example/should_not_be_stored_13579\n"
                "PAYMENTS_ACCESS_TOKEN=tok_live_should_not_be_stored_424242\n"
                "NEXTAUTH_SECRET=nextauth_should_not_be_stored_13579\n"
                "STRIPE_WEBHOOK_SECRET=whsec_should_not_be_stored_13579\n"
                "STRIPE_SECRET_KEY=sk_live_should_not_be_stored_payment_13579\n"
                "SENTRY_DSN=https://public@sentry.example/13579\n"
                "LD_SDK_KEY=ld_should_not_be_stored_13579\n"
                "SENDGRID_API_KEY=sg_should_not_be_stored_13579\n"
                "OPENAI_API_KEY=sk_ai_should_not_be_stored_13579\n"
                "GRAPHQL_ENDPOINT=https://graphql.example/should_not_be_stored_13579\n"
                "APOLLO_KEY=apollo_should_not_be_stored_13579\n"
                "PUBLIC_BASE_URL=https://example.test\n"
            ),
            ".codesniff/search-quality.json": json.dumps({
                "baseline": {"min_recall_at_k": 0.8, "min_mrr": 0.6, "min_passed": 2},
                "queries": [
                    {
                        "query": "billing worker startup startBillingWorker",
                        "expected_symbol": "startBillingWorker",
                        "expected_path": "src/main.ts",
                        "expected_type": "function",
                        "top_k": 5,
                    },
                    {
                        "query": "stripe webhook signature handler",
                        "expected_path": "src/webhooks.ts",
                        "top_k": 5,
                    },
                ],
            }),
            ".node-version": "20.10.0\n",
            "src/auth.ts": "import NextAuth from 'next-auth'\nexport const session = getServerSession()\n",
            "src/tasks.ts": "import { Queue } from 'bullmq'\nexport const billingQueue = new Queue('billing')\n",
            "src/flags.ts": "export const invoiceRedesignEnabled = ldClient.variation('invoice-redesign', { key: 'demo' }, false)\n",
            "src/notifications.ts": "export async function notifyInvoice() { return sgMail.send({ to: 'demo@example.test', from: 'billing@example.test', subject: 'Invoice', text: 'Ready' }) }\n",
            "src/events.ts": (
                "export async function publishInvoiceEvent(kafka, sqsClient) {\n"
                "  const producer = kafka.producer()\n"
                "  await producer.send({ topic: 'invoice.created', messages: [{ value: 'created' }] })\n"
                "  const consumer = kafka.consumer({ groupId: 'billing' })\n"
                "  await consumer.subscribe({ topic: 'invoice.created' })\n"
                "  return sqsClient.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: 'created' }))\n"
                "}\n"
            ),
            "src/graphql/schema.graphql": (
                "type Query { invoice(id: ID!): Invoice }\n"
                "type Mutation { createInvoice(input: InvoiceInput!): Invoice }\n"
                "input InvoiceInput { customerId: ID! total: Float! }\n"
                "type Invoice { id: ID! total: Float }\n"
            ),
            "src/graphql/resolvers.ts": (
                "import { ApolloServer } from '@apollo/server'\n"
                "import { gql, useMutation, useQuery } from '@apollo/client'\n\n"
                "const typeDefs = gql`\n"
                "  query InvoiceById { invoice(id: \"demo\") { id total } }\n"
                "  mutation CreateInvoice { createInvoice(input: { customerId: \"demo\", total: 10 }) { id } }\n"
                "`\n"
                "const resolvers = { Query: { invoice: () => ({ id: 'inv_1', total: 10 }) }, Mutation: { createInvoice: () => ({ id: 'inv_2', total: 10 }) } }\n"
                "export const billingGraphqlServer = new ApolloServer({ typeDefs, resolvers })\n"
                "export function InvoiceGraphqlClient() {\n"
                "  useQuery(gql`query InvoiceClient { invoice(id: \"demo\") { id } }`)\n"
                "  return useMutation(gql`mutation InvoiceCreateClient { createInvoice(input: { customerId: \"demo\", total: 10 }) { id } }`)\n"
                "}\n"
            ),
            "src/ai.ts": "export async function explainInvoice(openai, invoiceText) { const systemPrompt = 'Explain invoice changes'; await openai.chat.completions.create({ model: 'gpt-4.1-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: invoiceText }] }); return openai.embeddings.create({ model: 'text-embedding-3-small', input: invoiceText }) }\n",
            "src/payments.ts": "export async function createCheckoutSession(stripe, customerId) { return stripe.checkout.sessions.create({ customer: customerId, mode: 'payment' }) }\n",
            "src/webhooks.ts": "app.post('/webhooks/stripe', (req, res) => stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET))\n",
            "src/main.ts": "export function startBillingWorker() { return true }\n",
            "tests/main.test.ts": "test('billing worker', () => expect(true).toBe(true))\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_path = Path(repo.storage_path)
    persist_repo_overview(repo.id, repo_path / "repo.sqlite", repo_path / "source")
    before_checksum = sha256_file(repo_path / "repo.sqlite")
    shutil.rmtree(repo_path / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "billing worker startup startBillingWorker src main", "limit": 8},
        )

    assert response.status_code == 200
    body = response.json()
    assert any(
        citation["source_path"] == "src/main.ts"
        for item in body["evidence"]
        for citation in item["citations"]
    )

    with TestClient(app) as client:
        doc_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "billing worker startup documentation readme", "limit": 8},
        )

    assert doc_response.status_code == 200
    doc_body = doc_response.json()
    assert any(
        item["kind"] == "doc_section"
        and item["title"] == "Billing worker startup"
        and item["citations"][0]["source_path"] == "README.md"
        for item in doc_body["evidence"]
    )

    with TestClient(app) as client:
        ci_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "worker ci test workflow", "limit": 6},
        )

    assert ci_response.status_code == 200
    ci_body = ci_response.json()
    assert any(
        item["kind"] == "ci_workflow"
        and item["title"] == "Worker CI"
        and item["citations"][0]["source_path"] == ".github/workflows/ci.yml"
        for item in ci_body["evidence"]
    )

    with TestClient(app) as client:
        service_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "worker compose service ports redis dependency", "limit": 6},
        )

    assert service_response.status_code == 200
    service_body = service_response.json()
    assert any(
        item["kind"] == "container_service"
        and item["title"] == "worker"
        and item["citations"][0]["source_path"] == "docker-compose.yml"
        for item in service_body["evidence"]
    )

    with TestClient(app) as client:
        runtime_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "worker node runtime version", "limit": 6},
        )

    assert runtime_response.status_code == 200
    runtime_body = runtime_response.json()
    assert any(
        item["kind"] == "runtime_requirement"
        and item["title"] == "Node.js 20.10.0"
        and item["citations"][0]["source_path"] == ".node-version"
        for item in runtime_body["evidence"]
    )

    with TestClient(app) as client:
        stack_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "next react prisma stack framework data layer", "limit": 8},
        )

    assert stack_response.status_code == 200
    stack_body = stack_response.json()
    assert any(
        item["kind"] == "stack_component"
        and item["title"] == "Next.js full-stack framework"
        and item["citations"][0]["source_path"] == "package.json"
        for item in stack_body["evidence"]
    )
    assert any(
        item["kind"] == "stack_component"
        and item["title"] == "Prisma data layer"
        and item["citations"][0]["source_path"] == "package.json"
        for item in stack_body["evidence"]
    )

    with TestClient(app) as client:
        integration_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "stripe redis external integrations services", "limit": 8},
        )

    assert integration_response.status_code == 200
    integration_body = integration_response.json()
    assert any(
        item["kind"] == "service_integration"
        and item["title"] == "Stripe payment provider"
        and item["citations"][0]["source_path"] == "package.json"
        for item in integration_body["evidence"]
    )
    assert any(
        item["kind"] == "service_integration"
        and item["title"] == "Redis cache"
        and item["citations"][0]["source_path"] == "docker-compose.yml"
        for item in integration_body["evidence"]
    )

    with TestClient(app) as client:
        message_bus_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "kafka invoice event producer consumer sqs queue message", "limit": 8},
        )

    assert message_bus_response.status_code == 200
    message_bus_body = message_bus_response.json()
    assert any(
        item["kind"] == "message_bus"
        and item["title"] in {"Kafka event streaming", "Kafka producer producer", "Kafka consumer consumer"}
        and item["citations"][0]["source_path"] in {"package.json", "src/events.ts", ".env.example"}
        for item in message_bus_body["evidence"]
    )
    assert any(
        item["kind"] == "message_bus"
        and item["title"] in {"Amazon SQS message queue", "Amazon SQS producer producer"}
        and item["citations"][0]["source_path"] in {"package.json", "src/events.ts", ".env.example"}
        for item in message_bus_body["evidence"]
    )
    serialized_message_bus_body = json.dumps(message_bus_body)
    assert "kafka_should_not_be_stored_13579" not in serialized_message_bus_body
    assert "https://sqs.example/should_not_be_stored_13579" not in serialized_message_bus_body

    with TestClient(app) as client:
        graphql_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "graphql invoice schema root type mutation", "limit": 8},
        )

    assert graphql_response.status_code == 200
    graphql_body = graphql_response.json()
    assert any(
        item["kind"] == "graphql_surface"
        and item["citations"][0]["source_path"] in {"package.json", "src/graphql/schema.graphql", "src/graphql/resolvers.ts", ".env.example"}
        for item in graphql_body["evidence"]
    )
    assert any(
        item["kind"] == "graphql_surface"
        and item["citations"][0]["source_path"] == "src/graphql/schema.graphql"
        for item in graphql_body["evidence"]
    )

    with TestClient(app) as client:
        graphql_code_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "apollo graphql resolver client query mutation", "limit": 8},
        )

    assert graphql_code_response.status_code == 200
    graphql_code_body = graphql_code_response.json()
    assert any(
        item["kind"] == "graphql_surface"
        and item["citations"][0]["source_path"] == "src/graphql/resolvers.ts"
        for item in graphql_code_body["evidence"]
    )
    serialized_graphql_body = json.dumps([graphql_body, graphql_code_body])
    assert "https://graphql.example/should_not_be_stored_13579" not in serialized_graphql_body
    assert "apollo_should_not_be_stored_13579" not in serialized_graphql_body

    with TestClient(app) as client:
        data_store_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "postgres redis s3 data store cache database storage", "limit": 8},
        )

    assert data_store_response.status_code == 200
    data_store_body = data_store_response.json()
    assert any(
        item["kind"] == "data_store"
        and item["title"] == "PostgreSQL relational database"
        and item["citations"][0]["source_path"] in {"package.json", ".env.example"}
        for item in data_store_body["evidence"]
    )
    assert any(
        item["kind"] == "data_store"
        and item["title"] == "Redis key-value cache"
        and item["citations"][0]["source_path"] == "docker-compose.yml"
        for item in data_store_body["evidence"]
    )
    assert any(
        item["kind"] == "data_store"
        and item["title"] == "Amazon S3 object storage"
        and item["citations"][0]["source_path"] in {"package.json", ".env.example"}
        for item in data_store_body["evidence"]
    )
    serialized_data_store_body = json.dumps(data_store_body)
    assert "postgres://db_should_not_be_stored_13579" not in serialized_data_store_body

    with TestClient(app) as client:
        ai_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "openai chat completion embeddings invoice prompt", "limit": 8},
        )

    assert ai_response.status_code == 200
    ai_body = ai_response.json()
    assert any(
        item["kind"] == "ai_surface"
        and item["citations"][0]["source_path"] in {"package.json", "src/ai.ts", ".env.example"}
        for item in ai_body["evidence"]
    )
    serialized_ai_body = json.dumps(ai_body)
    assert "sk_ai_should_not_be_stored_13579" not in serialized_ai_body

    with TestClient(app) as client:
        payment_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "stripe checkout payment billing subscription", "limit": 8},
        )

    assert payment_response.status_code == 200
    payment_body = payment_response.json()
    assert any(
        item["kind"] == "payment_surface"
        and item["citations"][0]["source_path"] in {"package.json", "src/payments.ts", ".env.example"}
        for item in payment_body["evidence"]
    )
    serialized_payment_body = json.dumps(payment_body)
    assert "sk_live_should_not_be_stored_payment_13579" not in serialized_payment_body

    with TestClient(app) as client:
        auth_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "nextauth passport jwt auth session middleware", "limit": 8},
        )

    assert auth_response.status_code == 200
    auth_body = auth_response.json()
    assert any(
        item["kind"] == "auth_surface"
        and item["title"] == "NextAuth auth framework"
        and item["citations"][0]["source_path"] == "package.json"
        for item in auth_body["evidence"]
    )
    assert any(
        item["kind"] == "auth_surface"
        and item["title"] == "Passport JWT jwt"
        and item["citations"][0]["source_path"] == "package.json"
        for item in auth_body["evidence"]
    )
    serialized_auth_body = json.dumps(auth_body)
    assert "nextauth_should_not_be_stored_13579" not in serialized_auth_body

    with TestClient(app) as client:
        jobs_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "bullmq task queue dependency background job", "limit": 8},
        )

    assert jobs_response.status_code == 200
    jobs_body = jobs_response.json()
    assert any(
        item["kind"] == "background_job"
        and item["title"] == "BullMQ task queue"
        and item["citations"][0]["source_path"] == "package.json"
        for item in jobs_body["evidence"]
    )

    with TestClient(app) as client:
        worker_jobs_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "worker queue worker background job compose service", "limit": 8},
        )

    assert worker_jobs_response.status_code == 200
    worker_jobs_body = worker_jobs_response.json()
    assert any(
        item["kind"] == "background_job"
        and item["title"] == "worker queue worker"
        and item["citations"][0]["source_path"] == "docker-compose.yml"
        for item in worker_jobs_body["evidence"]
    )

    with TestClient(app) as client:
        webhook_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "stripe webhook callback signature handler", "limit": 8},
        )

    assert webhook_response.status_code == 200
    webhook_body = webhook_response.json()
    assert any(
        item["kind"] == "webhook_surface"
        and item["citations"][0]["source_path"] == "src/webhooks.ts"
        for item in webhook_body["evidence"]
    )
    serialized_webhook_body = json.dumps(webhook_body)
    assert "whsec_should_not_be_stored_13579" not in serialized_webhook_body

    with TestClient(app) as client:
        observability_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "sentry observability telemetry metrics logging health", "limit": 8},
        )

    assert observability_response.status_code == 200
    observability_body = observability_response.json()
    assert any(
        item["kind"] == "observability_surface"
        and item["citations"][0]["source_path"] == "package.json"
        for item in observability_body["evidence"]
    )
    serialized_observability_body = json.dumps(observability_body)
    assert "https://public@sentry.example/13579" not in serialized_observability_body

    with TestClient(app) as client:
        feature_flag_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "launchdarkly feature flag invoice redesign toggle variation", "limit": 8},
        )

    assert feature_flag_response.status_code == 200
    feature_flag_body = feature_flag_response.json()
    assert any(
        item["kind"] == "feature_flag"
        and item["citations"][0]["source_path"] in {"package.json", "src/flags.ts", ".env.example"}
        for item in feature_flag_body["evidence"]
    )
    serialized_feature_flag_body = json.dumps(feature_flag_body)
    assert "ld_should_not_be_stored_13579" not in serialized_feature_flag_body

    with TestClient(app) as client:
        notification_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "sendgrid email notification invoice sender", "limit": 8},
        )

    assert notification_response.status_code == 200
    notification_body = notification_response.json()
    assert any(
        item["kind"] == "notification_surface"
        and item["citations"][0]["source_path"] in {"package.json", "src/notifications.ts", ".env.example"}
        for item in notification_body["evidence"]
    )
    serialized_notification_body = json.dumps(notification_body)
    assert "sg_should_not_be_stored_13579" not in serialized_notification_body

    with TestClient(app) as client:
        policy_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "license security policy owner maintainer", "limit": 8},
        )

    assert policy_response.status_code == 200
    policy_body = policy_response.json()
    assert any(
        item["kind"] == "repo_policy"
        and item["title"] == "license Apache-2.0"
        and item["citations"][0]["source_path"] == "LICENSE"
        for item in policy_body["evidence"]
    )
    assert any(
        item["kind"] == "repo_policy"
        and item["title"] == "security Security policy"
        and item["citations"][0]["source_path"] == "SECURITY.md"
        for item in policy_body["evidence"]
    )
    assert any(
        item["kind"] == "code_owner"
        and item["citations"][0]["source_path"] == ".github/CODEOWNERS"
        for item in policy_body["evidence"]
    )

    with TestClient(app) as client:
        deploy_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "kubernetes deployment payments image", "limit": 6},
        )

    assert deploy_response.status_code == 200
    deploy_body = deploy_response.json()
    assert any(
        item["kind"] == "deploy_target"
        and item["title"] == "Kubernetes Deployment payments-api"
        and item["citations"][0]["source_path"] == "deploy/payments.yaml"
        for item in deploy_body["evidence"]
    )

    with TestClient(app) as client:
        secret_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "payments access token secret credential", "limit": 8},
        )

    assert secret_response.status_code == 200
    secret_body = secret_response.json()
    assert any(
        item["kind"] == "secret_signal"
        and item["title"] == "token PAYMENTS_ACCESS_TOKEN"
        and item["citations"][0]["source_path"] == ".env.example"
        for item in secret_body["evidence"]
    )
    serialized_secret_body = json.dumps(secret_body)
    assert "PAYMENTS_ACCESS_TOKEN" in serialized_secret_body
    assert "tok_live_should_not_be_stored_424242" not in serialized_secret_body

    with TestClient(app) as client:
        quality_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "curated search quality baseline recall mrr passed suite", "limit": 8},
        )

    assert quality_response.status_code == 200
    quality_body = quality_response.json()
    assert any(
        item["kind"] == "search_quality"
        and item["title"] == "Search quality baseline"
        and item["citations"][0]["source_path"] == ".codesniff/search-quality.json"
        and "recall>=80%" in item["summary"]
        for item in quality_body["evidence"]
    )

    with TestClient(app) as client:
        quality_case_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "quality case startBillingWorker expected src main", "limit": 8},
        )

    assert quality_case_response.status_code == 200
    quality_case_body = quality_case_response.json()
    assert any(
        item["kind"] == "search_quality"
        and item["title"] == "billing worker startup startBillingWorker"
        and item["citations"][0]["source_path"] == ".codesniff/search-quality.json"
        and "src/main.ts" in item["summary"]
        for item in quality_case_body["evidence"]
    )
    assert sha256_file(repo_path / "repo.sqlite") == before_checksum


def test_repo_search_quality_endpoint_generates_cold_smoke_report(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("quality", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": "# Quality\n\nAuthentication and database search smoke coverage.\n",
            "package.json": json.dumps({
                "scripts": {"test": "vitest run --config strict.vitest.config.ts"},
                "dependencies": {"express": "^4.18.0"},
            }),
            "src/auth.py": (
                "def authenticate_user(username, password):\n"
                "    \"\"\"Authenticate a user with password credentials.\"\"\"\n"
                "    return bool(username and password)\n"
            ),
            "src/database.py": (
                "def connect_database(dsn):\n"
                "    \"\"\"Open SQL database connections.\"\"\"\n"
                "    return dsn\n"
            ),
            "src/routes.py": (
                "from fastapi import FastAPI\n"
                "app = FastAPI()\n\n"
                "@app.get('/health')\n"
                "def health_check():\n"
                "    return {'ok': True}\n"
            ),
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/search-quality", params={"max_cases": 5, "top_k": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total"] >= 3
    assert body["passed"] >= 3
    assert body["recall_at_k"] > 0
    assert body["mrr"] > 0
    assert len(body["generated_cases"]) == body["total"]
    sources = {case["source"] for case in body["generated_cases"]}
    assert "symbol" in sources
    assert all(result["top_results"] for result in body["results"])
    assert any(result["query"] == "authenticate_user" and result["passed"] for result in body["results"])


def test_repo_search_quality_uses_cached_cold_facts_when_source_is_pruned(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("cold-quality", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "README.md": "# Cold Quality\n",
            "package.json": json.dumps({"scripts": {"test": "vitest run"}}),
            "src/main.ts": "export function startQualityDashboard() { return true }\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_path = Path(repo.storage_path)
    persist_repo_overview(repo.id, repo_path / "repo.sqlite", repo_path / "source")
    before_checksum = sha256_file(repo_path / "repo.sqlite")
    shutil.rmtree(repo_path / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/search-quality", params={"max_cases": 4, "top_k": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total"] > 0
    assert any(case["expected_path"] == "src/main.ts" for case in body["generated_cases"])
    assert sha256_file(repo_path / "repo.sqlite") == before_checksum


def test_repo_search_quality_prefers_curated_suite_from_cold_overview(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("curated-quality", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            ".codesniff/search-quality.json": json.dumps({
                "baseline": {"min_recall_at_k": 1.0, "min_mrr": 0.5, "min_passed": 2},
                "queries": [
                    {
                        "query": "authenticate_user password credentials",
                        "expected_symbol": "authenticate_user",
                        "expected_path": "src/auth.py",
                        "expected_type": "function",
                        "top_k": 3,
                    },
                    {
                        "query": "health endpoint route",
                        "expected_path": "src/routes.py",
                        "top_k": 5,
                    },
                ]
            }),
            "src/auth.py": (
                "def authenticate_user(username, password):\n"
                "    \"\"\"Authenticate password credentials.\"\"\"\n"
                "    return bool(username and password)\n"
            ),
            "src/routes.py": (
                "from fastapi import FastAPI\n"
                "app = FastAPI()\n\n"
                "@app.get('/health')\n"
                "def health_check():\n"
                "    return {'ok': True}\n"
            ),
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_path = Path(repo.storage_path)
    overview = persist_repo_overview(repo.id, repo_path / "repo.sqlite", repo_path / "source")
    assert [case["query"] for case in overview["search_quality_cases"]] == [
        "authenticate_user password credentials",
        "health endpoint route",
    ]
    assert overview["search_quality_baseline"] == {"min_recall_at_k": 1.0, "min_mrr": 0.5, "min_passed": 2}
    metadata = MetadataStore(db_path=str(repo_path / "repo.sqlite"))
    try:
        quality_facts = metadata.get_repo_facts(kind="search_quality", limit=10)
    finally:
        metadata.close()
    quality_by_key = {fact["key"]: fact for fact in quality_facts}
    assert quality_by_key["baseline"]["value"] == "recall>=100%, mrr>=0.50, passed>=2"
    assert quality_by_key["baseline"]["metadata"]["fact_type"] == "baseline"
    assert quality_by_key["authenticate_user password credentials"]["metadata"]["expected_path"] == "src/auth.py"
    assert quality_by_key["health endpoint route"]["source_path"] == ".codesniff/search-quality.json"
    before_checksum = sha256_file(repo_path / "repo.sqlite")
    shutil.rmtree(repo_path / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/search-quality", params={"max_cases": 8, "top_k": 5})
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "search_quality", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total"] == 2
    assert body["passed"] == 2
    assert body["baseline"]["met"] is True
    assert body["baseline"]["recall_delta"] >= 0
    assert body["baseline"]["mrr_delta"] >= 0
    assert body["baseline"]["passed_delta"] == 0
    assert {case["source"] for case in body["generated_cases"]} == {"curated"}
    assert {result["source"] for result in body["results"]} == {"curated"}
    assert body["warnings"] == ["Using 2 curated search-quality cases from repo config."]
    assert {case["query"] for case in body["generated_cases"]} == {
        "authenticate_user password credentials",
        "health endpoint route",
    }
    assert facts_response.status_code == 200
    facts_body = facts_response.json()
    assert facts_body["total"] == 3
    assert {fact["key"] for fact in facts_body["facts"]} == {
        "baseline",
        "authenticate_user password credentials",
        "health endpoint route",
    }
    assert sha256_file(repo_path / "repo.sqlite") == before_checksum


def test_repo_search_quality_reports_failed_curated_baseline(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("curated-quality-baseline-fail", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            ".codesniff/search-quality.json": json.dumps({
                "baseline": {"min_recall_at_k": 1.0, "min_mrr": 1.0, "min_passed": 1},
                "queries": [
                    {
                        "query": "authenticate_user password credentials",
                        "expected_symbol": "missing_authenticate_user",
                        "expected_path": "src/auth.py",
                        "expected_type": "function",
                        "top_k": 3,
                    },
                ],
            }),
            "src/auth.py": (
                "def authenticate_user(username, password):\n"
                "    \"\"\"Authenticate password credentials.\"\"\"\n"
                "    return bool(username and password)\n"
            ),
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_path = Path(repo.storage_path)
    overview = persist_repo_overview(repo.id, repo_path / "repo.sqlite", repo_path / "source")
    assert overview["search_quality_baseline"] == {"min_recall_at_k": 1.0, "min_mrr": 1.0, "min_passed": 1}
    before_checksum = sha256_file(repo_path / "repo.sqlite")
    shutil.rmtree(repo_path / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/search-quality", params={"max_cases": 8, "top_k": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total"] == 1
    assert body["passed"] == 0
    assert body["baseline"]["met"] is False
    assert body["baseline"]["recall_delta"] == -1.0
    assert body["baseline"]["mrr_delta"] == -1.0
    assert body["baseline"]["passed_delta"] == -1
    assert any("Search quality below baseline" in warning for warning in body["warnings"])
    assert sha256_file(repo_path / "repo.sqlite") == before_checksum


def test_repo_storage_profile_reports_blob_weight_and_sample_latency(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("storage-profile", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "src/auth.py": (
                "def authenticate_user(username, password):\n"
                "    return username and password\n"
                "# repeated-auth-storage-profile\n" * 200
            ),
            "src/database.py": (
                "def connect_database(dsn):\n"
                "    return dsn\n"
                "# repeated-database-storage-profile\n" * 200
            ),
            "README.md": "# Storage profile\n" + ("This repo measures cold blobs.\n" * 100),
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/storage-profile", params={"sample_blobs": 2})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total_bytes"] >= body["artifact_bytes"]["repo_sqlite"]
    assert body["artifact_bytes"]["source"] > 0
    assert body["file_count"] == 3
    assert body["blob_count"] == 3
    assert body["blob_coverage"] == pytest.approx(1.0)
    assert body["blob_uncompressed_bytes"] > body["blob_compressed_bytes"]
    assert 0 < body["blob_compression_ratio"] < 1
    assert body["sampled_blob_count"] == 2
    assert body["sampled_decompress_ms_total"] >= 0
    assert all(sample["path"] for sample in body["sampled_blobs"])


def test_repo_storage_profile_uses_cold_blobs_when_source_is_pruned(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("cold-storage-profile", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "src/main.py": "def start_app():\n    return True\n" + ("# profile\n" * 50),
            "tests/test_main.py": "def test_start_app():\n    assert True\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")
    repo_path = Path(repo.storage_path)
    before_checksum = sha256_file(repo_path / "repo.sqlite")
    shutil.rmtree(repo_path / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/storage-profile", params={"sample_blobs": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["artifact_bytes"]["source"] == 0
    assert body["blob_count"] == 2
    assert body["sampled_blob_count"] == 2
    assert {sample["path"] for sample in body["sampled_blobs"]} == {"src/main.py", "tests/test_main.py"}
    assert sha256_file(repo_path / "repo.sqlite") == before_checksum


def test_repo_overview_extracts_runbook_and_dependency_facts(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("runbook", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "package.json": "\ufeff" + json.dumps({
                "scripts": {
                    "dev": "vite --host 0.0.0.0",
                    "test": "vitest run",
                    "build": "tsc && vite build"
                },
                "engines": {"node": ">=20.0.0", "pnpm": ">=9"},
                "dependencies": {"react": "^18.3.0"},
                "devDependencies": {"vitest": "^1.6.0"}
            }),
            "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
            "pyproject.toml": (
                "\ufeff"
                "[project]\n"
                "name = 'runbook'\n"
                "requires-python = '>=3.11'\n"
                "dependencies = ['fastapi>=0.110', 'pytest>=8']\n"
                "[build-system]\n"
                "requires = ['setuptools']\n"
            ),
            "requirements.txt": "uvicorn==0.30.0\n",
            "go.mod": "module example.com/runbook\n\ngo 1.22\n\nrequire (\n    github.com/jackc/pgx/v5 v5.5.0\n)\n",
            "Cargo.toml": (
                "\ufeff"
                "[package]\n"
                "name = 'runbook'\n"
                "version = '0.1.0'\n"
                "edition = '2021'\n"
                "rust-version = '1.76'\n"
                "[dependencies]\n"
                "serde = '1'\n"
            ),
            ".tool-versions": "nodejs 20.11.1\npython 3.12.2\n",
            "docker-compose.yml": "services:\n  api:\n    image: runbook-api\n",
            "Dockerfile": "FROM python:3.12-slim\n",
            "Makefile": "\ufefftest:\n\tpytest\n",
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")

    assert response.status_code == 200
    body = response.json()

    manifests = {
        (manifest["ecosystem"], manifest["package_manager"], manifest["source_path"])
        for manifest in body["dependency_manifests"]
    }
    assert ("JavaScript/TypeScript", "pnpm", "package.json") in manifests
    assert ("Python", "pip", "pyproject.toml") in manifests
    assert ("Go", "go", "go.mod") in manifests
    assert ("Rust", "cargo", "Cargo.toml") in manifests
    assert ("Containers", "docker compose", "docker-compose.yml") in manifests

    commands = {(command["category"], command["command"]) for command in body["runbook_commands"]}
    assert body["runbook_commands"][0]["source_path"] == "package.json"
    assert ("install", "pnpm install") in commands
    assert ("test", "pnpm test") in commands
    assert ("test", "pytest") in commands
    assert ("test", "go test ./...") in commands
    assert ("build", "cargo build") in commands
    assert ("container", "docker compose up") in commands
    assert ("test", "make test") in commands

    dependencies = {
        (dependency["ecosystem"], dependency["scope"], dependency["name"])
        for dependency in body["dependencies"]
    }
    assert body["dependency_manifests"][0]["source_path"] == "package.json"
    assert ("JavaScript/TypeScript", "runtime", "react") in dependencies
    assert ("JavaScript/TypeScript", "dev", "vitest") in dependencies
    assert ("Python", "runtime", "fastapi") in dependencies
    assert ("Python", "runtime", "uvicorn") in dependencies
    assert ("Go", "runtime", "github.com/jackc/pgx/v5") in dependencies
    assert ("Rust", "runtime", "serde") in dependencies

    runtime_requirements = {
        (item["runtime"], item["requirement"], item["source_path"])
        for item in body["runtime_requirements"]
    }
    assert ("Node.js", ">=20.0.0", "package.json") in runtime_requirements
    assert ("Python", ">=3.11", "pyproject.toml") in runtime_requirements
    assert ("Go", "1.22", "go.mod") in runtime_requirements
    assert ("Rust", "1.76", "Cargo.toml") in runtime_requirements
    assert ("Rust edition", "2021", "Cargo.toml") in runtime_requirements
    assert ("Node.js", "20.11.1", ".tool-versions") in runtime_requirements


def test_fast_index_persists_workspace_topology_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    source_repo.mkdir()
    (source_repo / "package.json").write_text(
        json.dumps({
            "name": "workspace-root",
            "private": True,
            "workspaces": {"packages": ["apps/*", "packages/shared-*"]},
            "scripts": {"test": "vitest run"},
        }),
        encoding="utf-8",
    )
    (source_repo / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'\n", encoding="utf-8")
    (source_repo / "pnpm-workspace.yaml").write_text(
        "packages:\n"
        "  - 'apps/web'\n"
        "  - packages/api\n",
        encoding="utf-8",
    )
    (source_repo / "lerna.json").write_text(
        json.dumps({"packages": ["libs/*"]}),
        encoding="utf-8",
    )
    (source_repo / "nx.json").write_text(
        json.dumps({
            "projects": {
                "billing-admin": {"root": "apps/billing-admin"},
                "shared-ui": "packages/shared-ui",
            }
        }),
        encoding="utf-8",
    )
    (source_repo / "Cargo.toml").write_text(
        "[workspace]\n"
        "members = ['crates/api', 'crates/core']\n"
        "exclude = ['crates/legacy']\n"
        "[package]\n"
        "name = 'workspace-root'\n"
        "version = '0.1.0'\n",
        encoding="utf-8",
    )
    (source_repo / "go.work").write_text(
        "go 1.22\n\n"
        "use (\n"
        "  ./services/api\n"
        "  ./libs/auth\n"
        ")\n",
        encoding="utf-8",
    )
    (source_repo / "apps" / "web").mkdir(parents=True)
    (source_repo / "apps" / "web" / "index.ts").write_text("export const app = true;\n", encoding="utf-8")
    (source_repo / "services" / "api").mkdir(parents=True)
    (source_repo / "services" / "api" / "main.go").write_text("package main\nfunc main() {}\n", encoding="utf-8")

    repo = registry.create_repo("workspace-topology", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "workspace", "limit": 80})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "what packages are in this monorepo workspace", "limit": 6},
        )

    assert overview_response.status_code == 200
    workspaces = {
        (item["manager"], item["workspace_kind"], item["path"], item["source_path"])
        for item in overview_response.json()["workspaces"]
    }
    assert ("pnpm", "root", ".", "package.json") in workspaces
    assert ("pnpm", "package", "apps/*", "package.json") in workspaces
    assert ("pnpm", "package", "apps/web", "pnpm-workspace.yaml") in workspaces
    assert ("lerna", "package", "libs/*", "lerna.json") in workspaces
    assert ("nx", "project", "apps/billing-admin", "nx.json") in workspaces
    assert ("cargo", "member", "crates/api", "Cargo.toml") in workspaces
    assert ("cargo", "exclude", "crates/legacy", "Cargo.toml") in workspaces
    assert ("go work", "module", "services/api", "go.work") in workspaces

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"workspace"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["pnpm:package:apps/web"]["metadata"]["manager"] == "pnpm"
    assert by_key["nx:project:apps/billing-admin"]["metadata"]["name"] == "billing-admin"
    assert by_key["go work:module:services/api"]["metadata"]["ecosystem"] == "Go"
    assert all(fact["metadata"]["provenance"]["source"] == "manifest" for fact in facts)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "workspace" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_supply_chain_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / ".github" / "workflows").mkdir(parents=True)
    (source_repo / "security").mkdir(parents=True)
    (source_repo / "package.json").write_text(
        json.dumps({"name": "supply-chain-fixture", "dependencies": {"react": "^18.3.0"}}),
        encoding="utf-8",
    )
    (source_repo / "package-lock.json").write_text(
        json.dumps({"lockfileVersion": 3, "packages": {"": {"dependencies": {"react": "^18.3.0"}}}}),
        encoding="utf-8",
    )
    (source_repo / "poetry.lock").write_text(
        "[[package]]\nname = \"fastapi\"\nversion = \"0.115.0\"\n",
        encoding="utf-8",
    )
    (source_repo / "go.sum").write_text(
        "github.com/jackc/pgx/v5 v5.7.1 h1:example\n",
        encoding="utf-8",
    )
    (source_repo / ".github" / "dependabot.yml").write_text(
        "version: 2\n"
        "updates:\n"
        "  - package-ecosystem: npm\n"
        "    directory: /\n"
        "    schedule:\n"
        "      interval: weekly\n"
        "  - package-ecosystem: github-actions\n"
        "    directory: /\n"
        "    schedule:\n"
        "      interval: daily\n",
        encoding="utf-8",
    )
    (source_repo / "renovate.json").write_text(
        json.dumps({"extends": ["config:recommended"], "schedule": ["before 5am on monday"]}),
        encoding="utf-8",
    )
    (source_repo / ".github" / "workflows" / "security.yml").write_text(
        "name: Security\n"
        "on: [push]\n"
        "jobs:\n"
        "  analyze:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - uses: github/codeql-action/init@v3\n"
        "      - uses: github/codeql-action/analyze@v3\n"
        "      - uses: actions/dependency-review-action@v4\n"
        "      - uses: ossf/scorecard-action@v2\n"
        "      - uses: snyk/actions/node@master\n"
        "      - uses: aquasecurity/trivy-action@0.20.0\n",
        encoding="utf-8",
    )
    (source_repo / ".snyk").write_text(
        "version: v1.25.0\nignore: {}\n",
        encoding="utf-8",
    )
    (source_repo / "security" / "sbom.spdx.json").write_text(
        json.dumps({"spdxVersion": "SPDX-2.3", "name": "supply-chain-fixture"}),
        encoding="utf-8",
    )
    (source_repo / "src").mkdir()
    (source_repo / "src" / "main.ts").write_text("export const ok = true;\n", encoding="utf-8")

    repo = registry.create_repo("supply-chain", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "supply_chain", "limit": 80})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "which supply chain lockfiles dependabot codeql sbom scans exist", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    supply_chain = {
        (item["category"], item["tool"], item["name"], item["source_path"])
        for item in overview["supply_chain"]
    }
    assert ("lockfile", "npm", "package-lock.json", "package-lock.json") in supply_chain
    assert ("lockfile", "Poetry", "poetry.lock", "poetry.lock") in supply_chain
    assert ("lockfile", "Go modules", "go.sum", "go.sum") in supply_chain
    assert ("dependency automation", "Dependabot", "Dependabot npm", ".github/dependabot.yml") in supply_chain
    assert ("dependency automation", "Dependabot", "Dependabot github-actions", ".github/dependabot.yml") in supply_chain
    assert ("dependency automation", "Renovate", "Renovate", "renovate.json") in supply_chain
    assert ("security scan", "CodeQL", "CodeQL", ".github/workflows/security.yml") in supply_chain
    assert ("dependency review", "Dependency Review", "Dependency Review", ".github/workflows/security.yml") in supply_chain
    assert ("security scorecard", "OpenSSF Scorecard", "OpenSSF Scorecard", ".github/workflows/security.yml") in supply_chain
    assert ("vulnerability scan", "Snyk", "Snyk", ".snyk") in supply_chain
    assert ("vulnerability scan", "Trivy", "Trivy", ".github/workflows/security.yml") in supply_chain
    assert ("sbom", "SPDX", "sbom.spdx.json", "security/sbom.spdx.json") in supply_chain

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"supply_chain"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["lockfile:npm:package-lock.json"]["metadata"]["ecosystem"] == "JavaScript/TypeScript"
    assert by_key["dependency automation:Dependabot:Dependabot npm"]["metadata"]["source"] == "config"
    assert by_key["security scan:CodeQL:CodeQL"]["metadata"]["source"] == "workflow"
    assert by_key["sbom:SPDX:sbom.spdx.json"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=20)
    assert any(item["source"] == "supply_chain" for item in generated_cases)
    assert any(item["case"].expected_path == ".github/workflows/security.yml" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "supply_chain" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_ui_surface_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "app" / "(dashboard)" / "customers" / "[customerId]").mkdir(parents=True)
    (source_repo / "pages").mkdir()
    (source_repo / "src" / "components").mkdir(parents=True)
    (source_repo / "src" / "routes" / "billing" / "[invoiceId]").mkdir(parents=True)
    (source_repo / "src" / "views").mkdir(parents=True)
    (source_repo / "src" / "pages").mkdir(parents=True)
    (source_repo / "app" / "(dashboard)" / "customers" / "[customerId]" / "page.tsx").write_text(
        "import React from 'react';\n"
        "export default function CustomerBillingPage() {\n"
        "  return <CustomerLedgerForm />;\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "pages" / "reports.tsx").write_text(
        "import React from 'react';\n"
        "export function ReportsPage() {\n"
        "  return <main>Reports</main>;\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "components" / "CustomerLedgerForm.tsx").write_text(
        "import React from 'react';\n"
        "export const CustomerLedgerForm = () => {\n"
        "  return <form><input name=\"customerId\" /></form>;\n"
        "};\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "components" / "CustomerLedgerPanel.stories.tsx").write_text(
        "import type { Meta } from '@storybook/react';\n"
        "import { CustomerLedgerForm } from './CustomerLedgerForm';\n"
        "export default { component: CustomerLedgerForm } satisfies Meta<typeof CustomerLedgerForm>;\n"
        "export const Primary = () => <CustomerLedgerForm />;\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "routes" / "billing" / "[invoiceId]" / "+page.svelte").write_text(
        "<script>\n"
        "  export let data;\n"
        "</script>\n"
        "<form><input name=\"invoiceId\" /></form>\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "views" / "InvoiceTable.vue").write_text(
        "<script>\n"
        "export default { name: 'InvoiceTableView' }\n"
        "</script>\n"
        "<template><section>Invoices</section></template>\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "pages" / "billing.astro").write_text(
        "---\n"
        "const title = 'Billing';\n"
        "---\n"
        "<main>{title}</main>\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("ui-surfaces", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "ui_surface", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "where are the frontend ui pages components forms storybook views", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    ui_surfaces = {
        (item["framework"], item["category"], item["name"], item["source_path"])
        for item in overview["ui_surfaces"]
    }
    assert ("Next.js", "page", "/customers/{customerId}", "app/(dashboard)/customers/[customerId]/page.tsx") in ui_surfaces
    assert ("Next.js", "component", "CustomerBillingPage", "app/(dashboard)/customers/[customerId]/page.tsx") in ui_surfaces
    assert ("Next.js", "page", "/reports", "pages/reports.tsx") in ui_surfaces
    assert ("React", "component", "CustomerLedgerForm", "src/components/CustomerLedgerForm.tsx") in ui_surfaces
    assert ("React", "form", "CustomerLedgerForm", "src/components/CustomerLedgerForm.tsx") in ui_surfaces
    assert ("React", "story", "CustomerLedgerPanel", "src/components/CustomerLedgerPanel.stories.tsx") in ui_surfaces
    assert ("Svelte", "page", "/billing/{invoiceId}", "src/routes/billing/[invoiceId]/+page.svelte") in ui_surfaces
    assert ("Svelte", "form", "/billing/{invoiceId}", "src/routes/billing/[invoiceId]/+page.svelte") in ui_surfaces
    assert ("Vue", "component", "InvoiceTableView", "src/views/InvoiceTable.vue") in ui_surfaces
    assert ("Astro", "page", "/billing", "src/pages/billing.astro") in ui_surfaces

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"ui_surface"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["Next.js:page:/customers/{customerId}"]["metadata"]["framework"] == "Next.js"
    assert by_key["React:form:CustomerLedgerForm"]["metadata"]["source"] == "markup-signal"
    assert by_key["React:story:CustomerLedgerPanel"]["metadata"]["detail"] == "Storybook story file"
    assert by_key["Svelte:page:/billing/{invoiceId}"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=30)
    assert any(item["source"] == "ui_surface" for item in generated_cases)
    assert any(item["case"].expected_path == "src/components/CustomerLedgerForm.tsx" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "ui_surface" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_cli_command_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "bin").mkdir(parents=True)
    (source_repo / "exe").mkdir()
    (source_repo / "cmd" / "reconcile").mkdir(parents=True)
    (source_repo / "src" / "bin").mkdir(parents=True)
    (source_repo / "billing").mkdir()
    (source_repo / "package.json").write_text(
        json.dumps({
            "name": "@acme/billing-tools",
            "bin": {"billing-cli": "./bin/billing.js"},
        }),
        encoding="utf-8",
    )
    (source_repo / "pyproject.toml").write_text(
        "[project]\n"
        "name = \"billing-admin\"\n"
        "[project.scripts]\n"
        "billing-admin = \"billing.cli:main\"\n",
        encoding="utf-8",
    )
    (source_repo / "setup.cfg").write_text(
        "[metadata]\n"
        "name = billing-audit\n"
        "[options.entry_points]\n"
        "console_scripts =\n"
        "    billing-audit = billing.audit:main\n",
        encoding="utf-8",
    )
    (source_repo / "Cargo.toml").write_text(
        "[package]\n"
        "name = \"billing-worker-crate\"\n"
        "version = \"0.1.0\"\n"
        "[[bin]]\n"
        "name = \"billing-worker\"\n"
        "path = \"src/bin/billing_worker.rs\"\n",
        encoding="utf-8",
    )
    (source_repo / "cmd" / "reconcile" / "main.go").write_text(
        "package main\n"
        "func main() {}\n",
        encoding="utf-8",
    )
    (source_repo / "bin" / "billing.js").write_text(
        "#!/usr/bin/env node\n"
        "console.log('billing');\n",
        encoding="utf-8",
    )
    (source_repo / "bin" / "export-ledger").write_text(
        "#!/usr/bin/env bash\n"
        "echo export\n",
        encoding="utf-8",
    )
    (source_repo / "exe" / "billing_report").write_text(
        "#!/usr/bin/env ruby\n"
        "puts 'report'\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "bin" / "billing_worker.rs").write_text(
        "fn main() {}\n",
        encoding="utf-8",
    )
    (source_repo / "billing" / "cli.py").write_text(
        "def main():\n"
        "    return 0\n",
        encoding="utf-8",
    )
    (source_repo / "billing" / "audit.py").write_text(
        "def main():\n"
        "    return 0\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("cli-commands", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "cli_command", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "where are the cli console commands binaries admin tools", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    cli_commands = {
        (item["category"], item["name"], item["command"], item["source_path"])
        for item in overview["cli_commands"]
    }
    assert ("node bin", "billing-cli", "billing-cli", "package.json") in cli_commands
    assert ("python console script", "billing-admin", "billing-admin", "pyproject.toml") in cli_commands
    assert ("python console script", "billing-audit", "billing-audit", "setup.cfg") in cli_commands
    assert ("go command", "reconcile", "go run ./cmd/reconcile", "cmd/reconcile/main.go") in cli_commands
    assert ("rust binary", "billing-worker", "cargo run --bin billing-worker", "Cargo.toml") in cli_commands
    assert ("node executable", "billing.js", "./bin/billing.js", "bin/billing.js") in cli_commands
    assert ("shell executable", "export-ledger", "./bin/export-ledger", "bin/export-ledger") in cli_commands
    assert ("ruby executable", "billing_report", "./exe/billing_report", "exe/billing_report") in cli_commands

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"cli_command"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["node bin:billing-cli"]["metadata"]["detail"] == "package bin target ./bin/billing.js"
    assert by_key["python console script:billing-admin"]["metadata"]["source"] == "pyproject-scripts"
    assert by_key["python console script:billing-audit"]["metadata"]["source"] == "setup-cfg-entry-points"
    assert by_key["go command:reconcile"]["metadata"]["command"] == "go run ./cmd/reconcile"
    assert by_key["rust binary:billing-worker"]["metadata"]["detail"] == "Cargo binary target src/bin/billing_worker.rs"
    assert by_key["ruby executable:billing_report"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=30)
    assert any(item["source"] == "cli_command" for item in generated_cases)
    assert any(item["case"].expected_path == "package.json" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "cli_command" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_dev_environment_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / ".devcontainer").mkdir(parents=True)
    (source_repo / ".vscode").mkdir()
    (source_repo / "src").mkdir()
    (source_repo / ".devcontainer" / "devcontainer.json").write_text(
        "{\n"
        "  // JSONC comments are common in devcontainer files.\n"
        "  \"name\": \"Billing Dev Container\",\n"
        "  \"image\": \"mcr.microsoft.com/devcontainers/python:3.12\",\n"
        "  \"features\": {\"ghcr.io/devcontainers/features/node:1\": {\"version\": \"22\"}},\n"
        "  \"postCreateCommand\": \"pip install -e . && npm install\",\n"
        "  \"customizations\": {\"vscode\": {\"extensions\": [\"ms-python.python\", \"esbenp.prettier-vscode\"]}},\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / ".vscode" / "extensions.json").write_text(
        json.dumps({"recommendations": ["ms-azuretools.vscode-docker", "redhat.vscode-yaml"]}),
        encoding="utf-8",
    )
    (source_repo / ".vscode" / "settings.json").write_text(
        "{\n"
        "  \"python.testing.pytestEnabled\": true,\n"
        "  \"editor.formatOnSave\": true,\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "flake.nix").write_text(
        "{ pkgs, ... }: {\n"
        "  devShells.x86_64-linux.default = pkgs.mkShell {\n"
        "    packages = [ pkgs.nodejs_22 pkgs.python312 ];\n"
        "  };\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / ".envrc").write_text(
        "use flake\n",
        encoding="utf-8",
    )
    (source_repo / ".mise.toml").write_text(
        "[tools]\n"
        "node = \"22.2.0\"\n"
        "python = \"3.12.4\"\n",
        encoding="utf-8",
    )
    (source_repo / ".tool-versions").write_text(
        "ruby 3.3.4\n",
        encoding="utf-8",
    )
    (source_repo / "devbox.json").write_text(
        json.dumps({"packages": ["nodejs@22", "python312"]}),
        encoding="utf-8",
    )
    (source_repo / "Tiltfile").write_text(
        "docker_build('billing-api', '.')\n"
        "k8s_yaml('k8s/dev.yaml')\n"
        "local_resource('seed-db', 'python scripts/seed.py')\n",
        encoding="utf-8",
    )
    (source_repo / "skaffold.yaml").write_text(
        "apiVersion: skaffold/v4beta11\n"
        "kind: Config\n"
        "metadata:\n"
        "  name: billing-skaffold\n",
        encoding="utf-8",
    )
    (source_repo / "Procfile.dev").write_text(
        "web: npm run dev\n"
        "worker: python -m billing.worker\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "app.py").write_text(
        "def main():\n"
        "    return 'ok'\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("dev-environments", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "dev_environment", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "how do i setup the dev environment devcontainer vscode nix direnv mise tilt skaffold", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    dev_environments = {
        (item["tool"], item["category"], item["name"], item["source_path"])
        for item in overview["dev_environments"]
    }
    assert ("Dev Containers", "dev container", "Billing Dev Container", ".devcontainer/devcontainer.json") in dev_environments
    assert ("Dev Containers", "setup command", "postCreateCommand", ".devcontainer/devcontainer.json") in dev_environments
    assert ("VS Code", "editor extension", "ms-python.python", ".devcontainer/devcontainer.json") in dev_environments
    assert ("VS Code", "editor extension", "ms-azuretools.vscode-docker", ".vscode/extensions.json") in dev_environments
    assert ("VS Code", "editor settings", ".vscode/settings.json", ".vscode/settings.json") in dev_environments
    assert ("Nix", "nix shell", "flake default", "flake.nix") in dev_environments
    assert ("direnv", "direnv", "use flake", ".envrc") in dev_environments
    assert ("mise", "tool version", "node", ".mise.toml") in dev_environments
    assert ("asdf", "tool version", "ruby", ".tool-versions") in dev_environments
    assert ("Devbox", "dev shell", "devbox", "devbox.json") in dev_environments
    assert ("Tilt", "cluster dev loop", "Tiltfile", "Tiltfile") in dev_environments
    assert ("Skaffold", "cluster dev loop", "billing-skaffold", "skaffold.yaml") in dev_environments
    assert ("Procfile", "local process", "web", "Procfile.dev") in dev_environments

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"dev_environment"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["Dev Containers:dev container:Billing Dev Container"]["metadata"]["detail"] == "image mcr.microsoft.com/devcontainers/python:3.12; 1 features"
    assert by_key["Dev Containers:setup command:postCreateCommand"]["value"] == "pip install -e . && npm install"
    assert by_key["VS Code:editor extension:ms-azuretools.vscode-docker"]["metadata"]["source"] == "vscode-recommendations"
    assert by_key["Nix:nix shell:flake default"]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_key["Procfile:local process:web"]["metadata"]["detail"] == "npm run dev"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=40)
    assert any(item["source"] == "dev_environment" for item in generated_cases)
    assert any(item["case"].expected_path == ".devcontainer/devcontainer.json" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "dev_environment" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_build_system_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "native").mkdir(parents=True)
    (source_repo / "services" / "payments").mkdir(parents=True)
    (source_repo / "src" / "Billing.Service").mkdir(parents=True)
    (source_repo / "apps" / "mobile" / "Billing.xcodeproj").mkdir(parents=True)
    (source_repo / "Billing.xcworkspace").mkdir()
    (source_repo / "pom.xml").write_text(
        "<project>\n"
        "  <modelVersion>4.0.0</modelVersion>\n"
        "  <groupId>com.example.billing</groupId>\n"
        "  <artifactId>billing-parent</artifactId>\n"
        "  <packaging>pom</packaging>\n"
        "  <modules>\n"
        "    <module>invoice-core</module>\n"
        "  </modules>\n"
        "</project>\n",
        encoding="utf-8",
    )
    (source_repo / "settings.gradle.kts").write_text(
        "rootProject.name = \"billing-gradle\"\n"
        "include(\":billing-api\", \":ledger-worker\")\n",
        encoding="utf-8",
    )
    (source_repo / "build.gradle.kts").write_text(
        "plugins {\n"
        "  id(\"org.springframework.boot\") version \"3.3.0\"\n"
        "}\n"
        "tasks.register(\"generateLedgerClient\") {}\n",
        encoding="utf-8",
    )
    (source_repo / "native" / "CMakeLists.txt").write_text(
        "cmake_minimum_required(VERSION 3.26)\n"
        "project(LedgerNative)\n"
        "add_executable(ledgerctl main.cpp)\n"
        "add_library(ledgercore ledger.cpp)\n",
        encoding="utf-8",
    )
    (source_repo / "services" / "payments" / "BUILD.bazel").write_text(
        "java_binary(\n"
        "    name = \"billing_server\",\n"
        "    srcs = [\"Server.java\"],\n"
        ")\n"
        "py_test(name = \"ledger_query_test\", srcs = [\"test_ledger.py\"])\n",
        encoding="utf-8",
    )
    (source_repo / "meson.build").write_text(
        "project('ledger-meson-suite', 'cpp')\n"
        "executable('ledger-meson', 'main.cpp')\n",
        encoding="utf-8",
    )
    (source_repo / "build.sbt").write_text(
        "name := \"ledger-sbt\"\n"
        "lazy val api = project\n",
        encoding="utf-8",
    )
    (source_repo / "mix.exs").write_text(
        "defmodule Billing.MixProject do\n"
        "  def project do\n"
        "    [app: :billing_app, version: \"0.1.0\"]\n"
        "  end\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "Billing.Service" / "Billing.Service.csproj").write_text(
        "<Project Sdk=\"Microsoft.NET.Sdk.Web\">\n"
        "  <PropertyGroup>\n"
        "    <AssemblyName>Billing.Service</AssemblyName>\n"
        "    <TargetFramework>net8.0</TargetFramework>\n"
        "    <OutputType>Exe</OutputType>\n"
        "  </PropertyGroup>\n"
        "</Project>\n",
        encoding="utf-8",
    )
    (source_repo / "BillingSuite.sln").write_text(
        "Microsoft Visual Studio Solution File, Format Version 12.00\n"
        "Project(\"{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}\") = \"Billing.Service\", "
        "\"src\\Billing.Service\\Billing.Service.csproj\", \"{11111111-1111-1111-1111-111111111111}\"\n"
        "EndProject\n",
        encoding="utf-8",
    )
    (source_repo / "Makefile").write_text(
        "assets:\n"
        "\tpython scripts/build_assets.py\n",
        encoding="utf-8",
    )
    (source_repo / "Justfile").write_text(
        "release:\n"
        "    ./scripts/release.sh\n",
        encoding="utf-8",
    )
    (source_repo / "apps" / "mobile" / "Billing.xcodeproj" / "project.pbxproj").write_text(
        "// !$*UTF8*$!\n",
        encoding="utf-8",
    )
    (source_repo / "Billing.xcworkspace" / "contents.xcworkspacedata").write_text(
        "<Workspace version=\"1.0\"></Workspace>\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("build-systems", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "build_system", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "how do i build compile targets modules gradle maven cmake bazel dotnet xcode", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    build_systems = {
        (item["tool"], item["category"], item["name"], item["source_path"])
        for item in overview["build_systems"]
    }
    assert ("Maven", "project", "billing-parent", "pom.xml") in build_systems
    assert ("Maven", "module", "invoice-core", "pom.xml") in build_systems
    assert ("Gradle", "project", "billing-gradle", "settings.gradle.kts") in build_systems
    assert ("Gradle", "module", "billing-api", "settings.gradle.kts") in build_systems
    assert ("Gradle", "plugin", "org.springframework.boot", "build.gradle.kts") in build_systems
    assert ("Gradle", "task", "generateLedgerClient", "build.gradle.kts") in build_systems
    assert ("CMake", "executable", "ledgerctl", "native/CMakeLists.txt") in build_systems
    assert ("CMake", "library", "ledgercore", "native/CMakeLists.txt") in build_systems
    assert ("Bazel", "target", "//services/payments:billing_server", "services/payments/BUILD.bazel") in build_systems
    assert ("Meson", "executable", "ledger-meson", "meson.build") in build_systems
    assert ("SBT", "module", "api", "build.sbt") in build_systems
    assert ("Mix", "project", "billing_app", "mix.exs") in build_systems
    assert (".NET", "solution", "BillingSuite", "BillingSuite.sln") in build_systems
    assert (".NET", "project", "Billing.Service", "src/Billing.Service/Billing.Service.csproj") in build_systems
    assert ("Make", "target", "assets", "Makefile") in build_systems
    assert ("Just", "task", "release", "Justfile") in build_systems
    assert ("Xcode", "project", "Billing", "apps/mobile/Billing.xcodeproj/project.pbxproj") in build_systems
    assert ("Xcode", "workspace", "Billing", "Billing.xcworkspace/contents.xcworkspacedata") in build_systems

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"build_system"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["Maven:module:invoice-core"]["metadata"]["command"] == "mvn -pl invoice-core test"
    assert by_key["Gradle:task:generateLedgerClient"]["value"] == "./gradlew generateLedgerClient"
    assert by_key["Bazel:target://services/payments:billing_server"]["metadata"]["source"] == "java_binary"
    assert by_key[".NET:project:Billing.Service"]["metadata"]["detail"] == "target net8.0; output Exe"
    assert by_key["Xcode:workspace:Billing"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=40)
    assert any(item["source"] == "build_system" for item in generated_cases)
    assert any(item["case"].expected_path == "services/payments/BUILD.bazel" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "build_system" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_test_system_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "services" / "payments").mkdir(parents=True)
    (source_repo / "native").mkdir()
    (source_repo / "tests").mkdir()
    (source_repo / "src" / "Billing.Tests").mkdir(parents=True)
    (source_repo / "test").mkdir()
    (source_repo / "package.json").write_text(
        json.dumps({
            "scripts": {
                "test": "vitest run --config vitest.config.ts",
                "test:e2e": "playwright test --config playwright.config.ts",
            },
            "devDependencies": {
                "vitest": "^1.6.0",
                "@playwright/test": "^1.44.0",
                "cypress": "^13.8.0",
                "@testing-library/react": "^15.0.0",
            },
        }),
        encoding="utf-8",
    )
    (source_repo / "vitest.config.ts").write_text(
        "import { defineConfig } from 'vitest/config'\n"
        "export default defineConfig({ test: { environment: 'jsdom' } })\n",
        encoding="utf-8",
    )
    (source_repo / "playwright.config.ts").write_text(
        "export default { testDir: './e2e' }\n",
        encoding="utf-8",
    )
    (source_repo / "pyproject.toml").write_text(
        "[project]\n"
        "name = 'billing-tests'\n"
        "dependencies = ['pytest>=8', 'hypothesis>=6']\n"
        "[project.optional-dependencies]\n"
        "test = ['tox>=4', 'nox>=2024.4']\n"
        "[tool.pytest.ini_options]\n"
        "testpaths = ['tests']\n",
        encoding="utf-8",
    )
    (source_repo / "pytest.ini").write_text(
        "[pytest]\n"
        "addopts = -q\n",
        encoding="utf-8",
    )
    (source_repo / "tox.ini").write_text(
        "[tox]\n"
        "envlist = py312\n"
        "[testenv:py312]\n"
        "commands = pytest\n",
        encoding="utf-8",
    )
    (source_repo / "noxfile.py").write_text(
        "import nox\n"
        "@nox.session\n"
        "def unit(session):\n"
        "    session.run('pytest')\n",
        encoding="utf-8",
    )
    (source_repo / "conftest.py").write_text(
        "def pytest_configure(config):\n"
        "    pass\n",
        encoding="utf-8",
    )
    (source_repo / "pom.xml").write_text(
        "<project>\n"
        "  <dependencies>\n"
        "    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency>\n"
        "  </dependencies>\n"
        "  <build><plugins><plugin><artifactId>maven-surefire-plugin</artifactId></plugin></plugins></build>\n"
        "</project>\n",
        encoding="utf-8",
    )
    (source_repo / "build.gradle.kts").write_text(
        "dependencies { testImplementation(\"org.mockito:mockito-core:5.11.0\") }\n"
        "tasks.test { useJUnitPlatform() }\n",
        encoding="utf-8",
    )
    (source_repo / "services" / "payments" / "BUILD.bazel").write_text(
        "py_test(\n"
        "    name = \"billing_api_test\",\n"
        "    srcs = [\"test_billing.py\"],\n"
        ")\n",
        encoding="utf-8",
    )
    (source_repo / "native" / "CMakeLists.txt").write_text(
        "enable_testing()\n"
        "add_test(NAME ledger_native_test COMMAND ledger_test)\n"
        "gtest_discover_tests(ledger_google_test)\n",
        encoding="utf-8",
    )
    (source_repo / "Makefile").write_text(
        "test:\n"
        "\tpytest\n",
        encoding="utf-8",
    )
    (source_repo / "Justfile").write_text(
        "integration-test:\n"
        "    cargo test --test integration\n",
        encoding="utf-8",
    )
    (source_repo / "composer.json").write_text(
        json.dumps({
            "scripts": {"test": "phpunit --configuration phpunit.xml"},
            "require-dev": {"phpunit/phpunit": "^10.0", "pestphp/pest": "^2.0"},
        }),
        encoding="utf-8",
    )
    (source_repo / "phpunit.xml").write_text(
        "<phpunit bootstrap=\"vendor/autoload.php\"></phpunit>\n",
        encoding="utf-8",
    )
    (source_repo / "Gemfile").write_text(
        "source 'https://rubygems.org'\n"
        "gem 'rspec'\n"
        "gem 'capybara'\n",
        encoding="utf-8",
    )
    (source_repo / ".rspec").write_text(
        "--format documentation\n",
        encoding="utf-8",
    )
    (source_repo / "Cargo.toml").write_text(
        "[package]\n"
        "name = 'billing-rust'\n"
        "version = '0.1.0'\n"
        "[dev-dependencies]\n"
        "rstest = '0.21'\n"
        "proptest = '1.4'\n",
        encoding="utf-8",
    )
    (source_repo / "tests" / "ledger_integration.rs").write_text(
        "#[test]\n"
        "fn reconciles() {}\n",
        encoding="utf-8",
    )
    (source_repo / "go.mod").write_text(
        "module example.com/billing\n"
        "go 1.22\n",
        encoding="utf-8",
    )
    (source_repo / "billing_test.go").write_text(
        "package billing\n"
        "import \"testing\"\n"
        "func TestBilling(t *testing.T) {}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "Billing.Tests" / "Billing.Tests.csproj").write_text(
        "<Project Sdk=\"Microsoft.NET.Sdk\">\n"
        "  <PropertyGroup><IsTestProject>true</IsTestProject><TargetFramework>net8.0</TargetFramework></PropertyGroup>\n"
        "  <ItemGroup>\n"
        "    <PackageReference Include=\"Microsoft.NET.Test.Sdk\" Version=\"17.10.0\" />\n"
        "    <PackageReference Include=\"xunit\" Version=\"2.8.0\" />\n"
        "  </ItemGroup>\n"
        "</Project>\n",
        encoding="utf-8",
    )
    (source_repo / "billing.runsettings").write_text(
        "<RunSettings></RunSettings>\n",
        encoding="utf-8",
    )
    (source_repo / "pubspec.yaml").write_text(
        "name: billing_mobile\n"
        "dev_dependencies:\n"
        "  flutter_test:\n"
        "    sdk: flutter\n"
        "  integration_test:\n"
        "    sdk: flutter\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("test-systems", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "test_system", "limit": 140})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "how do i run tests pytest vitest playwright junit phpunit rspec dotnet go cargo", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    test_systems = {
        (item["tool"], item["category"], item["name"], item["source_path"])
        for item in overview["test_systems"]
    }
    assert ("Vitest", "script", "test", "package.json") in test_systems
    assert ("Playwright", "script", "test:e2e", "package.json") in test_systems
    assert ("Cypress", "framework", "cypress", "package.json") in test_systems
    assert ("Testing Library", "library", "@testing-library/react", "package.json") in test_systems
    assert ("Vitest", "config", "vitest.config.ts", "vitest.config.ts") in test_systems
    assert ("pytest", "config", "tool.pytest", "pyproject.toml") in test_systems
    assert ("tox", "environment", "testenv:py312", "tox.ini") in test_systems
    assert ("nox", "session", "unit", "noxfile.py") in test_systems
    assert ("JUnit", "framework", "junit-jupiter", "pom.xml") in test_systems
    assert ("Surefire", "plugin", "maven-surefire-plugin", "pom.xml") in test_systems
    assert ("Mockito", "mocking library", "mockito-core", "build.gradle.kts") in test_systems
    assert ("Bazel", "target", "//services/payments:billing_api_test", "services/payments/BUILD.bazel") in test_systems
    assert ("CTest", "target", "ledger_native_test", "native/CMakeLists.txt") in test_systems
    assert (".NET test", "project", "Billing.Tests", "src/Billing.Tests/Billing.Tests.csproj") in test_systems
    assert ("PHPUnit", "framework", "phpunit/phpunit", "composer.json") in test_systems
    assert ("RSpec", "framework", "rspec", "Gemfile") in test_systems
    assert ("Cargo test", "runner", "cargo test", "Cargo.toml") in test_systems
    assert ("go test", "runner", "go test ./...", "go.mod") in test_systems
    assert ("Flutter test", "framework", "flutter_test", "pubspec.yaml") in test_systems

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"test_system"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["Vitest:script:test"]["value"] == "npm run test"
    assert by_key["Playwright:script:test:e2e"]["metadata"]["detail"] == "playwright test --config playwright.config.ts"
    assert by_key["pytest:config:tool.pytest"]["metadata"]["source"] == "pyproject-pytest"
    assert by_key["Bazel:target://services/payments:billing_api_test"]["metadata"]["command"] == "bazel test //services/payments:billing_api_test"
    assert by_key[".NET test:project:Billing.Tests"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=45)
    assert any(item["source"] == "test_system" for item in generated_cases)
    assert any(item["case"].expected_path == "package.json" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "test_system" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_release_process_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / ".github" / "workflows").mkdir(parents=True)
    (source_repo / ".changeset").mkdir()
    (source_repo / "src").mkdir()
    (source_repo / "package.json").write_text(
        json.dumps({
            "name": "billing-release-suite",
            "version": "2.4.0",
            "publishConfig": {"registry": "https://registry.npmjs.org"},
            "scripts": {
                "release": "semantic-release",
                "publish:npm": "changeset publish",
                "version-packages": "changeset version",
            },
            "devDependencies": {
                "semantic-release": "^24.0.0",
                "@changesets/cli": "^2.27.0",
                "release-it": "^17.0.0",
            },
        }),
        encoding="utf-8",
    )
    (source_repo / ".releaserc.json").write_text(
        json.dumps({"branches": ["main", "next"], "plugins": ["@semantic-release/npm"]}),
        encoding="utf-8",
    )
    (source_repo / ".changeset" / "config.json").write_text(
        json.dumps({"baseBranch": "main", "changelog": ["@changesets/changelog-github", {"repo": "example/billing"}]}),
        encoding="utf-8",
    )
    (source_repo / ".changeset" / "late-billing-release.md").write_text(
        "---\n"
        "\"billing-release-suite\": minor\n"
        "---\n"
        "Add release metadata.\n",
        encoding="utf-8",
    )
    (source_repo / "release-please-config.json").write_text(
        json.dumps({"packages": {".": {"release-type": "node"}, "python": {"release-type": "python"}}}),
        encoding="utf-8",
    )
    (source_repo / ".goreleaser.yml").write_text(
        "project_name: billingctl\n"
        "brews:\n"
        "  - repository:\n"
        "      owner: example\n"
        "dockers:\n"
        "  - image_templates: ['ghcr.io/example/billingctl:{{ .Tag }}']\n",
        encoding="utf-8",
    )
    (source_repo / ".github" / "workflows" / "release.yml").write_text(
        "name: Release Billing\n"
        "on:\n"
        "  push:\n"
        "    tags:\n"
        "      - 'v*'\n"
        "jobs:\n"
        "  release:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - uses: actions/checkout@v4\n"
        "      - run: semantic-release\n"
        "      - uses: googleapis/release-please-action@v4\n"
        "      - uses: goreleaser/goreleaser-action@v6\n"
        "      - uses: pypa/gh-action-pypi-publish@release/v1\n",
        encoding="utf-8",
    )
    (source_repo / "pyproject.toml").write_text(
        "[project]\n"
        "name = 'billing-python'\n"
        "version = '1.2.3'\n"
        "dependencies = ['twine>=5', 'build>=1', 'python-semantic-release>=9', 'towncrier>=23']\n"
        "[tool.semantic_release]\n"
        "version_toml = ['pyproject.toml:project.version']\n"
        "[tool.towncrier]\n"
        "package = 'billing'\n",
        encoding="utf-8",
    )
    (source_repo / "Cargo.toml").write_text(
        "[package]\n"
        "name = 'billing-rust'\n"
        "version = '0.3.0'\n"
        "publish = ['crates-io']\n"
        "[dev-dependencies]\n"
        "cargo-release = '0.25'\n",
        encoding="utf-8",
    )
    (source_repo / "composer.json").write_text(
        json.dumps({
            "name": "example/billing-php",
            "version": "1.0.0",
            "scripts": {"release": "git tag && composer archive"},
            "require-dev": {"consolidation/robo": "^4.0"},
        }),
        encoding="utf-8",
    )
    (source_repo / "Gemfile").write_text(
        "source 'https://rubygems.org'\n"
        "gem 'gem-release'\n"
        "gem 'rake'\n",
        encoding="utf-8",
    )
    (source_repo / "billing.gemspec").write_text(
        "Gem::Specification.new do |spec|\n"
        "  spec.name = 'billing-ruby'\n"
        "  spec.version = Billing::VERSION\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "Makefile").write_text(
        "release:\n"
        "\t./scripts/release.sh\n",
        encoding="utf-8",
    )
    (source_repo / "Justfile").write_text(
        "publish-crate:\n"
        "    cargo publish\n",
        encoding="utf-8",
    )
    (source_repo / "Rakefile").write_text(
        "task :release do\n"
        "  sh 'gem push pkg/billing.gem'\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "CHANGELOG.md").write_text(
        "# Changelog\n\n## 2.4.0\n\nRelease notes.\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "app.py").write_text(
        "def main():\n"
        "    return 'ok'\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("release-processes", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "release_process", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "how do i release publish version changelog semantic-release pypi cargo", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    release_processes = {
        (item["tool"], item["category"], item["name"], item["source_path"])
        for item in overview["release_processes"]
    }
    assert ("npm", "package version", "billing-release-suite", "package.json") in release_processes
    assert ("semantic-release", "script", "release", "package.json") in release_processes
    assert ("Changesets", "script", "publish:npm", "package.json") in release_processes
    assert ("semantic-release", "config", ".releaserc.json", ".releaserc.json") in release_processes
    assert ("Changesets", "config", "Changesets", ".changeset/config.json") in release_processes
    assert ("Changesets", "pending changeset", "late-billing-release", ".changeset/late-billing-release.md") in release_processes
    assert ("Release Please", "config", "release-please-config.json", "release-please-config.json") in release_processes
    assert ("GoReleaser", "config", "billingctl", ".goreleaser.yml") in release_processes
    assert ("GitHub Actions", "workflow", "Release Billing", ".github/workflows/release.yml") in release_processes
    assert ("PyPI", "publish action", "PyPI", ".github/workflows/release.yml") in release_processes
    assert ("Twine", "publish tool", "twine", "pyproject.toml") in release_processes
    assert ("Cargo", "registry", "billing-rust", "Cargo.toml") in release_processes
    assert ("Composer", "script", "release", "composer.json") in release_processes
    assert ("RubyGems", "package version", "billing-ruby", "billing.gemspec") in release_processes
    assert ("Make", "task", "release", "Makefile") in release_processes
    assert ("Just", "task", "publish-crate", "Justfile") in release_processes
    assert ("Changelog", "changelog", "CHANGELOG.md", "CHANGELOG.md") in release_processes

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"release_process"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["semantic-release:script:release"]["value"] == "npm run release"
    assert by_key["Release Please:config:release-please-config.json"]["metadata"]["detail"] == "packages: ., python"
    assert by_key["GoReleaser:config:billingctl"]["metadata"]["detail"] == "Homebrew tap; Docker image release"
    assert by_key["Cargo:registry:billing-rust"]["metadata"]["command"] == "cargo publish"
    assert by_key["GitHub Actions:workflow:Release Billing"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=50)
    assert any(item["source"] == "release_process" for item in generated_cases)
    assert any(item["case"].expected_path == "package.json" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "release_process" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_quality_tool_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / ".github" / "workflows").mkdir(parents=True)
    (source_repo / "sorbet").mkdir()
    (source_repo / "src").mkdir()
    (source_repo / "package.json").write_text(
        json.dumps({
            "name": "billing-quality-suite",
            "scripts": {
                "lint": "eslint src --max-warnings=0",
                "format": "prettier --check .",
                "typecheck": "tsc --noEmit",
                "quality": "biome check .",
            },
            "devDependencies": {
                "eslint": "^9.0.0",
                "@typescript-eslint/eslint-plugin": "^8.0.0",
                "prettier": "^3.0.0",
                "typescript": "^5.5.0",
                "@biomejs/biome": "^1.9.0",
                "stylelint": "^16.0.0",
            },
        }),
        encoding="utf-8",
    )
    (source_repo / "eslint.config.js").write_text("export default [];\n", encoding="utf-8")
    (source_repo / ".prettierrc.json").write_text('{"singleQuote": true}\n', encoding="utf-8")
    (source_repo / "biome.json").write_text('{"formatter": {"enabled": true}}\n', encoding="utf-8")
    (source_repo / "stylelint.config.js").write_text("export default {};\n", encoding="utf-8")
    (source_repo / "tsconfig.json").write_text('{"compilerOptions": {"strict": true}}\n', encoding="utf-8")
    (source_repo / "pyproject.toml").write_text(
        "[project]\n"
        "name = 'billing-quality-python'\n"
        "dependencies = ['ruff>=0.5', 'black>=24', 'mypy>=1.10', 'pyright>=1.1']\n"
        "[tool.ruff]\n"
        "line-length = 100\n"
        "[tool.black]\n"
        "line-length = 100\n"
        "[tool.mypy]\n"
        "strict = true\n",
        encoding="utf-8",
    )
    (source_repo / "requirements-dev.txt").write_text(
        "pylint==3.2.0\n"
        "bandit==1.7.9\n",
        encoding="utf-8",
    )
    (source_repo / "pyrightconfig.json").write_text('{"typeCheckingMode": "strict"}\n', encoding="utf-8")
    (source_repo / ".pylintrc").write_text("[MASTER]\nignore=build\n", encoding="utf-8")
    (source_repo / ".golangci.yml").write_text("run:\n  timeout: 5m\n", encoding="utf-8")
    (source_repo / "rustfmt.toml").write_text("edition = '2021'\n", encoding="utf-8")
    (source_repo / "clippy.toml").write_text("avoid-breaking-exported-api = false\n", encoding="utf-8")
    (source_repo / "pom.xml").write_text(
        "<project><build><plugins>"
        "<plugin><artifactId>maven-checkstyle-plugin</artifactId></plugin>"
        "<plugin><artifactId>spotbugs-maven-plugin</artifactId></plugin>"
        "<plugin><artifactId>maven-pmd-plugin</artifactId></plugin>"
        "</plugins></build></project>",
        encoding="utf-8",
    )
    (source_repo / "build.gradle.kts").write_text(
        "plugins { id(\"io.gitlab.arturbosch.detekt\") version \"1.23.6\" }\n"
        "plugins { id(\"org.jlleitschuh.gradle.ktlint\") version \"12.1.1\" }\n",
        encoding="utf-8",
    )
    (source_repo / "composer.json").write_text(
        json.dumps({
            "scripts": {"analyse": "phpstan analyse src", "format": "php-cs-fixer fix --dry-run"},
            "require-dev": {
                "phpstan/phpstan": "^1.11",
                "vimeo/psalm": "^5.0",
                "friendsofphp/php-cs-fixer": "^3.0",
            },
        }),
        encoding="utf-8",
    )
    (source_repo / "Gemfile").write_text(
        "source 'https://rubygems.org'\n"
        "gem 'rubocop'\n"
        "gem 'sorbet'\n"
        "gem 'brakeman'\n",
        encoding="utf-8",
    )
    (source_repo / "sorbet" / "config").write_text("--dir\n.\n", encoding="utf-8")
    (source_repo / ".shellcheckrc").write_text("severity=style\n", encoding="utf-8")
    (source_repo / ".pre-commit-config.yaml").write_text(
        "repos:\n"
        "  - repo: https://github.com/astral-sh/ruff-pre-commit\n"
        "  - repo: https://github.com/pre-commit/mirrors-mypy\n",
        encoding="utf-8",
    )
    (source_repo / ".github" / "workflows" / "quality.yml").write_text(
        "name: Quality Gate\n"
        "on: [push]\n"
        "jobs:\n"
        "  checks:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - run: pnpm lint\n"
        "      - run: pnpm typecheck\n"
        "      - run: ruff check .\n",
        encoding="utf-8",
    )
    (source_repo / "Makefile").write_text(
        "lint:\n"
        "\truff check .\n"
        "typecheck:\n"
        "\tmypy .\n",
        encoding="utf-8",
    )
    (source_repo / "Justfile").write_text(
        "format:\n"
        "    prettier --check .\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "app.ts").write_text(
        "export function main(): string { return 'ok'; }\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("quality-tools", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "quality_tool", "limit": 160})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "how do i lint format typecheck static analysis ruff eslint prettier phpstan rubocop", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    quality_tools = {
        (item["tool"], item["category"], item["name"], item["source_path"])
        for item in overview["quality_tools"]
    }
    assert ("ESLint", "script", "lint", "package.json") in quality_tools
    assert ("Prettier", "script", "format", "package.json") in quality_tools
    assert ("TypeScript", "script", "typecheck", "package.json") in quality_tools
    assert ("Biome", "script", "quality", "package.json") in quality_tools
    assert ("ESLint", "linter", "eslint", "package.json") in quality_tools
    assert ("Prettier", "formatter", "prettier", "package.json") in quality_tools
    assert ("TypeScript", "typecheck", "typescript", "package.json") in quality_tools
    assert ("ESLint", "linter config", "eslint.config.js", "eslint.config.js") in quality_tools
    assert ("Prettier", "formatter config", ".prettierrc.json", ".prettierrc.json") in quality_tools
    assert ("Biome", "static analysis config", "biome.json", "biome.json") in quality_tools
    assert ("Stylelint", "linter config", "stylelint.config.js", "stylelint.config.js") in quality_tools
    assert ("TypeScript", "typecheck config", "tsconfig.json", "tsconfig.json") in quality_tools
    assert ("Ruff", "linter config", "tool.ruff", "pyproject.toml") in quality_tools
    assert ("Black", "formatter config", "tool.black", "pyproject.toml") in quality_tools
    assert ("mypy", "typecheck config", "tool.mypy", "pyproject.toml") in quality_tools
    assert ("Pyright", "typecheck config", "pyrightconfig.json", "pyrightconfig.json") in quality_tools
    assert ("Pylint", "linter config", ".pylintrc", ".pylintrc") in quality_tools
    assert ("golangci-lint", "linter config", ".golangci.yml", ".golangci.yml") in quality_tools
    assert ("rustfmt", "formatter config", "rustfmt.toml", "rustfmt.toml") in quality_tools
    assert ("Clippy", "linter config", "clippy.toml", "clippy.toml") in quality_tools
    assert ("Checkstyle", "plugin", "maven-checkstyle-plugin", "pom.xml") in quality_tools
    assert ("SpotBugs", "plugin", "spotbugs-maven-plugin", "pom.xml") in quality_tools
    assert ("PHPStan", "script", "analyse", "composer.json") in quality_tools
    assert ("Psalm", "static analysis", "vimeo/psalm", "composer.json") in quality_tools
    assert ("RuboCop", "linter", "rubocop", "Gemfile") in quality_tools
    assert ("Sorbet", "typecheck config", "sorbet/config", "sorbet/config") in quality_tools
    assert ("ShellCheck", "linter config", ".shellcheckrc", ".shellcheckrc") in quality_tools
    assert ("pre-commit", "hook config", ".pre-commit-config", ".pre-commit-config.yaml") in quality_tools
    assert ("Ruff", "hook", "ruff-pre-commit", ".pre-commit-config.yaml") in quality_tools
    assert ("Ruff", "workflow command", "Quality Gate:Ruff", ".github/workflows/quality.yml") in quality_tools
    assert ("Ruff", "task", "lint", "Makefile") in quality_tools
    assert ("Prettier", "task", "format", "Justfile") in quality_tools

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"quality_tool"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["ESLint:script:lint"]["value"] == "npm run lint"
    assert by_key["Ruff:linter config:tool.ruff"]["metadata"]["command"] == "ruff check ."
    assert by_key["TypeScript:typecheck config:tsconfig.json"]["metadata"]["command"] == "npx tsc --noEmit -p tsconfig.json"
    assert by_key["pre-commit:hook config:.pre-commit-config"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=60)
    assert any(item["source"] == "quality_tool" for item in generated_cases)
    assert any(item["case"].expected_path == "package.json" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "quality_tool" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_architecture_decision_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "docs" / "adr").mkdir(parents=True)
    (source_repo / "docs" / "rfcs").mkdir(parents=True)
    (source_repo / "docs" / "architecture").mkdir(parents=True)
    (source_repo / "docs" / "decisions").mkdir(parents=True)
    (source_repo / "src").mkdir()
    (source_repo / "docs" / "adr" / "0001-use-transactional-outbox-for-billing-events.md").write_text(
        "# Use Transactional Outbox For Billing Events\n\n"
        "Status: Accepted\n\n"
        "The billing service writes domain events beside invoice mutations so workers can replay failed delivery safely.\n\n"
        "## Consequences\n\n"
        "Consumers must handle duplicate delivery.\n",
        encoding="utf-8",
    )
    (source_repo / "docs" / "rfcs" / "0007-ledger-reconciliation-windows.md").write_text(
        "# RFC 0007: Ledger Reconciliation Windows\n\n"
        "Status: Proposed\n\n"
        "Reconciliation windows should close after bank settlement plus a configurable delay for late provider adjustments.\n",
        encoding="utf-8",
    )
    (source_repo / "docs" / "architecture" / "runtime-topology.md").write_text(
        "# Runtime Topology For Billing Workbench\n\n"
        "The web process handles API traffic while the worker process owns indexing and enrichment queues.\n",
        encoding="utf-8",
    )
    (source_repo / "docs" / "decisions" / "payment-idempotency-key-strategy.md").write_text(
        "# Payment Idempotency Key Strategy\n\n"
        "State: Superseded\n\n"
        "Older payment retries used invoice identifiers before PSP-scoped idempotency keys became the stable contract.\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "app.py").write_text(
        "def main():\n"
        "    return 'ok'\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("architecture-decisions", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "architecture_decision", "limit": 80})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "why did architecture choose transactional outbox adr rfc design decision", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    decisions = {
        (item["status"], item["category"], item["name"], item["source_path"])
        for item in overview["architecture_decisions"]
    }
    assert ("Accepted", "adr", "Use Transactional Outbox For Billing Events", "docs/adr/0001-use-transactional-outbox-for-billing-events.md") in decisions
    assert ("Proposed", "rfc", "RFC 0007: Ledger Reconciliation Windows", "docs/rfcs/0007-ledger-reconciliation-windows.md") in decisions
    assert ("", "architecture doc", "Runtime Topology For Billing Workbench", "docs/architecture/runtime-topology.md") in decisions
    assert ("Superseded", "decision log", "Payment Idempotency Key Strategy", "docs/decisions/payment-idempotency-key-strategy.md") in decisions

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"architecture_decision"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["Accepted:adr:Use Transactional Outbox For Billing Events"]["source_path"] == "docs/adr/0001-use-transactional-outbox-for-billing-events.md"
    assert by_key["Accepted:adr:Use Transactional Outbox For Billing Events"]["metadata"]["status"] == "Accepted"
    assert "invoice mutations" in by_key["Accepted:adr:Use Transactional Outbox For Billing Events"]["value"]
    assert by_key["Proposed:rfc:RFC 0007: Ledger Reconciliation Windows"]["metadata"]["category"] == "rfc"
    assert by_key["Superseded:decision log:Payment Idempotency Key Strategy"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=70)
    assert any(item["source"] == "architecture_decision" for item in generated_cases)
    assert any(item["case"].expected_path == "docs/adr/0001-use-transactional-outbox-for-billing-events.md" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "architecture_decision" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_mobile_surface_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "android" / "app" / "src" / "main").mkdir(parents=True)
    (source_repo / "android" / "app" / "src" / "main" / "java" / "com" / "example" / "ledger").mkdir(parents=True)
    (source_repo / "ios" / "LedgerMobile").mkdir(parents=True)
    (source_repo / "lib").mkdir()
    (source_repo / "package.json").write_text(
        json.dumps({
            "name": "ledger-mobile-suite",
            "displayName": "Ledger Mobile Suite",
            "dependencies": {
                "expo": "^51.0.0",
                "react-native": "0.74.0",
            },
        }),
        encoding="utf-8",
    )
    (source_repo / "app.json").write_text(
        json.dumps({
            "expo": {
                "name": "Ledger Mobile",
                "slug": "ledger-mobile",
                "scheme": ["ledgermobile", "ledger-payments"],
            }
        }),
        encoding="utf-8",
    )
    (source_repo / "android" / "app" / "src" / "main" / "AndroidManifest.xml").write_text(
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.ledger">\n'
        '  <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n'
        '  <application android:name=".LedgerApplication">\n'
        '    <activity android:name=".MainActivity" android:exported="true" />\n'
        '    <service android:name=".LedgerSyncService" />\n'
        '  </application>\n'
        '</manifest>\n',
        encoding="utf-8",
    )
    (source_repo / "android" / "app" / "src" / "main" / "java" / "com" / "example" / "ledger" / "MainActivity.kt").write_text(
        "package com.example.ledger\n"
        "class MainActivity : ReactActivity() {}\n",
        encoding="utf-8",
    )
    (source_repo / "ios" / "LedgerMobile" / "Info.plist").write_text(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" "
        "\"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
        "<plist version=\"1.0\">\n"
        "<dict>\n"
        "  <key>CFBundleDisplayName</key><string>Ledger Mobile</string>\n"
        "  <key>CFBundleIdentifier</key><string>com.example.ledger.ios</string>\n"
        "  <key>CFBundleURLTypes</key>\n"
        "  <array><dict><key>CFBundleURLSchemes</key><array><string>ledgermobileios</string></array></dict></array>\n"
        "</dict>\n"
        "</plist>\n",
        encoding="utf-8",
    )
    (source_repo / "pubspec.yaml").write_text(
        "name: ledger_flutter\n"
        "dependencies:\n"
        "  flutter:\n"
        "    sdk: flutter\n",
        encoding="utf-8",
    )
    (source_repo / "lib" / "main.dart").write_text(
        "import 'package:flutter/widgets.dart';\n"
        "void main() => runApp(const LedgerFlutterApp());\n"
        "class LedgerFlutterApp extends StatelessWidget { const LedgerFlutterApp({super.key}); }\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("mobile-surfaces", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "mobile_surface", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "where are the mobile android ios flutter expo react native app surfaces", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    mobile_surfaces = {
        (item["platform"], item["category"], item["name"], item["source_path"])
        for item in overview["mobile_surfaces"]
    }
    assert ("Expo", "app", "Ledger Mobile Suite", "package.json") in mobile_surfaces
    assert ("React Native", "app", "Ledger Mobile Suite", "package.json") in mobile_surfaces
    assert ("Expo", "app", "Ledger Mobile", "app.json") in mobile_surfaces
    assert ("Expo", "url scheme", "ledgermobile", "app.json") in mobile_surfaces
    assert ("Android", "app", "com.example.ledger", "android/app/src/main/AndroidManifest.xml") in mobile_surfaces
    assert ("Android", "activity", ".MainActivity", "android/app/src/main/AndroidManifest.xml") in mobile_surfaces
    assert ("Android", "service", ".LedgerSyncService", "android/app/src/main/AndroidManifest.xml") in mobile_surfaces
    assert ("Android", "permission", "android.permission.POST_NOTIFICATIONS", "android/app/src/main/AndroidManifest.xml") in mobile_surfaces
    assert ("Android", "activity", "MainActivity", "android/app/src/main/java/com/example/ledger/MainActivity.kt") in mobile_surfaces
    assert ("iOS", "app", "Ledger Mobile", "ios/LedgerMobile/Info.plist") in mobile_surfaces
    assert ("iOS", "bundle id", "com.example.ledger.ios", "ios/LedgerMobile/Info.plist") in mobile_surfaces
    assert ("iOS", "url scheme", "ledgermobileios", "ios/LedgerMobile/Info.plist") in mobile_surfaces
    assert ("Flutter", "app", "ledger_flutter", "pubspec.yaml") in mobile_surfaces
    assert ("Flutter", "entry", "LedgerFlutterApp", "lib/main.dart") in mobile_surfaces

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"mobile_surface"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["Expo:app:Ledger Mobile"]["metadata"]["source"] == "expo-config"
    assert by_key["Android:activity:.MainActivity"]["metadata"]["source"] == "android-manifest"
    assert by_key["iOS:bundle id:com.example.ledger.ios"]["metadata"]["detail"] == "iOS bundle identifier"
    assert by_key["Flutter:entry:LedgerFlutterApp"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=35)
    assert any(item["source"] == "mobile_surface" for item in generated_cases)
    assert any(item["case"].expected_path == "android/app/src/main/AndroidManifest.xml" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "mobile_surface" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_api_contract_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "contracts").mkdir(parents=True)
    (source_repo / "proto").mkdir()
    (source_repo / "src").mkdir()
    (source_repo / "contracts" / "openapi.yaml").write_text(
        "openapi: 3.1.0\n"
        "info:\n"
        "  title: Billing Public API\n"
        "paths:\n"
        "  /v1/customers/{customerId}:\n"
        "    get:\n"
        "      operationId: getCustomerLedger\n"
        "  /v1/billing/session:\n"
        "    post:\n"
        "      summary: Create billing session\n"
        "components:\n"
        "  schemas:\n"
        "    CustomerLedgerResponse:\n"
        "      type: object\n",
        encoding="utf-8",
    )
    (source_repo / "contracts" / "asyncapi.yaml").write_text(
        "asyncapi: 3.0.0\n"
        "info:\n"
        "  title: Billing Events API\n"
        "channels:\n"
        "  billing.invoice.created:\n"
        "    address: billing.invoice.created\n"
        "    messages:\n"
        "      InvoiceCreatedMessage:\n"
        "        $ref: '#/components/messages/InvoiceCreatedMessage'\n"
        "components:\n"
        "  messages:\n"
        "    InvoiceCreatedMessage:\n"
        "      payload:\n"
        "        type: object\n",
        encoding="utf-8",
    )
    (source_repo / "contracts" / "billing.postman_collection.json").write_text(
        json.dumps({
            "info": {
                "name": "Billing operator collection",
                "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
            },
            "item": [
                {
                    "name": "Create Billing Session",
                    "request": {
                        "method": "POST",
                        "url": {"raw": "https://api.example.test/v1/billing/session"},
                    },
                }
            ],
        }),
        encoding="utf-8",
    )
    (source_repo / "proto" / "billing.proto").write_text(
        'syntax = "proto3";\n'
        "package billing.v1;\n"
        "service BillingLedgerService {\n"
        "  rpc GetLedger (GetLedgerRequest) returns (CustomerLedgerResponse);\n"
        "}\n"
        "message GetLedgerRequest {\n"
        "  string customer_id = 1;\n"
        "}\n"
        "message CustomerLedgerResponse {\n"
        "  string customer_id = 1;\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "main.ts").write_text("export const ok = true;\n", encoding="utf-8")

    repo = registry.create_repo("api-contracts", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "api_contract", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "where are the openapi asyncapi postman grpc protobuf api contracts", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    api_contracts = {
        (item["protocol"], item["category"], item["name"], item["source_path"])
        for item in overview["api_contracts"]
    }
    assert ("OpenAPI", "document", "Billing Public API", "contracts/openapi.yaml") in api_contracts
    assert ("OpenAPI", "operation", "GET /v1/customers/{customerId}", "contracts/openapi.yaml") in api_contracts
    assert ("OpenAPI", "operation", "POST /v1/billing/session", "contracts/openapi.yaml") in api_contracts
    assert ("OpenAPI", "schema", "CustomerLedgerResponse", "contracts/openapi.yaml") in api_contracts
    assert ("AsyncAPI", "document", "Billing Events API", "contracts/asyncapi.yaml") in api_contracts
    assert ("AsyncAPI", "channel", "billing.invoice.created", "contracts/asyncapi.yaml") in api_contracts
    assert ("AsyncAPI", "message", "InvoiceCreatedMessage", "contracts/asyncapi.yaml") in api_contracts
    assert ("Postman", "collection", "Billing operator collection", "contracts/billing.postman_collection.json") in api_contracts
    assert ("Postman", "request", "POST Create Billing Session", "contracts/billing.postman_collection.json") in api_contracts
    assert ("gRPC", "service", "BillingLedgerService", "proto/billing.proto") in api_contracts
    assert ("gRPC", "rpc", "GetLedger", "proto/billing.proto") in api_contracts
    assert ("Protocol Buffers", "message", "GetLedgerRequest", "proto/billing.proto") in api_contracts

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"api_contract"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["OpenAPI:operation:GET /v1/customers/{customerId}"]["metadata"]["protocol"] == "OpenAPI"
    assert by_key["AsyncAPI:channel:billing.invoice.created"]["metadata"]["source"] == "asyncapi"
    assert by_key["Postman:request:POST Create Billing Session"]["metadata"]["detail"] == "https://api.example.test/v1/billing/session"
    assert by_key["gRPC:service:BillingLedgerService"]["metadata"]["detail"] == "protobuf service in billing.v1"
    assert by_key["Protocol Buffers:message:GetLedgerRequest"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=30)
    assert any(item["source"] == "api_contract" for item in generated_cases)
    assert any(item["case"].expected_path == "contracts/openapi.yaml" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "api_contract" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_infrastructure_resource_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "infra").mkdir(parents=True)
    (source_repo / "src").mkdir()
    (source_repo / "infra" / "main.tf").write_text(
        'terraform {\n'
        '  backend "s3" {}\n'
        '}\n'
        'provider "aws" {\n'
        '  region = "us-east-1"\n'
        '}\n'
        'resource "aws_s3_bucket" "assets" {\n'
        '  bucket = "billing-assets"\n'
        '}\n'
        'data "aws_iam_policy_document" "assume_role" {}\n'
        'module "vpc" {\n'
        '  source = "terraform-aws-modules/vpc/aws"\n'
        '}\n',
        encoding="utf-8",
    )
    (source_repo / "infra" / "template.yaml").write_text(
        "AWSTemplateFormatVersion: '2010-09-09'\n"
        "Transform: AWS::Serverless-2016-10-31\n"
        "Resources:\n"
        "  BillingFunction:\n"
        "    Type: AWS::Serverless::Function\n"
        "    Properties:\n"
        "      Handler: app.handler\n"
        "  BillingQueue:\n"
        "    Type: AWS::SQS::Queue\n",
        encoding="utf-8",
    )
    (source_repo / "serverless.yml").write_text(
        "service: billing-platform\n"
        "provider:\n"
        "  name: aws\n"
        "functions:\n"
        "  chargeCustomer:\n"
        "    handler: src/charge.handler\n"
        "  invoiceWebhook:\n"
        "    handler: src/webhook.handler\n",
        encoding="utf-8",
    )
    (source_repo / "Pulumi.yaml").write_text(
        "name: billing-pulumi\n"
        "runtime: nodejs\n",
        encoding="utf-8",
    )
    (source_repo / "main.bicep").write_text(
        "resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {\n"
        "  name: 'billingstorage'\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "cdk.json").write_text(
        json.dumps({"app": "npx ts-node --prefer-ts-exts bin/billing.ts"}),
        encoding="utf-8",
    )
    (source_repo / "src" / "main.ts").write_text("export const ok = true;\n", encoding="utf-8")

    repo = registry.create_repo("infra-resources", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "infra_resource", "limit": 120})
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "which terraform cloudformation serverless pulumi bicep infra resources exist", "limit": 8},
        )

    assert overview_response.status_code == 200
    overview = overview_response.json()
    infra_resources = {
        (item["provider"], item["category"], item["resource_type"], item["name"], item["source_path"])
        for item in overview["infra_resources"]
    }
    assert ("AWS", "provider", "aws", "aws", "infra/main.tf") in infra_resources
    assert ("AWS", "resource", "aws_s3_bucket", "assets", "infra/main.tf") in infra_resources
    assert ("AWS", "data", "aws_iam_policy_document", "assume_role", "infra/main.tf") in infra_resources
    assert ("Terraform", "module", "module", "vpc", "infra/main.tf") in infra_resources
    assert ("Terraform", "state backend", "s3", "s3", "infra/main.tf") in infra_resources
    assert ("AWS", "resource", "AWS::Serverless::Function", "BillingFunction", "infra/template.yaml") in infra_resources
    assert ("AWS", "resource", "AWS::SQS::Queue", "BillingQueue", "infra/template.yaml") in infra_resources
    assert ("Serverless Framework", "service", "service", "billing-platform", "serverless.yml") in infra_resources
    assert ("Serverless Framework", "function", "function", "chargeCustomer", "serverless.yml") in infra_resources
    assert ("Pulumi", "project", "nodejs", "billing-pulumi", "Pulumi.yaml") in infra_resources
    assert ("Azure", "resource", "Microsoft.Storage/storageAccounts@2023-01-01", "storageAccount", "main.bicep") in infra_resources
    assert ("AWS CDK", "project", "cdk app", "cdk", "cdk.json") in infra_resources

    assert facts_response.status_code == 200
    facts = facts_response.json()["facts"]
    assert {fact["kind"] for fact in facts} == {"infra_resource"}
    by_key = {fact["key"]: fact for fact in facts}
    assert by_key["AWS:resource:aws_s3_bucket:assets"]["metadata"]["source"] == "terraform"
    assert by_key["Terraform:module:module:vpc"]["metadata"]["detail"].endswith("terraform-aws-modules/vpc/aws")
    assert by_key["Serverless Framework:function:function:chargeCustomer"]["metadata"]["source"] == "serverless"
    assert by_key["Pulumi:project:nodejs:billing-pulumi"]["metadata"]["provider"] == "Pulumi"
    assert by_key["Azure:resource:Microsoft.Storage/storageAccounts@2023-01-01:storageAccount"]["metadata"]["provenance"]["source"] == "parsed-source"

    generated_cases = build_smoke_queries_from_overview(overview, max_cases=30)
    assert any(item["source"] == "infra_resource" for item in generated_cases)
    assert any(item["case"].expected_path == "infra/main.tf" for item in generated_cases)

    assert teaching_response.status_code == 200
    assert any(item["kind"] == "infra_resource" for item in teaching_response.json()["evidence"])


def test_fast_index_persists_queryable_repo_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "src" / "graphql").mkdir(parents=True)
    (source_repo / "db").mkdir()
    (source_repo / "deploy").mkdir()
    (source_repo / "prisma").mkdir()
    (source_repo / "database" / "migrations").mkdir(parents=True)
    (source_repo / "tests").mkdir()
    (source_repo / "LICENSE").write_text(
        "MIT License\n\n"
        "Copyright (c) 2026 Example\n\n"
        "Permission is hereby granted, free of charge, to any person obtaining a copy.\n",
        encoding="utf-8",
    )
    (source_repo / "README.md").write_text(
        "# Sample\n\n"
        "Run npm test.\n\n"
        "## Billing setup guide\n\n"
        "Configure invoice tables before running the app.\n"
        "### Troubleshooting cache misses\n\n"
        "Check Redis and SQLite paths.\n",
        encoding="utf-8",
    )
    (source_repo / ".env.example").write_text(
        "DATABASE_URL=\n"
        "REDIS_URL=redis://localhost:6379\n"
        "S3_BUCKET=invoices-archive\n"
        "ELASTICSEARCH_URL=http://search:9200\n"
        "KAFKA_BROKERS=kafka_should_not_be_stored_2468\n"
        "SQS_QUEUE_URL=https://sqs.example/should_not_be_stored_2468\n"
        "RABBITMQ_PASSWORD=rabbitmq_should_not_be_stored_2468\n"
        "NEXTAUTH_SECRET=nextauth_should_not_be_stored_2468\n"
        "AUTH0_DOMAIN=tenant.example.auth0.com\n"
        "STRIPE_WEBHOOK_SECRET=whsec_should_not_be_stored_2468\n"
        "STRIPE_SECRET_KEY=sk_live_should_not_be_stored_payment_2468\n"
        "SENTRY_DSN=https://public@sentry.example/2468\n"
        "LD_SDK_KEY=ld_should_not_be_stored_2468\n"
        "SENDGRID_API_KEY=sg_should_not_be_stored_2468\n"
        "OPENAI_API_KEY=sk_ai_should_not_be_stored_2468\n"
        "GRAPHQL_ENDPOINT=https://graphql.example/should_not_be_stored_2468\n"
        "APOLLO_KEY=apollo_should_not_be_stored_2468\n"
        "BILLING_API_TOKEN=tok_live_should_not_be_stored_123456\n"
        "export FEATURE_FLAG=true\n",
        encoding="utf-8",
    )
    (source_repo / "SECURITY.md").write_text(
        "# Security policy\n\n"
        "Report vulnerabilities through the private disclosure address.\n",
        encoding="utf-8",
    )
    (source_repo / "Procfile").write_text(
        "web: gunicorn src.api:app\n"
        "worker: python -m src.worker\n",
        encoding="utf-8",
    )
    (source_repo / "vercel.json").write_text(
        json.dumps({"name": "billing-web", "framework": "nextjs", "buildCommand": "pnpm build"}),
        encoding="utf-8",
    )
    (source_repo / "deploy" / "billing.yaml").write_text(
        "apiVersion: apps/v1\n"
        "kind: Deployment\n"
        "metadata:\n"
        "  name: billing-api\n"
        "  namespace: billing\n"
        "spec:\n"
        "  template:\n"
        "    spec:\n"
        "      containers:\n"
        "        - name: api\n"
        "          image: ghcr.io/example/billing-api:2026.07\n"
        "---\n"
        "apiVersion: networking.k8s.io/v1\n"
        "kind: Ingress\n"
        "metadata:\n"
        "  name: billing-ingress\n",
        encoding="utf-8",
    )
    (source_repo / "docker-compose.yml").write_text(
        "services:\n"
        "  api:\n"
        "    image: sample-api\n"
        "    ports:\n"
        "      - '8080:80'\n"
        "    depends_on:\n"
        "      - db\n"
        "    environment:\n"
        "      API_DATABASE_URL: ${DATABASE_URL}\n"
        "      - WORKER_CONCURRENCY=4\n"
        "  worker:\n"
        "    image: sample-worker\n"
        "    command: celery -A src.tasks worker --loglevel=info\n"
        "    depends_on:\n"
        "      - db\n"
        "  db:\n"
        "    image: postgres:16\n"
        "  redis:\n"
        "    image: redis:7\n"
        "  kafka:\n"
        "    image: confluentinc/cp-kafka:7.6.1\n"
        "  rabbitmq:\n"
        "    image: rabbitmq:3-management\n"
        "  nats:\n"
        "    image: nats:2\n"
        "  search:\n"
        "    image: docker.elastic.co/elasticsearch/elasticsearch:8.14.0\n",
        encoding="utf-8",
    )
    (source_repo / ".github" / "workflows").mkdir(parents=True)
    (source_repo / ".github" / "CODEOWNERS").write_text(
        "# Billing owners\n"
        "/src/billing/* @platform/billing-team @security/reviewers\n"
        "*.md @docs/maintainers\n",
        encoding="utf-8",
    )
    (source_repo / ".github" / "workflows" / "ci.yml").write_text(
        "name: Billing CI\n"
        "on:\n"
        "  push:\n"
        "  pull_request:\n"
        "jobs:\n"
        "  test:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - run: pytest tests\n"
        "      - run: npm run build\n",
        encoding="utf-8",
    )
    (source_repo / "package.json").write_text(
        json.dumps({
            "scripts": {"test": "vitest run", "dev": "vite --host 0.0.0.0"},
            "engines": {"node": ">=20"},
            "license": "MIT",
            "dependencies": {
                "react": "^18.3.0",
                "next": "^14.2.0",
                "prisma": "^5.12.0",
                "stripe": "^16.0.0",
                "@sentry/react": "^8.0.0",
                "prom-client": "^15.1.0",
                "launchdarkly-node-server-sdk": "^9.5.0",
                "@sendgrid/mail": "^8.1.0",
                "twilio": "^5.2.0",
                "openai": "^4.0.0",
                "@anthropic-ai/sdk": "^0.24.0",
                "langchain": "^0.2.0",
                "graphql": "^16.9.0",
                "@apollo/server": "^4.11.0",
                "@apollo/client": "^3.10.0",
                "graphql-yoga": "^5.6.0",
                "pg": "^8.0.0",
                "redis": "^4.0.0",
                "mongodb": "^6.8.0",
                "@aws-sdk/client-s3": "^3.620.0",
                "@elastic/elasticsearch": "^8.14.0",
                "kafkajs": "^2.2.4",
                "amqplib": "^0.10.4",
                "nats": "^2.28.0",
                "@aws-sdk/client-sqs": "^3.620.0",
                "@aws-sdk/client-eventbridge": "^3.620.0",
                "@google-cloud/pubsub": "^4.5.0",
                "next-auth": "^4.24.0",
                "passport-jwt": "^4.0.1",
                "jose": "^5.2.0",
                "bullmq": "^5.7.0",
                "node-cron": "^3.0.3",
            },
            "devDependencies": {"vite": "^5.0.0", "vitest": "^1.6.0"},
        }),
        encoding="utf-8",
    )
    (source_repo / "requirements.txt").write_text(
        "celery==5.4.0\n"
        "sentry-sdk==2.8.0\n"
        "prometheus-client==0.20.0\n"
        "launchdarkly-server-sdk==9.8.0\n"
        "sendgrid==6.11.0\n"
        "twilio==9.2.0\n"
        "graphene==3.3\n"
        "strawberry-graphql==0.237.3\n"
        "confluent-kafka==2.5.0\n"
        "pika==1.3.2\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "ai.ts").write_text(
        "export async function explainInvoice(openai, invoiceText) {\n"
        "  const systemPrompt = 'Explain invoice changes for support agents'\n"
        "  await openai.chat.completions.create({ model: 'gpt-4.1-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: invoiceText }] })\n"
        "  return openai.embeddings.create({ model: 'text-embedding-3-small', input: invoiceText })\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "api.py").write_text(
        "from fastapi import FastAPI\n"
        "STRIPE_SECRET_KEY = 'sk_live_should_not_be_stored_987654'\n"
        "app = FastAPI()\n\n"
        "@app.get('/health')\n"
        "def health():\n"
        "    return {'ok': True}\n"
        "\n"
        "@app.post('/webhooks/stripe')\n"
        "def stripe_webhook(payload: bytes, signature: str):\n"
        "    return stripe.webhooks.constructEvent(payload, signature, STRIPE_SECRET_KEY)\n"
        "\n"
        "def create_checkout_session(stripe, customer_id):\n"
        "    return stripe.checkout.sessions.create(customer=customer_id, mode='payment')\n"
        "\n"
        "def create_payment_intent(stripe, amount):\n"
        "    return stripe.PaymentIntent.create(amount=amount, currency='usd')\n"
        "\n"
        "def connect_postgres():\n"
        "    return psycopg2.connect(DATABASE_URL)\n"
        "\n"
        "def connect_redis(redis):\n"
        "    return redis.Redis.from_url(REDIS_URL)\n"
        "\n"
        "def open_search():\n"
        "    return Elasticsearch(ELASTICSEARCH_URL)\n"
        "\n"
        "@app.get('/metrics')\n"
        "def metrics():\n"
        "    return generate_latest()\n"
        "\n"
        "import sentry_sdk\n"
        "sentry_sdk.init(dsn=SENTRY_DSN)\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "auth.py").write_text(
        "from fastapi import Depends\n"
        "from fastapi.security import OAuth2PasswordBearer\n\n"
        "oauth2_scheme = OAuth2PasswordBearer(tokenUrl='token')\n\n"
        "def get_current_user():\n"
        "    return {'user': 'demo'}\n\n"
        "def require_user(user = Depends(get_current_user)):\n"
        "    return user\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "tasks.py").write_text(
        "from celery import Celery\n\n"
        "celery_app = Celery('billing')\n\n"
        "@celery_app.task\n"
        "def send_invoice_email(invoice_id):\n"
        "    return invoice_id\n"
        "\n"
        "def invoice_redesign_enabled(ld_client, user):\n"
        "    return ld_client.variation('invoice-redesign', user, False)\n"
        "\n"
        "def send_invoice_sms(twilio_client, phone):\n"
        "    return twilio_client.messages.create(to=phone, from_='+15551234567', body='Invoice ready')\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "events.ts").write_text(
        "export async function publishInvoiceEvent(kafka, sqsClient, pubsub, eventBridge) {\n"
        "  const producer = kafka.producer()\n"
        "  await producer.send({ topic: 'invoice.created', messages: [{ value: 'created' }] })\n"
        "  const consumer = kafka.consumer({ groupId: 'billing' })\n"
        "  await consumer.subscribe({ topic: 'invoice.created' })\n"
        "  await sqsClient.send(new SendMessageCommand({ QueueUrl: process.env.SQS_QUEUE_URL, MessageBody: 'created' }))\n"
        "  await pubsub.topic('invoice-created').publishMessage({ json: { id: 'demo' } })\n"
        "  return eventBridge.send(new PutEventsCommand({ Entries: [] }))\n"
        "}\n\n"
        "export async function consumeRabbit(channel) {\n"
        "  await channel.assertQueue('invoice.created')\n"
        "  return channel.consume('invoice.created', (message) => message)\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "graphql" / "schema.graphql").write_text(
        "type Query { invoice(id: ID!): Invoice }\n"
        "type Mutation { createInvoice(input: InvoiceInput!): Invoice }\n"
        "input InvoiceInput { customerId: ID! total: Float! }\n"
        "type Invoice { id: ID! total: Float }\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "graphql" / "resolvers.ts").write_text(
        "import { ApolloServer } from '@apollo/server'\n"
        "import { gql, useMutation, useQuery } from '@apollo/client'\n\n"
        "const typeDefs = gql`\n"
        "  query InvoiceById { invoice(id: \"demo\") { id total } }\n"
        "  mutation CreateInvoice { createInvoice(input: { customerId: \"demo\", total: 10 }) { id } }\n"
        "`\n"
        "const resolvers = { Query: { invoice: () => ({ id: 'inv_1', total: 10 }) }, Mutation: { createInvoice: () => ({ id: 'inv_2', total: 10 }) } }\n"
        "export const billingGraphqlServer = new ApolloServer({ typeDefs, resolvers })\n"
        "export function InvoiceGraphqlClient() {\n"
        "  useQuery(gql`query InvoiceClient { invoice(id: \"demo\") { id } }`)\n"
        "  return useMutation(gql`mutation InvoiceCreateClient { createInvoice(input: { customerId: \"demo\", total: 10 }) { id } }`)\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "models.py").write_text(
        "from django.db import models\n"
        "from sqlalchemy import Column, Integer, String\n\n"
        "class Customer(models.Model):\n"
        "    email = models.EmailField()\n\n"
        "class Order(Base):\n"
        "    __tablename__ = 'orders'\n"
        "    id = Column(Integer, primary_key=True)\n"
        "    reference = Column(String)\n",
        encoding="utf-8",
    )
    (source_repo / "db" / "schema.sql").write_text(
        "CREATE TABLE invoices (\n"
        "  id integer primary key,\n"
        "  total numeric\n"
        ");\n\n"
        "CREATE VIEW active_invoices AS SELECT * FROM invoices WHERE total > 0;\n",
        encoding="utf-8",
    )
    (source_repo / "prisma" / "schema.prisma").write_text(
        "model User {\n"
        "  id Int @id\n"
        "  email String\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "database" / "migrations" / "2024_01_01_create_payments.php").write_text(
        "<?php\n"
        "Schema::create('payments', function (Blueprint $table) {\n"
        "    $table->id();\n"
        "    $table->string('reference');\n"
        "});\n",
        encoding="utf-8",
    )
    (source_repo / "tests" / "test_api.py").write_text(
        "def test_health():\n"
        "    assert True\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("facts", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        facts = metadata.get_repo_facts(limit=800)
    finally:
        metadata.close()

    by_kind_key = {(fact["kind"], fact["key"]): fact for fact in facts}
    service_integration_facts = [fact for fact in facts if fact["kind"] == "service_integration"]
    graphql_surface_facts = [fact for fact in facts if fact["kind"] == "graphql_surface"]
    message_bus_facts = [fact for fact in facts if fact["kind"] == "message_bus"]
    data_store_facts = [fact for fact in facts if fact["kind"] == "data_store"]
    ai_surface_facts = [fact for fact in facts if fact["kind"] == "ai_surface"]
    payment_surface_facts = [fact for fact in facts if fact["kind"] == "payment_surface"]
    webhook_surface_facts = [fact for fact in facts if fact["kind"] == "webhook_surface"]
    observability_surface_facts = [fact for fact in facts if fact["kind"] == "observability_surface"]
    feature_flag_facts = [fact for fact in facts if fact["kind"] == "feature_flag"]
    notification_surface_facts = [fact for fact in facts if fact["kind"] == "notification_surface"]
    assert ("doc", "README.md") in by_kind_key
    assert ("doc_section", "Sample") in by_kind_key
    assert ("doc_section", "Billing setup guide") in by_kind_key
    assert ("env_var", "DATABASE_URL") in by_kind_key
    assert ("env_var", "API_DATABASE_URL") in by_kind_key
    assert ("env_var", "REDIS_URL") in by_kind_key
    assert ("env_var", "WORKER_CONCURRENCY") in by_kind_key
    assert ("ci_workflow", "Billing CI") in by_kind_key
    assert ("container_service", "api") in by_kind_key
    assert ("container_service", "db") in by_kind_key
    assert ("runtime_requirement", "Node.js") in by_kind_key
    assert ("stack_component", "React") in by_kind_key
    assert ("stack_component", "Next.js") in by_kind_key
    assert ("stack_component", "Prisma") in by_kind_key
    assert ("stack_component", "npm") in by_kind_key
    assert ("service_integration", "Stripe") in by_kind_key
    assert ("service_integration", "Sentry") in by_kind_key
    assert ("service_integration", "OpenAI") in by_kind_key
    assert ("service_integration", "Redis") in by_kind_key
    assert ("graphql_surface", "GraphQL") in by_kind_key
    assert ("graphql_surface", "Apollo Server") in by_kind_key
    assert ("graphql_surface", "Apollo Client") in by_kind_key
    assert ("graphql_surface", "GraphQL Yoga") in by_kind_key
    assert ("graphql_surface", "Graphene") in by_kind_key
    assert ("graphql_surface", "Strawberry GraphQL") in by_kind_key
    assert ("graphql_surface", "GraphQL root type") in by_kind_key
    assert ("graphql_surface", "GraphQL type") in by_kind_key
    assert ("graphql_surface", "Apollo GraphQL") in by_kind_key
    assert ("graphql_surface", "GraphQL schema") in by_kind_key
    assert ("graphql_surface", "GraphQL resolver") in by_kind_key
    assert ("graphql_surface", "GraphQL query") in by_kind_key
    assert ("graphql_surface", "GraphQL mutation") in by_kind_key
    assert ("graphql_surface", "GraphQL client") in by_kind_key
    assert ("message_bus", "Kafka") in by_kind_key
    assert ("message_bus", "RabbitMQ") in by_kind_key
    assert ("message_bus", "NATS") in by_kind_key
    assert ("message_bus", "Amazon SQS") in by_kind_key
    assert ("message_bus", "EventBridge") in by_kind_key
    assert ("message_bus", "Google Pub/Sub") in by_kind_key
    assert ("message_bus", "Kafka producer") in by_kind_key
    assert ("message_bus", "Kafka consumer") in by_kind_key
    assert ("message_bus", "RabbitMQ consumer") in by_kind_key
    assert ("data_store", "PostgreSQL") in by_kind_key
    assert ("data_store", "Redis") in by_kind_key
    assert ("data_store", "MongoDB") in by_kind_key
    assert ("data_store", "Amazon S3") in by_kind_key
    assert ("data_store", "Elasticsearch") in by_kind_key
    assert ("ai_surface", "OpenAI") in by_kind_key
    assert ("ai_surface", "OpenAI chat completion") in by_kind_key
    assert ("ai_surface", "OpenAI embeddings") in by_kind_key
    assert ("ai_surface", "Prompt template") in by_kind_key
    assert ("payment_surface", "Stripe") in by_kind_key
    assert ("payment_surface", "Stripe Checkout") in by_kind_key
    assert ("payment_surface", "Stripe PaymentIntent") in by_kind_key
    assert ("auth_surface", "NextAuth") in by_kind_key
    assert ("auth_surface", "Passport JWT") in by_kind_key
    assert ("auth_surface", "JOSE") in by_kind_key
    assert ("auth_surface", "Auth secret") in by_kind_key
    assert ("auth_surface", "Auth0") in by_kind_key
    assert ("auth_surface", "OAuth2PasswordBearer") in by_kind_key
    assert ("auth_surface", "FastAPI security dependency") in by_kind_key
    assert ("background_job", "Celery") in by_kind_key
    assert ("background_job", "BullMQ") in by_kind_key
    assert ("background_job", "node-cron") in by_kind_key
    assert ("background_job", "Celery task") in by_kind_key
    assert ("background_job", "worker") in by_kind_key
    assert any(fact["key"] == "Stripe webhook" and fact["source_path"] == "src/api.py" for fact in webhook_surface_facts)
    assert any(fact["key"] == "Sentry" and fact["metadata"]["category"] == "error monitoring" for fact in observability_surface_facts)
    assert any(fact["key"] == "Prometheus" and fact["metadata"]["category"] == "metrics" for fact in observability_surface_facts)
    assert any(fact["key"] == "Metrics endpoint" and fact["source_path"] == "src/api.py" for fact in observability_surface_facts)
    assert any(fact["key"] == "LaunchDarkly" and fact["metadata"]["category"] == "feature flag provider" for fact in feature_flag_facts)
    assert any(fact["key"] == "LaunchDarkly variation" and fact["source_path"] == "src/tasks.py" for fact in feature_flag_facts)
    assert any(fact["key"] == "SendGrid" and fact["metadata"]["category"] == "email" for fact in notification_surface_facts)
    assert any(fact["key"] == "Twilio" and fact["metadata"]["category"] == "sms" for fact in notification_surface_facts)
    assert ("secret_signal", "BILLING_API_TOKEN") in by_kind_key
    assert ("secret_signal", "NEXTAUTH_SECRET") in by_kind_key
    assert ("secret_signal", "STRIPE_WEBHOOK_SECRET") in by_kind_key
    assert ("secret_signal", "STRIPE_SECRET_KEY") in by_kind_key
    assert ("repo_policy", "license") in by_kind_key
    assert ("repo_policy", "security") in by_kind_key
    assert ("code_owner", "/src/billing/*") in by_kind_key
    assert ("deploy_target", "Kubernetes:Deployment:billing-api") in by_kind_key
    assert ("deploy_target", "Kubernetes:Ingress:billing-ingress") in by_kind_key
    assert ("deploy_target", "Procfile:process:web") in by_kind_key
    assert ("deploy_target", "Vercel:project:billing-web") in by_kind_key
    assert ("module", "src") in by_kind_key
    assert ("config", "package.json") in by_kind_key
    assert ("test", "tests/test_api.py") in by_kind_key
    assert ("dependency", "react") in by_kind_key
    assert ("runbook_command", "test") in by_kind_key
    assert by_kind_key[("runbook_command", "test")]["value"] == "npm run test"
    assert by_kind_key[("route_endpoint", "GET /health")]["source_path"] == "src/api.py"
    assert by_kind_key[("route_endpoint", "GET /health")]["source_line"] == 4
    assert by_kind_key[("route_endpoint", "POST /webhooks/stripe")]["source_path"] == "src/api.py"
    assert by_kind_key[("import", "fastapi")]["source_path"] in {"src/api.py", "src/auth.py"}
    assert by_kind_key[("schema", "table:invoices")]["source_path"] == "db/schema.sql"
    assert by_kind_key[("schema", "view:active_invoices")]["source_path"] == "db/schema.sql"
    assert by_kind_key[("schema", "model:User")]["source_path"] == "prisma/schema.prisma"
    assert by_kind_key[("schema", "field:User.email")]["metadata"]["model"] == "User"
    assert by_kind_key[("schema", "model:Customer")]["metadata"]["source"] == "django"
    assert by_kind_key[("schema", "field:Customer.email")]["source_path"] == "src/models.py"
    assert by_kind_key[("schema", "model:Order")]["metadata"]["source"] == "sqlalchemy"
    assert by_kind_key[("schema", "table:orders")]["metadata"]["model"] == "Order"
    assert by_kind_key[("schema", "table:payments")]["source_path"].endswith("create_payments.php")
    assert by_kind_key[("schema", "field:payments.reference")]["metadata"]["table"] == "payments"
    assert by_kind_key[("doc_section", "Billing setup guide")]["source_path"] == "README.md"
    assert by_kind_key[("doc_section", "Billing setup guide")]["source_line"] == 5
    assert by_kind_key[("doc_section", "Billing setup guide")]["metadata"]["level"] == 2
    assert by_kind_key[("doc_section", "Billing setup guide")]["metadata"]["anchor"] == "billing-setup-guide"
    assert by_kind_key[("env_var", "DATABASE_URL")]["source_path"] == ".env.example"
    assert by_kind_key[("env_var", "DATABASE_URL")]["source_line"] == 1
    assert by_kind_key[("env_var", "DATABASE_URL")]["metadata"]["source"] == "env-template"
    assert by_kind_key[("env_var", "DATABASE_URL")]["metadata"]["required"] is True
    assert by_kind_key[("env_var", "WORKER_CONCURRENCY")]["source_path"] == "docker-compose.yml"
    assert by_kind_key[("env_var", "WORKER_CONCURRENCY")]["metadata"]["service"] == "api"
    assert by_kind_key[("ci_workflow", "Billing CI")]["source_path"] == ".github/workflows/ci.yml"
    assert by_kind_key[("ci_workflow", "Billing CI")]["source_line"] == 1
    assert by_kind_key[("ci_workflow", "Billing CI")]["metadata"]["provider"] == "github-actions"
    assert by_kind_key[("ci_workflow", "Billing CI")]["metadata"]["events"] == ["push", "pull_request"]
    assert "test" in by_kind_key[("ci_workflow", "Billing CI")]["metadata"]["jobs"]
    assert "pytest tests" in by_kind_key[("ci_workflow", "Billing CI")]["metadata"]["commands"]
    assert by_kind_key[("container_service", "api")]["source_path"] == "docker-compose.yml"
    assert by_kind_key[("container_service", "api")]["source_line"] == 2
    assert by_kind_key[("container_service", "api")]["metadata"]["provider"] == "docker-compose"
    assert by_kind_key[("container_service", "api")]["metadata"]["image"] == "sample-api"
    assert by_kind_key[("container_service", "api")]["metadata"]["ports"] == ["8080:80"]
    assert by_kind_key[("container_service", "api")]["metadata"]["depends_on"] == ["db"]
    assert by_kind_key[("container_service", "worker")]["metadata"]["command"] == "celery -A src.tasks worker --loglevel=info"
    assert by_kind_key[("container_service", "db")]["metadata"]["image"] == "postgres:16"
    assert by_kind_key[("container_service", "redis")]["metadata"]["image"] == "redis:7"
    assert "cp-kafka" in by_kind_key[("container_service", "kafka")]["metadata"]["image"]
    assert by_kind_key[("container_service", "rabbitmq")]["metadata"]["image"] == "rabbitmq:3-management"
    assert by_kind_key[("container_service", "nats")]["metadata"]["image"] == "nats:2"
    assert "elasticsearch" in by_kind_key[("container_service", "search")]["metadata"]["image"]
    assert by_kind_key[("runtime_requirement", "Node.js")]["value"] == ">=20"
    assert by_kind_key[("runtime_requirement", "Node.js")]["source_path"] == "package.json"
    assert by_kind_key[("runtime_requirement", "Node.js")]["metadata"]["source"] == "package-engines"
    assert by_kind_key[("stack_component", "React")]["metadata"]["category"] == "ui framework"
    assert by_kind_key[("stack_component", "React")]["metadata"]["ecosystem"] == "JavaScript/TypeScript"
    assert by_kind_key[("stack_component", "React")]["source_path"] == "package.json"
    assert by_kind_key[("stack_component", "Prisma")]["metadata"]["category"] == "data layer"
    assert by_kind_key[("stack_component", "npm")]["metadata"]["category"] == "package manager"
    assert any(
        fact["key"] == "Stripe"
        and fact["metadata"]["category"] == "payment provider"
        and fact["source_path"] == "package.json"
        for fact in service_integration_facts
    )
    assert any(fact["key"] == "OpenAI" and fact["metadata"]["category"] == "llm provider" for fact in ai_surface_facts)
    assert any(fact["key"] == "OpenAI chat completion" and fact["source_path"] == "src/ai.ts" for fact in ai_surface_facts)
    assert any(fact["key"] == "OpenAI embeddings" and fact["source_path"] == "src/ai.ts" for fact in ai_surface_facts)
    assert any(fact["key"] == "Prompt template" and fact["source_path"] == "src/ai.ts" for fact in ai_surface_facts)
    assert any(fact["key"] == "Stripe" and fact["metadata"]["category"] == "payment provider" for fact in payment_surface_facts)
    assert any(fact["key"] == "Stripe Checkout" and fact["source_path"] == "src/api.py" for fact in payment_surface_facts)
    assert any(fact["key"] == "Stripe PaymentIntent" and fact["source_path"] == "src/api.py" for fact in payment_surface_facts)
    assert by_kind_key[("service_integration", "Sentry")]["metadata"]["category"] == "observability"
    assert by_kind_key[("service_integration", "OpenAI")]["metadata"]["category"] == "ai provider"
    assert any(
        fact["key"] == "GraphQL"
        and fact["metadata"]["category"] in {"schema", "endpoint"}
        and fact["metadata"]["source"] in {"dependency", "environment-name"}
        for fact in graphql_surface_facts
    )
    assert any(fact["key"] == "Apollo Server" and fact["metadata"]["category"] == "server" for fact in graphql_surface_facts)
    assert any(fact["key"] == "Apollo Client" and fact["metadata"]["category"] == "client" for fact in graphql_surface_facts)
    assert any(fact["key"] == "GraphQL Yoga" and fact["metadata"]["category"] == "server" for fact in graphql_surface_facts)
    assert any(fact["key"] == "GraphQL root type" and fact["source_path"] == "src/graphql/schema.graphql" for fact in graphql_surface_facts)
    assert any(fact["key"] == "GraphQL resolver" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in graphql_surface_facts)
    assert any(fact["key"] == "GraphQL query" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in graphql_surface_facts)
    assert any(fact["key"] == "GraphQL mutation" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in graphql_surface_facts)
    assert any(fact["key"] == "GraphQL client" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in graphql_surface_facts)
    assert any(
        fact["key"] == "Kafka"
        and fact["metadata"]["category"] == "event streaming"
        and fact["metadata"]["source"] in {"dependency", "environment-name", "container-service", "service-integration"}
        for fact in message_bus_facts
    )
    assert any(fact["key"] == "RabbitMQ" and fact["metadata"]["category"] == "message broker" for fact in message_bus_facts)
    assert any(fact["key"] == "Amazon SQS" and fact["metadata"]["category"] == "message queue" for fact in message_bus_facts)
    assert any(fact["key"] == "EventBridge" and fact["metadata"]["category"] == "event bus" for fact in message_bus_facts)
    assert any(fact["key"] == "Google Pub/Sub" and fact["metadata"]["category"] == "pub/sub" for fact in message_bus_facts)
    assert any(fact["key"] == "Kafka producer" and fact["source_path"] == "src/events.ts" for fact in message_bus_facts)
    assert any(fact["key"] == "Amazon SQS producer" and fact["source_path"] == "src/events.ts" for fact in message_bus_facts)
    assert any(
        fact["key"] == "PostgreSQL"
        and fact["metadata"]["category"] == "relational database"
        and fact["metadata"]["source"] in {"dependency", "service-integration", "container-service", "code-signal"}
        for fact in data_store_facts
    )
    assert any(
        fact["key"] == "Redis"
        and fact["metadata"]["category"] == "key-value cache"
        and fact["metadata"]["source"] in {"dependency", "environment-name", "container-service", "code-signal", "service-integration"}
        for fact in data_store_facts
    )
    assert any(fact["key"] == "Amazon S3" and fact["metadata"]["category"] == "object storage" for fact in data_store_facts)
    assert any(fact["key"] == "Elasticsearch" and fact["metadata"]["category"] == "search engine" for fact in data_store_facts)
    assert any(fact["key"] == "MongoDB" and fact["metadata"]["source"] == "dependency" for fact in data_store_facts)
    assert by_kind_key[("auth_surface", "NextAuth")]["metadata"]["category"] == "auth framework"
    assert by_kind_key[("auth_surface", "NextAuth")]["source_path"] == "package.json"
    assert by_kind_key[("auth_surface", "Passport JWT")]["metadata"]["category"] == "jwt"
    assert by_kind_key[("auth_surface", "Auth secret")]["source_path"] == ".env.example"
    assert by_kind_key[("auth_surface", "Auth secret")]["metadata"]["source"] in {"environment-name", "redacted-secret-name"}
    assert by_kind_key[("auth_surface", "OAuth2PasswordBearer")]["source_path"] == "src/auth.py"
    assert by_kind_key[("auth_surface", "FastAPI security dependency")]["metadata"]["category"] == "auth guard"
    assert by_kind_key[("background_job", "Celery")]["metadata"]["category"] == "task queue"
    assert by_kind_key[("background_job", "Celery")]["source_path"] == "requirements.txt"
    assert by_kind_key[("background_job", "BullMQ")]["metadata"]["category"] == "task queue"
    assert by_kind_key[("background_job", "node-cron")]["metadata"]["category"] == "cron"
    assert by_kind_key[("background_job", "Celery task")]["source_path"] == "src/tasks.py"
    assert by_kind_key[("background_job", "worker")]["metadata"]["source"] in {"container-service", "deploy-target"}
    assert any(
        fact["key"] == "Stripe webhook"
        and fact["metadata"]["category"] in {"webhook endpoint", "signature verification", "webhook provider"}
        and fact["metadata"]["provenance"]["source"] == "parsed-source"
        for fact in webhook_surface_facts
    )
    assert any(
        fact["key"] == "Sentry"
        and fact["metadata"]["source"] in {"dependency", "service-integration", "code-signal"}
        and fact["metadata"]["provenance"]["source"] == "parsed-source"
        for fact in observability_surface_facts
    )
    assert any(
        fact["key"] == "Metrics endpoint"
        and fact["metadata"]["category"] == "metrics"
        and fact["metadata"]["source"] in {"route", "code-signal"}
        for fact in observability_surface_facts
    )
    assert any(
        fact["key"] == "LaunchDarkly"
        and fact["metadata"]["source"] in {"dependency", "environment-name", "redacted-secret-name"}
        and fact["metadata"]["provenance"]["source"] == "parsed-source"
        for fact in feature_flag_facts
    )
    assert any(
        fact["key"] == "LaunchDarkly variation"
        and fact["metadata"]["category"] == "flag usage"
        and fact["metadata"]["source"] == "code-signal"
        for fact in feature_flag_facts
    )
    assert any(
        fact["key"] == "SendGrid"
        and fact["metadata"]["source"] in {"dependency", "environment-name", "redacted-secret-name", "service-integration"}
        and fact["metadata"]["provenance"]["source"] == "parsed-source"
        for fact in notification_surface_facts
    )
    assert any(
        fact["key"] == "Twilio"
        and fact["metadata"]["category"] == "sms"
        and fact["metadata"]["source"] in {"dependency", "code-signal", "service-integration"}
        for fact in notification_surface_facts
    )
    assert by_kind_key[("secret_signal", "BILLING_API_TOKEN")]["value"] == "token signal; value redacted"
    assert by_kind_key[("secret_signal", "BILLING_API_TOKEN")]["source_path"] == ".env.example"
    assert by_kind_key[("secret_signal", "BILLING_API_TOKEN")]["metadata"]["redacted"] is True
    assert by_kind_key[("secret_signal", "BILLING_API_TOKEN")]["metadata"]["has_value"] is True
    assert by_kind_key[("secret_signal", "STRIPE_SECRET_KEY")]["source_path"] == "src/api.py"
    assert by_kind_key[("repo_policy", "license")]["value"] == "MIT"
    assert by_kind_key[("repo_policy", "license")]["source_path"] == "LICENSE"
    assert by_kind_key[("repo_policy", "security")]["value"] == "Security policy"
    assert by_kind_key[("repo_policy", "security")]["source_path"] == "SECURITY.md"
    assert by_kind_key[("code_owner", "/src/billing/*")]["value"] == "@platform/billing-team @security/reviewers"
    assert by_kind_key[("code_owner", "/src/billing/*")]["source_path"] == ".github/CODEOWNERS"
    assert by_kind_key[("code_owner", "/src/billing/*")]["metadata"]["owners"] == ["@platform/billing-team", "@security/reviewers"]
    assert by_kind_key[("deploy_target", "Kubernetes:Deployment:billing-api")]["source_path"] == "deploy/billing.yaml"
    assert by_kind_key[("deploy_target", "Kubernetes:Deployment:billing-api")]["metadata"]["provider"] == "Kubernetes"
    assert by_kind_key[("deploy_target", "Kubernetes:Deployment:billing-api")]["metadata"]["target_type"] == "Deployment"
    assert "ghcr.io/example/billing-api:2026.07" in by_kind_key[("deploy_target", "Kubernetes:Deployment:billing-api")]["value"]
    assert by_kind_key[("deploy_target", "Procfile:process:web")]["value"] == "gunicorn src.api:app"
    assert by_kind_key[("deploy_target", "Vercel:project:billing-web")]["metadata"]["provider"] == "Vercel"
    assert by_kind_key[("module", "src")]["metadata"]["file_count"] == 6
    assert by_kind_key[("module", "src/graphql")]["metadata"]["file_count"] == 2
    assert by_kind_key[("module", "src")]["metadata"]["symbol_count"] >= 2
    assert set(by_kind_key[("module", "src")]["metadata"]["languages"]) >= {"Python", "TypeScript"}
    assert "src/ai.ts" in set(by_kind_key[("module", "src")]["metadata"]["sample_files"])
    assert isinstance(by_kind_key[("runbook_command", "test")]["metadata"]["rank"], int)
    assert by_kind_key[("module", "src")]["metadata"]["provenance"]["source"] == "indexed-metadata"
    assert by_kind_key[("runbook_command", "test")]["metadata"]["provenance"]["source"] == "manifest"
    assert by_kind_key[("route_endpoint", "GET /health")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("doc_section", "Billing setup guide")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("env_var", "DATABASE_URL")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("ci_workflow", "Billing CI")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("container_service", "api")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("runtime_requirement", "Node.js")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("stack_component", "React")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("service_integration", "Stripe")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in graphql_surface_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in message_bus_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in data_store_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in ai_surface_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in payment_surface_facts)
    assert by_kind_key[("auth_surface", "NextAuth")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("background_job", "Celery")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in webhook_surface_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in observability_surface_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in feature_flag_facts)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in notification_surface_facts)
    assert by_kind_key[("secret_signal", "BILLING_API_TOKEN")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("repo_policy", "license")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("code_owner", "/src/billing/*")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("deploy_target", "Kubernetes:Deployment:billing-api")]["metadata"]["provenance"]["source"] == "parsed-source"
    assert by_kind_key[("schema", "model:User")]["metadata"]["provenance"]["source"] == "parsed-source"
    fact_ranks = [fact["metadata"]["rank"] for fact in facts]
    assert fact_ranks == sorted(fact_ranks)
    serialized_facts = json.dumps(facts)
    assert "https://graphql.example/should_not_be_stored_2468" not in serialized_facts
    assert "apollo_should_not_be_stored_2468" not in serialized_facts

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "runbook_command", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"runbook_command"}
    runbook_sources = {fact["source_path"] for fact in body["facts"]}
    assert "package.json" in runbook_sources
    assert "docker-compose.yml" in runbook_sources
    api_ranks = [fact["metadata"]["rank"] for fact in body["facts"]]
    assert api_ranks == sorted(api_ranks)
    assert all(fact["metadata"]["provenance"]["source"] == "manifest" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "runtime_requirement", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert {fact["kind"] for fact in body["facts"]} == {"runtime_requirement"}
    assert any(fact["key"] == "Node.js" and fact["value"] == ">=20" for fact in body["facts"])
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "secret_signal", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"secret_signal"}
    serialized_secret_facts = json.dumps(body)
    assert "BILLING_API_TOKEN" in serialized_secret_facts
    assert "STRIPE_SECRET_KEY" in serialized_secret_facts
    assert "tok_live_should_not_be_stored_123456" not in serialized_secret_facts
    assert "sk_live_should_not_be_stored_987654" not in serialized_secret_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "stack_component", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 4
    assert {fact["kind"] for fact in body["facts"]} == {"stack_component"}
    assert any(fact["key"] == "Next.js" and fact["metadata"]["category"] == "full-stack framework" for fact in body["facts"])
    assert any(fact["key"] == "Prisma" and fact["metadata"]["category"] == "data layer" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "service_integration", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 4
    assert {fact["kind"] for fact in body["facts"]} == {"service_integration"}
    assert any(fact["key"] == "Stripe" and fact["metadata"]["category"] == "payment provider" for fact in body["facts"])
    assert any(fact["key"] == "Sentry" and fact["metadata"]["category"] == "observability" for fact in body["facts"])
    assert any(fact["key"] == "OpenAI" and fact["metadata"]["category"] == "ai provider" for fact in body["facts"])
    assert any(fact["key"] == "Redis" and fact["metadata"]["category"] == "cache" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "message_bus", "limit": 40})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 8
    assert {fact["kind"] for fact in body["facts"]} == {"message_bus"}
    assert any(fact["key"] == "Kafka" and fact["metadata"]["category"] == "event streaming" for fact in body["facts"])
    assert any(fact["key"] == "RabbitMQ" and fact["metadata"]["category"] == "message broker" for fact in body["facts"])
    assert any(fact["key"] == "Amazon SQS" and fact["metadata"]["category"] == "message queue" for fact in body["facts"])
    assert any(fact["key"] == "Kafka producer" and fact["source_path"] == "src/events.ts" for fact in body["facts"])
    assert any(fact["key"] == "RabbitMQ consumer" and fact["source_path"] == "src/events.ts" for fact in body["facts"])
    serialized_message_bus_facts = json.dumps(body)
    assert "kafka_should_not_be_stored_2468" not in serialized_message_bus_facts
    assert "https://sqs.example/should_not_be_stored_2468" not in serialized_message_bus_facts
    assert "rabbitmq_should_not_be_stored_2468" not in serialized_message_bus_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "graphql_surface", "limit": 40})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 10
    assert {fact["kind"] for fact in body["facts"]} == {"graphql_surface"}
    assert any(fact["key"] == "Apollo Server" and fact["metadata"]["category"] == "server" for fact in body["facts"])
    assert any(fact["key"] == "Apollo Client" and fact["metadata"]["category"] == "client" for fact in body["facts"])
    assert any(fact["key"] == "GraphQL root type" and fact["source_path"] == "src/graphql/schema.graphql" for fact in body["facts"])
    assert any(fact["key"] == "GraphQL resolver" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in body["facts"])
    assert any(fact["key"] == "GraphQL query" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in body["facts"])
    assert any(fact["key"] == "GraphQL mutation" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in body["facts"])
    assert any(fact["key"] == "GraphQL client" and fact["source_path"] == "src/graphql/resolvers.ts" for fact in body["facts"])
    serialized_graphql_facts = json.dumps(body)
    assert "https://graphql.example/should_not_be_stored_2468" not in serialized_graphql_facts
    assert "apollo_should_not_be_stored_2468" not in serialized_graphql_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "data_store", "limit": 30})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 5
    assert {fact["kind"] for fact in body["facts"]} == {"data_store"}
    assert any(fact["key"] == "PostgreSQL" and fact["metadata"]["category"] == "relational database" for fact in body["facts"])
    assert any(fact["key"] == "Redis" and fact["metadata"]["category"] == "key-value cache" for fact in body["facts"])
    assert any(fact["key"] == "Amazon S3" and fact["metadata"]["category"] == "object storage" for fact in body["facts"])
    assert any(fact["key"] == "Elasticsearch" and fact["metadata"]["category"] == "search engine" for fact in body["facts"])
    serialized_data_store_facts = json.dumps(body)
    assert "redis://localhost:6379" not in serialized_data_store_facts
    assert "http://search:9200" not in serialized_data_store_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "ai_surface", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 4
    assert {fact["kind"] for fact in body["facts"]} == {"ai_surface"}
    assert any(fact["key"] == "OpenAI" and fact["metadata"]["category"] == "llm provider" for fact in body["facts"])
    assert any(fact["key"] == "OpenAI chat completion" and fact["source_path"] == "src/ai.ts" for fact in body["facts"])
    assert any(fact["key"] == "OpenAI embeddings" and fact["source_path"] == "src/ai.ts" for fact in body["facts"])
    assert any(fact["key"] == "Prompt template" and fact["source_path"] == "src/ai.ts" for fact in body["facts"])
    serialized_ai_facts = json.dumps(body)
    assert "sk_ai_should_not_be_stored_2468" not in serialized_ai_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "payment_surface", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 3
    assert {fact["kind"] for fact in body["facts"]} == {"payment_surface"}
    assert any(fact["key"] == "Stripe" and fact["metadata"]["category"] == "payment provider" for fact in body["facts"])
    assert any(fact["key"] == "Stripe Checkout" and fact["source_path"] == "src/api.py" for fact in body["facts"])
    assert any(fact["key"] == "Stripe PaymentIntent" and fact["source_path"] == "src/api.py" for fact in body["facts"])
    serialized_payment_facts = json.dumps(body)
    assert "sk_live_should_not_be_stored_payment_2468" not in serialized_payment_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "auth_surface", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 6
    assert {fact["kind"] for fact in body["facts"]} == {"auth_surface"}
    assert any(fact["key"] == "NextAuth" and fact["metadata"]["category"] == "auth framework" for fact in body["facts"])
    assert any(fact["key"] == "Passport JWT" and fact["metadata"]["category"] == "jwt" for fact in body["facts"])
    assert any(fact["key"] == "OAuth2PasswordBearer" and fact["source_path"] == "src/auth.py" for fact in body["facts"])
    serialized_auth_facts = json.dumps(body)
    assert "NEXTAUTH_SECRET" not in serialized_auth_facts
    assert "nextauth_should_not_be_stored_2468" not in serialized_auth_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "background_job", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 5
    assert {fact["kind"] for fact in body["facts"]} == {"background_job"}
    assert any(fact["key"] == "Celery" and fact["metadata"]["category"] == "task queue" for fact in body["facts"])
    assert any(fact["key"] == "BullMQ" and fact["metadata"]["category"] == "task queue" for fact in body["facts"])
    assert any(fact["key"] == "Celery task" and fact["source_path"] == "src/tasks.py" for fact in body["facts"])
    assert any(fact["key"] == "worker" and fact["metadata"]["source"] == "container-service" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "webhook_surface", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"webhook_surface"}
    assert any(
        fact["key"] == "Stripe webhook"
        and fact["source_path"] == "src/api.py"
        for fact in body["facts"]
    )
    assert any(fact["metadata"]["source"] == "redacted-secret-name" for fact in body["facts"])
    serialized_webhook_facts = json.dumps(body)
    assert "whsec_should_not_be_stored_2468" not in serialized_webhook_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "observability_surface", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 3
    assert {fact["kind"] for fact in body["facts"]} == {"observability_surface"}
    assert any(fact["key"] == "Sentry" and fact["metadata"]["category"] == "error monitoring" for fact in body["facts"])
    assert any(fact["key"] == "Prometheus" and fact["metadata"]["category"] == "metrics" for fact in body["facts"])
    assert any(fact["key"] == "Metrics endpoint" and fact["source_path"] == "src/api.py" for fact in body["facts"])
    serialized_observability_facts = json.dumps(body)
    assert "https://public@sentry.example/2468" not in serialized_observability_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "feature_flag", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"feature_flag"}
    assert any(fact["key"] == "LaunchDarkly" and fact["metadata"]["category"] == "feature flag provider" for fact in body["facts"])
    assert any(fact["key"] == "LaunchDarkly variation" and fact["source_path"] == "src/tasks.py" for fact in body["facts"])
    serialized_feature_flag_facts = json.dumps(body)
    assert "ld_should_not_be_stored_2468" not in serialized_feature_flag_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "notification_surface", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"notification_surface"}
    assert any(fact["key"] == "SendGrid" and fact["metadata"]["category"] == "email" for fact in body["facts"])
    assert any(fact["key"] == "Twilio" and fact["metadata"]["category"] == "sms" for fact in body["facts"])
    serialized_notification_facts = json.dumps(body)
    assert "sg_should_not_be_stored_2468" not in serialized_notification_facts

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "repo_policy", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"repo_policy"}
    assert any(fact["key"] == "license" and fact["value"] == "MIT" for fact in body["facts"])
    assert any(fact["key"] == "security" and fact["source_path"] == "SECURITY.md" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "code_owner", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert {fact["kind"] for fact in body["facts"]} == {"code_owner"}
    assert any(
        fact["key"] == "/src/billing/*"
        and fact["value"] == "@platform/billing-team @security/reviewers"
        for fact in body["facts"]
    )

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "deploy_target", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 4
    assert {fact["kind"] for fact in body["facts"]} == {"deploy_target"}
    deploy_keys = {fact["key"] for fact in body["facts"]}
    assert {
        "Kubernetes:Deployment:billing-api",
        "Kubernetes:Ingress:billing-ingress",
        "Procfile:process:web",
        "Vercel:project:billing-web",
    }.issubset(deploy_keys)

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "module", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert {fact["kind"] for fact in body["facts"]} == {"module"}
    module_facts = {fact["key"]: fact for fact in body["facts"]}
    assert module_facts["src"]["metadata"]["file_count"] == 6
    assert module_facts["src/graphql"]["metadata"]["file_count"] == 2
    assert module_facts["src"]["metadata"]["provenance"]["source"] == "indexed-metadata"

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "schema", "limit": 30})

    assert response.status_code == 200
    body = response.json()
    assert {fact["kind"] for fact in body["facts"]} == {"schema"}
    schema_keys = {fact["key"] for fact in body["facts"]}
    assert {
        "table:invoices",
        "view:active_invoices",
        "model:User",
        "field:User.email",
        "model:Customer",
        "field:Customer.email",
        "table:payments",
        "field:payments.reference",
    }.issubset(schema_keys)
    assert all(fact["metadata"]["provenance"]["source"] == "parsed-source" for fact in body["facts"])

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "doc_section", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert {fact["kind"] for fact in body["facts"]} == {"doc_section"}
    doc_sections = {fact["key"]: fact for fact in body["facts"]}
    assert doc_sections["Billing setup guide"]["source_path"] == "README.md"
    assert doc_sections["Billing setup guide"]["metadata"]["anchor"] == "billing-setup-guide"

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "env_var", "limit": 20})

    assert response.status_code == 200
    body = response.json()
    assert {fact["kind"] for fact in body["facts"]} == {"env_var"}
    env_facts = {fact["key"]: fact for fact in body["facts"]}
    assert env_facts["DATABASE_URL"]["source_path"] == ".env.example"
    assert env_facts["WORKER_CONCURRENCY"]["metadata"]["service"] == "api"

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "ci_workflow", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert {fact["kind"] for fact in body["facts"]} == {"ci_workflow"}
    ci_facts = {fact["key"]: fact for fact in body["facts"]}
    assert ci_facts["Billing CI"]["source_path"] == ".github/workflows/ci.yml"
    assert ci_facts["Billing CI"]["metadata"]["commands"] == ["pytest tests", "npm run build"]

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "container_service", "limit": 10})

    assert response.status_code == 200
    body = response.json()
    assert {fact["kind"] for fact in body["facts"]} == {"container_service"}
    service_facts = {fact["key"]: fact for fact in body["facts"]}
    assert service_facts["api"]["metadata"]["ports"] == ["8080:80"]
    assert service_facts["api"]["metadata"]["depends_on"] == ["db"]

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        schema_relationships = metadata.get_relationships(rel_type="defines_schema")
    finally:
        metadata.close()

    schema_edges = {
        (row["rel_type"], row["dst_kind"], row["metadata"]["source_path"], row["target"], row["metadata"]["source"])
        for row in schema_relationships
    }
    assert ("defines_schema", "schema", "db/schema.sql", "table:invoices", "sql") in schema_edges
    assert ("defines_schema", "schema", "prisma/schema.prisma", "model:User", "prisma") in schema_edges
    assert ("defines_schema", "schema", "src/models.py", "field:Customer.email", "django") in schema_edges
    assert any(
        edge == (
            "defines_schema",
            "schema",
            "database/migrations/2024_01_01_create_payments.php",
            "field:payments.reference",
            "laravel",
        )
        for edge in schema_edges
    )

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "defines_schema", "limit": 30})

    assert response.status_code == 200
    body = response.json()
    assert {item["rel_type"] for item in body["relationships"]} == {"defines_schema"}
    assert {
        (item["source_path"], item["target"], item["metadata"]["schema_type"])
        for item in body["relationships"]
    } >= {
        ("db/schema.sql", "table:invoices", "table"),
        ("db/schema.sql", "view:active_invoices", "view"),
        ("prisma/schema.prisma", "model:User", "model"),
        ("src/models.py", "field:Customer.email", "field"),
    }


def test_fast_index_extracts_common_orm_schema_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src" / "entities").mkdir(parents=True)
    (source_repo / "src" / "models").mkdir(parents=True)
    (source_repo / "prisma").mkdir(parents=True)
    (source_repo / "db" / "migrate").mkdir(parents=True)
    (source_repo / "app" / "models").mkdir(parents=True)
    (source_repo / "lib" / "my_app" / "accounts").mkdir(parents=True)
    (source_repo / "src" / "main" / "java" / "example").mkdir(parents=True)
    (source_repo / "src" / "csharp_models").mkdir(parents=True)

    (source_repo / "src" / "entities" / "account.entity.ts").write_text(
        "import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';\n\n"
        "@Entity('accounts')\n"
        "export class Account {\n"
        "  @PrimaryGeneratedColumn()\n"
        "  id!: number;\n\n"
        "  @Column({ type: 'varchar' })\n"
        "  email!: string;\n"
        "\n"
        "  @ManyToOne(() => User, user => user.accounts)\n"
        "  @JoinColumn({ name: 'owner_id' })\n"
        "  owner!: User;\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "models" / "invoice.ts").write_text(
        "export const Invoice = sequelize.define('Invoice', {\n"
        "  total: DataTypes.DECIMAL,\n"
        "  accountId: { type: DataTypes.INTEGER },\n"
        "});\n\n"
        "InvoiceRecord.init({\n"
        "  status: DataTypes.STRING,\n"
        "}, { sequelize, tableName: 'invoice_records' });\n"
        "Invoice.belongsTo(Account, { as: 'account', foreignKey: 'accountId' });\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "models" / "message.ts").write_text(
        "const messageSchema = new Schema({\n"
        "  body: String,\n"
        "  senderId: { type: String },\n"
        "  recipient: { type: Schema.Types.ObjectId, ref: 'User' },\n"
        "});\n"
        "export default mongoose.model('Message', messageSchema);\n",
        encoding="utf-8",
    )
    (source_repo / "prisma" / "schema.prisma").write_text(
        "model User {\n"
        "  id Int @id @default(autoincrement())\n"
        "  posts Post[]\n"
        "  @@map(\"app_users\")\n"
        "}\n\n"
        "model Post {\n"
        "  id Int @id\n"
        "  authorId Int @map(\"author_id\")\n"
        "  author User @relation(fields: [authorId], references: [id])\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "models" / "python_models.py").write_text(
        "from django.db import models\n"
        "from sqlalchemy import Column, ForeignKey, Integer\n"
        "from sqlalchemy.orm import relationship\n\n"
        "class Customer(models.Model):\n"
        "    organization = models.ForeignKey('Organization', on_delete=models.CASCADE)\n\n"
        "class Order(Base):\n"
        "    __tablename__ = 'orders'\n"
        "    user_id = Column(Integer, ForeignKey('users.id'))\n"
        "    user = relationship('User', back_populates='orders')\n",
        encoding="utf-8",
    )
    (source_repo / "db" / "migrate" / "20240701000000_create_accounts.rb").write_text(
        "class CreateAccounts < ActiveRecord::Migration[7.1]\n"
        "  def change\n"
        "    create_table :accounts do |t|\n"
        "      t.string :email\n"
        "      t.integer :login_count\n"
        "    end\n"
        "    add_column :accounts, :status, :string\n"
        "  end\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "app" / "models" / "account.rb").write_text(
        "class Account < ApplicationRecord\n"
        "  belongs_to :owner\n"
        "  has_many :invoices\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "lib" / "my_app" / "accounts" / "user.ex").write_text(
        "defmodule MyApp.Accounts.User do\n"
        "  use Ecto.Schema\n\n"
        "  schema \"users\" do\n"
        "    field :email, :string\n"
        "    field :active, :boolean\n"
        "    belongs_to :team, MyApp.Accounts.Team\n"
        "  end\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "main" / "java" / "example" / "Customer.java").write_text(
        "package example;\n\n"
        "@Entity\n"
        "@Table(name = \"customers\")\n"
        "public class Customer {\n"
        "  @Id\n"
        "  private Long id;\n\n"
        "  @Column(name = \"email_address\")\n"
        "  private String email;\n"
        "\n"
        "  @ManyToOne\n"
        "  @JoinColumn(name = \"account_id\")\n"
        "  private Account account;\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "csharp_models" / "Payment.cs").write_text(
        "using System.ComponentModel.DataAnnotations;\n"
        "using System.ComponentModel.DataAnnotations.Schema;\n\n"
        "[Table(\"payments\")]\n"
        "public class Payment {\n"
        "  [Key]\n"
        "  public int Id { get; set; }\n\n"
        "  [Column(\"reference_code\")]\n"
        "  public string Reference { get; set; }\n"
        "\n"
        "  [ForeignKey(\"CustomerId\")]\n"
        "  public Customer Customer { get; set; }\n"
        "}\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("common-orm-facts", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        facts = metadata.get_repo_facts(kind="schema", limit=200)
        relationships = metadata.get_relationships(rel_type="defines_schema", limit=200)
    finally:
        metadata.close()

    by_key = {fact["key"]: fact for fact in facts}
    by_key_source = {(fact["key"], fact["metadata"].get("source")): fact for fact in facts}
    assert by_key["model:Account"]["metadata"]["source"] == "typeorm"
    assert by_key["table:accounts"]["metadata"]["source"] in {"typeorm", "rails"}
    assert by_key["field:Account.email"]["metadata"]["source"] == "typeorm"
    assert by_key["relationship:Account.owner"]["metadata"]["target_model"] == "User"
    assert by_key["relationship:Account.owner"]["metadata"]["foreign_key"] == "owner_id"
    assert by_key["model:Invoice"]["metadata"]["source"] == "sequelize"
    assert by_key["field:Invoice.accountId"]["metadata"]["source"] == "sequelize"
    assert by_key["relationship:Invoice.Account"]["metadata"]["foreign_key"] == "accountId"
    assert by_key["table:invoice_records"]["metadata"]["source"] == "sequelize"
    assert by_key["field:InvoiceRecord.status"]["metadata"]["table"] == "invoice_records"
    assert by_key["model:Message"]["metadata"]["source"] == "mongoose"
    assert by_key["field:Message.body"]["metadata"]["source"] == "mongoose"
    assert by_key["relationship:Message.recipient"]["metadata"]["target_model"] == "User"
    assert by_key["table:app_users"]["metadata"]["source"] == "prisma"
    assert by_key["field:Post.authorId"]["metadata"]["column"] == "author_id"
    assert by_key["relationship:Post.author"]["metadata"]["foreign_key"] == "authorId"
    assert by_key["relationship:Customer.organization"]["metadata"]["target_model"] == "Organization"
    assert by_key["relationship:Order.user_id"]["metadata"]["target_table"] == "users"
    assert by_key["relationship:Order.user"]["metadata"]["inverse"] == "orders"
    assert by_key["field:accounts.email"]["metadata"]["source"] == "rails"
    assert by_key["field:accounts.status"]["metadata"]["source"] == "rails"
    assert by_key["relationship:Account.invoices"]["metadata"]["target_model"] == "Invoice"
    assert by_key_source[("model:User", "ecto")]["metadata"]["source"] == "ecto"
    assert by_key["table:users"]["metadata"]["source"] == "ecto"
    assert by_key["field:users.active"]["metadata"]["source"] == "ecto"
    assert by_key["relationship:User.team"]["metadata"]["target_model"] == "Team"
    assert by_key_source[("model:Customer", "jpa")]["metadata"]["source"] == "jpa"
    assert by_key_source[("table:customers", "jpa")]["metadata"]["model"] == "Customer"
    assert by_key_source[("field:Customer.email", "jpa")]["metadata"]["source"] == "jpa"
    assert by_key["relationship:Customer.account"]["metadata"]["foreign_key"] == "account_id"
    assert by_key["model:Payment"]["metadata"]["source"] == "entity_framework"
    assert by_key["table:payments"]["metadata"]["model"] == "Payment"
    assert by_key["field:Payment.Reference"]["metadata"]["source"] == "entity_framework"
    assert by_key["relationship:Payment.Customer"]["metadata"]["foreign_key"] == "CustomerId"

    relationship_edges = {
        (row["metadata"]["source_path"], row["target"], row["metadata"]["source"])
        for row in relationships
    }
    assert ("src/entities/account.entity.ts", "field:Account.email", "typeorm") in relationship_edges
    assert ("src/entities/account.entity.ts", "relationship:Account.owner", "typeorm") in relationship_edges
    assert ("src/models/invoice.ts", "field:Invoice.accountId", "sequelize") in relationship_edges
    assert ("src/models/invoice.ts", "relationship:Invoice.Account", "sequelize") in relationship_edges
    assert ("src/models/message.ts", "field:Message.body", "mongoose") in relationship_edges
    assert ("src/models/message.ts", "relationship:Message.recipient", "mongoose") in relationship_edges
    assert ("prisma/schema.prisma", "relationship:Post.author", "prisma") in relationship_edges
    assert ("src/models/python_models.py", "relationship:Customer.organization", "django") in relationship_edges
    assert ("src/models/python_models.py", "relationship:Order.user", "sqlalchemy") in relationship_edges
    assert ("db/migrate/20240701000000_create_accounts.rb", "field:accounts.status", "rails") in relationship_edges
    assert ("app/models/account.rb", "relationship:Account.invoices", "rails") in relationship_edges
    assert ("lib/my_app/accounts/user.ex", "field:users.active", "ecto") in relationship_edges
    assert ("lib/my_app/accounts/user.ex", "relationship:User.team", "ecto") in relationship_edges
    assert ("src/main/java/example/Customer.java", "field:Customer.email", "jpa") in relationship_edges
    assert ("src/main/java/example/Customer.java", "relationship:Customer.account", "jpa") in relationship_edges
    assert ("src/csharp_models/Payment.cs", "field:Payment.Reference", "entity_framework") in relationship_edges
    assert ("src/csharp_models/Payment.cs", "relationship:Payment.Customer", "entity_framework") in relationship_edges


def test_fast_index_persists_common_migration_facts_and_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "db" / "migrate").mkdir(parents=True)
    (source_repo / "alembic" / "versions").mkdir(parents=True)
    (source_repo / "billing" / "migrations").mkdir(parents=True)
    (source_repo / "database" / "migrations").mkdir(parents=True)
    (source_repo / "prisma" / "migrations" / "20240701000000_init").mkdir(parents=True)
    (source_repo / "migrations").mkdir(parents=True)
    (source_repo / "ef" / "Migrations").mkdir(parents=True)

    (source_repo / "db" / "migrate" / "20240701000000_create_accounts.rb").write_text(
        "class CreateAccounts < ActiveRecord::Migration[7.1]\n"
        "  def change\n"
        "    create_table :accounts do |t|\n"
        "      t.string :email\n"
        "    end\n"
        "    add_column :accounts, :status, :string\n"
        "    add_index :accounts, :email\n"
        "  end\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "alembic" / "versions" / "20240701_add_users.py").write_text(
        "from alembic import op\n"
        "import sqlalchemy as sa\n\n"
        "def upgrade():\n"
        "    op.create_table('users', sa.Column('id', sa.Integer()))\n"
        "    op.add_column('users', sa.Column('email', sa.String()))\n"
        "    op.create_index('ix_users_email', 'users', ['email'])\n",
        encoding="utf-8",
    )
    (source_repo / "billing" / "migrations" / "0001_initial.py").write_text(
        "from django.db import migrations, models\n\n"
        "class Migration(migrations.Migration):\n"
        "    operations = [\n"
        "        migrations.CreateModel(name='Customer', fields=[]),\n"
        "        migrations.AddField(model_name='customer', name='email', field=models.EmailField()),\n"
        "    ]\n",
        encoding="utf-8",
    )
    (source_repo / "database" / "migrations" / "2024_07_01_000000_create_payments.php").write_text(
        "<?php\n"
        "return new class extends Migration {\n"
        "  public function up(): void {\n"
        "    Schema::create('payments', function (Blueprint $table) {\n"
        "      $table->id();\n"
        "      $table->string('reference');\n"
        "    });\n"
        "  }\n"
        "};\n",
        encoding="utf-8",
    )
    (source_repo / "prisma" / "migrations" / "20240701000000_init" / "migration.sql").write_text(
        "CREATE TABLE \"posts\" (\"id\" INTEGER PRIMARY KEY);\n"
        "ALTER TABLE \"posts\" ADD COLUMN \"title\" TEXT;\n",
        encoding="utf-8",
    )
    (source_repo / "migrations" / "20240701_create_reports.ts").write_text(
        "export async function up(knex) {\n"
        "  await knex.schema.createTable('reports', (table) => {\n"
        "    table.increments('id');\n"
        "    table.string('name');\n"
        "  });\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "ef" / "Migrations" / "20240701000000_AddInvoices.cs").write_text(
        "public partial class AddInvoices : Migration {\n"
        "  protected override void Up(MigrationBuilder migrationBuilder) {\n"
        "    migrationBuilder.CreateTable(name: \"Invoices\", columns: table => new { Id = table.Column<int>() });\n"
        "    migrationBuilder.AddColumn<string>(name: \"Number\", table: \"Invoices\");\n"
        "    migrationBuilder.CreateIndex(name: \"IX_Invoices_Number\", table: \"Invoices\", column: \"Number\");\n"
        "  }\n"
        "}\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("migration-facts", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "migration", "limit": 80})
        relationships_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "defines_migration", "limit": 80},
        )
        teaching_response = client.get(
            f"/api/repos/{repo.id}/teaching/query",
            params={"question": "which migration adds users email column", "limit": 6},
        )

    assert overview_response.status_code == 200
    overview_facts = {
        (item["action"], item["table"], item["field"], item["framework"])
        for item in overview_response.json()["migration_facts"]
    }
    assert ("create_table", "accounts", "", "rails") in overview_facts
    assert ("add_column", "accounts", "status", "rails") in overview_facts
    assert ("add_index", "accounts", "email", "rails") in overview_facts
    assert ("create_table", "users", "", "alembic") in overview_facts
    assert ("add_column", "users", "email", "alembic") in overview_facts
    assert ("create_model", "Customer", "", "django") in overview_facts
    assert ("add_field", "customer", "email", "django") in overview_facts
    assert ("add_column", "payments", "reference", "laravel") in overview_facts
    assert ("add_column", "posts", "title", "prisma") in overview_facts
    assert ("add_column", "reports", "name", "knex") in overview_facts
    assert ("add_column", "Invoices", "Number", "entity_framework") in overview_facts

    assert facts_response.status_code == 200
    facts = {item["key"]: item for item in facts_response.json()["facts"]}
    assert facts["add_column:users.email"]["metadata"]["source"] == "alembic"
    assert facts["add_column:users.email"]["source_path"] == "alembic/versions/20240701_add_users.py"
    assert facts["add_column:posts.title"]["metadata"]["framework"] == "prisma"
    assert facts["add_column:Invoices.Number"]["metadata"]["operation"] == "AddColumn"

    assert relationships_response.status_code == 200
    relationship_edges = {
        (item["source_path"], item["target"], item["metadata"]["framework"], item["metadata"]["operation"])
        for item in relationships_response.json()["relationships"]
    }
    assert ("alembic/versions/20240701_add_users.py", "add_column:users.email", "alembic", "add_column") in relationship_edges
    assert ("prisma/migrations/20240701000000_init/migration.sql", "add_column:posts.title", "prisma", "ALTER TABLE ADD COLUMN") in relationship_edges
    assert ("ef/Migrations/20240701000000_AddInvoices.cs", "add_index:Invoices", "entity_framework", "CreateIndex") in relationship_edges

    assert teaching_response.status_code == 200
    evidence = teaching_response.json()["evidence"]
    assert any(item["kind"] == "migration" and item["title"] == "add_column:users.email" for item in evidence)


def test_repo_facts_reader_orders_legacy_rows_without_rank(tmp_path):
    metadata = MetadataStore(db_path=str(tmp_path / "repo.sqlite"))
    try:
        metadata.add_repo_facts_batch([
            RepoFactRecord(
                kind="dependency",
                key="react",
                value="JavaScript/TypeScript",
                source_path="package.json",
                metadata={"scope": "runtime"},
            ),
            RepoFactRecord(
                kind="route_endpoint",
                key="GET /health",
                value="fastapi",
                source_path="src/api.py",
                source_line=12,
                metadata={"method": "GET"},
            ),
            RepoFactRecord(
                kind="runbook_command",
                key="test",
                value="npm run test",
                source_path="package.json",
                metadata={"category": "test"},
            ),
        ])
        metadata.conn.execute(
            """
            INSERT INTO repo_facts (
                kind, key, value, source_path, source_line, confidence, metadata_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("symbol", "legacy_symbol", "function", "src/legacy.py", 5, "derived", "{bad-json"),
        )
        metadata.conn.commit()

        facts = metadata.get_repo_facts(limit=10)
    finally:
        metadata.close()

    assert [fact["kind"] for fact in facts] == [
        "runbook_command",
        "route_endpoint",
        "symbol",
        "dependency",
    ]
    legacy_symbol = next(fact for fact in facts if fact["key"] == "legacy_symbol")
    assert legacy_symbol["metadata"] == {}


def test_incremental_refresh_replaces_queryable_repo_facts(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-facts", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "package.json").write_text(
        json.dumps({"dependencies": {"old-lib": "^1.0.0"}, "scripts": {"test": "vitest run"}}),
        encoding="utf-8",
    )
    (source_path / "app.py").write_text(
        "import old_dependency\n\n"
        "def run():\n"
        "    return True\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "package.json").write_text(
        json.dumps({"dependencies": {"new-lib": "^2.0.0"}, "scripts": {"test": "pytest"}}),
        encoding="utf-8",
    )
    (source_path / "app.py").write_text(
        "import new_dependency\n\n"
        "def run():\n"
        "    return True\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        dependencies = {fact["key"] for fact in metadata.get_repo_facts(kind="dependency")}
        imports = {fact["key"] for fact in metadata.get_repo_facts(kind="import")}
        runbook_values = {fact["value"] for fact in metadata.get_repo_facts(kind="runbook_command")}
    finally:
        metadata.close()

    assert "new-lib" in dependencies
    assert "old-lib" not in dependencies
    assert "new_dependency" in imports
    assert "old_dependency" not in imports
    assert "npm run test" in runbook_values


def test_fast_index_persists_route_relationships_and_relationship_endpoint(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "src" / "api.py").write_text(
        "from fastapi import FastAPI\n"
        "app = FastAPI()\n\n"
        "@app.get('/health')\n"
        "def health():\n"
        "    return {'ok': True}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "server.ts").write_text(
        "import express from 'express'\n"
        "const router = express.Router()\n"
        "router.post('/api/users', createUser)\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "fastify.ts").write_text(
        "import Fastify from 'fastify'\n"
        "const fastify = Fastify()\n"
        "fastify.get('/api/fastify/health', health)\n"
        "fastify.route({ method: ['GET', 'POST'], url: '/api/fastify/reports/:reportId', handler: reports })\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "hono.ts").write_text(
        "import { Hono } from 'hono'\n"
        "const app = new Hono()\n"
        "app.get('/api/hono/accounts/:accountId', showAccount)\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "koa.ts").write_text(
        "import Router from '@koa/router'\n"
        "const router = new Router()\n"
        "router.delete('/api/koa/sessions/:sessionId', destroySession)\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "orders.controller.ts").write_text(
        "import { Controller, Delete, Get, Post } from '@nestjs/common'\n\n"
        "@Controller('api/nest/orders')\n"
        "export class OrdersController {\n"
        "  @Get(':orderId')\n"
        "  show() {}\n\n"
        "  @Post()\n"
        "  create() {}\n\n"
        "  @Delete(':orderId/items/:itemId')\n"
        "  removeItem() {}\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "urls.py").write_text(
        "from django.urls import path, re_path\n"
        "from . import views\n\n"
        "urlpatterns = [\n"
        "    path('accounts/<int:user_id>/', views.account_detail, name='account-detail'),\n"
        "    re_path(r'^reports/(?P<slug>[-\\w]+)/$', views.report_detail),\n"
        "]\n",
        encoding="utf-8",
    )
    (source_repo / "routes").mkdir()
    (source_repo / "routes" / "web.php").write_text(
        "<?php\n"
        "use Illuminate\\Support\\Facades\\Route;\n\n"
        "Route::get('/billing/{invoice}', [BillingController::class, 'show']);\n"
        "Route::match(['GET', 'POST'], '/search', [SearchController::class, 'handle']);\n",
        encoding="utf-8",
    )
    (source_repo / "config").mkdir()
    (source_repo / "config" / "routes.rb").write_text(
        "Rails.application.routes.draw do\n"
        "  root 'home#index'\n"
        "  get '/reports/:id', to: 'reports#show'\n"
        "  resources :projects\n"
        "end\n",
        encoding="utf-8",
    )
    (source_repo / "cmd" / "api").mkdir(parents=True)
    (source_repo / "cmd" / "api" / "main.go").write_text(
        "package main\n\n"
        "import \"net/http\"\n\n"
        "func main() {\n"
        "    http.HandleFunc(\"/ready\", ready)\n"
        "    r.Get(\"/api/go/orders/{orderID}\", getOrder)\n"
        "    r.Post(\"/api/go/orders\", createOrder)\n"
        "    router.HandleFunc(\"/api/gorilla/search/{term}\", search).Methods(\"GET\", \"POST\")\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "main" / "java" / "example").mkdir(parents=True)
    (source_repo / "src" / "main" / "java" / "example" / "AccountController.java").write_text(
        "package example;\n\n"
        "import org.springframework.web.bind.annotation.*;\n\n"
        "@RestController\n"
        "@RequestMapping(\"/api/spring/accounts\")\n"
        "public class AccountController {\n"
        "    @GetMapping(\"/{accountId}\")\n"
        "    public String show() { return \"ok\"; }\n\n"
        "    @RequestMapping(value = \"/bulk\", method = RequestMethod.DELETE)\n"
        "    public void deleteBulk() {}\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "main" / "kotlin" / "example").mkdir(parents=True)
    (source_repo / "src" / "main" / "kotlin" / "example" / "ReportController.kt").write_text(
        "package example\n\n"
        "import org.springframework.web.bind.annotation.PostMapping\n"
        "import org.springframework.web.bind.annotation.RequestMapping\n"
        "import org.springframework.web.bind.annotation.RestController\n\n"
        "@RestController\n"
        "@RequestMapping(\"/api/kotlin/reports\")\n"
        "class ReportController {\n"
        "    @PostMapping(\"/{reportId}/publish\")\n"
        "    fun publish() = \"ok\"\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "Controllers").mkdir(parents=True)
    (source_repo / "src" / "Controllers" / "OrdersController.cs").write_text(
        "using Microsoft.AspNetCore.Mvc;\n\n"
        "[ApiController]\n"
        "[Route(\"api/[controller]\")]\n"
        "public class OrdersController : ControllerBase {\n"
        "    [HttpGet(\"{orderId}\")]\n"
        "    public IActionResult Show() => Ok();\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "Program.cs").write_text(
        "var builder = WebApplication.CreateBuilder(args);\n"
        "var app = builder.Build();\n"
        "app.MapGet(\"/api/minimal/health\", () => Results.Ok());\n"
        "app.MapMethods(\"/api/minimal/search/{term}\", new[] { \"GET\", \"POST\" }, Search);\n"
        "app.Run();\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("relationships", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        route_relationships = metadata.get_relationships(rel_type="defines_route")
    finally:
        metadata.close()

    by_target = {row["target"]: row for row in route_relationships}
    assert {
        "GET /health",
        "POST /api/users",
        "ANY /accounts/:user_id/",
        "ANY /reports/:slug/",
        "GET /billing/:invoice",
        "POST /search",
        "GET /reports/:id",
        "ANY /projects",
        "ANY /ready",
        "GET /api/fastify/health",
        "GET /api/fastify/reports/:reportId",
        "POST /api/fastify/reports/:reportId",
        "GET /api/hono/accounts/:accountId",
        "DELETE /api/koa/sessions/:sessionId",
        "GET /api/nest/orders/:orderId",
        "POST /api/nest/orders",
        "DELETE /api/nest/orders/:orderId/items/:itemId",
        "GET /api/go/orders/:orderID",
        "POST /api/go/orders",
        "GET /api/gorilla/search/:term",
        "POST /api/gorilla/search/:term",
        "GET /api/spring/accounts/:accountId",
        "DELETE /api/spring/accounts/bulk",
        "POST /api/kotlin/reports/:reportId/publish",
        "GET /api/:controller/:orderId",
        "GET /api/minimal/health",
        "POST /api/minimal/search/:term",
    }.issubset(by_target)
    assert by_target["GET /health"]["dst_kind"] == "route"
    assert by_target["GET /health"]["metadata"]["framework"] == "python decorator"
    assert by_target["POST /api/users"]["metadata"]["framework"] == "express"
    assert by_target["ANY /accounts/:user_id/"]["metadata"]["framework"] == "django"
    assert by_target["ANY /reports/:slug/"]["metadata"]["framework"] == "django"
    assert by_target["GET /billing/:invoice"]["metadata"]["framework"] == "laravel"
    assert by_target["POST /search"]["metadata"]["framework"] == "laravel"
    assert by_target["GET /reports/:id"]["metadata"]["framework"] == "rails"
    assert by_target["ANY /projects"]["metadata"]["framework"] == "rails"
    assert by_target["ANY /ready"]["metadata"]["framework"] == "go net/http"
    assert by_target["GET /api/fastify/health"]["metadata"]["framework"] == "fastify"
    assert by_target["POST /api/fastify/reports/:reportId"]["metadata"]["framework"] == "fastify"
    assert by_target["GET /api/hono/accounts/:accountId"]["metadata"]["framework"] == "hono"
    assert by_target["DELETE /api/koa/sessions/:sessionId"]["metadata"]["framework"] == "koa"
    assert by_target["GET /api/nest/orders/:orderId"]["metadata"]["framework"] == "nestjs"
    assert by_target["POST /api/nest/orders"]["metadata"]["framework"] == "nestjs"
    assert by_target["GET /api/go/orders/:orderID"]["metadata"]["framework"] == "go router"
    assert by_target["GET /api/gorilla/search/:term"]["metadata"]["framework"] == "go gorilla"
    assert by_target["GET /api/spring/accounts/:accountId"]["metadata"]["framework"] == "spring"
    assert by_target["DELETE /api/spring/accounts/bulk"]["metadata"]["framework"] == "spring"
    assert by_target["POST /api/kotlin/reports/:reportId/publish"]["metadata"]["framework"] == "spring"
    assert by_target["GET /api/:controller/:orderId"]["metadata"]["framework"] == "aspnet"
    assert by_target["GET /api/minimal/health"]["metadata"]["framework"] == "aspnet"
    assert by_target["POST /api/minimal/search/:term"]["metadata"]["framework"] == "aspnet"

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        route_response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "defines_route"})
        import_response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "imports"})

    assert route_response.status_code == 200
    route_body = route_response.json()
    assert route_body["repo_id"] == repo.id
    route_edges = {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["framework"])
        for item in route_body["relationships"]
    }
    assert ("defines_route", "src/api.py", "GET /health", "python decorator") in route_edges
    assert ("defines_route", "src/server.ts", "POST /api/users", "express") in route_edges
    assert ("defines_route", "src/urls.py", "ANY /accounts/:user_id/", "django") in route_edges
    assert ("defines_route", "src/urls.py", "ANY /reports/:slug/", "django") in route_edges
    assert ("defines_route", "routes/web.php", "GET /billing/:invoice", "laravel") in route_edges
    assert ("defines_route", "routes/web.php", "POST /search", "laravel") in route_edges
    assert ("defines_route", "config/routes.rb", "GET /reports/:id", "rails") in route_edges
    assert ("defines_route", "config/routes.rb", "ANY /projects", "rails") in route_edges
    assert ("defines_route", "src/fastify.ts", "GET /api/fastify/health", "fastify") in route_edges
    assert ("defines_route", "src/fastify.ts", "POST /api/fastify/reports/:reportId", "fastify") in route_edges
    assert ("defines_route", "src/hono.ts", "GET /api/hono/accounts/:accountId", "hono") in route_edges
    assert ("defines_route", "src/koa.ts", "DELETE /api/koa/sessions/:sessionId", "koa") in route_edges
    assert ("defines_route", "src/orders.controller.ts", "GET /api/nest/orders/:orderId", "nestjs") in route_edges
    assert ("defines_route", "src/orders.controller.ts", "DELETE /api/nest/orders/:orderId/items/:itemId", "nestjs") in route_edges
    assert ("defines_route", "cmd/api/main.go", "GET /api/go/orders/:orderID", "go router") in route_edges
    assert ("defines_route", "cmd/api/main.go", "GET /api/gorilla/search/:term", "go gorilla") in route_edges
    assert (
        "defines_route",
        "src/main/java/example/AccountController.java",
        "DELETE /api/spring/accounts/bulk",
        "spring",
    ) in route_edges
    assert (
        "defines_route",
        "src/main/kotlin/example/ReportController.kt",
        "POST /api/kotlin/reports/:reportId/publish",
        "spring",
    ) in route_edges
    assert ("defines_route", "src/Controllers/OrdersController.cs", "GET /api/:controller/:orderId", "aspnet") in route_edges
    assert ("defines_route", "src/Program.cs", "POST /api/minimal/search/:term", "aspnet") in route_edges

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        route_facts = metadata.get_repo_facts(kind="route_endpoint", limit=100)
    finally:
        metadata.close()
    fact_edges = {(fact["key"], fact["source_path"], fact["metadata"]["framework"]) for fact in route_facts}
    assert ("GET /api/fastify/health", "src/fastify.ts", "fastify") in fact_edges
    assert ("GET /api/hono/accounts/:accountId", "src/hono.ts", "hono") in fact_edges
    assert ("GET /api/nest/orders/:orderId", "src/orders.controller.ts", "nestjs") in fact_edges
    assert ("GET /api/go/orders/:orderID", "cmd/api/main.go", "go router") in fact_edges
    assert (
        "GET /api/spring/accounts/:accountId",
        "src/main/java/example/AccountController.java",
        "spring",
    ) in fact_edges
    assert ("GET /api/:controller/:orderId", "src/Controllers/OrdersController.cs", "aspnet") in fact_edges

    assert import_response.status_code == 200
    import_edges = {
        (item["rel_type"], item["source_path"], item["target"])
        for item in import_response.json()["relationships"]
    }
    assert ("imports", "src/api.py", "fastapi") in import_edges
    assert ("imports", "src/server.ts", "express") in import_edges


def test_fast_index_persists_test_and_config_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "tests").mkdir()
    (source_repo / "src" / "api.py").write_text(
        "def health():\n"
        "    return {'ok': True}\n",
        encoding="utf-8",
    )
    (source_repo / "tests" / "test_api.py").write_text(
        "from src.api import health\n\n"
        "def test_health():\n"
        "    assert health()['ok'] is True\n",
        encoding="utf-8",
    )
    (source_repo / "package.json").write_text(
        json.dumps({"scripts": {"test": "pytest"}, "dependencies": {"react": "^18.3.0"}}),
        encoding="utf-8",
    )
    (source_repo / "tsconfig.json").write_text(
        json.dumps({"compilerOptions": {"strict": True}}),
        encoding="utf-8",
    )

    repo = registry.create_repo("test-config-relationships", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        test_relationships = metadata.get_relationships(rel_type="tests")
        config_relationships = metadata.get_relationships(rel_type="configures")
    finally:
        metadata.close()

    test_edges = {
        (row["src_kind"], row["dst_kind"], row["target"], row["metadata"]["source_path"], row["metadata"]["target_path"])
        for row in test_relationships
    }
    assert ("file", "file", "src/api.py", "tests/test_api.py", "src/api.py") in test_edges

    config_edges = {
        (row["source_line"], row["dst_kind"], row["target"], row["metadata"]["tool"], row["metadata"]["source_path"])
        for row in config_relationships
    }
    assert (1, "tool", "JavaScript/TypeScript package", "JavaScript/TypeScript package", "package.json") in config_edges
    assert (1, "tool", "TypeScript compiler", "TypeScript compiler", "tsconfig.json") in config_edges

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        tests_response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "tests"})
        config_response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "configures"})

    assert tests_response.status_code == 200
    assert {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["target_path"])
        for item in tests_response.json()["relationships"]
    } == {("tests", "tests/test_api.py", "src/api.py", "src/api.py")}

    assert config_response.status_code == 200
    assert {
        (item["rel_type"], item["source_path"], item["target"])
        for item in config_response.json()["relationships"]
    } >= {
        ("configures", "package.json", "JavaScript/TypeScript package"),
        ("configures", "tsconfig.json", "TypeScript compiler"),
    }


def test_fast_index_maps_behavior_named_tests_to_imported_source_files(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src" / "billing").mkdir(parents=True)
    (source_repo / "tests").mkdir()
    (source_repo / "packages" / "web" / "src").mkdir(parents=True)
    (source_repo / "packages" / "web" / "__tests__").mkdir()
    (source_repo / "src" / "billing" / "invoice.py").write_text(
        "def issue_invoice(order_id):\n"
        "    return f'invoice-{order_id}'\n",
        encoding="utf-8",
    )
    (source_repo / "tests" / "test_checkout_flow.py").write_text(
        "from src.billing.invoice import issue_invoice\n\n"
        "def test_checkout_flow_generates_invoice():\n"
        "    assert issue_invoice('42') == 'invoice-42'\n",
        encoding="utf-8",
    )
    (source_repo / "packages" / "web" / "src" / "checkoutService.ts").write_text(
        "export function buildCheckoutPayload(id: string) {\n"
        "  return { id }\n"
        "}\n",
        encoding="utf-8",
    )
    (source_repo / "packages" / "web" / "__tests__" / "checkout-flow.spec.ts").write_text(
        "import { buildCheckoutPayload } from '../src/checkoutService'\n\n"
        "test('checkout flow builds payload', () => {\n"
        "  expect(buildCheckoutPayload('42').id).toBe('42')\n"
        "})\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("import-aware-test-relationships", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        test_relationships = metadata.get_relationships(rel_type="tests")
    finally:
        metadata.close()

    test_edges = {
        (row["metadata"]["source_path"], row["target"], row["metadata"]["match"], row["source_line"])
        for row in test_relationships
    }
    assert (
        "tests/test_checkout_flow.py",
        "src/billing/invoice.py",
        "import",
        1,
    ) in test_edges
    assert (
        "packages/web/__tests__/checkout-flow.spec.ts",
        "packages/web/src/checkoutService.ts",
        "import",
        1,
    ) in test_edges

    import_metadata = {
        (row["metadata"]["source_path"], row["target"]): row["metadata"]
        for row in test_relationships
    }
    assert import_metadata[
        ("tests/test_checkout_flow.py", "src/billing/invoice.py")
    ]["import_target"] == "src.billing.invoice"
    assert import_metadata[
        ("packages/web/__tests__/checkout-flow.spec.ts", "packages/web/src/checkoutService.ts")
    ]["import_target"] == "../src/checkoutService"

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        tests_response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "tests"})

    assert tests_response.status_code == 200
    assert {
        (item["source_path"], item["target"], item["metadata"]["match"])
        for item in tests_response.json()["relationships"]
    } >= {
        ("tests/test_checkout_flow.py", "src/billing/invoice.py", "import"),
        ("packages/web/__tests__/checkout-flow.spec.ts", "packages/web/src/checkoutService.ts", "import"),
    }


def test_fast_index_persists_export_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "web").mkdir()
    (source_repo / "src" / "public_api.py").write_text(
        "def public_function():\n"
        "    return True\n\n"
        "def _hidden_function():\n"
        "    return False\n\n"
        "class PublicService:\n"
        "    def method(self):\n"
        "        return public_function()\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "exports.ts").write_text(
        "function localHelper() { return 1 }\n"
        "export function exportedFunction() { return localHelper() }\n"
        "export class ExportedWidget {}\n"
        "const renamedHelper = () => (localHelper())\n"
        "export { renamedHelper as helperAlias }\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("exports", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        export_relationships = metadata.get_relationships(rel_type="exports")
    finally:
        metadata.close()

    export_edges = {
        (row["source_line"], row["source_path"] if "source_path" in row else row["metadata"]["source_path"], row["target"], row["metadata"]["syntax"], row["metadata"].get("exported_as"))
        for row in export_relationships
    }
    assert (1, "src/public_api.py", "public_function", "public-top-level-symbol", None) in export_edges
    assert (7, "src/public_api.py", "PublicService", "public-top-level-symbol", None) in export_edges
    assert (2, "web/exports.ts", "exportedFunction", "export-declaration", "exportedFunction") in export_edges
    assert (3, "web/exports.ts", "ExportedWidget", "export-declaration", "ExportedWidget") in export_edges
    assert (4, "web/exports.ts", "renamedHelper", "export-list", "helperAlias") in export_edges
    assert all(row["target"] not in {"_hidden_function", "localHelper", "method"} for row in export_relationships)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "exports"})

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    api_edges = {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["syntax"])
        for item in body["relationships"]
    }
    assert ("exports", "src/public_api.py", "public_function", "public-top-level-symbol") in api_edges
    assert ("exports", "web/exports.ts", "renamedHelper", "export-list") in api_edges


def test_fast_index_persists_mention_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "web").mkdir()
    (source_repo / "README.md").write_text(
        "# Usage\n\n"
        "Use PublicService for API setup. The docs also mention renamedHelper.\n"
        "Local implementation detail localHelper should not become a mention edge.\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "public_api.py").write_text(
        "class PublicService:\n"
        "    pass\n\n"
        "class _HiddenService:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "exports.ts").write_text(
        "function localHelper() { return 1 }\n"
        "const renamedHelper = () => (localHelper())\n"
        "export { renamedHelper as helperAlias }\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("mentions", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        mention_relationships = metadata.get_relationships(rel_type="mentions")
    finally:
        metadata.close()

    mention_edges = {
        (row["source_line"], row["metadata"]["source_path"], row["target"], row["metadata"]["target_path"], row["metadata"]["symbol_type"])
        for row in mention_relationships
    }
    assert (3, "README.md", "PublicService", "src/public_api.py", "class") in mention_edges
    assert (3, "README.md", "renamedHelper", "web/exports.ts", "function") in mention_edges
    assert all(row["target"] not in {"_HiddenService", "localHelper"} for row in mention_relationships)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "mentions"})

    assert response.status_code == 200
    assert {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["target_path"])
        for item in response.json()["relationships"]
    } >= {
        ("mentions", "README.md", "PublicService", "src/public_api.py"),
        ("mentions", "README.md", "renamedHelper", "web/exports.ts"),
    }


def test_fast_index_persists_call_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "web").mkdir()
    (source_repo / "src" / "calls.py").write_text(
        "def helper():\n"
        "    return 1\n\n"
        "def controller():\n"
        "    return helper()\n\n"
        "class Worker:\n"
        "    def run(self):\n"
        "        return helper()\n\n"
        "def unrelated():\n"
        "    return missing_call()\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "helpers.py").write_text(
        "def external_helper():\n"
        "    return 2\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "controller.py").write_text(
        "from .helpers import external_helper as run_external\n"
        "import src.helpers as helper_module\n\n"
        "def imported_controller():\n"
        "    return run_external()\n\n"
        "def namespace_controller():\n"
        "    return helper_module.external_helper()\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "calls.ts").write_text(
        "function localHelper() { return 1 }\n"
        "export function runThing() { return localHelper() }\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "helpers.ts").write_text(
        "export function externalHelper() { return 2 }\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "controller.ts").write_text(
        "import { externalHelper as runExternal } from './helpers'\n"
        "import * as helperNamespace from './helpers'\n\n"
        "export function webController() { return runExternal() }\n"
        "export function webNamespaceController() { return helperNamespace.externalHelper() }\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("calls", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        call_relationships = metadata.get_relationships(rel_type="calls")
    finally:
        metadata.close()

    call_edges = {
        (
            row["src_kind"],
            row["dst_kind"],
            row["source_line"],
            row["metadata"]["source_path"],
            row["metadata"]["caller"],
            row["target"],
            row["metadata"]["syntax"],
        )
        for row in call_relationships
    }
    assert ("symbol", "symbol", 5, "src/calls.py", "controller", "helper", "name-call") in call_edges
    assert ("symbol", "symbol", 9, "src/calls.py", "run", "helper", "name-call") in call_edges
    assert ("symbol", "symbol", 2, "web/calls.ts", "runThing", "localHelper", "direct-call") in call_edges
    assert ("symbol", "symbol", 5, "src/controller.py", "imported_controller", "external_helper", "imported-name-call") in call_edges
    assert ("symbol", "symbol", 8, "src/controller.py", "namespace_controller", "external_helper", "imported-attribute-call") in call_edges
    assert ("symbol", "symbol", 4, "web/controller.ts", "webController", "externalHelper", "imported-name-call") in call_edges
    assert ("symbol", "symbol", 5, "web/controller.ts", "webNamespaceController", "externalHelper", "imported-attribute-call") in call_edges
    assert all(row["target"] != "missing_call" for row in call_relationships)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "calls"})

    assert response.status_code == 200
    assert {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["caller"])
        for item in response.json()["relationships"]
    } >= {
        ("calls", "src/calls.py", "helper", "controller"),
        ("calls", "src/calls.py", "helper", "run"),
        ("calls", "src/controller.py", "external_helper", "imported_controller"),
        ("calls", "src/controller.py", "external_helper", "namespace_controller"),
        ("calls", "web/calls.ts", "localHelper", "runThing"),
        ("calls", "web/controller.ts", "externalHelper", "webController"),
        ("calls", "web/controller.ts", "externalHelper", "webNamespaceController"),
    }


def test_repo_module_detail_endpoint_projects_module_graph(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src" / "auth").mkdir(parents=True)
    (source_repo / "src" / "payments").mkdir(parents=True)
    (source_repo / "src" / "auth" / "service.py").write_text(
        "from src.auth.models import User\n"
        "from src.payments.charge import charge_card\n\n"
        "def login(user):\n"
        "    profile = User()\n"
        "    return charge_card(user.id) or profile\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "auth" / "models.py").write_text(
        "class User:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "payments" / "charge.py").write_text(
        "def charge_card(user_id):\n"
        "    return True\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "main.py").write_text(
        "from src.auth.service import login\n\n"
        "def main():\n"
        "    return login('demo')\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("module-detail", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        overview_response = client.get(f"/api/repos/{repo.id}/overview")
        facts_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "module_dependency", "limit": 20})
        relationships_response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "depends_on_module", "limit": 20})
        response = client.get(f"/api/repos/{repo.id}/modules/src/auth")

    assert overview_response.status_code == 200
    overview_body = overview_response.json()
    module_dependencies = {
        (item["source_module"], item["target_module"]): item
        for item in overview_body["module_dependencies"]
    }
    assert module_dependencies[("src/auth", "src/payments")]["target_path"] == "src/payments/charge.py"
    assert module_dependencies[("src", "src/auth")]["target_path"] == "src/auth/service.py"

    assert facts_response.status_code == 200
    fact_edges = {
        (item["key"], item["metadata"]["source_module"], item["metadata"]["target_module"], item["metadata"]["target_path"])
        for item in facts_response.json()["facts"]
    }
    assert ("src/auth -> src/payments", "src/auth", "src/payments", "src/payments/charge.py") in fact_edges
    assert ("src -> src/auth", "src", "src/auth", "src/auth/service.py") in fact_edges

    assert relationships_response.status_code == 200
    module_edges = {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["source_module"], item["metadata"]["target_module"], item["metadata"]["target_path"])
        for item in relationships_response.json()["relationships"]
    }
    assert ("depends_on_module", "src/auth/service.py", "src/payments", "src/auth", "src/payments", "src/payments/charge.py") in module_edges
    assert ("depends_on_module", "src/main.py", "src/auth", "src", "src/auth", "src/auth/service.py") in module_edges

    assert response.status_code == 200
    body = response.json()
    assert body["repo_id"] == repo.id
    assert body["module_path"] == "src/auth"
    assert {item["path"] for item in body["files"]} == {"src/auth/models.py", "src/auth/service.py"}
    assert {item["name"] for item in body["symbols"]} >= {"User", "login"}
    assert {item["target"] for item in body["imports"]} >= {"src.auth.models", "src.payments.charge"}
    assert {item["target"] for item in body["exports"]} >= {"User", "login"}
    assert ("calls", "src/auth/service.py", "charge_card", "src/payments/charge.py") in {
        (item["rel_type"], item["source_path"], item["target"], item["target_path"])
        for item in body["outgoing"]
    }
    assert ("depends_on_module", "src/auth/service.py", "src/payments") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in body["outgoing"]
    }
    assert ("calls", "src/main.py", "login", "src/auth/service.py") in {
        (item["rel_type"], item["source_path"], item["target"], item["target_path"])
        for item in body["incoming"]
    }
    assert ("depends_on_module", "src/main.py", "src/auth") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in body["incoming"]
    }


def test_repo_module_detail_works_after_source_snapshot_is_pruned(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("source-pruned-module-detail", "upload", None)
    source_repo = Path(repo.storage_path) / "source"
    (source_repo / "src" / "auth").mkdir(parents=True)
    (source_repo / "src" / "auth" / "service.py").write_text(
        "def login(user):\n"
        "    return bool(user)\n",
        encoding="utf-8",
    )
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)
    shutil.rmtree(Path(repo.storage_path) / "source")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/modules/src/auth")

    assert response.status_code == 200
    body = response.json()
    assert body["module_path"] == "src/auth"
    assert body["files"][0]["path"] == "src/auth/service.py"
    assert body["symbols"][0]["name"] == "login"


def test_fast_index_persists_reference_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    source_repo = tmp_path / "source_repo"
    (source_repo / "src").mkdir(parents=True)
    (source_repo / "web").mkdir()
    (source_repo / "src" / "local_refs.py").write_text(
        "class LocalService:\n"
        "    pass\n\n"
        "def local_reference():\n"
        "    return LocalService\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "helpers.py").write_text(
        "class ExternalService:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (source_repo / "src" / "controller.py").write_text(
        "from .helpers import ExternalService as ServiceAlias\n"
        "import src.helpers as helper_module\n\n"
        "def imported_reference():\n"
        "    return ServiceAlias\n\n"
        "def namespace_reference():\n"
        "    return helper_module.ExternalService\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "helpers.ts").write_text(
        "export class ExternalWidget {}\n",
        encoding="utf-8",
    )
    (source_repo / "web" / "controller.ts").write_text(
        "import { ExternalWidget as Widget } from './helpers'\n"
        "import * as widgets from './helpers'\n\n"
        "export function pickWidget() { return Widget }\n"
        "export function pickNamespaceWidget() { return widgets.ExternalWidget }\n",
        encoding="utf-8",
    )

    repo = registry.create_repo("references", "upload", None)
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_repo)

    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        reference_relationships = metadata.get_relationships(rel_type="references")
    finally:
        metadata.close()

    reference_edges = {
        (
            row["src_kind"],
            row["dst_kind"],
            row["source_line"],
            row["metadata"]["source_path"],
            row["metadata"]["caller"],
            row["target"],
            row["metadata"]["syntax"],
        )
        for row in reference_relationships
    }
    assert ("symbol", "symbol", 5, "src/local_refs.py", "local_reference", "LocalService", "name-reference") in reference_edges
    assert ("symbol", "symbol", 5, "src/controller.py", "imported_reference", "ExternalService", "imported-name-reference") in reference_edges
    assert ("symbol", "symbol", 8, "src/controller.py", "namespace_reference", "ExternalService", "imported-attribute-reference") in reference_edges
    assert ("symbol", "symbol", 4, "web/controller.ts", "pickWidget", "ExternalWidget", "imported-name-reference") in reference_edges
    assert ("symbol", "symbol", 5, "web/controller.ts", "pickNamespaceWidget", "ExternalWidget", "imported-attribute-reference") in reference_edges

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/relationships", params={"rel_type": "references"})

    assert response.status_code == 200
    assert {
        (item["rel_type"], item["source_path"], item["target"], item["metadata"]["caller"])
        for item in response.json()["relationships"]
    } >= {
        ("references", "src/local_refs.py", "LocalService", "local_reference"),
        ("references", "src/controller.py", "ExternalService", "imported_reference"),
        ("references", "src/controller.py", "ExternalService", "namespace_reference"),
        ("references", "web/controller.ts", "ExternalWidget", "pickWidget"),
        ("references", "web/controller.ts", "ExternalWidget", "pickNamespaceWidget"),
    }


def test_incremental_refresh_replaces_route_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-route-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "api.py").write_text(
        "from fastapi import FastAPI\n"
        "app = FastAPI()\n\n"
        "@app.get('/old')\n"
        "def old():\n"
        "    return {'old': True}\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "api.py").write_text(
        "from fastapi import FastAPI\n"
        "app = FastAPI()\n\n"
        "@app.get('/new')\n"
        "def new():\n"
        "    return {'new': True}\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        targets = {
            row["target"]
            for row in metadata.get_relationships(rel_type="defines_route")
        }
    finally:
        metadata.close()

    assert "GET /new" in targets
    assert "GET /old" not in targets


def test_incremental_refresh_replaces_schema_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-schema-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    (source_path / "db").mkdir(parents=True)
    schema_path = source_path / "db" / "schema.sql"
    schema_path.write_text(
        "CREATE TABLE old_invoices (\n"
        "  id integer primary key\n"
        ");\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    schema_path.write_text(
        "CREATE TABLE new_invoices (\n"
        "  id integer primary key\n"
        ");\n"
        "CREATE VIEW active_new_invoices AS SELECT * FROM new_invoices;\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        targets = {
            row["target"]
            for row in metadata.get_relationships(rel_type="defines_schema")
        }
    finally:
        metadata.close()

    assert "table:new_invoices" in targets
    assert "view:active_new_invoices" in targets
    assert "table:old_invoices" not in targets


def test_incremental_refresh_replaces_test_and_config_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-test-config-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    (source_path / "src").mkdir(parents=True)
    (source_path / "tests").mkdir()
    (source_path / "src" / "api.py").write_text(
        "def api():\n"
        "    return 'api'\n",
        encoding="utf-8",
    )
    (source_path / "tests" / "test_api.py").write_text(
        "from src.api import api\n\n"
        "def test_api():\n"
        "    assert api() == 'api'\n",
        encoding="utf-8",
    )
    (source_path / "package.json").write_text(
        json.dumps({"scripts": {"test": "pytest"}}),
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "src" / "api.py").unlink()
    (source_path / "tests" / "test_api.py").unlink()
    (source_path / "package.json").unlink()
    (source_path / "src" / "worker.py").write_text(
        "def worker():\n"
        "    return 'worker'\n",
        encoding="utf-8",
    )
    (source_path / "tests" / "test_worker.py").write_text(
        "from src.worker import worker\n\n"
        "def test_worker():\n"
        "    assert worker() == 'worker'\n",
        encoding="utf-8",
    )
    (source_path / "pyproject.toml").write_text(
        "[project]\nname = 'worker'\ndependencies = ['pytest']\n",
        encoding="utf-8",
    )

    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        test_targets = {row["target"] for row in metadata.get_relationships(rel_type="tests")}
        config_targets = {row["target"] for row in metadata.get_relationships(rel_type="configures")}
        config_sources = {row["metadata"]["source_path"] for row in metadata.get_relationships(rel_type="configures")}
    finally:
        metadata.close()

    assert "src/worker.py" in test_targets
    assert "src/api.py" not in test_targets
    assert "Python project" in config_targets
    assert "JavaScript/TypeScript package" not in config_targets
    assert "pyproject.toml" in config_sources
    assert "package.json" not in config_sources


def test_incremental_refresh_replaces_export_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-export-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "api.py").write_text(
        "def old_public():\n"
        "    return 'old'\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "api.py").write_text(
        "def new_public():\n"
        "    return 'new'\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        export_targets = {row["target"] for row in metadata.get_relationships(rel_type="exports")}
    finally:
        metadata.close()

    assert "new_public" in export_targets
    assert "old_public" not in export_targets


def test_incremental_refresh_replaces_mention_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-mention-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "README.md").write_text("Old docs mention OldService.\n", encoding="utf-8")
    (source_path / "api.py").write_text(
        "class OldService:\n"
        "    pass\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "README.md").write_text("New docs mention NewService.\n", encoding="utf-8")
    (source_path / "api.py").write_text(
        "class NewService:\n"
        "    pass\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        mention_targets = {row["target"] for row in metadata.get_relationships(rel_type="mentions")}
    finally:
        metadata.close()

    assert "NewService" in mention_targets
    assert "OldService" not in mention_targets


def test_incremental_refresh_replaces_call_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-call-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "helpers.py").write_text(
        "def old_helper():\n"
        "    return 'old'\n\n",
        encoding="utf-8",
    )
    (source_path / "calls.py").write_text(
        "from .helpers import old_helper as run_helper\n\n"
        "def controller():\n"
        "    return run_helper()\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "helpers.py").write_text(
        "def new_helper():\n"
        "    return 'new'\n\n",
        encoding="utf-8",
    )
    (source_path / "calls.py").write_text(
        "from .helpers import new_helper as run_helper\n\n"
        "def controller():\n"
        "    return run_helper()\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        call_targets = {row["target"] for row in metadata.get_relationships(rel_type="calls")}
    finally:
        metadata.close()

    assert "new_helper" in call_targets
    assert "old_helper" not in call_targets


def test_incremental_refresh_replaces_reference_relationships(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("refresh-reference-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "helpers.py").write_text(
        "class OldService:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (source_path / "refs.py").write_text(
        "from .helpers import OldService as CurrentService\n\n"
        "def reference_service():\n"
        "    return CurrentService\n",
        encoding="utf-8",
    )
    initial_job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)

    (source_path / "helpers.py").write_text(
        "class NewService:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (source_path / "refs.py").write_text(
        "from .helpers import NewService as CurrentService\n\n"
        "def reference_service():\n"
        "    return CurrentService\n",
        encoding="utf-8",
    )
    refresh_job = registry.create_job(repo.id, kind="refresh")
    routes._run_repo_refresh(repo.id, refresh_job.id)

    assert registry.get_job(refresh_job.id).status == "complete"
    metadata = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        reference_targets = {row["target"] for row in metadata.get_relationships(rel_type="references")}
    finally:
        metadata.close()

    assert "NewService" in reference_targets
    assert "OldService" not in reference_targets


def test_repo_overview_extracts_common_route_endpoints(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("routes", "upload", None)
    build_repo_index_from_files(
        repo,
        {
            "src/api.py": (
                "from fastapi import APIRouter\n"
                "router = APIRouter()\n\n"
                "@router.get('/health')\n"
                "def health():\n"
                "    return {'ok': True}\n\n"
                "@router.post('/items/{item_id}')\n"
                "def create_item(item_id: str):\n"
                "    return {'id': item_id}\n\n"
                "@app.route('/legacy', methods=['GET', 'POST'])\n"
                "def legacy():\n"
                "    return 'ok'\n"
            ),
            "src/server.ts": (
                "import express from 'express'\n"
                "const router = express.Router()\n"
                "router.get('/api/users', listUsers)\n"
                "router.post('/api/users', createUser)\n"
            ),
            "src/fastify.ts": (
                "import fastify from 'fastify'\n"
                "const app = fastify()\n"
                "app.route({ method: 'PATCH', url: '/api/fastify/users/:userId', handler: updateUser })\n"
            ),
            "src/hono.ts": (
                "import { Hono } from 'hono'\n"
                "const app = new Hono()\n"
                "app.post('/api/hono/uploads', upload)\n"
            ),
            "src/koa.ts": (
                "import Router from '@koa/router'\n"
                "const router = new Router()\n"
                "router.get('/api/koa/reports/:reportId', report)\n"
            ),
            "src/users.controller.ts": (
                "import { Controller, Get } from '@nestjs/common'\n\n"
                "@Controller('api/nest/users')\n"
                "export class UsersController {\n"
                "  @Get(':userId')\n"
                "  show() {}\n"
                "}\n"
            ),
            "app/api/users/[id]/route.ts": (
                "export async function GET() { return Response.json({}) }\n"
                "export const PATCH = async () => Response.json({})\n"
            ),
            "src/urls.py": (
                "from django.urls import path, re_path\n"
                "from . import views\n\n"
                "urlpatterns = [\n"
                "    path('accounts/<int:user_id>/', views.account_detail, name='account-detail'),\n"
                "    re_path(r'^reports/(?P<slug>[-\\w]+)/$', views.report_detail),\n"
                "]\n"
            ),
            "routes/web.php": (
                "<?php\n"
                "use Illuminate\\Support\\Facades\\Route;\n\n"
                "Route::get('/billing/{invoice}', [BillingController::class, 'show']);\n"
                "Route::match(['GET', 'POST'], '/search', [SearchController::class, 'handle']);\n"
            ),
            "config/routes.rb": (
                "Rails.application.routes.draw do\n"
                "  root 'home#index'\n"
                "  get '/reports/:id', to: 'reports#show'\n"
                "  resources :projects\n"
                "end\n"
            ),
        },
    )
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")

    assert response.status_code == 200
    endpoints = {
        (endpoint["method"], endpoint["path"], endpoint["framework"])
        for endpoint in response.json()["route_endpoints"]
    }
    assert ("GET", "/health", "python decorator") in endpoints
    assert ("POST", "/items/{item_id}", "python decorator") in endpoints
    assert ("GET", "/legacy", "python route") in endpoints
    assert ("POST", "/legacy", "python route") in endpoints
    assert ("GET", "/api/users", "express") in endpoints
    assert ("POST", "/api/users", "express") in endpoints
    assert ("PATCH", "/api/fastify/users/:userId", "fastify") in endpoints
    assert ("POST", "/api/hono/uploads", "hono") in endpoints
    assert ("GET", "/api/koa/reports/:reportId", "koa") in endpoints
    assert ("GET", "/api/nest/users/:userId", "nestjs") in endpoints
    assert ("GET", "/api/users/:id", "nextjs") in endpoints
    assert ("PATCH", "/api/users/:id", "nextjs") in endpoints
    assert ("ANY", "/accounts/:user_id/", "django") in endpoints
    assert ("ANY", "/reports/:slug/", "django") in endpoints
    assert ("GET", "/billing/:invoice", "laravel") in endpoints
    assert ("GET", "/search", "laravel") in endpoints
    assert ("POST", "/search", "laravel") in endpoints
    assert ("GET", "/", "rails") in endpoints
    assert ("GET", "/reports/:id", "rails") in endpoints
    assert ("ANY", "/projects", "rails") in endpoints
    assert ("GET", "/health", "express") not in endpoints
    assert ("POST", "/items/{item_id}", "express") not in endpoints


def test_repo_overview_uses_persisted_cache_when_source_snapshot_is_missing(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("cached-overview", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "package.json").write_text(
        json.dumps({"scripts": {"test": "vitest run"}, "dependencies": {"react": "^18.2.0"}}),
        encoding="utf-8",
    )
    api_path = source_path / "src" / "server.ts"
    api_path.parent.mkdir(parents=True)
    api_path.write_text(
        "import express from 'express'\n"
        "const router = express.Router()\n"
        "router.get('/api/cache-test', handler)\n"
        "export function handler() { return true }\n",
        encoding="utf-8",
    )
    (source_path / "README.md").write_text(
        "# Cache docs\n\n"
        "The cache endpoint is handled by handler.\n\n"
        "## Cache endpoint behavior\n\n"
        "The route should remain visible after source pruning.\n",
        encoding="utf-8",
    )
    (source_path / ".env.example").write_text(
        "CACHE_DATABASE_URL=\n"
        "CACHE_TOKEN=sample-token\n",
        encoding="utf-8",
    )
    ci_path = source_path / ".github" / "workflows" / "cache.yml"
    ci_path.parent.mkdir(parents=True)
    ci_path.write_text(
        "name: Cache CI\n"
        "on: push\n"
        "jobs:\n"
        "  test:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - run: vitest run\n",
        encoding="utf-8",
    )
    (source_path / "docker-compose.yml").write_text(
        "services:\n"
        "  cache-api:\n"
        "    image: cache-api:latest\n"
        "    ports: ['8081:80']\n"
        "    depends_on: [redis]\n"
        "  redis:\n"
        "    image: redis:7\n",
        encoding="utf-8",
    )
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_path)

    manifest = read_repo_manifest(repo.storage_path)
    before_sha = manifest["artifacts"]["repo.sqlite"]["sha256"]
    shutil.rmtree(source_path)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")

    after_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")
    assert response.status_code == 200
    body = response.json()
    assert body["package_scripts"][0]["command"] == "vitest run"
    assert ("GET", "/api/cache-test", "express") in {
        (endpoint["method"], endpoint["path"], endpoint["framework"])
        for endpoint in body["route_endpoints"]
    }
    assert ("src/server.ts", "express", 1, "heuristic") in {
        (item["source_path"], item["target"], item["source_line"], item["confidence"])
        for item in body["import_relationships"]
    }
    modules_by_path = {item["path"]: item for item in body["modules"]}
    assert modules_by_path["src"]["sample_files"] == ["src/server.ts"]
    assert modules_by_path["src"]["symbol_count"] >= 1
    assert before_sha == after_sha


def test_repo_facts_endpoint_uses_persisted_rows_when_source_snapshot_is_missing(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("cached-facts", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "package.json").write_text(
        json.dumps({"scripts": {"test": "vitest run"}, "dependencies": {"react": "^18.2.0"}}),
        encoding="utf-8",
    )
    api_path = source_path / "src" / "server.ts"
    api_path.parent.mkdir(parents=True)
    api_path.write_text(
        "import express from 'express'\n"
        "const router = express.Router()\n"
        "router.get('/api/cache-test', handler)\n"
        "export function handler() { return true }\n",
        encoding="utf-8",
    )
    (source_path / "README.md").write_text(
        "# Cache docs\n\n"
        "The cache endpoint is handled by handler.\n\n"
        "## Cache endpoint behavior\n\n"
        "The route should remain visible after source pruning.\n",
        encoding="utf-8",
    )
    (source_path / ".env.example").write_text(
        "CACHE_DATABASE_URL=\n"
        "CACHE_TOKEN=sample-token\n",
        encoding="utf-8",
    )
    ci_path = source_path / ".github" / "workflows" / "cache.yml"
    ci_path.parent.mkdir(parents=True)
    ci_path.write_text(
        "name: Cache CI\n"
        "on: push\n"
        "jobs:\n"
        "  test:\n"
        "    runs-on: ubuntu-latest\n"
        "    steps:\n"
        "      - run: vitest run\n",
        encoding="utf-8",
    )
    (source_path / "docker-compose.yml").write_text(
        "services:\n"
        "  cache-api:\n"
        "    image: cache-api:latest\n"
        "    ports: ['8081:80']\n"
        "    depends_on: [redis]\n"
        "  redis:\n"
        "    image: redis:7\n",
        encoding="utf-8",
    )
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_path)

    before_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")
    shutil.rmtree(source_path)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        modules = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "module"})
        imports = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "import"})
        routes_response = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "route_endpoint"})
        doc_sections = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "doc_section"})
        env_vars = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "env_var"})
        ci_workflows = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "ci_workflow"})
        container_services = client.get(f"/api/repos/{repo.id}/facts", params={"kind": "container_service"})

    after_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")
    assert modules.status_code == 200
    assert imports.status_code == 200
    assert routes_response.status_code == 200
    assert doc_sections.status_code == 200
    assert env_vars.status_code == 200
    assert ci_workflows.status_code == 200
    assert container_services.status_code == 200
    assert ("module", "src", "src") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in modules.json()["facts"]
    }
    assert ("import", "express", "src/server.ts") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in imports.json()["facts"]
    }
    assert ("route_endpoint", "GET /api/cache-test", "src/server.ts") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in routes_response.json()["facts"]
    }
    assert ("doc_section", "Cache endpoint behavior", "README.md") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in doc_sections.json()["facts"]
    }
    assert ("env_var", "CACHE_DATABASE_URL", ".env.example") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in env_vars.json()["facts"]
    }
    assert ("ci_workflow", "Cache CI", ".github/workflows/cache.yml") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in ci_workflows.json()["facts"]
    }
    assert ("container_service", "cache-api", "docker-compose.yml") in {
        (fact["kind"], fact["key"], fact["source_path"])
        for fact in container_services.json()["facts"]
    }
    assert before_sha == after_sha


def test_relationships_endpoint_uses_persisted_rows_when_source_snapshot_is_missing(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("cached-relationships", "upload", None)
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    api_path = source_path / "src" / "server.ts"
    api_path.parent.mkdir(parents=True)
    api_path.write_text(
        "import express from 'express'\n"
        "import { helper } from './helper'\n"
        "const router = express.Router()\n"
        "class CacheHelperClass {}\n"
        "function cacheHelper() { return helper() }\n"
        "router.get('/api/cache-test', handler)\n"
        "export function handler() { cacheHelper(); return CacheHelperClass }\n",
        encoding="utf-8",
    )
    (source_path / "src" / "helper.ts").write_text(
        "export function helper() { return true }\n",
        encoding="utf-8",
    )
    (source_path / "README.md").write_text(
        "The cache endpoint is handled by handler.\n",
        encoding="utf-8",
    )
    job = registry.create_job(repo.id, kind="upload_fast_index")
    routes._run_prepared_fast_index(repo.id, job.id, source_path)

    before_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")
    shutil.rmtree(source_path)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        routes_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "defines_route"},
        )
        imports_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "imports"},
        )
        exports_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "exports"},
        )
        mentions_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "mentions"},
        )
        calls_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "calls"},
        )
        references_response = client.get(
            f"/api/repos/{repo.id}/relationships",
            params={"rel_type": "references"},
        )

    after_sha = sha256_file(Path(repo.storage_path) / "repo.sqlite")
    assert routes_response.status_code == 200
    assert imports_response.status_code == 200
    assert exports_response.status_code == 200
    assert mentions_response.status_code == 200
    assert calls_response.status_code == 200
    assert references_response.status_code == 200
    assert ("defines_route", "src/server.ts", "GET /api/cache-test") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in routes_response.json()["relationships"]
    }
    assert ("imports", "src/server.ts", "express") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in imports_response.json()["relationships"]
    }
    assert ("src/server.ts", "./helper", "src/helper.ts") in {
        (item["source_path"], item["target"], item["metadata"].get("target_path"))
        for item in imports_response.json()["relationships"]
    }
    assert ("exports", "src/server.ts", "handler") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in exports_response.json()["relationships"]
    }
    assert ("mentions", "README.md", "handler") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in mentions_response.json()["relationships"]
    }
    assert ("calls", "src/server.ts", "cacheHelper") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in calls_response.json()["relationships"]
    }
    assert ("references", "src/server.ts", "CacheHelperClass") in {
        (item["rel_type"], item["source_path"], item["target"])
        for item in references_response.json()["relationships"]
    }
    assert before_sha == after_sha


def test_repo_overview_is_scoped_to_requested_repo(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    first = registry.create_repo("first", "upload", None)
    second = registry.create_repo("second", "upload", None)
    build_repo_index_from_files(first, {"src/main.py": "def alpha_entry():\n    return True\n"})
    build_repo_index_from_files(second, {"src/main.py": "def beta_entry():\n    return True\n"})
    registry.update_repo(first.id, status="lexical_ready")
    registry.update_repo(second.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{second.id}/overview")

    assert response.status_code == 200
    names = {symbol["name"] for symbol in response.json()["top_symbols"]}
    assert "beta_entry" in names
    assert "alpha_entry" not in names


def test_repo_overview_returns_conflict_before_lexical_index(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("queued", "upload", None)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get(f"/api/repos/{repo.id}/overview")

    assert response.status_code == 409
    assert response.json()["detail"] == "Repo is not indexed yet"


def test_semantic_warmup_writes_vectors_and_active_manager_loads_them(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(
        repo,
        code=(
            "def authenticate_user(username, password):\n"
            "    return username and password\n\n"
            "def connect_database(host):\n"
            "    return host\n"
        )
    )

    stats = warm_repo_semantics(
        repo_storage_path=repo.storage_path,
        embedder=FakeSemanticEmbedder(),
        batch_size=1,
    )

    assert stats.symbols_embedded == 2
    assert Path(stats.vector_dir, "vectors.index").exists()
    assert Path(stats.vector_dir, "metadata.npy").exists()

    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["status"] == "semantic_ready"
    assert manifest["lexical"]["ready"] is True
    assert manifest["lexical"]["symbols"] == 2
    assert manifest["semantic"]["ready"] is True
    assert manifest["semantic"]["vectors"] == 2
    assert set(manifest["semantic"]["artifacts"]) == {
        "vector_index/vectors.index",
        "vector_index/metadata.npy",
    }
    assert_artifact_checksum(manifest, "repo.sqlite")
    assert_artifact_checksum(manifest, "vector_index/vectors.index")
    assert_artifact_checksum(manifest, "vector_index/metadata.npy")

    store = VectorStore(dimension=768)
    store.load(stats.vector_dir)
    assert store.vector_count == 2
    assert {item["embedding_id"] for item in store.metadata} == {0, 1}

    manager = ActiveRepoManager(
        registry=registry,
        storage_dir=str(tmp_path),
        max_active_repos=1,
        embedder=FakeSemanticEmbedder(),
    )
    results = manager.search(repo, query="relational storage", limit=1, min_similarity=0.1)

    assert results[0].symbol_name == "connect_database"
    assert manager.get_handle(repo.id).semantic_loaded is True


def test_manifest_checksum_mismatch_skips_loadable_semantic_vectors(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(
        repo,
        code=(
            "def authenticate_user(username, password):\n"
            "    return username and password\n\n"
            "def connect_database(host):\n"
            "    return host\n"
        )
    )
    stats = warm_repo_semantics(
        repo_storage_path=repo.storage_path,
        embedder=FakeSemanticEmbedder(),
        batch_size=1,
    )
    registry.update_repo(repo.id, status="semantic_ready")

    metadata_path = Path(stats.vector_dir, "metadata.npy")
    metadata = np.load(str(metadata_path), allow_pickle=True).tolist()
    metadata[0]["symbol_name"] = "tampered_but_loadable"
    with open(metadata_path, "wb") as f:
        np.save(f, metadata, allow_pickle=True)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get("/api/repos")

    assert response.status_code == 200
    body = response.json()[0]
    assert body["artifact_health"] == "degraded"
    assert body["semantic_ready"] is False
    assert "vector_index/metadata.npy checksum changed" in body["artifact_warnings"]

    manager = ActiveRepoManager(
        registry=registry,
        storage_dir=str(tmp_path),
        max_active_repos=1,
        embedder=FakeSemanticEmbedder(),
    )
    results = manager.search(repo, query="connect database", limit=5, min_similarity=0.0)

    assert results
    assert manager.get_handle(repo.id).semantic_loaded is False


def test_semantic_warm_endpoint_queues_job(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")

    def fake_worker(repo_id: int, job_id: int):
        registry.mark_job_running(job_id, "semantic_warming")
        registry.mark_job_complete(job_id, "semantic_ready", files_indexed=0, symbols_indexed=1)
        registry.update_repo(repo_id, status="semantic_ready")

    monkeypatch.setattr(routes, "_run_repo_semantic_warmup", fake_worker)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(f"/api/repos/{repo.id}/semantic/warm")

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["kind"] == "semantic_warm"
    assert registry.get_job(body["job"]["id"]).status == "complete"
    assert registry.get_repo(repo.id).status == "semantic_ready"


def test_cancel_queued_semantic_warmup_restores_lexical_status(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    runner = WakeOnlyRunner()
    routes.set_job_runner(runner)
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    try:
        with TestClient(app) as client:
            queued = client.post(f"/api/repos/{repo.id}/semantic/warm")
            job_id = queued.json()["job"]["id"]
            canceled = client.post(f"/api/jobs/{job_id}/cancel")
            listed = client.get("/api/repos")
    finally:
        routes.set_job_runner(None)

    assert queued.status_code == 200
    assert canceled.status_code == 200
    assert canceled.json()["kind"] == "semantic_warm"
    assert canceled.json()["status"] == "canceled"
    repo_after_cancel = registry.get_repo(repo.id)
    assert repo_after_cancel.status == "lexical_ready"
    assert repo_after_cancel.error_summary == "Canceled by user"
    assert listed.json()[0]["lexical_ready"] is True


def test_cancel_running_semantic_warmup_keeps_lexical_repo(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")
    job = registry.create_job(repo.id, kind="semantic_warm")

    def canceling_warmup(repo_storage_path, embedder_cache_dir=None, cancel_check=None):
        registry.request_job_cancel(job.id)
        if cancel_check and cancel_check():
            raise routes.IndexingCanceled("Canceled by user")
        raise AssertionError("semantic warmup did not receive a working cancel check")

    monkeypatch.setattr(routes, "warm_repo_semantics", canceling_warmup)

    routes._run_repo_semantic_warmup(repo.id, job.id)

    canceled = registry.get_job(job.id)
    repo_after_cancel = registry.get_repo(repo.id)
    assert canceled.status == "canceled"
    assert canceled.cancel_requested is True
    assert repo_after_cancel.status == "lexical_ready"
    assert repo_after_cancel.error_summary == "Canceled by user"
    assert Path(repo.storage_path, "repo.sqlite").exists()
    assert not Path(repo.storage_path, "vector_index").exists()


def test_cancel_running_job_requests_cooperative_cancel(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    job = registry.create_job(repo.id, kind="fast_index")
    registry.mark_job_running(job.id, "fast_indexing")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(f"/api/jobs/{job.id}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "running"
    assert response.json()["cancel_requested"] is True
    saved_job = registry.get_job(job.id)
    assert saved_job.status == "running"
    assert saved_job.cancel_requested is True


def test_cancel_running_github_refresh_preserves_old_index_and_restores_source(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    monkeypatch.setattr(
        "app.utils.github_clone.clean_repository",
        lambda repo_path: {"files_removed": 0, "dirs_removed": 0, "bytes_freed": 0},
    )

    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    source_path = Path(repo.storage_path) / "source"
    source_path.mkdir(parents=True)
    (source_path / "old.py").write_text("def old_symbol():\n    return True\n", encoding="utf-8")
    initial_job = registry.create_job(repo.id, kind="fast_index")
    routes._run_prepared_fast_index(repo.id, initial_job.id, source_path)
    registry.update_repo(repo.id, status="lexical_ready")

    new_source = tmp_path / "new_source"
    new_source.mkdir()
    (new_source / "new.py").write_text("def new_symbol():\n    return True\n", encoding="utf-8")

    def fake_clone(repo_url: str, target_dir: str | None = None):
        shutil.copytree(new_source, Path(target_dir))
        return str(target_dir)

    monkeypatch.setattr("app.utils.github_clone.clone_github_repo", fake_clone)

    refresh_job = registry.create_job(repo.id, kind="refresh")
    original_index_file = Indexer.index_file
    indexed_files = []

    def cancel_after_first_file(self, file_path, *args, **kwargs):
        result = original_index_file(self, file_path, *args, **kwargs)
        indexed_files.append(file_path)
        if len(indexed_files) == 1:
            registry.request_job_cancel(refresh_job.id)
        return result

    monkeypatch.setattr(Indexer, "index_file", cancel_after_first_file)

    routes._run_repo_refresh(repo.id, refresh_job.id)

    canceled_job = registry.get_job(refresh_job.id)
    assert canceled_job.status == "canceled"
    assert canceled_job.cancel_requested is True
    assert registry.get_repo(repo.id).status == "lexical_ready"
    assert (source_path / "old.py").exists()
    assert not (source_path / "new.py").exists()
    assert not Path(repo.storage_path, f"repo.sqlite.{refresh_job.id}.tmp").exists()

    conn = MetadataStore(db_path=str(Path(repo.storage_path) / "repo.sqlite"), read_only=True)
    try:
        names = {row["name"] for row in conn.conn.execute("SELECT name FROM symbols").fetchall()}
    finally:
        conn.close()
    assert names == {"old_symbol"}


def test_cancel_terminal_job_is_idempotent(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    job = registry.create_job(repo.id, kind="fast_index")
    registry.mark_job_complete(job.id, "lexical_ready", files_indexed=1, symbols_indexed=1)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(f"/api/jobs/{job.id}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "complete"


def test_semantic_warm_endpoint_reuses_existing_active_job(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="semantic_warming")
    job = registry.create_job(repo.id, kind="semantic_warm", phase="semantic_warming")
    registry.mark_job_running(job.id, "semantic_warming")

    def fail_if_called(repo_id: int, job_id: int):
        raise AssertionError("semantic warmup should not be queued twice")

    monkeypatch.setattr(routes, "_run_repo_semantic_warmup", fail_if_called)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.post(f"/api/repos/{repo.id}/semantic/warm")

    assert response.status_code == 200
    body = response.json()
    assert body["job"]["id"] == job.id
    assert body["job"]["status"] == "running"


def test_semantic_warmup_failure_keeps_lexical_search_available(tmp_path, monkeypatch):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")
    job = registry.create_job(repo.id, kind="semantic_warm")

    def failing_warmup(*args, **kwargs):
        raise RuntimeError("semantic model unavailable")

    monkeypatch.setattr(routes, "warm_repo_semantics", failing_warmup)

    routes._run_repo_semantic_warmup(repo.id, job.id)

    assert registry.get_job(job.id).status == "failed"
    assert registry.get_repo(repo.id).status == "semantic_failed"

    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=1)
    results = manager.search(repo, query="authenticate user", limit=5)

    assert results
    assert results[0].symbol_name == "authenticate_user"


def test_repo_list_includes_storage_bytes_after_indexing(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get("/api/repos")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["id"] == repo.id
    assert body[0]["storage_bytes"] > 0


def test_delete_repo_endpoint_removes_artifacts_jobs_and_active_handle(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)

    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="lexical_ready")
    job = registry.create_job(repo.id, kind="semantic_warm")
    registry.mark_job_complete(job.id, "semantic_ready", files_indexed=0, symbols_indexed=1)
    manager.activate(repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.delete(f"/api/repos/{repo.id}")

    assert response.status_code == 200
    assert response.json()["success"] is True
    assert not Path(repo.storage_path).exists()
    assert manager.get_handle(repo.id) is None
    assert registry.count_jobs() == 0
    with pytest.raises(KeyError):
        registry.get_repo(repo.id)


def test_delete_repo_refuses_unsafe_storage_path(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    outside = tmp_path / "outside"
    outside.mkdir()
    outside_file = outside / "keep.txt"
    outside_file.write_text("do not delete", encoding="utf-8")
    registry.update_repo(repo.id, storage_path=str(outside))

    with pytest.raises(ValueError):
        registry.delete_repo(repo.id)

    assert outside_file.exists()
    assert registry.get_repo(repo.id).id == repo.id


def test_corrupt_semantic_artifact_is_not_reported_ready(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="semantic_ready")
    vector_dir = Path(repo.storage_path) / "vector_index"
    vector_dir.mkdir(parents=True)
    (vector_dir / "vectors.index").write_bytes(b"not a faiss index")
    (vector_dir / "metadata.npy").write_bytes(b"not numpy metadata")

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        response = client.get("/api/repos")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["status"] == "semantic_ready"
    assert body[0]["semantic_ready"] is False


def test_semantic_repair_removes_artifacts_and_keeps_lexical_search_available(tmp_path):
    registry = RepoRegistry(
        db_path=str(tmp_path / "registry.sqlite"),
        repos_dir=str(tmp_path / "repos")
    )
    routes.set_repo_registry(registry, str(tmp_path))
    manager = ActiveRepoManager(registry=registry, storage_dir=str(tmp_path), max_active_repos=2)
    routes.set_active_repo_manager(manager)

    repo = registry.create_repo("sample", "github", "https://github.com/example/sample")
    build_repo_index(repo)
    registry.update_repo(repo.id, status="semantic_ready")
    vector_dir = Path(repo.storage_path) / "vector_index"
    vector_dir.mkdir(parents=True)
    (vector_dir / "vectors.index").write_bytes(b"not a faiss index")
    (vector_dir / "metadata.npy").write_bytes(b"not numpy metadata")
    manager.activate(repo)

    app = FastAPI()
    app.include_router(routes.router, prefix="/api")

    with TestClient(app) as client:
        repair = client.post(f"/api/repos/{repo.id}/semantic/repair")
        evicted_after_repair = manager.get_handle(repo.id)
        search = client.post(
            f"/api/repos/{repo.id}/search",
            json={"query": "authenticate user", "limit": 5},
        )

    assert repair.status_code == 200
    assert repair.json()["status"] == "lexical_ready"
    assert repair.json()["semantic_ready"] is False
    assert not vector_dir.exists()
    manifest = read_repo_manifest(repo.storage_path)
    assert manifest["status"] == "lexical_ready"
    assert manifest["lexical"]["ready"] is True
    assert manifest["semantic"]["ready"] is False
    assert manifest["semantic"]["artifacts"] == []
    assert "vector_index/vectors.index" not in manifest["artifacts"]
    assert "vector_index/metadata.npy" not in manifest["artifacts"]
    assert_artifact_checksum(manifest, "repo.sqlite")
    assert evicted_after_repair is None
    assert search.status_code == 200
    assert search.json()["results"][0]["symbol_name"] == "authenticate_user"
