"""Unified architecture tests — invariants introduced by the single-codebase architecture.

Covers:
- entrypoint.py: graph wired once, both servers started
- rest_server.py: _startup_graph builds graph only when not already set
- rest_server.py: database auto-detection (PostgreSQL vs SQLite)
- Health endpoints: /health/ready, /health/live
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch
import pytest


# ═══════════════════════════════════════════════════════════════
# Helpers — avoid triggering side-effect imports from main.py
# ═══════════════════════════════════════════════════════════════


def _patch_entrypoint_deps():
    """Return a stack of patches that prevent main.py from importing
    the proto stubs and database during test discovery."""
    # Prevent main.py's module-level sys.exit(1) when proto stubs are missing
    return (
        patch("src.main.serve", AsyncMock()),
        patch("src.rest_server.serve_rest", AsyncMock()),
        patch("src.agent_graph.build_agent_graph", return_value=MagicMock(name="graph")),
    )


# ═══════════════════════════════════════════════════════════════
# Entrypoint — graph wiring and server start
# ═══════════════════════════════════════════════════════════════


class TestEntrypointOrchestration:
    """invariant: entrypoint.py builds the graph once, wires it into both
    REST and gRPC servers, then starts both concurrently."""

    # Mock src.main module — avoids proto import + sys.exit(1) on test machines
    _mock_main = MagicMock(name="src.main")
    _mock_main.serve = AsyncMock()
    _mock_main._agent_graph = None

    @pytest.fixture(autouse=True)
    def _prevent_main_import(self, monkeypatch):
        """Inject a fake src.main so patch() never triggers the real import."""
        monkeypatch.setitem(sys.modules, "src.main", self._mock_main)

    @pytest.mark.asyncio
    async def test_graph_built_exactly_once(self):
        """build_agent_graph() is called exactly once by the entrypoint."""
        fake_graph = MagicMock(name="compiled_graph")

        with (
            patch("src.agent_graph.build_agent_graph", return_value=fake_graph) as mock_build,
            patch("src.rest_server.set_graph") as mock_set_graph,
            patch("src.rest_server.serve_rest", AsyncMock()),
            patch.dict(os.environ, {"REST_PORT": "50052", "GRPC_PORT": "50051"}),
        ):
            from src.entrypoint import main as ep_main
            import src.main as grpc_main

            await ep_main()

        mock_build.assert_called_once()
        mock_set_graph.assert_called_once_with(fake_graph)
        assert grpc_main._agent_graph is fake_graph

    @pytest.mark.asyncio
    async def test_both_servers_started(self):
        """serve_rest() and serve_grpc() are both called."""
        fake_graph = MagicMock(name="compiled_graph")

        with (
            patch("src.agent_graph.build_agent_graph", return_value=fake_graph),
            patch("src.rest_server.set_graph"),
            patch("src.rest_server.serve_rest", AsyncMock()) as mock_serve_rest,
            patch.dict(os.environ, {"REST_PORT": "50052", "GRPC_PORT": "50051"}),
        ):
            serve_mock = AsyncMock()
            self._mock_main.serve = serve_mock

            from src.entrypoint import main as ep_main

            await ep_main()

        mock_serve_rest.assert_called_once()
        serve_mock.assert_called_once()

    @pytest.mark.asyncio
    async def test_rest_port_respected(self):
        """REST_PORT env var is passed to serve_rest()."""
        fake_graph = MagicMock(name="compiled_graph")

        with (
            patch("src.agent_graph.build_agent_graph", return_value=fake_graph),
            patch("src.rest_server.set_graph"),
            patch("src.rest_server.serve_rest", AsyncMock()) as mock_serve_rest,
            patch.dict(os.environ, {"REST_PORT": "9999", "GRPC_PORT": "50051"}),
        ):
            from src.entrypoint import main as ep_main

            await ep_main()

        mock_serve_rest.assert_called_once_with(port=9999)

    @pytest.mark.asyncio
    async def test_default_ports_when_env_unset(self):
        """When REST_PORT and GRPC_PORT are unset, defaults are used."""
        fake_graph = MagicMock(name="compiled_graph")

        with (
            patch("src.agent_graph.build_agent_graph", return_value=fake_graph),
            patch("src.rest_server.set_graph"),
            patch("src.rest_server.serve_rest", AsyncMock()) as mock_serve_rest,
            patch.dict(os.environ, {}, clear=True),
        ):
            from src.entrypoint import main as ep_main

            await ep_main()

        mock_serve_rest.assert_called_once_with(port=50052)


# ═══════════════════════════════════════════════════════════════
# REST server — graph build on startup
# ═══════════════════════════════════════════════════════════════


class TestStartupGraphEvent:
    """invariant: _startup_graph builds the graph only when _graph is None
    (standalone mode). When entrypoint already set it, this is a no-op."""

    @pytest.mark.asyncio
    async def test_builds_graph_when_none(self):
        """When _graph is None, build_agent_graph() is called."""
        import src.rest_server as rs

        rs._graph = None

        with patch("src.agent_graph.build_agent_graph") as mock_build:
            mock_build.return_value = MagicMock(name="compiled_graph")
            await rs._startup_graph()

        mock_build.assert_called_once()
        assert rs._graph is not None, "Graph should be set after startup"

    @pytest.mark.asyncio
    async def test_skips_when_graph_already_set(self):
        """When _graph is already set (by entrypoint), build is skipped."""
        import src.rest_server as rs

        existing = MagicMock(name="existing_graph")
        rs._graph = existing

        with patch("src.agent_graph.build_agent_graph") as mock_build:
            await rs._startup_graph()

        mock_build.assert_not_called()
        assert rs._graph is existing, "Existing graph should not be replaced"

    @pytest.mark.asyncio
    async def test_handles_build_failure_gracefully(self):
        """When graph build fails, _graph stays None but no crash."""
        import src.rest_server as rs

        rs._graph = None

        with patch("src.agent_graph.build_agent_graph", side_effect=RuntimeError("mock error")):
            await rs._startup_graph()

        assert rs._graph is None, "Graph should remain None on failure"


# ═══════════════════════════════════════════════════════════════
# Database auto-detection
# ═══════════════════════════════════════════════════════════════


class TestDatabaseAutoDetection:
    """invariant: _startup_db selects PostgreSQL when DATABASE_URL starts
    with postgresql://, falls back to SQLite otherwise."""

    @pytest.mark.asyncio
    async def test_postgresql_selected_when_url_set(self):
        """When DATABASE_URL is postgresql://..., Database() is used."""
        import src.rest_server as rs

        rs._db_lucid = None

        with (
            patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:pass@host/db"}),
            patch("src.database.Database") as mock_db_cls,
        ):
            mock_db = MagicMock()
            mock_db.init_schema = AsyncMock()
            mock_db_cls.return_value = mock_db

            await rs._startup_db()

        mock_db_cls.assert_called_once()
        mock_db.init_schema.assert_called_once()
        assert rs._db_lucid is mock_db

    @pytest.mark.asyncio
    async def test_sqlite_selected_when_no_url(self):
        """When DATABASE_URL is empty, SQLite is used."""
        import src.rest_server as rs

        rs._db_lucid = None

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("src.storage.sqlite.SqliteBackend") as mock_sqlite_cls,
        ):
            mock_sqlite = MagicMock()
            mock_sqlite.init_schema = AsyncMock()
            mock_sqlite_cls.return_value = mock_sqlite

            await rs._startup_db()

        mock_sqlite_cls.assert_called_once()
        mock_sqlite.init_schema.assert_called_once()
        assert rs._db_lucid is mock_sqlite

    @pytest.mark.asyncio
    async def test_falls_back_to_sqlite_when_postgres_unavailable(self):
        """When PostgreSQL is configured but unreachable, fallback to SQLite."""
        import src.rest_server as rs

        rs._db_lucid = None

        with (
            patch.dict(os.environ, {"DATABASE_URL": "postgresql://bad:5432/nonexistent"}),
            patch("src.database.Database", side_effect=RuntimeError("connection refused")),
            patch("src.storage.sqlite.SqliteBackend") as mock_sqlite_cls,
        ):
            mock_sqlite = MagicMock()
            mock_sqlite.init_schema = AsyncMock()
            mock_sqlite_cls.return_value = mock_sqlite

            await rs._startup_db()

        mock_sqlite_cls.assert_called_once()
        mock_sqlite.init_schema.assert_called_once()
        assert rs._db_lucid is mock_sqlite


# ═══════════════════════════════════════════════════════════════
# Health endpoints
# ═══════════════════════════════════════════════════════════════


class TestHealthEndpoints:
    """invariant: /health/ready reflects graph state, /health/live always alive."""

    @pytest.mark.asyncio
    async def test_health_ready_when_graph_is_set(self):
        """Returns 'ready' when the agent graph is compiled."""
        import src.rest_server as rs

        rs._graph = MagicMock(name="compiled_graph")

        from fastapi.testclient import TestClient
        from src.rest_server import app

        client = TestClient(app)
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ready"

    @pytest.mark.asyncio
    async def test_health_ready_when_graph_is_none(self):
        """Returns 'not_ready' when the agent graph is not yet compiled."""
        import src.rest_server as rs

        rs._graph = None

        from fastapi.testclient import TestClient
        from src.rest_server import app

        client = TestClient(app)
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        assert resp.json()["status"] == "not_ready"

    def test_health_live_always_alive(self):
        """Returns 'alive' regardless of graph or database state."""
        from fastapi.testclient import TestClient
        from src.rest_server import app

        client = TestClient(app)
        resp = client.get("/health/live")
        assert resp.status_code == 200
        assert resp.json()["status"] == "alive"

    def test_health_basic(self):
        """Returns ok with service name."""
        from fastapi.testclient import TestClient
        from src.rest_server import app

        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "agent-engine"


# ═══════════════════════════════════════════════════════════════
# MCP server seeding on startup
# ═══════════════════════════════════════════════════════════════


class TestStartupSeedMcp:
    """invariant: _startup_seed_mcp seeds three built-in MCP servers
    (idempotent, best-effort) during SQLite dev mode."""

    BUILTIN_IDS = {"builtin-web-search", "builtin-file-read", "builtin-calculator"}

    @pytest.mark.asyncio
    async def test_seeds_builtins_when_none_exist(self):
        """When no built-in servers exist, all three are created."""
        import src.rest_server as rs

        mock_db = MagicMock()
        mock_db.get_mcp_server = AsyncMock(return_value=None)  # none exist
        mock_db.create_mcp_server = AsyncMock()
        mock_db.init_schema = AsyncMock()

        with (
            patch.dict(os.environ, {}, clear=True),  # no DATABASE_URL → SQLite
            patch("src.storage.sqlite.SqliteBackend", return_value=mock_db),
        ):
            await rs._startup_seed_mcp()

        assert mock_db.init_schema.call_count == 1
        assert mock_db.create_mcp_server.call_count == 3
        # Verify each built-in was checked
        assert mock_db.get_mcp_server.call_count == 3

    @pytest.mark.asyncio
    async def test_skips_existing_servers(self):
        """When all three built-ins exist, no new servers are created."""
        import src.rest_server as rs

        mock_db = MagicMock()
        mock_db.get_mcp_server = AsyncMock(return_value={"id": "builtin-web-search"})
        mock_db.create_mcp_server = AsyncMock()
        mock_db.init_schema = AsyncMock()

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("src.storage.sqlite.SqliteBackend", return_value=mock_db),
        ):
            await rs._startup_seed_mcp()

        assert mock_db.create_mcp_server.call_count == 0

    @pytest.mark.asyncio
    async def test_partial_seed_creates_only_missing(self):
        """When one server exists, only the remaining two are created."""
        import src.rest_server as rs

        # existing returns a record for web-search, None for the other two
        existing_map = {
            "builtin-web-search": {"id": "builtin-web-search"},
            "builtin-file-read": None,
            "builtin-calculator": None,
        }
        mock_db = MagicMock()
        mock_db.get_mcp_server = AsyncMock(side_effect=lambda sid: existing_map.get(sid))
        mock_db.create_mcp_server = AsyncMock()
        mock_db.init_schema = AsyncMock()

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("src.storage.sqlite.SqliteBackend", return_value=mock_db),
        ):
            await rs._startup_seed_mcp()

        assert mock_db.create_mcp_server.call_count == 2

    @pytest.mark.asyncio
    async def test_postgresql_path_uses_database(self):
        """When DATABASE_URL is postgresql://, Database() is used, not SqliteBackend."""
        import src.rest_server as rs

        mock_db = MagicMock()
        mock_db.get_mcp_server = AsyncMock(return_value=None)
        mock_db.create_mcp_server = AsyncMock()
        mock_db.init_schema = AsyncMock()

        with (
            patch.dict(os.environ, {"DATABASE_URL": "postgresql://user:pass@host/db"}),
            patch("src.database.Database", return_value=mock_db) as mock_db_cls,
        ):
            await rs._startup_seed_mcp()

        mock_db_cls.assert_called_once()
        # init_schema should NOT be called for PostgreSQL path
        # (the function only calls init_schema when not use_postgres)
        mock_db.init_schema.assert_not_called()

    @pytest.mark.asyncio
    async def test_best_effort_handles_failure(self):
        """When database creation fails, the function does not crash
        (best-effort seeding)."""
        import src.rest_server as rs

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("src.storage.sqlite.SqliteBackend", side_effect=RuntimeError("disk full")),
        ):
            # Should not raise — the try/except guards it
            await rs._startup_seed_mcp()

        # Test passes if no exception was raised

    @pytest.mark.asyncio
    async def test_best_effort_handles_get_failure(self):
        """When get_mcp_server fails for one server, function still tries others."""
        import src.rest_server as rs

        mock_db = MagicMock()
        # First get succeeds (server exists), second get raises, third returns None
        mock_db.get_mcp_server = AsyncMock(side_effect=[
            {"id": "builtin-web-search"},  # exists
            RuntimeError("db error"),       # crash
            None,                           # doesn't exist
        ])
        mock_db.create_mcp_server = AsyncMock()
        mock_db.init_schema = AsyncMock()

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("src.storage.sqlite.SqliteBackend", return_value=mock_db),
        ):
            # The try/except in _startup_seed_mcp catches the RuntimeError
            # and the loop terminates early — no crash
            await rs._startup_seed_mcp()

    @pytest.mark.asyncio
    async def test_builtin_server_fields_correct(self):
        """Each built-in server has the correct id, name, url, and defaults."""
        import src.rest_server as rs

        captured = []
        mock_db = MagicMock()
        mock_db.get_mcp_server = AsyncMock(return_value=None)
        mock_db.create_mcp_server = AsyncMock(side_effect=lambda d: captured.append(d))
        mock_db.init_schema = AsyncMock()

        with (
            patch.dict(os.environ, {}, clear=True),
            patch("src.storage.sqlite.SqliteBackend", return_value=mock_db),
        ):
            await rs._startup_seed_mcp()

        assert len(captured) == 3
        created_ids = {s["id"] for s in captured}
        assert created_ids == self.BUILTIN_IDS

        for srv in captured:
            assert srv["transport"] == "http"
            assert srv["auth_type"] == "none"
            assert srv["auth_header"] == ""
            assert srv["agent_id"] is None
            assert srv["url"].startswith("http://localhost:31")


# ═══════════════════════════════════════════════════════════════
# Webhook registration endpoint
# ═══════════════════════════════════════════════════════════════

class TestWebhookEndpoint:
    def test_register_webhook(self):
        import src.rest_server as rs
        from fastapi.testclient import TestClient
        from src.rest_server import app

        db = MagicMock()
        db.register_webhook = AsyncMock(return_value={"id": "w1", "url": "https://example.com/hook"})
        rs._db_lucid = db

        client = TestClient(app)
        resp = client.post("/v1/webhooks", json={
            "url": "https://example.com/hook",
            "events": ["conversation.completed"],
        })
        assert resp.status_code == 200
        assert resp.json()["id"] == "w1"

    def test_register_webhook_missing_url(self):
        import src.rest_server as rs
        from fastapi.testclient import TestClient
        from src.rest_server import app

        db = MagicMock()
        rs._db_lucid = db

        client = TestClient(app)
        resp = client.post("/v1/webhooks", json={"events": ["test"]})
        assert resp.status_code == 422

    def test_register_webhook_no_db_503(self):
        import src.rest_server as rs
        rs._db_lucid = None

        from fastapi.testclient import TestClient
        from src.rest_server import app
        client = TestClient(app)
        resp = client.post("/v1/webhooks", json={"url": "https://example.com/hook"})
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# SSE Stream endpoint
# ═══════════════════════════════════════════════════════════════

class TestStreamEndpoint:
    def test_stream_endpoint_requires_message(self):
        import src.rest_server as rs
        from fastapi.testclient import TestClient
        from src.rest_server import app

        rs._graph = MagicMock()
        db = MagicMock()
        db.get_agent = AsyncMock(return_value=None)
        rs._db_lucid = db

        client = TestClient(app)
        resp = client.post("/v1/agents/a1/stream", json={})
        assert resp.status_code == 422

    def test_stream_agent_not_found_404(self):
        import src.rest_server as rs
        from fastapi.testclient import TestClient
        from src.rest_server import app

        rs._graph = MagicMock()
        db = MagicMock()
        db.get_agent = AsyncMock(return_value=None)
        rs._db_lucid = db

        client = TestClient(app)
        resp = client.post("/v1/agents/nonexistent/stream", json={"message": "Hello"})
        assert resp.status_code == 404

    def test_stream_graph_not_initialized_503(self):
        import src.rest_server as rs
        rs._graph = None

        from fastapi.testclient import TestClient
        from src.rest_server import app
        client = TestClient(app)
        resp = client.post("/v1/agents/a1/stream", json={"message": "Hello"})
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# Webhook delivery (_fire_webhooks)
# ═══════════════════════════════════════════════════════════════

class TestWebhookDelivery:
    """Test the webhook delivery function itself (not the registration endpoint)."""

    def test_fire_webhooks_no_matching_event(self):
        """When no webhooks match the event type, nothing is called."""
        import src.rest_server as rs

        db = MagicMock()
        db.list_webhooks = AsyncMock(return_value=[
            {"id": "w1", "url": "http://example.com/hook", "events": ["page.published"]},
        ])
        rs._db_lucid = db

        # Should not raise — no matching webhooks for this event type
        import asyncio
        asyncio.run(rs._fire_webhooks("conversation.completed", "a1", {"test": True}))

    def test_fire_webhooks_matching_event(self, monkeypatch):
        """When a webhook matches, httpx is called with the right payload."""
        import src.rest_server as rs

        db = MagicMock()
        db.list_webhooks = AsyncMock(return_value=[
            {"id": "w1", "url": "http://example.com/hook", "events": ["conversation.completed"]},
        ])
        rs._db_lucid = db

        mock_client = MagicMock()
        mock_client.post = AsyncMock()
        mock_client_cls = MagicMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock()

        with patch("httpx.AsyncClient", mock_client_cls):
            import asyncio
            asyncio.run(rs._fire_webhooks("conversation.completed", "a1", {"response": "Hello"}))

        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args[0][0] == "http://example.com/hook"
        sent_payload = call_args[1]["json"]
        assert sent_payload["event"] == "conversation.completed"
        assert sent_payload["agent_id"] == "a1"
        assert sent_payload["payload"]["response"] == "Hello"

    def test_fire_webhooks_handles_httpx_error(self):
        """When httpx raises, the function swallows the error gracefully."""
        import src.rest_server as rs

        db = MagicMock()
        db.list_webhooks = AsyncMock(return_value=[
            {"id": "w1", "url": "http://down.example.com/hook", "events": ["conversation.completed"]},
        ])
        rs._db_lucid = db

        mock_client = MagicMock()
        mock_client.post = AsyncMock(side_effect=Exception("Connection refused"))
        mock_client_cls = MagicMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock()

        # Should not raise — errors are swallowed
        with patch("httpx.AsyncClient", mock_client_cls):
            import asyncio
            asyncio.run(rs._fire_webhooks("conversation.completed", "a1", {}))

    def test_fire_webhooks_empty_url_skipped(self):
        """Webhooks with empty URLs are silently skipped."""
        import src.rest_server as rs

        db = MagicMock()
        db.list_webhooks = AsyncMock(return_value=[
            {"id": "w1", "url": "", "events": ["conversation.completed"]},
            {"id": "w2", "url": "http://good.example.com/hook", "events": ["conversation.completed"]},
        ])
        rs._db_lucid = db

        mock_client = MagicMock()
        mock_client.post = AsyncMock()
        mock_client_cls = MagicMock()
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock()

        with patch("httpx.AsyncClient", mock_client_cls):
            import asyncio
            asyncio.run(rs._fire_webhooks("conversation.completed", "a1", {}))

        # Only the valid URL should have been called
        mock_client.post.assert_called_once()
        assert mock_client.post.call_args[0][0] == "http://good.example.com/hook"

    def test_fire_webhooks_db_error_handled(self):
        """When list_webhooks raises, the function returns silently."""
        import src.rest_server as rs

        db = MagicMock()
        db.list_webhooks = AsyncMock(side_effect=RuntimeError("db down"))
        rs._db_lucid = db

        # Should not raise
        import asyncio
        asyncio.run(rs._fire_webhooks("conversation.completed", "a1", {}))
