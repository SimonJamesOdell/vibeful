"""Tests for the analysis pipeline module.

Covers: AnalysisConfig parsing, phase toggling, parallel execution,
conductor override, no-op when disabled, integration with AgentState.
"""

from __future__ import annotations

import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.analysis_pipeline import (
    AnalysisConfig,
    PhaseConfig,
    AnalysisResults,
    MemoryResult,
    ImpressionResult,
    ConceptResult,
    AssumptionResult,
    ConductorResult,
    CodeRequest,
    run_analysis_pipeline,
    analysis_pipeline_node,
    phase_memories,
    phase_impressions,
    phase_concepts,
    phase_assumptions,
    phase_intent,
    phase_code_detect,
    phase_search_detect,
    phase_conductor,
)


# ═══════════════════════════════════════════════════════════════
# AnalysisConfig Tests
# ═══════════════════════════════════════════════════════════════

class TestAnalysisConfig:
    def test_default_disabled(self):
        config = AnalysisConfig()
        assert config.enabled is False
        assert len(config.enabled_phases()) == 0

    def test_enabled_propagates_to_phases(self):
        config = AnalysisConfig(enabled=True)
        assert config.enabled is True
        # All default phases should be enabled
        phases = config.enabled_phases()
        assert "memories" in phases
        assert "impressions" in phases
        assert "conductor" in phases
        assert len(phases) == 12  # 8 original + global_memories, next, search_execute, output_routing

    def test_default_temperatures(self):
        config = AnalysisConfig(enabled=True)
        assert config.phases["memories"].temperature == 0.2
        assert config.phases["impressions"].temperature == 0.5
        assert config.phases["conductor"].temperature == 0.5
        assert config.phases["code_detect"].temperature == 0.5

    def test_selective_phase_disable(self):
        config = AnalysisConfig(enabled=True)
        config.phases["memories"].enabled = False
        config.phases["impressions"].enabled = False
        phases = config.enabled_phases()
        assert "memories" not in phases
        assert "impressions" not in phases
        assert "conductor" in phases

    def test_from_dict_enabled(self):
        d = {
            "enabled": True,
            "phases": {
                "memories": {"enabled": True, "temperature": 0.3},
                "conductor": {"enabled": False},
            }
        }
        config = AnalysisConfig.from_dict(d)
        assert config.enabled is True
        assert config.phases["memories"].temperature == 0.3
        assert config.phases["conductor"].enabled is False
        # Unspecified phases should get defaults
        assert config.phases["impressions"].enabled is True

    def test_from_dict_none(self):
        config = AnalysisConfig.from_dict(None)
        assert config.enabled is False

    def test_from_dict_disabled(self):
        d = {"enabled": False}
        config = AnalysisConfig.from_dict(d)
        assert config.enabled is False

    def test_is_phase_enabled(self):
        config = AnalysisConfig(enabled=False)
        assert config.is_phase_enabled("memories") is False
        config.enabled = True
        assert config.is_phase_enabled("memories") is True
        config.phases["memories"].enabled = False
        assert config.is_phase_enabled("memories") is False


# ═══════════════════════════════════════════════════════════════
# Phase Implementation Tests
# ═══════════════════════════════════════════════════════════════

@pytest.fixture
def mock_provider():
    """Return a mock LLM provider that returns a configurable JSON response."""
    provider = AsyncMock()
    return provider


def make_response(json_data) -> MagicMock:
    """Create a mock LlmResponse with the given JSON content."""
    resp = MagicMock()
    resp.content = json.dumps(json_data)
    return resp


class TestPhaseMemories:
    @pytest.mark.asyncio
    async def test_extracts_memories(self, mock_provider):
        mock_provider.chat.return_value = make_response([
            {"domain": "personal", "content": "User lives in Berlin"},
            {"domain": "professional", "content": "User is a software engineer"},
        ])
        results = await phase_memories(mock_provider, "I live in Berlin and work as a software engineer.", "", 0.2)
        assert len(results) == 2
        assert results[0].domain == "personal"
        assert results[0].content == "User lives in Berlin"

    @pytest.mark.asyncio
    async def test_empty_when_nothing_new(self, mock_provider):
        mock_provider.chat.return_value = make_response([])
        results = await phase_memories(mock_provider, "Hello", "", 0.2)
        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_handles_parse_error(self, mock_provider):
        mock_provider.chat.return_value = make_response("not json")
        results = await phase_memories(mock_provider, "test", "", 0.2)
        assert len(results) == 0


class TestPhaseImpressions:
    @pytest.mark.asyncio
    async def test_extracts_impressions(self, mock_provider):
        mock_provider.chat.return_value = make_response([
            {"type": "emotional", "certainty": "high", "description": "User is frustrated with the bug"},
        ])
        results = await phase_impressions(mock_provider, "This bug keeps happening! I've tried everything.", "", 0.5)
        assert len(results) == 1
        assert results[0].type == "emotional"
        assert results[0].certainty == "high"


class TestPhaseConcepts:
    @pytest.mark.asyncio
    async def test_extracts_concepts(self, mock_provider):
        mock_provider.chat.return_value = make_response([
            {"name": "Quantum Workflow", "domain": "technology", "description": "A workflow paradigm", "glyphset": "⚛️"},
        ])
        results = await phase_concepts(mock_provider, "I've been thinking about quantum workflows...", "", 0.5)
        assert len(results) == 1
        assert results[0].name == "Quantum Workflow"


class TestPhaseAssumptions:
    @pytest.mark.asyncio
    async def test_extracts_assumptions(self, mock_provider):
        mock_provider.chat.return_value = make_response([
            {"context": "Python", "goal": "sort list", "constraints": "performance matters"},
        ])
        results = await phase_assumptions(
            mock_provider, "How do I sort a large list in Python fast?", "", 0.2
        )
        assert len(results) == 1
        assert results[0].goal == "sort list"


class TestPhaseIntent:
    @pytest.mark.asyncio
    async def test_classifies_intent(self, mock_provider):
        mock_provider.chat.return_value = make_response({
            "primary": "question",
            "secondary": ["technical"],
            "confidence": 0.9,
            "urgency": "medium",
            "requires_tools": False,
            "requires_rag": True,
            "topic": "Python sorting",
        })
        result = await phase_intent(mock_provider, "How do I sort a list in Python?", 0.4)
        assert result["primary"] == "question"
        assert result["confidence"] == 0.9


class TestPhaseCodeDetect:
    @pytest.mark.asyncio
    async def test_detects_code_request(self, mock_provider):
        mock_provider.chat.return_value = make_response([
            {"language": "python", "prompt": "Write a sorting function", "temperature": "0.1", "top_p": "1.0"},
        ])
        results = await phase_code_detect(mock_provider, "Write a Python function to sort a list", "", 0.5)
        assert len(results) == 1
        assert results[0].language == "python"

    @pytest.mark.asyncio
    async def test_no_code_request(self, mock_provider):
        mock_provider.chat.return_value = make_response([])
        results = await phase_code_detect(mock_provider, "Hello, how are you?", "", 0.5)
        assert len(results) == 0


class TestPhaseSearchDetect:
    @pytest.mark.asyncio
    async def test_search_needed(self, mock_provider):
        mock_provider.chat.return_value = make_response({"search": "latest Python 3.13 features"})
        needed, prompt = await phase_search_detect(mock_provider, "What's new in Python 3.13?", "", 0.4)
        assert needed is True
        assert "Python" in prompt

    @pytest.mark.asyncio
    async def test_no_search_needed(self, mock_provider):
        mock_provider.chat.return_value = make_response({"search": "noSearch"})
        needed, prompt = await phase_search_detect(mock_provider, "Hello", "", 0.4)
        assert needed is False
        assert prompt == ""


class TestPhaseConductor:
    @pytest.mark.asyncio
    async def test_determines_parameters(self, mock_provider):
        mock_provider.chat.return_value = make_response({
            "temperature": 0.3,
            "top_p": 0.9,
            "prompt": "Respond with factual precision.",
        })
        result = await phase_conductor(
            mock_provider, "What is the capital of France?", "", 0.5, {}
        )
        assert result.temperature == 0.3
        assert result.top_p == 0.9
        assert "factual" in result.prompt

    @pytest.mark.asyncio
    async def test_defaults_on_error(self, mock_provider):
        mock_provider.chat.return_value = make_response("not json")
        result = await phase_conductor(mock_provider, "test", "", 0.5, {})
        assert result.temperature == 0.7
        assert result.top_p == 1.0


# ═══════════════════════════════════════════════════════════════
# Pipeline Orchestrator Tests
# ═══════════════════════════════════════════════════════════════

class TestRunAnalysisPipeline:
    @pytest.mark.asyncio
    async def test_noop_when_disabled(self):
        config = AnalysisConfig(enabled=False)
        results = await run_analysis_pipeline("Hello", "", config)
        assert results.memories == []
        assert results.impressions == []
        assert results.conductor is None

    @pytest.mark.asyncio
    async def test_runs_enabled_phases_parallel(self):
        """Verify enabled phases execute and produce results."""
        config = AnalysisConfig(enabled=True)
        # Disable most phases for speed, only test a few
        for name in config.phases:
            config.phases[name].enabled = False
        config.phases["memories"].enabled = True
        config.phases["impressions"].enabled = True
        config.phases["intent"].enabled = True

        # Mock the provider
        call_count = 0
        responses = [
            make_response([{"domain": "test", "content": "User test"}]),
            make_response([{"type": "emotional", "certainty": "high", "description": "Happy"}]),
            make_response({"primary": "greeting", "confidence": 0.9}),
        ]

        async def mock_chat(**kwargs):
            nonlocal call_count
            resp = responses[call_count % len(responses)]
            call_count += 1
            return resp

        mock_provider = AsyncMock()
        mock_provider.chat = mock_chat

        results = await run_analysis_pipeline("Hello!", "", config, mock_provider)

        assert len(results.memories) == 1
        assert len(results.impressions) == 1
        assert results.intent.get("primary") == "greeting"
        assert results.conductor is None  # conductor was disabled

    @pytest.mark.asyncio
    async def test_conductor_runs_last(self):
        """Conductor should have access to phase results."""
        config = AnalysisConfig(enabled=True)
        for name in config.phases:
            config.phases[name].enabled = False
        config.phases["impressions"].enabled = True
        config.phases["conductor"].enabled = True

        call_order = []

        def make_chat_fn(name, response):
            async def fn(**kwargs):
                call_order.append(name)
                return response
            return fn

        mock_provider = AsyncMock()
        mock_provider.chat = make_chat_fn(
            "conductor",
            make_response({"temperature": 0.3, "top_p": 0.9, "prompt": "Be precise."}),
        )

        # Override to test order — impressions and conductor share the same mock
        # We'll use side_effect
        responses_order = [
            make_response([{"type": "emotional", "certainty": "medium", "description": "Curious"}]),
            make_response({"temperature": 0.3, "top_p": 0.9, "prompt": "Be precise."}),
        ]

        async def side_effect(**kwargs):
            resp = responses_order.pop(0)
            return resp

        mock_provider.chat = side_effect

        results = await run_analysis_pipeline("Tell me about Mars", "", config, mock_provider)

        assert results.impressions[0].description == "Curious"
        assert results.conductor.temperature == 0.3

    @pytest.mark.asyncio
    async def test_handles_phase_errors_gracefully(self):
        """A failing phase should not crash the pipeline."""
        config = AnalysisConfig(enabled=True)
        for name in config.phases:
            config.phases[name].enabled = False
        config.phases["memories"].enabled = True
        config.phases["impressions"].enabled = True

        mock_provider = AsyncMock()
        # First call succeeds, second raises
        mock_provider.chat.side_effect = [
            make_response([{"domain": "test", "content": "ok"}]),
            Exception("Simulated failure"),
        ]

        results = await run_analysis_pipeline("Hello", "", config, mock_provider)
        assert len(results.memories) == 1
        assert len(results.impressions) == 0
        # _call_llm_json catches exceptions defensively; errors don't propagate to pipeline
        assert len(results.errors) == 0


# ═══════════════════════════════════════════════════════════════
# LangGraph Node Integration Tests
# ═══════════════════════════════════════════════════════════════

class DummyState:
    """Minimal AgentState stand-in for node testing."""
    def __init__(self, **kwargs):
        self.session_id = kwargs.get("session_id", "test-session")
        self.user_message = kwargs.get("user_message", "")
        self.system_prompt = kwargs.get("system_prompt", "")
        self.model = kwargs.get("model", "deepseek-chat")
        self.temperature = kwargs.get("temperature", 0.7)
        self.top_p = kwargs.get("top_p", 1.0)
        self.max_tokens = kwargs.get("max_tokens", 4096)
        self.messages = kwargs.get("messages", [])
        self.response_chunks = kwargs.get("response_chunks", [])
        self.analysis_config = kwargs.get("analysis_config", None)
        self.analysis_results = kwargs.get("analysis_results", None)
        self.finished = kwargs.get("finished", False)
        self.error = kwargs.get("error", None)
        self.mcp_server_urls = kwargs.get("mcp_server_urls", [])
        self.context_ids = kwargs.get("context_ids", [])
        self.tools = kwargs.get("tools", [])
        self.rag_results = kwargs.get("rag_results", [])
        self.user_identity = kwargs.get("user_identity", "")
        self.route = kwargs.get("route", "safe")


class TestAnalysisPipelineNode:
    @pytest.mark.asyncio
    async def test_noop_without_config(self):
        """Node should be a no-op when analysis_config is None."""
        state = DummyState(user_message="Hello", system_prompt="Be helpful")
        original_temp = state.temperature
        original_prompt = state.system_prompt

        result = await analysis_pipeline_node(state)

        assert result.temperature == original_temp
        assert result.system_prompt == original_prompt
        assert result.analysis_results is None

    @pytest.mark.asyncio
    async def test_noop_when_disabled(self):
        """Node should be a no-op when analysis is disabled."""
        state = DummyState(
            user_message="Hello",
            system_prompt="Be helpful",
            analysis_config={"enabled": False},
        )
        original_temp = state.temperature

        result = await analysis_pipeline_node(state)

        assert result.temperature == original_temp
        assert result.analysis_results is not None  # empty results set
        assert result.analysis_results["conductor"]["temperature"] == 0.7  # default

    @pytest.mark.asyncio
    @patch("src.analysis_pipeline.get_provider")
    async def test_conductor_overrides_temperature(self, mock_get_provider):
        """When conductor is enabled, it should override state.temperature."""
        mock_provider = AsyncMock()
        mock_get_provider.return_value = mock_provider

        # Conductor will be called with the analysis results
        mock_provider.chat.return_value = make_response({
            "temperature": 0.2,
            "top_p": 0.8,
            "prompt": "Respond with cold precision.",
        })

        config = {
            "enabled": True,
            "phases": {
                "conductor": {"enabled": True, "temperature": 0.5},
            },
        }
        # Disable all other phases
        for name in ["memories", "impressions", "concepts", "assumptions", "intent", "code_detect", "search_detect"]:
            config["phases"][name] = {"enabled": False}

        state = DummyState(
            user_message="What is 2+2?",
            system_prompt="Be helpful",
            temperature=0.7,
            top_p=1.0,
            analysis_config=config,
        )

        result = await analysis_pipeline_node(state)

        assert result.temperature == 0.2
        assert result.top_p == 0.8
        assert "Conductor Guidance" in result.system_prompt
        assert "cold precision" in result.system_prompt

    @pytest.mark.asyncio
    @patch("src.analysis_pipeline.get_provider")
    async def test_dml_instructions_injected(self, mock_get_provider):
        """When output_routing is enabled, DML instructions should be in system prompt."""
        mock_provider = AsyncMock()
        mock_provider.chat.return_value = make_response([])
        mock_get_provider.return_value = mock_provider

        config = {
            "enabled": True,
            "phases": {
                "conductor": {"enabled": False},
                "output_routing": {"enabled": True},
            },
        }
        # Disable all other phases
        for name in ["memories", "impressions", "concepts", "assumptions", "intent", "code_detect", "search_detect"]:
            config["phases"][name] = {"enabled": False}

        state = DummyState(
            user_message="Write a quick sort in Python",
            system_prompt="You are a helpful assistant.",
            analysis_config=config,
        )

        result = await analysis_pipeline_node(state)

        assert "Output Precision Control" in result.system_prompt
        assert "((code))" in result.system_prompt
        assert "((story))" in result.system_prompt
        assert "temperature 0.1" in result.system_prompt
        assert "((/))" in result.system_prompt

    @pytest.mark.asyncio
    @patch("src.analysis_pipeline.get_provider")
    async def test_dml_instructions_not_injected_when_disabled(self, mock_get_provider):
        """When output_routing is disabled, DML instructions should NOT appear."""
        mock_provider = AsyncMock()
        mock_provider.chat.return_value = make_response([])
        mock_get_provider.return_value = mock_provider

        config = {
            "enabled": True,
            "phases": {
                "conductor": {"enabled": False},
                "output_routing": {"enabled": False},
            },
        }
        for name in ["memories", "impressions", "concepts", "assumptions", "intent", "code_detect", "search_detect"]:
            config["phases"][name] = {"enabled": False}

        state = DummyState(
            user_message="Hello",
            system_prompt="You are a helpful assistant.",
            analysis_config=config,
        )

        result = await analysis_pipeline_node(state)

        assert "Output Precision Control" not in result.system_prompt
        assert "((code))" not in result.system_prompt

    @pytest.mark.asyncio
    async def test_references_chunk_emitted(self):
        """Enabled analysis should emit REFERENCES chunks."""
        state = DummyState(
            user_message="Hello",
            analysis_config={"enabled": True},
        )

        # Don't actually call LLM — just verify chunk format
        # Use a patched provider
        with patch("src.analysis_pipeline.get_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.chat.return_value = make_response([])  # empty for all phases
            mock_get_provider.return_value = mock_provider

            result = await analysis_pipeline_node(state)

            # Should have at least the "Analysis complete" chunk
            reference_chunks = [c for c in result.response_chunks if c.get("state") == "REFERENCES"]
            assert len(reference_chunks) >= 1
            assert "Analysis complete" in reference_chunks[0]["text_chunk"]


# ═══════════════════════════════════════════════════════════════
# Backward Compatibility Tests
# ═══════════════════════════════════════════════════════════════

class TestBackwardCompatibility:
    """Verify existing agent configs (without analysis block) still work."""

    def test_agent_state_defaults(self):
        """New fields should have safe defaults."""
        from src.agent_graph import AgentState
        state = AgentState()
        assert state.analysis_config is None
        assert state.analysis_results is None
        assert state.top_p == 1.0
        assert state.temperature == 0.7

    def test_config_without_analysis(self):
        """Config dict without 'analysis' key should produce disabled AnalysisConfig."""
        config = AnalysisConfig.from_dict(None)
        assert config.enabled is False

    @pytest.mark.asyncio
    async def test_graph_includes_analysis_node(self):
        """The compiled graph should include the analysis_pipeline node."""
        from src.agent_graph import build_agent_graph
        graph = build_agent_graph()
        # The node should exist in the graph
        nodes = graph.get_graph().nodes
        assert "analysis_pipeline" in nodes


# ═══════════════════════════════════════════════════════════════
# Results Serialization
# ═══════════════════════════════════════════════════════════════

class TestAnalysisResultsSerialization:
    def test_to_dict(self):
        results = AnalysisResults(
            memories=[MemoryResult(domain="personal", content="User likes cats")],
            impressions=[ImpressionResult(type="emotional", certainty="high", description="Happy")],
            concepts=[ConceptResult(name="Design Thinking", domain="methodology", description="A process", glyphset="🧠")],
            assumptions=[AssumptionResult(context="meeting", goal="schedule", constraints="time")],
            intent={"primary": "command", "confidence": 0.8},
            code_requests=[CodeRequest(language="python", prompt="sort list", temperature="0.1", top_p="1.0")],
            search_needed=True,
            search_prompt="latest AI news",
            conductor=ConductorResult(temperature=0.3, top_p=0.9, prompt="Be factual"),
        )

        d = results.to_dict()
        assert d["memories"][0]["domain"] == "personal"
        assert d["impressions"][0]["type"] == "emotional"
        assert d["concepts"][0]["name"] == "Design Thinking"
        assert d["assumptions"][0]["goal"] == "schedule"
        assert d["intent"]["primary"] == "command"
        assert d["code_requests"][0]["language"] == "python"
        assert d["search_needed"] is True
        assert d["search_prompt"] == "latest AI news"
        assert d["conductor"]["temperature"] == 0.3
        assert d["conductor"]["top_p"] == 0.9

    def test_empty_to_dict(self):
        results = AnalysisResults()
        d = results.to_dict()
        assert d["memories"] == []
        assert d["impressions"] == []
        assert d["conductor"]["temperature"] == 0.7


# ═══════════════════════════════════════════════════════════════
# DML Output Router Tests
# ═══════════════════════════════════════════════════════════════

from src.analysis_pipeline import (
    parse_dml_segments,
    DmlSegment,
    output_router_node,
    _DML_DEFAULT_TEMPERATURES,
    _DML_SEGMENT_PATTERN,
)


class TestParseDmlSegments:
    def test_no_markers_returns_speech(self):
        text = "Hello, here is a normal response without any DML markers."
        segments = parse_dml_segments(text)
        assert len(segments) == 1
        assert segments[0].type == "SPEECH"
        assert segments[0].temperature == 0.7
        assert segments[0].content == text

    def test_single_code_segment(self):
        text = '((code))\ndef foo():\n    return 42\n((/))'
        segments = parse_dml_segments(text)
        assert len(segments) == 1
        assert segments[0].type == "CODE"
        assert segments[0].temperature == 0.1
        assert "def foo()" in segments[0].content

    def test_single_story_segment(self):
        text = '((story))\nOnce upon a time, in a land of circuits...\n((/))'
        segments = parse_dml_segments(text)
        assert len(segments) == 1
        assert segments[0].type == "STORY"
        assert segments[0].temperature == 1.5

    def test_mixed_segments_with_between_text(self):
        text = (
            "Let me explain.\n\n"
            '((code))\nprint("hello")\n((/))\n\n'
            "And here's a story:\n\n"
            '((story))\nThe robot learned to paint.\n((/))\n\n'
            "Hope that helps!"
        )
        segments = parse_dml_segments(text)
        assert len(segments) == 5  # SPEECH, CODE, SPEECH, STORY, SPEECH
        assert segments[0].type == "SPEECH"
        assert segments[1].type == "CODE"
        assert segments[2].type == "SPEECH"
        assert segments[3].type == "STORY"
        assert segments[4].type == "SPEECH"

    def test_explicit_temperature_override(self):
        text = '((code temp="0.01"))\ndef foo():\n    pass\n((/))'
        segments = parse_dml_segments(text)
        assert len(segments) == 1
        assert segments[0].type == "CODE"
        assert segments[0].temperature == 0.01

    def test_case_insensitive_type(self):
        text = '((Code))\nprint("hi")\n((/))'
        segments = parse_dml_segments(text)
        assert len(segments) == 1
        assert segments[0].type == "CODE"

    def test_multiple_code_segments(self):
        text = (
            '((code))\ndef foo():\n    pass\n((/))\n\n'
            '((code))\ndef bar():\n    pass\n((/))'
        )
        segments = parse_dml_segments(text)
        assert len(segments) == 2
        assert segments[0].type == "CODE"
        assert segments[1].type == "CODE"

    def test_all_segment_types(self):
        for seg_type, expected_temp in [
            ("CODE", 0.1), ("MATH", 0.1), ("FACT", 0.3),
            ("ANALOGY", 1.0), ("HUMOR", 1.8), ("STORY", 1.5),
        ]:
            text = f'(({seg_type.lower()}))\ncontent\n((/))'
            segments = parse_dml_segments(text)
            assert len(segments) == 1, f"Failed for {seg_type}"
            assert segments[0].type == seg_type, f"Wrong type for {seg_type}"
            assert segments[0].temperature == expected_temp, f"Wrong temp for {seg_type}"

    def test_empty_content_skipped(self):
        text = '((code))\n\n((/))\nSome text\n((story))\n\n((/))'
        segments = parse_dml_segments(text)
        # Both empty segments skipped, only trailing text remains
        assert len(segments) == 1
        assert segments[0].type == "SPEECH"

    def test_empty_input(self):
        segments = parse_dml_segments("")
        assert len(segments) == 0

    def test_whitespace_only(self):
        segments = parse_dml_segments("   \n  ")
        assert len(segments) == 0


class TestDmlSegmentPattern:
    def test_pattern_matches_basic_segment(self):
        text = '((code))\nprint("hi")\n((/))'
        matches = list(_DML_SEGMENT_PATTERN.finditer(text))
        assert len(matches) == 1
        assert matches[0].group(1) == "code"
        assert "print" in matches[0].group(3)

    def test_pattern_matches_with_attributes(self):
        text = '((code temp="0.2" lang="python"))\nprint("hi")\n((/))'
        matches = list(_DML_SEGMENT_PATTERN.finditer(text))
        assert len(matches) == 1
        assert matches[0].group(1) == "code"
        assert 'temp="0.2"' in matches[0].group(2)

    def test_pattern_captures_multiline_content(self):
        text = '((story))\nLine 1\nLine 2\nLine 3\n((/))'
        matches = list(_DML_SEGMENT_PATTERN.finditer(text))
        assert len(matches) == 1
        content = matches[0].group(3)
        assert "Line 1" in content
        assert "Line 3" in content

    def test_pattern_handles_adjacent_segments(self):
        text = '((code))\nfoo\n((/))\n((story))\nbar\n((/))'
        matches = list(_DML_SEGMENT_PATTERN.finditer(text))
        assert len(matches) == 2


class TestOutputRouterNode:
    def make_state(self, **kwargs):
        """Create a minimal state object for testing."""
        class State:
            pass
        state = State()
        state.analysis_config = kwargs.get("analysis_config", None)
        state.response_chunks = kwargs.get("response_chunks", [])
        state.model = kwargs.get("model", "deepseek-chat")
        state.max_tokens = kwargs.get("max_tokens", 2048)
        state.messages = kwargs.get("messages", [])
        state.user_message = kwargs.get("user_message", "")
        state.system_prompt = kwargs.get("system_prompt", "")
        state.temperature = kwargs.get("temperature", 0.7)
        state.top_p = kwargs.get("top_p", 1.0)
        state.route = kwargs.get("route", "safe")
        return state

    @pytest.mark.asyncio
    async def test_noop_without_config(self):
        state = self.make_state()
        result = await output_router_node(state)
        assert result is state  # Returned unchanged

    @pytest.mark.asyncio
    async def test_noop_when_disabled(self):
        state = self.make_state(
            analysis_config={"enabled": False},
        )
        result = await output_router_node(state)
        assert result is state

    @pytest.mark.asyncio
    async def test_noop_without_output_routing_phase(self):
        state = self.make_state(
            analysis_config={
                "enabled": True,
                "phases": {"output_routing": {"enabled": False}},
            },
            response_chunks=[{"state": "STREAMING", "text_chunk": "Hello"}],
        )
        result = await output_router_node(state)
        # Should not modify chunks
        assert len(result.response_chunks) == 1

    @pytest.mark.asyncio
    async def test_noop_without_dml_markers(self):
        state = self.make_state(
            analysis_config={
                "enabled": True,
                "phases": {"output_routing": {"enabled": True}},
            },
            response_chunks=[
                {"state": "STREAMING", "text_chunk": "Just a normal response."},
            ],
        )
        result = await output_router_node(state)
        # Only one SPEECH segment — unchanged
        assert len(result.response_chunks) == 1
        assert result.response_chunks[0]["text_chunk"] == "Just a normal response."

    @pytest.mark.asyncio
    async def test_routes_dml_segments(self):
        """Full integration: DML markers trigger segment routing."""
        state = self.make_state(
            analysis_config={
                "enabled": True,
                "phases": {"output_routing": {"enabled": True}},
            },
            response_chunks=[
                {"state": "STREAMING", "text_chunk": '((code))\nprint("hello")\n((/))'},
            ],
        )

        with patch("src.analysis_pipeline.get_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.chat.return_value = make_response(
                'print("hello")\n# This code prints a greeting'
            )
            mock_get_provider.return_value = mock_provider

            result = await output_router_node(state)

        # Old STREAMING chunk removed, new one added
        streaming = [c for c in result.response_chunks if c["state"] == "STREAMING"]
        assert len(streaming) == 1
        assert "print" in streaming[0]["text_chunk"]

        # Reference chunk emitted
        refs = [c for c in result.response_chunks if c["state"] == "REFERENCES"]
        assert any("DML output routing" in c.get("text_chunk", "") for c in refs)

    @pytest.mark.asyncio
    async def test_mixed_segments_routed(self):
        """Multiple DML segments should each get their own LLM call."""
        state = self.make_state(
            analysis_config={
                "enabled": True,
                "phases": {"output_routing": {"enabled": True}},
            },
            response_chunks=[
                {"state": "STREAMING", "text_chunk": (
                    '((fact))\nThe sky is blue.\n((/))\n\n'
                    '((story))\nA cloud drifted by.\n((/))'
                )},
            ],
        )

        call_count = 0

        async def side_effect(**kwargs):
            nonlocal call_count
            call_count += 1
            temp = kwargs.get("temperature", 0.7)
            resp = MagicMock()
            resp.content = f"[rendered at {temp}]"
            return resp

        with patch("src.analysis_pipeline.get_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.chat = side_effect
            mock_get_provider.return_value = mock_provider

            result = await output_router_node(state)

        # Two non-SPEECH segments = 2 LLM calls
        assert call_count == 2

        streaming = [c for c in result.response_chunks if c["state"] == "STREAMING"]
        assert len(streaming) == 1

    @pytest.mark.asyncio
    async def test_segment_failure_graceful(self):
        """If a segment render fails, original content is preserved."""
        state = self.make_state(
            analysis_config={
                "enabled": True,
                "phases": {"output_routing": {"enabled": True}},
            },
            response_chunks=[
                {"state": "STREAMING", "text_chunk": '((code))\nbad code\n((/))'},
            ],
        )

        with patch("src.analysis_pipeline.get_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.chat.side_effect = Exception("API failure")
            mock_get_provider.return_value = mock_provider

            result = await output_router_node(state)

        streaming = [c for c in result.response_chunks if c["state"] == "STREAMING"]
        assert len(streaming) == 1
        # Content not lost
        assert "bad code" in streaming[0]["text_chunk"]

    @pytest.mark.asyncio
    async def test_non_streaming_chunks_preserved(self):
        """Non-STREAMING chunks (REFERENCES, TOOL_USED, etc.) survive routing."""
        state = self.make_state(
            analysis_config={
                "enabled": True,
                "phases": {"output_routing": {"enabled": True}},
            },
            response_chunks=[
                {"state": "REFERENCES", "text_chunk": "Found 3 sources."},
                {"state": "STREAMING", "text_chunk": '((fact))\nAnswer here.\n((/))'},
                {"state": "TOOL_USED", "tool_call": {"name": "search"}},
            ],
        )

        with patch("src.analysis_pipeline.get_provider") as mock_get_provider:
            mock_provider = AsyncMock()
            mock_provider.chat.return_value = make_response(
                "Rendered: Answer here."
            )
            mock_get_provider.return_value = mock_provider

            result = await output_router_node(state)

        refs = [c for c in result.response_chunks if c["state"] == "REFERENCES"]
        tools = [c for c in result.response_chunks if c["state"] == "TOOL_USED"]
        streaming = [c for c in result.response_chunks if c["state"] == "STREAMING"]

        assert len(refs) >= 2  # original + DML routing notice
        assert len(tools) == 1
        assert len(streaming) == 1


# ═══════════════════════════════════════════════════════════════
# New Lucid Capability Tests
# ═══════════════════════════════════════════════════════════════

from src.analysis_pipeline import (
    phase_global_memories,
    phase_next,
    phase_search_execute,
)


class TestPhaseGlobalMemories:
    @pytest.mark.asyncio
    async def test_extracts_global_knowledge(self):
        provider = AsyncMock()
        provider.chat.return_value = make_response([
            {"name": "Recursive Pattern", "domain": "meta", "description": "Users often ask about recursion", "glyphset": "🌀", "type": "concept_synthesis"},
        ])
        results = await phase_global_memories(provider, "Can you explain recursion again?", "", 0.5)
        assert len(results) == 1
        assert results[0]["name"] == "Recursive Pattern"
        assert results[0]["type"] == "concept_synthesis"

    @pytest.mark.asyncio
    async def test_empty_when_nothing_global(self):
        provider = AsyncMock()
        provider.chat.return_value = make_response([])
        results = await phase_global_memories(provider, "What's the weather?", "", 0.5)
        assert len(results) == 0


class TestPhaseNext:
    @pytest.mark.asyncio
    async def test_predicts_next_messages(self):
        provider = AsyncMock()
        provider.chat.return_value = make_response([
            "What about sorting algorithms?",
            "Can you show an example?",
            "How does this compare to bubble sort?",
        ])
        results = await phase_next(provider, "Explain quicksort.", "", 0.5)
        assert len(results) == 3
        assert "sort" in results[0].lower()

    @pytest.mark.asyncio
    async def test_handles_non_list_response(self):
        provider = AsyncMock()
        provider.chat.return_value = make_response({"not": "a list"})
        results = await phase_next(provider, "Hello", "", 0.5)
        assert results == []


class TestPhaseSearchExecute:
    @pytest.mark.asyncio
    async def test_executes_search(self):
        provider = AsyncMock()
        provider.chat.return_value = make_response("Paris is the capital of France.")
        result = await phase_search_execute(provider, "What is the capital of France?", 0.3)
        assert "Paris" in result

    @pytest.mark.asyncio
    async def test_skips_empty_prompt(self):
        provider = AsyncMock()
        result = await phase_search_execute(provider, "", 0.3)
        assert result == ""

    @pytest.mark.asyncio
    async def test_skips_no_search_prompt(self):
        provider = AsyncMock()
        result = await phase_search_execute(provider, "noSearch", 0.3)
        assert result == ""

    @pytest.mark.asyncio
    async def test_handles_error_gracefully(self):
        provider = AsyncMock()
        provider.chat.side_effect = Exception("API error")
        result = await phase_search_execute(provider, "search this", 0.3)
        assert result == ""


class TestAnalysisConfigNewPhases:
    def test_new_phases_in_defaults(self):
        config = AnalysisConfig(enabled=True)
        assert config.is_phase_enabled("global_memories") is True
        assert config.is_phase_enabled("next") is True
        assert config.is_phase_enabled("search_execute") is True
        assert config.phases["global_memories"].temperature == 0.5
        assert config.phases["next"].temperature == 0.5

    def test_new_phases_toggleable(self):
        config = AnalysisConfig(enabled=True)
        config.phases["global_memories"].enabled = False
        config.phases["next"].enabled = False
        assert config.is_phase_enabled("global_memories") is False
        assert config.is_phase_enabled("next") is False


class TestAnalysisResultsNewFields:
    def test_new_fields_serialized(self):
        results = AnalysisResults(
            global_memories=[{"name": "test", "domain": "x", "description": "y"}],
            next_predictions=["pred1", "pred2"],
            search_result="Search completed.",
        )
        d = results.to_dict()
        assert len(d["global_memories"]) == 1
        assert d["next_predictions"] == ["pred1", "pred2"]
        assert d["search_result"] == "Search completed."

    def test_new_fields_empty_by_default(self):
        results = AnalysisResults()
        d = results.to_dict()
        assert d["global_memories"] == []
        assert d["next_predictions"] == []
        assert d["search_result"] == ""


class TestTokenTracker:
    @pytest.mark.asyncio
    async def test_get_balance(self):
        from src.token_tracker import TokenTracker
        db = AsyncMock()
        db.get_token_balance.return_value = 1000
        tracker = TokenTracker(db)
        balance = await tracker.get_balance("user1", "agent1")
        assert balance == 1000

    @pytest.mark.asyncio
    async def test_debit_insufficient(self):
        from src.token_tracker import TokenTracker
        db = AsyncMock()
        db.debit_tokens.return_value = None
        tracker = TokenTracker(db)
        result = await tracker.debit("user1", 5000, "agent1")
        assert result is None

    @pytest.mark.asyncio
    async def test_debit_success(self):
        from src.token_tracker import TokenTracker
        db = AsyncMock()
        db.debit_tokens.return_value = {"balance": 500}
        tracker = TokenTracker(db)
        result = await tracker.debit("user1", 500, "agent1")
        assert result["balance"] == 500


class TestGlyphSystem:
    def test_format_for_prompt(self):
        from src.glyph_system import GlyphSystem
        db = AsyncMock()
        gs = GlyphSystem(db)
        glyphs = [
            {"name": "recursion", "symbol": "🌀", "description": "Recursive depth"},
            {"name": "emergence", "symbol": "⬡", "description": "Patterns from rules"},
        ]
        result = gs.format_for_prompt(glyphs)
        assert "(recursion) 🌀" in result
        assert "(emergence) ⬡" in result
        assert "Known Glyphs" in result

    def test_format_for_prompt_empty(self):
        from src.glyph_system import GlyphSystem
        db = AsyncMock()
        gs = GlyphSystem(db)
        result = gs.format_for_prompt([])
        assert result == ""

    def test_format_list(self):
        from src.glyph_system import GlyphSystem
        db = AsyncMock()
        gs = GlyphSystem(db)
        glyphs = [{"name": "test", "symbol": "T", "description": "desc", "glyphset": "set"}]
        result = gs.format_list(glyphs)
        assert result[0]["name"] == "test"
        assert result[0]["symbol"] == "T"


class TestNextPredictionsInjection:
    @pytest.mark.asyncio
    @patch("src.analysis_pipeline.get_provider")
    async def test_next_predictions_emitted_as_follow_up(self, mock_get_provider):
        """When next phase is enabled, predictions should appear as FOLLOW_UP chunks."""
        mock_provider = AsyncMock()
        # Phase "next" returns predictions, all other phases return empty
        call_responses = {
            "next": make_response(["Question 1?", "Question 2?", "Question 3?"]),
        }

        async def side_effect(**kwargs):
            # Return empty for all phases except next
            user_content = kwargs.get("messages", [{}])[-1].get("content", "")
            if "predict what they might ask" in str(kwargs.get("messages", [{}])[0].get("content", "")):
                return make_response(["Question 1?", "Question 2?", "Question 3?"])
            return make_response([])

        mock_provider.chat = side_effect
        mock_get_provider.return_value = mock_provider

        config = {
            "enabled": True,
            "phases": {
                "next": {"enabled": True, "temperature": 0.5},
            },
        }
        for name in ["memories", "impressions", "concepts", "assumptions", "intent", "conductor", "code_detect", "search_detect", "global_memories", "search_execute"]:
            if name not in config["phases"]:
                config["phases"][name] = {"enabled": False}

        state = DummyState(
            user_message="Tell me about Python",
            analysis_config=config,
            response_chunks=[],
        )

        result = await analysis_pipeline_node(state)

        follow_ups = [c for c in result.response_chunks if c.get("state") == "FOLLOW_UP"]
        assert len(follow_ups) >= 1
        questions = follow_ups[0].get("follow_up_questions", [])
        assert len(questions) == 3
        assert any("Question" in q for q in questions)
