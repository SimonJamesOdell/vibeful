"""Proxy Authentication Middleware — pluggable auth provider.

Uses the AuthProvider protocol from src.auth. Configure via VIBEFUL_AUTH_PROVIDER.
"""

from fastapi import Request, HTTPException
from src.auth import get_auth_provider, AuthProvider

import os

_auth: AuthProvider | None = None


def _get_auth() -> AuthProvider:
    """Lazy-singleton auth provider."""
    global _auth
    if _auth is None:
        _auth = get_auth_provider()
    return _auth


async def auth_middleware(request: Request) -> None:
    """Validate authentication on protected routes.

    Skips health and public endpoints. Uses the configured AuthProvider.
    """
    # Skip health and public endpoints
    public_paths = {"/health", "/v1/chat/completions"}
    if request.url.path in public_paths:
        return

    auth = _get_auth()
    result = await auth.authenticate(request)

    if not result.authenticated:
        raise HTTPException(401, result.error or "Authentication required")

    # Store identity in request state for downstream handlers
    request.state.identity = result.identity
    request.state.auth_provider = auth


def set_auth_provider(provider: AuthProvider) -> None:
    """Override the auth provider (for testing or custom setup)."""
    global _auth
    _auth = provider
