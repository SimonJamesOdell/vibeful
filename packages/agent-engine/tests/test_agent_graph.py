"""Tests for the agent graph."""

import pytest
from src.agent_graph import (
    build_agent_graph,
    AgentState,
    execute_builtin_tool,
    BUILTIN_TOOLS,
)


@pytest.mark.asyncio
async def test_graph_builds():
    graph = build_agent_graph()
    assert graph is not None


@pytest.mark.asyncio
async def test_execute_get_current_time():
    result = execute_builtin_tool("get_current_time", {})
    assert "datetime" in result
    assert "UTC" in result


@pytest.mark.asyncio
async def test_execute_calculate():
    result = execute_builtin_tool("calculate", {"expression": "2 + 3 * 4"})
    assert "14" in result


@pytest.mark.asyncio
async def test_execute_unknown_tool():
    result = execute_builtin_tool("nonexistent", {})
    assert "Unknown tool" in result


@pytest.mark.asyncio
async def test_builtin_tools_registered():
    tool_names = [t.name for t in BUILTIN_TOOLS]
    assert "get_current_time" in tool_names
    assert "calculate" in tool_names
