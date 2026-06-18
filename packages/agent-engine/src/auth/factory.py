"""Auth provider factory — get_auth_provider(name) returns the right backend."""

from __future__ import annotations

import os
from typing import Any

from .protocol import AuthProvider
from .api_key import ApiKeyProvider


def get_auth_provider(name: str | None = None, **kwargs: Any) -> AuthProvider:
    """Return an auth provider by name.

    Args:
        name: Provider name ('api_key', 'jwt', 'passthrough').
              Defaults to VIBEFUL_AUTH_PROVIDER env var or 'api_key'.
        **kwargs: Passed to the provider constructor.

    Returns:
        An AuthProvider instance.
    """
    name = name or os.getenv("VIBEFUL_AUTH_PROVIDER", "api_key")

    if name == "api_key":
        return ApiKeyProvider(**kwargs)
    elif name == "jwt":
        from .jwt import JwtProvider
        return JwtProvider(**kwargs)
    elif name == "passthrough":
        from .passthrough import PassthroughProvider
        return PassthroughProvider(**kwargs)
    else:
        raise ValueError(
            f"Unknown auth provider '{name}'. "
            "Available: api_key, jwt, passthrough"
        )
