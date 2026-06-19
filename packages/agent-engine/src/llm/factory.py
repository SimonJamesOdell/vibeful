"""Factory for LLM providers — get_provider(name) returns the right backend.

Supports runtime API key override via set_runtime_api_key().
When set, the runtime key takes precedence over DEEPSEEK_API_KEY env var.
This enables in-app setup without requiring users to edit .env files.
"""

from __future__ import annotations

import os
from typing import Any

from .protocol import LlmProvider
from .deepseek import DeepSeekProvider

_runtime_api_key: str | None = None


def set_runtime_api_key(key: str) -> None:
    """Set an API key at runtime (takes precedence over env var).
    Used by the setup wizard to configure the LLM without editing .env."""
    global _runtime_api_key
    _runtime_api_key = key


def get_runtime_api_key() -> str | None:
    """Get the runtime API key if one was set, or None."""
    return _runtime_api_key

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
    if _runtime_api_key and "api_key" not in kwargs:
        kwargs["api_key"] = _runtime_api_key
    return _PROVIDER_REGISTRY[name](**kwargs)


def register_provider(name: str, provider_cls: type) -> None:
    """Register a custom LLM provider."""
    _PROVIDER_REGISTRY[name] = provider_cls


def list_providers() -> list[str]:
    """List all registered provider names."""
    return sorted(_PROVIDER_REGISTRY)
