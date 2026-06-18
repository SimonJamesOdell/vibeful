"""Passthrough authentication provider.

Trusts an upstream proxy or API gateway to have already authenticated the user.
Reads identity from configured headers (e.g. X-User-Id, X-User-Roles).

Use when the platform sits behind an existing auth gateway (nginx, Kong, AWS API Gateway).
"""

from __future__ import annotations

import os
from typing import Any

from .protocol import AuthProvider, AuthResult, Identity


class PassthroughProvider:
    """Trust upstream authentication headers.

    Configure via env vars:
    - VIBEFUL_AUTH_HEADER_ID: header for user ID (default: X-User-Id)
    - VIBEFUL_AUTH_HEADER_NAME: header for user name (default: X-User-Name)
    - VIBEFUL_AUTH_HEADER_ROLES: header for comma-separated roles (default: X-User-Roles)
    - VIBEFUL_AUTH_HEADER_TENANT: header for tenant ID (default: X-Tenant-Id)
    """

    def __init__(
        self,
        header_id: str | None = None,
        header_name: str | None = None,
        header_roles: str | None = None,
        header_tenant: str | None = None,
    ):
        self.header_id = header_id or os.getenv(
            "VIBEFUL_AUTH_HEADER_ID", "X-User-Id"
        )
        self.header_name = header_name or os.getenv(
            "VIBEFUL_AUTH_HEADER_NAME", "X-User-Name"
        )
        self.header_roles = header_roles or os.getenv(
            "VIBEFUL_AUTH_HEADER_ROLES", "X-User-Roles"
        )
        self.header_tenant = header_tenant or os.getenv(
            "VIBEFUL_AUTH_HEADER_TENANT", "X-Tenant-Id"
        )

    async def authenticate(self, request: Any) -> AuthResult:
        headers = getattr(request, "headers", {})
        user_id = headers.get(self.header_id, "")
        if not user_id:
            return AuthResult.failure(
                f"No user ID in header '{self.header_id}'. "
                "Ensure upstream proxy sets this header."
            )

        roles_str = headers.get(self.header_roles, "")
        roles = [r.strip() for r in roles_str.split(",") if r.strip()]

        identity = Identity(
            id=user_id,
            name=headers.get(self.header_name, user_id),
            roles=roles,
            tenant_id=headers.get(self.header_tenant),
        )
        return AuthResult.success(identity)

    async def authorize(
        self, identity: Identity, resource: str, action: str
    ) -> bool:
        return True
