"""RAG (Retrieval-Augmented Generation) for the agent graph.

Adds a RAGNode that searches context chunks via pgvector before the ReAct agent runs.
Also provides the chunking + embedding pipeline for content ingestion.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .database import Database
from .embeddings import EmbeddingsClient


@dataclass
class RagResult:
    """A single RAG retrieval result."""
    text: str
    filename: str
    similarity: float
    chunk_index: int


class RagPipeline:
    """Handles content chunking, embedding, storage, and retrieval."""

    def __init__(self, db: Database, embeddings: EmbeddingsClient):
        self.db = db
        self.embeddings = embeddings

    # ── Ingestion ──────────────────────────────────────────

    async def ingest_text(
        self,
        context_id: str,
        filename: str,
        text: str,
        content_type: str = "text/plain",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
    ) -> dict[str, Any]:
        """Ingest a text document: chunk, embed, store.

        Returns the created file record with chunk count.
        """
        # 1. Create file record
        file_record = await self.db.add_context_file({
            "context_id": context_id,
            "filename": filename,
            "content_type": content_type,
            "original_text": text,
        })

        # 2. Chunk the text
        chunks = self._chunk_text(text, chunk_size, chunk_overlap)

        # 3. Generate embeddings
        chunk_texts = [c["text"] for c in chunks]
        vectors = await self.embeddings.embed(chunk_texts)

        # 4. Store chunks with embeddings
        chunk_records = []
        for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
            chunk_records.append({
                "file_id": file_record["id"],
                "context_id": context_id,
                "chunk_index": i,
                "text": chunk["text"],
                "embedding": vector,
            })

        await self.db.add_chunks(chunk_records)

        return {**file_record, "chunk_count": len(chunks)}

    # ── Retrieval ──────────────────────────────────────────

    async def retrieve(
        self,
        query: str,
        context_ids: list[str],
        top_k: int = 5,
    ) -> list[RagResult]:
        """Search for relevant chunks across the given contexts."""
        if not context_ids:
            return []

        # Generate query embedding
        query_vector = await self.embeddings.embed_single(query)
        if not query_vector:
            return []

        # Search pgvector
        rows = await self.db.search_chunks(context_ids, query_vector, top_k)

        return [
            RagResult(
                text=r["text"],
                filename=r.get("filename", "unknown"),
                similarity=round(r.get("similarity", 0), 4),
                chunk_index=r.get("chunk_index", 0),
            )
            for r in rows
        ]

    # ── Chunking ────────────────────────────────────────────

    def _chunk_text(
        self, text: str, chunk_size: int = 1000, chunk_overlap: int = 200
    ) -> list[dict[str, Any]]:
        """Split text into overlapping chunks by paragraph, then by character."""
        chunks: list[dict[str, Any]] = []

        # Split by paragraphs first
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

        current = ""
        for para in paragraphs:
            if len(current) + len(para) <= chunk_size:
                current = (current + "\n\n" + para).strip()
            else:
                if current:
                    chunks.append({"text": current})
                # If a single paragraph is larger than chunk_size, split by characters
                if len(para) > chunk_size:
                    for i in range(0, len(para), chunk_size - chunk_overlap):
                        chunks.append({"text": para[i:i + chunk_size]})
                    current = ""
                else:
                    current = para

        if current:
            chunks.append({"text": current})

        return chunks
