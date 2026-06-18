"""gRPC client for the Proxy to communicate with the Agent Engine."""

from __future__ import annotations

import os
import sys

import grpc
from grpc import aio

sys.path.insert(0, os.path.dirname(__file__))

try:
    from agent.v1 import agent_pb2, agent_pb2_grpc
except ImportError:
    agent_pb2 = None  # type: ignore
    agent_pb2_grpc = None  # type: ignore


class AgentEngineClient:
    """Async gRPC client for the Agent Engine."""

    def __init__(self, target: str = "agent-engine:50051"):
        self.target = target

    async def converse(
        self,
        session_id: str,
        content: str,
        tool_results: list[dict] | None = None,
        config: dict | None = None,
    ) -> list[dict]:
        """Send a conversation turn and collect all response chunks."""
        results: list[dict] = []
        async with aio.insecure_channel(self.target) as channel:
            stub = agent_pb2_grpc.AgentServiceStub(channel)

            async def request_iter():
                req = agent_pb2.ConversationRequest(
                    session_id=session_id,
                    content=content,
                )
                if tool_results:
                    for tr in tool_results:
                        req.tool_results.append(agent_pb2.ToolResult(
                            call_id=tr.get("call_id", ""),
                            content=tr.get("content", ""),
                            success=tr.get("success", True),
                            error=tr.get("error", ""),
                        ))
                if config:
                    req.config.CopyFrom(agent_pb2.AgentConfig(
                        system_prompt=config.get("system_prompt", ""),
                        model=config.get("model", "deepseek-chat"),
                        temperature=config.get("temperature", 0.7),
                        max_tokens=config.get("max_tokens", 4096),
                        context_ids=config.get("context_ids", []),
                        mcp_server_urls=config.get("mcp_server_urls", []),
                    ))
                yield req

            async for resp in stub.StreamConversation(request_iter()):
                state_name = agent_pb2.ResponseState.Name(resp.state)
                chunk: dict = {"state": state_name}
                if resp.text_chunk:
                    chunk["text_chunk"] = resp.text_chunk
                if resp.HasField("tool_call"):
                    chunk["tool_call"] = {
                        "call_id": resp.tool_call.call_id,
                        "name": resp.tool_call.name,
                        "arguments": resp.tool_call.arguments,
                    }
                if resp.HasField("usage"):
                    chunk["usage"] = {
                        "prompt_tokens": resp.usage.prompt_tokens,
                        "completion_tokens": resp.usage.completion_tokens,
                        "total_tokens": resp.usage.total_tokens,
                        "cost_usd": resp.usage.cost_usd,
                    }
                if resp.error:
                    chunk["error"] = resp.error
                results.append(chunk)

        return results
