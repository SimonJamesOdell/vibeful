"""Storage backend abstraction — protocol for database backends.

Pluggable storage. Default: SQLite (zero-config dev). Production: PostgreSQL.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class StorageBackend(Protocol):
    """Protocol for storage backends.

    Implementations: PostgresBackend, SqliteBackend.
    """

    async def init_schema(self) -> None:
        """Create tables/schema. Idempotent."""
        ...

    async def close(self) -> None:
        """Close connections and clean up."""
        ...

    # ── Sessions ─────────────────────────────────────────

    async def create_session(self, data: dict[str, Any]) -> dict[str, Any]:
        """Create a new session. Returns the created row."""
        ...

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        """Get a session by ID."""
        ...

    async def add_message(
        self, session_id: str, role: str, content: str,
        token_usage: dict[str, Any] | None = None,
    ) -> None:
        """Append a message to a session."""
        ...

    # ── Events ───────────────────────────────────────────

    async def log_event(
        self, event_type: str, data: dict[str, Any],
        session_id: str | None = None,
    ) -> None:
        """Log a structured event."""
        ...

    # ── Vector Search ────────────────────────────────────

    async def store_embedding(
        self, context_id: str, chunk_id: str, text: str,
        embedding: list[float], metadata: dict[str, Any] | None = None,
    ) -> None:
        """Store a text chunk with its vector embedding."""
        ...

    async def search_similar(
        self, embedding: list[float], context_ids: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Find the top-k most similar chunks to the given embedding.

        Returns list of {chunk_id, text, similarity, metadata}.
        """
        ...
