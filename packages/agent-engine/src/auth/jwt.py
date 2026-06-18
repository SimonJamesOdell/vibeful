"""JWT authentication provider.

Validates RS256 or HS256 JWTs. Requires PyJWT library.
Configure via VIBEFUL_JWT_SECRET (HS256) or VIBEFUL_JWT_PUBLIC_KEY (RS256).
"""

from __future__ import annotations

import os
from typing import Any

try:
    import jwt
    HAS_JWT = True
except ImportError:
    HAS_JWT = False

from .protocol import AuthProvider, AuthResult, Identity


class JwtProvider:
    """JWT token authentication.

    Supports:
    - HS256: symmetric shared secret (VIBEFUL_JWT_SECRET)
    - RS256: asymmetric public key (VIBEFUL_JWT_PUBLIC_KEY)
    - Custom issuer/audience validation via env vars.

    Token extracted from Authorization: Bearer <token> header.
    """

    def __init__(
        self,
        secret: str | None = None,
        public_key: str | None = None,
        algorithms: list[str] | None = None,
        issuer: str | None = None,
        audience: str | None = None,
    ):
        if not HAS_JWT:
            raise ImportError(
                "PyJWT is required for JWT auth. Install with: pip install pyjwt"
            )
        self.secret = secret or os.getenv("VIBEFUL_JWT_SECRET")
        self.public_key = public_key or os.getenv("VIBEFUL_JWT_PUBLIC_KEY")
        self.algorithms = algorithms or (
            ["RS256"] if self.public_key else ["HS256"]
        )
        self.issuer = issuer or os.getenv("VIBEFUL_JWT_ISSUER")
        self.audience = audience or os.getenv("VIBEFUL_JWT_AUDIENCE")

    async def authenticate(self, request: Any) -> AuthResult:
        auth = getattr(request, "headers", {}).get("Authorization", "")
        if not auth.startswith("Bearer "):
            return AuthResult.failure("Bearer token required")

        token = auth[7:]

        try:
            verify_key = self.secret or self.public_key
            if not verify_key:
                return AuthResult.failure("JWT verification key not configured")

            options: dict[str, Any] = {"verify_exp": True}
            if not self.issuer:
                options["verify_iss"] = False
            if not self.audience:
                options["verify_aud"] = False

            payload = jwt.decode(
                token,
                key=verify_key,
                algorithms=self.algorithms,
                issuer=self.issuer,
                audience=self.audience,
                options=options,
            )
        except jwt.ExpiredSignatureError:
            return AuthResult.failure("Token expired")
        except jwt.InvalidTokenError as e:
            return AuthResult.failure(f"Invalid token: {e}")

        identity = Identity(
            id=payload.get("sub", ""),
            name=payload.get("name", payload.get("sub", "")),
            roles=payload.get("roles", []),
            tenant_id=payload.get("tenant_id"),
            metadata={k: v for k, v in payload.items()
                       if k not in ("sub", "name", "roles", "tenant_id", "exp", "iat", "iss", "aud")},
        )
        return AuthResult.success(identity)

    async def authorize(
        self, identity: Identity, resource: str, action: str
    ) -> bool:
        # Role-based: 'admin' role can do anything
        if "admin" in identity.roles:
            return True
        # Otherwise, check for resource-specific role
        required_role = f"{action}:{resource}"
        return required_role in identity.roles
