"""Vibeful Proxy - REST API gateway.

REST endpoints for agent CRUD, context management, content ingestion,
session creation, and conversation routing. The proxy fronts the database
and routes conversation requests to the agent engine via gRPC.
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json as _json
import os
import sys

# ── App ────────────────────────────────────────────────────────

app = FastAPI(
    title="Vibeful Proxy",
    version="0.1.0",
    description="Stateless credential-injecting gateway",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Imports ────────────────────────────────────────────────────

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from agent_engine.src.database import Database
from agent_engine.src.rag import RagPipeline
from agent_engine.src.embeddings import EmbeddingsClient
from src.agent_client import AgentEngineClient

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
AGENT_ENGINE_URL = os.getenv("AGENT_ENGINE_URL", "agent-engine:50051")

_db = Database()
_rag = RagPipeline(_db, EmbeddingsClient())
_agent_client = AgentEngineClient(AGENT_ENGINE_URL)


@app.on_event("startup")
async def startup():
    await _db.init_schema()
    print("[proxy] Schema initialized")


# ── Health ─────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "proxy", "phase": 1}


@app.get("/health/config")
async def health_config():
    """Report configuration status for the Management Console setup wizard."""
    key = os.getenv("DEEPSEEK_API_KEY", "")
    key_configured = bool(key and "your-deepseek" not in key.lower() and len(key) > 20)
    return {
        "deepseek_api_key_configured": key_configured,
        "llm_provider": os.getenv("VIBEFUL_LLM_PROVIDER", "deepseek"),
        "auth_provider": os.getenv("VIBEFUL_AUTH_PROVIDER", "passthrough"),
        "needs_setup": not key_configured,
        "setup_instructions":
            "1. Copy .env.example to .env\n"
            "2. Add your DEEPSEEK_API_KEY (get one at https://platform.deepseek.com/api_keys)\n"
            "3. Restart: docker compose down && docker compose up -d",
        "get_api_key_url": "https://platform.deepseek.com/api_keys",
    }

# ── Agents ─────────────────────────────────────────────────────

@app.post("/v1/agents")
async def create_agent(request: Request):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "name is required")
    agent = await _db.create_agent(body)
    return agent

@app.get("/v1/agents")
async def list_agents():
    return await _db.list_agents()

@app.get("/v1/agents/{agent_id}")
async def get_agent(agent_id: str):
    agent = await _db.get_agent(agent_id)
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent

@app.put("/v1/agents/{agent_id}")
async def update_agent(agent_id: str, request: Request):
    body = await request.json()
    agent = await _db.update_agent(agent_id, body)
    if not agent:
        raise HTTPException(404, "agent not found")
    return agent

@app.delete("/v1/agents/{agent_id}")
async def delete_agent(agent_id: str):
    deleted = await _db.delete_agent(agent_id)
    if not deleted:
        raise HTTPException(404, "agent not found")
    return {"deleted": True}


# ── Contexts ───────────────────────────────────────────────────

@app.post("/v1/contexts")
async def create_context(request: Request):
    body = await request.json()
    ctx = await _db.create_context(body)
    return ctx

@app.get("/v1/contexts")
async def list_contexts():
    return await _db.list_contexts()

@app.get("/v1/contexts/{ctx_id}")
async def get_context(ctx_id: str):
    ctx = await _db.get_context(ctx_id)
    if not ctx:
        raise HTTPException(404, "context not found")
    return ctx

@app.post("/v1/contexts/{ctx_id}/ingest")
async def ingest_text(ctx_id: str, request: Request):
    body = await request.json()
    text = body.get("text", "")
    filename = body.get("filename", "upload.txt")
    if not text.strip():
        raise HTTPException(400, "text is required")

    result = await _rag.ingest_text(
        context_id=ctx_id,
        filename=filename,
        text=text,
        content_type=body.get("content_type", "text/plain"),
    )
    return result


# ── Sessions ───────────────────────────────────────────────────

@app.post("/v1/sessions")
async def create_session(request: Request):
    body = await request.json()

    # If agent_id is provided, load agent config
    agent_config = {}
    agent_id = body.get("agent_id")
    if agent_id:
        agent = await _db.get_agent(agent_id)
        if agent:
            agent_config = {
                "system_prompt": agent.get("system_prompt", ""),
                "model": agent.get("model", "deepseek-chat"),
                "temperature": agent.get("temperature", 0.7),
                "max_tokens": agent.get("max_tokens", 4096),
            }
            body["context_ids"] = body.get("context_ids") or agent.get("context_ids", [])
            body["mcp_server_urls"] = body.get("mcp_server_urls") or agent.get("mcp_server_urls", [])

    body["agent_config"] = agent_config
    session = await _db.create_session(body)
    return session

@app.get("/v1/sessions/{session_id}")
async def get_session(session_id: str):
    session = await _db.get_session(session_id)
    if not session:
        raise HTTPException(404, "session not found")
    return session

@app.post("/v1/sessions/{session_id}/converse")
async def converse(session_id: str, request: Request):
    """Route a conversation turn to the agent engine via direct gRPC."""
    body = await request.json()
    content = body.get("content", "")
    if not content.strip():
        raise HTTPException(400, "content is required")

    # Load session to get agent config
    session = await _db.get_session(session_id)
    if not session:
        raise HTTPException(404, "session not found")

    try:
        chunks = await _agent_client.converse(
            session_id=session_id,
            content=content,
            tool_results=body.get("tool_results"),
            config={
                "system_prompt": session.get("agent_config", {}).get("system_prompt", ""),
                "model": session.get("agent_config", {}).get("model", "deepseek-chat"),
                "temperature": session.get("agent_config", {}).get("temperature", 0.7),
                "max_tokens": session.get("agent_config", {}).get("max_tokens", 4096),
                "context_ids": session.get("context_ids", []),
                "mcp_server_urls": session.get("mcp_server_urls", []),
            },
        )
        return {"session_id": session_id, "chunks": chunks}
    except Exception as e:
        raise HTTPException(500, f"Agent engine unreachable: {e}")


# ── MCP Servers ─────────────────────────────────────────────────

@app.post("/v1/mcp-servers")
async def create_mcp_server(request: Request):
    body = await request.json()
    if not body.get("name") or not body.get("url"):
        raise HTTPException(400, "name and url are required")
    return await _db.create_mcp_server(body)

@app.get("/v1/mcp-servers")
async def list_mcp_servers(agent_id: str | None = None):
    return await _db.list_mcp_servers(agent_id)

@app.get("/v1/mcp-servers/{sid}")
async def get_mcp_server(sid: str):
    srv = await _db.get_mcp_server(sid)
    if not srv:
        raise HTTPException(404, "MCP server not found")
    return srv

# ── Workflows ──────────────────────────────────────────────────

@app.post("/v1/workflows")
async def create_workflow(request: Request):
    body = await request.json()
    if not body.get("name"):
        raise HTTPException(400, "name is required")
    return await _db.create_workflow(body)

@app.get("/v1/workflows")
async def list_workflows(agent_id: str | None = None):
    return await _db.list_workflows(agent_id)

@app.get("/v1/workflows/{wid}")
async def get_workflow(wid: str):
    wf = await _db.get_workflow(wid)
    if not wf:
        raise HTTPException(404, "workflow not found")
    return wf

# ── Observability & Analytics ─────────────────────────────────

@app.get("/v1/events")
async def query_events(session_id: str | None = None, event_name: str | None = None, limit: int = 100):
    return await _db.query_events(session_id=session_id, event_name=event_name, limit=limit)

@app.get("/v1/cost")
async def get_cost(agent_id: str = "", days: int = 30):
    return await _db.query_cost(agent_id=agent_id, days=days)

@app.get("/v1/analytics/usage")
async def get_usage_stats(days: int = 7):
    from agent_engine.src.analytics import AnalyticsPipeline
    pipeline = AnalyticsPipeline(_db, _rag.embeddings)
    return await pipeline.get_usage_stats(days=days)

@app.get("/v1/analytics/knowledge-gaps")
async def get_knowledge_gaps(agent_id: str = "", days: int = 7):
    from agent_engine.src.analytics import AnalyticsPipeline
    pipeline = AnalyticsPipeline(_db, _rag.embeddings)
    return await pipeline.detect_knowledge_gaps(agent_id=agent_id, days=days)

@app.get("/v1/analytics/themes")
async def get_themes(session_id: str | None = None):
    from agent_engine.src.analytics import AnalyticsPipeline
    pipeline = AnalyticsPipeline(_db, _rag.embeddings)
    return await pipeline.get_cohort_themes(session_id=session_id)

# ── Facts (Agent Memory) ──────────────────────────────────────

@app.post("/v1/facts/recall")
async def recall_facts(request: Request):
    body = await request.json()
    from agent_engine.src.agent_memory import AgentMemory
    memory = AgentMemory(_db, _rag.embeddings)
    facts = await memory.recall_facts(
        user_identity=body.get("user_identity", ""),
        query=body.get("query"),
        limit=body.get("limit", 5),
    )
    formatted = memory.format_facts_for_prompt(facts)
    return {"facts": facts, "prompt_injection": formatted}

@app.delete("/v1/facts/{fact_id}")
async def delete_fact(fact_id: str, user_identity: str = ""):
    from agent_engine.src.agent_memory import AgentMemory
    memory = AgentMemory(_db, _rag.embeddings)
    deleted = await memory.delete_specific_fact(fact_id, user_identity)
    if not deleted:
        raise HTTPException(404, "Fact not found")
    return {"deleted": True}

@app.delete("/v1/facts")
async def delete_all_facts(user_identity: str = ""):
    from agent_engine.src.agent_memory import AgentMemory
    memory = AgentMemory(_db, _rag.embeddings)
    count = await memory.delete_all_facts(user_identity)
    return {"deleted_count": count}

# ── Threads ───────────────────────────────────────────────────

@app.post("/v1/threads")
async def create_thread(request: Request):
    body = await request.json()
    from agent_engine.src.threads import ThreadManager, ThreadConfig
    manager = ThreadManager(_db)
    config = ThreadConfig(
        agent_id=body.get("agent_id"),
        context_ids=body.get("context_ids"),
        mcp_server_urls=body.get("mcp_server_urls"),
        user_identity=body.get("user_identity"),
        event_description=body.get("event_description", ""),
        initial_context=body.get("initial_context", ""),
    )
    return await manager.create_thread(config)

@app.get("/v1/threads/{thread_id}")
async def get_thread(thread_id: str):
    thread = await _db.get_thread(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    return thread

@app.post("/v1/threads/{thread_id}/deliver")
async def deliver_thread(thread_id: str):
    from agent_engine.src.threads import ThreadManager
    manager = ThreadManager(_db)
    thread = await manager.deliver_thread(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    return thread

# ── Events ─────────────────────────────────────────────────────

@app.post("/v1/events")
async def ingest_events(request: Request):
    body = await request.json()
    events = body if isinstance(body, list) else [body]
    for evt in events:
        await _db.log_event(
            event_name=evt.get("eventName", "unknown"),
            event_data=evt,
            session_id=evt.get("session_id"),
        )
    return {"accepted": len(events)}


# ── Lucid Capabilities ──────────────────────────────────────────


# ── Glyphs ─────────────────────────────────────────────────

@app.get("/v1/glyphs")
async def list_glyphs():
    glyphs = await _db.list_glyphs()
    return {"glyphs": glyphs}


@app.post("/v1/glyphs")
async def create_glyph(request: Request):
    body = await request.json()
    if not body.get("name") or not body.get("symbol"):
        raise HTTPException(400, "name and symbol are required")
    return await _db.add_glyph(body)


@app.delete("/v1/glyphs/{name}")
async def delete_glyph(name: str):
    deleted = await _db.delete_glyph(name)
    if not deleted:
        raise HTTPException(404, f"Glyph '{name}' not found")
    return {"deleted": name}


# ── Concepts ───────────────────────────────────────────────

@app.get("/v1/concepts")
async def list_concepts(domain: str = "", search: str = ""):
    concepts = await _db.get_concepts_by_domain(domain=domain or None)
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
    memories = await _db.list_global_memories(memory_type=type or None)
    return {"memories": memories}


# ── Token Credits ──────────────────────────────────────────

@app.get("/v1/tokens/balance")
async def get_token_balance(user_identity: str, agent_id: str = ""):
    from agent_engine.src.token_tracker import TokenTracker
    tracker = TokenTracker(_db)
    balance = await tracker.get_balance(user_identity, agent_id or None)
    return {"user_identity": user_identity, "balance": balance}


@app.post("/v1/tokens/credit")
async def credit_tokens(request: Request):
    body = await request.json()
    from agent_engine.src.token_tracker import TokenTracker
    tracker = TokenTracker(_db)
    result = await tracker.credit(
        user_identity=body["user_identity"],
        amount=body["amount"],
        transaction_type=body.get("transaction_type", "purchase"),
        description=body.get("description", ""),
        agent_id=body.get("agent_id"),
    )
    return result


@app.get("/v1/tokens/transactions")
async def list_transactions(user_identity: str, limit: int = 50):
    from agent_engine.src.token_tracker import TokenTracker
    tracker = TokenTracker(_db)
    transactions = await tracker.get_transaction_history(user_identity, limit)
    return {"transactions": transactions}


# ── AI Assist ──────────────────────────────────────────────

@app.post("/v1/ai/assist")
async def ai_assist(request: Request):
    body = await request.json()
    from agent_engine.src.llm import get_provider
    provider = get_provider()
    response = await provider.chat(
        messages=[
            {"role": "system", "content": body.get("system_prompt", "")},
            {"role": "user", "content": body.get("message", "")},
        ],
        temperature=body.get("temperature", 0.2),
        max_tokens=body.get("max_tokens", 500),
    )
    return {"response": response.content, "model": getattr(provider, "model", "unknown")}


# ── Agent Versions ──────────────────────────────────────────

@app.get("/v1/agents/{agent_id}/versions")
async def get_agent_versions(agent_id: str, limit: int = 50):
    versions = await _db.get_agent_versions(agent_id, limit)
    return {"versions": versions}


@app.get("/v1/agents/{agent_id}/versions/{vid}")
async def get_agent_version(agent_id: str, vid: str):
    versions = await _db.get_agent_versions(agent_id)
    for v in versions:
        if v.get("id") == vid or str(v.get("version_number")) == vid:
            return v
    raise HTTPException(404, f"Version {vid} not found")


@app.post("/v1/agents/{agent_id}/versions")
async def save_agent_version(agent_id: str, request: Request):
    body = await request.json()
    result = await _db.save_agent_version(
        agent_id=agent_id,
        config=body.get("config", {}),
        yaml_str=body.get("yaml_str", ""),
        author=body.get("author", "human"),
        change_description=body.get("change_description", ""),
        tags=body.get("tags", []),
    )
    return result


@app.post("/v1/agents/{agent_id}/versions/{vid}/restore")
async def restore_agent_version(agent_id: str, vid: str):
    versions = await _db.get_agent_versions(agent_id)
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
    result = await _db.save_agent_version(
        agent_id=agent_id,
        config=config,
        yaml_str=target.get("yaml_snapshot", ""),
        author="restore",
        change_description=f"Restored from version {target.get('version_number', vid)}",
        tags=["restore"],
    )
    return result


# ── A/B Tests ───────────────────────────────────────────────

@app.post("/v1/ab-tests")
async def create_ab_test(request: Request):
    body = await request.json()
    return await _db.create_ab_test({
        "agent_id": body["agent_id"],
        "name": body["name"],
        "status": "draft",
        "primary_metric": body.get("primary_metric", "success_rate"),
        "min_sample_size": body.get("min_sample_size", 100),
        "variant_a_config": body["variant_a_config"],
        "variant_b_config": body["variant_b_config"],
    })


@app.get("/v1/ab-tests")
async def get_ab_tests(agent_id: str = ""):
    tests = await _db.get_ab_tests(agent_id=agent_id or None)
    return {"tests": tests}


@app.post("/v1/ab-tests/{test_id}/start")
async def start_ab_test(test_id: str):
    result = await _db.update_ab_test_status(test_id, "running")
    if result is None:
        raise HTTPException(404, f"Test {test_id} not found")
    return result


@app.post("/v1/ab-tests/{test_id}/stop")
async def stop_ab_test(test_id: str):
    result = await _db.update_ab_test_status(test_id, "completed")
    if result is None:
        raise HTTPException(404, f"Test {test_id} not found")
    return result


@app.get("/v1/ab-tests/{test_id}/results")
async def get_ab_test_results(test_id: str):
    results = await _db.get_ab_results(test_id)
    aggregate = await _db.get_ab_aggregate(test_id)
    return {"results": results, "aggregate": aggregate}


# ── Performance / Regression ────────────────────────────────

@app.get("/v1/agents/{agent_id}/performance")
async def get_agent_performance(agent_id: str):
    return {"agent_id": agent_id, "nodes_tracked": 0, "baseline_established": False, "alerts": []}


@app.post("/v1/agents/{agent_id}/baseline")
async def establish_baseline(agent_id: str):
    return {"agent_id": agent_id, "baseline_established": True}


# ── LLM Proxy ──────────────────────────────────────────────────

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """Direct LLM passthrough to DeepSeek (for SDK direct access)."""
    import httpx
    body = await request.json()

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        return JSONResponse(content=response.json(), status_code=response.status_code)