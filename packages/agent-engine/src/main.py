"""Vibeful Agent Engine — gRPC server.

Supports RAG, database integration, context_ids in sessions.
"""

import asyncio
import json
import os
import sys
from typing import AsyncIterator

import grpc
from grpc import aio

# Generated proto stubs live alongside src/ (at /app/src/agent/v1/)
sys.path.insert(0, os.path.dirname(__file__))

from .agent_graph import build_agent_graph, AgentState
from .database import Database

try:
    from agent.v1 import agent_pb2, agent_pb2_grpc
except ImportError:
    print("[agent-engine] Proto stubs not found.")
    sys.exit(1)

GRPC_PORT = os.getenv("GRPC_PORT", "50051")

_agent_graph = build_agent_graph()
_db = Database()

_STATE_MAP = {
    agent_pb2.RESPONSE_STATE_REFERENCES: "REFERENCES",
    agent_pb2.RESPONSE_STATE_STREAMING: "STREAMING",
    agent_pb2.RESPONSE_STATE_TOOL_USED: "TOOL_USED",
    agent_pb2.RESPONSE_STATE_COMPLETED: "COMPLETED",
    agent_pb2.RESPONSE_STATE_FOLLOW_UP: "FOLLOW_UP",
}
_REVERSE_STATE_MAP = {v: k for k, v in _STATE_MAP.items()}


class AgentService(agent_pb2_grpc.AgentServiceServicer):

    async def StreamConversation(
        self,
        request_iterator: AsyncIterator[agent_pb2.ConversationRequest],
        context: grpc.aio.ServicerContext,
    ):
        async for req in request_iterator:
            session_id = req.session_id

            session = await _db.get_session(session_id)
            if session is None:
                config_dict = {}
                if req.config:
                    config_dict = {
                        "system_prompt": req.config.system_prompt,
                        "model": req.config.model or "deepseek-chat",
                        "temperature": req.config.temperature or 0.7,
                        "max_tokens": req.config.max_tokens or 4096,
                        "context_ids": list(req.config.context_ids),
                        "mcp_server_urls": list(req.config.mcp_server_urls),
                    }
                session = await _db.create_session({
                    "session_id": session_id,
                    "agent_config": config_dict,
                    "context_ids": config_dict.get("context_ids", []),
                })

            await _db.add_message(session_id, "user", req.content)

            state = AgentState(
                session_id=session_id,
                user_message=req.content,
                tool_results=[
                    {"call_id": tr.call_id, "content": tr.content,
                     "success": tr.success, "error": tr.error}
                    for tr in req.tool_results
                ],
                system_prompt=session.get("agent_config", {}).get("system_prompt", ""),
                model=session.get("agent_config", {}).get("model", "deepseek-chat"),
                temperature=session.get("agent_config", {}).get("temperature", 0.7),
                max_tokens=session.get("agent_config", {}).get("max_tokens", 4096),
                context_ids=session.get("context_ids", []),
                messages=session.get("messages", []),
            )

            try:
                result_state = await _agent_graph.ainvoke(state)
            except Exception as e:
                yield agent_pb2.ConversationResponse(
                    state=agent_pb2.RESPONSE_STATE_COMPLETED,
                    error=f"Agent error: {str(e)}",
                )
                return

            total_tokens = 0
            for chunk in result_state["response_chunks"]:
                state_label = chunk.get("state", "COMPLETED")
                proto_state = _REVERSE_STATE_MAP.get(state_label, agent_pb2.RESPONSE_STATE_COMPLETED)

                resp = agent_pb2.ConversationResponse(state=proto_state)

                if state_label in ("STREAMING", "REFERENCES"):
                    resp.text_chunk = chunk.get("text_chunk", "")
                elif state_label == "TOOL_USED":
                    tc = chunk.get("tool_call", {})
                    resp.tool_call.CopyFrom(agent_pb2.ToolCall(
                        call_id=tc.get("call_id", ""),
                        name=tc.get("name", ""),
                        arguments=tc.get("arguments", ""),
                    ))
                elif state_label == "COMPLETED":
                    usage = chunk.get("usage", {})
                    resp.usage.CopyFrom(agent_pb2.TokenUsage(
                        prompt_tokens=usage.get("prompt_tokens", 0),
                        completion_tokens=usage.get("completion_tokens", 0),
                        total_tokens=usage.get("total_tokens", 0),
                        cost_usd=usage.get("cost_usd", 0.0),
                    ))
                    total_tokens = usage.get("total_tokens", 0)

                if chunk.get("error"):
                    resp.error = chunk["error"]

                yield resp

            # Persist assistant response and event
            for chunk in result_state["response_chunks"]:
                if chunk.get("state") in ("STREAMING", "REFERENCES"):
                    await _db.add_message(
                        session_id, "assistant", chunk.get("text_chunk"),
                        token_usage={"total_tokens": total_tokens},
                    )

            await _db.log_event("llm_call", {
                "session_id": session_id,
                "model": state.model,
                "total_tokens": total_tokens,
            }, session_id=session_id)


async def serve():
    await _db.init_schema()
    print("[agent-engine] Database schema initialized")

    server = aio.server()
    agent_pb2_grpc.add_AgentServiceServicer_to_server(AgentService(), server)
    server.add_insecure_port(f"[::]:{GRPC_PORT}")

    await server.start()
    print(f"[agent-engine] gRPC server listening on :{GRPC_PORT}")

    try:
        await server.wait_for_termination()
    except KeyboardInterrupt:
        print("[agent-engine] Shutting down...")
        await _db.close()
        await server.stop(5)


def main():
    asyncio.run(serve())


if __name__ == "__main__":
    main()
