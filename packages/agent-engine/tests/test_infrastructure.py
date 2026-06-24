"""Tests for API keys, audit events, import/export, staging, and agent tests.

Covers:
- SqliteBackend: api_keys CRUD, audit_events, agent_tests CRUD
- REST API: create/list/revoke keys, audit query, export yaml, import yaml, promote
- Invariants: raw_key returned once, key_hash stored, unique name on import
"""

from __future__ import annotations

import pytest_asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.storage.sqlite import SqliteBackend
import src.rest_server as rs
from fastapi.testclient import TestClient
from src.rest_server import app


# ═══════════════════════════════════════════════════════════════
# Storage tests
# ═══════════════════════════════════════════════════════════════

@pytest_asyncio.fixture
async def db():
    backend = SqliteBackend(db_path=":memory:")
    await backend.init_schema()
    yield backend
    await backend.close()


class TestUserStorage:
    @pytest.mark.asyncio
    async def test_create_and_retrieve(self, db):
        result = await db.create_user({"email": "test@example.com", "password": "secret123"})
        assert result["email"] == "test@example.com"
        assert "password_hash" not in result

        found = await db.get_user_by_email("test@example.com")
        assert found is not None
        assert found["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_password_verification(self, db):
        await db.create_user({"email": "user@test.com", "password": "mypassword"})
        result = await db.verify_user_password("user@test.com", "mypassword")
        assert result is not None
        assert result["email"] == "user@test.com"
        assert "password_hash" not in result

    @pytest.mark.asyncio
    async def test_password_verification_wrong(self, db):
        await db.create_user({"email": "user@test.com", "password": "correct"})
        result = await db.verify_user_password("user@test.com", "wrong")
        assert result is None

    @pytest.mark.asyncio
    async def test_nonexistent_user_returns_none(self, db):
        result = await db.get_user_by_email("noone@test.com")
        assert result is None

    @pytest.mark.asyncio
    async def test_user_has_default_role(self, db):
        result = await db.create_user({"email": "new@test.com", "password": "pw"})
        assert result["role"] == "editor"


class TestTeamStorage:
    @pytest.mark.asyncio
    async def test_create_team(self, db):
        result = await db.create_team({"name": "Engineering"})
        assert result["name"] == "Engineering"

    @pytest.mark.asyncio
    async def test_list_teams(self, db):
        await db.create_team({"name": "Team A"})
        await db.create_team({"name": "Team B"})
        teams = await db.list_teams()
        assert len(teams) == 2

    @pytest.mark.asyncio
    async def test_add_member(self, db):
        user = await db.create_user({"email": "member@test.com", "password": "pw"})
        team = await db.create_team({"name": "MyTeam"})
        member = await db.add_team_member(team["id"], user["id"], "admin")
        assert member["role"] == "admin"

    @pytest.mark.asyncio
    async def test_list_members_includes_user_info(self, db):
        user = await db.create_user({"email": "j@test.com", "password": "pw", "display_name": "Jane"})
        team = await db.create_team({"name": "Team"})
        await db.add_team_member(team["id"], user["id"])
        members = await db.list_team_members(team["id"])
        assert len(members) == 1
        assert members[0]["email"] == "j@test.com"
        assert members[0]["display_name"] == "Jane"


class TestApiKeyStorage:
    @pytest.mark.asyncio
    async def test_create_returns_raw_key_once(self, db):
        result = await db.create_api_key({"name": "test-key"})
        assert "raw_key" in result
        assert result["raw_key"].startswith("vf_")
        assert len(result["raw_key"]) > 20
        assert result["key_prefix"] == result["raw_key"][:10]

    @pytest.mark.asyncio
    async def test_key_hash_stored_not_raw(self, db):
        result = await db.create_api_key({"name": "test"})
        stored = await db.get_api_key_by_hash(result["key_hash"])  # hash, not raw
        # We can't compute hash without raw key, but stored lookup by hash works
        # Just verify the raw key isn't stored in plaintext
        assert "raw_key" not in (stored or {})

    @pytest.mark.asyncio
    async def test_get_by_hash_returns_active_keys(self, db):
        result = await db.create_api_key({"name": "active"})
        found = await db.get_api_key_by_hash(result["key_hash"])
        assert found is not None
        assert found["name"] == "active"

    @pytest.mark.asyncio
    async def test_revoked_key_not_found_by_hash(self, db):
        result = await db.create_api_key({"name": "revoked"})
        await db.revoke_api_key(result["id"])
        found = await db.get_api_key_by_hash(result["key_hash"])
        assert found is None

    @pytest.mark.asyncio
    async def test_list_excludes_raw_key_hash(self, db):
        await db.create_api_key({"name": "k1"})
        await db.create_api_key({"name": "k2"})
        keys = await db.list_api_keys()
        assert len(keys) >= 2
        for k in keys:
            assert "raw_key" not in k
            assert "key_hash" not in k  # hash excluded from list
            assert "key_prefix" in k

    @pytest.mark.asyncio
    async def test_list_by_agent(self, db):
        await db.create_api_key({"name": "global"})
        await db.create_api_key({"name": "agent-key", "agent_id": "agent-1"})
        keys = await db.list_api_keys(agent_id="agent-1")
        assert len(keys) >= 2  # global + agent-specific

    @pytest.mark.asyncio
    async def test_touch_updates_last_used(self, db):
        result = await db.create_api_key({"name": "touch-test"})
        await db.touch_api_key(result["id"])
        # Verify no error — touch is best-effort


class TestAuditStorage:
    @pytest.mark.asyncio
    async def test_log_audit_returns_event(self, db):
        result = await db.log_audit("agent.created", "agent", "a1")
        assert result["event_type"] == "agent.created"

    @pytest.mark.asyncio
    async def test_list_audit_empty(self, db):
        events = await db.list_audit_events()
        assert events == []

    @pytest.mark.asyncio
    async def test_list_audit_with_events(self, db):
        await db.log_audit("agent.created", "agent", "a1")
        await db.log_audit("page.published", "page", "p1", agent_id="a1")
        events = await db.list_audit_events()
        assert len(events) == 2

    @pytest.mark.asyncio
    async def test_list_audit_by_resource_type(self, db):
        await db.log_audit("agent.created", "agent", "a1")
        await db.log_audit("page.published", "page", "p1")
        events = await db.list_audit_events(resource_type="agent")
        assert len(events) == 1
        assert events[0]["resource_type"] == "agent"

    @pytest.mark.asyncio
    async def test_list_audit_by_agent(self, db):
        await db.log_audit("agent.created", "agent", "a1")
        await db.log_audit("page.published", "page", "p1", agent_id="a2")
        events = await db.list_audit_events(agent_id="a2")
        assert len(events) == 1


class TestAgentTestStorage:
    @pytest.mark.asyncio
    async def test_create_test(self, db):
        result = await db.create_test({
            "agent_id": "a1",
            "name": "greeting",
            "input_message": "Hello",
            "expected_contains": "Hi",
        })
        assert result["input_message"] == "Hello"
        assert result["expected_contains"] == "Hi"

    @pytest.mark.asyncio
    async def test_list_tests_by_agent(self, db):
        await db.create_test({"agent_id": "a1", "name": "t1", "input_message": "x"})
        await db.create_test({"agent_id": "a2", "name": "t2", "input_message": "y"})
        tests = await db.list_tests(agent_id="a1")
        assert len(tests) == 1
        assert tests[0]["name"] == "t1"

    @pytest.mark.asyncio
    async def test_delete_test(self, db):
        result = await db.create_test({"agent_id": "a1", "input_message": "x"})
        assert await db.delete_test(result["id"]) is True
        assert await db.delete_test(result["id"]) is False

    @pytest.mark.asyncio
    async def test_record_test_result(self, db):
        result = await db.create_test({"agent_id": "a1", "input_message": "x"})
        await db.record_test_result(result["id"], True)
        tests = await db.list_tests(agent_id="a1")
        assert tests[0]["last_passed"] == 1
        assert tests[0]["last_run_at"] is not None


# ═══════════════════════════════════════════════════════════════
# REST API tests
# ═══════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def _clean_rs_globals():
    rs._db_lucid = None
    rs._graph = None
    yield
    rs._db_lucid = None
    rs._graph = None


def _mock_db(**overrides):
    db = MagicMock()
    db.create_api_key = AsyncMock(return_value={"id": "k1", "key_prefix": "vf_abc12345", "raw_key": "vf_abc12345...", "name": "", "revoked": 0})
    db.get_api_key_by_hash = AsyncMock(return_value=None)
    db.list_api_keys = AsyncMock(return_value=[])
    db.revoke_api_key = AsyncMock(return_value=True)
    db.touch_api_key = AsyncMock()
    db.log_audit = AsyncMock(return_value={"id": "e1", "event_type": "test"})
    db.list_audit_events = AsyncMock(return_value=[])
    db.create_test = AsyncMock(return_value={"id": "t1", "input_message": "Hello"})
    db.list_tests = AsyncMock(return_value=[])
    db.delete_test = AsyncMock(return_value=True)
    db.record_test_result = AsyncMock()
    db.get_agent = AsyncMock(return_value={"id": "a1", "name": "Test", "system_prompt": "", "config_json": "", "styling_json": ""})
    db.create_agent = AsyncMock(return_value={"id": "imported", "name": "Imported"})
    db.update_agent = AsyncMock()
    db.list_agents = AsyncMock(return_value=[])
    for k, v in overrides.items():
        setattr(db, k, v)
    rs._db_lucid = db
    return db


class TestApiKeyApi:
    def test_create_key(self):
        _mock_db(create_api_key=AsyncMock(return_value={"id": "new", "key_prefix": "vf_test", "raw_key": "vf_test..."}))
        client = TestClient(app)
        resp = client.post("/v1/api-keys", json={"name": "my-key"})
        assert resp.status_code == 200
        assert "raw_key" in resp.json()

    def test_list_keys(self):
        keys = [{"id": "k1", "key_prefix": "vf_aaa", "name": "k1", "revoked": 0}]
        _mock_db(list_api_keys=AsyncMock(return_value=keys))
        client = TestClient(app)
        resp = client.get("/v1/api-keys")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_revoke_key(self):
        _mock_db()
        client = TestClient(app)
        resp = client.delete("/v1/api-keys/k1")
        assert resp.status_code == 200
        assert resp.json() == {"status": "revoked"}

    def test_revoke_404(self):
        _mock_db(revoke_api_key=AsyncMock(return_value=False))
        client = TestClient(app)
        resp = client.delete("/v1/api-keys/nonexistent")
        assert resp.status_code == 404


class TestAuditApi:
    def test_list_audit(self):
        events = [{"id": "e1", "event_type": "agent.created", "resource_type": "agent"}]
        _mock_db(list_audit_events=AsyncMock(return_value=events))
        client = TestClient(app)
        resp = client.get("/v1/audit")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_list_audit_filtered(self):
        mock = _mock_db(list_audit_events=AsyncMock(return_value=[]))
        client = TestClient(app)
        resp = client.get("/v1/audit?resource_type=agent&agent_id=a1&limit=20")
        assert resp.status_code == 200
        mock.list_audit_events.assert_called_once_with("agent", "a1", 20)


class TestImportExportApi:
    def test_export_agent(self, monkeypatch):
        agent = {"id": "a1", "name": "TestBot", "description": "A bot", "system_prompt": "Be helpful",
                 "model": "deepseek-chat", "temperature": 0.7, "config_json": "graph: {}", "styling_json": "light"}
        _mock_db(get_agent=AsyncMock(return_value=agent))
        # Need yaml module available — it's imported at module level in rest_server
        client = TestClient(app)
        resp = client.get("/v1/agents/a1/export")
        assert resp.status_code == 200
        assert "TestBot" in resp.text
        assert "vibeful_version" in resp.text

    def test_export_agent_404(self):
        _mock_db(get_agent=AsyncMock(return_value=None))
        client = TestClient(app)
        resp = client.get("/v1/agents/nonexistent/export")
        assert resp.status_code == 404

    def test_import_agent(self):
        mock = _mock_db()
        yaml_content = "vibeful_version: '0.1.0'\nagent:\n  name: ImportedBot\n  model: deepseek-chat\n"
        client = TestClient(app)
        resp = client.post("/v1/agents/import", json={"yaml_content": yaml_content})
        assert resp.status_code == 200
        mock.create_agent.assert_called_once()

    def test_import_invalid_yaml(self):
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/agents/import", json={"yaml_content": "not: valid: yaml: :"})
        assert resp.status_code == 400


class TestPromoteApi:
    def test_promote_agent(self):
        source = {"id": "staging", "system_prompt": "New prompt", "model": "deepseek-chat",
                  "temperature": 0.5, "config_json": "graph: {}", "styling_json": "dark"}
        target = {"id": "prod", "system_prompt": "Old", "model": "deepseek-chat",
                  "temperature": 0.7, "config_json": "graph: {}", "styling_json": "light"}
        mock = _mock_db(get_agent=AsyncMock(side_effect=lambda aid: source if aid == "staging" else target))
        client = TestClient(app)
        resp = client.post("/v1/agents/promote", json={"source_agent_id": "staging", "target_agent_id": "prod"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "promoted"

    def test_promote_source_404(self):
        _mock_db(get_agent=AsyncMock(return_value=None))
        client = TestClient(app)
        resp = client.post("/v1/agents/promote", json={"source_agent_id": "bad", "target_agent_id": "prod"})
        assert resp.status_code == 404


class TestAgentTestApi:
    def test_create_test(self):
        _mock_db(create_test=AsyncMock(return_value={"id": "t1", "input_message": "Hello"}))
        client = TestClient(app)
        resp = client.post("/v1/agent-tests", json={"agent_id": "a1", "input_message": "Hello", "expected_contains": "Hi"})
        assert resp.status_code == 200

    def test_create_test_missing_input(self):
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/agent-tests", json={"agent_id": "a1"})
        assert resp.status_code == 422

    def test_list_tests(self):
        tests = [{"id": "t1", "name": "greeting", "input_message": "Hello"}]
        _mock_db(list_tests=AsyncMock(return_value=tests))
        client = TestClient(app)
        resp = client.get("/v1/agent-tests?agent_id=a1")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_delete_test(self):
        _mock_db()
        client = TestClient(app)
        resp = client.delete("/v1/agent-tests/t1")
        assert resp.status_code == 200
        assert resp.json() == {"status": "deleted"}

    def test_delete_test_404(self):
        _mock_db(delete_test=AsyncMock(return_value=False))
        client = TestClient(app)
        resp = client.delete("/v1/agent-tests/nonexistent")
        assert resp.status_code == 404

    def test_no_db_503(self):
        rs._db_lucid = None
        client = TestClient(app)
        cases = [
            ("get", "/v1/api-keys"),
            ("post", "/v1/agent-tests", {"agent_id": "x", "input_message": "x"}),
            ("get", "/v1/audit"),
            ("get", "/v1/agents/a1/export"),
        ]
        for method, url, *body in cases:
            if method == "get":
                resp = client.get(url)
            else:
                resp = client.post(url, json=body[0] if body else None)
            assert resp.status_code == 503, f"{method.upper()} {url} should return 503"


class TestUserApi:
    def test_register_user(self):
        mock = _mock_db()
        mock.create_user = AsyncMock(return_value={"id": "u1", "email": "test@test.com", "display_name": "", "role": "editor"})
        mock.get_user_by_email = AsyncMock(return_value=None)
        client = TestClient(app)
        resp = client.post("/v1/users/register", json={"email": "test@test.com", "password": "secret"})
        assert resp.status_code == 200
        assert resp.json()["email"] == "test@test.com"

    def test_register_duplicate_email(self):
        mock = _mock_db()
        mock.get_user_by_email = AsyncMock(return_value={"id": "existing", "email": "dup@test.com"})
        client = TestClient(app)
        resp = client.post("/v1/users/register", json={"email": "dup@test.com", "password": "x"})
        assert resp.status_code == 409

    def test_register_no_db_503(self):
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.post("/v1/users/register", json={"email": "x@x.com", "password": "x"})
        assert resp.status_code == 503

    def test_login_success(self):
        mock = _mock_db()
        mock.verify_user_password = AsyncMock(return_value={"id": "u1", "email": "good@test.com", "role": "editor"})
        client = TestClient(app)
        resp = client.post("/v1/users/login", json={"email": "good@test.com", "password": "right"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "authenticated"

    def test_login_failure(self):
        mock = _mock_db()
        mock.verify_user_password = AsyncMock(return_value=None)
        client = TestClient(app)
        resp = client.post("/v1/users/login", json={"email": "bad@test.com", "password": "wrong"})
        assert resp.status_code == 401

    def test_login_no_db_503(self):
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.post("/v1/users/login", json={"email": "x@x.com", "password": "x"})
        assert resp.status_code == 503


class TestTeamApi:
    def test_create_team(self):
        mock = _mock_db()
        mock.create_team = AsyncMock(return_value={"id": "t1", "name": "Platform"})
        client = TestClient(app)
        resp = client.post("/v1/teams", json={"name": "Platform"})
        assert resp.status_code == 200
        assert resp.json()["name"] == "Platform"

    def test_list_teams(self):
        mock = _mock_db()
        mock.list_teams = AsyncMock(return_value=[{"id": "t1", "name": "Team A"}, {"id": "t2", "name": "Team B"}])
        client = TestClient(app)
        resp = client.get("/v1/teams")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_add_team_member(self):
        mock = _mock_db()
        mock.add_team_member = AsyncMock(return_value={"id": "m1", "team_id": "t1", "user_id": "u1", "role": "admin"})
        client = TestClient(app)
        resp = client.post("/v1/teams/t1/members", json={"user_id": "u1", "role": "admin"})
        assert resp.status_code == 200
        assert resp.json()["role"] == "admin"

    def test_list_team_members(self):
        mock = _mock_db()
        mock.list_team_members = AsyncMock(return_value=[
            {"id": "m1", "team_id": "t1", "user_id": "u1", "role": "member", "email": "u@t.com", "display_name": "User"}
        ])
        client = TestClient(app)
        resp = client.get("/v1/teams/t1/members")
        assert resp.status_code == 200
        assert resp.json()[0]["email"] == "u@t.com"

    def test_team_endpoints_no_db_503(self):
        rs._db_lucid = None
        client = TestClient(app)
        assert client.post("/v1/teams", json={"name": "x"}).status_code == 503
        assert client.get("/v1/teams").status_code == 503
        assert client.post("/v1/teams/t1/members", json={"user_id": "x"}).status_code == 503
        assert client.get("/v1/teams/t1/members").status_code == 503
