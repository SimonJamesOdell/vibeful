"""Threads — event-driven conversations.

Implements the Threads feature:
- Backend creates session → creates thread via API → agent generates first response
- User receives notification with deep link → opens pre-populated conversation
- Thread title auto-generation
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from .database import Database
from .llm import get_provider, LlmProvider


@dataclass
class ThreadConfig:
    """Configuration for creating a thread."""
    agent_id: str | None = None
    context_ids: list[str] | None = None
    mcp_server_urls: list[str] | None = None
    user_identity: str | None = None
    event_description: str = ""  # What triggered this thread
    initial_context: str = ""  # Context to give the agent before the user arrives


class ThreadManager:
    """Manages thread lifecycle: create, pre-generate, deliver."""

    def __init__(self, db: Database, llm: LlmProvider | None = None, proxy_url: str = "http://proxy:8000"):
        self.db = db
        self.llm = llm or get_provider()
        self.proxy_url = proxy_url

    async def create_thread(
        self,
        config: ThreadConfig,
    ) -> dict[str, Any]:
        """Create a new thread: session → pre-generate first response → ready.

        Flow: backend detects event → creates session → creates thread →
        agent generates first response → user notified with deep link
        """
        import httpx

        # 1. Create a session for this thread
        async with httpx.AsyncClient(timeout=60.0) as http:
            session_resp = await http.post(
                f"{self.proxy_url}/v1/sessions",
                json={
                    "agent_id": config.agent_id,
                    "context_ids": config.context_ids,
                    "mcp_server_urls": config.mcp_server_urls,
                    "user_identity": config.user_identity,
                    "mode": "authenticated",
                },
            )
            session = session_resp.json()
            session_id = session["session_id"]

        # 2. Create thread record
        thread_id = str(uuid.uuid4())
        deep_link = f"https://vibeful.app/threads/{thread_id}"

        thread = await self.db.create_thread({
            "id": thread_id,
            "session_id": session_id,
            "status": "generating",
            "deep_link": deep_link,
            "metadata": {
                "event_description": config.event_description,
                "user_identity": config.user_identity,
            },
        })

        # 3. Pre-generate the first agent response
        initial_message = (
            f"Context: {config.event_description}\n\n"
            f"{config.initial_context}\n\n"
            "Generate a helpful first message for the user based on this context. "
            "The user will see this when they open the thread."
        )

        async with httpx.AsyncClient(timeout=120.0) as http:
            converse_resp = await http.post(
                f"{self.proxy_url}/v1/sessions/{session_id}/converse",
                json={"content": initial_message},
            )
            converse_data = converse_resp.json()

        # Extract the agent's response
        chunks = converse_data.get("chunks", [])
        first_response = ""
        for chunk in chunks:
            if chunk.get("state") in ("STREAMING", "REFERENCES"):
                first_response += chunk.get("text_chunk", "")

        # 4. Generate title
        title = await self._generate_title(first_response, config.event_description)

        # 5. Update thread as ready
        await self.db.update_thread(thread_id, {
            "title": title,
            "status": "ready",
        })

        return {
            "thread_id": thread_id,
            "session_id": session_id,
            "title": title,
            "deep_link": deep_link,
            "first_response": first_response,
        }

    async def _generate_title(self, first_response: str, event_description: str) -> str:
        """Auto-generate a thread title from the first response."""
        if not first_response:
            return event_description[:100] or "New Thread"

        prompt = (
            "Generate a short title (max 60 chars) for a conversation thread. "
            "The title should capture the essence of the thread.\n\n"
            f"Event: {event_description}\n"
            f"First response: {first_response[:500]}\n\n"
            "Return ONLY the title, nothing else."
        )

        try:
            response = await self.llm.chat(
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
                max_tokens=50,
            )
            title = (response.content or "").strip().strip('"').strip("'")[:100]
            return title or event_description[:100]
        except Exception:
            return event_description[:100] or "New Thread"

    async def deliver_thread(self, thread_id: str) -> dict[str, Any] | None:
        """Mark a thread as delivered (user has opened it)."""
        return await self.db.update_thread(thread_id, {
            "status": "delivered",
            "delivered_at": "now()",
        })
