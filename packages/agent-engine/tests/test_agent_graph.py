"""Tests for the agent graph — node-level and singleton behavior.

Covers:
- Graph construction
- Built-in tool execution (get_current_time, calculate, unknown)
- Built-in tool definitions
- Singleton accessors (get_db, get_rag, get_client, get_mcp, get_memory)
- Node-level tests: setup_node, system_message_builder_node, router_node, buttons_node
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from src.agent_graph import (
    build_agent_graph,
    AgentState,
    execute_builtin_tool,
    BUILTIN_TOOLS,
    setup_node,
    system_message_builder_node,
    router_node,
    buttons_node,
    get_db,
    get_rag,
    get_client,
    get_mcp,
    get_memory,
)
from src.llm import LlmResponse, ToolCallRequest


# ═══════════════════════════════════════════════════════════════
# Graph construction
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_graph_builds():
    graph = build_agent_graph()
    assert graph is not None


# ═══════════════════════════════════════════════════════════════
# Built-in tool execution
# ═══════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_execute_get_current_time():
    import json
    result = execute_builtin_tool("get_current_time", {})
    parsed = json.loads(result)
    assert "datetime" in parsed
    assert parsed["timezone"] == "UTC"


@pytest.mark.asyncio
async def test_execute_calculate_basic():
    import json
    result = execute_builtin_tool("calculate", {"expression": "2 + 3 * 4"})
    parsed = json.loads(result)
    assert parsed["result"] == 14


@pytest.mark.asyncio
async def test_execute_calculate_sqrt():
    import json
    result = execute_builtin_tool("calculate", {"expression": "sqrt(16)"})
    parsed = json.loads(result)
    assert parsed["result"] == 4.0


@pytest.mark.asyncio
async def test_execute_calculate_error():
    import json
    result = execute_builtin_tool("calculate", {"expression": "foo(5)"})
    parsed = json.loads(result)
    assert "error" in parsed


@pytest.mark.asyncio
async def test_execute_unknown_tool():
    import json
    result = execute_builtin_tool("nonexistent", {})
    parsed = json.loads(result)
    assert "Unknown tool" in parsed.get("error", "")


@pytest.mark.asyncio
async def test_execute_get_current_time_with_extra_args():
    """Extra arguments should be ignored gracefully."""
    import json
    result = execute_builtin_tool("get_current_time", {"ignored": "value"})
    parsed = json.loads(result)
    assert "datetime" in parsed  # still works


# ═══════════════════════════════════════════════════════════════
# Built-in tool definitions
# ═══════════════════════════════════════════════════════════════

def test_builtin_tools_registered():
    tool_names = [t.name for t in BUILTIN_TOOLS]
    assert "get_current_time" in tool_names
    assert "calculate" in tool_names


def test_builtin_tools_have_descriptions():
    for tool in BUILTIN_TOOLS:
        assert tool.description, f"Tool '{tool.name}' has no description"


def test_builtin_tools_have_parameters_schema():
    for tool in BUILTIN_TOOLS:
        assert isinstance(tool.parameters, dict)
        assert "type" in tool.parameters


def test_calculate_tool_requires_expression():
    calc_tool = next(t for t in BUILTIN_TOOLS if t.name == "calculate")
    assert "expression" in calc_tool.parameters.get("required", [])


# ═══════════════════════════════════════════════════════════════
# Singleton accessors — lazy initialization
# ═══════════════════════════════════════════════════════════════

class TestSingletonAccessors:
    def test_get_db_returns_database(self):
        db = get_db()
        assert db is not None
        # Second call returns the same instance
        db2 = get_db()
        assert db is db2

    def test_get_client_returns_provider(self):
        with patch("src.agent_graph.get_provider") as mock_get:
            mock_provider = MagicMock()
            mock_get.return_value = mock_provider

            # Reset singleton
            import src.agent_graph as ag
            ag._provider = None

            client = get_client()
            assert client is mock_provider

    def test_get_client_is_singleton(self):
        with patch("src.agent_graph.get_provider") as mock_get:
            mock_get.return_value = MagicMock()

            import src.agent_graph as ag
            ag._provider = None

            c1 = get_client()
            c2 = get_client()
            assert c1 is c2
            # get_provider should only be called once
            assert mock_get.call_count == 1

    def test_get_mcp_returns_client(self):
        import src.agent_graph as ag
        ag._mcp = None
        mcp = get_mcp()
        assert mcp is not None
        mcp2 = get_mcp()
        assert mcp is mcp2

    def test_get_memory_returns_memory(self):
        with patch("src.agent_graph.get_client", return_value=MagicMock()):
            import src.agent_graph as ag
            ag._memory = None
            memory = get_memory()
            assert memory is not None
            memory2 = get_memory()
            assert memory is memory2


# ═══════════════════════════════════════════════════════════════
# setup_node
# ═══════════════════════════════════════════════════════════════

class TestSetupNode:
    @pytest.mark.asyncio
    async def test_initializes_state(self):
        state = AgentState(
            session_id="test",
            user_message="Hello world",
            tool_results=[{"call_id": "c1", "content": "result1"}],
            messages=[{"role": "system", "content": "old"}],
            response_chunks=[{"state": "STREAMING", "text_chunk": "old"}],
            finished=True,
            error="old error",
        )
        result = await setup_node(state)

        # Messages should be reset with user message + tool results
        assert len(result.messages) == 2
        assert result.messages[0] == {"role": "user", "content": "Hello world"}
        assert result.messages[1]["role"] == "tool"
        assert result.messages[1]["tool_call_id"] == "c1"

        # response_chunks should be cleared
        assert result.response_chunks == []

        # rag_results should be cleared
        assert result.rag_results == []

        # finished should be reset
        assert result.finished is False

        # error should be cleared
        assert result.error is None

    @pytest.mark.asyncio
    async def test_handles_empty_tool_results(self):
        state = AgentState(
            session_id="test",
            user_message="Hi",
            tool_results=[],
        )
        result = await setup_node(state)
        assert len(result.messages) == 1
        assert result.messages[0] == {"role": "user", "content": "Hi"}

    @pytest.mark.asyncio
    async def test_handles_tool_results_with_missing_call_id(self):
        state = AgentState(
            session_id="test",
            user_message="Hi",
            tool_results=[{"content": "no call_id"}],
        )
        result = await setup_node(state)
        assert len(result.messages) == 2
        assert result.messages[1]["tool_call_id"] == ""
        assert result.messages[1]["content"] == "no call_id"


# ═══════════════════════════════════════════════════════════════
# system_message_builder_node
# ═══════════════════════════════════════════════════════════════

class TestSystemMessageBuilderNode:
    @pytest.mark.asyncio
    async def test_uses_default_when_no_system_prompt(self):
        state = AgentState(session_id="test", user_message="Hello")
        result = await system_message_builder_node(state)
        assert "DeepSeek" in result.system_prompt
        assert "helpful" in result.system_prompt.lower()

    @pytest.mark.asyncio
    async def test_preserves_existing_system_prompt(self):
        custom = "You are a math tutor who only answers math questions."
        state = AgentState(
            session_id="test",
            user_message="What is 2+2?",
            system_prompt=custom,
        )
        result = await system_message_builder_node(state)
        assert result.system_prompt == custom


# ═══════════════════════════════════════════════════════════════
# router_node
# ═══════════════════════════════════════════════════════════════

class TestRouterNode:
    @pytest.mark.asyncio
    async def test_routes_question_to_rag(self):
        state = AgentState(
            session_id="test",
            user_message="What is the refund policy?",
            context_ids=["ctx1"],
        )
        target = await router_node(state)
        assert target == "rag"

    @pytest.mark.asyncio
    async def test_routes_greeting_to_react_agent(self):
        state = AgentState(
            session_id="test",
            user_message="Hello there!",
        )
        target = await router_node(state)
        assert target == "react_agent"

    @pytest.mark.asyncio
    async def test_routes_search_to_mcp_discovery(self):
        state = AgentState(
            session_id="test",
            user_message="search for latest Python docs",
        )
        target = await router_node(state)
        assert target == "mcp_discovery"

    @pytest.mark.asyncio
    async def test_routes_calculate_to_mcp_discovery(self):
        state = AgentState(
            session_id="test",
            user_message="calculate the distance to the moon",
        )
        target = await router_node(state)
        assert target == "mcp_discovery"


# ═══════════════════════════════════════════════════════════════
# buttons_node
# ═══════════════════════════════════════════════════════════════

class TestButtonsNode:
    @pytest.mark.asyncio
    async def test_no_quick_replies(self):
        state = AgentState(
            session_id="test",
            user_message="Hello",
            quick_replies=[],
        )
        result = await buttons_node(state)
        # Should not add any FOLLOW_UP chunks
        follow_up_chunks = [c for c in result.response_chunks if c.get("state") == "FOLLOW_UP"]
        assert len(follow_up_chunks) == 0

    @pytest.mark.asyncio
    async def test_emits_quick_reply_buttons(self):
        state = AgentState(
            session_id="test",
            user_message="Hello",
            quick_replies=[
                {"label": "Refund policy", "message": "Tell me about refunds"},
                {"label": "Talk to human", "message": "I need human help"},
            ],
        )
        result = await buttons_node(state)
        follow_up_chunks = [c for c in result.response_chunks if c.get("state") == "FOLLOW_UP"]
        assert len(follow_up_chunks) == 1
        assert len(follow_up_chunks[0]["quick_replies"]) == 2
        assert follow_up_chunks[0]["quick_replies"][0]["label"] == "Refund policy"

    @pytest.mark.asyncio
    async def test_uses_message_as_label_fallback(self):
        """When no 'message' field, the label is used as the message."""
        state = AgentState(
            session_id="test",
            user_message="Hi",
            quick_replies=[{"label": "Help me"}],
        )
        result = await buttons_node(state)
        chunk = [c for c in result.response_chunks if c.get("state") == "FOLLOW_UP"][0]
        assert chunk["quick_replies"][0]["message"] == "Help me"
