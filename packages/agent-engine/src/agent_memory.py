"""Agent Memory — fact mining, recall, and deletion.

Implements the Agent Memory (Fact System):
- FactMiningNode: extract facts from the last assistant response
- FactRecallNode: retrieve relevant facts for the current user
- Three-layer access control: org policy → agent config → user controls
- Fact deletion tools: delete_all_facts, delete_specific_fact
"""

from __future__ import annotations

import json as _json
from dataclasses import dataclass
from typing import Any

from .database import Database
from .embeddings import EmbeddingsClient
from .llm import get_provider, LlmProvider


@dataclass
class ExtractedFact:
    fact_text: str
    category: str = "general"
    confidence: float = 0.5


class AgentMemory:
    """Manages the agent's memory of user facts across conversations."""

    def __init__(self, db: Database, embeddings: EmbeddingsClient, llm: LlmProvider | None = None):
        self.db = db
        self.embeddings = embeddings
        self.llm = llm or get_provider()

    async def mine_facts(
        self,
        session_id: str,
        user_identity: str,
        user_message: str,
        assistant_response: str,
        turn_index: int = 0,
    ) -> list[dict[str, Any]]:
        """Extract facts about the user from the current conversation turn.

        Uses the LLM to extract structured facts, then embeds and stores them.
        """
        if not assistant_response or len(assistant_response) < 20:
            return []

        # Ask LLM to extract facts
        prompt = (
            "Extract factual information about the user from this conversation. "
            "Return a JSON array of facts, each with 'fact_text', 'category', and 'confidence' (0-1). "
            "Only include clear, explicit information the user shared — do not infer or guess. "
            "Categories: preference, goal, role, personal, professional, communication_style.\n\n"
            f"User message: {user_message}\n\nAssistant response: {assistant_response[:1000]}\n\n"
            "Return ONLY the JSON array, nothing else."
        )

        try:
            response = await self.llm.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=500,
            )
            content = response.content or "[]"
            # Extract JSON from response
            start = content.find("[")
            end = content.rfind("]") + 1
            if start >= 0 and end > start:
                facts_data = _json.loads(content[start:end])
            else:
                facts_data = []
        except Exception:
            return []

        # Embed and store each fact
        stored = []
        for fact_data in facts_data:
            fact_text = fact_data.get("fact_text", "")
            if not fact_text or len(fact_text) < 3:
                continue

            # Generate embedding
            vecs = await self.embeddings.embed([fact_text])
            embedding = vecs[0] if vecs else []

            # Check for duplicate
            existing = await self.db.recall_facts(user_identity, embedding, limit=1)
            if existing and existing[0].get("similarity", 0) > 0.95:
                continue

            fact = await self.db.add_fact({
                "session_id": session_id,
                "user_identity": user_identity,
                "fact_text": fact_text,
                "category": fact_data.get("category", "general"),
                "confidence": fact_data.get("confidence", 0.5),
                "source_turn": turn_index,
                "embedding": embedding,
            })
            stored.append(fact)

        return stored

    async def recall_facts(
        self,
        user_identity: str,
        query: str | None = None,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant facts about the user.

        If query is provided, uses semantic search. Otherwise returns recent facts.
        """
        if query:
            vecs = await self.embeddings.embed([query])
            query_embedding = vecs[0] if vecs else None
        else:
            query_embedding = None

        return await self.db.recall_facts(user_identity, query_embedding, limit)

    async def delete_all_facts(self, user_identity: str) -> int:
        """Delete all facts for a user (right to be forgotten)."""
        return await self.db.delete_all_facts(user_identity)

    async def delete_specific_fact(self, fact_id: str, user_identity: str) -> bool:
        """Delete a specific fact (user data control)."""
        return await self.db.delete_fact(fact_id, user_identity)

    def format_facts_for_prompt(self, facts: list[dict[str, Any]]) -> str:
        """Format recalled facts as a system prompt injection."""
        if not facts:
            return ""
        lines = ["\n\n---\nKnown information about this user (from previous conversations):\n"]
        for f in facts:
            text = f.get("fact_text", "")
            cat = f.get("category", "")
            lines.append(f"- [{cat}] {text}")
        return "\n".join(lines)
