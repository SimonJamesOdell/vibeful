"""Embeddings client — TF-IDF vectorization (no external API or model download)."""

from __future__ import annotations

import re
from collections import Counter
from math import log, sqrt
from typing import Any


class EmbeddingsClient:
    """TF-IDF based embeddings for RAG. No API keys, no model downloads.

    Produces 256-dimensional sparse-like vectors using vocabulary hashing
    with TF-IDF weighting. Fast and works offline.
    """

    def __init__(self, dim: int = 256):
        self._dim = dim
        # Common English stop words
        self._stop_words = {
            "the", "a", "an", "is", "are", "was", "were", "be", "been",
            "being", "have", "has", "had", "do", "does", "did", "will",
            "would", "could", "should", "may", "might", "can", "shall",
            "to", "of", "in", "for", "on", "with", "at", "by", "from",
            "and", "or", "but", "not", "no", "so", "if", "as", "it",
            "its", "that", "this", "these", "those", "i", "you", "he",
            "she", "we", "they", "me", "him", "her", "us", "them",
            "my", "your", "his", "our", "their", "about", "all", "also",
            "just", "like", "than", "then", "now", "very", "only",
        }
        # Document frequency tracking for IDF
        self._df: Counter = Counter()
        self._doc_count: int = 0

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate TF-IDF weighted embeddings for a list of texts.

        Returns a list of embedding vectors, each with `dim` dimensions.
        """
        if not texts:
            return []

        # Tokenize all texts
        tokenized = [self._tokenize(t) for t in texts]

        # Update document frequencies (for IDF)
        for tokens in tokenized:
            unique = set(tokens)
            for token in unique:
                self._df[token] += 1
            self._doc_count += 1

        # Compute TF-IDF vectors
        vectors = []
        for tokens in tokenized:
            vec = self._tfidf_vector(tokens)
            vectors.append(vec)

        return vectors

    async def embed_single(self, text: str) -> list[float]:
        """Generate a single embedding vector."""
        results = await self.embed([text])
        return results[0] if results else []

    def _tokenize(self, text: str) -> list[str]:
        """Tokenize text into lowercase word tokens, removing stop words."""
        text = text.lower()
        # Extract words (alphanumeric sequences)
        words = re.findall(r'[a-z0-9]{2,}', text)
        # Remove stop words
        return [w for w in words if w not in self._stop_words]

    def _tfidf_vector(self, tokens: list[str]) -> list[float]:
        """Compute a TF-IDF weighted vector for a token list.

        Uses vocabulary hashing to map tokens to fixed-dimension indices.
        TF-IDF = term_frequency * log(total_docs / doc_frequency)
        """
        import hashlib

        vec = [0.0] * self._dim
        token_counts = Counter(tokens)

        for token, count in token_counts.items():
            # Hash token to dimension index
            h = int(hashlib.md5(token.encode()).hexdigest(), 16)
            idx = h % self._dim

            # TF component
            tf = count / max(len(tokens), 1)
            # IDF component
            df = self._df.get(token, 1)
            idf = log((self._doc_count + 1) / (df + 1)) + 1

            vec[idx] += tf * idf

        # L2 normalize
        norm = sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]

        return vec
