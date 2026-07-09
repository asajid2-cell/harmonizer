"""Persistent local job runner for repo indexing work."""

import threading
from typing import Callable, Dict, Optional

from loguru import logger

from ..storage.repo_registry import JobRecord, RepoRegistry


JobHandler = Callable[[JobRecord], None]
REPO_EXCLUSIVE_JOB_KINDS = {
    "fast_index",
    "upload_fast_index",
    "refresh",
    "deep_enrich",
    "semantic_warm",
    "artifact_repair",
}


class IndexJobRunner:
    """Poll queued persistent jobs and execute them in a bounded local worker."""

    def __init__(
        self,
        registry: RepoRegistry,
        handlers: Dict[str, JobHandler],
        poll_interval: float = 1.0,
        recover_on_start: bool = True,
    ):
        self.registry = registry
        self.handlers = handlers
        self.poll_interval = poll_interval
        self.recover_on_start = recover_on_start
        self._wake_event = threading.Event()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start the worker thread and requeue interrupted jobs if configured."""
        if self._thread and self._thread.is_alive():
            return

        if self.recover_on_start:
            recovered = self.recover_interrupted_jobs()
            if recovered:
                logger.warning(f"Requeued {recovered} interrupted CodeSniff jobs after startup")

        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name="codesniff-index-job-runner", daemon=True)
        self._thread.start()
        self.wake()

    def stop(self, timeout: float = 10.0):
        """Stop the worker thread."""
        self._stop_event.set()
        self.wake()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)

    def wake(self):
        """Wake the worker after a job is queued."""
        self._wake_event.set()

    def recover_interrupted_jobs(self) -> int:
        """Requeue jobs that were running when a previous process died."""
        return self.registry.requeue_interrupted_jobs()

    def run_once(self) -> bool:
        """Claim and run one queued job. Returns True when work was attempted."""
        queued_scheduled = self.registry.queue_due_refresh_jobs()
        if queued_scheduled:
            logger.info(f"Queued {len(queued_scheduled)} scheduled CodeSniff refresh job(s)")

        job = self.registry.claim_next_queued_job(
            self.handlers.keys(),
            exclusive_repo_job_kinds=REPO_EXCLUSIVE_JOB_KINDS,
        )
        if job is None:
            return False

        handler = self.handlers.get(job.kind)
        if handler is None:
            self.registry.mark_job_failed(job.id, phase=job.phase, error=f"No handler for job kind {job.kind}")
            logger.error(f"No handler registered for CodeSniff job kind {job.kind}")
            return True

        try:
            logger.info(f"Running CodeSniff job {job.id} ({job.kind})")
            handler(job)
        except Exception as e:
            logger.exception(f"CodeSniff job {job.id} ({job.kind}) crashed: {e}")
            self.registry.mark_job_failed(job.id, phase=job.phase, error=str(e))

        return True

    def _run_loop(self):
        while not self._stop_event.is_set():
            ran_work = False
            while not self._stop_event.is_set() and self.run_once():
                ran_work = True

            if ran_work:
                continue

            self._wake_event.wait(self.poll_interval)
            self._wake_event.clear()
