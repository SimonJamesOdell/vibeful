"""Database schema manager — shared migrations for all services."""

from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.rows import dict_row
from .database_lucid import extend_schema_lucid, DatabaseLucidMixin

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://vibeful:vibeful_dev@localhost:5432/vibeful")


class Database(DatabaseLucidMixin):
    """Shared database connection and schema management."""

    def __init__(self, db_url: str = DATABASE_URL):
        self.db_url = db_url
        self._conn: psycopg.AsyncConnection | None = None

    async def _get_conn(self) -> psycopg.AsyncConnection:
        if self._conn is None or self._conn.closed:
            self._conn = await psycopg.AsyncConnection.connect(
                self.db_url, row_factory=dict_row
            )
        return self._conn

    # ── Schema Initialization ────────────────────────────────

    async def init_schema(self) -> None:
        """Create all tables if they don't exist (idempotent)."""
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("CREATE EXTENSION IF NOT EXISTS vector")

            # ── Agents ────────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS agents (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    description     TEXT DEFAULT '',
                    system_prompt   TEXT DEFAULT '',
                    model           TEXT NOT NULL DEFAULT 'deepseek-chat',
                    temperature     REAL NOT NULL DEFAULT 0.7,
                    max_tokens      INTEGER NOT NULL DEFAULT 4096,
                    personality     TEXT DEFAULT '',
                    tone            TEXT DEFAULT 'professional',
                    icebreaker      TEXT DEFAULT '',
                    policy          TEXT DEFAULT '',
                    output_format   TEXT DEFAULT 'markdown',
                    tools           JSONB DEFAULT '[]',
                    context_ids     TEXT[] DEFAULT '{}',
                    mcp_server_urls TEXT[] DEFAULT '{}',
                    feature_flags   JSONB DEFAULT '{}',
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

            # ── API Keys ──────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS api_keys (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL DEFAULT '',
                    key_hash        TEXT NOT NULL UNIQUE,
                    prefix          TEXT NOT NULL,
                    scopes          TEXT[] DEFAULT '{read,write}',
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    last_used_at    TIMESTAMPTZ,
                    revoked         BOOLEAN NOT NULL DEFAULT false
                )
            """)

            # ── Knowledge Contexts ────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS contexts (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    description     TEXT DEFAULT '',
                    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

            # ── Context Files ─────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS context_files (
                    id              TEXT PRIMARY KEY,
                    context_id      TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
                    filename        TEXT NOT NULL,
                    content_type    TEXT DEFAULT 'text/plain',
                    original_text   TEXT NOT NULL,
                    char_count      INTEGER NOT NULL DEFAULT 0,
                    status          TEXT NOT NULL DEFAULT 'uploaded'
                        CHECK (status IN ('uploaded', 'chunking', 'embedding', 'ready', 'error')),
                    error_message   TEXT,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

            # ── Context Chunks (with vector embeddings) ───
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS context_chunks (
                    id              SERIAL PRIMARY KEY,
                    file_id         TEXT NOT NULL REFERENCES context_files(id) ON DELETE CASCADE,
                    context_id      TEXT NOT NULL REFERENCES contexts(id) ON DELETE CASCADE,
                    chunk_index     INTEGER NOT NULL,
                    text            TEXT NOT NULL,
                    embedding       vector(256),
                    char_count      INTEGER NOT NULL DEFAULT 0,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_chunks_context
                    ON context_chunks(context_id)
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_chunks_embedding
                    ON context_chunks
                    USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 100)
            """)

            # ── MCP Servers ──────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS mcp_servers (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    url             TEXT NOT NULL,
                    transport       TEXT NOT NULL DEFAULT 'http'
                        CHECK (transport IN ('http', 'sse', 'stdio')),
                    auth_type       TEXT DEFAULT 'none'
                        CHECK (auth_type IN ('none', 'api_key', 'bearer')),
                    auth_header     TEXT,
                    enabled         BOOLEAN NOT NULL DEFAULT true,
                    agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

            # ── Workflows ────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    description     TEXT DEFAULT '',
                    agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
                    steps           JSONB NOT NULL DEFAULT '[]',
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

            # ── Facts (Agent Memory) ────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS facts (
                    id              TEXT PRIMARY KEY,
                    session_id      TEXT,
                    user_identity   TEXT,
                    fact_text       TEXT NOT NULL,
                    category        TEXT DEFAULT 'general',
                    confidence      REAL DEFAULT 0.5,
                    source_turn     INTEGER,
                    embedding       vector(256),
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_facts_user
                    ON facts(user_identity)
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_facts_embedding
                    ON facts USING ivfflat (embedding vector_cosine_ops)
                    WITH (lists = 50)
            """)

            # ── Threads ────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS threads (
                    id              TEXT PRIMARY KEY,
                    session_id      TEXT,
                    title           TEXT DEFAULT '',
                    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'generating', 'ready', 'delivered', 'expired')),
                    deep_link       TEXT,
                    metadata        JSONB DEFAULT '{}',
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    delivered_at    TIMESTAMPTZ
                )
            """)

            # ── Sessions ──────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id       TEXT PRIMARY KEY,
                    agent_id         TEXT REFERENCES agents(id) ON DELETE SET NULL,
                    context_ids      TEXT[] DEFAULT '{}',
                    mcp_server_urls  TEXT[] DEFAULT '{}',
                    agent_config     JSONB NOT NULL DEFAULT '{}',
                    user_identity    TEXT,
                    mode             TEXT NOT NULL DEFAULT 'anonymous'
                        CHECK (mode IN ('anonymous', 'authenticated')),
                    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
                    last_active_at   TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)

            # ── Messages ──────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id              SERIAL PRIMARY KEY,
                    session_id      TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
                    turn            INTEGER NOT NULL DEFAULT 0,
                    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
                    content         TEXT,
                    tool_calls      JSONB,
                    token_usage     JSONB,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_session
                    ON messages(session_id, turn)
            """)

            # ── Events ────────────────────────────────────
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id              SERIAL PRIMARY KEY,
                    session_id      TEXT,
                    event_name      TEXT NOT NULL,
                    event_data      JSONB NOT NULL DEFAULT '{}',
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_name_time
                    ON events(event_name, created_at DESC)
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_events_session
                    ON events(session_id)
            """)

            await conn.commit()
            # Global Memories (cross-user knowledge)
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS global_memories (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    domain          TEXT NOT NULL DEFAULT 'general',
                    description     TEXT NOT NULL,
                    glyphset        TEXT DEFAULT '',
                    memory_type     TEXT NOT NULL DEFAULT 'general'
                        CHECK (memory_type IN ('system_ontology', 'concept_synthesis', 'collective_truth', 'general')),
                    embedding       vector(256),
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_global_memories_domain
                    ON global_memories(domain)
            """)

            # -- Concepts (named conceptual frameworks) ------
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS concepts (
                    id              TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    domain          TEXT NOT NULL DEFAULT 'general',
                    description     TEXT NOT NULL,
                    glyphset        TEXT DEFAULT '',
                    embedding       vector(256),
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                )
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_concepts_name
                    ON concepts(name)
            """)
            # -- Lucid extensions (glyphs, token credits, etc.) --
            await extend_schema_lucid(cur)

            await conn.commit()

    # ── Agent CRUD ──────────────────────────────────────────

    async def name_exists(self, name: str, exclude_id: str | None = None) -> bool:
        """Check if an agent with the given name already exists."""
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if exclude_id:
                await cur.execute(
                    "SELECT 1 FROM agents WHERE name = %s AND id != %s LIMIT 1",
                    (name, exclude_id),
                )
            else:
                await cur.execute(
                    "SELECT 1 FROM agents WHERE name = %s LIMIT 1", (name,),
                )
            return (await cur.fetchone()) is not None

    async def create_agent(self, agent: dict[str, Any]) -> dict[str, Any]:
        import uuid
        agent_id = agent.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        import json as _json
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO agents (id, name, description, system_prompt, model,
                    temperature, max_tokens, personality, tone, icebreaker,
                    policy, output_format, tools, context_ids, mcp_server_urls, feature_flags)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                agent_id,
                agent["name"],
                agent.get("description", ""),
                agent.get("system_prompt", ""),
                agent.get("model", "deepseek-chat"),
                agent.get("temperature", 0.7),
                agent.get("max_tokens", 4096),
                agent.get("personality", ""),
                agent.get("tone", "professional"),
                agent.get("icebreaker", ""),
                agent.get("policy", ""),
                agent.get("output_format", "markdown"),
                _json.dumps(agent.get("tools", [])),
                agent.get("context_ids", []),
                agent.get("mcp_server_urls", []),
                _json.dumps(agent.get("feature_flags", {})),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM agents WHERE id = %s", (agent_id,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def list_agents(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM agents ORDER BY created_at DESC")
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def update_agent(self, agent_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        existing = await self.get_agent(agent_id)
        if not existing:
            return None
        merged = {**existing, **updates, "id": agent_id}
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                UPDATE agents SET
                    name=%s, description=%s, system_prompt=%s, model=%s,
                    temperature=%s, max_tokens=%s, personality=%s, tone=%s,
                    icebreaker=%s, policy=%s, output_format=%s, tools=%s,
                    context_ids=%s, mcp_server_urls=%s, feature_flags=%s,
                    updated_at=now()
                WHERE id=%s RETURNING *
            """, (
                merged["name"], merged.get("description", ""),
                merged.get("system_prompt", ""), merged.get("model", "deepseek-chat"),
                merged.get("temperature", 0.7), merged.get("max_tokens", 4096),
                merged.get("personality", ""), merged.get("tone", "professional"),
                merged.get("icebreaker", ""), merged.get("policy", ""),
                merged.get("output_format", "markdown"), merged.get("tools", []),
                merged.get("context_ids", []), merged.get("mcp_server_urls", []),
                merged.get("feature_flags", {}), agent_id,
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def delete_agent(self, agent_id: str) -> bool:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM agents WHERE id = %s", (agent_id,))
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted

    # ── Context CRUD ───────────────────────────────────────

    async def create_context(self, context: dict[str, Any]) -> dict[str, Any]:
        import uuid
        ctx_id = context.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO contexts (id, name, description, agent_id)
                VALUES (%s,%s,%s,%s) RETURNING *
            """, (ctx_id, context["name"], context.get("description", ""), context.get("agent_id")))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_context(self, ctx_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM contexts WHERE id = %s", (ctx_id,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def list_contexts(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM contexts ORDER BY created_at DESC")
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def delete_context(self, ctx_id: str) -> bool:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM contexts WHERE id = %s", (ctx_id,))
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted

    # ── File Upload ────────────────────────────────────────

    async def add_context_file(self, file_data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        file_id = file_data.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO context_files (id, context_id, filename, content_type, original_text, char_count)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                file_id, file_data["context_id"], file_data["filename"],
                file_data.get("content_type", "text/plain"),
                file_data["original_text"], len(file_data["original_text"]),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def add_chunks(self, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Insert chunks with embeddings. `chunks` must have: file_id, context_id, chunk_index, text, embedding."""
        conn = await self._get_conn()
        rows = []
        async with conn.cursor() as cur:
            for c in chunks:
                embedding_str = f"[{','.join(str(x) for x in c['embedding'])}]"
                await cur.execute("""
                    INSERT INTO context_chunks (file_id, context_id, chunk_index, text, embedding, char_count)
                    VALUES (%s,%s,%s,%s,%s::vector,%s) RETURNING *
                """, (
                    c["file_id"], c["context_id"], c["chunk_index"],
                    c["text"], embedding_str, len(c["text"]),
                ))
                rows.append(self._serialize_row(await cur.fetchone()))
            await conn.commit()
        return rows

    async def search_chunks(
        self, context_ids: list[str], embedding: list[float], top_k: int = 5
    ) -> list[dict[str, Any]]:
        """Semantic search across chunks in the given contexts."""
        if not context_ids or not embedding:
            return []
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            placeholders = ",".join(f"'{c}'" for c in context_ids)
            await cur.execute(f"""
                SELECT cc.*, cf.filename, 1 - (cc.embedding <=> %s::vector) AS similarity
                FROM context_chunks cc
                JOIN context_files cf ON cc.file_id = cf.id
                WHERE cc.context_id IN ({placeholders})
                ORDER BY cc.embedding <=> %s::vector
                LIMIT %s
            """, (embedding_str, embedding_str, top_k))
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Session ────────────────────────────────────────────

    async def create_session(self, session_data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        import json as _json
        sid = session_data.get("session_id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO sessions (session_id, agent_id, context_ids, mcp_server_urls, agent_config, user_identity, mode)
                VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                sid,
                session_data.get("agent_id"),
                session_data.get("context_ids", []),
                session_data.get("mcp_server_urls", []),
                _json.dumps(session_data.get("agent_config", {})),
                session_data.get("user_identity"),
                session_data.get("mode", "anonymous"),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM sessions WHERE session_id = %s", (session_id,))
            row = await cur.fetchone()
            if not row:
                return None
            # Load messages
            await cur.execute(
                "SELECT * FROM messages WHERE session_id = %s ORDER BY turn, id",
                (session_id,),
            )
            result = self._serialize_row(row)
            result["messages"] = [self._serialize_row(m) for m in await cur.fetchall()]
            return result

    # ── Messages ────────────────────────────────────────────

    async def add_message(
        self, session_id: str, role: str, content: str | None,
        turn: int = 0, tool_calls: list | None = None, token_usage: dict | None = None,
    ) -> dict[str, Any]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            import json as _json
            await cur.execute("""
                INSERT INTO messages (session_id, turn, role, content, tool_calls, token_usage)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                session_id, turn, role, content,
                _json.dumps(tool_calls) if tool_calls else None,
                _json.dumps(token_usage) if token_usage else None,
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    # ── Events ──────────────────────────────────────────────

    async def log_event(self, event_name: str, event_data: dict, session_id: str | None = None) -> None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            import json as _json
            await cur.execute(
                "INSERT INTO events (session_id, event_name, event_data) VALUES (%s,%s,%s)",
                (session_id, event_name, _json.dumps(event_data)),
            )
            await conn.commit()

    # ── MCP Server CRUD ───────────────────────────────────

    async def create_mcp_server(self, server: dict[str, Any]) -> dict[str, Any]:
        import uuid
        sid = server.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO mcp_servers (id, name, url, transport, auth_type, auth_header, agent_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                sid, server["name"], server["url"],
                server.get("transport", "http"),
                server.get("auth_type", "none"),
                server.get("auth_header"),
                server.get("agent_id"),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_mcp_server(self, sid: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM mcp_servers WHERE id = %s", (sid,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def list_mcp_servers(self, agent_id: str | None = None) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if agent_id:
                await cur.execute("SELECT * FROM mcp_servers WHERE agent_id = %s OR agent_id IS NULL", (agent_id,))
            else:
                await cur.execute("SELECT * FROM mcp_servers ORDER BY created_at DESC")
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Workflow CRUD ─────────────────────────────────────

    async def create_workflow(self, wf: dict[str, Any]) -> dict[str, Any]:
        import uuid
        wid = wf.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO workflows (id, name, description, agent_id, steps)
                VALUES (%s,%s,%s,%s,%s) RETURNING *
            """, (wid, wf["name"], wf.get("description", ""), wf.get("agent_id"), wf.get("steps", [])))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_workflow(self, wid: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM workflows WHERE id = %s", (wid,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def list_workflows(self, agent_id: str | None = None) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if agent_id:
                await cur.execute("SELECT * FROM workflows WHERE agent_id = %s", (agent_id,))
            else:
                await cur.execute("SELECT * FROM workflows ORDER BY created_at DESC")
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Facts (Agent Memory) ───────────────────────────

    async def add_fact(self, fact: dict[str, Any]) -> dict[str, Any]:
        import uuid
        fid = fact.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            emb = fact.get("embedding", [])
            emb_str = f"[{','.join(str(x) for x in emb)}]" if emb else None
            await cur.execute("""
                INSERT INTO facts (id, session_id, user_identity, fact_text, category, confidence, source_turn, embedding)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s::vector) RETURNING *
            """, (
                fid, fact.get("session_id"), fact.get("user_identity"),
                fact["fact_text"], fact.get("category", "general"),
                fact.get("confidence", 0.5), fact.get("source_turn"), emb_str,
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def recall_facts(
        self, user_identity: str, query_embedding: list[float] | None = None, limit: int = 5,
    ) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if query_embedding:
                emb_str = f"[{','.join(str(x) for x in query_embedding)}]"
                await cur.execute("""
                    SELECT *, 1 - (embedding <=> %s::vector) AS similarity
                    FROM facts WHERE user_identity = %s
                    ORDER BY embedding <=> %s::vector LIMIT %s
                """, (emb_str, user_identity, emb_str, limit))
            else:
                await cur.execute(
                    "SELECT * FROM facts WHERE user_identity = %s ORDER BY created_at DESC LIMIT %s",
                    (user_identity, limit),
                )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def delete_fact(self, fact_id: str, user_identity: str) -> bool:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "DELETE FROM facts WHERE id = %s AND user_identity = %s",
                (fact_id, user_identity),
            )
            deleted = cur.rowcount > 0
            await conn.commit()
            return deleted

    async def delete_all_facts(self, user_identity: str) -> int:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM facts WHERE user_identity = %s", (user_identity,))
            count = cur.rowcount
            await conn.commit()
            return count

    # ── Threads ──────────────────────────────────────────

    async def create_thread(self, thread: dict[str, Any]) -> dict[str, Any]:
        import uuid
        tid = thread.get("id") or str(uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO threads (id, session_id, title, status, deep_link, metadata)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                tid, thread.get("session_id"), thread.get("title", ""),
                thread.get("status", "pending"), thread.get("deep_link"),
                thread.get("metadata", {}),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_thread(self, tid: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM threads WHERE id = %s", (tid,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def update_thread(self, tid: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            sets = []
            params = []
            for k, v in updates.items():
                if k in ("title", "status", "deep_link", "metadata", "delivered_at"):
                    sets.append(f"{k} = %s")
                    params.append(v)
            if not sets:
                return await self.get_thread(tid)
            params.append(tid)
            await cur.execute(f"UPDATE threads SET {', '.join(sets)} WHERE id = %s RETURNING *", params)
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else None

    # ── Event Queries ────────────────────────────────────

    async def query_events(self, session_id: str | None = None, event_name: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            conditions = []
            params: list[Any] = []
            if session_id:
                conditions.append("session_id = %s")
                params.append(session_id)
            if event_name:
                conditions.append("event_name = %s")
                params.append(event_name)
            where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
            params.append(limit)
            await cur.execute(f"SELECT * FROM events {where} ORDER BY created_at DESC LIMIT %s", params)
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def query_cost(self, agent_id: str, days: int = 30) -> dict[str, Any]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    COUNT(*) as total_events,
                    COALESCE(SUM((event_data->>'total_tokens')::numeric), 0) as total_tokens,
                    COALESCE(SUM((event_data->>'cost_usd')::numeric), 0) as total_cost
                FROM events
                WHERE event_name = 'llm_call'
                  AND created_at >= now() - (%s || ' days')::interval
            """, (str(days),))
            return self._serialize_row(await cur.fetchone()) or {}

    async def query_event_counts(self, event_name: str, days: int = 7) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    DATE(created_at) as day,
                    COUNT(*) as count
                FROM events
                WHERE event_name = %s
                  AND created_at >= now() - (%s || ' days')::interval
                GROUP BY DATE(created_at)
                ORDER BY day DESC
            """, (event_name, str(days)))
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Cleanup ─────────────────────────────────────────────

    async def close(self) -> None:
        if self._conn and not self._conn.closed:
            await self._conn.close()

    # ── Helpers ─────────────────────────────────────────────

    @staticmethod
    def _serialize_row(row: dict[str, Any] | None) -> dict[str, Any]:
        if row is None:
            return {}
        result = dict(row)
        for k, v in result.items():
            if hasattr(v, 'isoformat'):
                result[k] = v.isoformat()
        return result
