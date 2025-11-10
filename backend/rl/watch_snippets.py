"""
Simple watcher that continuously renders snippets for new jump events.

Usage:
    python -m backend.rl.watch_snippets --interval 30 --batch 10
"""

from __future__ import annotations

import argparse
import time

from .generate_snippets import process_pending


def main() -> None:
    parser = argparse.ArgumentParser(description="Watch for RL jump events")
    parser.add_argument("--batch", type=int, default=10, help="events per cycle")
    parser.add_argument("--interval", type=int, default=30, help="sleep seconds")
    parser.add_argument("--pre", type=float, default=2.0)
    parser.add_argument("--post", type=float, default=3.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(
        f"[watcher] Starting snippet watcher batch={args.batch} interval={args.interval}s"
    )
    try:
        while True:
            processed = process_pending(
                limit=args.batch,
                pre=args.pre,
                post=args.post,
                dry_run=args.dry_run,
            )
            if processed == 0:
                print("[watcher] No pending events.")
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[watcher] Stopped.")


if __name__ == "__main__":
    main()
