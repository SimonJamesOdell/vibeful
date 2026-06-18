"""Factory for LLM providers — get_provider(name) returns the right backend."""

from __future__ import annotations

import os
from typing import Any

from .protocol import LlmProvider
from .deepseek import DeepSeekProvider

# Lazy import to avoid requiring all provider SDKs at install time
_PROVIDER_REGISTRY: dict[str, type] = {
    "deepseek": DeepSeekProvider,
}

# Try to register OpenAI provider if SDK is available
try:
    from .openai_provider import OpenAIProvider
    _PROVIDER_REGISTRY["openai"] = OpenAIProvider
except ImportError:
    pass

# Try to register Anthropic provider if SDK is available
try:
    from .anthropic_provider import AnthropicProvider
    _PROVIDER_REGISTRY["anthropic"] = AnthropicProvider
except ImportError:
    pass


def get_provider(name: str | None = None, **kwargs: Any) -> LlmProvider:
    """Return an LLM provider by name.

    Args:
        name: Provider name. Defaults to VIBEFUL_LLM_PROVIDER env var or 'deepseek'.
        **kwargs: Passed to the provider constructor.

    Returns:
        An LlmProvider instance.
    """
    name = name or os.getenv("VIBEFUL_LLM_PROVIDER", "deepseek")
    if name not in _PROVIDER_REGISTRY:
        available = ", ".join(_PROVIDER_REGISTRY)
        raise ValueError(
            f"Unknown LLM provider '{name}'. Available: {available}. "
            f"Set VIBEFUL_LLM_PROVIDER env var."
        )
    return _PROVIDER_REGISTRY[name](**kwargs)


def register_provider(name: str, provider_cls: type) -> None:
    """Register a custom LLM provider."""
    _PROVIDER_REGISTRY[name] = provider_cls


def list_providers() -> list[str]:
    """List all registered provider names."""
    return sorted(_PROVIDER_REGISTRY)
