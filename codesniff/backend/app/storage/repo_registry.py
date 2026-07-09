"""Persistent registry for repos and indexing jobs."""

import shutil
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


def _now() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def _parse_time(value: Optional[str]) -> datetime:
    if not value:
        return datetime.utcnow()
    normalized = value[:-1] if value.endswith("Z") else value
    return datetime.fromisoformat(normalized)


def _after_minutes(minutes: int, now: Optional[str] = None) -> str:
    return (_parse_time(now) + timedelta(minutes=max(1, int(minutes)))).isoformat(timespec="seconds") + "Z"


@dataclass
class RepoRecord:
    id: int
    name: str
    source_type: str
    source_url: Optional[str]
    status: str
    active_revision: Optional[str]
    storage_path: str
    created_at: str
    updated_at: str
    last_opened_at: Optional[str]
    error_summary: Optional[str]
    refresh_interval_minutes: Optional[int] = None
    next_refresh_at: Optional[str] = None
    last_scheduled_refresh_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class JobRecord:
    id: int
    repo_id: int
    kind: str
    status: str
    phase: str
    files_seen: int
    files_indexed: int
    symbols_indexed: int
    started_at: Optional[str]
    finished_at: Optional[str]
    error: Optional[str]
    cancel_requested: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__.copy()


class RepoRegistry:
    """SQLite-backed registry for cold repo artifacts and indexing jobs."""

    WRITER_JOB_KINDS = {
        "fast_index",
        "upload_fast_index",
        "refresh",
        "deep_enrich",
        "semantic_warm",
        "artifact_repair",
    }

    def __init__(self, db_path: str, repos_dir: str):
        self.db_path = db_path
        self.repos_dir = Path(repos_dir)
        self.repos_dir.mkdir(parents=True, exist_ok=True)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode = WAL")
        self._init_db()

    def _init_db(self):
        cursor = self.conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS repos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_url TEXT,
                status TEXT NOT NULL,
                active_revision TEXT,
                storage_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_opened_at TEXT,
                error_summary TEXT,
                refresh_interval_minutes INTEGER,
                next_refresh_at TEXT,
                last_scheduled_refresh_at TEXT
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS index_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                repo_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                phase TEXT NOT NULL,
                files_seen INTEGER NOT NULL DEFAULT 0,
                files_indexed INTEGER NOT NULL DEFAULT 0,
                symbols_indexed INTEGER NOT NULL DEFAULT 0,
                started_at TEXT,
                finished_at TEXT,
                error TEXT,
                cancel_requested INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(repo_id) REFERENCES repos(id)
            )
            """
        )
        job_columns = {
            row["name"]
            for row in cursor.execute("PRAGMA table_info(index_jobs)").fetchall()
        }
        if "cancel_requested" not in job_columns:
            cursor.execute(
                "ALTER TABLE index_jobs ADD COLUMN cancel_requested INTEGER NOT NULL DEFAULT 0"
            )
        repo_columns = {
            row["name"]
            for row in cursor.execute("PRAGMA table_info(repos)").fetchall()
        }
        if "refresh_interval_minutes" not in repo_columns:
            cursor.execute("ALTER TABLE repos ADD COLUMN refresh_interval_minutes INTEGER")
        if "next_refresh_at" not in repo_columns:
            cursor.execute("ALTER TABLE repos ADD COLUMN next_refresh_at TEXT")
        if "last_scheduled_refresh_at" not in repo_columns:
            cursor.execute("ALTER TABLE repos ADD COLUMN last_scheduled_refresh_at TEXT")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_repos_status ON repos(status)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_repos_next_refresh ON repos(next_refresh_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_jobs_repo ON index_jobs(repo_id)")
        self.conn.commit()

    def _repo_from_row(self, row: sqlite3.Row) -> RepoRecord:
        return RepoRecord(**dict(row))

    def _job_from_row(self, row: sqlite3.Row) -> JobRecord:
        data = dict(row)
        data["cancel_requested"] = bool(data.get("cancel_requested", False))
        return JobRecord(**data)

    def create_repo(self, name: str, source_type: str, source_url: Optional[str]) -> RepoRecord:
        with self._lock:
            now = _now()
            cursor = self.conn.cursor()
            cursor.execute(
                """
                INSERT INTO repos (name, source_type, source_url, status, storage_path, created_at, updated_at)
                VALUES (?, ?, ?, 'queued', '', ?, ?)
                """,
                (name, source_type, source_url, now, now),
            )
            repo_id = cursor.lastrowid
            storage_path = str(self.repos_dir / str(repo_id))
            Path(storage_path).mkdir(parents=True, exist_ok=True)
            cursor.execute(
                "UPDATE repos SET storage_path = ? WHERE id = ?",
                (storage_path, repo_id),
            )
            self.conn.commit()
            return self.get_repo(repo_id)

    def list_repos(self) -> List[RepoRecord]:
        with self._lock:
            cursor = self.conn.cursor()
            rows = cursor.execute("SELECT * FROM repos ORDER BY updated_at DESC, id DESC").fetchall()
            return [self._repo_from_row(row) for row in rows]

    def _safe_repo_path(self, repo: RepoRecord) -> Path:
        root = self.repos_dir.resolve()
        repo_path = Path(repo.storage_path).resolve()
        if repo_path == root:
            raise ValueError("Refusing to operate on the repos root")
        if repo_path.parent != root:
            raise ValueError(f"Repo storage path is outside the managed repos directory: {repo.storage_path}")
        if repo_path.name != str(repo.id):
            raise ValueError(f"Repo storage path does not match repo id {repo.id}: {repo.storage_path}")
        return repo_path

    def storage_bytes(self, repo: RepoRecord) -> int:
        """Return artifact bytes for one managed repo without following symlinks."""
        try:
            repo_path = self._safe_repo_path(repo)
        except ValueError:
            return 0

        if not repo_path.exists():
            return 0

        total = 0
        for path in repo_path.rglob("*"):
            try:
                if path.is_symlink():
                    continue
                if path.is_file():
                    total += path.stat().st_size
            except OSError:
                continue
        return total

    def delete_repo(self, repo_id: int) -> RepoRecord:
        """Delete a repo row, its jobs, and its managed artifact directory."""
        with self._lock:
            repo = self.get_repo(repo_id)
            repo_path = self._safe_repo_path(repo)

            if repo_path.exists():
                shutil.rmtree(repo_path)

            self.conn.execute("DELETE FROM index_jobs WHERE repo_id = ?", (repo_id,))
            self.conn.execute("DELETE FROM repos WHERE id = ?", (repo_id,))
            self.conn.commit()
            return repo

    def repair_semantic_artifacts(self, repo_id: int) -> RepoRecord:
        """Remove optional semantic artifacts while keeping the lexical repo index."""
        with self._lock:
            repo = self.get_repo(repo_id)
            repo_path = self._safe_repo_path(repo)
            vector_dir = repo_path / "vector_index"
            if vector_dir.exists():
                shutil.rmtree(vector_dir)
            return self.update_repo(repo_id, status="lexical_ready", error_summary=None)

    def get_repo(self, repo_id: int) -> RepoRecord:
        with self._lock:
            cursor = self.conn.cursor()
            row = cursor.execute("SELECT * FROM repos WHERE id = ?", (repo_id,)).fetchone()
            if row is None:
                raise KeyError(f"Repo {repo_id} not found")
            return self._repo_from_row(row)

    def update_repo(self, repo_id: int, **fields: Any) -> RepoRecord:
        with self._lock:
            if not fields:
                return self.get_repo(repo_id)
            fields["updated_at"] = _now()
            assignments = ", ".join(f"{key} = ?" for key in fields)
            values = list(fields.values()) + [repo_id]
            self.conn.execute(f"UPDATE repos SET {assignments} WHERE id = ?", values)
            self.conn.commit()
            return self.get_repo(repo_id)

    def set_refresh_schedule(
        self,
        repo_id: int,
        interval_minutes: Optional[int],
        next_refresh_at: Optional[str] = None,
    ) -> RepoRecord:
        """Enable or disable periodic lexical refresh for one repo."""
        if interval_minutes is None or int(interval_minutes) <= 0:
            return self.update_repo(
                repo_id,
                refresh_interval_minutes=None,
                next_refresh_at=None,
                error_summary=None,
            )

        interval = max(1, int(interval_minutes))
        return self.update_repo(
            repo_id,
            refresh_interval_minutes=interval,
            next_refresh_at=next_refresh_at or _after_minutes(interval),
            error_summary=None,
        )

    def list_due_refresh_repos(self, now: Optional[str] = None, limit: int = 100) -> List[RepoRecord]:
        """Return repos whose periodic refresh time has arrived."""
        now = now or _now()
        with self._lock:
            rows = self.conn.execute(
                """
                SELECT *
                FROM repos
                WHERE refresh_interval_minutes IS NOT NULL
                  AND refresh_interval_minutes > 0
                  AND next_refresh_at IS NOT NULL
                  AND next_refresh_at <= ?
                ORDER BY next_refresh_at ASC, id ASC
                LIMIT ?
                """,
                (now, max(1, int(limit))),
            ).fetchall()
            return [self._repo_from_row(row) for row in rows]

    def queue_due_refresh_jobs(self, now: Optional[str] = None, limit: int = 25) -> List[JobRecord]:
        """Queue refresh jobs for due scheduled repos without duplicating active writers."""
        now = now or _now()
        queued_jobs: List[JobRecord] = []
        with self._lock:
            for repo in self.list_due_refresh_repos(now=now, limit=limit):
                if len(queued_jobs) >= limit:
                    break
                if not self._repo_can_refresh(repo):
                    self._advance_skipped_schedule(repo, now, "Scheduled refresh skipped: no stored source")
                    continue
                active_writers = [
                    job for job in self.get_active_jobs(repo.id)
                    if job.kind in self.WRITER_JOB_KINDS
                ]
                if active_writers:
                    continue

                job = self.create_job(repo.id, kind="refresh", phase="queued_scheduled_refresh")
                interval = int(repo.refresh_interval_minutes or 0)
                self.update_repo(
                    repo.id,
                    status="refresh_queued",
                    error_summary=None,
                    last_scheduled_refresh_at=now,
                    next_refresh_at=_after_minutes(interval, now),
                )
                queued_jobs.append(job)
        return queued_jobs

    def _repo_can_refresh(self, repo: RepoRecord) -> bool:
        if repo.source_type == "github" and repo.source_url:
            return True
        return (Path(repo.storage_path) / "source").exists()

    def _advance_skipped_schedule(self, repo: RepoRecord, now: str, reason: str):
        interval = int(repo.refresh_interval_minutes or 0)
        if interval <= 0:
            return
        self.update_repo(
            repo.id,
            next_refresh_at=_after_minutes(interval, now),
            error_summary=reason,
        )

    def create_job(self, repo_id: int, kind: str, phase: str = "queued") -> JobRecord:
        with self._lock:
            cursor = self.conn.cursor()
            cursor.execute(
                """
                INSERT INTO index_jobs (repo_id, kind, status, phase)
                VALUES (?, ?, 'queued', ?)
                """,
                (repo_id, kind, phase),
            )
            self.conn.commit()
            return self.get_job(cursor.lastrowid)

    def get_job(self, job_id: int) -> JobRecord:
        with self._lock:
            cursor = self.conn.cursor()
            row = cursor.execute("SELECT * FROM index_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                raise KeyError(f"Job {job_id} not found")
            return self._job_from_row(row)

    def get_active_job(self, repo_id: int, kind: str) -> Optional[JobRecord]:
        with self._lock:
            cursor = self.conn.cursor()
            row = cursor.execute(
                """
                SELECT * FROM index_jobs
                WHERE repo_id = ? AND kind = ? AND status IN ('queued', 'running')
                ORDER BY id DESC
                LIMIT 1
                """,
                (repo_id, kind),
            ).fetchone()
            if row is None:
                return None
            return self._job_from_row(row)

    def get_active_jobs(self, repo_id: int) -> List[JobRecord]:
        with self._lock:
            cursor = self.conn.cursor()
            rows = cursor.execute(
                """
                SELECT * FROM index_jobs
                WHERE repo_id = ? AND status IN ('queued', 'running')
                ORDER BY id ASC
                """,
                (repo_id,),
            ).fetchall()
            return [self._job_from_row(row) for row in rows]

    def count_jobs(self, statuses: Optional[Iterable[str]] = None) -> int:
        with self._lock:
            cursor = self.conn.cursor()
            if not statuses:
                return cursor.execute("SELECT COUNT(*) FROM index_jobs").fetchone()[0]

            status_list = list(statuses)
            placeholders = ",".join("?" for _ in status_list)
            return cursor.execute(
                f"SELECT COUNT(*) FROM index_jobs WHERE status IN ({placeholders})",
                status_list,
            ).fetchone()[0]

    def requeue_interrupted_jobs(self) -> int:
        """Move jobs left running by a dead worker back to the queued state."""
        with self._lock:
            cursor = self.conn.cursor()
            running_jobs = cursor.execute(
                "SELECT id FROM index_jobs WHERE status = 'running'"
            ).fetchall()
            if not running_jobs:
                return 0

            cursor.execute(
                """
                UPDATE index_jobs
                SET status = 'queued',
                    phase = 'queued_after_restart',
                    started_at = NULL,
                    cancel_requested = 0
                WHERE status = 'running' AND cancel_requested = 0
                """
            )
            now = _now()
            canceled_jobs = cursor.execute(
                """
                SELECT j.*, r.storage_path
                FROM index_jobs j
                JOIN repos r ON r.id = j.repo_id
                WHERE j.status = 'running' AND j.cancel_requested = 1
                """
            ).fetchall()
            for row in canceled_jobs:
                cursor.execute(
                    """
                    UPDATE index_jobs
                    SET status = 'canceled',
                        phase = 'canceled',
                        finished_at = ?,
                        error = ?
                    WHERE id = ?
                    """,
                    (now, "Canceled by user", row["id"]),
                )
                repo_db = Path(row["storage_path"]) / "repo.sqlite"
                repo_status = "lexical_ready" if repo_db.exists() else "canceled"
                cursor.execute(
                    """
                    UPDATE repos
                    SET status = ?,
                        error_summary = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (repo_status, "Canceled by user", now, row["repo_id"]),
                )
            self.conn.commit()
            return len(running_jobs)

    def claim_next_queued_job(
        self,
        kinds: Iterable[str],
        exclusive_repo_job_kinds: Optional[Iterable[str]] = None
    ) -> Optional[JobRecord]:
        """Atomically claim the oldest queued job of the given kinds."""
        kind_list = list(kinds)
        if not kind_list:
            return None

        exclusive_kind_list = list(exclusive_repo_job_kinds or [])

        with self._lock:
            placeholders = ",".join("?" for _ in kind_list)
            cursor = self.conn.cursor()
            self.conn.execute("BEGIN IMMEDIATE")
            try:
                query_params: List[Any] = list(kind_list)
                writer_filter = ""
                if exclusive_kind_list:
                    exclusive_placeholders = ",".join("?" for _ in exclusive_kind_list)
                    writer_filter = f"""
                        AND NOT (
                            j.kind IN ({exclusive_placeholders})
                            AND EXISTS (
                                SELECT 1 FROM index_jobs active
                                WHERE active.repo_id = j.repo_id
                                  AND active.status = 'running'
                                  AND active.kind IN ({exclusive_placeholders})
                            )
                        )
                    """
                    query_params.extend(exclusive_kind_list)
                    query_params.extend(exclusive_kind_list)

                row = cursor.execute(
                    f"""
                    SELECT j.* FROM index_jobs j
                    WHERE j.status = 'queued' AND j.kind IN ({placeholders})
                    {writer_filter}
                    ORDER BY
                        CASE j.kind
                            WHEN 'fast_index' THEN 0
                            WHEN 'upload_fast_index' THEN 0
                            WHEN 'refresh' THEN 1
                            WHEN 'artifact_repair' THEN 1
                            WHEN 'semantic_warm' THEN 2
                            WHEN 'deep_enrich' THEN 3
                            ELSE 4
                        END,
                        j.id ASC
                    LIMIT 1
                    """,
                    query_params,
                ).fetchone()
                if row is None:
                    self.conn.commit()
                    return None

                now = _now()
                cursor.execute(
                    """
                    UPDATE index_jobs
                    SET status = 'running',
                        started_at = ?,
                        error = NULL
                    WHERE id = ? AND status = 'queued'
                    """,
                    (now, row["id"]),
                )
                self.conn.commit()
                if cursor.rowcount != 1:
                    return None
                return self.get_job(row["id"])
            except Exception:
                self.conn.rollback()
                raise

    def update_job(self, job_id: int, **fields: Any) -> JobRecord:
        with self._lock:
            if not fields:
                return self.get_job(job_id)
            assignments = ", ".join(f"{key} = ?" for key in fields)
            values = list(fields.values()) + [job_id]
            self.conn.execute(f"UPDATE index_jobs SET {assignments} WHERE id = ?", values)
            self.conn.commit()
            return self.get_job(job_id)

    def mark_job_running(self, job_id: int, phase: str) -> JobRecord:
        return self.update_job(
            job_id,
            status="running",
            phase=phase,
            started_at=_now(),
            error=None,
        )

    def mark_job_complete(
        self,
        job_id: int,
        phase: str,
        files_indexed: int,
        symbols_indexed: int
    ) -> JobRecord:
        return self.update_job(
            job_id,
            status="complete",
            phase=phase,
            files_indexed=files_indexed,
            symbols_indexed=symbols_indexed,
            finished_at=_now(),
            error=None,
            cancel_requested=0,
        )

    def mark_job_failed(self, job_id: int, phase: str, error: str) -> JobRecord:
        return self.update_job(
            job_id,
            status="failed",
            phase=phase,
            finished_at=_now(),
            error=error[:2000],
            cancel_requested=0,
        )

    def request_job_cancel(self, job_id: int, reason: str = "Cancel requested by user") -> JobRecord:
        with self._lock:
            job = self.get_job(job_id)
            if job.status != "running":
                return job
            return self.update_job(
                job_id,
                cancel_requested=1,
                error=reason[:2000],
            )

    def is_cancel_requested(self, job_id: int) -> bool:
        with self._lock:
            cursor = self.conn.cursor()
            row = cursor.execute(
                "SELECT cancel_requested FROM index_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Job {job_id} not found")
            return bool(row["cancel_requested"])

    def mark_job_canceled(self, job_id: int, phase: str = "canceled", reason: str = "Canceled by user") -> JobRecord:
        return self.update_job(
            job_id,
            status="canceled",
            phase=phase,
            finished_at=_now(),
            error=reason[:2000],
            cancel_requested=1,
        )

    def cancel_queued_job(self, job_id: int, reason: str = "Canceled by user") -> JobRecord:
        with self._lock:
            job = self.get_job(job_id)
            if job.status != "queued":
                return job
            return self.update_job(
                job_id,
                status="canceled",
                phase="canceled",
                finished_at=_now(),
                error=reason[:2000],
                cancel_requested=1,
            )
