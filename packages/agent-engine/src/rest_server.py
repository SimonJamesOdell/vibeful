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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

REST_PORT = int(os.getenv("REST_PORT", "50052"))

app = FastAPI(title="Vibeful Agent Engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    """Start the REST server (called from main)."""
    import uvicorn
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()
