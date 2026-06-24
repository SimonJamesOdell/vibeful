"""Type definitions for the Vibeful Python SDK."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentResult:
    """Result from a headless agent invocation."""
    agent_id: str
    session_id: str
    response: str = ""
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    error: str | None = None
    finished: bool = False


@dataclass
class StreamEvent:
    """A single streaming event from the agent."""
    type: str  # "token", "tool_call", "tool_result", "complete", "error"
    text: str | None = None
    tool: dict[str, Any] | None = None
    usage: dict[str, int] | None = None
    message: str | None = None
