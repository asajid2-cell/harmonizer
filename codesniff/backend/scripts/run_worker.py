"""Run CodeSniff's persistent indexing worker outside the web process."""

from __future__ import annotations

import argparse
import os
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
from loguru import logger

from app.core.worker_runtime import initialize_job_runtime


def main() -> int:
    load_dotenv()
    args = _parse_args()
    runtime = initialize_job_runtime(
        storage_dir=args.storage_dir,
        max_active_repos=args.max_active_repos,
        poll_interval=args.poll_interval,
        recover_interrupted=not args.no_recover_interrupted,
        run_recovery_scan=not args.no_recovery_scan,
        start_runner=False,
    )

    if args.once:
        ran = runtime.runner.run_once()
        runtime.active_repo_manager.close_all()
        return 0 if ran else 2

    if args.drain:
        ran_any = False
        while runtime.runner.run_once():
            ran_any = True
        runtime.active_repo_manager.close_all()
        return 0 if ran_any else 2

    should_stop = {"value": False}

    def _stop(_signum, _frame):
        should_stop["value"] = True
        runtime.runner.stop(timeout=5.0)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    logger.info(
        "Starting CodeSniff worker: "
        f"storage={args.storage_dir}, poll={args.poll_interval}s"
    )
    runtime.runner.start()
    try:
        while not should_stop["value"]:
            time.sleep(1.0)
    finally:
        runtime.runner.stop(timeout=5.0)
        runtime.active_repo_manager.close_all()
    return 0


def _parse_args():
    parser = argparse.ArgumentParser(description="Run the CodeSniff indexing worker.")
    parser.add_argument(
        "--storage-dir",
        default=os.environ.get("CODESCOPE_STORAGE_DIR", "./storage"),
        help="CodeSniff storage directory containing registry.sqlite and repos/.",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=float(os.environ.get("CODESNIFF_JOB_POLL_INTERVAL", "1.0")),
        help="Seconds between queue polls when no work is available.",
    )
    parser.add_argument(
        "--max-active-repos",
        type=int,
        default=int(os.environ.get("CODESNIFF_MAX_ACTIVE_REPOS", "3")),
        help="Maximum active repo handles kept warm by the worker process.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run at most one queued job, then exit with 0 if work ran or 2 if idle.",
    )
    parser.add_argument(
        "--drain",
        action="store_true",
        help="Run queued jobs until the queue is empty, then exit with 0 if work ran or 2 if idle.",
    )
    parser.add_argument(
        "--no-recover-interrupted",
        action="store_true",
        help="Do not requeue jobs that were running when a previous process died.",
    )
    parser.add_argument(
        "--no-recovery-scan",
        action="store_true",
        help="Skip startup artifact repair/refresh scan.",
    )
    args = parser.parse_args()
    if args.once and args.drain:
        parser.error("--once and --drain are mutually exclusive")
    return args


if __name__ == "__main__":
    raise SystemExit(main())
