"""Tests for MCP server storage — SQLite CRUD operations.

Covers:
- SqliteBackend.create_mcp_server(): with/without explicit id, all fields, defaults
- SqliteBackend.get_mcp_server(): existing, non-existing
- SqliteBackend.list_mcp_servers(): all, filtered by agent_id, empty
- SqliteBackend.delete_mcp_server(): existing, non-existing
- Round-trip invariants: create → get, create → list, create → delete → get
- Data integrity: all fields survive round-trip
"""

from __future__ import annotations

import pytest_asyncio
import pytest

from src.storage.sqlite import SqliteBackend


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

@pytest_asyncio.fixture
async def db():
    """Fresh in-memory SQLite backend with schema initialized."""
    backend = SqliteBackend(db_path=":memory:")
    await backend.init_schema()
    yield backend
    await backend.close()


async def _create(db: SqliteBackend, **overrides) -> dict:
    """Create a test MCP server with sensible defaults."""
    data = {
        "name": "test-server",
        "url": "http://localhost:9999",
        "transport": "http",
        "auth_type": "none",
        "auth_header": "",
        "agent_id": None,
        **overrides,
    }
    return await db.create_mcp_server(data)


# ═══════════════════════════════════════════════════════════════
# create_mcp_server
# ═══════════════════════════════════════════════════════════════

class TestCreateMcpServer:
    @pytest.mark.asyncio
    async def test_create_minimal(self, db):
        """Create with only required fields (name, url)."""
        result = await db.create_mcp_server({"name": "minimal", "url": "http://localhost:8000"})
        assert result["name"] == "minimal"
        assert result["url"] == "http://localhost:8000"
        assert result["id"] is not None
        assert result["transport"] == "http"  # default
        assert result["auth_type"] == "none"   # default

    @pytest.mark.asyncio
    async def test_create_with_explicit_id(self, db):
        """Creating with a pre-set id uses that id."""
        result = await db.create_mcp_server({
            "id": "my-custom-id",
            "name": "custom",
            "url": "http://localhost:9000",
        })
        assert result["id"] == "my-custom-id"

    @pytest.mark.asyncio
    async def test_create_with_all_fields(self, db):
        """All optional fields are stored correctly."""
        result = await db.create_mcp_server({
            "name": "full",
            "url": "https://example.com/mcp",
            "transport": "sse",
            "auth_type": "bearer",
            "auth_header": "Authorization: Bearer xyz",
            "agent_id": "agent-123",
        })
        assert result["name"] == "full"
        assert result["url"] == "https://example.com/mcp"
        assert result["transport"] == "sse"
        assert result["auth_type"] == "bearer"
        assert result["auth_header"] == "Authorization: Bearer xyz"
        assert result["agent_id"] == "agent-123"

    @pytest.mark.asyncio
    async def test_create_with_agent_id_none(self, db):
        """agent_id=None is stored as NULL."""
        result = await db.create_mcp_server({
            "name": "global",
            "url": "http://localhost:8000",
            "agent_id": None,
        })
        assert result["agent_id"] is None

    @pytest.mark.asyncio
    async def test_create_generates_unique_ids(self, db):
        """Two creates without explicit ids produce different UUIDs."""
        a = await db.create_mcp_server({"name": "a", "url": "http://a"})
        b = await db.create_mcp_server({"name": "b", "url": "http://b"})
        assert a["id"] != b["id"]

    @pytest.mark.asyncio
    async def test_create_defaults_transport(self, db):
        """transport defaults to 'http' when not provided."""
        result = await db.create_mcp_server({"name": "no-transport", "url": "http://x"})
        assert result["transport"] == "http"

    @pytest.mark.asyncio
    async def test_create_defaults_auth(self, db):
        """auth_type defaults to 'none' and auth_header to '' when not provided."""
        result = await db.create_mcp_server({"name": "no-auth", "url": "http://x"})
        assert result["auth_type"] == "none"
        assert result["auth_header"] == ""


# ═══════════════════════════════════════════════════════════════
# get_mcp_server
# ═══════════════════════════════════════════════════════════════

class TestGetMcpServer:
    @pytest.mark.asyncio
    async def test_get_existing(self, db):
        """Get returns the full record for an existing server."""
        created = await _create(db, name="get-me")
        result = await db.get_mcp_server(created["id"])
        assert result is not None
        assert result["id"] == created["id"]
        assert result["name"] == "get-me"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, db):
        """Get returns None for a non-existent id."""
        result = await db.get_mcp_server("nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_empty_id(self, db):
        """Get with empty string returns None."""
        result = await db.get_mcp_server("")
        assert result is None


# ═══════════════════════════════════════════════════════════════
# list_mcp_servers
# ═══════════════════════════════════════════════════════════════

class TestListMcpServers:
    @pytest.mark.asyncio
    async def test_list_empty(self, db):
        """Listing with no servers returns an empty list."""
        result = await db.list_mcp_servers()
        assert result == []

    @pytest.mark.asyncio
    async def test_list_all(self, db):
        """Listing returns all created servers."""
        a = await _create(db, name="alpha")
        b = await _create(db, name="beta")
        result = await db.list_mcp_servers()
        ids = {r["id"] for r in result}
        assert a["id"] in ids
        assert b["id"] in ids
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_list_filter_by_agent_id(self, db):
        """Filter by agent_id returns only matching + global (NULL agent_id) servers."""
        global_srv = await _create(db, name="global", agent_id=None, id="g1")
        agent_srv = await _create(db, name="agent-a", agent_id="agent-1", id="a1")
        other_srv = await _create(db, name="agent-b", agent_id="agent-2", id="a2")

        result = await db.list_mcp_servers(agent_id="agent-1")
        ids = {r["id"] for r in result}
        assert global_srv["id"] in ids  # global (NULL agent_id) always included
        assert agent_srv["id"] in ids  # matching agent
        assert other_srv["id"] not in ids  # different agent excluded

    @pytest.mark.asyncio
    async def test_list_filter_no_match(self, db):
        """Filter by unknown agent_id returns only global servers."""
        global_srv = await _create(db, name="global", agent_id=None, id="g1")
        await _create(db, name="agent-a", agent_id="agent-1", id="a1")

        result = await db.list_mcp_servers(agent_id="agent-unknown")
        ids = {r["id"] for r in result}
        assert global_srv["id"] in ids  # global still included
        assert len(result) >= 1   # at least the global server

    @pytest.mark.asyncio
    async def test_list_with_only_agent_servers(self, db):
        """When only agent-specific servers exist, filter by that agent returns them,
        filter by other agent returns empty."""
        await _create(db, name="agent-a", agent_id="agent-1", id="a1")

        result_match = await db.list_mcp_servers(agent_id="agent-1")
        assert len(result_match) == 1
        assert result_match[0]["id"] == "a1"

        result_other = await db.list_mcp_servers(agent_id="agent-other")
        assert len(result_other) == 0


# ═══════════════════════════════════════════════════════════════
# delete_mcp_server
# ═══════════════════════════════════════════════════════════════

class TestDeleteMcpServer:
    @pytest.mark.asyncio
    async def test_delete_existing(self, db):
        """Deleting an existing server returns True and removes it."""
        created = await _create(db, name="delete-me")
        assert await db.delete_mcp_server(created["id"]) is True
        assert await db.get_mcp_server(created["id"]) is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, db):
        """Deleting a non-existent server returns False."""
        assert await db.delete_mcp_server("nonexistent") is False

    @pytest.mark.asyncio
    async def test_delete_idempotent(self, db):
        """Deleting twice: first returns True, second returns False."""
        created = await _create(db, name="double-delete")
        assert await db.delete_mcp_server(created["id"]) is True
        assert await db.delete_mcp_server(created["id"]) is False


# ═══════════════════════════════════════════════════════════════
# Round-trip invariants
# ═══════════════════════════════════════════════════════════════

class TestMcpRoundTrip:
    @pytest.mark.asyncio
    async def test_create_then_get(self, db):
        """Create → get returns identical data."""
        created = await db.create_mcp_server({
            "name": "roundtrip",
            "url": "https://mcp.example.com",
            "transport": "sse",
            "auth_type": "bearer",
            "auth_header": "Bearer token123",
            "agent_id": "agent-42",
        })
        fetched = await db.get_mcp_server(created["id"])
        assert fetched is not None
        for key in ("id", "name", "url", "transport", "auth_type", "auth_header", "agent_id"):
            assert fetched[key] == created[key], f"Mismatch on field '{key}'"

    @pytest.mark.asyncio
    async def test_create_then_list_contains(self, db):
        """Create → list includes the new server."""
        created = await _create(db, name="list-check")
        result = await db.list_mcp_servers()
        ids = {r["id"] for r in result}
        assert created["id"] in ids

    @pytest.mark.asyncio
    async def test_create_delete_get_is_none(self, db):
        """Create → delete → get returns None."""
        created = await _create(db, name="gone")
        assert await db.delete_mcp_server(created["id"]) is True
        assert await db.get_mcp_server(created["id"]) is None

    @pytest.mark.asyncio
    async def test_create_delete_list_excludes(self, db):
        """Create → delete → list no longer includes the server."""
        created = await _create(db, name="removed")
        await db.delete_mcp_server(created["id"])
        result = await db.list_mcp_servers()
        ids = {r["id"] for r in result}
        assert created["id"] not in ids

    @pytest.mark.asyncio
    async def test_multiple_servers_independent(self, db):
        """Deleting one server does not affect others."""
        a = await _create(db, name="keep-a", id="a")
        b = await _create(db, name="delete-b", id="b")
        c = await _create(db, name="keep-c", id="c")

        await db.delete_mcp_server(b["id"])

        result = await db.list_mcp_servers()
        ids = {r["id"] for r in result}
        assert a["id"] in ids
        assert b["id"] not in ids
        assert c["id"] in ids


# ═══════════════════════════════════════════════════════════════
# Built-in server seeding pattern
# ═══════════════════════════════════════════════════════════════

class TestBuiltinSeedingPattern:
    """Tests that mirror the _startup_seed_mcp() logic in rest_server.py."""

    BUILTIN = [
        {"id": "builtin-web-search", "name": "web-search", "url": "http://localhost:3100",
         "transport": "http", "auth_type": "none", "auth_header": "", "agent_id": None},
        {"id": "builtin-file-read",  "name": "file-read",  "url": "http://localhost:3101",
         "transport": "http", "auth_type": "none", "auth_header": "", "agent_id": None},
        {"id": "builtin-calculator", "name": "calculator", "url": "http://localhost:3102",
         "transport": "http", "auth_type": "none", "auth_header": "", "agent_id": None},
    ]

    @pytest.mark.asyncio
    async def test_seed_creates_when_none_exist(self, db):
        """First seed call creates all three built-ins."""
        for srv in self.BUILTIN:
            existing = await db.get_mcp_server(srv["id"])
            assert existing is None, f"{srv['id']} should not exist before seed"
            await db.create_mcp_server({**srv})

        all_servers = await db.list_mcp_servers()
        ids = {s["id"] for s in all_servers}
        for srv in self.BUILTIN:
            assert srv["id"] in ids, f"{srv['id']} should exist after seed"

    @pytest.mark.asyncio
    async def test_seed_skips_when_already_exist(self, db):
        """Second seed call is a no-op (idempotent)."""
        # First seed
        for srv in self.BUILTIN:
            await db.create_mcp_server({**srv})

        count_before = len(await db.list_mcp_servers())

        # Second seed — skip existing (simulating the check in _startup_seed_mcp)
        for srv in self.BUILTIN:
            existing = await db.get_mcp_server(srv["id"])
            if not existing:
                await db.create_mcp_server({**srv})

        count_after = len(await db.list_mcp_servers())
        assert count_after == count_before  # No duplicates
        assert count_after == 3

    @pytest.mark.asyncio
    async def test_partial_seed(self, db):
        """If some servers already exist, only missing ones are created."""
        # Pre-create one
        await db.create_mcp_server({**self.BUILTIN[0]})
        assert await db.get_mcp_server(self.BUILTIN[0]["id"]) is not None

        # Seed all — should only create the remaining two
        for srv in self.BUILTIN:
            existing = await db.get_mcp_server(srv["id"])
            if not existing:
                await db.create_mcp_server({**srv})

        all_servers = await db.list_mcp_servers()
        assert len(all_servers) == 3
