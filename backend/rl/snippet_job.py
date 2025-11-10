"""
Utility helpers for working with RL jump-event logs.

This isn't the final snippet generator, but it gives us a quick way to
inspect the JSONL log and prototype downstream tooling.  Once we add
audio rendering we can extend this module with actual snippet export
logic.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterator

from .storage import JUMP_EVENT_LOG


def iter_events(limit: int | None = None) -> Iterator[dict]:
    if not JUMP_EVENT_LOG.exists():
        return iter(())
    count = 0
    with JUMP_EVENT_LOG.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
                count += 1
                if limit and count >= limit:
                    break
            except json.JSONDecodeError:
                continue


def summarize(limit: int = 20) -> None:
    for idx, event in enumerate(iter_events(limit=limit), 1):
        mode = event.get("mode")
        src = event.get("source_index")
        target = event.get("target_index")
        similarity = event.get("similarity")
        print(f"{idx:03d}: {mode} {src}→{target} sim={similarity}")


def main() -> None:
    parser = argparse.ArgumentParser(description="RL jump-event helper")
    parser.add_argument(
        "--tail",
        type=int,
        default=10,
        help="print the most recent N events",
    )
    args = parser.parse_args()
    summarize(limit=args.tail)


if __name__ == "__main__":
    main()
