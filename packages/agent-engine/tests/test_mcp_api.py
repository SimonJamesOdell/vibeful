"""Tests for MCP server REST API endpoints.

Covers:
- GET /v1/mcp-servers — list all, filter by agent_id
- POST /v1/mcp-servers — create with valid/invalid data
- GET /v1/mcp-servers/{sid} — get existing, 404 on missing
- DELETE /v1/mcp-servers/{sid} — delete existing, 404 on missing
- GET /v1/mcp-servers/health — probe health of registered servers
- POST /v1/mcp-servers/builtin/start — docker compose up
- POST /v1/mcp-servers/builtin/stop — docker compose stop
- POST /v1/mcp-servers/{sid}/start — single server start
- POST /v1/mcp-servers/{sid}/stop — single server stop
- McpServerCreateRequest model: defaults, required fields validation
- 503 when database not initialized (_require_db guard)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest

import src.rest_server as rs
from fastapi.testclient import TestClient
from src.rest_server import app, McpServerCreateRequest


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def _clean_globals():
    """Reset module-level state before each test."""
    rs._db_lucid = None
    rs._graph = None
    yield
    rs._db_lucid = None
    rs._graph = None


def _mock_db(**overrides):
    """Create a mock database with defaults suitable for MCP CRUD."""
    db = MagicMock()
    db.get_mcp_server = AsyncMock(return_value=None)
    db.list_mcp_servers = AsyncMock(return_value=[])
    db.create_mcp_server = AsyncMock(return_value={"id": "mock-id", "name": "mock", "url": "http://x"})
    db.delete_mcp_server = AsyncMock(return_value=True)
    for k, v in overrides.items():
        setattr(db, k, v)
    rs._db_lucid = db
    return db


# ═══════════════════════════════════════════════════════════════
# McpServerCreateRequest model
# ═══════════════════════════════════════════════════════════════

class TestMcpServerCreateRequest:
    def test_valid_minimal(self):
        """Only name and url are required."""
        req = McpServerCreateRequest(name="test", url="http://localhost")
        assert req.name == "test"
        assert req.url == "http://localhost"
        assert req.transport == "http"
        assert req.auth_type == "none"
        assert req.auth_header == ""
        assert req.agent_id is None

    def test_all_defaults(self):
        """All optional fields have sensible defaults."""
        req = McpServerCreateRequest(name="x", url="http://x")
        data = req.model_dump()
        assert data["transport"] == "http"
        assert data["auth_type"] == "none"
        assert data["auth_header"] == ""
        assert data["agent_id"] is None

    def test_with_agent_id(self):
        """agent_id is accepted when provided."""
        req = McpServerCreateRequest(name="x", url="http://x", agent_id="agent-1")
        assert req.agent_id == "agent-1"

    def test_with_auth(self):
        """auth_type and auth_header are accepted."""
        req = McpServerCreateRequest(
            name="x", url="http://x",
            auth_type="bearer",
            auth_header="Bearer secret",
        )
        assert req.auth_type == "bearer"
        assert req.auth_header == "Bearer secret"

    def test_with_transport(self):
        """transport is accepted."""
        req = McpServerCreateRequest(name="x", url="http://x", transport="sse")
        assert req.transport == "sse"

    def test_name_required(self):
        """name is required — validated by Pydantic."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            McpServerCreateRequest(url="http://x")

    def test_url_required(self):
        """url is required — validated by Pydantic."""
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            McpServerCreateRequest(name="x")


# ═══════════════════════════════════════════════════════════════
# GET /v1/mcp-servers
# ═══════════════════════════════════════════════════════════════

class TestListMcpServers:
    def test_list_empty(self):
        """Returns empty list when no servers exist."""
        _mock_db(list_mcp_servers=AsyncMock(return_value=[]))
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_servers(self):
        """Returns list of servers."""
        servers = [
            {"id": "s1", "name": "alpha", "url": "http://a"},
            {"id": "s2", "name": "beta", "url": "http://b"},
        ]
        _mock_db(list_mcp_servers=AsyncMock(return_value=servers))
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2
        assert data[0]["id"] == "s1"
        assert data[1]["id"] == "s2"

    def test_list_filter_by_agent_id(self):
        """Passes agent_id query param to backend."""
        mock = _mock_db(list_mcp_servers=AsyncMock(return_value=[]))
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers?agent_id=agent-42")
        assert resp.status_code == 200
        mock.list_mcp_servers.assert_called_once_with("agent-42")

    def test_list_no_db_returns_503(self):
        """When database is not initialized, returns 503."""
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers")
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# POST /v1/mcp-servers
# ═══════════════════════════════════════════════════════════════

class TestCreateMcpServer:
    def test_create_valid(self):
        """Valid request creates an MCP server."""
        created = {"id": "new-id", "name": "my-server", "url": "https://mcp.example.com"}
        mock = _mock_db(create_mcp_server=AsyncMock(return_value=created))
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers", json={
            "name": "my-server",
            "url": "https://mcp.example.com",
        })
        assert resp.status_code == 200
        assert resp.json() == created
        mock.create_mcp_server.assert_called_once()

    def test_create_with_all_fields(self):
        """All optional fields are passed through."""
        created = {"id": "new-id", "name": "full", "url": "https://mcp.example.com",
                   "transport": "sse", "auth_type": "bearer", "auth_header": "Bearer x", "agent_id": "a1"}
        mock = _mock_db(create_mcp_server=AsyncMock(return_value=created))
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers", json={
            "name": "full",
            "url": "https://mcp.example.com",
            "transport": "sse",
            "auth_type": "bearer",
            "auth_header": "Bearer x",
            "agent_id": "a1",
        })
        assert resp.status_code == 200
        call_data = mock.create_mcp_server.call_args[0][0]
        assert call_data["name"] == "full"
        assert call_data["transport"] == "sse"
        assert call_data["auth_type"] == "bearer"

    def test_create_missing_name(self):
        """422 when name is missing."""
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers", json={"url": "http://x"})
        assert resp.status_code == 422

    def test_create_missing_url(self):
        """422 when url is missing."""
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers", json={"name": "test"})
        assert resp.status_code == 422

    def test_create_no_db_returns_503(self):
        """503 when database not initialized."""
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers", json={"name": "test", "url": "http://x"})
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# GET /v1/mcp-servers/{sid}
# ═══════════════════════════════════════════════════════════════

class TestGetMcpServer:
    def test_get_existing(self):
        """Returns the server when found."""
        server = {"id": "s1", "name": "found", "url": "http://x"}
        _mock_db(get_mcp_server=AsyncMock(return_value=server))
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers/s1")
        assert resp.status_code == 200
        assert resp.json() == server

    def test_get_not_found(self):
        """Returns 404 when server does not exist."""
        _mock_db(get_mcp_server=AsyncMock(return_value=None))
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers/nonexistent")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_get_no_db_returns_503(self):
        """503 when database not initialized."""
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers/s1")
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# DELETE /v1/mcp-servers/{sid}
# ═══════════════════════════════════════════════════════════════

class TestDeleteMcpServer:
    def test_delete_existing(self):
        """Returns status: deleted when server exists."""
        _mock_db(delete_mcp_server=AsyncMock(return_value=True))
        client = TestClient(app)
        resp = client.delete("/v1/mcp-servers/s1")
        assert resp.status_code == 200
        assert resp.json() == {"status": "deleted"}

    def test_delete_not_found(self):
        """Returns 404 when server does not exist."""
        _mock_db(delete_mcp_server=AsyncMock(return_value=False))
        client = TestClient(app)
        resp = client.delete("/v1/mcp-servers/nonexistent")
        assert resp.status_code == 404

    def test_delete_no_db_returns_503(self):
        """503 when database not initialized."""
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.delete("/v1/mcp-servers/s1")
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# GET /v1/mcp-servers/health
# ═══════════════════════════════════════════════════════════════

class TestMcpHealthCheck:
    def test_health_all_healthy(self):
        """Returns health status for each registered server."""
        servers = [
            {"id": "s1", "name": "alpha", "url": "http://localhost:3100"},
            {"id": "s2", "name": "beta",  "url": "http://localhost:3101"},
        ]
        _mock_db(list_mcp_servers=AsyncMock(return_value=servers))

        # Mock httpx to return 200 for all health probes
        mock_response = MagicMock()
        mock_response.status_code = 200

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            client = TestClient(app)
            resp = client.get("/v1/mcp-servers/health")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 2
            assert data[0]["healthy"] is True
            assert data[1]["healthy"] is True

    def test_health_some_unhealthy(self):
        """Servers that fail health probes report unhealthy with error."""
        servers = [
            {"id": "s1", "name": "alpha", "url": "http://localhost:3100"},
        ]
        _mock_db(list_mcp_servers=AsyncMock(return_value=servers))

        mock_response = MagicMock()
        mock_response.status_code = 500  # unhealthy

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            client = TestClient(app)
            resp = client.get("/v1/mcp-servers/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data[0]["healthy"] is False

    def test_health_connection_error(self):
        """When server is unreachable, error is captured."""
        servers = [
            {"id": "s1", "name": "alpha", "url": "http://localhost:3100"},
        ]
        _mock_db(list_mcp_servers=AsyncMock(return_value=servers))

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_client = MagicMock()
            mock_client.get = AsyncMock(side_effect=Exception("Connection refused"))
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            client = TestClient(app)
            resp = client.get("/v1/mcp-servers/health")
            assert resp.status_code == 200
            data = resp.json()
            assert data[0]["healthy"] is False
            assert data[0]["error"] is not None

    def test_health_empty_list(self):
        """When no servers registered, returns empty list."""
        _mock_db(list_mcp_servers=AsyncMock(return_value=[]))
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers/health")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_health_no_db_returns_503(self):
        """503 when database not initialized."""
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.get("/v1/mcp-servers/health")
        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════
# POST /v1/mcp-servers/builtin/start and /stop
# ═══════════════════════════════════════════════════════════════

class TestBuiltinStartStop:
    def test_start_success(self):
        """Returns started when docker compose succeeds."""
        _mock_db()
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Container started\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin/start")
            assert resp.status_code == 200
            assert resp.json()["status"] == "started"
            mock_run.assert_called_once()

    def test_start_failure(self):
        """Returns failed when docker compose returns non-zero."""
        _mock_db()
        mock_result = MagicMock()
        mock_result.returncode = 1
        mock_result.stderr = "Error: no such service"

        with patch("subprocess.run", return_value=mock_result):
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin/start")
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "failed"

    def test_start_docker_not_found(self):
        """Returns unavailable when docker is not installed."""
        _mock_db()
        with patch("subprocess.run", side_effect=FileNotFoundError):
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin/start")
            assert resp.status_code == 200
            assert resp.json()["status"] == "unavailable"

    def test_stop_success(self):
        """Returns stopped when docker compose stop succeeds."""
        _mock_db()
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Container stopped\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin/stop")
            assert resp.status_code == 200
            assert resp.json()["status"] == "stopped"
            mock_run.assert_called_once()

    def test_stop_docker_not_found(self):
        """Returns unavailable when docker is not installed."""
        _mock_db()
        with patch("subprocess.run", side_effect=FileNotFoundError):
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin/stop")
            assert resp.status_code == 200
            assert resp.json()["status"] == "unavailable"


# ═══════════════════════════════════════════════════════════════
# POST /v1/mcp-servers/{sid}/start and /stop
# ═══════════════════════════════════════════════════════════════

class TestSingleServerStartStop:
    def test_start_known_server(self):
        """Start a known built-in server by id."""
        _mock_db()
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Started\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin-web-search/start")
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"
            # Verify the correct docker compose service was called with -d
            args = mock_run.call_args[0][0]
            assert args[0] == "docker"
            assert "-d" in args  # detached — prevents hang
            assert "mcp-web-search" in args

    def test_start_unknown_server(self):
        """400 when server id is not in BUILTIN_SERVICE_MAP."""
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers/unknown-server/start")
        assert resp.status_code == 400
        assert "No docker-compose service mapping" in resp.json()["detail"]

    def test_stop_known_server(self):
        """Stop a known built-in server by id."""
        _mock_db()
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Stopped\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin-calculator/stop")
            assert resp.status_code == 200
            assert resp.json()["status"] == "ok"
            args = mock_run.call_args[0][0]
            assert "-d" not in args  # stop doesn't need detached
            assert "mcp-calculator" in args

    def test_stop_unknown_server(self):
        """400 when server id is not in BUILTIN_SERVICE_MAP."""
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/mcp-servers/unknown-server/stop")
        assert resp.status_code == 400

    def test_start_file_read_server(self):
        """Start builtin-file-read maps to mcp-file-read service."""
        _mock_db()
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "Started\n"

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            client = TestClient(app)
            resp = client.post("/v1/mcp-servers/builtin-file-read/start")
            assert resp.status_code == 200
            args = mock_run.call_args[0][0]
            assert "-d" in args  # detached — prevents hang
            assert "mcp-file-read" in args
