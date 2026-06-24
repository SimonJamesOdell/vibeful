"""Tests for the Vibeful Python SDK client.

Covers:
- VibefulClient.execute() — full agent invocation
- VibefulClient.stream() — SSE streaming
- AgentResult model validation
- StreamEvent model validation
- API key authentication header
- Error handling (non-200 responses)
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from vibeful.client import VibefulClient
from vibeful.types import AgentResult, StreamEvent


# ═══════════════════════════════════════════════════════════════
# Types
# ═══════════════════════════════════════════════════════════════

class TestAgentResult:
    def test_defaults(self):
        result = AgentResult(agent_id="a1", session_id="s1")
        assert result.agent_id == "a1"
        assert result.session_id == "s1"
        assert result.response == ""
        assert result.tool_calls == []
        assert result.usage == {}
        assert result.error is None
        assert result.finished is False

    def test_with_response(self):
        result = AgentResult(agent_id="a1", session_id="s1", response="Hello")
        assert result.response == "Hello"

    def test_with_tool_calls(self):
        result = AgentResult(
            agent_id="a1", session_id="s1",
            tool_calls=[{"name": "search", "arguments": {"q": "test"}}],
        )
        assert len(result.tool_calls) == 1
        assert result.tool_calls[0]["name"] == "search"

    def test_with_usage(self):
        result = AgentResult(
            agent_id="a1", session_id="s1",
            usage={"prompt_tokens": 10, "completion_tokens": 20},
        )
        assert result.usage["prompt_tokens"] == 10

    def test_with_error(self):
        result = AgentResult(agent_id="a1", session_id="s1", error="Something went wrong")
        assert result.error == "Something went wrong"


class TestStreamEvent:
    def test_token_event(self):
        event = StreamEvent(type="token", text="Hello")
        assert event.type == "token"
        assert event.text == "Hello"

    def test_tool_call_event(self):
        event = StreamEvent(type="tool_call", tool={"name": "search"})
        assert event.type == "tool_call"
        assert event.tool is not None
        assert event.tool["name"] == "search"

    def test_complete_event(self):
        event = StreamEvent(type="complete", usage={"total_tokens": 100})
        assert event.type == "complete"
        assert event.usage == {"total_tokens": 100}

    def test_error_event(self):
        event = StreamEvent(type="error", message="Connection refused")
        assert event.type == "error"
        assert event.message == "Connection refused"


# ═══════════════════════════════════════════════════════════════
# Client
# ═══════════════════════════════════════════════════════════════

class TestVibefulClientInit:
    def test_default_base_url(self):
        client = VibefulClient()
        assert client.base_url == "http://localhost:50052"

    def test_custom_base_url(self):
        client = VibefulClient(base_url="http://example.com:8080")
        assert client.base_url == "http://example.com:8080"

    def test_trailing_slash_removed(self):
        client = VibefulClient(base_url="http://localhost:50052/")
        assert client.base_url == "http://localhost:50052"

    def test_with_api_key(self):
        client = VibefulClient(api_key="test-key")
        assert client.api_key == "test-key"

    def test_custom_timeout(self):
        client = VibefulClient(timeout=30.0)
        assert client.timeout == 30.0

    def test_no_api_key_no_auth_header(self):
        client = VibefulClient()
        h = client._headers()
        assert "Authorization" not in h

    def test_api_key_adds_bearer_header(self):
        client = VibefulClient(api_key="secret")
        h = client._headers()
        assert h["Authorization"] == "Bearer secret"


class TestVibefulClientExecute:
    @pytest.mark.asyncio
    async def test_execute_success(self):
        client = VibefulClient()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "agent_id": "a1",
            "session_id": "s1",
            "response": "Hello world",
            "tool_calls": [],
            "usage": {"total_tokens": 15},
            "error": None,
            "finished": True,
        }

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            result = await client.execute("a1", "Hello")
            assert result.response == "Hello world"
            assert result.finished is True

    @pytest.mark.asyncio
    async def test_execute_with_all_overrides(self):
        client = VibefulClient()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"agent_id": "a1", "session_id": "s1", "response": "OK", "tool_calls": [], "usage": {}, "finished": True}

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            result = await client.execute(
                "a1", "Hello",
                system_prompt="Be helpful",
                model="deepseek-chat",
                temperature=0.5,
                context_ids=["ctx-1"],
                mcp_server_urls=["http://mcp"],
            )
            assert result.response == "OK"

    @pytest.mark.asyncio
    async def test_execute_http_error(self):
        client = VibefulClient()
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.json.return_value = {"detail": "Agent graph not initialized"}

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            result = await client.execute("a1", "Hello")
            assert result.error == "Agent graph not initialized"

    @pytest.mark.asyncio
    async def test_execute_404(self):
        client = VibefulClient()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.json.return_value = {"detail": "Agent not found"}

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            result = await client.execute("nonexistent", "Hello")
            assert result.error == "Agent not found"

    @pytest.mark.asyncio
    async def test_execute_non_json_error_body(self):
        client = VibefulClient()
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.json.side_effect = json.JSONDecodeError("bad", "x", 0)

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            mock_http.post = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            result = await client.execute("a1", "Hello")
            assert result.error is not None
            assert "500" in result.error


class TestVibefulClientStream:
    @pytest.mark.asyncio
    async def test_stream_yields_events(self):
        client = VibefulClient()
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        async def mock_lines():
            events = [
                'data: {"type":"token","text":"Hello"}',
                'data: {"type":"token","text":" world"}',
                'data: {"type":"complete","usage":{"total_tokens":10}}',
            ]
            for line in events:
                yield line

        mock_resp.aiter_lines = mock_lines

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            stream_cm = MagicMock()
            stream_cm.__aenter__ = AsyncMock(return_value=mock_resp)
            stream_cm.__aexit__ = AsyncMock()
            mock_http.stream = MagicMock(return_value=stream_cm)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            events = []
            async for event in client.stream("a1", "Hello"):
                events.append(event)

            assert len(events) == 3
            assert events[0].type == "token"
            assert events[0].text == "Hello"
            assert events[2].type == "complete"

    @pytest.mark.asyncio
    async def test_stream_http_error(self):
        client = VibefulClient()
        mock_resp = MagicMock()
        mock_resp.status_code = 503

        async def mock_read():
            return json.dumps({"detail": "Agent graph not initialized"}).encode()

        mock_resp.aread = mock_read

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            stream_cm = MagicMock()
            stream_cm.__aenter__ = AsyncMock(return_value=mock_resp)
            stream_cm.__aexit__ = AsyncMock()
            mock_http.stream = MagicMock(return_value=stream_cm)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            events = []
            async for event in client.stream("a1", "Hello"):
                events.append(event)

            assert len(events) == 1
            assert events[0].type == "error"
            assert events[0].message == "Agent graph not initialized"

    @pytest.mark.asyncio
    async def test_stream_ignores_non_data_lines(self):
        client = VibefulClient()
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        async def mock_lines():
            yield ":heartbeat\n"
            yield 'data: {"type":"token","text":"OK"}'

        mock_resp.aiter_lines = mock_lines

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            stream_cm = MagicMock()
            stream_cm.__aenter__ = AsyncMock(return_value=mock_resp)
            stream_cm.__aexit__ = AsyncMock()
            mock_http.stream = MagicMock(return_value=stream_cm)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            events = []
            async for event in client.stream("a1", "Hello"):
                events.append(event)

            assert len(events) == 1
            assert events[0].text == "OK"

    @pytest.mark.asyncio
    async def test_stream_ignores_done_marker(self):
        client = VibefulClient()
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        async def mock_lines():
            yield 'data: {"type":"token","text":"x"}'
            yield "data: [DONE]"

        mock_resp.aiter_lines = mock_lines

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            stream_cm = MagicMock()
            stream_cm.__aenter__ = AsyncMock(return_value=mock_resp)
            stream_cm.__aexit__ = AsyncMock()
            mock_http.stream = MagicMock(return_value=stream_cm)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            events = []
            async for event in client.stream("a1", "Hello"):
                events.append(event)

            assert len(events) == 1
            # [DONE] was skipped, only token event passed through

    @pytest.mark.asyncio
    async def test_stream_skips_malformed_json(self):
        client = VibefulClient()
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        async def mock_lines():
            yield "data: not-json-at-all"
            yield 'data: {"type":"token","text":"valid"}'

        mock_resp.aiter_lines = mock_lines

        with patch("httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            stream_cm = MagicMock()
            stream_cm.__aenter__ = AsyncMock(return_value=mock_resp)
            stream_cm.__aexit__ = AsyncMock()
            mock_http.stream = MagicMock(return_value=stream_cm)
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_http)
            mock_client_cls.return_value.__aexit__ = AsyncMock()

            events = []
            async for event in client.stream("a1", "Hello"):
                events.append(event)

            assert len(events) == 1
            assert events[0].text == "valid"
