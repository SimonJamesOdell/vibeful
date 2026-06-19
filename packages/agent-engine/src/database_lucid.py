"""Database extensions for Lucid capabilities — global memories, concepts, glyphs, token credits.

This module extends the Database class with new tables and CRUD methods.
Called from Database.init_schema() and mixed into the Database class.
"""

from __future__ import annotations

import uuid as _uuid
from typing import Any


# ── Schema Extension ──────────────────────────────────────────

async def extend_schema_lucid(cur: Any) -> None:
    """Create Lucid-capability tables if they don't exist. Called from init_schema()."""

    # ── Concepts (named conceptual frameworks) ──────────────
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
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_concepts_embedding
            ON concepts USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 50)
    """)

    # ── Glyphs (symbolic visual representations) ────────────
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS glyphs (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL UNIQUE,
            symbol          TEXT NOT NULL,
            description     TEXT NOT NULL DEFAULT '',
            glyphset        TEXT DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_glyphs_name
            ON glyphs(name)
    """)

    # ── Token Credits (per-user budget tracking) ────────────
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS token_credits (
            id              TEXT PRIMARY KEY,
            user_identity   TEXT NOT NULL,
            agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
            balance         BIGINT NOT NULL DEFAULT 0,
            total_used      BIGINT NOT NULL DEFAULT 0,
            total_purchased BIGINT NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_token_credits_user
            ON token_credits(user_identity, agent_id)
    """)

    # ── Token Transactions (audit trail) ────────────────────
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS token_transactions (
            id              TEXT PRIMARY KEY,
            credit_id       TEXT NOT NULL REFERENCES token_credits(id) ON DELETE CASCADE,
            user_identity   TEXT NOT NULL,
            amount          BIGINT NOT NULL,
            transaction_type TEXT NOT NULL
                CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'bonus', 'adjustment')),
            description     TEXT DEFAULT '',
            session_id      TEXT,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_token_tx_user
            ON token_transactions(user_identity, created_at DESC)
    """)

    # ── Agent Versions (audit trail for agent config changes) ──
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS agent_versions (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
            version_number  INTEGER NOT NULL,
            author          TEXT NOT NULL DEFAULT 'human',
            change_description TEXT DEFAULT '',
            config_snapshot  JSONB NOT NULL DEFAULT '{}',
            yaml_snapshot    TEXT DEFAULT '',
            tags            TEXT[] DEFAULT '{}',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_agent_versions_agent
            ON agent_versions(agent_id, version_number DESC)
    """)

    # ── A/B Tests ───────────────────────────────────────────
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS ab_tests (
            id              TEXT PRIMARY KEY,
            agent_id        TEXT REFERENCES agents(id) ON DELETE CASCADE,
            name            TEXT NOT NULL,
            description     TEXT DEFAULT '',
            status          TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),
            primary_metric  TEXT NOT NULL DEFAULT 'successRate',
            min_sample_size INTEGER NOT NULL DEFAULT 30,
            confidence_level TEXT NOT NULL DEFAULT '0.95',
            variant_a_config JSONB NOT NULL DEFAULT '{}',
            variant_b_config JSONB NOT NULL DEFAULT '{}',
            winner          TEXT,
            started_at      TIMESTAMPTZ,
            completed_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_ab_tests_agent
            ON ab_tests(agent_id, status)
    """)

    # ── A/B Test Results ────────────────────────────────────
    await cur.execute("""
        CREATE TABLE IF NOT EXISTS ab_test_results (
            id              TEXT PRIMARY KEY,
            test_id         TEXT NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
            variant         TEXT NOT NULL CHECK (variant IN ('a', 'b')),
            execution_id    TEXT,
            session_id      TEXT,
            success         BOOLEAN NOT NULL DEFAULT true,
            latency_ms      INTEGER,
            tokens_used     INTEGER,
            cost_usd        TEXT DEFAULT '0',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_ab_results_test
            ON ab_test_results(test_id, variant)
    """)


# ── CRUD Mixin ────────────────────────────────────────────────

class DatabaseLucidMixin:
    """Mixin adding Lucid-capability CRUD methods to the Database class."""

    # ── Global Memories ────────────────────────────────────

    async def add_global_memory(self, memory: dict[str, Any]) -> dict[str, Any]:
        mid = memory.get("id") or str(_uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            emb = memory.get("embedding", [])
            emb_str = f"[{','.join(str(x) for x in emb)}]" if emb else None
            await cur.execute("""
                INSERT INTO global_memories (id, name, domain, description, glyphset, memory_type, embedding)
                VALUES (%s,%s,%s,%s,%s,%s,%s::vector) RETURNING *
            """, (
                mid, memory["name"], memory.get("domain", "general"),
                memory.get("description", ""), memory.get("glyphset", ""),
                memory.get("memory_type", "general"), emb_str,
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else {}

    async def get_global_memories_by_domain(self, domain: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if domain:
                await cur.execute(
                    "SELECT * FROM global_memories WHERE domain = %s ORDER BY created_at DESC LIMIT %s",
                    (domain, limit),
                )
            else:
                await cur.execute(
                    "SELECT * FROM global_memories ORDER BY created_at DESC LIMIT %s",
                    (limit,),
                )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def search_global_memories(self, embedding: list[float], limit: int = 5) -> list[dict[str, Any]]:
        if not embedding:
            return []
        conn = await self._get_conn()
        emb_str = f"[{','.join(str(x) for x in embedding)}]"
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT *, 1 - (embedding <=> %s::vector) AS similarity
                FROM global_memories ORDER BY embedding <=> %s::vector LIMIT %s
            """, (emb_str, emb_str, limit))
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def list_global_memories(self, memory_type: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """List global memories, optionally filtered by memory_type."""
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if memory_type:
                await cur.execute(
                    "SELECT * FROM global_memories WHERE memory_type = %s ORDER BY created_at DESC LIMIT %s",
                    (memory_type, limit),
                )
            else:
                await cur.execute(
                    "SELECT * FROM global_memories ORDER BY created_at DESC LIMIT %s",
                    (limit,),
                )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Concepts ───────────────────────────────────────────

    async def add_concept(self, concept: dict[str, Any]) -> dict[str, Any]:
        cid = concept.get("id") or str(_uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            emb = concept.get("embedding", [])
            emb_str = f"[{','.join(str(x) for x in emb)}]" if emb else None
            await cur.execute("""
                INSERT INTO concepts (id, name, domain, description, glyphset, embedding)
                VALUES (%s,%s,%s,%s,%s,%s::vector)
                ON CONFLICT (id) DO NOTHING RETURNING *
            """, (
                cid, concept["name"], concept.get("domain", "general"),
                concept.get("description", ""), concept.get("glyphset", ""), emb_str,
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else {}

    async def get_concepts_by_domain(self, domain: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if domain:
                await cur.execute(
                    "SELECT * FROM concepts WHERE domain = %s ORDER BY created_at DESC LIMIT %s",
                    (domain, limit),
                )
            else:
                await cur.execute(
                    "SELECT * FROM concepts ORDER BY created_at DESC LIMIT %s",
                    (limit,),
                )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def search_concepts(self, embedding: list[float], limit: int = 5) -> list[dict[str, Any]]:
        if not embedding:
            return []
        conn = await self._get_conn()
        emb_str = f"[{','.join(str(x) for x in embedding)}]"
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT *, 1 - (embedding <=> %s::vector) AS similarity
                FROM concepts ORDER BY embedding <=> %s::vector LIMIT %s
            """, (emb_str, emb_str, limit))
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Glyphs ─────────────────────────────────────────────

    async def add_glyph(self, glyph: dict[str, Any]) -> dict[str, Any]:
        gid = glyph.get("id") or str(_uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO glyphs (id, name, symbol, description, glyphset)
                VALUES (%s,%s,%s,%s,%s)
                ON CONFLICT (name) DO UPDATE SET symbol=EXCLUDED.symbol, description=EXCLUDED.description
                RETURNING *
            """, (
                gid, glyph["name"], glyph["symbol"],
                glyph.get("description", ""), glyph.get("glyphset", ""),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def get_glyph(self, name: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM glyphs WHERE name = %s", (name,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def list_glyphs(self) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM glyphs ORDER BY name")
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def delete_glyph(self, name: str) -> bool:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM glyphs WHERE name = %s", (name,))
            await conn.commit()
            return cur.rowcount > 0

    # ── Token Credits ──────────────────────────────────────

    async def get_or_create_credit(self, user_identity: str, agent_id: str | None = None) -> dict[str, Any]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM token_credits WHERE user_identity = %s AND (agent_id = %s OR agent_id IS NULL) LIMIT 1",
                (user_identity, agent_id),
            )
            row = await cur.fetchone()
            if row:
                return self._serialize_row(row)
            cid = str(_uuid.uuid4())
            await cur.execute("""
                INSERT INTO token_credits (id, user_identity, agent_id, balance)
                VALUES (%s,%s,%s,0) RETURNING *
            """, (cid, user_identity, agent_id))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row)

    async def debit_tokens(self, user_identity: str, amount: int, agent_id: str | None = None, session_id: str | None = None) -> dict[str, Any] | None:
        credit = await self.get_or_create_credit(user_identity, agent_id)
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                UPDATE token_credits SET balance = balance - %s, total_used = total_used + %s, updated_at = now()
                WHERE id = %s AND balance >= %s RETURNING *
            """, (amount, amount, credit["id"], amount))
            row = await cur.fetchone()
            if not row:
                await conn.commit()
                return None  # Insufficient balance
            tx_id = str(_uuid.uuid4())
            desc = f"Debit for session {session_id}" if session_id else "Debit"
            await cur.execute("""
                INSERT INTO token_transactions (id, credit_id, user_identity, amount, transaction_type, description, session_id)
                VALUES (%s,%s,%s,%s,'usage',%s,%s)
            """, (tx_id, credit["id"], user_identity, amount, desc, session_id))
            await conn.commit()
            return self._serialize_row(row)

    async def credit_tokens(self, user_identity: str, amount: int, transaction_type: str = "purchase", description: str = "", agent_id: str | None = None) -> dict[str, Any]:
        credit = await self.get_or_create_credit(user_identity, agent_id)
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                UPDATE token_credits SET balance = balance + %s, total_purchased = total_purchased + %s, updated_at = now()
                WHERE id = %s RETURNING *
            """, (amount, amount, credit["id"]))
            row = await cur.fetchone()
            tx_id = str(_uuid.uuid4())
            await cur.execute("""
                INSERT INTO token_transactions (id, credit_id, user_identity, amount, transaction_type, description)
                VALUES (%s,%s,%s,%s,%s,%s)
            """, (tx_id, credit["id"], user_identity, amount, transaction_type, description))
            await conn.commit()
            return self._serialize_row(row)

    async def get_token_balance(self, user_identity: str, agent_id: str | None = None) -> int:
        credit = await self.get_or_create_credit(user_identity, agent_id)
        return credit.get("balance", 0)

    async def list_token_transactions(self, user_identity: str, limit: int = 50) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM token_transactions WHERE user_identity = %s ORDER BY created_at DESC LIMIT %s",
                (user_identity, limit),
            )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    # ── Agent Versions ──────────────────────────────────

    async def save_agent_version(
        self, agent_id: str, config: dict[str, Any], yaml_str: str = "",
        author: str = "human", change_description: str = "", tags: list[str] | None = None,
    ) -> dict[str, Any]:
        import json as _json
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            # Get next version number
            await cur.execute(
                "SELECT COALESCE(MAX(version_number), 0) + 1 AS next_v FROM agent_versions WHERE agent_id = %s",
                (agent_id,),
            )
            row = await cur.fetchone()
            next_v = row["next_v"] if row else 1

            vid = str(_uuid.uuid4())
            await cur.execute("""
                INSERT INTO agent_versions (id, agent_id, version_number, author, change_description, config_snapshot, yaml_snapshot, tags)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                vid, agent_id, next_v, author, change_description,
                _json.dumps(config), yaml_str, tags or [],
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else {}

    async def get_agent_versions(self, agent_id: str, limit: int = 50) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM agent_versions WHERE agent_id = %s ORDER BY version_number DESC LIMIT %s",
                (agent_id, limit),
            )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def get_agent_version(self, version_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM agent_versions WHERE id = %s", (version_id,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def restore_agent_version(self, agent_id: str, version_id: str) -> dict[str, Any] | None:
        version = await self.get_agent_version(version_id)
        if not version:
            return None
        config = version.get("config_snapshot", {})
        if isinstance(config, str):
            import json as _json
            config = _json.loads(config)
        # Update the agent with the version's config
        return await self.update_agent(agent_id, config)

    # ── A/B Tests CRUD ─────────────────────────────────

    async def create_ab_test(self, test: dict[str, Any]) -> dict[str, Any]:
        import json as _json
        tid = test.get("id") or str(_uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO ab_tests (id, agent_id, name, description, status, primary_metric,
                    min_sample_size, confidence_level, variant_a_config, variant_b_config)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                tid, test["agent_id"], test["name"], test.get("description", ""),
                test.get("status", "draft"), test.get("primary_metric", "successRate"),
                test.get("min_sample_size", 30), test.get("confidence_level", "0.95"),
                _json.dumps(test.get("variant_a_config", {})),
                _json.dumps(test.get("variant_b_config", {})),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else {}

    async def get_ab_tests(self, agent_id: str | None = None) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            if agent_id:
                await cur.execute(
                    "SELECT * FROM ab_tests WHERE agent_id = %s ORDER BY created_at DESC",
                    (agent_id,),
                )
            else:
                await cur.execute("SELECT * FROM ab_tests ORDER BY created_at DESC")
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def get_ab_test(self, test_id: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM ab_tests WHERE id = %s", (test_id,))
            row = await cur.fetchone()
            return self._serialize_row(row) if row else None

    async def update_ab_test_status(self, test_id: str, status: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        extra = ""
        if status == "running":
            extra = ", started_at = now()"
        elif status in ("completed", "cancelled"):
            extra = ", completed_at = now()"
        async with conn.cursor() as cur:
            await cur.execute(
                f"UPDATE ab_tests SET status = %s, updated_at = now(){extra} WHERE id = %s RETURNING *",
                (status, test_id),
            )
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else None

    async def set_ab_test_winner(self, test_id: str, winner: str) -> dict[str, Any] | None:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "UPDATE ab_tests SET winner = %s, status = 'completed', completed_at = now(), updated_at = now() WHERE id = %s RETURNING *",
                (winner, test_id),
            )
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else None

    async def record_ab_result(self, result: dict[str, Any]) -> dict[str, Any]:
        rid = result.get("id") or str(_uuid.uuid4())
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO ab_test_results (id, test_id, variant, execution_id, session_id, success, latency_ms, tokens_used, cost_usd)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
            """, (
                rid, result["test_id"], result["variant"], result.get("execution_id"),
                result.get("session_id"), result.get("success", True),
                result.get("latency_ms"), result.get("tokens_used"),
                str(result.get("cost_usd", "0")),
            ))
            row = await cur.fetchone()
            await conn.commit()
            return self._serialize_row(row) if row else {}

    async def get_ab_results(self, test_id: str) -> list[dict[str, Any]]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT * FROM ab_test_results WHERE test_id = %s ORDER BY created_at DESC",
                (test_id,),
            )
            return [self._serialize_row(r) for r in await cur.fetchall()]

    async def get_ab_aggregate(self, test_id: str) -> dict[str, Any]:
        conn = await self._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    variant,
                    COUNT(*) as sample_size,
                    SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as success_rate,
                    AVG(latency_ms) as avg_latency_ms,
                    SUM(tokens_used) as total_tokens,
                    AVG(CAST(cost_usd AS numeric)) as avg_cost
                FROM ab_test_results
                WHERE test_id = %s
                GROUP BY variant
                ORDER BY variant
            """, (test_id,))
            return {
                "variants": [self._serialize_row(r) for r in await cur.fetchall()],
            }
