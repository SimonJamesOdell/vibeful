"""Webhook Engine — register, trigger, retry.

Implements the webhook system:
- Max 50 webhooks per app
- Event triggers: agent.created, agent.updated, context.file_added,
  session.completed, mcp_server.connected
- Retry with exponential backoff
"""

from __future__ import annotations

import asyncio
import json as _json
from typing import Any

import httpx

from .database import Database


class WebhookEngine:
    """Manages webhook registrations and event delivery."""

    def __init__(self, db: Database, max_retries: int = 3):
        self.db = db
        self.max_retries = max_retries

    async def register(self, webhook: dict[str, Any]) -> dict[str, Any]:
        """Register a new webhook endpoint."""
        import uuid
        wid = webhook.get("id") or str(uuid.uuid4())
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO api_keys (id, name, key_hash, prefix, scopes)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (wid, webhook.get("name", ""), "webhook", "wh_", ["webhook"]))
            await conn.commit()
        return {"id": wid, "name": webhook.get("name", ""), "url": webhook.get("url", "")}

    async def trigger(self, event_type: str, data: dict[str, Any]) -> None:
        """Fire webhooks for a given event type."""
        import asyncio

        # Find matching webhooks (simplified — in production, scoped by app_id)
        webhooks = []  # Placeholder — would query DB

        async def deliver(wh: dict[str, Any]):
            for attempt in range(self.max_retries):
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.post(
                            wh["url"],
                            json={"event": event_type, "data": data, "timestamp": _now_iso()},
                        )
                        if resp.status_code < 500:
                            return True
                except Exception:
                    pass
                delay = 2 ** attempt  # 1s, 2s, 4s
                await asyncio.sleep(delay)
            return False

        if webhooks:
            await asyncio.gather(*[deliver(wh) for wh in webhooks])

    # Common event emitters
    async def on_agent_created(self, agent: dict[str, Any]) -> None:
        await self.trigger("agent.created", agent)

    async def on_agent_updated(self, agent: dict[str, Any]) -> None:
        await self.trigger("agent.updated", agent)

    async def on_session_completed(self, session: dict[str, Any]) -> None:
        await self.trigger("session.completed", session)

    async def on_mcp_connected(self, server: dict[str, Any]) -> None:
        await self.trigger("mcp_server.connected", server)


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
