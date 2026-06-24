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

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: build graph, log diagnostics, seed MCP servers, init database."""
    await _startup_graph()
    await _startup_diag()
    await _startup_seed_mcp()
    await _startup_db()
    yield
    # Shutdown: nothing to clean up (uvicorn handles connections)

app = FastAPI(
    title="Vibeful Agent Engine",
    version="0.1.0",
    description="REST API for the Vibeful agent engine. Use POST /converse to chat, GET /health for status, GET /metrics for Prometheus.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in CORS_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _startup_graph():
    """Build agent graph on startup if not already set (standalone mode).

    When running through entrypoint.py, set_graph() is called before the
    server starts. When running standalone (e.g. setup.sh), this event
    builds the graph so /converse works without an external setter.
    """
    global _graph
    if _graph is None:
        try:
            from .agent_graph import build_agent_graph
            _graph = build_agent_graph()
            print("[vibeful] Agent graph compiled (standalone mode)")
        except Exception as e:
            print(f"[vibeful] WARNING: Agent graph build failed: {e}")


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

async def _startup_seed_mcp():
    """Seed the three built-in Vibeful MCP servers if they don't exist yet."""
    try:
        from .storage.sqlite import SqliteBackend
        from .database import Database
        db_url = os.getenv("DATABASE_URL", "")
        use_postgres = db_url.startswith("postgresql://") or db_url.startswith("postgres://")

        db = Database() if use_postgres else SqliteBackend()
        if not use_postgres:
            await db.init_schema()

        BUILTIN = [
            {"id": "builtin-web-search", "name": "web-search", "url": "http://localhost:3100", "transport": "http", "auth_type": "none", "auth_header": "", "agent_id": None},
            {"id": "builtin-file-read",  "name": "file-read",  "url": "http://localhost:3101", "transport": "http", "auth_type": "none", "auth_header": "", "agent_id": None},
            {"id": "builtin-calculator", "name": "calculator", "url": "http://localhost:3102", "transport": "http", "auth_type": "none", "auth_header": "", "agent_id": None},
        ]
        for srv in BUILTIN:
            existing = await db.get_mcp_server(srv["id"])
            if not existing:
                await db.create_mcp_server({**srv})

        print("[vibeful] Built-in MCP servers seeded")
    except Exception:
        pass  # best-effort seeding


async def _startup_db():
    """Initialize the database for Lucid endpoints.
    
    Strategy: default to SQLite (local dev). Use PostgreSQL only when
    DATABASE_URL is explicitly set to a postgres:// URL. This prevents
    silent fallback from PostgreSQL (unreachable after restart) to an
    empty SQLite file — the root cause of agents "disappearing."
    """
    global _db_lucid
    db_url = os.getenv("DATABASE_URL", "")
    use_postgres = db_url.startswith("postgresql://") or db_url.startswith("postgres://")

    if use_postgres:
        try:
            from .database import Database
            _db_lucid = Database()
            await _db_lucid.init_schema()
            print("[vibeful] Database: PostgreSQL connected")
            return
        except Exception as e:
            print(f"[vibeful] WARNING: PostgreSQL unavailable ({e}), falling back to SQLite")
            # Fall through to SQLite below

    # SQLite — default for local dev
    try:
        from .storage.sqlite import SqliteBackend
        _db_lucid = SqliteBackend()
        await _db_lucid.init_schema()
        print("[vibeful] Database: SQLite (local dev mode)")
    except Exception as e:
        print(f"[vibeful] ERROR: Database initialization failed: {e}")

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

    return_payload = {
        "session_id": session_id,
        "response": response_text,
        "tool_calls": tool_calls,
        "usage": usage,
        "error": error,
        "finished": result.finished,
    }

    # Fire webhooks in background (best-effort)
    if result.finished:
        asyncio.create_task(_fire_webhooks("conversation.completed", agent_id, return_payload))

    return return_payload


class AgentExecuteRequest(BaseModel):
    message: str
    system_prompt: str | None = None
    model: str | None = None
    temperature: float | None = None
    max_tokens: int = 4096
    context_ids: list[str] | None = None
    mcp_server_urls: list[str] | None = None


@app.post("/v1/agents/{agent_id}/execute")
async def execute_agent(agent_id: str, req: AgentExecuteRequest):
    """Headless agent invocation — returns full response with tool calls and usage."""
    if _graph is None:
        raise HTTPException(503, "Agent graph not initialized")

    db = _require_db()
    agent = await db.get_agent(agent_id) if hasattr(db, 'get_agent') else None
    if not agent:
        raise HTTPException(404, "Agent not found")

    from .agent_graph import AgentState

    state = AgentState(
        session_id=str(uuid.uuid4()),
        user_message=req.message,
        system_prompt=req.system_prompt or agent.get("system_prompt", "") or "",
        model=req.model or agent.get("model", "deepseek-chat"),
        temperature=req.temperature if req.temperature is not None else agent.get("temperature", 0.7),
        max_tokens=req.max_tokens,
        context_ids=req.context_ids if req.context_ids is not None else (agent.get("context_ids") or []),
        mcp_server_urls=req.mcp_server_urls if req.mcp_server_urls is not None else (agent.get("mcp_server_urls") or []),
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

    return_payload = {
        "agent_id": agent_id,
        "session_id": state.session_id,
        "response": response_text,
        "tool_calls": tool_calls,
        "usage": usage,
        "error": error,
        "finished": result.finished,
    }

    if result.finished:
        asyncio.create_task(_fire_webhooks("conversation.completed", agent_id, return_payload))

    return return_payload


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


# ── Sessions ────────────────────────────────────────────────

class SessionCreateRequest(BaseModel):
    agent_id: str = ""


@app.post("/v1/sessions")
async def create_session(req: SessionCreateRequest):
    """Create a stub session — used by the website chatbot and SDK."""
    session_id = str(uuid.uuid4())
    return {"session_id": session_id, "agent_id": req.agent_id}


# ── Contexts (Knowledge Base) ─────────────────────────────

class ContextCreateRequest(BaseModel):
    name: str
    agent_id: str = ""


@app.post("/v1/contexts")
async def create_context(req: ContextCreateRequest):
    """Create a knowledge context for RAG."""
    db = _require_db()
    ctx = await db.create_context({"name": req.name, "agent_id": req.agent_id or None})
    return ctx


@app.get("/v1/contexts")
async def list_contexts():
    """List all knowledge contexts."""
    db = _require_db()
    return await db.list_contexts()


@app.get("/v1/contexts/{context_id}")
async def get_context(context_id: str):
    """Get a single context by ID."""
    db = _require_db()
    ctx = await db.get_context(context_id)
    if not ctx:
        raise HTTPException(404, "context not found")
    return ctx


@app.delete("/v1/contexts/{context_id}")
async def delete_context(context_id: str):
    """Delete a context and all its files."""
    db = _require_db()
    deleted = await db.delete_context(context_id)
    if not deleted:
        raise HTTPException(404, "context not found")
    return {"deleted": True}


class ContextIngestRequest(BaseModel):
    text: str
    filename: str = "upload.txt"
    content_type: str = "text/plain"


@app.post("/v1/contexts/{context_id}/ingest")
async def ingest_text(context_id: str, req: ContextIngestRequest):
    """Ingest text content into a knowledge context."""
    if not req.text.strip():
        raise HTTPException(400, "text is required")
    db = _require_db()
    ctx = await db.get_context(context_id)
    if not ctx:
        raise HTTPException(404, "context not found")
    result = await db.ingest_file(
        context_id=context_id,
        filename=req.filename,
        content=req.text,
        content_type=req.content_type,
    )
    return result


@app.get("/v1/contexts/{context_id}/files")
async def list_context_files(context_id: str):
    """List all ingested files in a context."""
    db = _require_db()
    return await db.list_context_files(context_id)


# ── Multimodal Analysis ───────────────────────────────────

class MultimodalAnalyzeRequest(BaseModel):
    image_base64: str  # base64-encoded image (PNG/JPEG)
    prompt: str = "Describe this image in detail. Extract any visible text."
    temperature: float = 0.2
    max_tokens: int = 500


@app.post("/v1/analyze-image")
async def analyze_image(req: MultimodalAnalyzeRequest):
    """Analyze an image using DeepSeek's vision capabilities.
    Returns a text description that can be ingested into a knowledge context."""
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key or len(api_key) < 20 or "your-deepseek" in api_key.lower():
        raise HTTPException(503, "DEEPSEEK_API_KEY not configured")

    try:
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.deepseek.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{req.image_base64}"}},
                            {"type": "text", "text": req.prompt},
                        ],
                    }],
                    "temperature": req.temperature,
                    "max_tokens": req.max_tokens,
                },
            )
            data = resp.json()
            if "choices" in data:
                return {"analysis": data["choices"][0]["message"]["content"]}
            raise HTTPException(500, f"Vision API error: {data}")
    except Exception as e:
        raise HTTPException(500, f"Vision analysis failed: {e}")


# ── AI Assist ──────────────────────────────────────────────

class AIAssistRequest(BaseModel):
    system_prompt: str
    message: str
    temperature: float = 0.2
    max_tokens: int = 500


@app.post("/v1/ai/assist")
async def ai_assist(req: AIAssistRequest):
    """Direct LLM call — the model responds conversationally. The frontend
    extracts vibeful-command blocks from the response to drive the UI."""
    api_key = os.getenv("DEEPSEEK_API_KEY", "")
    if not api_key or len(api_key) < 20 or "your-deepseek" in api_key.lower():
        raise HTTPException(
            status_code=503,
            detail="DEEPSEEK_API_KEY not configured. Set it in .env or via the Setup tab."
        )

    try:
        from .llm import get_provider
        provider = get_provider()
        response = await provider.chat(
            messages=[
                {"role": "system", "content": req.system_prompt},
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
    styling: str = ""


@app.post("/v1/agents")
async def create_agent(req: AgentCreateRequest):
    db = _require_db()
    if await db.name_exists(req.name):
        raise HTTPException(409, f"An agent named '{req.name}' already exists")
    agent = await db.create_agent({
        "name": req.name, "description": req.description,
        "system_prompt": req.system_prompt, "model": req.model,
        "temperature": req.temperature, "config_yaml": req.config_yaml,
        "styling": req.styling,
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


@app.delete("/v1/agents/{agent_id}")
async def delete_agent(agent_id: str):
    db = _require_db()
    deleted = await db.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(404, "agent not found")
    return {"deleted": True}


class AgentUpdateRequest(BaseModel):
    name: str = ""
    description: str | None = None
    system_prompt: str | None = None
    config_yaml: str | None = None
    styling: str | None = None
    model: str | None = None
    temperature: float | None = None
    context_ids: list[str] | None = None

@app.put("/v1/agents/{agent_id}")
async def update_agent(agent_id: str, req: AgentUpdateRequest):
    """Update an agent's mutable fields — used by auto-save in the designer."""
    db = _require_db()
    agent = await db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "agent not found")
    # Check name uniqueness if name is being changed
    if req.name and req.name != agent.get("name"):
        if await db.name_exists(req.name, exclude_id=agent_id):
            raise HTTPException(409, f"An agent named '{req.name}' already exists")
    updates = {}
    for field in ("name", "description", "system_prompt", "model", "temperature"):
        val = getattr(req, field, None)
        if val is not None and val != "":
            updates[field] = val
    # config_yaml stores as config_json in the DB (SQLite column name)
    if req.config_yaml is not None and req.config_yaml != "":
        updates["config_json"] = req.config_yaml
    if req.styling is not None:
        updates["styling_json"] = req.styling
    if req.context_ids is not None:
        updates["context_ids"] = req.context_ids
    if updates:
        await db.update_agent(agent_id, updates)
        agent.update(updates)
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


# ── MCP Servers ────────────────────────────────────────────

BUILTIN_MCP = [
    {"id": "builtin-web-search", "name": "web-search", "url": "http://localhost:3100", "port": 3100},
    {"id": "builtin-file-read",  "name": "file-read",  "url": "http://localhost:3101", "port": 3101},
    {"id": "builtin-calculator", "name": "calculator", "url": "http://localhost:3102", "port": 3102},
]


@app.get("/v1/mcp-servers/health")
async def mcp_health_check():
    """Probe each registered MCP server's /health endpoint and return statuses."""
    import httpx
    db = _require_db()
    servers = await db.list_mcp_servers()
    results = []

    async with httpx.AsyncClient(timeout=3.0) as client:
        for srv in servers:
            url = srv["url"].rstrip("/")
            healthy = False
            error = None
            try:
                resp = await client.get(f"{url}/health")
                healthy = resp.status_code == 200
            except Exception as e:
                error = str(e)[:120]

            results.append({
                "id": srv["id"],
                "name": srv["name"],
                "url": srv["url"],
                "healthy": healthy,
                "error": error,
            })

    return results


@app.post("/v1/mcp-servers/builtin/start")
async def mcp_builtin_start():
    """Start all built-in MCP servers via docker compose."""
    import subprocess

    try:
        result = subprocess.run(
            ["docker", "compose", "up", "-d", "mcp-web-search", "mcp-file-read", "mcp-calculator"],
            capture_output=True, text=True, timeout=30,
            cwd=os.path.join(os.path.dirname(__file__), "..", "..", ".."),
        )
        if result.returncode == 0:
            return {"status": "started", "output": result.stdout[-500:]}
        return {"status": "failed", "error": result.stderr[-500:]}
    except FileNotFoundError:
        return {"status": "unavailable", "error": "Docker not found — start MCP servers manually with: npm run stack"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/v1/mcp-servers/builtin/stop")
async def mcp_builtin_stop():
    """Stop all built-in MCP servers via docker compose."""
    import subprocess

    try:
        result = subprocess.run(
            ["docker", "compose", "stop", "mcp-web-search", "mcp-file-read", "mcp-calculator"],
            capture_output=True, text=True, timeout=30,
            cwd=os.path.join(os.path.dirname(__file__), "..", "..", ".."),
        )
        if result.returncode == 0:
            return {"status": "stopped", "output": result.stdout[-500:]}
        return {"status": "failed", "error": result.stderr[-500:]}
    except FileNotFoundError:
        return {"status": "unavailable", "error": "Docker not found"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


BUILTIN_SERVICE_MAP = {
    "builtin-web-search": "mcp-web-search",
    "builtin-file-read":  "mcp-file-read",
    "builtin-calculator": "mcp-calculator",
}


async def _docker_compose(action: str, service: str) -> dict:
    """Run `docker compose {action} {service}` and return status."""
    import subprocess
    cmd = ["docker", "compose", action]
    if action == "up":
        cmd.append("-d")  # detached — otherwise up hangs until timeout
    cmd.append(service)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True, text=True, timeout=30,
            cwd=os.path.join(os.path.dirname(__file__), "..", "..", ".."),
        )
        if result.returncode == 0:
            return {"status": "ok", "output": result.stdout[-500:]}
        return {"status": "failed", "error": result.stderr[-500:]}
    except FileNotFoundError:
        return {"status": "unavailable", "error": "Docker not found"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@app.post("/v1/mcp-servers/{sid}/start")
async def mcp_server_start(sid: str):
    """Start a single MCP server via docker compose."""
    service = BUILTIN_SERVICE_MAP.get(sid)
    if not service:
        raise HTTPException(400, f"No docker-compose service mapping for server '{sid}'")
    return await _docker_compose("up", service)


@app.post("/v1/mcp-servers/{sid}/stop")
async def mcp_server_stop(sid: str):
    """Stop a single MCP server via docker compose."""
    service = BUILTIN_SERVICE_MAP.get(sid)
    if not service:
        raise HTTPException(400, f"No docker-compose service mapping for server '{sid}'")
    return await _docker_compose("stop", service)


class McpServerCreateRequest(BaseModel):
    name: str
    url: str
    transport: str = "http"
    auth_type: str = "none"
    auth_header: str = ""
    agent_id: str | None = None


@app.get("/v1/mcp-servers")
async def list_mcp_servers(agent_id: str | None = None):
    db = _require_db()
    servers = await db.list_mcp_servers(agent_id)
    return servers


@app.get("/v1/mcp-servers/{sid}")
async def get_mcp_server(sid: str):
    db = _require_db()
    srv = await db.get_mcp_server(sid)
    if not srv:
        raise HTTPException(404, "MCP server not found")
    return srv


@app.post("/v1/mcp-servers")
async def create_mcp_server(req: McpServerCreateRequest):
    db = _require_db()
    return await db.create_mcp_server(req.model_dump())


@app.delete("/v1/mcp-servers/{sid}")
async def delete_mcp_server(sid: str):
    db = _require_db()
    deleted = await db.delete_mcp_server(sid)
    if not deleted:
        raise HTTPException(404, "MCP server not found")
    return {"status": "deleted"}


# ── Agent Pages ────────────────────────────────────────────

class PageCreateRequest(BaseModel):
    agent_id: str
    slug: str
    title: str = ""
    content_markdown: str = ""
    layout_json: str = "{}"
    published: int = 0


class PageUpdateRequest(BaseModel):
    title: str | None = None
    content_markdown: str | None = None
    layout_json: str | None = None
    published: int | None = None


@app.get("/v1/pages")
async def list_pages(agent_id: str | None = None):
    db = _require_db()
    return await db.list_pages(agent_id)


@app.get("/v1/pages/{pid}")
async def get_page(pid: str):
    db = _require_db()
    page = await db.get_page(pid)
    if not page:
        raise HTTPException(404, "Page not found")
    return page


@app.get("/v1/pages/slug/{slug}")
async def get_page_by_slug(slug: str):
    db = _require_db()
    page = await db.get_page_by_slug(slug)
    if not page:
        raise HTTPException(404, "Page not found")
    return page


@app.post("/v1/pages")
async def create_page(req: PageCreateRequest):
    db = _require_db()
    return await db.create_page(req.model_dump())


@app.put("/v1/pages/{pid}")
async def update_page(pid: str, req: PageUpdateRequest):
    db = _require_db()
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    page = await db.update_page(pid, updates)
    if not page:
        raise HTTPException(404, "Page not found")
    return page


class PageInteractRequest(BaseModel):
    widget_id: str
    event_type: str  # "click", "change", "submit"
    value: str | None = None
    form_data: dict[str, str] | None = None


@app.post("/v1/pages/{pid}/interact")
async def interact_with_page(pid: str, req: PageInteractRequest):
    """Handle a widget interaction on an agent page.

    Sends the widget event to the page's agent, which can respond with
    updated vibeful-command blocks (new widgets, updated content, etc.).
    The agent's response is returned and the front-end applies the
    resulting command blocks to re-render the page.
    """
    db = _require_db()
    page = await db.get_page(pid) if hasattr(db, 'get_page') else None
    if not page:
        raise HTTPException(404, "Page not found")

    agent_id = page.get("agent_id", "")
    if not agent_id:
        raise HTTPException(400, "Page has no associated agent")

    if _graph is None:
        raise HTTPException(503, "Agent graph not initialized")

    from .agent_graph import AgentState

    message = (
        f"User interacted with widget '{req.widget_id}' on page '{page.get('slug', pid)}'.\n"
        f"Event type: {req.event_type}\n"
        f"Value: {req.value or 'N/A'}\n"
        f"Form data: {json.dumps(req.form_data) if req.form_data else 'N/A'}\n\n"
        f"Current page content:\n{page.get('content_markdown', '')}\n\n"
        f"Respond with updated content and/or vibeful-command blocks to update the page. "
        f"Keep existing content that hasn't changed. For form submissions, acknowledge the "
        f"submission and provide a relevant response. Only return markdown and command blocks "
        f"— no conversational text."
    )

    state = AgentState(
        session_id=str(uuid.uuid4()),
        user_message=message,
        system_prompt=page.get("system_prompt", "") or "",
        model=page.get("model", "deepseek-chat"),
        temperature=page.get("temperature", 0.7),
        max_tokens=4096,
    )

    try:
        result = await _graph.ainvoke(state)
    except Exception as e:
        raise HTTPException(500, f"Agent error: {e}")

    response_text = ""
    for chunk in result.response_chunks:
        if chunk.get("state") == "STREAMING":
            response_text += chunk.get("text_chunk", "")

    return {
        "page_id": pid,
        "response": response_text,
        "finished": result.finished,
    }


@app.delete("/v1/pages/{pid}")
async def delete_page(pid: str):
    db = _require_db()
    deleted = await db.delete_page(pid)
    if not deleted:
        raise HTTPException(404, "Page not found")
    return {"status": "deleted"}


# ── Analytics ──────────────────────────────────────────────

@app.get("/v1/analytics")
async def get_analytics():
    """Return platform-wide summary analytics."""
    db = _require_db()
    agents = await db.list_agents() if hasattr(db, 'list_agents') else []
    contexts = await db.list_contexts() if hasattr(db, 'list_contexts') else []
    mcp_servers = await db.list_mcp_servers() if hasattr(db, 'list_mcp_servers') else []
    pages = await db.list_pages() if hasattr(db, 'list_pages') else []

    agent_count = len(agents) if isinstance(agents, list) else 0
    context_count = len(contexts) if isinstance(contexts, list) else 0
    mcp_count = len(mcp_servers) if isinstance(mcp_servers, list) else 0
    page_count = len(pages) if isinstance(pages, list) else 0
    published_pages = sum(1 for p in pages if isinstance(p, dict) and p.get("published")) if isinstance(pages, list) else 0

    # Per-agent breakdown
    agent_stats = []
    for agent in (agents if isinstance(agents, list) else []):
        if not isinstance(agent, dict):
            continue
        aid = agent.get("id", "")
        apages = await db.list_pages(aid) if hasattr(db, 'list_pages') else []
        amcp = await db.list_mcp_servers(aid) if hasattr(db, 'list_mcp_servers') else []
        agent_stats.append({
            "id": aid,
            "name": agent.get("name", "Unnamed"),
            "model": agent.get("model", "deepseek-chat"),
            "pages": len(apages) if isinstance(apages, list) else 0,
            "published": sum(1 for p in apages if isinstance(p, dict) and p.get("published")) if isinstance(apages, list) else 0,
            "mcp_attached": len(amcp) if isinstance(amcp, list) else 0,
        })

    return {
        "agents": agent_count,
        "contexts": context_count,
        "mcp_servers": mcp_count,
        "pages": page_count,
        "published_pages": published_pages,
        "mcp_healthy": 0,
        "conversations_today": 0,
        "tokens_used_today": 0,
        "cost_estimate_usd": 0.0,
        "guardrail_triggers": 0,
        "per_agent": agent_stats,
    }


@app.get("/v1/analytics/per-agent")
async def get_per_agent_analytics(agent_id: str | None = None):
    """Return per-agent analytics: pages, contexts, MCP attachments."""
    db = _require_db()
    agent_filter = agent_id

    pages = await db.list_pages(agent_filter) if hasattr(db, 'list_pages') else []
    contexts = await db.list_contexts() if hasattr(db, 'list_contexts') else []
    mcp = await db.list_mcp_servers(agent_filter) if hasattr(db, 'list_mcp_servers') else []

    return {
        "agent_id": agent_filter,
        "pages": len(pages) if isinstance(pages, list) else 0,
        "published_pages": sum(1 for p in pages if isinstance(p, dict) and p.get("published")) if isinstance(pages, list) else 0,
        "contexts": len(contexts) if isinstance(contexts, list) else 0,
        "mcp_attached": len(mcp) if isinstance(mcp, list) else 0,
    }


# ── Agent Import/Export ───────────────────────────────────

import yaml as _yaml

@app.get("/v1/agents/{agent_id}/export")
async def export_agent(agent_id: str):
    """Export an agent as a portable .vibeful.yaml bundle."""
    db = _require_db()
    agent = await db.get_agent(agent_id) if hasattr(db, 'get_agent') else None
    if not agent:
        raise HTTPException(404, "Agent not found")

    from fastapi.responses import PlainTextResponse

    bundle = {
        "vibeful_version": "0.1.0",
        "agent": {
            "name": agent.get("name", ""),
            "description": agent.get("description", ""),
            "system_prompt": agent.get("system_prompt", ""),
            "model": agent.get("model", "deepseek-chat"),
            "temperature": agent.get("temperature", 0.7),
            "graph_yaml": agent.get("config_json", ""),
            "styling": agent.get("styling_json", ""),
            "context_ids": agent.get("context_ids", []),
            "mcp_server_urls": agent.get("mcp_server_urls", []),
        },
    }
    yaml_str = _yaml.dump(bundle, default_flow_style=False, allow_unicode=True, sort_keys=False)
    return PlainTextResponse(yaml_str, media_type="application/x-yaml",
                             headers={"Content-Disposition": f"attachment; filename={agent.get('name','agent')}.vibeful.yaml"})


class AgentImportRequest(BaseModel):
    yaml_content: str


@app.post("/v1/agents/import")
async def import_agent(req: AgentImportRequest):
    """Import an agent from a .vibeful.yaml bundle."""
    db = _require_db()
    try:
        bundle = _yaml.safe_load(req.yaml_content)
        agent_data = bundle.get("agent", {})
        if not agent_data:
            raise HTTPException(400, "Invalid bundle: missing 'agent' key")
    except Exception:
        raise HTTPException(400, "Invalid YAML content")

    name = agent_data.get("name", "Imported Agent")
    # Ensure unique name
    existing = await db.list_agents() if hasattr(db, 'list_agents') else []
    base_name = name
    counter = 1
    existing_names = {a.get("name", "") for a in (existing if isinstance(existing, list) else [])}
    while name in existing_names:
        name = f"{base_name} ({counter})"
        counter += 1

    result = await db.create_agent({
        "name": name,
        "description": agent_data.get("description", ""),
        "system_prompt": agent_data.get("system_prompt", ""),
        "model": agent_data.get("model", "deepseek-chat"),
        "temperature": agent_data.get("temperature", 0.7),
        "config_yaml": agent_data.get("graph_yaml", ""),
        "styling": agent_data.get("styling", ""),
    }) if hasattr(db, 'create_agent') else {}

    # Attach contexts and MCP servers
    aid = result.get("id") if isinstance(result, dict) else ""
    if aid and hasattr(db, 'update_agent'):
        context_ids = agent_data.get("context_ids", [])
        mcp_urls = agent_data.get("mcp_server_urls", [])
        if context_ids or mcp_urls:
            updates = {}
            if context_ids:
                updates["context_ids"] = context_ids
            if mcp_urls:
                updates["mcp_server_urls"] = mcp_urls
            await db.update_agent(aid, updates)

    return result


# ── Agent Tests ───────────────────────────────────────────

class TestCreateRequest(BaseModel):
    agent_id: str
    name: str = ""
    input_message: str
    expected_contains: str = ""
    expected_not_contains: str = ""


@app.post("/v1/agent-tests")
async def create_test(req: TestCreateRequest):
    db = _require_db()
    return await db.create_test(req.model_dump())


@app.get("/v1/agent-tests")
async def list_tests(agent_id: str | None = None):
    db = _require_db()
    return await db.list_tests(agent_id)


@app.delete("/v1/agent-tests/{tid}")
async def delete_test(tid: str):
    db = _require_db()
    deleted = await db.delete_test(tid)
    if not deleted:
        raise HTTPException(404, "Test not found")
    return {"status": "deleted"}


@app.post("/v1/agent-tests/{tid}/run")
async def run_test(tid: str):
    """Run a single test case against its agent and return pass/fail."""
    db = _require_db()
    test_case = None
    if hasattr(db, 'list_tests'):
        tests = await db.list_tests()
        test_case = next((t for t in tests if t.get("id") == tid), None)
    if not test_case:
        raise HTTPException(404, "Test not found")

    import httpx
    agent_id = test_case.get("agent_id", "")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"http://localhost:50052/v1/agents/{agent_id}/execute",
                json={"message": test_case["input_message"]},
            )
            result = resp.json() if resp.status_code == 200 else {}
            response_text = result.get("response", "")
    except Exception as e:
        response_text = ""

    expected_in = test_case.get("expected_contains", "")
    expected_not = test_case.get("expected_not_contains", "")

    contains_pass = not expected_in or expected_in.lower() in response_text.lower()
    not_contains_pass = not expected_not or expected_not.lower() not in response_text.lower()
    passed = contains_pass and not_contains_pass

    if hasattr(db, 'record_test_result'):
        await db.record_test_result(tid, passed)

    return {
        "test_id": tid,
        "passed": passed,
        "response": response_text[:500],
        "checks": {
            "contains": {"expected": expected_in, "passed": contains_pass},
            "not_contains": {"expected": expected_not, "passed": not_contains_pass},
        },
    }


@app.post("/v1/agent-tests/run-all")
async def run_all_tests(agent_id: str):
    """Run all tests for an agent and return summary."""
    db = _require_db()
    tests = await db.list_tests(agent_id) if hasattr(db, 'list_tests') else []

    results = []
    for test_case in tests:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"http://localhost:50052/v1/agents/{agent_id}/execute",
                    json={"message": test_case["input_message"]},
                )
                result = resp.json() if resp.status_code == 200 else {}
                response_text = result.get("response", "")
        except Exception:
            response_text = ""

        expected_in = test_case.get("expected_contains", "")
        expected_not = test_case.get("expected_not_contains", "")
        passed = (not expected_in or expected_in.lower() in response_text.lower()) and \
                 (not expected_not or expected_not.lower() not in response_text.lower())

        if hasattr(db, 'record_test_result'):
            await db.record_test_result(test_case["id"], passed)

        results.append({
            "test_id": test_case["id"],
            "name": test_case.get("name", ""),
            "passed": passed,
        })

    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    return {
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "results": results,
    }


# ── Agent Staging / Promotion ─────────────────────────────

class PromoteRequest(BaseModel):
    source_agent_id: str
    target_agent_id: str


@app.post("/v1/agents/promote")
async def promote_agent(req: PromoteRequest):
    """Promote a staging agent's config to a production agent."""
    db = _require_db()
    source = await db.get_agent(req.source_agent_id) if hasattr(db, 'get_agent') else None
    target = await db.get_agent(req.target_agent_id) if hasattr(db, 'get_agent') else None
    if not source:
        raise HTTPException(404, "Source agent not found")
    if not target:
        raise HTTPException(404, "Target agent not found")

    # Copy config, styling, system_prompt, model, temperature from source → target
    updates = {
        "system_prompt": source.get("system_prompt", target.get("system_prompt", "")),
        "model": source.get("model", target.get("model", "deepseek-chat")),
        "temperature": source.get("temperature", target.get("temperature", 0.7)),
        "config_yaml": source.get("config_json", target.get("config_json", "")),
        "styling": source.get("styling_json", target.get("styling_json", "")),
    }
    if hasattr(db, 'update_agent'):
        await db.update_agent(req.target_agent_id, updates)

    # Log audit event
    if hasattr(db, 'log_audit'):
        await db.log_audit("agent.promoted", "agent", req.target_agent_id,
                           details={"source_id": req.source_agent_id})

    return {"status": "promoted", "source": req.source_agent_id, "target": req.target_agent_id}


# ── Audit Log ─────────────────────────────────────────────

@app.get("/v1/audit")
async def list_audit_events(resource_type: str | None = None, agent_id: str | None = None, limit: int = 50):
    db = _require_db()
    return await db.list_audit_events(resource_type, agent_id, limit)


# ── API Keys ──────────────────────────────────────────────

class ApiKeyCreateRequest(BaseModel):
    name: str = ""
    agent_id: str | None = None
    scopes: str = '["read","execute"]'


@app.post("/v1/api-keys")
async def create_api_key(req: ApiKeyCreateRequest):
    db = _require_db()
    result = await db.create_api_key(req.model_dump())
    return result


@app.get("/v1/api-keys")
async def list_api_keys(agent_id: str | None = None):
    db = _require_db()
    return await db.list_api_keys(agent_id)


@app.delete("/v1/api-keys/{kid}")
async def revoke_api_key(kid: str):
    db = _require_db()
    revoked = await db.revoke_api_key(kid)
    if not revoked:
        raise HTTPException(404, "API key not found")
    return {"status": "revoked"}


# ── API Key Auth Middleware ───────────────────────────────

import hashlib
from fastapi import Depends, Header

async def _validate_api_key(authorization: str | None = Header(default=None)):
    """Validate Bearer token from Authorization header. Returns key record or raises 401."""
    if not authorization or not authorization.startswith("Bearer "):
        return None  # No auth header — optional for public endpoints
    token = authorization.removeprefix("Bearer ").strip()
    key_hash = hashlib.sha256(token.encode()).hexdigest()
    db = _require_db()
    key_record = await db.get_api_key_by_hash(key_hash)
    if not key_record:
        raise HTTPException(401, "Invalid API key")
    # Touch last_used_at
    if hasattr(db, 'touch_api_key'):
        await db.touch_api_key(key_record["id"])
    return key_record


async def _require_api_key(authorization: str | None = Header(default=None)):
    """Require a valid API key. Raises 401 if missing or invalid."""
    key = await _validate_api_key(authorization)
    if not key:
        raise HTTPException(401, "API key required — provide Bearer token in Authorization header")
    return key


# Protected execute endpoint — requires API key
@app.post("/v1/agents/{agent_id}/execute-keyed")
async def execute_agent_keyed(agent_id: str, req: AgentExecuteRequest, api_key: dict = Depends(_require_api_key)):
    """Same as /execute but requires API key authentication."""
    return await execute_agent(agent_id, req)


# ── Users & Teams ────────────────────────────────────────

class UserRegisterRequest(BaseModel):
    email: str
    password: str
    display_name: str = ""


@app.post("/v1/users/register")
async def register_user(req: UserRegisterRequest):
    """Register a new user account."""
    db = _require_db()
    if not hasattr(db, 'create_user'):
        raise HTTPException(501, "User management not supported in this backend")
    existing = await db.get_user_by_email(req.email) if hasattr(db, 'get_user_by_email') else None
    if existing:
        raise HTTPException(409, "Email already registered")
    user = await db.create_user({
        "email": req.email,
        "password": req.password,
        "display_name": req.display_name,
    })
    return user


class UserLoginRequest(BaseModel):
    email: str
    password: str


@app.post("/v1/users/login")
async def login_user(req: UserLoginRequest):
    """Login with email and password."""
    db = _require_db()
    if not hasattr(db, 'verify_user_password'):
        raise HTTPException(501, "User management not supported in this backend")
    user = await db.verify_user_password(req.email, req.password)
    if not user:
        raise HTTPException(401, "Invalid email or password")
    return {"status": "authenticated", "user": user}


class TeamCreateRequest(BaseModel):
    name: str


@app.post("/v1/teams")
async def create_team(req: TeamCreateRequest):
    """Create a new team."""
    db = _require_db()
    team = await db.create_team({"name": req.name})
    return team


@app.get("/v1/teams")
async def list_teams():
    """List all teams."""
    db = _require_db()
    return await db.list_teams()


class TeamMemberAddRequest(BaseModel):
    user_id: str
    role: str = "member"


@app.post("/v1/teams/{team_id}/members")
async def add_team_member(team_id: str, req: TeamMemberAddRequest):
    """Add a user to a team."""
    db = _require_db()
    return await db.add_team_member(team_id, req.user_id, req.role)


@app.get("/v1/teams/{team_id}/members")
async def list_team_members(team_id: str):
    """List all members of a team."""
    db = _require_db()
    return await db.list_team_members(team_id)


# ── Webhooks ───────────────────────────────────────────────

class WebhookCreateRequest(BaseModel):
    url: str
    events: list[str] = ["conversation.completed"]
    secret: str = ""


@app.post("/v1/webhooks")
async def register_webhook(req: WebhookCreateRequest):
    """Register a webhook endpoint for agent events."""
    db = _require_db()
    return await db.register_webhook(req.model_dump())


async def _fire_webhooks(event_type: str, agent_id: str, payload: dict[str, Any]) -> None:
    """Fire all registered webhooks matching the event type (best-effort, background)."""
    db = _require_db()
    import httpx

    try:
        hooks = await db.list_webhooks() if hasattr(db, 'list_webhooks') else []
    except Exception:
        return

    for hook in hooks:
        if not isinstance(hook, dict):
            continue
        events = hook.get("events", [])
        if event_type not in events:
            continue
        url = hook.get("url", "")
        if not url:
            continue
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                await client.post(url, json={
                    "event": event_type,
                    "agent_id": agent_id,
                    "payload": payload,
                })
        except Exception:
            pass  # webhook delivery is best-effort


# ── SSE Stream ─────────────────────────────────────────────

class StreamRequest(BaseModel):
    message: str
    system_prompt: str | None = None


@app.post("/v1/agents/{agent_id}/stream")
async def stream_agent(agent_id: str, req: StreamRequest):
    """Stream agent responses via Server-Sent Events."""
    from fastapi.responses import StreamingResponse
    import json as _json

    if _graph is None:
        raise HTTPException(503, "Agent graph not initialized")

    db = _require_db()
    agent = await db.get_agent(agent_id) if hasattr(db, 'get_agent') else None
    if not agent:
        raise HTTPException(404, "Agent not found")

    from .agent_graph import AgentState

    state = AgentState(
        session_id=str(uuid.uuid4()),
        user_message=req.message,
        system_prompt=req.system_prompt or agent.get("system_prompt", "") or "",
        model=agent.get("model", "deepseek-chat"),
        temperature=agent.get("temperature", 0.7),
        max_tokens=4096,
        context_ids=agent.get("context_ids") or [],
        mcp_server_urls=agent.get("mcp_server_urls") or [],
    )

    async def event_stream():
        response_text = ""
        tool_calls = []
        usage = {}
        finished = False
        try:
            result = await _graph.ainvoke(state)
            for chunk in result.response_chunks:
                state_label = chunk.get("state", "")
                if state_label == "STREAMING":
                    text = chunk.get('text_chunk', '')
                    response_text += text
                    yield f"data: {_json.dumps({'type': 'token', 'text': text})}\n\n"
                elif state_label == "TOOL_USED":
                    tc = chunk.get('tool_call', {})
                    tool_calls.append(tc)
                    yield f"data: {_json.dumps({'type': 'tool_call', 'tool': tc})}\n\n"
                elif state_label == "TOOL_RESULT":
                    yield f"data: {_json.dumps({'type': 'tool_result', 'tool': {'result': chunk.get('tool_result', None)}})}\n\n"
                elif state_label == "COMPLETED":
                    usage = chunk.get('usage', {})
                    finished = True
                    yield f"data: {_json.dumps({'type': 'complete', 'usage': usage})}\n\n"
                if chunk.get("error"):
                    yield f"data: {_json.dumps({'type': 'error', 'message': chunk['error']})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"
            if finished:
                asyncio.create_task(_fire_webhooks("conversation.completed", agent_id, {
                    "agent_id": agent_id,
                    "session_id": state.session_id,
                    "response": response_text,
                    "tool_calls": tool_calls,
                    "usage": usage,
                    "finished": finished,
                }))

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
