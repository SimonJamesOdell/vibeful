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

            CREATE TABLE IF NOT EXISTS contexts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                agent_id TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS context_files (
                id TEXT PRIMARY KEY,
                context_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                content_type TEXT DEFAULT 'text/plain',
                content TEXT NOT NULL,
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
            CREATE INDEX IF NOT EXISTS idx_context_files_context ON context_files(context_id);

            -- Lucid tables (local dev mode — no pgvector, embedding stored as JSON)
            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                system_prompt TEXT DEFAULT '',
                model TEXT DEFAULT 'deepseek-chat',
                temperature REAL DEFAULT 0.7,
                config_json TEXT DEFAULT '{}',
                styling_json TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS glyphs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                symbol TEXT NOT NULL,
                description TEXT DEFAULT '',
                glyphset TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS concepts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                domain TEXT DEFAULT 'general',
                description TEXT DEFAULT '',
                glyphset TEXT DEFAULT '',
                embedding_json TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS global_memories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                domain TEXT DEFAULT 'general',
                description TEXT DEFAULT '',
                glyphset TEXT DEFAULT '',
                memory_type TEXT DEFAULT 'general',
                embedding_json TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS token_credits (
                id TEXT PRIMARY KEY,
                user_identity TEXT NOT NULL,
                agent_id TEXT,
                balance INTEGER DEFAULT 0,
                total_used INTEGER DEFAULT 0,
                total_purchased INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS token_transactions (
                id TEXT PRIMARY KEY,
                credit_id TEXT NOT NULL,
                user_identity TEXT NOT NULL,
                amount INTEGER NOT NULL,
                transaction_type TEXT DEFAULT 'usage',
                description TEXT DEFAULT '',
                session_id TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS agent_versions (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                author TEXT DEFAULT 'human',
                change_description TEXT DEFAULT '',
                config_snapshot TEXT DEFAULT '{}',
                yaml_snapshot TEXT DEFAULT '',
                tags TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS ab_tests (
                id TEXT PRIMARY KEY,
                agent_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'draft',
                primary_metric TEXT DEFAULT 'success_rate',
                min_sample_size INTEGER DEFAULT 100,
                variant_a_config TEXT DEFAULT '{}',
                variant_b_config TEXT DEFAULT '{}',
                winner TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS ab_test_results (
                id TEXT PRIMARY KEY,
                test_id TEXT NOT NULL,
                variant TEXT NOT NULL,
                success INTEGER DEFAULT 1,
                latency_ms INTEGER DEFAULT 0,
                tokens_used INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0.0,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_glyphs_name ON glyphs(name);
            CREATE INDEX IF NOT EXISTS idx_concepts_domain ON concepts(domain);
            CREATE INDEX IF NOT EXISTS idx_global_memories_type ON global_memories(memory_type);
            CREATE INDEX IF NOT EXISTS idx_token_credits_user ON token_credits(user_identity, agent_id);
            CREATE INDEX IF NOT EXISTS idx_agent_versions_agent ON agent_versions(agent_id);

            CREATE TABLE IF NOT EXISTS api_integrations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                provider TEXT DEFAULT 'custom',
                api_key TEXT DEFAULT '',
                base_url TEXT DEFAULT '',
                description TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)
        await conn.commit()

    async def close(self) -> None:
        if self._conn:
            await self._conn.close()
            self._conn = None

    # ── Contexts (knowledge base) ────────────────────────

    async def create_context(self, data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        cid = data.get("id") or str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO contexts (id, name, agent_id) VALUES (?, ?, ?)""",
            (cid, data["name"], data.get("agent_id")),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM contexts WHERE id = ?", (cid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    async def list_contexts(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute("SELECT * FROM contexts ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_context(self, context_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.execute("SELECT * FROM contexts WHERE id = ?", (context_id,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def delete_context(self, context_id: str) -> bool:
        conn = await self._get_conn()
        # Delete context files first
        await conn.execute("DELETE FROM context_files WHERE context_id = ?", (context_id,))
        await conn.execute("DELETE FROM embeddings WHERE context_id = ?", (context_id,))
        async with conn.execute("DELETE FROM contexts WHERE id = ?", (context_id,)) as cursor:
            await conn.commit()
            return cursor.rowcount > 0

    async def ingest_file(self, context_id: str, filename: str, content: str,
                          content_type: str = "text/plain") -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        fid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO context_files (id, context_id, filename, content_type, content)
               VALUES (?, ?, ?, ?, ?)""",
            (fid, context_id, filename, content_type, content),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM context_files WHERE id = ?", (fid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    async def list_context_files(self, context_id: str) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT * FROM context_files WHERE context_id = ? ORDER BY created_at DESC",
            (context_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ── Agents (local mode) ─────────────────────────────

    async def name_exists(self, name: str, exclude_id: str | None = None) -> bool:
        """Check if an agent with the given name already exists."""
        conn = await self._get_conn()
        if exclude_id:
            async with conn.execute(
                "SELECT 1 FROM agents WHERE name = ? AND id != ? LIMIT 1",
                (name, exclude_id),
            ) as cursor:
                return (await cursor.fetchone()) is not None
        async with conn.execute(
            "SELECT 1 FROM agents WHERE name = ? LIMIT 1", (name,),
        ) as cursor:
            return (await cursor.fetchone()) is not None

    async def create_agent(self, data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        aid = data.get("id") or str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO agents (id, name, description, system_prompt, model, temperature, config_json, styling_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (aid, data["name"], data.get("description", ""), data.get("system_prompt", ""),
             data.get("model", "deepseek-chat"), data.get("temperature", 0.7),
              data.get("config_yaml", ""), data.get("styling", "")),
        )
        await conn.commit()
        return await self.get_agent(aid) or {}

    async def list_agents(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute("SELECT * FROM agents ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def delete_agent(self, agent_id: str) -> bool:
        conn = await self._get_conn()
        await conn.execute("DELETE FROM agent_versions WHERE agent_id = ?", (agent_id,))
        await conn.execute("DELETE FROM ab_tests WHERE agent_id = ?", (agent_id,))
        async with conn.execute("DELETE FROM agents WHERE id = ?", (agent_id,)) as cursor:
            await conn.commit()
            return cursor.rowcount > 0

    async def update_agent(self, agent_id: str, data: dict[str, Any]) -> bool:
        conn = await self._get_conn()
        sets = ", ".join(f"{k} = ?" for k in data.keys())
        values = list(data.values()) + [agent_id]
        async with conn.execute(f"UPDATE agents SET {sets} WHERE id = ?", values) as cursor:
            await conn.commit()
            return cursor.rowcount > 0

    # ── Glyphs (local mode) ─────────────────────────────

    async def list_glyphs(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute("SELECT * FROM glyphs ORDER BY name") as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def add_glyph(self, data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        gid = data.get("id") or str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO glyphs (id, name, symbol, description, glyphset)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(name) DO UPDATE SET symbol=excluded.symbol, description=excluded.description""",
            (gid, data["name"], data["symbol"], data.get("description", ""), data.get("glyphset", "")),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM glyphs WHERE id = ?", (gid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    async def delete_glyph(self, name: str) -> bool:
        conn = await self._get_conn()
        async with conn.execute("DELETE FROM glyphs WHERE name = ?", (name,)) as cursor:
            await conn.commit()
            return cursor.rowcount > 0

    # ── Concepts (local mode) ────────────────────────────

    async def get_concepts_by_domain(self, domain: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        if domain:
            async with conn.execute(
                "SELECT * FROM concepts WHERE domain = ? ORDER BY created_at DESC LIMIT ?", (domain, limit)
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with conn.execute(
                "SELECT * FROM concepts ORDER BY created_at DESC LIMIT ?", (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ── Global Memories (local mode) ─────────────────────

    async def list_global_memories(self, memory_type: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        if memory_type:
            async with conn.execute(
                "SELECT * FROM global_memories WHERE memory_type = ? ORDER BY created_at DESC LIMIT ?",
                (memory_type, limit)
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with conn.execute(
                "SELECT * FROM global_memories ORDER BY created_at DESC LIMIT ?", (limit,)
            ) as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    # ── Agent Versions (local mode) ──────────────────────

    async def get_agent_versions(self, agent_id: str, limit: int = 50) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT * FROM agent_versions WHERE agent_id = ? ORDER BY version_number DESC LIMIT ?",
            (agent_id, limit)
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def save_agent_version(self, agent_id: str, config: dict, yaml_str: str = "",
                                  author: str = "human", change_description: str = "",
                                  tags: list[str] | None = None) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT COALESCE(MAX(version_number), 0) + 1 FROM agent_versions WHERE agent_id = ?",
            (agent_id,)
        ) as cursor:
            row = await cursor.fetchone()
        next_v = row[0] if row else 1
        vid = str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO agent_versions (id, agent_id, version_number, author, change_description, config_snapshot, yaml_snapshot, tags)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (vid, agent_id, next_v, author, change_description, json.dumps(config), yaml_str, json.dumps(tags or [])),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM agent_versions WHERE id = ?", (vid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    # ── A/B Tests (local mode) ───────────────────────────

    async def create_ab_test(self, data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        tid = data.get("id") or str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO ab_tests (id, agent_id, name, status, primary_metric, min_sample_size, variant_a_config, variant_b_config)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (tid, data["agent_id"], data["name"], data.get("status", "draft"),
             data.get("primary_metric", "success_rate"), data.get("min_sample_size", 100),
             json.dumps(data.get("variant_a_config", {})), json.dumps(data.get("variant_b_config", {}))),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM ab_tests WHERE id = ?", (tid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    async def get_ab_tests(self, agent_id: str | None = None) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        if agent_id:
            async with conn.execute(
                "SELECT * FROM ab_tests WHERE agent_id = ? ORDER BY created_at DESC", (agent_id,)
            ) as cursor:
                rows = await cursor.fetchall()
        else:
            async with conn.execute("SELECT * FROM ab_tests ORDER BY created_at DESC") as cursor:
                rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def update_ab_test_status(self, test_id: str, status: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        await conn.execute("UPDATE ab_tests SET status = ? WHERE id = ?", (status, test_id))
        await conn.commit()
        async with conn.execute("SELECT * FROM ab_tests WHERE id = ?", (test_id,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def get_ab_results(self, test_id: str) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT * FROM ab_test_results WHERE test_id = ? ORDER BY created_at DESC", (test_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def get_ab_aggregate(self, test_id: str) -> dict[str, Any]:
        conn = await self._get_conn()
        async with conn.execute(
            """SELECT variant, COUNT(*) as count, AVG(success) as success_rate,
                      AVG(latency_ms) as avg_latency, SUM(tokens_used) as total_tokens
               FROM ab_test_results WHERE test_id = ? GROUP BY variant""", (test_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        return {"variants": [dict(r) for r in rows]} if rows else {"variants": []}

    # ── Token Credits (local mode) ───────────────────────

    async def get_or_create_credit(self, user_identity: str, agent_id: str | None = None) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT * FROM token_credits WHERE user_identity = ? AND (agent_id = ? OR agent_id IS NULL) LIMIT 1",
            (user_identity, agent_id),
        ) as cursor:
            row = await cursor.fetchone()
        if row:
            return dict(row)
        cid = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO token_credits (id, user_identity, agent_id, balance) VALUES (?, ?, ?, 0)",
            (cid, user_identity, agent_id),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM token_credits WHERE id = ?", (cid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {"balance": 0}

    async def get_token_balance(self, user_identity: str, agent_id: str | None = None) -> int:
        credit = await self.get_or_create_credit(user_identity, agent_id)
        return credit.get("balance", 0)

    async def credit_tokens(self, user_identity: str, amount: int, transaction_type: str = "purchase",
                             description: str = "", agent_id: str | None = None) -> dict[str, Any]:
        import uuid
        credit = await self.get_or_create_credit(user_identity, agent_id)
        conn = await self._get_conn()
        await conn.execute(
            "UPDATE token_credits SET balance = balance + ?, total_purchased = total_purchased + ?, updated_at = datetime('now') WHERE id = ?",
            (amount, amount, credit["id"]),
        )
        tx_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO token_transactions (id, credit_id, user_identity, amount, transaction_type, description) VALUES (?, ?, ?, ?, ?, ?)",
            (tx_id, credit["id"], user_identity, amount, transaction_type, description),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM token_credits WHERE id = ?", (credit["id"],)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    async def debit_tokens(self, user_identity: str, amount: int, agent_id: str | None = None,
                            session_id: str | None = None) -> dict[str, Any] | None:
        import uuid
        credit = await self.get_or_create_credit(user_identity, agent_id)
        if credit.get("balance", 0) < amount:
            return None
        conn = await self._get_conn()
        await conn.execute(
            "UPDATE token_credits SET balance = balance - ?, total_used = total_used + ?, updated_at = datetime('now') WHERE id = ? AND balance >= ?",
            (amount, amount, credit["id"], amount),
        )
        tx_id = str(uuid.uuid4())
        desc = f"Debit for session {session_id}" if session_id else "Debit"
        await conn.execute(
            "INSERT INTO token_transactions (id, credit_id, user_identity, amount, transaction_type, description, session_id) VALUES (?, ?, ?, ?, 'usage', ?, ?)",
            (tx_id, credit["id"], user_identity, amount, desc, session_id),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM token_credits WHERE id = ?", (credit["id"],)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def list_token_transactions(self, user_identity: str, limit: int = 50) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute(
            "SELECT * FROM token_transactions WHERE user_identity = ? ORDER BY created_at DESC LIMIT ?",
            (user_identity, limit)
        ) as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

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

    # ── API Integrations ─────────────────────────────────

    async def list_integrations(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.execute("SELECT * FROM api_integrations ORDER BY created_at DESC") as cursor:
            rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    async def create_integration(self, data: dict[str, Any]) -> dict[str, Any]:
        import uuid
        conn = await self._get_conn()
        iid = data.get("id") or str(uuid.uuid4())
        await conn.execute(
            """INSERT INTO api_integrations (id, name, provider, api_key, base_url, description)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (iid, data["name"], data.get("provider", "custom"), data.get("api_key", ""),
             data.get("base_url", ""), data.get("description", "")),
        )
        await conn.commit()
        async with conn.execute("SELECT * FROM api_integrations WHERE id = ?", (iid,)) as cursor:
            row = await cursor.fetchone()
        return dict(row) if row else {}

    async def delete_integration(self, iid: str) -> bool:
        conn = await self._get_conn()
        async with conn.execute("DELETE FROM api_integrations WHERE id = ?", (iid,)) as cursor:
            await conn.commit()
            return cursor.rowcount > 0
