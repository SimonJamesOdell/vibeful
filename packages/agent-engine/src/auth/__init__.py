"""Auth package — pluggable authentication and authorization."""

from .protocol import AuthProvider, AuthResult, Identity
from .factory import get_auth_provider

__all__ = [
    "AuthProvider",
    "AuthResult",
    "Identity",
    "get_auth_provider",
]
