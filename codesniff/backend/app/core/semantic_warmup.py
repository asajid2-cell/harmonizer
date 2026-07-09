"""Build per-repo semantic vector artifacts after lexical indexing."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Callable, Optional

import numpy as np
from loguru import logger

from .artifact_manifest import write_repo_manifest
from ..storage.metadata_store import MetadataStore
from ..storage.vector_store import VectorStore
from .indexer import IndexingCanceled

if TYPE_CHECKING:
    from .embedder import CodeEmbedder


@dataclass
class SemanticWarmupStats:
    """Result of a semantic warmup run."""

    symbols_embedded: int
    vector_dir: str


def warm_repo_semantics(
    repo_storage_path: str,
    embedder_cache_dir: Optional[str] = None,
    embedder: Optional[CodeEmbedder] = None,
    batch_size: int = 32,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> SemanticWarmupStats:
    """Generate and atomically save semantic vectors for one repo artifact."""
    def raise_if_canceled():
        if cancel_check and cancel_check():
            raise IndexingCanceled("Canceled by user")

    repo_path = Path(repo_storage_path)
    repo_db = repo_path / "repo.sqlite"
    if not repo_db.exists():
        raise FileNotFoundError(f"Repo metadata database not found: {repo_db}")

    metadata_store = MetadataStore(db_path=str(repo_db))
    try:
        raise_if_canceled()
        cursor = metadata_store.conn.cursor()
        rows = cursor.execute(
            """
            SELECT s.embedding_id, s.name, s.symbol_type, s.code, s.docstring,
                   s.start_line, s.end_line, f.path AS file_path
            FROM symbols s
            JOIN files f ON s.file_id = f.id
            WHERE s.embedding_id IS NOT NULL
            ORDER BY s.embedding_id
            """
        ).fetchall()

        if not rows:
            raise RuntimeError("Repo has no symbols or chunks to embed")

        if embedder is None:
            from .embedder import CodeEmbedder

            active_embedder = CodeEmbedder(cache_dir=embedder_cache_dir)
        else:
            active_embedder = embedder
        vector_store = VectorStore(dimension=768)

        for start in range(0, len(rows), batch_size):
            raise_if_canceled()
            batch_rows = rows[start:start + batch_size]
            codes = [
                f"{row['name']}\n{row['docstring'] or ''}\n{row['code']}"
                for row in batch_rows
            ]
            embeddings = active_embedder.batch_generate(codes, batch_size=min(batch_size, 16))
            if len(embeddings) != len(batch_rows):
                raise RuntimeError(
                    f"Embedding count mismatch: expected {len(batch_rows)}, got {len(embeddings)}"
                )

            embeddings_array = np.array(embeddings, dtype=np.float32)
            if embeddings_array.ndim != 2:
                raise RuntimeError(f"Invalid embedding shape: {embeddings_array.shape}")

            if embeddings_array.shape[1] != vector_store.dimension:
                raise RuntimeError(
                    f"Embedding dimension mismatch: expected {vector_store.dimension}, got {embeddings_array.shape[1]}"
                )

            vector_metadata = [
                {
                    "embedding_id": row["embedding_id"],
                    "file_path": row["file_path"],
                    "symbol_name": row["name"],
                    "symbol_type": row["symbol_type"],
                    "start_line": row["start_line"],
                    "end_line": row["end_line"],
                }
                for row in batch_rows
            ]
            vector_store.add(embeddings_array, vector_metadata)

        raise_if_canceled()
        vector_dir = repo_path / "vector_index"
        vector_store.save(str(vector_dir))
        write_repo_manifest(
            repo_storage_path=repo_path,
            status="semantic_ready",
            semantic_vectors=vector_store.vector_count,
        )
        logger.info(f"Semantic warmup wrote {vector_store.vector_count} vectors to {vector_dir}")
        return SemanticWarmupStats(
            symbols_embedded=vector_store.vector_count,
            vector_dir=str(vector_dir),
        )
    finally:
        metadata_store.close()
