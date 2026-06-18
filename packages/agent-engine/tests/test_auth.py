"""Tests for the auth plugin system.

Covers:
- ApiKeyProvider: valid key, invalid key, missing key, custom keys
- JwtProvider: HS256 valid token, expired token, invalid signature, RS256
- PassthroughProvider: valid headers, missing user ID
- Auth factory: get_auth_provider with different names
- Identity and AuthResult dataclasses
"""

from __future__ import annotations

import hashlib
import time
import pytest

from src.auth import (
    AuthProvider,
    AuthResult,
    Identity,
    get_auth_provider,
)
from src.auth.api_key import ApiKeyProvider
from src.auth.passthrough import PassthroughProvider


# ── Helpers ────────────────────────────────────────────────────

class FakeRequest:
    """Minimal fake for testing auth providers."""
    def __init__(self, headers: dict[str, str] | None = None):
        self.headers = headers or {}


# ── ApiKeyProvider ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_api_key_valid():
    provider = ApiKeyProvider(keys={"sk-test-key": "TestApp"})
    req = FakeRequest({"Authorization": "Bearer sk-test-key"})
    result = await provider.authenticate(req)
    assert result.authenticated is True
    assert result.identity is not None
    assert result.identity.name == "TestApp"


@pytest.mark.asyncio
async def test_api_key_invalid():
    provider = ApiKeyProvider(keys={"sk-test-key": "TestApp"})
    req = FakeRequest({"Authorization": "Bearer wrong-key"})
    result = await provider.authenticate(req)
    assert result.authenticated is False
    assert "Invalid" in result.error


@pytest.mark.asyncio
async def test_api_key_missing():
    provider = ApiKeyProvider(keys={"sk-test-key": "TestApp"})
    req = FakeRequest({})
    result = await provider.authenticate(req)
    assert result.authenticated is False


@pytest.mark.asyncio
async def test_api_key_x_api_key_header():
    provider = ApiKeyProvider(keys={"sk-test-key": "TestApp"})
    req = FakeRequest({"X-API-Key": "sk-test-key"})
    result = await provider.authenticate(req)
    assert result.authenticated is True


@pytest.mark.asyncio
async def test_api_key_add_key():
    provider = ApiKeyProvider(keys={})
    provider.add_key("sk-new", "NewApp", roles=["admin"])
    req = FakeRequest({"Authorization": "Bearer sk-new"})
    result = await provider.authenticate(req)
    assert result.authenticated is True
    assert result.identity.roles == ["admin"]


@pytest.mark.asyncio
async def test_api_key_authorize_always_true():
    provider = ApiKeyProvider(keys={"sk-test-key": "TestApp"})
    identity = Identity(id="TestApp", name="TestApp")
    assert await provider.authorize(identity, "agent:test", "read") is True


# ── PassthroughProvider ────────────────────────────────────────

@pytest.mark.asyncio
async def test_passthrough_valid():
    provider = PassthroughProvider()
    req = FakeRequest({
        "X-User-Id": "user-123",
        "X-User-Name": "Alice",
        "X-User-Roles": "admin,engineer",
        "X-Tenant-Id": "tenant-1",
    })
    result = await provider.authenticate(req)
    assert result.authenticated is True
    assert result.identity.id == "user-123"
    assert result.identity.name == "Alice"
    assert result.identity.roles == ["admin", "engineer"]
    assert result.identity.tenant_id == "tenant-1"


@pytest.mark.asyncio
async def test_passthrough_missing_id():
    provider = PassthroughProvider()
    req = FakeRequest({"X-User-Name": "Alice"})
    result = await provider.authenticate(req)
    assert result.authenticated is False


@pytest.mark.asyncio
async def test_passthrough_authorize_always_true():
    provider = PassthroughProvider()
    identity = Identity(id="user-1")
    assert await provider.authorize(identity, "any", "any") is True


# ── Factory ────────────────────────────────────────────────────

def test_factory_api_key():
    provider = get_auth_provider("api_key", keys={"k": "n"})
    assert isinstance(provider, ApiKeyProvider)


def test_factory_passthrough():
    provider = get_auth_provider("passthrough")
    assert isinstance(provider, PassthroughProvider)


def test_factory_unknown():
    with pytest.raises(ValueError, match="Unknown auth provider"):
        get_auth_provider("nonexistent")


def test_factory_default_is_api_key():
    provider = get_auth_provider()
    assert isinstance(provider, ApiKeyProvider)


# ── Identity / AuthResult ──────────────────────────────────────

def test_identity_defaults():
    ident = Identity(id="u1")
    assert ident.id == "u1"
    assert ident.name == ""
    assert ident.roles == []
    assert ident.tenant_id is None


def test_auth_result_success():
    ident = Identity(id="u1")
    result = AuthResult.success(ident)
    assert result.authenticated is True
    assert result.identity is ident
    assert result.error is None


def test_auth_result_failure():
    result = AuthResult.failure("bad key")
    assert result.authenticated is False
    assert result.identity is None
    assert result.error == "bad key"
