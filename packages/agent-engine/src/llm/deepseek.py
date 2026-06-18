"""DeepSeek provider — OpenAI-compatible API.

Supports deepseek-chat and deepseek-reasoner models.
"""

from __future__ import annotations

import json
import os
from typing import Any, AsyncIterator

import httpx

from .protocol import LlmProvider, LlmResponse, StreamChunk, ToolCallRequest, ToolDefinition

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"


class DeepSeekProvider:
    """Async provider for the DeepSeek API (OpenAI-compatible)."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str = DEEPSEEK_BASE_URL,
        default_model: str = "deepseek-chat",
    ):
        self.api_key = api_key or DEEPSEEK_API_KEY
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model

    # ── Non-streaming ─────────────────────────────────────────

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        tools: list[ToolDefinition] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> LlmResponse:
        payload = self._build_payload(
            messages=messages, model=model, tools=tools,
            temperature=temperature, max_tokens=max_tokens,
            system_prompt=system_prompt, stream=False,
        )
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            return self._parse_response(resp.json())

    # ── Streaming ─────────────────────────────────────────────

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        tools: list[ToolDefinition] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        system_prompt: str | None = None,
    ) -> AsyncIterator[StreamChunk]:
        payload = self._build_payload(
            messages=messages, model=model, tools=tools,
            temperature=temperature, max_tokens=max_tokens,
            system_prompt=system_prompt, stream=True,
            stream_options={"include_usage": True},
        )
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = self._parse_stream_chunk(json.loads(data_str))
                        if chunk is not None:
                            yield chunk
                    except json.JSONDecodeError:
                        continue

    # ── Helpers ───────────────────────────────────────────────

    def _build_payload(
        self, *, messages, model, tools, temperature, max_tokens,
        system_prompt=None, stream=False, stream_options=None,
    ) -> dict[str, Any]:
        built = []
        if system_prompt:
            built.append({"role": "system", "content": system_prompt})
        built.extend(messages)
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": built,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        if stream and stream_options:
            payload["stream_options"] = stream_options
        if tools:
            payload["tools"] = [
                {"type": "function", "function": {
                    "name": t.name, "description": t.description,
                    "parameters": t.parameters,
                }}
                for t in tools
            ]
        return payload

    def _parse_response(self, data: dict[str, Any]) -> LlmResponse:
        choice = data["choices"][0]
        msg = choice.get("message", {})
        usage = data.get("usage", {})
        tool_calls = []
        for tc in msg.get("tool_calls", []):
            fn = tc.get("function", {})
            try:
                args = json.loads(fn.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(ToolCallRequest(
                call_id=tc.get("id", ""),
                name=fn.get("name", ""),
                arguments=args,
            ))
        return LlmResponse(
            content=msg.get("content"),
            tool_calls=tool_calls,
            finish_reason=choice.get("finish_reason", "stop"),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            model=data.get("model", ""),
        )

    def _parse_stream_chunk(self, data: dict) -> StreamChunk | None:
        choices = data.get("choices", [])
        usage = data.get("usage")
        if usage:
            return StreamChunk(
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
            )
        if not choices:
            return None
        delta = choices[0].get("delta", {})
        tc_delta = None
        if "tool_calls" in delta:
            for tc in delta["tool_calls"]:
                fn = tc.get("function", {})
                try:
                    args = json.loads(fn.get("arguments", "{}"))
                except json.JSONDecodeError:
                    args = {}
                tc_delta = ToolCallRequest(
                    call_id=tc.get("id", ""),
                    name=fn.get("name", ""),
                    arguments=args,
                )
        return StreamChunk(
            content=delta.get("content"),
            tool_call_delta=tc_delta,
            finish_reason=choices[0].get("finish_reason"),
        )
