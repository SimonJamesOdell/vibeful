"""REST API server — HTTP interface for the agent engine.

Provides POST /converse and GET /health without gRPC or Envoy.
Runs alongside the gRPC server on a separate port.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from typing import Any

import asyncio

from dotenv import load_dotenv, find_dotenv
from fastapi import FastAPI, HTTPException, Request

# Load .env from repo root (searches up from CWD)
load_dotenv(find_dotenv())
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

REST_PORT = int(os.getenv("REST_PORT", "50052"))

CORS_ORIGINS = os.getenv("VIBEFUL_CORS_ORIGINS", "*").split(",")

app = FastAPI(
    title="Vibeful Agent Engine",
    version="0.1.0",
    description="REST API for the Vibeful agent engine. Use POST /converse to chat, GET /health for status, GET /metrics for Prometheus.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup_diag():
    """Log API key and LLM status on startup for debugging."""
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    masked = api_key[:5] + "..." + api_key[-4:] if len(api_key) > 20 else "(not set)"
    source = "environment" if os.getenv("DEEPSEEK_API_KEY") else "unknown"
    if api_key and len(api_key) > 20 and "your-deepseek" not in api_key.lower():
        print(f"[vibeful] DeepSeek API key loaded: {masked} (source: {source})")
    elif os.path.exists(".env") or os.path.exists("../.env") or os.path.exists("../../.env"):
        print(f"[vibeful] WARNING: .env file found but DEEPSEEK_API_KEY not loaded correctly")
    else:
        print(f"[vibeful] WARNING: No DEEPSEEK_API_KEY configured. AI features will not work.")

@app.on_event("startup")
async def _startup_db():
    """Initialize the database for Lucid endpoints.
    Uses PostgreSQL in Docker mode, SQLite in local mode."""
    global _db_lucid
    try:
        from .database import Database
        _db_lucid = Database()
        await _db_lucid.init_schema()
    except Exception:
        # SQLite fallback for local dev mode
        try:
            from .storage.sqlite import SqliteBackend
            _db_lucid = SqliteBackend()
            await _db_lucid.init_schema()
        except Exception:
            pass

_graph = None


def set_graph(graph: Any) -> None:
    """Set the compiled agent graph (called from main.py)."""
    global _graph
    _graph = graph


class ConverseRequest(BaseModel):
    session_id: str | None = None
    message: str
    system_prompt: str | None = None
    model: str = "deepseek-chat"
    temperature: float = 0.7
    top_p: float = 1.0
    max_tokens: int = 4096
    context_ids: list[str] = []
    mcp_server_urls: list[str] = []
    analysis: dict | None = None


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agent-engine"}


@app.get("/health/ready")
async def health_ready():
    """Kubernetes readiness probe — agent graph compiled and ready."""
    return {"status": "ready" if _graph is not None else "not_ready"}


@app.get("/health/live")
async def health_live():
    """Kubernetes liveness probe — process is alive."""
    return {"status": "alive"}


@app.get("/converse/stream")
async def converse_stream(req: ConverseRequest):
    """Stream agent response chunks via Server-Sent Events."""
    if _graph is None:
        raise HTTPException(503, "Agent graph not initialized")

    from .agent_graph import AgentState

    session_id = req.session_id or str(uuid.uuid4())
    state = AgentState(
        session_id=session_id,
        user_message=req.message,
        system_prompt=req.system_prompt or "",
        model=req.model,
        temperature=req.temperature,
        top_p=req.top_p,
        max_tokens=req.max_tokens,
        context_ids=req.context_ids,
        mcp_server_urls=req.mcp_server_urls,
        analysis_config=req.analysis,
    )

    async def event_stream():
        try:
            result = await _graph.ainvoke(state)
            for chunk in result.response_chunks:
                yield f"data: {json.dumps(chunk)}\n\n"
                await asyncio.sleep(0)
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/converse")
async def converse(req: ConverseRequest):
    """Send a message to the agent and receive the response."""
    if _graph is None:
        raise HTTPException(503, "Agent graph not initialized")

    from .agent_graph import AgentState

    session_id = req.session_id or str(uuid.uuid4())
    state = AgentState(
        session_id=session_id,
        user_message=req.message,
        system_prompt=req.system_prompt or "",
        model=req.model,
        temperature=req.temperature,
        top_p=req.top_p,
        max_tokens=req.max_tokens,
        context_ids=req.context_ids,
        mcp_server_urls=req.mcp_server_urls,
        analysis_config=req.analysis,
    )

    try:
        result = await _graph.ainvoke(state)
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")

    response_text = ""
    tool_calls = []
    error = None
    usage = {}

    for chunk in result.response_chunks:
        state_label = chunk.get("state", "")
        if state_label == "STREAMING":
            response_text += chunk.get("text_chunk", "")
        elif state_label == "TOOL_USED":
            tool_calls.append(chunk.get("tool_call", {}))
        elif state_label == "COMPLETED":
            usage = chunk.get("usage", {})
        if chunk.get("error"):
            error = chunk["error"]

    return {
        "session_id": session_id,
        "response": response_text,
        "tool_calls": tool_calls,
        "usage": usage,
        "error": error,
        "finished": result.finished,
    }


@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint (text format)."""
    from .metrics import metrics as m
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(m.prometheus_text())


@app.get("/metrics/json")
async def get_metrics_json():
    """Metrics as JSON."""
    from .metrics import metrics as m
    return m.to_dict()


# ── Lucid Capability Endpoints ───────────────────────────────────

_db_lucid = None


def set_database(db: Any) -> None:
    """Set the database instance for Lucid endpoints (called from main.py)."""
    global _db_lucid
    _db_lucid = db


def _require_db():
    if _db_lucid is None:
        raise HTTPException(503, "Database not initialized")
    return _db_lucid


# ── Glyphs ─────────────────────────────────────────────────

@app.get("/v1/glyphs")
async def list_glyphs():
    db = _require_db()
    glyphs = await db.list_glyphs()
    return {"glyphs": glyphs}


@app.post("/v1/glyphs")
async def create_glyph(glyph: dict):
    db = _require_db()
    if not glyph.get("name") or not glyph.get("symbol"):
        raise HTTPException(400, "name and symbol are required")
    result = await db.add_glyph(glyph)
    return result


@app.delete("/v1/glyphs/{name}")
async def delete_glyph(name: str):
    db = _require_db()
    deleted = await db.delete_glyph(name)
    if not deleted:
        raise HTTPException(404, f"Glyph '{name}' not found")
    return {"deleted": name}


# ── Concepts ───────────────────────────────────────────────

@app.get("/v1/concepts")
async def list_concepts(domain: str = "", search: str = ""):
    db = _require_db()
    concepts = await db.get_concepts_by_domain(domain=domain or None)
    if search:
        concepts = [
            c for c in concepts
            if search.lower() in c.get("name", "").lower()
            or search.lower() in c.get("description", "").lower()
        ]
    return {"concepts": concepts}


# ── Global Memories ────────────────────────────────────────

@app.get("/v1/global-memories")
async def list_global_memories(type: str = ""):
    db = _require_db()
    memories = await db.list_global_memories(memory_type=type or None)
    return {"memories": memories}


# ── Token Credits ──────────────────────────────────────────

class CreditRequest(BaseModel):
    user_identity: str
    amount: int
    transaction_type: str = "purchase"
    description: str = ""
    agent_id: str | None = None


@app.get("/v1/tokens/balance")
async def get_token_balance(user_identity: str, agent_id: str = ""):
    db = _require_db()
    from .token_tracker import TokenTracker
    tracker = TokenTracker(db)
    balance = await tracker.get_balance(user_identity, agent_id or None)
    return {"user_identity": user_identity, "balance": balance}


@app.post("/v1/tokens/credit")
async def credit_tokens(req: CreditRequest):
    db = _require_db()
    from .token_tracker import TokenTracker
    tracker = TokenTracker(db)
    result = await tracker.credit(
        user_identity=req.user_identity,
        amount=req.amount,
        transaction_type=req.transaction_type,
        description=req.description,
        agent_id=req.agent_id,
    )
    return result


@app.get("/v1/tokens/transactions")
async def list_transactions(user_identity: str, limit: int = 50):
    db = _require_db()
    from .token_tracker import TokenTracker
    tracker = TokenTracker(db)
    transactions = await tracker.get_transaction_history(user_identity, limit)
    return {"transactions": transactions}


# ── AI Assist ──────────────────────────────────────────────

class AIAssistRequest(BaseModel):
    system_prompt: str
    message: str
    temperature: float = 0.2
    max_tokens: int = 500


@app.post("/v1/ai/assist")
async def ai_assist(req: AIAssistRequest):
    """Process natural language commands for the visual agent designer."""
    # Check API key before attempting LLM call
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key or len(api_key) < 20 or "your-deepseek" in api_key.lower():
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY not configured. Set it in .env or via the Setup tab."
        )

    try:
        from .llm import get_provider
        from .analysis_pipeline import phase_intent

        provider = get_provider()

        # Two-pass: classify intent first, then generate response with intent context
        intent = await phase_intent(provider, req.message, temperature=0.4)
        intent_primary = intent.get("primary", "other")
        intent_topic = intent.get("topic", "")
        intent_confidence = intent.get("confidence", 0.5)

        # Build an enriched system prompt that includes intent analysis
        enriched_prompt = req.system_prompt
        if intent_primary == "question":
            enriched_prompt = (
                f"INTENT ANALYSIS: The user is asking a QUESTION (confidence: {intent_confidence:.0%}). "
                + (f"Topic: {intent_topic}. " if intent_topic else "")
                + "You MUST use action 'explain'. "
                + "If a specific node is named, use highlight_node on that node. "
                + "For general questions, use start_tour with all nodes from the graph state.\n\n"
                + req.system_prompt
            )
        elif intent_primary == "command":
            enriched_prompt = (
                f"INTENT ANALYSIS: The user is giving a COMMAND (confidence: {intent_confidence:.0%}). "
                + (f"Topic: {intent_topic}. " if intent_topic else "")
                + "Use the appropriate graph modification action.\n\n"
                + req.system_prompt
            )

        response = await provider.chat(
            messages=[
                {"role": "system", "content": enriched_prompt},
                {"role": "user", "content": req.message},
            ],
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
        return {"response": response.content, "model": getattr(provider, "model", "unknown")}
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"LLM call failed: {e}"
        )


# ── Agents CRUD (local mode) ──────────────────────────────

class AgentCreateRequest(BaseModel):
    name: str
    description: str = ""
    system_prompt: str = ""
    model: str = "deepseek-chat"
    temperature: float = 0.7
    config_yaml: str = ""


@app.post("/v1/agents")
async def create_agent(req: AgentCreateRequest):
    db = _require_db()
    agent = await db.create_agent({
        "name": req.name, "description": req.description,
        "system_prompt": req.system_prompt, "model": req.model,
        "temperature": req.temperature, "config_yaml": req.config_yaml,
    })
    return agent


@app.get("/v1/agents")
async def list_agents():
    db = _require_db()
    return await db.list_agents()


@app.get("/v1/agents/{agent_id}")
async def get_agent(agent_id: str):
    db = _require_db()
    agent = await db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent


# ── Setup (local mode) ────────────────────────────────────

@app.post("/v1/setup/api-key")
async def setup_api_key(request: Request):
    body = await request.json()
    key = body.get("api_key", "").strip()
    if not key or len(key) < 10:
        raise HTTPException(400, "Invalid API key")
    from .llm.factory import set_runtime_api_key
    set_runtime_api_key(key)
    return {"configured": True, "note": "Key stored in-memory."}


@app.get("/v1/health/config")
async def health_config():
    env_key = os.getenv("DEEPSEEK_API_KEY", "")
    env_ok = bool(env_key and "your-deepseek" not in env_key.lower() and len(env_key) > 20)
    from .llm.factory import get_runtime_api_key
    configured = env_ok or bool(get_runtime_api_key())
    return {
        "deepseek_api_key_configured": configured,
        "needs_setup": not configured,
        "get_api_key_url": "https://platform.deepseek.com/api_keys",
    }


# ── Agent Versions ──────────────────────────────────────────

class VersionSaveRequest(BaseModel):
    config: dict | None = None
    yaml_str: str = ""
    author: str = "human"
    change_description: str = ""
    tags: list[str] = []


@app.get("/v1/agents/{agent_id}/versions")
async def get_agent_versions(agent_id: str, limit: int = 50):
    db = _require_db()
    versions = await db.get_agent_versions(agent_id, limit)
    return {"versions": versions}


@app.get("/v1/agents/{agent_id}/versions/{vid}")
async def get_agent_version(agent_id: str, vid: str):
    db = _require_db()
    versions = await db.get_agent_versions(agent_id)
    for v in versions:
        if v.get("id") == vid or str(v.get("version_number")) == vid:
            return v
    raise HTTPException(404, f"Version {vid} not found")


@app.post("/v1/agents/{agent_id}/versions")
async def save_agent_version(agent_id: str, req: VersionSaveRequest):
    db = _require_db()
    result = await db.save_agent_version(
        agent_id=agent_id,
        config=req.config or {},
        yaml_str=req.yaml_str,
        author=req.author,
        change_description=req.change_description,
        tags=req.tags,
    )
    return result


@app.post("/v1/agents/{agent_id}/versions/{vid}/restore")
async def restore_agent_version(agent_id: str, vid: str):
    db = _require_db()
    import json as _json
    versions = await db.get_agent_versions(agent_id)
    target = None
    for v in versions:
        if v.get("id") == vid or str(v.get("version_number")) == vid:
            target = v
            break
    if target is None:
        raise HTTPException(404, f"Version {vid} not found")
    config = target.get("config_snapshot", "{}")
    if isinstance(config, str):
        config = _json.loads(config)
    result = await db.save_agent_version(
        agent_id=agent_id,
        config=config,
        yaml_str=target.get("yaml_snapshot", ""),
        author="restore",
        change_description=f"Restored from version {target.get('version_number', vid)}",
        tags=["restore"],
    )
    return result


# ── A/B Tests ───────────────────────────────────────────────

class ABTestCreateRequest(BaseModel):
    agent_id: str
    name: str
    primary_metric: str = "success_rate"
    min_sample_size: int = 100
    variant_a_config: dict
    variant_b_config: dict


@app.post("/v1/ab-tests")
async def create_ab_test(req: ABTestCreateRequest):
    db = _require_db()
    result = await db.create_ab_test({
        "agent_id": req.agent_id,
        "name": req.name,
        "status": "draft",
        "primary_metric": req.primary_metric,
        "min_sample_size": req.min_sample_size,
        "variant_a_config": req.variant_a_config,
        "variant_b_config": req.variant_b_config,
    })
    return result


@app.get("/v1/ab-tests")
async def get_ab_tests(agent_id: str = ""):
    db = _require_db()
    tests = await db.get_ab_tests(agent_id=agent_id or None)
    return {"tests": tests}


@app.post("/v1/ab-tests/{test_id}/start")
async def start_ab_test(test_id: str):
    db = _require_db()
    result = await db.update_ab_test_status(test_id, "running")
    if result is None:
        raise HTTPException(404, f"Test {test_id} not found")
    return result


@app.post("/v1/ab-tests/{test_id}/stop")
async def stop_ab_test(test_id: str):
    db = _require_db()
    result = await db.update_ab_test_status(test_id, "completed")
    if result is None:
        raise HTTPException(404, f"Test {test_id} not found")
    return result


@app.get("/v1/ab-tests/{test_id}/results")
async def get_ab_test_results(test_id: str):
    db = _require_db()
    results = await db.get_ab_results(test_id)
    aggregate = await db.get_ab_aggregate(test_id)
    return {"results": results, "aggregate": aggregate}


async def serve_rest(port: int = REST_PORT) -> None:
    """Start the REST server with graceful shutdown support."""
    import signal
    import uvicorn

    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)

    shutdown_event = asyncio.Event()

    def _handle_sigterm():
        shutdown_event.set()

    loop = asyncio.get_event_loop()
    if hasattr(signal, "SIGTERM"):
        loop.add_signal_handler(signal.SIGTERM, _handle_sigterm)
    if hasattr(signal, "SIGINT"):
        loop.add_signal_handler(signal.SIGINT, _handle_sigterm)

    async def _serve():
        await server.serve()

    task = asyncio.create_task(_serve())
    await shutdown_event.wait()
    server.should_exit = True
    await task
