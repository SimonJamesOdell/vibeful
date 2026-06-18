"""Tests for the agent eval framework.

Covers:
- EvalRunner with mock agent graph
- Assertion types: contains, not_contains, blocked, max_tokens, max_latency_ms
- EvalSuiteResult aggregation and formatting
- GoldenRecorder: record, load, compare
- EvalJudge: heuristic tone detection
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch
import os
import tempfile
import pytest

from src.eval import (
    EvalCase, EvalAssertion, EvalResult, EvalSuite, EvalSuiteResult,
    EvalRunner, EvalJudge, GoldenRecorder,
)
from src.agent_graph import AgentState, build_agent_graph
from src.llm import LlmResponse


# ── Helpers ────────────────────────────────────────────────────

def make_mock_graph(response_text: str, blocked: bool = False):
    """Create a mock compiled graph that returns a fixed response."""
    mock = AsyncMock()
    async def invoke(state):
        chunks = []
        if blocked:
            chunks.append({"state": "COMPLETED", "error": "attack_blocked:test"})
        else:
            chunks.append({"state": "STREAMING", "text_chunk": response_text})
            chunks.append({"state": "COMPLETED", "usage": {"total_tokens": 5}})
        state.response_chunks = chunks
        state.finished = True
        state.route = "end" if blocked else "safe"
        return state
    mock.ainvoke = invoke
    return mock


# ── EvalRunner ─────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_runner_contains_assertion_pass():
    graph = make_mock_graph("Here is information about password reset.")
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="password?",
        expects=[EvalAssertion(type="contains", value="password")],
    )
    result = await runner.run_case(case)
    assert result.passed is True
    assert result.response == "Here is information about password reset."


@pytest.mark.asyncio
async def test_runner_contains_assertion_fail():
    graph = make_mock_graph("I cannot help with that.")
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="password?",
        expects=[EvalAssertion(type="contains", value="password")],
    )
    result = await runner.run_case(case)
    assert result.passed is False


@pytest.mark.asyncio
async def test_runner_not_contains():
    graph = make_mock_graph("Here is some information.")
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="help",
        expects=[EvalAssertion(type="not_contains", value="error")],
    )
    result = await runner.run_case(case)
    assert result.passed is True


@pytest.mark.asyncio
async def test_runner_blocked_true():
    graph = make_mock_graph("", blocked=True)
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="hack me",
        expects=[EvalAssertion(type="blocked", value=True)],
    )
    result = await runner.run_case(case)
    assert result.passed is True


@pytest.mark.asyncio
async def test_runner_max_tokens():
    graph = make_mock_graph("Short answer.")
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="q",
        expects=[EvalAssertion(type="max_tokens", value=10)],
    )
    result = await runner.run_case(case)
    assert result.passed is True


@pytest.mark.asyncio
async def test_runner_max_tokens_exceeded():
    graph = make_mock_graph("This is a much longer response that exceeds the token limit imposed.")
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="q",
        expects=[EvalAssertion(type="max_tokens", value=3)],
    )
    result = await runner.run_case(case)
    assert result.passed is False


@pytest.mark.asyncio
async def test_runner_starts_with():
    graph = make_mock_graph("Hello! How can I help?")
    runner = EvalRunner(graph)
    case = EvalCase(
        name="test", input="hi",
        expects=[EvalAssertion(type="starts_with", value="Hello")],
    )
    result = await runner.run_case(case)
    assert result.passed is True


@pytest.mark.asyncio
async def test_runner_error():
    graph = AsyncMock()
    graph.ainvoke.side_effect = RuntimeError("Boom")
    runner = EvalRunner(graph)
    case = EvalCase(name="test", input="hi")
    result = await runner.run_case(case)
    assert result.passed is False
    assert result.error == "Boom"


# ── EvalSuiteResult ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_suite_result_aggregation():
    graph = make_mock_graph("OK")
    runner = EvalRunner(graph)
    suite = EvalSuite(name="test", cases=[
        EvalCase(name="c1", input="q1", expects=[EvalAssertion(type="contains", value="OK")]),
        EvalCase(name="c2", input="q2", expects=[EvalAssertion(type="contains", value="MISSING")]),
    ])
    result = await runner.run_suite(suite)
    assert result.passed == 1
    assert result.failed == 1
    assert result.errors == 0
    assert result.pass_rate == 0.5


# ── EvalJudge ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_judge_tone_helpful():
    judge = EvalJudge()
    assertion = EvalAssertion(type="tone", value="helpful")
    r = await judge.judge(assertion, "Sure, I can help you with that!", "help")
    assert r.passed is True


@pytest.mark.asyncio
async def test_judge_tone_not_detected():
    judge = EvalJudge()
    assertion = EvalAssertion(type="tone", value="friendly")
    r = await judge.judge(assertion, "No.", "can you help?")
    assert r.passed is False


@pytest.mark.asyncio
async def test_judge_concise_tone():
    judge = EvalJudge()
    assertion = EvalAssertion(type="tone", value="concise")
    r = await judge.judge(assertion, "Yes.", "q")
    assert r.passed is True


# ── GoldenRecorder ─────────────────────────────────────────────

def test_golden_record_and_load():
    with tempfile.TemporaryDirectory() as tmp:
        recorder = GoldenRecorder(directory=tmp)
        recorder.record("test1", "input", "expected response")
        golden = recorder.load("test1")
        assert golden is not None
        assert golden.response == "expected response"
        assert golden.input == "input"


def test_golden_compare_match():
    with tempfile.TemporaryDirectory() as tmp:
        recorder = GoldenRecorder(directory=tmp)
        recorder.record("test2", "q", "the answer")
        result = recorder.compare("test2", "the answer")
        assert result["match"] is True


def test_golden_compare_mismatch():
    with tempfile.TemporaryDirectory() as tmp:
        recorder = GoldenRecorder(directory=tmp)
        recorder.record("test3", "q", "expected answer")
        result = recorder.compare("test3", "different answer completely")
        assert result["match"] is False
        assert "Missing" in result["diff"] or "Extra" in result["diff"]


def test_golden_compare_no_record():
    recorder = GoldenRecorder(directory="/nonexistent")
    result = recorder.compare("nonexistent", "anything")
    assert result["match"] is False
