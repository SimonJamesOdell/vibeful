"""Auth Provider protocol — pluggable authentication and authorization.

Companies bring their own auth (OAuth, SAML, API keys, JWT, session cookies).
Implement this protocol and register it with the proxy.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass
class Identity:
    """Authenticated caller identity."""
    id: str
    name: str = ""
    roles: list[str] = field(default_factory=list)
    tenant_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AuthResult:
    """Result of an authentication attempt."""
    identity: Identity | None = None
    authenticated: bool = False
    error: str | None = None

    @classmethod
    def success(cls, identity: Identity) -> AuthResult:
        return cls(identity=identity, authenticated=True)

    @classmethod
    def failure(cls, error: str) -> AuthResult:
        return cls(error=error, authenticated=False)


@runtime_checkable
class AuthProvider(Protocol):
    """Protocol for authentication and authorization backends.

    Implementations: ApiKeyProvider, JwtProvider, PassthroughProvider.
    """

    async def authenticate(self, request: Any) -> AuthResult:
        """Authenticate a request. Returns AuthResult with identity or error."""
        ...

    async def authorize(
        self, identity: Identity, resource: str, action: str
    ) -> bool:
        """Check if identity is authorized for an action on a resource.

        Args:
            identity: The authenticated caller.
            resource: Resource identifier (e.g. 'agent:support-bot').
            action: Action being attempted (e.g. 'read', 'write', 'delete').

        Returns:
            True if authorized.
        """
        ...
