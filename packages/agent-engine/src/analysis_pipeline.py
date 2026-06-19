"""Analysis Pipeline — Lucid-style pre-response input analysis for Vibeful agents.

Maps Lucid's conductAnalysis (9 parallel LLM calls) onto Vibeful's LangGraph
architecture. Each analysis phase is independently toggleable via agent config.

Phases (inspired by lucid-sensai/backend/llm.js: conductAnalysis):
  memories      — Extract new user facts (temp 0.2)
  impressions   — Emotional tone / mindset inference (temp 0.5)
  concepts      — Identify new conceptual frameworks (temp 0.5)
  assumptions   — Identify implicit user assumptions (temp 0.2)
  intent        — Rich intent classification (temp 0.4)
  conductor     — Determine response temperature / top_p / prompt (temp 0.5)
  code_detect   — Detect code generation requests (temp 0.5)
  search_detect — Determine if web search is needed (temp 0.4)

All enabled phases run in parallel via asyncio.gather.
The conductor phase runs last (depends on other results).
"""

from __future__ import annotations

import json as _json
import asyncio
from dataclasses import dataclass, field
from typing import Any

from .llm import get_provider, LlmProvider


# ═══════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════

@dataclass
class PhaseConfig:
    """Per-phase configuration."""
    enabled: bool = True
    temperature: float = 0.5

    @classmethod
    def from_dict(cls, d: dict | None) -> PhaseConfig:
        if d is None:
            return cls()
        return cls(
            enabled=d.get("enabled", True),
            temperature=d.get("temperature", 0.5),
        )


@dataclass
class AnalysisConfig:
    """Top-level analysis configuration for an agent."""
    enabled: bool = False
    phases: dict[str, PhaseConfig] = field(default_factory=dict)

    _DEFAULT_PHASES: dict[str, float] = field(default_factory=lambda: {
        "memories": 0.2,
        "impressions": 0.5,
        "concepts": 0.5,
        "assumptions": 0.2,
        "intent": 0.4,
        "conductor": 0.5,
        "code_detect": 0.5,
        "search_detect": 0.4,
        "global_memories": 0.5,
        "next": 0.5,
        "search_execute": 0.0,  # post-analysis: executes actual web search
        "output_routing": 0.0,  # not a temperature — marker for post-response segment routing
    }, init=False, repr=False)

    def __post_init__(self):
        # Fill in defaults for any missing phases
        for phase_name, default_temp in self._DEFAULT_PHASES.items():
            if phase_name not in self.phases:
                self.phases[phase_name] = PhaseConfig(
                    enabled=True,  # parent gating via AnalysisConfig.enabled
                    temperature=default_temp,
                )

    @classmethod
    def from_dict(cls, d: dict | None) -> AnalysisConfig:
        if d is None:
            return cls()
        phases_raw = d.get("phases", {})
        phases = {
            name: PhaseConfig.from_dict(cfg)
            for name, cfg in phases_raw.items()
        }
        return cls(
            enabled=d.get("enabled", False),
            phases=phases,
        )

    def is_phase_enabled(self, name: str) -> bool:
        """Check if a specific phase is enabled."""
        return self.enabled and self.phases.get(name, PhaseConfig()).enabled

    def enabled_phases(self) -> list[str]:
        """List all enabled phase names."""
        return [name for name, cfg in self.phases.items() if self.enabled and cfg.enabled]


# ═══════════════════════════════════════════════════════════════
# Results
# ═══════════════════════════════════════════════════════════════

@dataclass
class MemoryResult:
    domain: str
    content: str

@dataclass
class ImpressionResult:
    type: str   # transient, emotional, philosophical
    certainty: str  # low, medium, high
    description: str

@dataclass
class ConceptResult:
    name: str
    domain: str
    description: str
    glyphset: str = ""

@dataclass
class AssumptionResult:
    context: str
    goal: str
    constraints: str

@dataclass
class CodeRequest:
    language: str
    prompt: str
    temperature: str  # string from LLM, parsed later
    top_p: str

@dataclass
class ConductorResult:
    temperature: float = 0.7
    top_p: float = 1.0
    prompt: str = ""

@dataclass
class AnalysisResults:
    """Container for all analysis phase outputs."""
    memories: list[MemoryResult] = field(default_factory=list)
    impressions: list[ImpressionResult] = field(default_factory=list)
    concepts: list[ConceptResult] = field(default_factory=list)
    assumptions: list[AssumptionResult] = field(default_factory=list)
    intent: dict[str, Any] = field(default_factory=dict)
    code_requests: list[CodeRequest] = field(default_factory=list)
    search_needed: bool = False
    search_prompt: str = ""
    conductor: ConductorResult | None = None
    global_memories: list[dict[str, Any]] = field(default_factory=list)
    next_predictions: list[str] = field(default_factory=list)
    search_result: str = ""
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "memories": [{"domain": m.domain, "content": m.content} for m in self.memories],
            "impressions": [
                {"type": i.type, "certainty": i.certainty, "description": i.description}
                for i in self.impressions
            ],
            "concepts": [
                {"name": c.name, "domain": c.domain, "description": c.description, "glyphset": c.glyphset}
                for c in self.concepts
            ],
            "assumptions": [
                {"context": a.context, "goal": a.goal, "constraints": a.constraints}
                for a in self.assumptions
            ],
            "intent": self.intent,
            "code_requests": [
                {"language": c.language, "prompt": c.prompt,
                 "temperature": c.temperature, "top_p": c.top_p}
                for c in self.code_requests
            ],
            "search_needed": self.search_needed,
            "search_prompt": self.search_prompt,
            "conductor": {
                "temperature": self.conductor.temperature if self.conductor else 0.7,
                "top_p": self.conductor.top_p if self.conductor else 1.0,
                "prompt": self.conductor.prompt if self.conductor else "",
            },
            "global_memories": self.global_memories,
            "next_predictions": self.next_predictions,
            "search_result": self.search_result,
            "errors": self.errors,
        }


# ═══════════════════════════════════════════════════════════════
# Phase Implementations
# ═══════════════════════════════════════════════════════════════

async def _call_llm_json(
    provider: LlmProvider,
    system_prompt: str,
    user_content: str,
    temperature: float,
    max_tokens: int = 500,
) -> dict | list | None:
    """Call the LLM and parse the response as JSON. Returns None on failure."""
    try:
        response = await provider.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = (response.content or "").strip()
        # Strip markdown fences
        content = content.replace("```json", "").replace("```", "").strip()
        return _json.loads(content)
    except Exception as e:
        # Return None on parse/network failure
        return None


async def phase_memories(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[MemoryResult]:
    """Extract new, significant user facts from the latest message.

    Mirrors lucid-sensai's memoriesPromise in conductAnalysis.
    """
    system = (
        "You are a Memory Analysis engine. Extract new, significant facts about the user "
        "from their latest message. Return a JSON array.\n\n"
        "CRITICAL RULES:\n"
        "1. Only facts FROM THE LATEST MESSAGE — not from history.\n"
        "2. Must be ABOUT THE USER — identity, life, preferences, feelings.\n"
        "3. Must be SIGNIFICANT — worth recalling in future conversations.\n"
        "4. Return [] if nothing new and significant is found.\n\n"
        "JSON format: [{\"domain\": \"...\", \"content\": \"...\"}, ...]"
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [
            MemoryResult(domain=item.get("domain", "general"), content=item.get("content", ""))
            for item in result
            if isinstance(item, dict) and item.get("content")
        ]
    return []


async def phase_impressions(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[ImpressionResult]:
    """Infer emotional tone, state of mind, and motivations.

    Mirrors lucid-sensai's impressionsPromise.
    """
    system = (
        "You are an Impression Analysis engine. Analyze the user's state of mind, "
        "emotional tone, and underlying motivations from their latest message.\n\n"
        "Return a JSON array with:\n"
        "  type: 'transient' | 'emotional' | 'philosophical'\n"
        "  certainty: 'low' | 'medium' | 'high'\n"
        "  description: brief description\n\n"
        "Return [] if no clear impression can be formed."
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [
            ImpressionResult(
                type=item.get("type", "transient"),
                certainty=item.get("certainty", "medium"),
                description=item.get("description", ""),
            )
            for item in result
            if isinstance(item, dict) and item.get("description")
        ]
    return []


async def phase_concepts(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[ConceptResult]:
    """Identify new conceptual frameworks the user is introducing.

    Mirrors lucid-sensai's conceptsPromise.
    """
    system = (
        "You are a Concept Analysis engine. Identify new, significant, user-driven "
        "concepts from the latest message.\n\n"
        "CRITICAL RULES:\n"
        "1. User-driven only — the USER must introduce or emphasize the concept.\n"
        "2. Must be SIGNIFICANT — a substantial idea, theme, or framework.\n"
        "3. Return [] if no new concepts are found.\n\n"
        "JSON format: [{\"name\": \"...\", \"domain\": \"...\", \"description\": \"...\", \"glyphset\": \"...\"}, ...]"
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [
            ConceptResult(
                name=item.get("name", ""),
                domain=item.get("domain", ""),
                description=item.get("description", ""),
                glyphset=item.get("glyphset", ""),
            )
            for item in result
            if isinstance(item, dict) and item.get("name")
        ]
    return []


async def phase_assumptions(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[AssumptionResult]:
    """Identify implicit assumptions the user is making.

    Mirrors lucid-sensai's assumptionsPromise.
    """
    system = (
        "You are an Assumption Analysis engine. Identify implicit assumptions "
        "the USER is making (not you, not the system).\n\n"
        "Look for what the user ISN'T saying but likely believes to be true.\n\n"
        "JSON format: [{\"context\": \"...\", \"goal\": \"...\", \"constraints\": \"...\"}, ...]\n"
        "Return [] if no significant implicit assumptions are found."
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [
            AssumptionResult(
                context=item.get("context", ""),
                goal=item.get("goal", ""),
                constraints=item.get("constraints", ""),
            )
            for item in result
            if isinstance(item, dict)
        ]
    return []


async def phase_intent(
    provider: LlmProvider,
    user_message: str,
    temperature: float,
) -> dict[str, Any]:
    """Rich intent classification — more nuanced than Vibeful's keyword router.

    Returns structured intent with type, confidence, and sub-intents.
    """
    system = (
        "Classify the user's intent from their message. Return JSON:\n"
        "{\n"
        '  "primary": "question" | "command" | "greeting" | "feedback" | "creative" | "analysis" | "code" | "other",\n'
        '  "secondary": ["...", "..."],\n'
        '  "confidence": 0.0-1.0,\n'
        '  "urgency": "low" | "medium" | "high",\n'
        '  "requires_tools": true | false,\n'
        '  "requires_rag": true | false,\n'
        '  "topic": "..."\n'
        "}"
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, dict):
        return result
    return {"primary": "other", "confidence": 0.5}


async def phase_code_detect(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[CodeRequest]:
    """Detect if the user is requesting code generation.

    Mirrors lucid-sensai's codePromise.
    """
    system = (
        "Does the user request any code to be generated? If so, for each request, "
        "provide the programming language, prompt, temperature, and top_p.\n\n"
        "JSON format: [{\"language\": \"...\", \"prompt\": \"...\", \"temperature\": \"0.1\", \"top_p\": \"1.0\"}, ...]\n"
        "Return [] if no code is requested."
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [
            CodeRequest(
                language=item.get("language", ""),
                prompt=item.get("prompt", ""),
                temperature=item.get("temperature", "0.1"),
                top_p=item.get("top_p", "1.0"),
            )
            for item in result
            if isinstance(item, dict) and item.get("prompt")
        ]
    return []


async def phase_search_detect(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> tuple[bool, str]:
    """Determine if web search is needed.

    Mirrors lucid-sensai's searchPromise.
    """
    system = (
        "Determine if the user's message requires a web search for accurate data. "
        "If yes, write a search prompt. If no, respond with exactly 'noSearch'.\n\n"
        'JSON format: {"search": "search prompt OR noSearch"}'
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, dict):
        search_val = result.get("search", "noSearch")
        if search_val and search_val != "noSearch":
            return True, str(search_val)
    return False, ""


async def phase_conductor(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
    analysis_results: dict[str, Any],
) -> ConductorResult:
    """The Conductor — determines response temperature, top_p, and prompt.

    This is the key Lucid innovation: the LLM dynamically decides how
    the final response should be generated based on analysis results.

    Mirrors lucid-sensai's speechPromise.
    """
    # Build context from analysis results
    impressions_text = ""
    if analysis_results.get("impressions"):
        descs = [i["description"] for i in analysis_results["impressions"] if i.get("description")]
        if descs:
            impressions_text = f"User impressions: {'; '.join(descs)}"

    assumptions_text = ""
    if analysis_results.get("assumptions"):
        parts = [" ".join(a.values()) for a in analysis_results["assumptions"]]
        if parts:
            assumptions_text = f"User assumptions: {'; '.join(parts)}"

    intent_info = ""
    if analysis_results.get("intent"):
        i = analysis_results["intent"]
        intent_info = f"Intent: {i.get('primary', 'unknown')} (confidence: {i.get('confidence', 0.5)})"

    context_block = "\n".join(filter(None, [impressions_text, assumptions_text, intent_info]))

    system = (
        "You are the Conductor — you determine how the final AI response should be generated.\n\n"
        "Based on the user's message and the analysis below, decide:\n"
        "1. What temperature to use for the response (0.0-2.0)\n"
        "2. What top_p to use (0.0-1.0)\n"
        "3. A prompt that guides the tone, style, and content of the response.\n\n"
        "Guidelines:\n"
        "- Low temperature (0.1-0.3): factual, precise, code, math\n"
        "- Medium temperature (0.4-0.7): balanced, helpful, professional\n"
        "- High temperature (0.8-1.5): creative, storytelling, brainstorming\n"
        "- Very high (1.5-2.0): experimental, poetic, humorous\n\n"
        f"Analysis context:\n{context_block}\n\n"
        'Return JSON: {"temperature": 0.7, "top_p": 1.0, "prompt": "..."}'
    )

    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, dict):
        return ConductorResult(
            temperature=float(result.get("temperature", 0.7)),
            top_p=float(result.get("top_p", 1.0)),
            prompt=str(result.get("prompt", "")),
        )
    return ConductorResult()


async def phase_global_memories(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[dict[str, Any]]:
    """Extract cross-user knowledge that should be globally remembered.

    Mirrors lucid-sensai's globalMemoriesPromise.
    """
    system = (
        "You are a Global Memory Analysis engine. Identify knowledge from this "
        "conversation that is valuable for ALL users, not just this one.\n\n"
        "CRITICAL RULES:\n"
        "1. Must NOT contain anything specific to this user — protect privacy.\n"
        "2. Must be broadly applicable insights, patterns, or discoveries.\n"
        "3. Types: system_ontology (capabilities/rules), concept_synthesis (patterns "
        "in how users combine concepts), collective_truth (emergent agreements).\n"
        "4. Return [] if nothing rises to the level of global significance.\n\n"
        'JSON format: [{"name":"...","domain":"...","description":"...","glyphset":"...","type":"..."}, ...]'
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [
            {
                "name": item.get("name", ""),
                "domain": item.get("domain", "general"),
                "description": item.get("description", ""),
                "glyphset": item.get("glyphset", ""),
                "type": item.get("type", "general"),
            }
            for item in result
            if isinstance(item, dict) and item.get("name")
        ]
    return []


async def phase_next(
    provider: LlmProvider,
    user_message: str,
    conversation_summary: str,
    temperature: float,
) -> list[str]:
    """Predict what the user might ask next.

    Mirrors lucid-sensai's nextPromise.
    """
    system = (
        "Based on the user's latest message and conversation context, "
        "predict what they might ask or say next. Give three predictions.\n\n"
        'Return JSON: ["prediction 1","prediction 2","prediction 3"]'
    )
    result = await _call_llm_json(provider, system, user_message, temperature)
    if isinstance(result, list):
        return [str(p) for p in result if p]
    return []


async def phase_search_execute(
    provider: LlmProvider,
    search_prompt: str,
    temperature: float = 0.3,
) -> str:
    """Execute a web search when search_detect indicates one is needed.

    Uses the LLM with web-search-capable model (or compound model).
    Mirrors lucid-sensai's groq/compound search execution.
    """
    if not search_prompt or search_prompt == "noSearch":
        return ""
    try:
        response = await provider.chat(
            messages=[{"role": "user", "content": search_prompt}],
            temperature=temperature,
            max_tokens=1024,
        )
        return (response.content or "").strip()
    except Exception:
        return ""


# ═══════════════════════════════════════════════════════════════
# Pipeline Orchestrator
# ═══════════════════════════════════════════════════════════════

async def run_analysis_pipeline(
    user_message: str,
    conversation_summary: str = "",
    config: AnalysisConfig | None = None,
    provider: LlmProvider | None = None,
) -> AnalysisResults:
    """Run the full analysis pipeline with all enabled phases.

    Non-conductor phases run in parallel. Conductor runs last (uses other results).

    Args:
        user_message: The user's latest message.
        conversation_summary: Optional summary of recent conversation.
        config: Analysis configuration (which phases, temperatures).
        provider: LLM provider. Created if not supplied.

    Returns:
        AnalysisResults with all phase outputs.
    """
    if config is None:
        config = AnalysisConfig()

    if not config.enabled:
        return AnalysisResults()

    if provider is None:
        provider = get_provider()

    results = AnalysisResults()

    # ── Phase 1: Run non-conductor phases in parallel ──
    phase_tasks: dict[str, asyncio.Task] = {}

    if config.is_phase_enabled("memories"):
        phase_tasks["memories"] = asyncio.create_task(
            phase_memories(provider, user_message, conversation_summary,
                          config.phases["memories"].temperature)
        )

    if config.is_phase_enabled("impressions"):
        phase_tasks["impressions"] = asyncio.create_task(
            phase_impressions(provider, user_message, conversation_summary,
                             config.phases["impressions"].temperature)
        )

    if config.is_phase_enabled("concepts"):
        phase_tasks["concepts"] = asyncio.create_task(
            phase_concepts(provider, user_message, conversation_summary,
                          config.phases["concepts"].temperature)
        )

    if config.is_phase_enabled("assumptions"):
        phase_tasks["assumptions"] = asyncio.create_task(
            phase_assumptions(provider, user_message, conversation_summary,
                             config.phases["assumptions"].temperature)
        )

    if config.is_phase_enabled("intent"):
        phase_tasks["intent"] = asyncio.create_task(
            phase_intent(provider, user_message, config.phases["intent"].temperature)
        )

    if config.is_phase_enabled("code_detect"):
        phase_tasks["code_detect"] = asyncio.create_task(
            phase_code_detect(provider, user_message, conversation_summary,
                             config.phases["code_detect"].temperature)
        )

    if config.is_phase_enabled("search_detect"):
        phase_tasks["search_detect"] = asyncio.create_task(
            phase_search_detect(provider, user_message, conversation_summary,
                               config.phases["search_detect"].temperature)
        )

    if config.is_phase_enabled("global_memories"):
        phase_tasks["global_memories"] = asyncio.create_task(
            phase_global_memories(provider, user_message, conversation_summary,
                                 config.phases["global_memories"].temperature)
        )

    if config.is_phase_enabled("next"):
        phase_tasks["next"] = asyncio.create_task(
            phase_next(provider, user_message, conversation_summary,
                      config.phases["next"].temperature)
        )

    # Collect results from parallel phases
    for name, task in phase_tasks.items():
        try:
            value = await task
            if name == "memories":
                results.memories = value if isinstance(value, list) else []
            elif name == "impressions":
                results.impressions = value if isinstance(value, list) else []
            elif name == "concepts":
                results.concepts = value if isinstance(value, list) else []
            elif name == "assumptions":
                results.assumptions = value if isinstance(value, list) else []
            elif name == "intent":
                results.intent = value if isinstance(value, dict) else {}
            elif name == "code_detect":
                results.code_requests = value if isinstance(value, list) else []
            elif name == "search_detect":
                if isinstance(value, tuple) and len(value) == 2:
                    results.search_needed, results.search_prompt = value
            elif name == "global_memories":
                results.global_memories = value if isinstance(value, list) else []
            elif name == "next":
                results.next_predictions = value if isinstance(value, list) else []
        except Exception as e:
            results.errors.append(f"{name}: {e}")

    # ── Phase 2: Conductor (uses results from Phase 1) ──
    if config.is_phase_enabled("conductor"):
        try:
            results.conductor = await phase_conductor(
                provider, user_message, conversation_summary,
                config.phases["conductor"].temperature,
                results.to_dict(),
            )
        except Exception as e:
            results.errors.append(f"conductor: {e}")

    # ── Phase 3: Search execution (uses search_prompt from Phase 1) ──
    if config.is_phase_enabled("search_execute") and results.search_needed and results.search_prompt:
        try:
            results.search_result = await phase_search_execute(
                provider, results.search_prompt, 0.3,
            )
        except Exception as e:
            results.errors.append(f"search_execute: {e}")

    return results


# ═══════════════════════════════════════════════════════════════
# LangGraph Node
# ═══════════════════════════════════════════════════════════════

async def analysis_pipeline_node(state: Any) -> Any:
    """LangGraph node: run analysis pipeline and enrich AgentState.

    This is the single node that gets inserted into the agent graph
    before system_message_builder and react_agent.

    It reads state.user_message and state.analysis_config, runs the
    pipeline, and writes results back to state.

    If analysis is not enabled, this is a no-op.
    """
    config_dict = getattr(state, "analysis_config", None)
    if config_dict is None:
        return state

    config = AnalysisConfig.from_dict(config_dict)

    if not config.enabled:
        # Still set an empty results so downstream nodes know analysis was skipped
        state.analysis_results = AnalysisResults().to_dict()
        return state

    # Build conversation summary from messages
    messages = getattr(state, "messages", [])
    conversation_summary = ""
    if messages:
        recent = messages[-6:]  # last 3 exchanges
        parts = []
        for m in recent:
            role = m.get("role", "unknown")
            content = str(m.get("content", ""))[:300]
            parts.append(f"[{role}]: {content}")
        conversation_summary = "\n".join(parts)

    # Run pipeline
    provider = get_provider()
    results = await run_analysis_pipeline(
        user_message=state.user_message,
        conversation_summary=conversation_summary,
        config=config,
        provider=provider,
    )

    # Store results in state
    state.analysis_results = results.to_dict()

    # ── Conductor overrides: dynamically set temperature / top_p ──
    if results.conductor:
        state.temperature = results.conductor.temperature
        state.top_p = results.conductor.top_p
        # Inject conductor prompt into system prompt
        if results.conductor.prompt:
            conductor_injection = (
                f"\n\n[Conductor Guidance]: {results.conductor.prompt}"
            )
            state.system_prompt = (state.system_prompt or "") + conductor_injection

    # ── Inject DML marker instructions when output routing is enabled ──
    if config.is_phase_enabled("output_routing"):
        dml_instructions = (
            "\n\n## Output Precision Control (DML)\n"
            "You can route different parts of your response through precision-tuned "
            "sub-processors by wrapping content in DML markers:\n\n"
            "  ((code))          — code at temperature 0.1 (no explanations, no markdown)\n"
            "  ((math))          — math at 0.1 (valid LaTeX only)\n"
            "  ((fact))          — facts at 0.3 (precise, concise, cite sources)\n"
            "  ((analogy))       — analogies at 1.0 (vivid, imaginative comparisons)\n"
            "  ((humor))         — humor at 1.8 (brief, witty, never offensive)\n"
            "  ((story))         — story at 1.5 (engaging narrative, sensory detail)\n\n"
            "Close each segment with ((/)). Example:\n"
            "  ((code))\n  def hello():\n      return 'world'\n  ((/))\n\n"
            "Use these when precision matters — code at 0.1 is far more reliable "
            "than code in prose at 0.7. Non-tagged text is SPEECH (default temperature).\n"
            "Override temperature per segment: ((code temp=\"0.01\"))...((/))"
        )
        state.system_prompt = (state.system_prompt or "") + dml_instructions

    # ── Emit analysis results as response chunks for visibility ──
    enabled_phases = config.enabled_phases()
    state.response_chunks.append({
        "state": "REFERENCES",
        "text_chunk": f"Analysis complete ({len(enabled_phases)} phases: {', '.join(enabled_phases)})",
    })

    # ── Inject search results into system prompt ──
    if results.search_result:
        search_injection = (
            f"\n\n[Web Search Results]: {results.search_result[:2000]}"
        )
        state.system_prompt = (state.system_prompt or "") + search_injection

    # ── Inject next predictions as response references ──
    if results.next_predictions:
        preds = results.next_predictions[:3]
        state.response_chunks.append({
            "state": "FOLLOW_UP",
            "follow_up_questions": preds,
        })

    # Emit impressions as context
    if results.impressions:
        impression_text = " | ".join(
            f"{i.type}({i.certainty}): {i.description}"
            for i in results.impressions
        )
        state.response_chunks.append({
            "state": "REFERENCES",
            "text_chunk": f"Impressions: {impression_text}",
        })

    return state


# ═══════════════════════════════════════════════════════════════
# DML (Domain Markup Language) Output Router
# ═══════════════════════════════════════════════════════════════
#
# Maps Lucid's DML_CONFIG (constants.js) onto Vibeful's post-response
# processing. When enabled, the output_router_node scans the assistant
# response for DML markers and routes each segment through a separate
# LLM sub-call at the segment's configured temperature.
#
# Marker syntax (mirrors Lucid's frontend DML parser):
#   ((code temp="0.1"))          — open a precision segment
#   ((story temp="1.5"))         — open a creative segment
#   ((/))                        — close current segment
#
# Supported segment types and their defaults:
#   CODE    0.1   — functional code, no explanations
#   MATH    0.1   — precise formal notation, valid LaTeX
#   FACT    0.3   — accurate, concise information
#   ANALOGY 1.0   — vivid, imaginative comparisons
#   HUMOR   1.8   — brief, witty, never offensive
#   STORY   1.5   — engaging narrative, sensory detail
#   SPEECH  0.7   — general conversational prose (fallback)


# ── Precision Profiles ────────────────────────────────────────

# Default system prompts for each segment type
_DML_SYSTEM_PROMPTS: dict[str, str] = {
    "CODE": (
        "Output ONLY valid, functional code. No explanations. "
        "No markdown formatting. Never include placeholders. "
        "Do NOT use triple-backtick fencing."
    ),
    "MATH": (
        "Use precise formal notation. All equations must be valid LaTeX. "
        "No explanatory prose — only mathematical content."
    ),
    "FACT": (
        "Provide accurate, concise information. Cite sources when possible. "
        "No fluff, no filler. Be direct and precise."
    ),
    "ANALOGY": (
        "Create vivid, imaginative comparisons. Relate to common experiences. "
        "Make the abstract concrete. Use sensory language."
    ),
    "HUMOR": (
        "Respond with brief, witty remarks. Never offensive or forced. "
        "Let humor arise naturally from the content."
    ),
    "STORY": (
        "Tell engaging short narratives. Use vivid sensory details. "
        "Show, don't tell. Create a compelling arc."
    ),
    "SPEECH": (
        "You are a thoughtful, articulate assistant. "
        "Respond clearly and helpfully to the user's needs."
    ),
}

# Default temperatures per segment type
_DML_DEFAULT_TEMPERATURES: dict[str, float] = {
    "CODE": 0.1,
    "MATH": 0.1,
    "FACT": 0.3,
    "ANALOGY": 1.0,
    "HUMOR": 1.8,
    "STORY": 1.5,
    "SPEECH": 0.7,
}

# Regex patterns for DML marker detection
import re as _re

# Matches an open tag: ((type attr="val"...))
_DML_OPEN_PATTERN = _re.compile(
    r"\(\((\w+)((?:\s+\w+=\"[^\"]*\")*)\)\)"
)

# Matches a close tag: ((/))
_DML_CLOSE_PATTERN = _re.compile(r"\(\(/\)\)")

# Matches a full segment: ((type ...))content((/))
_DML_SEGMENT_PATTERN = _re.compile(
    r"\(\((\w+)((?:\s+\w+=\"[^\"]*\")*)\)\)\s*([\s\S]*?)\(\(/\)\)",
    _re.DOTALL,
)


@dataclass
class DmlSegment:
    """A parsed DML segment extracted from the agent response."""
    type: str          # CODE, MATH, FACT, ANALOGY, HUMOR, STORY, SPEECH
    temperature: float
    content: str       # The prompt/content between ((type)) and ((/))
    attributes: dict[str, str] = field(default_factory=dict)
    rendered: str = ""  # Populated after the sub-LLM call


def parse_dml_segments(text: str) -> list[DmlSegment]:
    """Extract DML segments from raw assistant response text.

    Returns segments in order of appearance, with non-tagged text
    between segments treated as SPEECH (default temp 0.7).

    Args:
        text: Raw assistant response potentially containing DML markers.

    Returns:
        List of DmlSegment objects ready for rendering.
    """
    segments: list[DmlSegment] = []
    pos = 0

    for match in _DML_SEGMENT_PATTERN.finditer(text):
        start = match.start()

        # Any text before this segment becomes a SPEECH segment
        if start > pos:
            between = text[pos:start].strip()
            if between:
                segments.append(DmlSegment(
                    type="SPEECH",
                    temperature=_DML_DEFAULT_TEMPERATURES["SPEECH"],
                    content=between,
                ))

        seg_type = match.group(1).upper()
        attr_str = match.group(2) or ""
        content = match.group(3).strip()

        # Parse attributes
        attrs: dict[str, str] = {}
        for attr_match in _re.finditer(r'(\w+)="([^"]*)"', attr_str):
            attrs[attr_match.group(1)] = attr_match.group(2)

        # Determine temperature: explicit attr > default > fallback
        temperature = _DML_DEFAULT_TEMPERATURES.get(seg_type, 0.7)
        if "temp" in attrs:
            try:
                temperature = float(attrs["temp"])
            except ValueError:
                pass

        if content:
            segments.append(DmlSegment(
                type=seg_type,
                temperature=temperature,
                content=content,
                attributes=attrs,
            ))

        pos = match.end()

    # Trailing text after last segment
    if pos < len(text):
        trailing = text[pos:].strip()
        if trailing:
            segments.append(DmlSegment(
                type="SPEECH",
                temperature=_DML_DEFAULT_TEMPERATURES["SPEECH"],
                content=trailing,
            ))

    return segments


async def _render_segment(
    segment: DmlSegment,
    provider: LlmProvider,
    model: str = "deepseek-chat",
    max_tokens: int = 2048,
) -> str:
    """Render a single DML segment through the LLM at its configured temperature.

    Args:
        segment: The DML segment to render.
        provider: LLM provider instance.
        model: Model identifier.
        max_tokens: Max tokens for the sub-call.

    Returns:
        Rendered text for this segment.
    """
    if segment.type == "SPEECH":
        # SPEECH segments are already rendered (they're plain text from react_agent)
        return segment.content

    system_prompt = _DML_SYSTEM_PROMPTS.get(
        segment.type,
        _DML_SYSTEM_PROMPTS["SPEECH"],
    )

    try:
        response = await provider.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": segment.content},
            ],
            model=model,
            temperature=segment.temperature,
            max_tokens=max_tokens,
        )
        return (response.content or "").strip()
    except Exception:
        # On failure, return the original content so output isn't lost
        return f"[{segment.type} segment — render failed]\n{segment.content}"


async def output_router_node(state: Any) -> Any:
    """LangGraph node: post-process the agent response through DML segment routing.

    This node runs AFTER react_agent and BEFORE stream_completion.
    It scans the accumulated STREAMING response for DML markers and
    re-renders each segment through the LLM at its configured temperature.

    Requirements:
        - state.analysis_config must have analysis.enabled=True
        - analysis.phases.output_routing must be enabled

    When disabled or no DML markers present, this is a no-op.
    """
    config_dict = getattr(state, "analysis_config", None)
    if config_dict is None:
        return state

    config = AnalysisConfig.from_dict(config_dict)

    if not config.enabled or not config.is_phase_enabled("output_routing"):
        return state

    # ── Extract the assistant response from STREAMING chunks ──
    streaming_chunks: list[dict] = []
    full_response = ""

    for chunk in state.response_chunks:
        if chunk.get("state") == "STREAMING":
            full_response += chunk.get("text_chunk", "")
            streaming_chunks.append(chunk)

    if not full_response.strip():
        return state

    # ── Parse DML segments ──
    segments = parse_dml_segments(full_response)

    if not segments:
        return state

    # If there's only one SPEECH segment, it's unchanged — no-op
    if len(segments) == 1 and segments[0].type == "SPEECH":
        return state

    # ── Render segments in parallel ──
    provider = get_provider()
    model = getattr(state, "model", "deepseek-chat")
    max_tokens = getattr(state, "max_tokens", 2048)

    tasks = [
        _render_segment(seg, provider, model, max_tokens)
        for seg in segments
    ]

    rendered = await asyncio.gather(*tasks)

    for seg, text in zip(segments, rendered):
        seg.rendered = text

    # ── Reassemble response ──
    assembled = "\n\n".join(seg.rendered for seg in segments if seg.rendered)

    # ── Replace STREAMING chunks with assembled output ──
    # Remove old STREAMING chunks
    state.response_chunks = [
        c for c in state.response_chunks
        if c.get("state") != "STREAMING"
    ]

    # Add assembled response
    state.response_chunks.append({
        "state": "STREAMING",
        "text_chunk": assembled,
    })

    # Emit routing notice
    seg_summary = ", ".join(
        f"{s.type}({s.temperature})" for s in segments
    )
    state.response_chunks.append({
        "state": "REFERENCES",
        "text_chunk": f"DML output routing: {len(segments)} segments routed ({seg_summary})",
    })

    return state
