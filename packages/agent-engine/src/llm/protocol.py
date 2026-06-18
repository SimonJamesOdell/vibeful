"""LLM provider abstraction — protocol + shared types.

Pluggable LLM backend. Swap providers via config without changing agent code.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol, runtime_checkable


@dataclass
class ToolDefinition:
    """A tool the agent can call (OpenAI function-calling format)."""
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass
class ToolCallRequest:
    """A tool call the model requested."""
    call_id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LlmResponse:
    """A complete (non-streaming) LLM response."""
    content: str | None = None
    tool_calls: list[ToolCallRequest] = field(default_factory=list)
    finish_reason: str = "stop"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    model: str = ""


@dataclass
class StreamChunk:
    """A single streaming chunk from the LLM."""
    content: str | None = None
    tool_call_delta: ToolCallRequest | None = None
    finish_reason: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0


@runtime_checkable
class LlmProvider(Protocol):
    """Protocol for LLM backends.

    Implementations: DeepSeekProvider, OpenAIProvider, AnthropicProvider.
    Custom providers: implement chat() and optionally chat_stream().
    """

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
        """Send a chat completion request (non-streaming)."""
        ...

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
        """Send a chat completion request with SSE streaming."""
        ...
