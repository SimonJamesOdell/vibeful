"""MCP Client — discover and execute tools on Model Context Protocol servers.

Handles the MCP lifecycle: initialize → tools/list → tools/call.
Communicates via HTTP JSON-RPC with MCP servers.
"""

from __future__ import annotations

import uuid
import time
import json as _json
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class McpToolDef:
    """A tool discovered from an MCP server."""
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema
    server_name: str
    server_url: str


@dataclass
class McpToolResult:
    """Result of calling an MCP tool."""
    call_id: str
    tool_name: str
    content: str  # Human-readable text content
    raw_content: list[dict[str, Any]]  # Raw MCP content array
    success: bool
    error: str | None = None
    latency_ms: float = 0.0


class McpClient:
    """Async client for communicating with MCP servers over HTTP JSON-RPC."""

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    async def initialize(self, server_url: str) -> dict[str, Any]:
        """Initialize connection to an MCP server. Returns server info."""
        return await self._rpc(server_url, "initialize", {})

    async def list_tools(self, server_url: str) -> list[McpToolDef]:
        """Discover available tools on an MCP server."""
        result = await self._rpc(server_url, "tools/list", {})
        server_name = "unknown"

        # Get server name via initialize if needed
        try:
            init = await self.initialize(server_url)
            server_name = init.get("serverInfo", {}).get("name", server_name)
        except Exception:
            pass

        tools: list[McpToolDef] = []
        for t in result.get("tools", []):
            tools.append(McpToolDef(
                name=t["name"],
                description=t.get("description", ""),
                parameters=t.get("inputSchema", {"type": "object", "properties": {}, "required": []}),
                server_name=server_name,
                server_url=server_url,
            ))
        return tools

    async def call_tool(
        self,
        server_url: str,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> McpToolResult:
        """Execute a tool on an MCP server."""
        call_id = str(uuid.uuid4())
        start = time.monotonic()

        try:
            result = await self._rpc(server_url, "tools/call", {
                "name": tool_name,
                "arguments": arguments,
            })

            latency = (time.monotonic() - start) * 1000

            content_items = result.get("content", [])
            is_error = result.get("isError", False)

            # Extract human-readable text
            text_parts = []
            for item in content_items:
                if item.get("type") == "text":
                    text_parts.append(item.get("text", ""))
                elif item.get("type") == "image":
                    text_parts.append(f"[Image: {item.get('mimeType', 'unknown')}]")
                elif item.get("type") == "resource":
                    text_parts.append(f"[Resource: {item.get('mimeType', 'unknown')}]")

            return McpToolResult(
                call_id=call_id,
                tool_name=tool_name,
                content="\n".join(text_parts) if text_parts else _json.dumps(content_items),
                raw_content=content_items,
                success=not is_error,
                error="MCP server reported error" if is_error else None,
                latency_ms=round(latency, 2),
            )
        except Exception as e:
            latency = (time.monotonic() - start) * 1000
            return McpToolResult(
                call_id=call_id,
                tool_name=tool_name,
                content=f"Error: {e}",
                raw_content=[],
                success=False,
                error=str(e),
                latency_ms=round(latency, 2),
            )

    async def discover_all_tools(self, server_urls: list[str]) -> list[McpToolDef]:
        """Discover tools from multiple MCP servers in parallel."""
        tools: list[McpToolDef] = []
        for url in server_urls:
            try:
                server_tools = await self.list_tools(url)
                tools.extend(server_tools)
            except Exception:
                continue
        return tools

    async def _rpc(self, server_url: str, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Send a JSON-RPC request to an MCP server."""
        url = server_url.rstrip("/") + "/mcp"
        payload = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": method,
            "params": params,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()

            if "error" in data:
                raise Exception(data["error"].get("message", "RPC error"))
            return data.get("result", {})
