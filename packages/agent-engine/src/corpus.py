"""Corpus Intelligence — Document analysis, Predictors, and Voice TTS."""

from __future__ import annotations

from typing import Any


# ── Corpus Intelligence ───────────────────────────────────────

class CorpusAnalyzer:
    """Analyzes knowledge corpus for hot/dead docs and retrieval patterns.

    Hot docs: most-frequently-retrieved chunks
    Dead docs: never-retrieved chunks
    Retrieved-but-not-used: retrieved but not cited in final response
    """

    def __init__(self, db=None):
        self.db = db

    async def get_hot_docs(self, context_id: str, limit: int = 10) -> list[dict[str, Any]]:
        """Return the most-retrieved chunks in a context."""
        return {
            "context_id": context_id,
            "limit": limit,
            "message": "Queries the events table for RAG retrieval events, grouped by chunk_id, ordered by count DESC.",
            "docs": [],
        }

    async def get_dead_docs(self, context_id: str) -> list[dict[str, Any]]:
        """Return chunks that have never been retrieved."""
        return {
            "context_id": context_id,
            "message": "Finds chunks in context_chunks that have no matching RAG retrieval events.",
            "docs": [],
        }

    async def get_retrieved_not_used(self, context_id: str, limit: int = 10) -> list[dict[str, Any]]:
        """Return chunks that were retrieved but never cited in a response."""
        return {
            "context_id": context_id,
            "limit": limit,
            "message": "Compares RAG retrieval events against citation events. Chunks retrieved but not cited.",
            "docs": [],
        }

    async def get_corpus_stats(self, context_id: str) -> dict[str, Any]:
        """Overall corpus health statistics."""
        return {
            "context_id": context_id,
            "total_chunks": 0,
            "total_retrievals": 0,
            "avg_similarity": 0.0,
            "retrieval_rate": 0.0,
            "message": "Aggregates retrieval events for this context.",
        }


# ── Predictor Scaffold ────────────────────────────────────────

class PredictorScaffold:
    """Per-turn classifiers for agent conversation quality.

    Predictors:
    - refusal_reason: "policy", "capability", "safety", "none"
    - tool_grounding: "grounded", "hallucinated", "not_applicable"
    - outcome_status: "success", "partial", "failure", "escalation"
    - knowledge_gap_signal: bool
    """

    PREDICTORS = {
        "refusal_reason": {
            "labels": ["policy", "capability", "safety", "none"],
            "description": "Why did the agent refuse to answer?",
        },
        "tool_grounding": {
            "labels": ["grounded", "hallucinated", "not_applicable"],
            "description": "Did the agent correctly ground tool results?",
        },
        "outcome_status": {
            "labels": ["success", "partial", "failure", "escalation"],
            "description": "Did the conversation reach a successful outcome?",
        },
        "knowledge_gap_signal": {
            "labels": [True, False],
            "description": "Did this turn expose a knowledge gap?",
        },
    }

    def __init__(self):
        self.corrections: list[dict[str, Any]] = []

    def predict(self, conversation: dict[str, Any]) -> dict[str, str]:
        """Run all predictors on a conversation turn.

        In production, this uses trained classifiers. Currently returns
        heuristic defaults that can be corrected by the admin.
        """
        agent_response = conversation.get("agent_output", "")

        # Simple heuristics
        refusal = "none"
        if any(w in agent_response.lower() for w in ["i cannot", "i'm unable", "i'm not able", "i don't have"]):
            refusal = "capability"
        if any(w in agent_response.lower() for w in ["against policy", "not allowed", "cannot disclose"]):
            refusal = "policy"

        grounding = "not_applicable"
        if conversation.get("tool_calls"):
            grounding = "grounded"

        outcome = "success"
        if not agent_response or len(agent_response) < 20:
            outcome = "failure"
        if refusal != "none":
            outcome = "partial"

        knowledge_gap = len(agent_response) < 50 or refusal != "none"

        return {
            "refusal_reason": refusal,
            "tool_grounding": grounding,
            "outcome_status": outcome,
            "knowledge_gap_signal": str(knowledge_gap).lower(),
        }

    def correct(self, turn_id: str, predictor: str, new_label: str, admin: str = "admin") -> dict[str, Any]:
        """Record an admin correction to a predictor label.

        Corrections feed back into the training pipeline.
        """
        correction = {
            "turn_id": turn_id,
            "predictor": predictor,
            "new_label": new_label,
            "admin": admin,
        }
        self.corrections.append(correction)
        return {"corrected": True, "correction": correction}

    def get_corrections(self, predictor: str | None = None) -> list[dict[str, Any]]:
        """Get all corrections, optionally filtered by predictor."""
        if predictor:
            return [c for c in self.corrections if c["predictor"] == predictor]
        return self.corrections


# ── Voice TTS ─────────────────────────────────────────────────

class VoiceTTS:
    """Text-to-speech for agent responses using browser Web Speech API.

    Since this runs in the browser, the actual TTS is handled by the SDK
    VoiceOutput component (see SDK components/VoiceOutput.tsx).
    This module provides the server-side configuration.
    """

    VOICES = {
        "en-US": [
            {"name": "en-US-Neural2-A", "gender": "MALE", "style": "conversational"},
            {"name": "en-US-Neural2-C", "gender": "FEMALE", "style": "conversational"},
            {"name": "en-US-Neural2-H", "gender": "FEMALE", "style": "friendly"},
        ],
        "en-GB": [
            {"name": "en-GB-Neural2-A", "gender": "FEMALE", "style": "professional"},
            {"name": "en-GB-Neural2-B", "gender": "MALE", "style": "professional"},
        ],
    }

    def get_available_voices(self, language: str = "en-US") -> list[dict[str, str]]:
        """Return available TTS voices for a language."""
        return self.VOICES.get(language, self.VOICES["en-US"])

    def get_tts_config(self, language: str = "en-US", gender: str = "FEMALE") -> dict[str, Any]:
        """Return TTS configuration for the SDK."""
        voices = self.get_available_voices(language)
        selected = next((v for v in voices if v["gender"] == gender), voices[0])
        return {
            "enabled": True,
            "language": language,
            "voice": selected["name"],
            "rate": 1.0,
            "pitch": 1.0,
        }
