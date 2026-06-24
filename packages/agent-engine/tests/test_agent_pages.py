"""Tests for agent page storage — SQLite CRUD + REST API.

Covers:
- SqliteBackend.create_page(): slug uniqueness, defaults, all fields
- SqliteBackend.get_page(): existing, non-existing
- SqliteBackend.get_page_by_slug(): existing, non-existing
- SqliteBackend.list_pages(): all, filtered by agent_id, empty
- SqliteBackend.update_page(): partial update, full update, non-existing
- SqliteBackend.delete_page(): existing, non-existing
- REST API endpoints: CRUD, slug lookup, 404 handling, 503
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
    """Fresh in-memory SQLite backend."""
    backend = SqliteBackend(db_path=":memory:")
    await backend.init_schema()
    yield backend
    await backend.close()


async def _create_page(db: SqliteBackend, **overrides) -> dict:
    data = {
        "agent_id": "agent-1",
        "slug": "test-page",
        "title": "Test Page",
        "content_markdown": "# Hello",
        **overrides,
    }
    return await db.create_page(data)


class TestCreatePage:
    @pytest.mark.asyncio
    async def test_create_minimal(self, db):
        """Create with only required fields."""
        result = await db.create_page({
            "agent_id": "agent-1",
            "slug": "my-page",
        })
        assert result["id"] is not None
        assert result["slug"] == "my-page"
        assert result["agent_id"] == "agent-1"
        assert result["title"] == ""
        assert result["published"] == 0

    @pytest.mark.asyncio
    async def test_create_with_all_fields(self, db):
        """All optional fields stored correctly."""
        result = await db.create_page({
            "agent_id": "agent-42",
            "slug": "about",
            "title": "About Us",
            "content_markdown": "## Welcome",
            "layout_json": '{"header": true}',
            "published": 1,
        })
        assert result["title"] == "About Us"
        assert result["content_markdown"] == "## Welcome"
        assert result["layout_json"] == '{"header": true}'
        assert result["published"] == 1

    @pytest.mark.asyncio
    async def test_slug_uniqueness(self, db):
        """Duplicate slugs get a suffix appended."""
        a = await db.create_page({"agent_id": "a", "slug": "faq"})
        b = await db.create_page({"agent_id": "b", "slug": "faq"})
        assert a["slug"] == "faq"
        assert b["slug"] == "faq-1"
        assert a["id"] != b["id"]

    @pytest.mark.asyncio
    async def test_slug_multiple_collisions(self, db):
        """Multiple collisions increment the suffix."""
        await db.create_page({"agent_id": "a", "slug": "page"})
        await db.create_page({"agent_id": "b", "slug": "page"})
        c = await db.create_page({"agent_id": "c", "slug": "page"})
        assert c["slug"] == "page-2"


class TestGetPage:
    @pytest.mark.asyncio
    async def test_get_existing(self, db):
        created = await _create_page(db)
        result = await db.get_page(created["id"])
        assert result is not None
        assert result["id"] == created["id"]

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, db):
        assert await db.get_page("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_by_slug(self, db):
        created = await _create_page(db, slug="my-slug")
        result = await db.get_page_by_slug("my-slug")
        assert result is not None
        assert result["id"] == created["id"]

    @pytest.mark.asyncio
    async def test_get_by_slug_nonexistent(self, db):
        assert await db.get_page_by_slug("no-such-slug") is None


class TestListPages:
    @pytest.mark.asyncio
    async def test_list_empty(self, db):
        assert await db.list_pages() == []

    @pytest.mark.asyncio
    async def test_list_all(self, db):
        a = await _create_page(db, slug="a")
        b = await _create_page(db, slug="b")
        result = await db.list_pages()
        assert len(result) == 2
        ids = {r["id"] for r in result}
        assert a["id"] in ids
        assert b["id"] in ids

    @pytest.mark.asyncio
    async def test_list_by_agent(self, db):
        await _create_page(db, agent_id="agent-1", slug="a1")
        await _create_page(db, agent_id="agent-2", slug="a2")
        result = await db.list_pages(agent_id="agent-1")
        assert len(result) == 1
        assert result[0]["slug"] == "a1"


class TestUpdatePage:
    @pytest.mark.asyncio
    async def test_update_title(self, db):
        created = await _create_page(db)
        updated = await db.update_page(created["id"], {"title": "New Title"})
        assert updated is not None
        assert updated["title"] == "New Title"
        assert updated["content_markdown"] == created["content_markdown"]

    @pytest.mark.asyncio
    async def test_update_published(self, db):
        created = await _create_page(db)
        updated = await db.update_page(created["id"], {"published": 1})
        assert updated["published"] == 1

    @pytest.mark.asyncio
    async def test_update_nonexistent(self, db):
        result = await db.update_page("nonexistent", {"title": "X"})
        assert result is None


class TestDeletePage:
    @pytest.mark.asyncio
    async def test_delete_existing(self, db):
        created = await _create_page(db)
        assert await db.delete_page(created["id"]) is True
        assert await db.get_page(created["id"]) is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, db):
        assert await db.delete_page("nonexistent") is False


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
    db.create_page = AsyncMock(return_value={"id": "p1", "slug": "test", "title": "T", "agent_id": "a1",
                                             "content_markdown": "", "layout_json": "{}", "published": 0,
                                             "created_at": "", "updated_at": ""})
    db.get_page = AsyncMock(return_value=None)
    db.get_page_by_slug = AsyncMock(return_value=None)
    db.list_pages = AsyncMock(return_value=[])
    db.update_page = AsyncMock(return_value=None)
    db.delete_page = AsyncMock(return_value=False)
    for k, v in overrides.items():
        setattr(db, k, v)
    rs._db_lucid = db
    return db


class TestPagesApi:
    def test_create_page(self):
        _mock_db(create_page=AsyncMock(return_value={"id": "new", "slug": "hello", "title": "Hello"}))
        client = TestClient(app)
        resp = client.post("/v1/pages", json={"agent_id": "a1", "slug": "hello", "title": "Hello"})
        assert resp.status_code == 200
        assert resp.json()["slug"] == "hello"

    def test_create_missing_agent_id(self):
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/pages", json={"slug": "test"})
        assert resp.status_code == 422

    def test_list_pages(self):
        pages = [{"id": "p1", "slug": "a"}, {"id": "p2", "slug": "b"}]
        _mock_db(list_pages=AsyncMock(return_value=pages))
        client = TestClient(app)
        resp = client.get("/v1/pages")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_list_by_agent(self):
        mock = _mock_db(list_pages=AsyncMock(return_value=[]))
        client = TestClient(app)
        resp = client.get("/v1/pages?agent_id=agent-1")
        assert resp.status_code == 200
        mock.list_pages.assert_called_once_with("agent-1")

    def test_get_page_404(self):
        _mock_db()
        client = TestClient(app)
        resp = client.get("/v1/pages/nonexistent")
        assert resp.status_code == 404

    def test_get_by_slug(self):
        page = {"id": "p1", "slug": "about", "title": "About"}
        _mock_db(get_page_by_slug=AsyncMock(return_value=page))
        client = TestClient(app)
        resp = client.get("/v1/pages/slug/about")
        assert resp.status_code == 200
        assert resp.json()["slug"] == "about"

    def test_get_by_slug_404(self):
        _mock_db()
        client = TestClient(app)
        resp = client.get("/v1/pages/slug/nope")
        assert resp.status_code == 404

    def test_update_page(self):
        _mock_db(update_page=AsyncMock(return_value={"id": "p1", "title": "Updated"}))
        client = TestClient(app)
        resp = client.put("/v1/pages/p1", json={"title": "Updated"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated"

    def test_update_empty_body(self):
        _mock_db()
        client = TestClient(app)
        resp = client.put("/v1/pages/p1", json={})
        assert resp.status_code == 400

    def test_delete_page(self):
        _mock_db(delete_page=AsyncMock(return_value=True))
        client = TestClient(app)
        resp = client.delete("/v1/pages/p1")
        assert resp.status_code == 200
        assert resp.json() == {"status": "deleted"}

    def test_delete_404(self):
        _mock_db()
        client = TestClient(app)
        resp = client.delete("/v1/pages/nonexistent")
        assert resp.status_code == 404

    def test_no_db_503(self):
        rs._db_lucid = None
        client = TestClient(app)
        cases = [
            ("get", "/v1/pages", None),
            ("post", "/v1/pages", {"agent_id": "x", "slug": "x"}),
            ("get", "/v1/pages/p1", None),
            ("put", "/v1/pages/p1", {"title": "x"}),
            ("delete", "/v1/pages/p1", None),
        ]
        for method, url, body in cases:
            if method == "get":
                resp = client.get(url)
            elif method == "post":
                resp = client.post(url, json=body)
            elif method == "put":
                resp = client.put(url, json=body)
            else:
                resp = client.delete(url)
            assert resp.status_code == 503, f"{method.upper()} {url} should return 503"


# ═══════════════════════════════════════════════════════════════
# PageInteract endpoint (widget event loop)
# ═══════════════════════════════════════════════════════════════

class TestPageInteract:
    def test_interact_requires_widget_id(self):
        _mock_db()
        client = TestClient(app)
        resp = client.post("/v1/pages/p1/interact", json={"event_type": "click"})
        assert resp.status_code == 422

    def test_interact_page_not_found(self):
        _mock_db(get_page=AsyncMock(return_value=None))
        client = TestClient(app)
        resp = client.post("/v1/pages/nonexistent/interact", json={"widget_id": "w1", "event_type": "click"})
        assert resp.status_code == 404

    def test_interact_no_agent_id_400(self):
        _mock_db(get_page=AsyncMock(return_value={"id": "p1", "agent_id": "", "slug": "test", "content_markdown": ""}))
        client = TestClient(app)
        resp = client.post("/v1/pages/p1/interact", json={"widget_id": "w1", "event_type": "click"})
        assert resp.status_code == 400

    def test_interact_no_graph_503(self):
        rs._graph = None
        _mock_db(get_page=AsyncMock(return_value={"id": "p1", "agent_id": "a1", "slug": "test", "content_markdown": ""}))
        client = TestClient(app)
        resp = client.post("/v1/pages/p1/interact", json={"widget_id": "w1", "event_type": "click"})
        assert resp.status_code == 503

    def test_interact_no_db_503(self):
        rs._db_lucid = None
        client = TestClient(app)
        resp = client.post("/v1/pages/p1/interact", json={"widget_id": "w1", "event_type": "click"})
        assert resp.status_code == 503
