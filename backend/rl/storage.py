"""
Lightweight storage helpers for RL scaffolding.

We start with append-only JSON Lines logs so we can get signal quickly
without committing to a full database schema.  As the preference model
pipeline matures we can swap this out for SQLite or Postgres without
touching the API layer.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from . import db

BASE_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "rl"
JUMP_EVENT_LOG = BASE_DATA_DIR / "jump_events.jsonl"


def _ensure_dirs() -> None:
    BASE_DATA_DIR.mkdir(parents=True, exist_ok=True)


def log_jump_event(event: Dict[str, Any]) -> None:
    """Persist a single jump event to both SQLite and JSONL backup."""
    event_id = db.insert_jump_event(event)

    _ensure_dirs()
    enriched = dict(event)
    enriched.setdefault(
        "timestamp",
        datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
    )
    enriched["db_id"] = event_id
    with JUMP_EVENT_LOG.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(enriched, ensure_ascii=False) + "\n")
