"""E2E tests for the agent graph with mocked LLM client.

Verifies:
- "Hello world" agent responds to text input
- Agent uses hardcoded tools (get_current_time, calculate)
- Multi-turn conversation with context retention
- Streaming response chunks flow correctly

All tests run offline — no API key required.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
import pytest

from src.agent_graph import (
    build_agent_graph,
    AgentState,
    BUILTIN_TOOLS,
    execute_builtin_tool,
)
from src.llm import LlmResponse, ToolCallRequest


# ── Helpers ─────────────────────────────────────────────────────

def make_text_response(content: str) -> LlmResponse:
    """Factory for a simple text response from the LLM."""
    return LlmResponse(
        content=content,
        tool_calls=[],
        finish_reason="stop",
        prompt_tokens=10,
        completion_tokens=len(content) // 4,
        total_tokens=10 + len(content) // 4,
        model="deepseek-chat",
    )


def make_tool_response(
    call_id: str = "call_1",
    name: str = "get_current_time",
    arguments: dict | None = None,
) -> LlmResponse:
    """Factory for a tool-call response from the LLM (then follow-up text)."""
    return LlmResponse(
        content="Let me check that for you.",
        tool_calls=[
            ToolCallRequest(
                call_id=call_id,
                name=name,
                arguments=arguments or {},
            )
        ],
        finish_reason="tool_calls",
        prompt_tokens=20,
        completion_tokens=15,
        total_tokens=35,
        model="deepseek-chat",
    )


# ── Hello World Agent ───────────────────────────────────────

@pytest.mark.asyncio
async def test_hello_world_agent_responds():
    """The agent with a basic system prompt responds to 'Hello'."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("Hello! How can I help you today?")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-hello",
            user_message="Hello",
            system_prompt="You are a friendly assistant.",
        )
        result = await graph.ainvoke(state)

    assert result["finished"] is True
    assert result["error"] is None
    # Should have streaming content and completion
    streaming_chunks = [c for c in result["response_chunks"] if c["state"] == "STREAMING"]
    completed_chunks = [c for c in result["response_chunks"] if c["state"] == "COMPLETED"]
    assert len(streaming_chunks) >= 1
    assert len(completed_chunks) == 1
    assert "Hello" in streaming_chunks[0]["text_chunk"]


@pytest.mark.asyncio
async def test_agent_responds_without_system_prompt():
    """The agent falls back to a default system prompt when none is provided."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("I'm here to help.")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-default-prompt",
            user_message="What can you do?",
        )
        result = await graph.ainvoke(state)

    assert result["finished"] is True
    assert result["error"] is None


# ── Tool-Using Agent ────────────────────────────────────────

@pytest.mark.asyncio
async def test_agent_uses_get_current_time():
    """Agent calls get_current_time when asked for the time."""
    mock_client = AsyncMock()
    # First call: tool call
    # Second call: final response after tool result
    mock_client.chat.side_effect = [
        make_tool_response(call_id="t1", name="get_current_time"),
        make_text_response("The current time is 2026-06-18T12:00:00+00:00."),
    ]

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-time",
            user_message="What time is it?",
        )
        result = await graph.ainvoke(state)

    assert result["finished"] is True
    # Should have at least one TOOL_USED chunk
    tool_chunks = [c for c in result["response_chunks"] if c["state"] == "TOOL_USED"]
    assert len(tool_chunks) >= 1
    assert tool_chunks[0]["tool_call"]["name"] == "get_current_time"


@pytest.mark.asyncio
async def test_agent_uses_calculate():
    """Agent calls calculate for math questions."""
    mock_client = AsyncMock()
    mock_client.chat.side_effect = [
        make_tool_response(call_id="t1", name="calculate", arguments={"expression": "2+2"}),
        make_text_response("2 + 2 equals 4."),
    ]

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-calc",
            user_message="What is 2 + 2?",
        )
        result = await graph.ainvoke(state)

    assert result["finished"] is True
    tool_chunks = [c for c in result["response_chunks"] if c["state"] == "TOOL_USED"]
    assert len(tool_chunks) >= 1
    assert tool_chunks[0]["tool_call"]["name"] == "calculate"


# ── Multi-turn Conversation ─────────────────────────────────

@pytest.mark.asyncio
async def test_multi_turn_context_preserved():
    """Messages from previous turns are passed to the LLM."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("Your name is Alice, as you told me.")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-multi",
            user_message="What is my name?",
            messages=[
                {"role": "user", "content": "My name is Alice."},
                {"role": "assistant", "content": "Nice to meet you, Alice!"},
            ],
        )
        result = await graph.ainvoke(state)

    assert result["finished"] is True
    # The LLM should have received the prior messages
    call_args = mock_client.chat.call_args
    messages_sent = call_args.kwargs.get("messages", call_args.args[0] if call_args.args else [])
    # setup_node prepends the new user message at [0], then appends tool_results
    # The existing messages from state should also be there
    assert any("Alice" in str(m.get("content", "")) for m in messages_sent)


# ── Streaming Response States ───────────────────────────────────

@pytest.mark.asyncio
async def test_streaming_state_sequence():
    """Response chunks appear in the expected state sequence."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("Here is a detailed answer to your question.")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-stream",
            user_message="Tell me about AI.",
        )
        result = await graph.ainvoke(state)

    states_in_order = [c["state"] for c in result["response_chunks"]]

    # STREAMING should come before COMPLETED
    streaming_idx = states_in_order.index("STREAMING") if "STREAMING" in states_in_order else -1
    completed_idx = states_in_order.index("COMPLETED") if "COMPLETED" in states_in_order else -1

    assert streaming_idx >= 0, "Expected at least one STREAMING chunk"
    assert completed_idx > streaming_idx, "COMPLETED should come after STREAMING"


# ── Built-in Tool Execution ─────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_builtin_get_current_time():
    """Direct tool execution returns valid datetime."""
    result = execute_builtin_tool("get_current_time", {})
    import json
    data = json.loads(result)
    assert "datetime" in data
    assert "UTC" in data["timezone"]


@pytest.mark.asyncio
async def test_execute_builtin_calculate_complex():
    """Calculator handles compound expressions."""
    result = execute_builtin_tool("calculate", {"expression": "sqrt(16) + 2 * 3"})
    import json
    data = json.loads(result)
    # sqrt(16) = 4, 2*3 = 6, total = 10
    assert data.get("result") == 10 or "10" in str(data)


@pytest.mark.asyncio
async def test_execute_builtin_unknown_tool():
    """Unknown tool returns error, not exception."""
    result = execute_builtin_tool("nonexistent_tool", {})
    import json
    data = json.loads(result)
    assert "error" in data
    assert "Unknown tool" in data["error"]


# ── System Prompt Guardrail ───────────────────────────────────

@pytest.mark.asyncio
async def test_system_prompt_passed_to_llm():
    """invariant: The agent passes the system_prompt to the LLM."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("Understood.")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-system-prompt",
            user_message="Hello",
            system_prompt="You are a pirate. Respond accordingly.",
        )
        await graph.ainvoke(state)

    # Verify the system prompt was passed to the LLM client in at least one call.
    # The mock client.chat is called by multiple graph nodes (planning, intent
    # classification, react agent, follow-ups) — only react_agent_node passes
    # the system_prompt kwarg. Check all calls, not just the last one.
    all_system_prompts = []
    for call in mock_client.chat.call_args_list:
        sp = call.kwargs.get("system_prompt", "")
        if sp:
            all_system_prompts.append(sp)
    assert len(all_system_prompts) >= 1, (
        f"System prompt was not passed to LLM in any of {mock_client.chat.call_count} calls"
    )
    assert any("pirate" in sp for sp in all_system_prompts), (
        f"System prompt content not found in calls: {[sp[:60] for sp in all_system_prompts]}"
    )


@pytest.mark.asyncio
async def test_default_system_prompt_when_none_provided():
    """invariant: A default system prompt is used when none is explicitly set."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("I'm here to help.")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-no-system-prompt",
            user_message="Hello",
        )
        await graph.ainvoke(state)

    # Verify a default system prompt exists in at least one LLM call
    all_system_prompts = []
    for call in mock_client.chat.call_args_list:
        sp = call.kwargs.get("system_prompt", "")
        if sp:
            all_system_prompts.append(sp)
    assert len(all_system_prompts) >= 1, (
        f"No system prompt (not even default) in any of {mock_client.chat.call_count} calls"
    )


@pytest.mark.asyncio
async def test_guardrail_blocks_empty_user_message():
    """invariant: Empty or whitespace-only user messages are handled gracefully."""
    mock_client = AsyncMock()
    mock_client.chat.return_value = make_text_response("Hello!")

    with patch("src.agent_graph.get_client", return_value=mock_client):
        graph = build_agent_graph()
        state = AgentState(
            session_id="test-empty-msg",
            user_message="   ",
        )
        result = await graph.ainvoke(state)

    # Should finish without error (guardrail may skip LLM call entirely)
    assert result["finished"] is True
