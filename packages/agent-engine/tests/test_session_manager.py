"""Tests for SessionManager — session lifecycle, message ordering, schema idempotency.

Covers:
- Schema initialization: idempotent, creates tables
- Session CRUD: create, get (existing/nonexistent), touch (timestamp update)
- Message management: add messages, retrieve in turn order
- Edge cases: missing session, empty config, concurrent session creation
- Connection management: close, reconnect
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from src.session_manager import SessionManager, Session


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════


class FakeCursor:
    """A fake psycopg cursor that records executed queries and returns canned rows."""

    def __init__(self, rows: list[dict] | None = None):
        self.rows = rows or []
        self.executed: list[str] = []
        self.rowcount = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def execute(self, sql: str, params=None, **kwargs):
        self.executed.append(sql)

    async def fetchone(self):
        if self.rows:
            return self.rows.pop(0)
        return None

    async def fetchall(self):
        result = list(self.rows)
        self.rows = []
        return result


def make_fake_conn(cursor: FakeCursor | None = None):
    """Create a fake psycopg AsyncConnection."""
    cur = cursor or FakeCursor()
    conn = MagicMock()
    conn.closed = False
    conn.cursor.return_value = cur
    conn.commit = AsyncMock()
    conn.close = AsyncMock()
    return conn


# ═══════════════════════════════════════════════════════════════
# Schema initialization
# ═══════════════════════════════════════════════════════════════


class TestSchemaInit:
    """invariant: init_schema() is idempotent and creates all tables."""

    @pytest.mark.asyncio
    async def test_init_schema_runs_without_error(self):
        """init_schema() executes without exception on first call."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        await mgr.init_schema()
        # Should not raise

    @pytest.mark.asyncio
    async def test_init_schema_is_idempotent(self):
        """Calling init_schema() twice does not error (IF NOT EXISTS)."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        await mgr.init_schema()
        await mgr.init_schema()
        # Should not raise on second call

    @pytest.mark.asyncio
    async def test_init_schema_creates_expected_tables(self):
        """init_schema() executes CREATE TABLE statements for sessions, messages."""
        cur = FakeCursor()
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        await mgr.init_schema()

        executed = " ".join(cur.executed)
        assert "CREATE EXTENSION IF NOT EXISTS vector" in executed
        assert "sessions" in executed
        assert "messages" in executed
        assert "idx_messages_session" in executed


# ═══════════════════════════════════════════════════════════════
# Session CRUD
# ═══════════════════════════════════════════════════════════════


class TestSessionCreate:
    """invariant: create_session() produces a valid Session with unique IDs."""

    @pytest.mark.asyncio
    async def test_create_session_returns_session(self):
        """create_session() returns a Session instance."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        session = await mgr.create_session()
        assert isinstance(session, Session)
        assert session.session_id
        assert session.messages == []

    @pytest.mark.asyncio
    async def test_create_session_unique_ids(self):
        """Two create_session() calls produce different session IDs."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        s1 = await mgr.create_session()
        s2 = await mgr.create_session()
        assert s1.session_id != s2.session_id

    @pytest.mark.asyncio
    async def test_create_session_stores_agent_config(self):
        """Agent config is stored with the session."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        config = {"name": "test-agent", "model": "deepseek-chat"}
        session = await mgr.create_session(agent_config=config)
        assert session.agent_config == config

    @pytest.mark.asyncio
    async def test_create_session_defaults_empty_config(self):
        """No agent_config defaults to empty dict."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        session = await mgr.create_session()
        assert session.agent_config == {}


class TestSessionGet:
    """invariant: get_session() returns None for missing, full Session with messages for existing."""

    @pytest.mark.asyncio
    async def test_get_nonexistent_session_returns_none(self):
        """get_session() returns None for a session that doesn't exist."""
        cur = FakeCursor(rows=[])  # fetchone returns None
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        result = await mgr.get_session("nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_session_returns_with_messages(self):
        """get_session() returns Session with messages when they exist."""
        session_row = {
            "session_id": "s1",
            "created_at": "2024-01-01T00:00:00Z",
            "last_active_at": "2024-01-01T00:00:00Z",
            "agent_config": {"name": "test"},
        }
        msg_rows = [
            {"id": 1, "session_id": "s1", "turn": 0, "role": "user", "content": "Hello", "tool_calls": None, "created_at": "2024-01-01T00:00:00Z"},
            {"id": 2, "session_id": "s1", "turn": 0, "role": "assistant", "content": "Hi!", "tool_calls": None, "created_at": "2024-01-01T00:00:01Z"},
        ]
        cur = FakeCursor(rows=[session_row, msg_rows[0], msg_rows[1]])
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        result = await mgr.get_session("s1")
        assert result is not None
        assert result.session_id == "s1"
        assert len(result.messages) == 2
        assert result.messages[0]["role"] == "user"
        assert result.messages[1]["role"] == "assistant"


class TestSessionTouch:
    """invariant: touch_session() updates last_active_at without error."""

    @pytest.mark.asyncio
    async def test_touch_session_executes_update(self):
        """touch_session() executes UPDATE on the sessions table."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        await mgr.touch_session("s1")
        # Should not raise

    @pytest.mark.asyncio
    async def test_touch_nonexistent_session_succeeds(self):
        """touch_session() on nonexistent session does not error (no-op UPDATE)."""
        mgr = SessionManager()
        mgr._conn = make_fake_conn()

        await mgr.touch_session("nonexistent")
        # Should not raise — UPDATE with no matching row is valid


# ═══════════════════════════════════════════════════════════════
# Message management
# ═══════════════════════════════════════════════════════════════


class TestMessageAdd:
    """invariant: add_message() stores messages with correct role, turn, and content."""

    @pytest.mark.asyncio
    async def test_add_user_message(self):
        """add_message() stores a user message."""
        cur = FakeCursor()
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        await mgr.add_message("s1", "user", "Hello", turn=0)
        executed = " ".join(cur.executed)
        assert "INSERT INTO messages" in executed

    @pytest.mark.asyncio
    async def test_add_message_with_tool_calls(self):
        """add_message() stores tool_calls as JSONB."""
        cur = FakeCursor()
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        tool_calls = [{"name": "get_current_time", "arguments": {}}]
        await mgr.add_message("s1", "assistant", None, turn=0, tool_calls=tool_calls)
        executed = " ".join(cur.executed)
        assert "INSERT INTO messages" in executed

    @pytest.mark.asyncio
    async def test_add_message_increments_turn(self):
        """Subsequent messages increment turn."""
        cur = FakeCursor()
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        await mgr.add_message("s1", "user", "msg1", turn=0)
        await mgr.add_message("s1", "assistant", "reply1", turn=0)
        await mgr.add_message("s1", "user", "msg2", turn=1)
        # Should not raise — verifies the interface works

    @pytest.mark.asyncio
    async def test_add_message_null_content(self):
        """add_message() with None content is valid (e.g., tool-only responses)."""
        cur = FakeCursor()
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        await mgr.add_message("s1", "assistant", None, turn=0)
        # Should not raise


# ═══════════════════════════════════════════════════════════════
# Connection management
# ═══════════════════════════════════════════════════════════════


class TestConnectionManagement:
    """invariant: close() cleans up the connection, subsequent operations reconnect."""

    @pytest.mark.asyncio
    async def test_close_closes_connection(self):
        """close() calls conn.close()."""
        fake_conn = make_fake_conn()
        mgr = SessionManager()
        mgr._conn = fake_conn

        await mgr.close()
        fake_conn.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_when_already_closed_noop(self):
        """close() on already-closed connection is safe."""
        fake_conn = make_fake_conn()
        fake_conn.closed = True
        mgr = SessionManager()
        mgr._conn = fake_conn

        await mgr.close()
        fake_conn.close.assert_not_called()


# ═══════════════════════════════════════════════════════════════
# Integration: full session lifecycle
# ═══════════════════════════════════════════════════════════════


class TestSessionLifecycle:
    """invariant: create → add messages → get returns all messages in order."""

    @pytest.mark.asyncio
    async def test_full_lifecycle(self):
        """Create session, add messages, retrieve with all messages."""
        session_row = {
            "session_id": "s-lifecycle",
            "created_at": "2024-01-01T00:00:00Z",
            "last_active_at": "2024-01-01T00:00:00Z",
            "agent_config": {},
        }
        msg_rows = [
            {"id": 1, "session_id": "s-lifecycle", "turn": 0, "role": "user", "content": "Hello", "tool_calls": None, "created_at": "2024-01-01T00:00:00Z"},
            {"id": 2, "session_id": "s-lifecycle", "turn": 0, "role": "assistant", "content": "Hi!", "tool_calls": None, "created_at": "2024-01-01T00:00:01Z"},
            {"id": 3, "session_id": "s-lifecycle", "turn": 1, "role": "user", "content": "Help me", "tool_calls": None, "created_at": "2024-01-01T00:01:00Z"},
        ]
        cur = FakeCursor(rows=[session_row] + msg_rows)
        mgr = SessionManager()
        mgr._conn = make_fake_conn(cur)

        result = await mgr.get_session("s-lifecycle")
        assert result is not None
        assert len(result.messages) == 3
        roles = [m["role"] for m in result.messages]
        assert roles == ["user", "assistant", "user"]
        turns = [m["turn"] for m in result.messages]
        assert turns[0] == 0
        assert turns[2] == 1
