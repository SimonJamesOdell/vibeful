"""SQLite storage backend — zero-config local development.

Uses aiosqlite for async access. Vector similarity via in-process cosine
distance (suitable for <10k documents). For production scale, use PostgreSQL.
"""

from __future__ import annotations

import json
import math
import os
from typing import Any

import aiosqlite

from .protocol import StorageBackend

DB_PATH = os.getenv("VIBEFUL_SQLITE_PATH", "vibeful.db")


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors."""
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


class SqliteBackend:
    """SQLite storage for local development and testing."""

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._conn: aiosqlite.Connection | None = None

    async def _get_conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            self._conn = await aiosqlite.connect(self.db_path)
            self._conn.row_factory = aiosqlite.Row
            await self._conn.execute("PRAGMA journal_mode=WAL")
        return self._conn

    async def init_schema(self) -> None:
        conn = await self._get_conn()
        await conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                config_json TEXT DEFAULT '{}',
                context_ids TEXT DEFAULT '[]',
                messages_json TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                session_id TEXT,
                data_json TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS embeddings (
                chunk_id TEXT PRIMARY KEY,
                context_id TEXT NOT NULL,
                text TEXT NOT NULL,
                embedding_json TEXT NOT NULL,
                metadata_json TEXT DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
            CREATE INDEX IF NOT EXISTS idx_embeddings_context ON embeddings(context_id);
        """)
        await conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()
            self._conn = None

    # ── Sessions ─────────────────────────────────────────

    async def create_session(self, data: dict[str, Any]) -> dict[str, Any]:
        conn = await self._get_conn()
        await conn.execute(
            """INSERT INTO sessions (id, config_json, context_ids, messages_json)
               VALUES (?, ?, ?, ?)""",
            (
                data["session_id"],
                json.dumps(data.get("agent_config", {})),
                json.dumps(data.get("context_ids", [])),
                json.dumps(data.get("messages", [])),
            ),
        )
        await conn.commit()
        return await self.get_session(data["session_id"]) or {}

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ) as cursor:
            row = await cursor.fetchone()
        if row is None:
            return None
        return {
            "session_id": row["id"],
            "agent_config": json.loads(row["config_json"]),
            "context_ids": json.loads(row["context_ids"]),
            "messages": json.loads(row["messages_json"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    async def add_message(
        self, session_id: str, role: str, content: str,
        token_usage: dict[str, Any] | None = None,
    ) -> None:
        conn = await self._get_conn()
        session = await self.get_session(session_id)
        if session is None:
            return
        messages = session.get("messages", [])
        msg = {"role": role, "content": content}
        if token_usage:
            msg["token_usage"] = token_usage
        messages.append(msg)
        await conn.execute(
            "UPDATE sessions SET messages_json = ?, updated_at = datetime('now') WHERE id = ?",
            (json.dumps(messages), session_id),
        )
        await conn.commit()

    # ── Events ───────────────────────────────────────────

    async def log_event(
        self, event_type: str, data: dict[str, Any],
        session_id: str | None = None,
    ) -> None:
        conn = await self._get_conn()
        await conn.execute(
            "INSERT INTO events (event_type, session_id, data_json) VALUES (?, ?, ?)",
            (event_type, session_id, json.dumps(data)),
        )
        await conn.commit()

    # ── Vector Search ────────────────────────────────────

    async def store_embedding(
        self, context_id: str, chunk_id: str, text: str,
        embedding: list[float], metadata: dict[str, Any] | None = None,
    ) -> None:
        conn = await self._get_conn()
        await conn.execute(
            """INSERT OR REPLACE INTO embeddings
               (chunk_id, context_id, text, embedding_json, metadata_json)
               VALUES (?, ?, ?, ?, ?)""",
            (
                chunk_id, context_id, text,
                json.dumps(embedding),
                json.dumps(metadata or {}),
            ),
        )
        await conn.commit()

    async def search_similar(
        self, embedding: list[float], context_ids: list[str] | None = None,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        if context_ids:
            placeholders = ",".join("?" for _ in context_ids)
            query = f"SELECT * FROM embeddings WHERE context_id IN ({placeholders})"
            async with conn.execute(query, context_ids) as cursor:
                rows = await cursor.fetchall()
        else:
            async with conn.execute("SELECT * FROM embeddings") as cursor:
                rows = await cursor.fetchall()

        scored = []
        for row in rows:
            emb = json.loads(row["embedding_json"])
            sim = _cosine_similarity(embedding, emb)
            scored.append({
                "chunk_id": row["chunk_id"],
                "context_id": row["context_id"],
                "text": row["text"],
                "similarity": sim,
                "metadata": json.loads(row["metadata_json"]),
            })

        scored.sort(key=lambda x: x["similarity"], reverse=True)
        return scored[:top_k]
