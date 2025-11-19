"""Code embedder using CodeBERT for semantic vector generation"""

import torch
import numpy as np
from typing import List, Union, Optional
from transformers import AutoTokenizer, AutoModel
from loguru import logger
import hashlib
import pickle
from pathlib import Path


class CodeEmbedder:
    """Generate semantic embeddings for code using CodeBERT"""

    def __init__(self, model_name: str = "microsoft/codebert-base", cache_dir: Optional[str] = None):
        """
        Initialize CodeBERT embedder

        Args:
            model_name: HuggingFace model identifier
            cache_dir: Directory to cache embeddings
        """
        self.model_name = model_name
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        logger.info(f"Loading CodeBERT model: {model_name}")
        logger.info(f"Using device: {self.device}")

        # Load tokenizer and model
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name)
        self.model.to(self.device)
        self.model.eval()  # Set to evaluation mode

        # Setup caching
        self.cache_dir = Path(cache_dir) if cache_dir else None
        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.embedding_dim = self.model.config.hidden_size  # 768 for CodeBERT
        logger.info(f"CodeBERT loaded successfully. Embedding dimension: {self.embedding_dim}")

    def generate_embedding(self, code: str, use_cache: bool = True) -> np.ndarray:
        """
        Generate embedding vector for a code snippet

        Args:
            code: Source code string
            use_cache: Whether to use cached embeddings

        Returns:
            Numpy array of shape (embedding_dim,) - typically 768
        """
        # Check cache first
        if use_cache and self.cache_dir:
            cached = self._get_cached_embedding(code)
            if cached is not None:
                return cached

        try:
            # Tokenize code
            inputs = self.tokenizer(
                code,
                padding=True,
                truncation=True,
                max_length=512,  # CodeBERT max length
                return_tensors="pt"
            )

            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Generate embedding
            with torch.no_grad():
                outputs = self.model(**inputs)

                # Use CLS token embedding (first token)
                # Shape: (batch_size=1, hidden_size=768)
                embedding = outputs.last_hidden_state[:, 0, :].squeeze()

                # Convert to numpy
                embedding_np = embedding.cpu().numpy()

            # Cache the result
            if use_cache and self.cache_dir:
                self._cache_embedding(code, embedding_np)

            return embedding_np

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            # Return zero vector as fallback
            return np.zeros(self.embedding_dim, dtype=np.float32)

    def batch_generate(self, codes: List[str], batch_size: int = 8, use_cache: bool = True) -> List[np.ndarray]:
        """
        Generate embeddings for multiple code snippets efficiently

        Args:
            codes: List of source code strings
            batch_size: Number of codes to process at once
            use_cache: Whether to use cached embeddings

        Returns:
            List of numpy arrays, each of shape (embedding_dim,)
        """
        embeddings = []
        uncached_indices = []
        uncached_codes = []

        # Check cache for each code
        for i, code in enumerate(codes):
            if use_cache and self.cache_dir:
                cached = self._get_cached_embedding(code)
                if cached is not None:
                    embeddings.append(cached)
                    continue

            # Need to compute this one
            uncached_indices.append(i)
            uncached_codes.append(code)
            embeddings.append(None)  # Placeholder

        # Generate embeddings for uncached codes in batches
        if uncached_codes:
            logger.debug(f"Generating embeddings for {len(uncached_codes)} codes in batches of {batch_size}")

            for i in range(0, len(uncached_codes), batch_size):
                batch = uncached_codes[i:i + batch_size]
                batch_embeddings = self._process_batch(batch)

                # Store results
                for j, emb in enumerate(batch_embeddings):
                    idx = uncached_indices[i + j]
                    embeddings[idx] = emb

                    # Cache
                    if use_cache and self.cache_dir:
                        self._cache_embedding(uncached_codes[i + j], emb)

        return embeddings

    def _process_batch(self, codes: List[str]) -> List[np.ndarray]:
        """
        Process a batch of codes to generate embeddings

        Args:
            codes: List of code strings

        Returns:
            List of embedding arrays
        """
        try:
            # Tokenize all at once
            inputs = self.tokenizer(
                codes,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt"
            )

            # Move to device
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Generate embeddings
            with torch.no_grad():
                outputs = self.model(**inputs)

                # Extract CLS token embeddings for all items
                # Shape: (batch_size, hidden_size)
                embeddings = outputs.last_hidden_state[:, 0, :]

                # Convert to list of numpy arrays
                embeddings_np = [emb.cpu().numpy() for emb in embeddings]

            return embeddings_np

        except Exception as e:
            logger.error(f"Error processing batch: {e}")
            # Return zero vectors as fallback
            return [np.zeros(self.embedding_dim, dtype=np.float32) for _ in codes]

    def _get_cache_key(self, code: str) -> str:
        """
        Generate cache key for code snippet

        Args:
            code: Source code string

        Returns:
            MD5 hash of the code
        """
        return hashlib.md5(code.encode('utf-8')).hexdigest()

    def _get_cached_embedding(self, code: str) -> Optional[np.ndarray]:
        """
        Retrieve cached embedding if available

        Args:
            code: Source code string

        Returns:
            Cached embedding array or None
        """
        if not self.cache_dir:
            return None

        cache_key = self._get_cache_key(code)
        cache_file = self.cache_dir / f"{cache_key}.pkl"

        if cache_file.exists():
            try:
                with open(cache_file, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                logger.warning(f"Error loading cached embedding: {e}")
                return None

        return None

    def _cache_embedding(self, code: str, embedding: np.ndarray):
        """
        Cache an embedding to disk

        Args:
            code: Source code string
            embedding: Embedding array to cache
        """
        if not self.cache_dir:
            return

        cache_key = self._get_cache_key(code)
        cache_file = self.cache_dir / f"{cache_key}.pkl"

        try:
            with open(cache_file, 'wb') as f:
                pickle.dump(embedding, f)
        except Exception as e:
            logger.warning(f"Error caching embedding: {e}")

    def embed_query(self, query: str) -> np.ndarray:
        """
        Generate embedding for a natural language query

        Args:
            query: Natural language search query

        Returns:
            Embedding array
        """
        # Just use the query directly - CodeBERT handles natural language reasonably well
        # The keyword boosting in search.py will handle relevance ranking
        return self.generate_embedding(query, use_cache=False)

    def similarity(self, embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two embeddings

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Similarity score between 0 and 1
        """
        # Cosine similarity
        dot_product = np.dot(embedding1, embedding2)
        norm1 = np.linalg.norm(embedding1)
        norm2 = np.linalg.norm(embedding2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        similarity = dot_product / (norm1 * norm2)
        # Normalize to 0-1 range (cosine can be -1 to 1)
        return (similarity + 1) / 2


def main():
    """Test the embedder"""
    embedder = CodeEmbedder()

    # Test single embedding
    code1 = """
def authenticate_user(username: str, password: str) -> bool:
    '''Check if user credentials are valid'''
    return check_credentials(username, password)
"""

    code2 = """
def login(user: str, pwd: str) -> bool:
    '''Verify user login'''
    return verify_login(user, pwd)
"""

    query = "authentication function"

    print("Generating embeddings...")
    emb1 = embedder.generate_embedding(code1)
    emb2 = embedder.generate_embedding(code2)
    emb_query = embedder.embed_query(query)

    print(f"Embedding shape: {emb1.shape}")
    print(f"Query vs Code1 similarity: {embedder.similarity(emb_query, emb1):.3f}")
    print(f"Query vs Code2 similarity: {embedder.similarity(emb_query, emb2):.3f}")
    print(f"Code1 vs Code2 similarity: {embedder.similarity(emb1, emb2):.3f}")

    # Test batch generation
    codes = [code1, code2, query]
    batch_embs = embedder.batch_generate(codes)
    print(f"\nBatch generated {len(batch_embs)} embeddings")


if __name__ == "__main__":
    main()
