"""Tests for AgentMemory — fact mining, recall, deduplication, deletion.

Covers:
- Fact mining: extraction via LLM, embedding, duplicate detection
- Fact recall: semantic search, recent facts fallback
- Deletion: delete all facts, delete specific fact
- format_facts_for_prompt: empty facts, single fact, multiple facts
- Edge cases: empty response, very short response, malformed LLM output
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest

from src.agent_memory import AgentMemory, ExtractedFact
from src.database import Database
from src.embeddings import EmbeddingsClient
from src.llm import LlmResponse


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════


def make_fake_db():
    db = MagicMock(spec=Database)
    db.add_fact = AsyncMock(return_value={"id": "f1", "fact_text": "test"})
    db.recall_facts = AsyncMock(return_value=[])
    db.delete_all_facts = AsyncMock(return_value=3)
    db.delete_fact = AsyncMock(return_value=True)
    return db


def make_fake_embeddings():
    emb = MagicMock(spec=EmbeddingsClient)
    emb.embed = AsyncMock(return_value=[[0.1] * 256])
    emb.embed_single = AsyncMock(return_value=[0.1] * 256)
    return emb


def make_fake_llm(content: str = "[]"):
    llm = MagicMock()
    llm.chat = AsyncMock(return_value=LlmResponse(
        content=content,
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        model="deepseek-chat",
    ))
    return llm


# ═══════════════════════════════════════════════════════════════
# Fact mining
# ═══════════════════════════════════════════════════════════════


class TestFactMining:
    """invariant: mine_facts extracts and stores facts with deduplication."""

    @pytest.mark.asyncio
    async def test_mine_facts_extracts_json_from_llm(self):
        """mine_facts parses LLM output and stores facts."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm(content='[{"fact_text": "User lives in London", "category": "personal", "confidence": 0.9}]')

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="I live in London",
            assistant_response="Thank you for sharing that you live in London!",
        )

        assert len(facts) == 1
        db.add_fact.assert_called_once()

    @pytest.mark.asyncio
    async def test_mine_facts_skips_short_responses(self):
        """mine_facts returns [] when assistant response is under 20 chars."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="Hello",
            assistant_response="Hi!",
        )

        assert facts == []
        llm.chat.assert_not_called()

    @pytest.mark.asyncio
    async def test_mine_facts_skips_empty_response(self):
        """mine_facts returns [] for empty assistant response."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="Hello",
            assistant_response="",
        )

        assert facts == []

    @pytest.mark.asyncio
    async def test_mine_facts_handles_malformed_json(self):
        """mine_facts returns [] when LLM returns non-JSON content."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm(content="Not valid JSON at all")

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="I like coffee",
            assistant_response="Great, I'll remember you like coffee!",
        )

        assert facts == []

    @pytest.mark.asyncio
    async def test_mine_facts_handles_llm_error(self):
        """mine_facts returns [] when LLM raises an exception."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = MagicMock()
        llm.chat = AsyncMock(side_effect=RuntimeError("API error"))

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="I like dogs",
            assistant_response="That's wonderful, dogs are great companions!",
        )

        assert facts == []

    @pytest.mark.asyncio
    async def test_mine_facts_deduplicates_by_similarity(self):
        """mine_facts skips facts that are too similar to existing ones (similarity > 0.95)."""
        db = make_fake_db()
        db.recall_facts = AsyncMock(return_value=[{"similarity": 0.98}])  # Very similar
        emb = make_fake_embeddings()
        llm = make_fake_llm(content='[{"fact_text": "User likes pizza", "category": "preference", "confidence": 0.8}]')

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="I like pizza",
            assistant_response="Pizza is a great choice, I'll remember that!",
        )

        assert len(facts) == 0  # Duplicate detected, skipped
        db.add_fact.assert_not_called()

    @pytest.mark.asyncio
    async def test_mine_facts_stores_non_duplicate(self):
        """mine_facts stores facts when similarity is below threshold."""
        db = make_fake_db()
        db.recall_facts = AsyncMock(return_value=[{"similarity": 0.5}])  # Not similar
        emb = make_fake_embeddings()
        llm = make_fake_llm(content='[{"fact_text": "User prefers dark mode", "category": "preference", "confidence": 0.85}]')

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="I prefer dark mode",
            assistant_response="Dark mode is great, I'll note your preference!",
        )

        assert len(facts) == 1
        db.add_fact.assert_called_once()

    @pytest.mark.asyncio
    async def test_mine_facts_skips_short_fact_text(self):
        """Facts with fact_text under 3 characters are skipped."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm(content='[{"fact_text": "ab", "category": "general", "confidence": 0.5}]')

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="ab",
            assistant_response="I got your two-letter message.",
        )

        assert len(facts) == 0
        db.add_fact.assert_not_called()

    @pytest.mark.asyncio
    async def test_mine_facts_multiple_facts(self):
        """mine_facts extracts multiple facts from a single turn."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm(content='[{"fact_text": "User is a developer", "category": "professional", "confidence": 0.95}, {"fact_text": "User uses Python", "category": "preference", "confidence": 0.9}]')

        memory = AgentMemory(db, emb, llm)
        facts = await memory.mine_facts(
            session_id="s1",
            user_identity="user1",
            user_message="I'm a Python developer",
            assistant_response="Python is an excellent language! I'll remember your profession.",
        )

        assert len(facts) == 2
        assert db.add_fact.call_count == 2


# ═══════════════════════════════════════════════════════════════
# Fact recall
# ═══════════════════════════════════════════════════════════════


class TestFactRecall:
    """invariant: recall_facts uses semantic search when query provided, recent facts otherwise."""

    @pytest.mark.asyncio
    async def test_recall_facts_with_query(self):
        """recall_facts with a query uses semantic search via embeddings."""
        db = make_fake_db()
        db.recall_facts = AsyncMock(return_value=[{"fact_text": "User likes sushi"}])
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        facts = await memory.recall_facts(user_identity="user1", query="food preferences", limit=5)

        assert len(facts) == 1
        emb.embed.assert_called_once()
        db.recall_facts.assert_called_once()

    @pytest.mark.asyncio
    async def test_recall_facts_without_query(self):
        """recall_facts without a query returns recent facts (no embedding)."""
        db = make_fake_db()
        db.recall_facts = AsyncMock(return_value=[{"fact_text": "User lives in Paris"}])
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        facts = await memory.recall_facts(user_identity="user1", limit=3)

        assert len(facts) == 1
        emb.embed.assert_not_called()
        db.recall_facts.assert_called_once_with("user1", None, 3)

    @pytest.mark.asyncio
    async def test_recall_facts_default_limit(self):
        """recall_facts defaults to limit=5."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        await memory.recall_facts(user_identity="user1")

        db.recall_facts.assert_called_once_with("user1", None, 5)


# ═══════════════════════════════════════════════════════════════
# Fact deletion
# ═══════════════════════════════════════════════════════════════


class TestFactDeletion:
    """invariant: delete_all_facts and delete_specific_fact work correctly."""

    @pytest.mark.asyncio
    async def test_delete_all_facts(self):
        """delete_all_facts deletes all facts for a user."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        count = await memory.delete_all_facts("user1")

        assert count == 3
        db.delete_all_facts.assert_called_once_with("user1")

    @pytest.mark.asyncio
    async def test_delete_specific_fact(self):
        """delete_specific_fact deletes one fact by ID."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        llm = make_fake_llm()

        memory = AgentMemory(db, emb, llm)
        result = await memory.delete_specific_fact("f1", "user1")

        assert result is True
        db.delete_fact.assert_called_once_with("f1", "user1")


# ═══════════════════════════════════════════════════════════════
# format_facts_for_prompt
# ═══════════════════════════════════════════════════════════════


class TestFormatFactsForPrompt:
    """invariant: format_facts_for_prompt produces the correct prompt injection."""

    def test_format_empty_facts(self):
        """Empty facts list returns empty string."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        memory = AgentMemory(db, emb)

        result = memory.format_facts_for_prompt([])
        assert result == ""

    def test_format_single_fact(self):
        """Single fact is formatted with category prefix."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        memory = AgentMemory(db, emb)

        facts = [{"fact_text": "User is a designer", "category": "professional"}]
        result = memory.format_facts_for_prompt(facts)
        assert "professional" in result
        assert "User is a designer" in result

    def test_format_multiple_facts(self):
        """Multiple facts are each on their own line."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        memory = AgentMemory(db, emb)

        facts = [
            {"fact_text": "User lives in Berlin", "category": "personal"},
            {"fact_text": "User prefers email", "category": "communication_style"},
        ]
        result = memory.format_facts_for_prompt(facts)
        assert "Berlin" in result
        assert "email" in result

    def test_format_fact_without_category(self):
        """Fact without category defaults to empty string."""
        db = make_fake_db()
        emb = make_fake_embeddings()
        memory = AgentMemory(db, emb)

        facts = [{"fact_text": "User uses VSCode"}]
        result = memory.format_facts_for_prompt(facts)
        assert "User uses VSCode" in result
        # Should still appear with [] or empty category
        assert "[" in result
