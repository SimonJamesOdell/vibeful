"""Tests for quality nodes — routing, quick replies, citations, follow-ups.

Covers:
- classify_intent(): all routing paths (rag, react_agent, workflow, mcp_discovery)
- get_quick_replies(): config parsing, empty config, edge cases
- build_citations(): with mocked LLM, empty results, error handling
- generate_follow_ups(): with mocked LLM, empty response, error handling
- QuickReply dataclass

All tests use mocks for LLM calls — no API key required.
"""

from __future__ import annotations

import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from src.quality_nodes import (
    classify_intent,
    get_quick_replies,
    QuickReply,
    build_citations,
    generate_follow_ups,
)
from src.rag import RagResult


# ═══════════════════════════════════════════════════════════════
# classify_intent — routing logic
# ═══════════════════════════════════════════════════════════════

class TestClassifyIntentRAG:
    """Messages that should route to RAG."""

    @pytest.mark.asyncio
    async def test_what_is_with_contexts(self):
        result = await classify_intent("What is the refund policy?", has_contexts=True)
        assert result == "rag"

    @pytest.mark.asyncio
    async def test_how_to_with_contexts(self):
        result = await classify_intent("How do I reset my password?", has_contexts=True)
        assert result == "rag"

    @pytest.mark.asyncio
    async def test_explain_with_contexts(self):
        result = await classify_intent("Explain the shipping procedure", has_contexts=True)
        assert result == "rag"

    @pytest.mark.asyncio
    async def test_question_mark_with_contexts(self):
        result = await classify_intent("Where is my order?", has_contexts=True)
        assert result == "rag"

    @pytest.mark.asyncio
    async def test_policy_keyword_with_contexts(self):
        result = await classify_intent("Tell me about your warranty policy", has_contexts=True)
        assert result == "rag"

    @pytest.mark.asyncio
    async def test_price_keyword_with_contexts(self):
        result = await classify_intent("What's the cost of the premium plan?", has_contexts=True)
        assert result == "rag"


class TestClassifyIntentNoContexts:
    """Questions without contexts should NOT route to RAG."""

    @pytest.mark.asyncio
    async def test_what_is_without_contexts(self):
        result = await classify_intent("What is the refund policy?", has_contexts=False)
        assert result == "react_agent"

    @pytest.mark.asyncio
    async def test_question_mark_without_contexts(self):
        result = await classify_intent("How does this work?", has_contexts=False)
        assert result == "react_agent"


class TestClassifyIntentDirect:
    """Casual messages that should route to react_agent."""

    @pytest.mark.asyncio
    async def test_greeting(self):
        result = await classify_intent("Hello, how are you?")
        assert result == "react_agent"

    @pytest.mark.asyncio
    async def test_simple_statement(self):
        result = await classify_intent("Thanks for your help today.")
        assert result == "react_agent"

    @pytest.mark.asyncio
    async def test_command_without_patterns(self):
        result = await classify_intent("Tell me a joke")
        assert result == "react_agent"


class TestClassifyIntentWorkflow:
    """Messages that trigger workflow routing."""

    @pytest.mark.asyncio
    async def test_start_workflow(self):
        result = await classify_intent(
            "start workflow onboarding", has_workflows=True
        )
        assert result == "workflow"

    @pytest.mark.asyncio
    async def test_run_workflow(self):
        result = await classify_intent(
            "run workflow customer_support", has_workflows=True
        )
        assert result == "workflow"

    @pytest.mark.asyncio
    async def test_execute_workflow(self):
        result = await classify_intent(
            "execute workflow nightly_report", has_workflows=True
        )
        assert result == "workflow"

    @pytest.mark.asyncio
    async def test_workflow_without_workflows_available(self):
        """If no workflows exist in the system, don't route to workflow."""
        result = await classify_intent(
            "start workflow something", has_workflows=False
        )
        assert result != "workflow"


class TestClassifyIntentMCP:
    """Messages that should trigger MCP tool discovery."""

    @pytest.mark.asyncio
    async def test_search_for(self):
        result = await classify_intent("search for the latest Python release")
        assert result == "mcp_discovery"

    @pytest.mark.asyncio
    async def test_look_up(self):
        result = await classify_intent("look up the weather in Tokyo")
        assert result == "mcp_discovery"

    @pytest.mark.asyncio
    async def test_find_me(self):
        result = await classify_intent("find me restaurants near here")
        assert result == "mcp_discovery"

    @pytest.mark.asyncio
    async def test_calculate(self):
        result = await classify_intent("calculate the square root of 144")
        assert result == "mcp_discovery"

    @pytest.mark.asyncio
    async def test_compute(self):
        result = await classify_intent("compute the factorial of 10")
        assert result == "mcp_discovery"


class TestClassifyIntentPriority:
    """Workflow > MCP > RAG > react_agent priority."""

    @pytest.mark.asyncio
    async def test_workflow_over_mcp(self):
        """Workflow patterns take priority over MCP patterns."""
        result = await classify_intent(
            "start workflow search_indexer", has_workflows=True
        )
        assert result == "workflow"

    @pytest.mark.asyncio
    async def test_mcp_over_rag(self):
        """MCP patterns take priority over RAG patterns."""
        result = await classify_intent("search for the refund policy", has_contexts=True)
        assert result == "mcp_discovery"


# ═══════════════════════════════════════════════════════════════
# get_quick_replies — config parsing
# ═══════════════════════════════════════════════════════════════

class TestGetQuickReplies:
    def test_empty_list(self):
        result = get_quick_replies([])
        assert result == []

    def test_none_input(self):
        result = get_quick_replies(None)
        assert result == []

    def test_single_reply(self):
        config = [{"label": "What's your refund policy?", "message": "Tell me about refunds"}]
        result = get_quick_replies(config)
        assert len(result) == 1
        assert isinstance(result[0], QuickReply)
        assert result[0].label == "What's your refund policy?"
        assert result[0].message == "Tell me about refunds"

    def test_multiple_replies(self):
        config = [
            {"label": "Refund policy", "message": "Tell me about refunds"},
            {"label": "Talk to human", "message": "I need human help"},
            {"label": "Track order", "message": "Where is my order?"},
        ]
        result = get_quick_replies(config)
        assert len(result) == 3

    def test_message_defaults_to_label(self):
        """If 'message' is not provided, it should default to the label."""
        config = [{"label": "Help me"}]
        result = get_quick_replies(config)
        assert len(result) == 1
        assert result[0].message == "Help me"

    def test_skips_items_without_label(self):
        config = [
            {"message": "No label here"},
            {"label": "Valid one", "message": "Hello"},
        ]
        result = get_quick_replies(config)
        assert len(result) == 1
        assert result[0].label == "Valid one"

    def test_skips_non_dict_items(self):
        config = [
            "not a dict",
            {"label": "Real reply", "message": "Works"},
            123,
        ]
        result = get_quick_replies(config)
        assert len(result) == 1
        assert result[0].label == "Real reply"

    def test_quick_reply_dataclass(self):
        qr = QuickReply(label="Test", message="This is a test")
        assert qr.label == "Test"
        assert qr.message == "This is a test"


# ═══════════════════════════════════════════════════════════════
# build_citations — with mocked LLM
# ═══════════════════════════════════════════════════════════════

def make_rag_result(idx: int, filename: str, text: str) -> RagResult:
    """Helper to create a RagResult for testing."""
    return RagResult(
        chunk_index=idx,
        filename=filename,
        text=text,
        similarity=0.85 - (idx * 0.05),
    )


def make_llm_response(content: str) -> MagicMock:
    """Helper to create a mock LlmResponse."""
    resp = MagicMock()
    resp.content = content
    return resp


class TestBuildCitations:
    @pytest.mark.asyncio
    async def test_returns_citations_for_used_chunks(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response("[0, 2]")

        rag_results = [
            make_rag_result(0, "doc1.md", "Refund policy: 30-day returns."),
            make_rag_result(1, "doc2.md", "Shipping: 5-7 business days."),
            make_rag_result(2, "doc3.md", "Warranty: 1 year limited."),
        ]

        citations = await build_citations(
            assistant_response="Our refund policy allows returns within 30 days. Warranty is 1 year.",
            rag_results=rag_results,
            llm=llm,
        )

        assert len(citations) == 2
        assert citations[0]["filename"] == "doc1.md"
        assert citations[1]["filename"] == "doc3.md"

    @pytest.mark.asyncio
    async def test_empty_rag_results(self):
        llm = AsyncMock()
        citations = await build_citations("Some response", [], llm)
        assert citations == []
        # LLM should not be called when there are no RAG results
        llm.chat.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_assistant_response(self):
        llm = AsyncMock()
        rag_results = [make_rag_result(0, "doc.md", "Some text.")]
        citations = await build_citations("", rag_results, llm)
        assert citations == []
        llm.chat.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_llm_json_parse_error(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response("not json at all")

        rag_results = [make_rag_result(0, "doc.md", "Some text.")]
        citations = await build_citations("Some response", rag_results, llm)
        assert citations == []

    @pytest.mark.asyncio
    async def test_handles_out_of_range_indices(self):
        """Indices outside the valid range should be ignored."""
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response("[0, 99, -1]")

        rag_results = [make_rag_result(0, "doc.md", "Only one result.")]
        citations = await build_citations("Some response", rag_results, llm)
        assert len(citations) == 1
        assert citations[0]["chunk_index"] == 0

    @pytest.mark.asyncio
    async def test_handles_non_int_indices(self):
        """Non-integer indices in the LLM response should be ignored."""
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response('[0, "string", null]')

        rag_results = [make_rag_result(0, "doc.md", "Text.")]
        citations = await build_citations("Response", rag_results, llm)
        assert len(citations) == 1
        assert citations[0]["chunk_index"] == 0

    @pytest.mark.asyncio
    async def test_handles_json_with_markdown_fences(self):
        """LLM might wrap JSON in markdown code fences."""
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response("```json\n[0]\n```")

        rag_results = [make_rag_result(0, "doc.md", "Text.")]
        citations = await build_citations("Response", rag_results, llm)
        assert len(citations) == 1

    @pytest.mark.asyncio
    async def test_includes_citation_metadata(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response("[0]")

        rag_results = [make_rag_result(0, "policy.md", "Our policy is 30-day returns.")]
        citations = await build_citations("You can return items within 30 days.", rag_results, llm)

        assert len(citations) == 1
        assert citations[0]["chunk_index"] == 0
        assert citations[0]["filename"] == "policy.md"
        assert "text_snippet" in citations[0]
        assert "similarity" in citations[0]
        assert len(citations[0]["text_snippet"]) <= 200


# ═══════════════════════════════════════════════════════════════
# generate_follow_ups — with mocked LLM
# ═══════════════════════════════════════════════════════════════

class TestGenerateFollowUps:
    @pytest.mark.asyncio
    async def test_generates_questions(self):
        llm = AsyncMock()
        questions = ["What's the turnaround time?", "Do you ship internationally?", "Is there a warranty?"]
        llm.chat.return_value = make_llm_response(json.dumps(questions))

        result = await generate_follow_ups(
            user_message="What's your refund policy?",
            assistant_response="We offer 30-day returns on all products.",
            llm=llm,
        )

        assert len(result) == 3
        assert "What's the turnaround time?" in result

    @pytest.mark.asyncio
    async def test_empty_assistant_response(self):
        llm = AsyncMock()
        result = await generate_follow_ups("Hello", "", llm)
        assert result == []
        llm.chat.assert_not_called()

    @pytest.mark.asyncio
    async def test_custom_count(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response(json.dumps(["Q1", "Q2"]))

        result = await generate_follow_ups(
            user_message="Tell me about your product.",
            assistant_response="We have many products.",
            llm=llm,
            count=2,
        )

        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_handles_parse_error(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response("invalid json {{{")

        result = await generate_follow_ups("Hello", "Hi there", llm)
        assert result == []

    @pytest.mark.asyncio
    async def test_trims_long_questions(self):
        llm = AsyncMock()
        long_q = "A" * 200
        llm.chat.return_value = make_llm_response(json.dumps([long_q]))

        result = await generate_follow_ups("Hello", "Hi there", llm)
        assert len(result) == 1
        assert len(result[0]) <= 100

    @pytest.mark.asyncio
    async def test_filters_non_string_items(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response(json.dumps(["Valid Q", 123, None, "Another Q"]))

        result = await generate_follow_ups("Hello", "Hi there", llm)
        assert len(result) == 2
        assert result[0] == "Valid Q"
        assert result[1] == "Another Q"

    @pytest.mark.asyncio
    async def test_filters_empty_strings(self):
        llm = AsyncMock()
        llm.chat.return_value = make_llm_response(json.dumps(["", "Real Q", "  "]))

        result = await generate_follow_ups("Hello", "Hi there", llm)
        assert len(result) == 1
        assert result[0] == "Real Q"
