"""Token Tracker — per-user token budget management.

Wraps the DatabaseLucidMixin token credit methods with a clean API
for debit/credit/balance operations. Integrates with the analysis
pipeline to debit tokens after each conversation turn.

Usage:
    tracker = TokenTracker(db)
    balance = await tracker.get_balance(user_id, agent_id)
    ok = await tracker.debit(user_id, tokens_used, agent_id, session_id)
"""

from __future__ import annotations

from typing import Any


class TokenTracker:
    """Per-user token budget tracking and debiting."""

    def __init__(self, db: Any):
        self.db = db

    async def get_balance(self, user_identity: str, agent_id: str | None = None) -> int:
        """Get the current token balance for a user."""
        return await self.db.get_token_balance(user_identity, agent_id)

    async def has_sufficient_balance(self, user_identity: str, amount: int, agent_id: str | None = None) -> bool:
        """Check if the user has at least `amount` tokens remaining."""
        balance = await self.get_balance(user_identity, agent_id)
        return balance >= amount

    async def debit(self, user_identity: str, amount: int, agent_id: str | None = None, session_id: str | None = None) -> dict[str, Any] | None:
        """Deduct tokens from a user's balance. Returns None if insufficient."""
        return await self.db.debit_tokens(user_identity, amount, agent_id, session_id)

    async def credit(self, user_identity: str, amount: int, transaction_type: str = "purchase", description: str = "", agent_id: str | None = None) -> dict[str, Any]:
        """Add tokens to a user's balance (purchase, refund, bonus)."""
        return await self.db.credit_tokens(user_identity, amount, transaction_type, description, agent_id)

    async def get_transaction_history(self, user_identity: str, limit: int = 50) -> list[dict[str, Any]]:
        """Get recent token transactions for a user."""
        return await self.db.list_token_transactions(user_identity, limit)
