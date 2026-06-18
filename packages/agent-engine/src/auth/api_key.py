"""API Key authentication provider.

Validates API keys from Authorization header or X-API-Key header.
Keys are stored as SHA-256 hashes for safe config-file storage.
"""

from __future__ import annotations

import hashlib
import os
from typing import Any

from .protocol import AuthProvider, AuthResult, Identity


class ApiKeyProvider:
    """Simple API key authentication.

    Configure via VIBEFUL_API_KEYS env var (comma-separated key:name pairs).
    Example: VIBEFUL_API_KEYS=sk-abc123:Admin,sk-def456:ReadOnly
    """

    def __init__(self, keys: dict[str, str] | None = None):
        """
        Args:
            keys: Dict of key_hash -> name, or None to load from env.
        """
        self._keys: dict[str, Identity] = {}
        if keys:
            for key, name in keys.items():
                self._keys[hashlib.sha256(key.encode()).hexdigest()] = Identity(
                    id=name, name=name, roles=["user"],
                )
        else:
            self._load_from_env()

    def _load_from_env(self) -> None:
        raw = os.getenv("VIBEFUL_API_KEYS", "")
        if not raw:
            return
        for entry in raw.split(","):
            entry = entry.strip()
            if not entry:
                continue
            if ":" in entry:
                key, name = entry.split(":", 1)
            else:
                key = entry
                name = key[:12] + "..."
            key_hash = hashlib.sha256(key.strip().encode()).hexdigest()
            self._keys[key_hash] = Identity(
                id=name.strip(), name=name.strip(), roles=["user"],
            )

    async def authenticate(self, request: Any) -> AuthResult:
        """Extract API key from request headers."""
        # Support multiple header formats
        auth = getattr(request, "headers", {}).get("Authorization", "")
        if isinstance(auth, str):
            if auth.startswith("Bearer "):
                key = auth[7:]
            elif auth.startswith("ApiKey "):
                key = auth[7:]
            else:
                key = ""
        else:
            key = ""

        if not key:
            key = getattr(request, "headers", {}).get("X-API-Key", "")

        if not key:
            return AuthResult.failure("API key required")

        key_hash = hashlib.sha256(key.encode()).hexdigest()
        identity = self._keys.get(key_hash)
        if identity is None:
            return AuthResult.failure("Invalid API key")

        return AuthResult.success(identity)

    async def authorize(
        self, identity: Identity, resource: str, action: str
    ) -> bool:
        """API key users have full access."""
        return True

    def add_key(self, key: str, name: str, roles: list[str] | None = None) -> None:
        """Register a new API key."""
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        self._keys[key_hash] = Identity(
            id=name, name=name, roles=roles or ["user"],
        )
