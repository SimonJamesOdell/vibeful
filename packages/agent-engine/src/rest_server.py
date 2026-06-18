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

from fastapi import FastAPI, HTTPException, Request
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
    max_tokens: int = 4096
    context_ids: list[str] = []
    mcp_server_urls: list[str] = []


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
        max_tokens=req.max_tokens,
        context_ids=req.context_ids,
        mcp_server_urls=req.mcp_server_urls,
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
        max_tokens=req.max_tokens,
        context_ids=req.context_ids,
        mcp_server_urls=req.mcp_server_urls,
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
