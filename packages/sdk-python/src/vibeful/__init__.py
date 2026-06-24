"""Python SDK for the Vibeful agent platform.

Provides headless agent invocation, SSE streaming, and platform management
APIs. Depends only on `httpx`.

Usage:
    from vibeful import VibefulClient

    client = VibefulClient()  # local engine on port 50052
    result = await client.execute("agent-123", "What is 2+2?")
    print(result.response)

    # Streaming
    async for event in client.stream("agent-123", "Write a haiku"):
        if event.type == "token":
            print(event.text, end="", flush=True)
"""

from .client import VibefulClient
from .types import AgentResult, StreamEvent

__all__ = ["VibefulClient", "AgentResult", "StreamEvent"]
