"""Quality Nodes — Citations, Follow-ups, Quick Replies, and Routing.

Citation, follow-up, quick-reply, and intent-routing nodes for the agent graph:
- CitationNode: marks which RAG chunks were used in the response
- FollowUpQuestionsNode: generates 2-3 follow-up questions after completion
- ButtonsNode: renders quick-reply chips from agent config
- RouterNode: classifies input into rag_required, direct_answer, or workflow_trigger
"""

from __future__ import annotations

import json as _json
from dataclasses import dataclass, field
from typing import Any, Literal

from .llm import LlmProvider
from .rag import RagResult


# ── Citation Node ──────────────────────────────────────────────

async def build_citations(
    assistant_response: str,
    rag_results: list[RagResult],
    llm: LlmProvider,
) -> list[dict[str, Any]]:
    """Determine which RAG chunks were actually used in the response.

    Uses a lightweight LLM call to match response text against retrieved chunks.
    Returns a list of citations with chunk text, source filename, and relevance.
    """
    if not rag_results or not assistant_response:
        return []

    # Build a prompt asking the LLM to identify which chunks were cited
    chunks_text = "\n\n".join(
        f"[{i}] ({r.filename}, similarity: {r.similarity:.2f})\n{r.text[:300]}"
        for i, r in enumerate(rag_results)
    )

    prompt = (
        "Given the assistant's response below and a list of retrieved knowledge chunks, "
        "identify which chunks were used to answer the question. "
        "Return a JSON array of indices (e.g., [0, 2]) for chunks that were cited.\n\n"
        f"Assistant response:\n{assistant_response[:1000]}\n\n"
        f"Retrieved chunks:\n{chunks_text}\n\n"
        "Return ONLY the JSON array of indices, nothing else."
    )

    try:
        response = await llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=100,
        )
        content = response.content or "[]"
        start = content.find("[")
        end = content.rfind("]") + 1
        if start >= 0 and end > start:
            indices = _json.loads(content[start:end])
        else:
            indices = []
    except Exception:
        indices = []

    citations = []
    for idx in indices:
        if isinstance(idx, int) and 0 <= idx < len(rag_results):
            r = rag_results[idx]
            citations.append({
                "chunk_index": r.chunk_index,
                "filename": r.filename,
                "text_snippet": r.text[:200],
                "similarity": r.similarity,
            })

    return citations


# ── Follow-Up Questions Node ───────────────────────────────────

async def generate_follow_ups(
    user_message: str,
    assistant_response: str,
    llm: LlmProvider,
    count: int = 3,
) -> list[str]:
    """Generate follow-up questions the user might want to ask next.

    Uses an LLM call with low temperature to produce relevant suggestions.
    """
    if not assistant_response:
        return []

    prompt = (
        "Based on the conversation below, generate exactly {count} follow-up questions "
        "the user might want to ask next. Make them short (under 60 chars each), "
        "natural, and relevant to the topic.\n\n"
        "User: {user}\n\nAssistant: {assistant}\n\n"
        "Return ONLY a JSON array of strings, nothing else."
    ).format(count=count, user=user_message[:500], assistant=assistant_response[:1000])

    try:
        response = await llm.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.5,
            max_tokens=100,
        )
        content = response.content or "[]"
        start = content.find("[")
        end = content.rfind("]") + 1
        if start >= 0 and end > start:
            questions = _json.loads(content[start:end])
            return [q.strip()[:100] for q in questions if isinstance(q, str) and q.strip()]
    except Exception:
        pass

    return []


# ── Buttons Node (Quick Replies) ───────────────────────────────

@dataclass
class QuickReply:
    """A quick-reply button from agent config."""
    label: str
    message: str  # What gets sent when the user taps it


def get_quick_replies(quick_replies_config: list[dict[str, Any]] | None) -> list[QuickReply]:
    """Parse quick-reply buttons from the agent config.

    Config format: [{"label": "What's your refund policy?", "message": "Tell me about refunds"},
                     {"label": "Talk to a human", "message": "I need human help"}]
    """
    if not quick_replies_config:
        return []
    replies = []
    for item in quick_replies_config:
        if isinstance(item, dict) and item.get("label"):
            replies.append(QuickReply(
                label=item["label"],
                message=item.get("message", item["label"]),
            ))
    return replies


# ── Router Node ────────────────────────────────────────────────

RouteTarget = Literal["rag", "react_agent", "workflow", "mcp_discovery"]


async def classify_intent(
    user_message: str,
    has_contexts: bool = False,
    has_workflows: bool = False,
) -> RouteTarget:
    """Classify user intent to route to the appropriate graph path.

    Simple keyword + heuristic approach (no LLM call — fast and cheap):
    - RAG: user asks about specific knowledge, facts, policies
    - Direct: greeting, chitchat, simple question the LLM can answer directly
    - Workflow: user triggers a structured workflow by name
    - MCP: user asks for something that requires external tools
    """
    msg_lower = user_message.lower().strip()

    # Question-like patterns suggest RAG
    question_patterns = [
        "what is", "what are", "how do", "how does", "how to", "tell me about",
        "explain", "describe", "what's the", "whats the", "policy", "procedure",
        "warranty", "refund", "return", "shipping", "price", "cost", "fee",
        "where is", "when is", "who is", "why is", "can you explain",
    ]
    is_question = any(msg_lower.startswith(p) or p in msg_lower for p in question_patterns)
    has_question_mark = "?" in user_message

    # Workflow trigger patterns
    workflow_patterns = ["start workflow", "run workflow", "begin workflow", "execute workflow"]
    is_workflow = any(p in msg_lower for p in workflow_patterns)

    # Tool/MCP patterns
    tool_patterns = ["search for", "look up", "find me", "calculate", "compute"]
    is_tool = any(msg_lower.startswith(p) for p in tool_patterns)

    if is_workflow and has_workflows:
        return "workflow"
    if is_tool:
        return "mcp_discovery"
    if (is_question or has_question_mark) and has_contexts:
        return "rag"
    return "react_agent"
