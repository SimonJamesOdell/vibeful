"""Analytics pipeline — intent/output persistence and cohort analysis.

Implements the demand-side of the Trust Engine:
- Intent persistence (user input text + embeddings)
- Output persistence (agent response text + embeddings)
- Hybrid search (semantic + lexical)
- Cohort theme detection (basic clustering)
- Knowledge gap detection
"""

from __future__ import annotations

import json as _json
from dataclasses import dataclass, field
from typing import Any

from .database import Database
from .embeddings import EmbeddingsClient


@dataclass
class ConversationTurn:
    """A single conversation turn for analytics."""
    session_id: str
    turn_index: int
    user_input: str
    agent_output: str
    intent_embedding: list[float] | None = None
    output_embedding: list[float] | None = None
    refusal: bool = False
    knowledge_gap: bool = False
    timestamp: str = ""


class AnalyticsPipeline:
    """Collects and analyzes conversation data for trust insights."""

    def __init__(self, db: Database, embeddings: EmbeddingsClient):
        self.db = db
        self.embeddings = embeddings

    async def record_turn(self, turn: ConversationTurn) -> None:
        """Persist a conversation turn with embeddings."""
        # Generate embeddings
        if turn.intent_embedding is None:
            vecs = await self.embeddings.embed([turn.user_input])
            turn.intent_embedding = vecs[0] if vecs else []
        if turn.output_embedding is None and turn.agent_output:
            vecs = await self.embeddings.embed([turn.agent_output])
            turn.output_embedding = vecs[0] if vecs else []

        await self.db.log_event("conversation_turn", {
            "session_id": turn.session_id,
            "turn_index": turn.turn_index,
            "user_input": turn.user_input,
            "agent_output": turn.agent_output,
            "intent_embedding": turn.intent_embedding,
            "output_embedding": turn.output_embedding,
            "refusal": turn.refusal,
            "knowledge_gap": turn.knowledge_gap,
            "timestamp": turn.timestamp,
        }, session_id=turn.session_id)

    async def search_intents(
        self, query: str, session_id: str | None = None, limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Hybrid search across user intents — semantic + lexical."""
        query_vec = await self.embeddings.embed_single(query)
        if not query_vec:
            return []

        # Lexical match via ILIKE
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            embedding_str = f"[{','.join(str(x) for x in query_vec)}]"
            await cur.execute("""
                SELECT event_data->>'user_input' as text,
                       event_data->>'session_id' as session_id,
                       event_data->>'timestamp' as timestamp,
                       1 - (($1::vector) <=> ($1::vector)) as similarity
                FROM events
                WHERE event_name = 'conversation_turn'
                  AND event_data->>'user_input' ILIKE $2
                ORDER BY similarity DESC
                LIMIT $3
            """, (embedding_str, f"%{query}%", limit))
            return [dict(r) for r in await cur.fetchall()]

    async def detect_knowledge_gaps(self, agent_id: str, days: int = 7) -> list[dict[str, Any]]:
        """Find user questions that the agent couldn't answer well.

        Looks for low-confidence responses, refusals, and short answers.
        """
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT event_data->>'user_input' as question,
                       event_data->>'agent_output' as answer,
                       event_data->>'session_id' as session_id,
                       event_data->>'timestamp' as timestamp
                FROM events
                WHERE event_name = 'conversation_turn'
                  AND (event_data->>'refusal' = 'true'
                       OR event_data->>'knowledge_gap' = 'true'
                       OR length(event_data->>'agent_output') < 50)
                  AND event_data->>'timestamp' >= now() - ($1 || ' days')::interval
                ORDER BY event_data->>'timestamp' DESC
                LIMIT 50
            """, (str(days),))
            return [dict(r) for r in await cur.fetchall()]

    async def get_cohort_themes(self, session_id: str | None = None, limit: int = 10) -> list[dict[str, Any]]:
        """Get the most common intent themes in recent conversations.

        Simple approach: group by common keywords.
        """
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            where = f"WHERE session_id = '{session_id}'" if session_id else ""
            await cur.execute(f"""
                SELECT event_data->>'user_input' as question,
                       COUNT(*) as frequency
                FROM events
                WHERE event_name = 'conversation_turn' {where}
                GROUP BY event_data->>'user_input'
                ORDER BY frequency DESC
                LIMIT {limit}
            """)
            return [dict(r) for r in await cur.fetchall()]

    async def get_usage_stats(self, agent_id: str | None = None, days: int = 7) -> dict[str, Any]:
        """Get aggregate usage statistics."""
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    COUNT(*) as total_turns,
                    COUNT(DISTINCT session_id) as unique_sessions,
                    SUM((event_data->>'total_tokens')::numeric) as total_tokens,
                    SUM((event_data->>'cost_usd')::numeric) as total_cost
                FROM events
                WHERE event_name = 'conversation_turn'
                  AND created_at >= now() - ($1 || ' days')::interval
            """, (str(days),))
            row = await cur.fetchone()
            return dict(row) if row else {}
