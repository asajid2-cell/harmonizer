"""Vector store for semantic code search using FAISS"""

import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import numpy as np
from loguru import logger

try:
    import faiss
except ImportError:
    faiss = None
    logger.warning("FAISS not installed. Vector search will be disabled.")


@dataclass
class VectorSearchResult:
    """Result from vector search"""
    vector_id: int
    similarity_score: float
    metadata: Dict[str, Any]


class VectorStore:
    """FAISS-based vector store for code embeddings"""

    def __init__(self, dimension: int = 768):
        """
        Initialize vector store

        Args:
            dimension: Embedding dimension (768 for CodeBERT)
        """
        self.dimension = dimension
        self.index = None
        self.metadata: List[Dict[str, Any]] = []
        self.vector_count = 0

        if faiss is not None:
            # Use IndexFlatIP for inner product (cosine similarity with normalized vectors)
            self.index = faiss.IndexFlatIP(dimension)
            logger.info(f"Initialized FAISS index with dimension {dimension}")
        else:
            logger.error("FAISS not available - vector operations will fail")

    def add(self, embeddings: np.ndarray, metadata: List[Dict[str, Any]]):
        """
        Add embeddings to the index

        Args:
            embeddings: numpy array of shape (n, dimension)
            metadata: list of metadata dicts for each embedding
        """
        if self.index is None:
            raise RuntimeError("FAISS index not initialized")

        if len(embeddings) != len(metadata):
            raise ValueError("Number of embeddings must match metadata length")

        # Normalize embeddings for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        normalized = embeddings / (norms + 1e-8)

        # Add to FAISS index
        self.index.add(normalized.astype(np.float32))

        # Store metadata
        self.metadata.extend(metadata)
        self.vector_count += len(embeddings)

        logger.debug(f"Added {len(embeddings)} vectors to index. Total: {self.vector_count}")

    def search(self, query_embedding: np.ndarray, k: int = 10) -> List[VectorSearchResult]:
        """
        Search for similar vectors

        Args:
            query_embedding: Query vector of shape (dimension,) or (1, dimension)
            k: Number of results to return

        Returns:
            List of VectorSearchResult objects
        """
        if self.index is None:
            raise RuntimeError("FAISS index not initialized")

        if self.vector_count == 0:
            return []

        # Reshape if needed
        if query_embedding.ndim == 1:
            query_embedding = query_embedding.reshape(1, -1)

        # Normalize query
        norm = np.linalg.norm(query_embedding)
        query_normalized = query_embedding / (norm + 1e-8)

        # Limit k to available vectors
        k = min(k, self.vector_count)

        # Search
        scores, indices = self.index.search(query_normalized.astype(np.float32), k)

        # Build results
        results = []
        for i, (score, idx) in enumerate(zip(scores[0], indices[0])):
            if idx >= 0 and idx < len(self.metadata):
                result = VectorSearchResult(
                    vector_id=int(idx),
                    similarity_score=float(score),
                    metadata=self.metadata[idx]
                )
                results.append(result)

        return results

    def get_stats(self) -> Dict[str, Any]:
        """Get vector store statistics"""
        return {
            'total_vectors': self.vector_count,
            'dimension': self.dimension,
            'index_type': 'IndexFlatIP' if self.index else None
        }

    def clear(self):
        """Clear all vectors from the index"""
        if faiss is not None:
            self.index = faiss.IndexFlatIP(self.dimension)
        self.metadata = []
        self.vector_count = 0
        logger.info("Vector store cleared")

    def save(self, save_dir: str):
        """
        Save index to disk

        Args:
            save_dir: Directory to save to
        """
        if self.index is None:
            raise RuntimeError("No index to save")

        save_path = Path(save_dir)
        save_path.mkdir(parents=True, exist_ok=True)

        # Save FAISS index
        index_path = save_path / "vectors.index"
        faiss.write_index(self.index, str(index_path))

        # Save metadata
        metadata_path = save_path / "metadata.npy"
        np.save(str(metadata_path), self.metadata, allow_pickle=True)

        logger.info(f"Saved vector store to {save_dir}")

    def load(self, load_dir: str):
        """
        Load index from disk

        Args:
            load_dir: Directory to load from
        """
        load_path = Path(load_dir)

        # Load FAISS index
        index_path = load_path / "vectors.index"
        if not index_path.exists():
            raise FileNotFoundError(f"Index file not found: {index_path}")

        self.index = faiss.read_index(str(index_path))

        # Load metadata
        metadata_path = load_path / "metadata.npy"
        if metadata_path.exists():
            self.metadata = np.load(str(metadata_path), allow_pickle=True).tolist()

        self.vector_count = self.index.ntotal
        self.dimension = self.index.d

        logger.info(f"Loaded vector store from {load_dir}: {self.vector_count} vectors")
