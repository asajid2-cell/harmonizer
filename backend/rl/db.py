"""SQLite helpers for RL jump-event storage."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "rl"
SNIPPET_DIR = DATA_DIR / "snippets"
DB_PATH = DATA_DIR / "rl.sqlite3"


def _ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNIPPET_DIR.mkdir(parents=True, exist_ok=True)


def _connect() -> sqlite3.Connection:
    _ensure_dirs()
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db_cursor() -> Iterator[sqlite3.Cursor]:
    conn = _connect()
    try:
        yield conn.cursor()
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS jump_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                track_id TEXT,
                track_title TEXT,
                mode TEXT,
                source_index INTEGER,
                target_index INTEGER,
                source_time REAL,
                target_time REAL,
                similarity REAL,
                span REAL,
                same_section INTEGER,
                settings TEXT,
                context TEXT,
                quality_score REAL,
                policy_mode TEXT,
                model_version TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                snippet_status TEXT DEFAULT 'pending',
                snippet_path TEXT,
                label TEXT,
                label_notes TEXT,
                labeled_at DATETIME
            )
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_jump_events_status
            ON jump_events (snippet_status, label)
            """
        )


def insert_jump_event(event: Dict[str, Any]) -> int:
    init_db()
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO jump_events (
                track_id,
                track_title,
                mode,
                source_index,
                target_index,
                source_time,
                target_time,
                similarity,
                span,
                same_section,
                settings,
                context,
                quality_score,
                policy_mode,
                model_version
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.get("track_id"),
                event.get("track_title"),
                event.get("mode"),
                event.get("source_index"),
                event.get("target_index"),
                event.get("source_time"),
                event.get("target_time"),
                event.get("similarity"),
                event.get("span"),
                1 if event.get("same_section") else 0,
                json.dumps(event.get("settings") or {}, ensure_ascii=False),
                json.dumps(event.get("context") or {}, ensure_ascii=False),
                event.get("quality_score"),
                event.get("policy_mode"),
                event.get("model_version"),
            ),
        )
        return cur.lastrowid


def fetch_pending_events(limit: int = 5) -> list[sqlite3.Row]:
    init_db()
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM jump_events
            WHERE snippet_status = 'pending'
            ORDER BY RANDOM()
            LIMIT ?
            """,
            (limit,),
        )
        return cur.fetchall()


def mark_snippet_generated(
    event_id: int, *, snippet_path: str, status: str = "rendered"
) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE jump_events
            SET snippet_status = ?, snippet_path = ?
            WHERE id = ?
            """,
            (status, snippet_path, event_id),
        )


def mark_snippet_failed(event_id: int, message: str) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE jump_events
            SET snippet_status = ?, snippet_path = ?
            WHERE id = ?
            """,
            ("failed", message[:255], event_id),
        )


def get_next_unlabeled_snippet() -> Optional[sqlite3.Row]:
    init_db()
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT * FROM jump_events
            WHERE snippet_status = 'rendered' AND label IS NULL
            ORDER BY RANDOM()
            LIMIT 1
            """
        )
        row = cur.fetchone()
        return row


def record_label(event_id: int, label: str, notes: Optional[str] = None) -> None:
    with db_cursor() as cur:
        cur.execute(
            """
            UPDATE jump_events
            SET label = ?, label_notes = ?, labeled_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (label, notes, event_id),
        )


def fetch_policy_rewards() -> Dict[str, Dict[str, int]]:
    init_db()
    rewards: Dict[str, Dict[str, int]] = {}
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT policy_mode, label, COUNT(*) as cnt
            FROM jump_events
            WHERE policy_mode IS NOT NULL AND label IS NOT NULL
            GROUP BY policy_mode, label
            """
        )
        for row in cur.fetchall():
            mode = row["policy_mode"]
            label = row["label"]
            rewards.setdefault(mode, {})[label] = row["cnt"]
    return rewards


def get_queue_counts() -> Dict[str, int]:
    init_db()
    counts: Dict[str, int] = {}
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT snippet_status, COUNT(*) as count
            FROM jump_events
            GROUP BY snippet_status
            """
        )
        for row in cur.fetchall():
            counts[f"status:{row['snippet_status']}"] = row["count"]
        cur.execute(
            """
            SELECT label, COUNT(*) as count
            FROM jump_events
            WHERE label IS NOT NULL
            GROUP BY label
            """
        )
        for row in cur.fetchall():
            counts[f"label:{row['label']}"] = row["count"]
        cur.execute(
            """
            SELECT COUNT(*) FROM jump_events
            WHERE snippet_status = 'rendered' AND label IS NULL
            """
        )
        pending = cur.fetchone()[0]
        counts["pending_labels"] = pending
    return counts


def get_label_summary() -> Dict[str, int]:
    init_db()
    summary: Dict[str, int] = {"total": 0}
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT label, COUNT(*) as cnt
            FROM jump_events
            WHERE label IS NOT NULL
            GROUP BY label
            """
        )
        for row in cur.fetchall():
            label = row["label"] or "unknown"
            summary[label] = row["cnt"]
            summary["total"] += row["cnt"]
    return summary


def get_policy_counts() -> Dict[str, int]:
    init_db()
    counts: Dict[str, int] = {}
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT policy_mode, COUNT(*) as cnt
            FROM jump_events
            WHERE policy_mode IS NOT NULL
            GROUP BY policy_mode
            """
        )
        for row in cur.fetchall():
            counts[row["policy_mode"]] = row["cnt"]
    return counts
