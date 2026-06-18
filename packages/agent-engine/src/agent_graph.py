"""Updated agent graph with MCP tool integration.

Adds MCP tool discovery and execution to the ReAct loop.
When mcp_server_urls are present in the agent config, the agent discovers
and uses tools from those servers alongside built-in tools.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from langgraph.graph import StateGraph, END
from langgraph.graph.state import CompiledStateGraph

from .database import Database
from .embeddings import EmbeddingsClient
from .rag import RagPipeline, RagResult
from .mcp_client import McpClient, McpToolDef, McpToolResult
from .llm import get_provider, ToolDefinition, ToolCallRequest
from .agent_memory import AgentMemory
from .quality_nodes import (
    build_citations,
    generate_follow_ups,
    get_quick_replies,
    classify_intent,
)


# ── State ──────────────────────────────────────────────────────

@dataclass
class AgentState:
    session_id: str = ""
    user_message: str = ""
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    system_prompt: str = ""
    model: str = "deepseek-chat"
    temperature: float = 0.7
    max_tokens: int = 4096
    context_ids: list[str] = field(default_factory=list)
    mcp_server_urls: list[str] = field(default_factory=list)
    messages: list[dict[str, Any]] = field(default_factory=list)
    response_chunks: list[dict[str, Any]] = field(default_factory=list)
    finished: bool = False
    prompt_tokens: int = 0
    completion_tokens: int = 0
    tools: list[dict[str, Any]] = field(default_factory=list)
    rag_results: list[RagResult] = field(default_factory=list)
    user_identity: str = ""
    quick_replies: list[dict[str, str]] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)
    route: str = "safe"
    error: str | None = None


# ── Built-in Tools ─────────────────────────────────────────────

BUILTIN_TOOLS: list[ToolDefinition] = [
    ToolDefinition(
        name="get_current_time",
        description="Get the current date and time in ISO 8601 format.",
        parameters={"type": "object", "properties": {}, "required": []},
    ),
    ToolDefinition(
        name="calculate",
        description="Evaluate a mathematical expression. Supports +, -, *, /, sqrt, abs, round, min, max, pi, e, int, float.",
        parameters={
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "The mathematical expression to evaluate, e.g. '2 + 3 * 4' or 'sqrt(16)'"},
            },
            "required": ["expression"],
        },
    ),
]


def execute_builtin_tool(name: str, arguments: dict[str, Any]) -> str:
    import math
    from datetime import datetime, timezone

    if name == "get_current_time":
        return json.dumps({"datetime": datetime.now(timezone.utc).isoformat(), "timezone": "UTC"})
    if name == "calculate":
        expr = arguments.get("expression", "")
        allowed = {"abs": abs, "round": round, "min": min, "max": max,
                   "sqrt": math.sqrt, "pi": math.pi, "e": math.e, "int": int, "float": float}
        try:
            return json.dumps({"expression": expr, "result": eval(expr, {"__builtins__": {}}, allowed)})
        except Exception as e:
            return json.dumps({"error": str(e)})
    return json.dumps({"error": f"Unknown tool: {name}"})


# ── Globals ────────────────────────────────────────────────────

_db: Database | None = None
_rag: RagPipeline | None = None
_provider = None
_mcp: McpClient | None = None
_memory: AgentMemory | None = None
_mcp_tool_cache: dict[str, list[McpToolDef]] = {}


def get_db() -> Database:
    global _db
    if _db is None:
        _db = Database()
    return _db


def get_rag() -> RagPipeline:
    global _rag
    if _rag is None:
        _rag = RagPipeline(get_db(), EmbeddingsClient())
    return _rag


def get_client():
    """Return the configured LLM provider (lazy singleton)."""
    global _provider
    if _provider is None:
        _provider = get_provider()
    return _provider


def get_mcp() -> McpClient:
    global _mcp
    if _mcp is None:
        _mcp = McpClient()
    return _mcp


def get_memory() -> AgentMemory:
    global _memory
    if _memory is None:
        _memory = AgentMemory(get_db(), EmbeddingsClient(), get_client())
    return _memory


# ── Graph Nodes ─────────────────────────────────────────────────

async def attack_guard_node(state: AgentState) -> AgentState:
    """Guard: detect attacks before processing. Sets state.route to 'end' if blocked."""
    from .security import detect_attack
    detection = detect_attack(state.user_message)
    if detection["detected"]:
        attack_type = detection["attack_type"]
        responses = {"prompt_injection": "I cannot process instructions that try to override my configuration.",
                      "jailbreak": "I must decline. I operate within my design boundaries.",
                      "prompt_leak": "I cannot share my system configuration.",
                      "sql_injection": "That request violates security policy.",
                      "xss": "I cannot process executable code patterns.",
                      "data_exfil": "I cannot execute queries that expose all data."}
        msg = responses.get(attack_type, "This request violates security policy.")
        state.response_chunks.append({"state": "COMPLETED", "error": f"attack_blocked:{attack_type}"})
        state.response_chunks.append({"state": "STREAMING", "text_chunk": msg})
        state.finished = True
        state.error = f"attack_blocked:{attack_type}"
        state.route = "end"
    return state


async def planning_node(state: AgentState) -> AgentState:
    """Generate an execution plan for complex multi-step queries."""
    if len(state.user_message) < 50 and "?" in state.user_message:
        return state
    plan_prompt = f"Analyze this request. Reply SIMPLE if trivial, or give a numbered plan if complex:\n\n{state.user_message}"
    client = get_client()
    resp = await client.chat(messages=[{"role": "user", "content": plan_prompt}], temperature=0.2, max_tokens=256)
    plan_text = (resp.content or "").strip()
    if not plan_text or plan_text.upper().startswith("SIMPLE"):
        return state
    state.response_chunks.append({"state": "REFERENCES", "text_chunk": f"Plan:\n{plan_text}"})
    return state


async def setup_node(state: AgentState) -> AgentState:
    state.messages = []
    state.response_chunks = []
    state.rag_results = []
    state.finished = False
    state.error = None
    state.messages.append({"role": "user", "content": state.user_message})
    for tr in state.tool_results:
        state.messages.append({
            "role": "tool", "tool_call_id": tr.get("call_id", ""),
            "content": tr.get("content", ""),
        })
    return state


async def system_message_builder_node(state: AgentState) -> AgentState:
    if not state.system_prompt:
        state.system_prompt = "You are a helpful AI assistant powered by DeepSeek. Use available tools when needed."
    return state


async def rag_node(state: AgentState) -> AgentState:
    if not state.context_ids:
        return state
    try:
        rag = get_rag()
        results = await rag.retrieve(query=state.user_message, context_ids=state.context_ids, top_k=5)
        state.rag_results = results
        if results:
            state.response_chunks.append({"state": "REFERENCES", "text_chunk": f"Found {len(results)} relevant sources."})
            context_block = "\n\n---\nRelevant knowledge:\n\n"
            for r in results:
                context_block += f"From {r.filename}:\n{r.text}\n\n"
            context_block += "Use this information to answer accurately."
            state.system_prompt = state.system_prompt + context_block
    except Exception as e:
        state.response_chunks.append({"state": "REFERENCES", "error": f"RAG failed: {e}"})
    return state


async def mcp_discovery_node(state: AgentState) -> AgentState:
    """Discover MCP tools from configured server URLs. Results are cached."""
    if not state.mcp_server_urls:
        return state

    mcp = get_mcp()
    all_tools: list[McpToolDef] = []

    for url in state.mcp_server_urls:
        if url not in _mcp_tool_cache:
            try:
                tools = await mcp.list_tools(url)
                _mcp_tool_cache[url] = tools
            except Exception:
                _mcp_tool_cache[url] = []
        all_tools.extend(_mcp_tool_cache.get(url, []))

    if all_tools:
        state.response_chunks.append({
            "state": "REFERENCES",
            "text_chunk": f"Connected to {len(all_tools)} MCP tools across {len(state.mcp_server_urls)} servers.",
        })

    return state


async def router_node(state: AgentState) -> str:
    """Route based on user intent: RAG, direct, workflow, or MCP."""
    target = await classify_intent(
        user_message=state.user_message,
        has_contexts=bool(state.context_ids),
        has_workflows=False,
    )
    route_map = {"rag": "rag", "react_agent": "react_agent", "mcp_discovery": "mcp_discovery"}
    return route_map.get(target, "react_agent")


async def buttons_node(state: AgentState) -> AgentState:
    """Emit quick-reply buttons if configured for this agent."""
    replies = get_quick_replies(state.quick_replies)
    if replies:
        state.response_chunks.append({
            "state": "FOLLOW_UP",
            "quick_replies": [{"label": r.label, "message": r.message} for r in replies],
        })
    return state


async def citation_node(state: AgentState) -> AgentState:
    """Build citations from RAG results after the assistant responds."""
    if not state.rag_results:
        return state
    assistant_response = ""
    for chunk in reversed(state.response_chunks):
        if chunk.get("state") == "STREAMING":
            assistant_response += chunk.get("text_chunk", "")
    if assistant_response:
        citations = await build_citations(
            assistant_response=assistant_response,
            rag_results=state.rag_results,
            llm=get_client(),
        )
        state.citations = citations
        if citations:
            state.response_chunks.append({
                "state": "REFERENCES",
                "citations": citations,
            })
    return state


async def follow_up_node(state: AgentState) -> AgentState:
    """Generate follow-up questions after the turn completes."""
    assistant_response = ""
    for chunk in reversed(state.response_chunks):
        if chunk.get("state") == "STREAMING":
            assistant_response += chunk.get("text_chunk", "")
    if not assistant_response:
        return state
    questions = await generate_follow_ups(
        user_message=state.user_message,
        assistant_response=assistant_response,
        llm=get_client(),
    )
    if questions:
        state.response_chunks.append({
            "state": "FOLLOW_UP",
            "follow_up_questions": questions,
        })
    return state


async def react_agent_node(state: AgentState) -> AgentState:
    from .metrics import metrics as m
    import time as _time
    _start = _time.perf_counter()

    client = get_client()
    mcp = get_mcp()
    max_iterations = 5

    for _ in range(max_iterations):
        # Build tool list: built-in + MCP-discovered
        tools = BUILTIN_TOOLS.copy()

        # Add MCP tools from cache
        for url in state.mcp_server_urls:
            for t in _mcp_tool_cache.get(url, []):
                tools.append(ToolDefinition(
                    name=t.name,
                    description=t.description,
                    parameters=t.parameters,
                ))

        # Add custom tools from state
        for t in state.tools:
            tools.append(ToolDefinition(
                name=t.get("name", ""),
                description=t.get("description", ""),
                parameters=t.get("parameters", {}),
            ))

        response = await client.chat(
            messages=state.messages,
            model=state.model,
            tools=tools,
            temperature=state.temperature,
            max_tokens=state.max_tokens,
            system_prompt=state.system_prompt,
        )

        state.prompt_tokens += response.prompt_tokens
        state.completion_tokens += response.completion_tokens

        if response.content:
            state.response_chunks.append({"state": "STREAMING", "text_chunk": response.content})

        if response.tool_calls:
            for tc in response.tool_calls:
                state.response_chunks.append({
                    "state": "TOOL_USED",
                    "tool_call": {
                        "call_id": tc.call_id,
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments),
                    },
                })

                # Try MCP tool first, fall back to built-in
                mcp_result = None
                for url in state.mcp_server_urls:
                    for mt in _mcp_tool_cache.get(url, []):
                        if mt.name == tc.name:
                            try:
                                mcp_result = await mcp.call_tool(url, tc.name, tc.arguments)
                                # Log MCP event
                                await get_db().log_event("MCP_TOOL_CALL", {
                                    "tool_name": tc.name,
                                    "mcp_server_url": url,
                                    "success": mcp_result.success,
                                    "latency_ms": mcp_result.latency_ms,
                                    "error": mcp_result.error,
                                }, session_id=state.session_id)
                            except Exception as e:
                                mcp_result = McpToolResult(
                                    call_id=tc.call_id, tool_name=tc.name,
                                    content=f"Error: {e}", raw_content=[],
                                    success=False, error=str(e),
                                )
                            break
                    if mcp_result:
                        break

                if mcp_result:
                    result_content = mcp_result.content
                else:
                    # Fall back to built-in tools
                    result_content = execute_builtin_tool(tc.name, tc.arguments)

                state.messages.append({
                    "role": "assistant", "content": None,
                    "tool_calls": [{
                        "id": tc.call_id, "type": "function",
                        "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                    }],
                })
                state.messages.append({
                    "role": "tool", "tool_call_id": tc.call_id, "content": result_content,
                })
        else:
            state.messages.append({"role": "assistant", "content": response.content or ""})
            break
    else:
        state.error = "max_tool_iterations_reached"

    # Record metrics
    m = __import__('src.metrics', fromlist=['metrics']).metrics
    m.inc("vibeful_requests_total")
    m.observe("vibeful_request_latency_ms", (_time.perf_counter() - _start) * 1000)
    m.inc("vibeful_prompt_tokens_total", state.prompt_tokens)
    m.inc("vibeful_completion_tokens_total", state.completion_tokens)
    if state.error:
        m.inc("vibeful_errors_total")

    return state


async def fact_recall_node(state: AgentState) -> AgentState:
    """Recall relevant facts about the user before building the system prompt."""
    if not state.user_identity:
        return state
    try:
        memory = get_memory()
        facts = await memory.recall_facts(
            user_identity=state.user_identity,
            query=state.user_message,
            limit=5,
        )
        if facts:
            injection = memory.format_facts_for_prompt(facts)
            state.system_prompt = state.system_prompt + injection
            state.response_chunks.append({
                "state": "REFERENCES",
                "text_chunk": f"Recalled {len(facts)} facts about this user.",
            })
    except Exception:
        pass
    return state


async def fact_mining_node(state: AgentState) -> AgentState:
    """Extract facts from the conversation after the assistant responds."""
    if not state.user_identity:
        return state
    try:
        # Get the assistant's response from the last STREAMING chunk
        assistant_response = ""
        for chunk in reversed(state.response_chunks):
            if chunk.get("state") == "STREAMING":
                assistant_response += chunk.get("text_chunk", "")
        if assistant_response:
            memory = get_memory()
            await memory.mine_facts(
                session_id=state.session_id,
                user_identity=state.user_identity,
                user_message=state.user_message,
                assistant_response=assistant_response,
            )
    except Exception:
        pass
    return state


async def stream_completion_node(state: AgentState) -> AgentState:
    estimated = (state.prompt_tokens * 2.0 / 1_000_000) + (state.completion_tokens * 8.0 / 1_000_000)
    state.response_chunks.append({
        "state": "COMPLETED",
        "usage": {
            "prompt_tokens": state.prompt_tokens,
            "completion_tokens": state.completion_tokens,
            "total_tokens": state.prompt_tokens + state.completion_tokens,
            "cost_usd": round(estimated, 6),
        },
    })
    state.finished = True
    return state


# ── Build Graph ─────────────────────────────────────────────────

def build_agent_graph() -> CompiledStateGraph:
    builder = StateGraph(AgentState)

    builder.add_node("attack_guard", attack_guard_node)
    builder.add_node("setup", setup_node)
    builder.add_node("fact_recall", fact_recall_node)
    builder.add_node("planning", planning_node)
    builder.add_node("buttons", buttons_node)
    builder.add_node("system_message_builder", system_message_builder_node)
    builder.add_node("rag", rag_node)
    builder.add_node("mcp_discovery", mcp_discovery_node)
    builder.add_node("react_agent", react_agent_node)
    builder.add_node("stream_completion", stream_completion_node)
    builder.add_node("citation", citation_node)
    builder.add_node("follow_up", follow_up_node)
    builder.add_node("fact_mining", fact_mining_node)

    builder.set_entry_point("attack_guard")
    builder.add_conditional_edges("attack_guard", lambda s: s.route, {"safe": "setup", "end": END})
    builder.add_edge("setup", "fact_recall")
    builder.add_edge("fact_recall", "planning")
    builder.add_edge("planning", "buttons")
    builder.add_edge("buttons", "system_message_builder")
    builder.add_conditional_edges(
        "system_message_builder", router_node,
        {"rag": "rag", "react_agent": "react_agent", "mcp_discovery": "mcp_discovery"},
    )
    builder.add_edge("rag", "mcp_discovery")
    builder.add_edge("mcp_discovery", "react_agent")
    builder.add_edge("react_agent", "stream_completion")
    builder.add_edge("stream_completion", "citation")
    builder.add_edge("citation", "follow_up")
    builder.add_edge("follow_up", "fact_mining")
    builder.add_edge("fact_mining", END)

    return builder.compile()
