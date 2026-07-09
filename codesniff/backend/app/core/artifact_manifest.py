"""Repo artifact manifest writer for cold CodeSniff indexes."""

import hashlib
import json
import os
import sqlite3
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


MANIFEST_VERSION = 1
MANIFEST_FILENAME = "manifest.json"


@dataclass
class ManifestValidation:
    """Result of checking a repo manifest against files on disk."""

    manifest_present: bool
    health: str
    lexical_ok: bool
    semantic_ok: bool
    warnings: List[str]
    manifest: Optional[Dict[str, Any]] = None


def write_repo_manifest(
    repo_storage_path: str | Path,
    status: str,
    source_path: Optional[str | Path] = None,
    files_seen: Optional[int] = None,
    files_indexed: Optional[int] = None,
    symbols_indexed: Optional[int] = None,
    semantic_vectors: Optional[int] = None,
    index_mode: Optional[str] = None,
    source_retention: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Write a checksum manifest for one repo's cold artifacts."""
    repo_path = Path(repo_storage_path)
    repo_path.mkdir(parents=True, exist_ok=True)

    db_path = repo_path / "repo.sqlite"
    db_stats = _sqlite_counts(db_path)
    artifacts = _collect_artifacts(repo_path)
    lexical_artifacts = [
        name
        for name in ("repo.sqlite",)
        if name in artifacts
    ]
    semantic_artifacts = [
        name
        for name in ("vector_index/vectors.index", "vector_index/metadata.npy")
        if name in artifacts
    ]

    semantic_count = semantic_vectors
    if semantic_count is None and semantic_artifacts:
        semantic_count = _vector_metadata_count(repo_path / "vector_index" / "metadata.npy")

    manifest = {
        "version": MANIFEST_VERSION,
        "generated_at": _now(),
        "status": status,
        "source": _source_snapshot(repo_path, source_path, files_seen, source_retention),
        "lexical": {
            "ready": "repo.sqlite" in artifacts and db_stats["total_symbols"] > 0,
            "index_mode": index_mode or _existing_index_mode(repo_path) or "deep",
            "files": files_indexed if files_indexed is not None else db_stats["total_files"],
            "symbols": symbols_indexed if symbols_indexed is not None else db_stats["total_symbols"],
            "db_files": db_stats["total_files"],
            "db_symbols": db_stats["total_symbols"],
            "artifacts": lexical_artifacts,
        },
        "semantic": {
            "ready": bool(semantic_artifacts) and (semantic_count or 0) > 0,
            "vectors": semantic_count or 0,
            "artifacts": semantic_artifacts,
        },
        "artifacts": artifacts,
    }

    _write_json_atomic(repo_path / MANIFEST_FILENAME, manifest)
    return manifest


def read_repo_manifest(repo_storage_path: str | Path) -> Dict[str, Any]:
    """Read a repo manifest."""
    manifest_path = Path(repo_storage_path) / MANIFEST_FILENAME
    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_repo_manifest(repo_storage_path: str | Path) -> ManifestValidation:
    """Check a repo manifest's durable artifact fingerprints."""
    repo_path = Path(repo_storage_path)
    manifest_path = repo_path / MANIFEST_FILENAME
    if not manifest_path.exists():
        return ManifestValidation(
            manifest_present=False,
            health="missing",
            lexical_ok=False,
            semantic_ok=False,
            warnings=["manifest.json is missing; readiness falls back to direct artifact probes"],
        )

    try:
        manifest = read_repo_manifest(repo_path)
    except (OSError, json.JSONDecodeError) as e:
        return ManifestValidation(
            manifest_present=True,
            health="degraded",
            lexical_ok=False,
            semantic_ok=False,
            warnings=[f"manifest.json is unreadable: {e}"],
        )

    warnings: List[str] = []
    if manifest.get("version") != MANIFEST_VERSION:
        warnings.append(f"manifest version is {manifest.get('version')}, expected {MANIFEST_VERSION}")

    lexical_names = [
        name for name in manifest.get("lexical", {}).get("artifacts", [])
        if name == "repo.sqlite"
    ]
    semantic_names = [
        name for name in manifest.get("semantic", {}).get("artifacts", [])
        if name in {"vector_index/vectors.index", "vector_index/metadata.npy"}
    ]

    lexical_ok = bool(manifest.get("lexical", {}).get("ready")) and _fingerprints_ok(
        repo_path,
        manifest,
        lexical_names,
        warnings,
    )
    semantic_ready = bool(manifest.get("semantic", {}).get("ready"))
    semantic_ok = semantic_ready and _fingerprints_ok(
        repo_path,
        manifest,
        semantic_names,
        warnings,
    )

    health = "valid" if not warnings else "degraded"
    return ManifestValidation(
        manifest_present=True,
        health=health,
        lexical_ok=lexical_ok,
        semantic_ok=semantic_ok,
        warnings=warnings,
        manifest=manifest,
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _collect_artifacts(repo_path: Path) -> Dict[str, Dict[str, Any]]:
    artifacts: Dict[str, Dict[str, Any]] = {}
    for relative in (
        "repo.sqlite",
        "vector_index/vectors.index",
        "vector_index/metadata.npy",
    ):
        path = repo_path / Path(relative)
        if path.exists() and path.is_file():
            artifacts[relative] = _file_fingerprint(path, relative)
    return artifacts


def _fingerprints_ok(
    repo_path: Path,
    manifest: Dict[str, Any],
    artifact_names: List[str],
    warnings: List[str],
) -> bool:
    if not artifact_names:
        warnings.append("ready manifest section has no durable artifacts")
        return False

    all_ok = True
    artifacts = manifest.get("artifacts", {})
    for name in artifact_names:
        expected = artifacts.get(name)
        path = repo_path / Path(name)
        if not expected:
            warnings.append(f"{name} is missing from manifest artifacts")
            all_ok = False
            continue
        if not path.exists():
            warnings.append(f"{name} is missing from disk")
            all_ok = False
            continue

        current = _file_fingerprint(path, name)
        if current["bytes"] != expected.get("bytes"):
            warnings.append(f"{name} byte size changed")
            all_ok = False
        if current["sha256"] != expected.get("sha256"):
            warnings.append(f"{name} checksum changed")
            all_ok = False

    return all_ok


def _file_fingerprint(path: Path, relative_path: str) -> Dict[str, Any]:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)

    stat = path.stat()
    return {
        "path": relative_path,
        "bytes": stat.st_size,
        "sha256": digest.hexdigest(),
        "mtime": datetime.fromtimestamp(stat.st_mtime, timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
    }


def _sqlite_counts(db_path: Path) -> Dict[str, int]:
    if not db_path.exists():
        return {"total_files": 0, "total_symbols": 0}

    conn = None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        total_files = cursor.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        total_symbols = cursor.execute("SELECT COUNT(*) FROM symbols").fetchone()[0]
        return {"total_files": int(total_files), "total_symbols": int(total_symbols)}
    except sqlite3.Error:
        return {"total_files": 0, "total_symbols": 0}
    finally:
        if conn is not None:
            conn.close()


def _vector_metadata_count(metadata_path: Path) -> Optional[int]:
    if not metadata_path.exists():
        return None

    try:
        import numpy as np

        metadata = np.load(str(metadata_path), allow_pickle=True).tolist()
        return len(metadata)
    except Exception:
        return None


def _existing_index_mode(repo_path: Path) -> Optional[str]:
    manifest_path = repo_path / MANIFEST_FILENAME
    if not manifest_path.exists():
        return None
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    lexical = manifest.get("lexical") if isinstance(manifest, dict) else None
    index_mode = lexical.get("index_mode") if isinstance(lexical, dict) else None
    return index_mode if isinstance(index_mode, str) and index_mode else None


def _source_snapshot(
    repo_path: Path,
    source_path: Optional[str | Path],
    files_seen: Optional[int],
    source_retention: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    path = Path(source_path) if source_path is not None else repo_path / "source"
    return {
        "path": _relative_or_absolute(repo_path, path),
        "available": path.exists(),
        "files_seen": files_seen,
        "retention": source_retention or {"policy": "kept" if path.exists() else "unknown"},
    }


def _relative_or_absolute(repo_path: Path, path: Path) -> str:
    try:
        return path.resolve().relative_to(repo_path.resolve()).as_posix()
    except ValueError:
        return str(path)


def _write_json_atomic(path: Path, payload: Dict[str, Any]):
    tmp_path = path.with_name(f"{path.name}.{os.getpid()}.{time.time_ns()}.tmp")
    try:
        with open(tmp_path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    finally:
        try:
            if tmp_path.exists():
                tmp_path.unlink()
        except OSError:
            pass
