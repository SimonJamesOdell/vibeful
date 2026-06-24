"""Vibeful client — headless agent invocation and SSE streaming."""

from __future__ import annotations

import json

import httpx

from .types import AgentResult, StreamEvent


class VibefulClient:
    """Client for the Vibeful agent engine REST API.

    Provides `execute()` for headless invocation and `stream()` for
    real-time SSE streaming. Depends only on `httpx`.

    Args:
        base_url: Base URL of the agent engine (default: http://localhost:50052).
        api_key: Optional API key for authenticated endpoints.
        timeout: Request timeout in seconds (default: 120).
    """

    def __init__(
        self,
        base_url: str = "http://localhost:50052",
        api_key: str | None = None,
        timeout: float = 120.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def execute(
        self,
        agent_id: str,
        message: str,
        *,
        system_prompt: str | None = None,
        model: str | None = None,
        temperature: float | None = None,
        context_ids: list[str] | None = None,
        mcp_server_urls: list[str] | None = None,
    ) -> AgentResult:
        """Invoke an agent synchronously and return the full result.

        Returns an `AgentResult` with the response text, tool calls, usage,
        and error (if any).
        """
        payload: dict[str, object] = {"message": message}
        if system_prompt is not None:
            payload["system_prompt"] = system_prompt
        if model is not None:
            payload["model"] = model
        if temperature is not None:
            payload["temperature"] = temperature
        if context_ids is not None:
            payload["context_ids"] = context_ids
        if mcp_server_urls is not None:
            payload["mcp_server_urls"] = mcp_server_urls

        async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout)) as client:
            resp = await client.post(
                f"{self.base_url}/v1/agents/{agent_id}/execute",
                json=payload,
                headers=self._headers(),
            )
            if resp.status_code != 200:
                detail = ""
                try:
                    detail = resp.json().get("detail", "")
                except Exception:
                    pass
                return AgentResult(
                    agent_id=agent_id,
                    session_id="",
                    error=detail or f"HTTP {resp.status_code}",
                )

            data = resp.json()
            return AgentResult(
                agent_id=data.get("agent_id", agent_id),
                session_id=data.get("session_id", ""),
                response=data.get("response", ""),
                tool_calls=data.get("tool_calls", []),
                usage=data.get("usage", {}),
                error=data.get("error"),
                finished=data.get("finished", False),
            )

    async def stream(
        self,
        agent_id: str,
        message: str,
        *,
        system_prompt: str | None = None,
    ):
        """Stream agent responses via Server-Sent Events.

        Yields `StreamEvent` objects as tokens, tool calls, tool results,
        completions, and errors arrive.
        """
        payload: dict[str, object] = {"message": message}
        if system_prompt is not None:
            payload["system_prompt"] = system_prompt

        async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout)) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/v1/agents/{agent_id}/stream",
                json=payload,
                headers=self._headers(),
            ) as resp:
                if resp.status_code != 200:
                    detail = ""
                    try:
                        body = await resp.aread()
                        detail = json.loads(body).get("detail", "")
                    except Exception:
                        pass
                    yield StreamEvent(
                        type="error",
                        message=detail or f"HTTP {resp.status_code}",
                    )
                    return

                async for line in resp.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    try:
                        event_data = json.loads(line.removeprefix("data: "))
                        yield StreamEvent(
                            type=event_data.get("type", "token"),
                            text=event_data.get("text"),
                            tool=event_data.get("tool"),
                            usage=event_data.get("usage"),
                            message=event_data.get("message"),
                        )
                    except json.JSONDecodeError:
                        continue
