"""Cold artifact storage profile for one indexed CodeSniff repo."""

import sqlite3
import time
import zlib
from pathlib import Path
from typing import Any, Dict, List


MAX_SAMPLE_BLOBS = 25


def build_repo_storage_profile(repo_id: int, repo_storage_path: str | Path, sample_blobs: int = 5) -> Dict[str, Any]:
    """Return storage breakdown and source-blob compression/read metrics."""
    repo_path = Path(repo_storage_path)
    repo_db = repo_path / "repo.sqlite"
    if not repo_db.exists():
        raise FileNotFoundError(f"Repo is not indexed yet: {repo_db}")

    sample_blobs = max(0, min(int(sample_blobs), MAX_SAMPLE_BLOBS))
    artifact_bytes = _artifact_byte_breakdown(repo_path)
    blob_profile = _blob_profile(repo_db, source_dir=repo_path / "source", sample_blobs=sample_blobs)
    return {
        "repo_id": repo_id,
        "total_bytes": sum(artifact_bytes.values()),
        "artifact_bytes": artifact_bytes,
        **blob_profile,
    }


def _artifact_byte_breakdown(repo_path: Path) -> Dict[str, int]:
    repo_db_names = {
        "repo.sqlite",
        "repo.sqlite-wal",
        "repo.sqlite-shm",
        "manifest.json",
    }
    buckets = {
        "repo_sqlite": 0,
        "manifest": 0,
        "source": 0,
        "vector": 0,
        "logs": 0,
        "other": 0,
    }

    if not repo_path.exists():
        return buckets

    for path in repo_path.rglob("*"):
        try:
            if path.is_symlink() or not path.is_file():
                continue
            size = path.stat().st_size
        except OSError:
            continue

        rel = path.relative_to(repo_path)
        first = rel.parts[0] if rel.parts else path.name
        if path.name in {"repo.sqlite", "repo.sqlite-wal", "repo.sqlite-shm"}:
            buckets["repo_sqlite"] += size
        elif path.name == "manifest.json":
            buckets["manifest"] += size
        elif first == "source":
            buckets["source"] += size
        elif first in {"vector_index", "vectors.faiss", "vectors.meta.sqlite"}:
            buckets["vector"] += size
        elif first == "logs":
            buckets["logs"] += size
        elif path.name in repo_db_names:
            buckets["repo_sqlite"] += size
        else:
            buckets["other"] += size

    return buckets


def _blob_profile(repo_db: Path, source_dir: Path, sample_blobs: int) -> Dict[str, Any]:
    conn = sqlite3.connect(f"file:{repo_db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        file_count = _count_rows(conn, "files")
        blob_table = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'file_blobs'"
        ).fetchone()
        if blob_table is None:
            return _empty_blob_profile(file_count, "file_blobs table is missing")

        aggregate = conn.execute(
            """
            SELECT
                COUNT(*) AS blob_count,
                COALESCE(SUM(length(content)), 0) AS compressed_bytes,
                COALESCE(SUM(size_bytes), 0) AS uncompressed_bytes
            FROM file_blobs
            """
        ).fetchone()
        sample_rows = conn.execute(
            """
            SELECT f.path, b.compression, b.content, b.size_bytes
            FROM file_blobs b
            JOIN files f ON f.id = b.file_id
            ORDER BY b.size_bytes DESC, f.path
            LIMIT ?
            """,
            (sample_blobs,),
        ).fetchall() if sample_blobs else []
    finally:
        conn.close()

    blob_count = int(aggregate["blob_count"] or 0)
    compressed_bytes = int(aggregate["compressed_bytes"] or 0)
    uncompressed_bytes = int(aggregate["uncompressed_bytes"] or 0)
    ratio = (compressed_bytes / uncompressed_bytes) if uncompressed_bytes else 0.0
    coverage = (blob_count / file_count) if file_count else 0.0
    samples = [_sample_blob(row, source_dir) for row in sample_rows]
    sample_ms = [sample["decompress_ms"] for sample in samples]
    return {
        "file_count": file_count,
        "blob_count": blob_count,
        "blob_coverage": coverage,
        "blob_compressed_bytes": compressed_bytes,
        "blob_uncompressed_bytes": uncompressed_bytes,
        "blob_compression_ratio": ratio,
        "sampled_blob_count": len(samples),
        "sampled_decompress_ms_total": round(sum(sample_ms), 3),
        "sampled_decompress_ms_max": round(max(sample_ms), 3) if sample_ms else 0.0,
        "sampled_blobs": samples,
        "warnings": [],
    }


def _empty_blob_profile(file_count: int, warning: str) -> Dict[str, Any]:
    return {
        "file_count": file_count,
        "blob_count": 0,
        "blob_coverage": 0.0,
        "blob_compressed_bytes": 0,
        "blob_uncompressed_bytes": 0,
        "blob_compression_ratio": 0.0,
        "sampled_blob_count": 0,
        "sampled_decompress_ms_total": 0.0,
        "sampled_decompress_ms_max": 0.0,
        "sampled_blobs": [],
        "warnings": [warning],
    }


def _sample_blob(row: sqlite3.Row, source_dir: Path) -> Dict[str, Any]:
    raw = bytes(row["content"])
    start = time.perf_counter()
    if row["compression"] == "zlib":
        content = zlib.decompress(raw)
    elif row["compression"] == "none":
        content = raw
    else:
        raise ValueError(f"Unsupported source blob compression: {row['compression']}")
    elapsed_ms = (time.perf_counter() - start) * 1000
    size_bytes = int(row["size_bytes"] or len(content))
    return {
        "path": _normalize_indexed_path(row["path"], source_dir),
        "compression": row["compression"],
        "compressed_bytes": len(raw),
        "uncompressed_bytes": size_bytes,
        "compression_ratio": (len(raw) / size_bytes) if size_bytes else 0.0,
        "decompress_ms": round(elapsed_ms, 3),
    }


def _normalize_indexed_path(path: str, source_dir: Path) -> str:
    raw = str(path or "").replace("\\", "/")
    if not raw:
        return raw
    try:
        source_raw = str(source_dir).replace("\\", "/").rstrip("/")
        if raw.startswith(f"{source_raw}/"):
            return raw[len(source_raw) + 1:]
    except OSError:
        pass
    return raw.lstrip("/")


def _count_rows(conn: sqlite3.Connection, table: str) -> int:
    try:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        return 0
