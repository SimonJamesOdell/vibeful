"""Observability — structured event emission and querying.

Implements the standard event catalog:
  SESSION_ENVELOPE, llm_call, MCP_TOOL_CALL, MCP_SESSION_INIT, MCP_TOOLS_LISTED
"""

from __future__ import annotations

import time
import json as _json
from dataclasses import dataclass, field
from typing import Any

from .database import Database


@dataclass
class SessionEnvelope:
    """Emitted when a session is initialized with its full configuration."""
    session_id: str
    agent_name: str = ""
    model: str = "deepseek-chat"
    tool_count: int = 0
    tool_names: list[str] = field(default_factory=list)
    context_ids: list[str] = field(default_factory=list)
    mcp_server_urls: list[str] = field(default_factory=list)


@dataclass
class LlmCallRecord:
    """Emitted after each LLM API call completes."""
    session_id: str
    model: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    finish_reason: str = "stop"
    elapsed_ms: float = 0.0
    tool_names: list[str] = field(default_factory=list)
    llm_role: str = "agent"  # agent, post-process, title, citations


@dataclass
class McpToolCallRecord:
    """Emitted for every MCP tool execution."""
    session_id: str
    tool_name: str
    mcp_server_url: str
    success: bool = True
    latency_ms: float = 0.0
    error: str | None = None


class EventEmitter:
    """Structured event logger backed by PostgreSQL."""

    def __init__(self, db: Database):
        self.db = db
        self._turn_start: dict[str, float] = {}

    async def emit_session_envelope(self, envelope: SessionEnvelope) -> None:
        self._turn_start[envelope.session_id] = time.monotonic()
        await self.db.log_event("SESSION_ENVELOPE", {
            "session_id": envelope.session_id,
            "agent_name": envelope.agent_name,
            "model": envelope.model,
            "tool_count": envelope.tool_count,
            "tool_names": envelope.tool_names,
            "context_ids": envelope.context_ids,
            "mcp_server_urls": envelope.mcp_server_urls,
            "timestamp": _now_iso(),
        }, session_id=envelope.session_id)

    async def emit_llm_call(self, record: LlmCallRecord) -> None:
        await self.db.log_event("llm_call", {
            "session_id": record.session_id,
            "model": record.model,
            "prompt_tokens": record.prompt_tokens,
            "completion_tokens": record.completion_tokens,
            "total_tokens": record.total_tokens,
            "cost_usd": record.cost_usd,
            "finish_reason": record.finish_reason,
            "elapsed_ms": record.elapsed_ms,
            "tool_names": record.tool_names,
            "llm_role": record.llm_role,
            "timestamp": _now_iso(),
        }, session_id=record.session_id)

    async def emit_mcp_tool_call(self, record: McpToolCallRecord) -> None:
        await self.db.log_event("MCP_TOOL_CALL", {
            "session_id": record.session_id,
            "tool_name": record.tool_name,
            "mcp_server_url": record.mcp_server_url,
            "success": record.success,
            "latency_ms": record.latency_ms,
            "error": record.error,
            "timestamp": _now_iso(),
        }, session_id=record.session_id)

    async def emit_mcp_session_init(self, mcp_server_url: str, success: bool, error: str | None = None) -> None:
        await self.db.log_event("MCP_SESSION_INIT", {
            "mcp_server_url": mcp_server_url,
            "success": success,
            "error": error,
            "timestamp": _now_iso(),
        })

    async def emit_mcp_tools_listed(self, mcp_server_url: str, tool_count: int, success: bool = True) -> None:
        await self.db.log_event("MCP_TOOLS_LISTED", {
            "mcp_server_url": mcp_server_url,
            "tool_count": tool_count,
            "success": success,
            "timestamp": _now_iso(),
        })

    # ── Query Helpers ─────────────────────────────────────────

    async def get_session_events(self, session_id: str, limit: int = 100) -> list[dict[str, Any]]:
        return await self.db.query_events(session_id=session_id, limit=limit)

    async def get_agent_cost(self, agent_id: str, days: int = 30) -> dict[str, Any]:
        """Aggregate cost for an agent over a time period."""
        return await self.db.query_cost(agent_id=agent_id, days=days)

    async def get_event_counts(self, event_name: str, days: int = 7) -> list[dict[str, Any]]:
        """Get daily event counts for a given event type."""
        return await self.db.query_event_counts(event_name=event_name, days=days)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
