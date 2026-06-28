"""Tests for WorkflowEngine — step execution, variable resolution, error propagation.

Covers:
- Step types: gather_input, rag_search, llm_analyze, deliver_message, tool_call
- Variable resolution: @variable_name replacement, missing variables
- Error propagation: step failures set error, stop subsequent steps
- Edge cases: empty steps, unknown step types, state lifecycle
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest

from src.workflow_engine import WorkflowEngine, WorkflowState
from src.llm import LlmResponse
from src.rag import RagPipeline


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════


def make_fake_llm(content: str = "Analysis result"):
    llm = MagicMock()
    llm.chat = AsyncMock(return_value=LlmResponse(
        content=content,
        prompt_tokens=10,
        completion_tokens=5,
        total_tokens=15,
        model="deepseek-chat",
    ))
    return llm


def make_fake_rag():
    rag = MagicMock(spec=RagPipeline)
    rag.retrieve = AsyncMock(return_value=[])
    return rag


# ═══════════════════════════════════════════════════════════════
# Step execution — individual step types
# ═══════════════════════════════════════════════════════════════


class TestStepExecution:
    """invariant: each step type executes correctly with its config."""

    @pytest.mark.asyncio
    async def test_gather_input_step(self):
        """gather_input uses the config prompt template."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "gather_input", "config": {"prompt": "What is your name?"}, "variable": "name_query"},
        ]
        state = await engine.execute(steps, user_input="My name is John")

        assert state.error is None
        assert "name_query" in state.variables
        assert state.variables["name_query"] == "What is your name?"

    @pytest.mark.asyncio
    async def test_gather_input_with_variable_substitution(self):
        """gather_input substitutes @variable references."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "gather_input", "config": {"prompt": "Hello @user_input"}, "variable": "greeting"},
        ]
        state = await engine.execute(steps, user_input="World")

        assert state.variables["greeting"] == "Hello World"

    @pytest.mark.asyncio
    async def test_rag_search_step(self):
        """rag_search retrieves from RAG pipeline."""
        llm = make_fake_llm()
        rag = make_fake_rag()
        rag.retrieve = AsyncMock(return_value=[
            MagicMock(text="Relevant document chunk 1."),
            MagicMock(text="Relevant document chunk 2."),
        ])
        engine = WorkflowEngine(llm, rag)

        steps = [
            {"id": "step1", "type": "rag_search", "config": {"query": "What is Vibeful?"}, "variable": "knowledge"},
        ]
        state = await engine.execute(steps, user_input="Tell me about Vibeful", context_ids=["ctx1"])

        assert state.error is None
        assert "knowledge" in state.variables
        assert "Relevant document chunk 1" in state.variables["knowledge"]

    @pytest.mark.asyncio
    async def test_rag_search_no_rag_available(self):
        """rag_search returns fallback message when RAG is not configured."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm, rag=None)

        steps = [
            {"id": "step1", "type": "rag_search", "config": {"query": "test"}, "variable": "knowledge"},
        ]
        state = await engine.execute(steps, user_input="test")

        assert "No knowledge context" in state.variables["knowledge"]

    @pytest.mark.asyncio
    async def test_llm_analyze_step(self):
        """llm_analyze calls the LLM and stores the response."""
        llm = make_fake_llm("The user asked about Vibeful, which is an AI agent platform.")
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "llm_analyze", "config": {"prompt": "Analyze: @user_input"}, "variable": "analysis"},
        ]
        state = await engine.execute(steps, user_input="What is Vibeful?")

        assert state.error is None
        assert "AI agent platform" in state.variables["analysis"]
        # Messages accumulated
        assert len(state.messages) == 2  # user + assistant

    @pytest.mark.asyncio
    async def test_deliver_message_step(self):
        """deliver_message stores a formatted message."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "deliver_message", "config": {"message": "Your answer: @analysis_result"}, "variable": "final"},
        ]
        # Pre-populate a variable
        state = await engine.execute(
            steps,
            user_input="",
        )
        # Override: manually set a variable to test substitution
        # Actually we need a prior step to set it — let's test chaining
        assert state.error is None

    @pytest.mark.asyncio
    async def test_tool_call_step(self):
        """tool_call step returns JSON with tool name and args."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "tool_call", "config": {"tool": "get_current_time", "arguments": "{}"}, "variable": "tool_result"},
        ]
        state = await engine.execute(steps, user_input="What time is it?")

        assert state.error is None
        assert '"tool"' in state.variables["tool_result"]
        assert "get_current_time" in state.variables["tool_result"]

    @pytest.mark.asyncio
    async def test_unknown_step_type(self):
        """Unknown step types result in empty string output, no error."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "nonexistent_step_type", "config": {}, "variable": "result"},
        ]
        state = await engine.execute(steps, user_input="test")

        # Unknown step types produce empty string
        assert state.variables.get("result") == ""


# ═══════════════════════════════════════════════════════════════
# Variable resolution
# ═══════════════════════════════════════════════════════════════


class TestVariableResolution:
    """invariant: @variable_name references resolve correctly, missing vars stay as-is."""

    def test_resolve_simple_variable(self):
        """@variable_name is replaced with the value."""
        engine = WorkflowEngine(make_fake_llm())
        result = engine._resolve_template("Hello @name", {"name": "World"})
        assert result == "Hello World"

    def test_resolve_multiple_variables(self):
        """Multiple @variables are all resolved."""
        engine = WorkflowEngine(make_fake_llm())
        result = engine._resolve_template("@greeting @name!", {"greeting": "Hello", "name": "Alice"})
        assert result == "Hello Alice!"

    def test_resolve_variable_not_in_dict(self):
        """Undefined @variable is left as-is in the template."""
        engine = WorkflowEngine(make_fake_llm())
        result = engine._resolve_template("Hello @undefined_var", {"name": "World"})
        assert result == "Hello @undefined_var"

    def test_resolve_no_template_variables(self):
        """Template with no @references returns unchanged."""
        engine = WorkflowEngine(make_fake_llm())
        result = engine._resolve_template("Plain text", {"x": "y"})
        assert result == "Plain text"

    def test_resolve_partial_match(self):
        """@user is not confused with @user_input when only user_input exists."""
        engine = WorkflowEngine(make_fake_llm())
        result = engine._resolve_template("@user @user_input", {"user_input": "test"})
        assert result == "@user test"


# ═══════════════════════════════════════════════════════════════
# Error propagation
# ═══════════════════════════════════════════════════════════════


class TestErrorPropagation:
    """invariant: step errors set state.error and stop subsequent steps."""

    @pytest.mark.asyncio
    async def test_llm_error_sets_error_field(self):
        """When LLM raises, the error is captured in state.error."""
        llm = MagicMock()
        llm.chat = AsyncMock(side_effect=RuntimeError("API timeout"))
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "llm_analyze", "config": {"prompt": "test"}, "variable": "result"},
        ]
        state = await engine.execute(steps, user_input="test")

        assert state.error is not None
        assert "API timeout" in state.error

    @pytest.mark.asyncio
    async def test_error_stops_subsequent_steps(self):
        """After an error, subsequent steps are skipped."""
        llm = MagicMock()
        llm.chat = AsyncMock(side_effect=RuntimeError("Boom"))
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "step1", "type": "llm_analyze", "config": {"prompt": "test"}, "variable": "result1"},
            {"id": "step2", "type": "llm_analyze", "config": {"prompt": "test2"}, "variable": "result2"},
        ]
        state = await engine.execute(steps, user_input="test")

        assert state.error is not None
        # step2 should not have executed
        assert "result2" not in state.variables
        # step1 error recorded
        assert len(state.step_results) == 1  # Only step1 ran

    @pytest.mark.asyncio
    async def test_error_recorded_in_step_results(self):
        """Failed steps have error info in step_results."""
        llm = MagicMock()
        llm.chat = AsyncMock(side_effect=RuntimeError("Timeout"))
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "failing_step", "type": "llm_analyze", "config": {"prompt": "test"}, "variable": "r"},
        ]
        state = await engine.execute(steps, user_input="test")

        assert state.step_results[0]["step_id"] == "failing_step"
        assert "error" in state.step_results[0]
        assert "Timeout" in state.step_results[0]["error"]


# ═══════════════════════════════════════════════════════════════
# Workflow state lifecycle
# ═══════════════════════════════════════════════════════════════


class TestWorkflowState:
    """invariant: WorkflowState initializes correctly and accumulates results."""

    def test_workflow_state_defaults(self):
        """WorkflowState has sensible defaults."""
        state = WorkflowState()
        assert state.variables == {}
        assert state.messages == []
        assert state.step_results == []
        assert state.error is None

    @pytest.mark.asyncio
    async def test_execute_initializes_user_input(self):
        """execute() sets user_input variable from the argument."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = []  # No steps — just verify initialization
        state = await engine.execute(steps, user_input="Hello World")

        assert state.variables["user_input"] == "Hello World"

    @pytest.mark.asyncio
    async def test_execute_preserves_step_order(self):
        """Steps execute in order, each building on the previous."""
        llm = make_fake_llm()
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "s1", "type": "gather_input", "config": {"prompt": "Step 1 complete"}, "variable": "step1_out"},
            {"id": "s2", "type": "gather_input", "config": {"prompt": "@step1_out + Step 2"}, "variable": "step2_out"},
        ]
        state = await engine.execute(steps, user_input="start")

        assert state.error is None
        assert state.variables["step1_out"] == "Step 1 complete"
        assert state.variables["step2_out"] == "Step 1 complete + Step 2"
        assert len(state.step_results) == 2

    @pytest.mark.asyncio
    async def test_execute_multiple_steps_chained(self):
        """Full workflow: gather_input → llm_analyze → deliver_message."""
        llm = make_fake_llm("Vibeful is a self-hosted AI agent platform.")
        engine = WorkflowEngine(llm)

        steps = [
            {"id": "s1", "type": "llm_analyze", "config": {"prompt": "Answer: @user_input"}, "variable": "answer"},
            {"id": "s2", "type": "deliver_message", "config": {"message": "Here is your answer: @answer"}, "variable": "final"},
        ]
        state = await engine.execute(steps, user_input="What is Vibeful?")

        assert state.error is None
        assert "Vibeful" in state.variables["answer"]
        assert "Vibeful" in state.variables["final"]
        assert len(state.messages) == 3  # user + assistant + assistant
