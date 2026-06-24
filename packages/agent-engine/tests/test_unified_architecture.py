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
