"""Session management — create, resume, persist conversations."""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg.rows import dict_row

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://vibeful:vibeful_dev@localhost:5432/vibeful")


@dataclass
class Session:
    session_id: str
    created_at: datetime
    last_active_at: datetime
    agent_config: dict[str, Any] = field(default_factory=dict)
    messages: list[dict[str, Any]] = field(default_factory=list)


class SessionManager:
    """Manages agent conversation sessions in PostgreSQL."""

    def __init__(self, db_url: str = DATABASE_URL):
        self.db_url = db_url
        self._conn: psycopg.AsyncConnection | None = None

    async def _get_conn(self) -> psycopg.AsyncConnection:
        if self._conn is None or self._conn.closed:
            self._conn = await psycopg.AsyncConnection.connect(
                self.db_url, row_factory=dict_row
            )
        return self._conn

    # ── Schema ────────────────────────────────────────────────

    async def init_schema(self) -> None:
        """Create tables if they don't exist."""
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                CREATE EXTENSION IF NOT EXISTS vector;

                CREATE TABLE IF NOT EXISTS sessions (
                    session_id       TEXT PRIMARY KEY,
                    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
                    last_active_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                    agent_config     JSONB NOT NULL DEFAULT '{}'
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id              SERIAL PRIMARY KEY,
                    session_id      TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                    turn            INTEGER NOT NULL DEFAULT 0,
                    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
                    content         TEXT,
                    tool_calls      JSONB,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                );

                CREATE INDEX IF NOT EXISTS idx_messages_session
                    ON messages(session_id, turn);
            """)
            await conn.commit()

    # ── Session CRUD ──────────────────────────────────────────

    async def create_session(
        self,
        agent_config: dict[str, Any] | None = None,
    ) -> Session:
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        config = agent_config or {}

        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO sessions (session_id, agent_config) VALUES (%s, %s)",
                (session_id, json.dumps(config)),
            )
            await conn.commit()

        return Session(
            session_id=session_id,
            created_at=now,
            last_active_at=now,
            agent_config=config,
        )

    async def get_session(self, session_id: str) -> Session | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM sessions WHERE session_id = %s",
                (session_id,),
            )
            row = await cur.fetchone()
            if not row:
                return None

            # Load messages
            await cur.execute(
                "SELECT * FROM messages WHERE session_id = %s ORDER BY turn, id",
                (session_id,),
            )
            msg_rows = await cur.fetchall()

            return Session(
                session_id=row["session_id"],
                created_at=row["created_at"],
                last_active_at=row["last_active_at"],
                agent_config=row["agent_config"] or {},
                messages=[dict(m) for m in msg_rows],
            )

    async def touch_session(self, session_id: str) -> None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE sessions SET last_active_at = now() WHERE session_id = %s",
                (session_id,),
            )
            await conn.commit()

    # ── Messages ────────────────────────────────────────────────

    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str | None,
        turn: int = 0,
        tool_calls: list[dict[str, Any]] | None = None,
    ) -> None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                """INSERT INTO messages (session_id, turn, role, content, tool_calls)
                   VALUES (%s, %s, %s, %s, %s)""",
                (
                    session_id,
                    turn,
                    role,
                    content,
                    json.dumps(tool_calls) if tool_calls else None,
                ),
            )
            await conn.commit()

    # ── Cleanup ─────────────────────────────────────────────────

    async def close(self) -> None:
        if self._conn and not self._conn.closed:
            await self._conn.close()
