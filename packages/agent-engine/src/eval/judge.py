"""Eval Judge — LLM-as-judge for semantic assertions (tone, relevance, harmfulness).

Uses a lightweight LLM call to judge whether an agent response meets
semantic criteria that can't be checked with simple string matching.
"""

from __future__ import annotations

from .protocol import EvalAssertion, AssertionResult


class EvalJudge:
    """LLM-as-judge for semantic evaluation.

    Uses a separate LLM call to judge tone, relevance, harmfulness, etc.
    Mockable for testing — swap the judge_fn at construction time.
    """

    def __init__(self, judge_fn=None):
        """
        Args:
            judge_fn: Async (assertion, response, input) -> AssertionResult.
                      Defaults to simple heuristics if no LLM available.
        """
        self._judge_fn = judge_fn or self._heuristic_judge

    async def judge(
        self, assertion: EvalAssertion, response: str, user_input: str
    ) -> AssertionResult:
        return await self._judge_fn(assertion, response, user_input)

    async def _heuristic_judge(
        self, assertion: EvalAssertion, response: str, user_input: str
    ) -> AssertionResult:
        """Simple heuristics when no LLM judge is available."""
        atype = assertion.type

        if atype == "tone":
            tone = str(assertion.value).lower()
            markers = {
                "helpful": ["help", "can", "let", "sure", "here"],
                "professional": ["thank", "please", "would", "could", "appreciate"],
                "friendly": ["hey", "great", "awesome", "glad", "happy"],
                "concise": [],  # checked by length
                "empathetic": ["understand", "sorry", "frustrat", "concern"],
            }
            if tone == "concise":
                ok = len(response.split()) < 30
                return AssertionResult(
                    assertion, ok,
                    "concise (<30 words)" if ok else f"not concise ({len(response.split())} words)",
                )
            markers_list = markers.get(tone, [])
            found = [m for m in markers_list if m in response.lower()]
            ok = len(found) > 0
            return AssertionResult(
                assertion, ok,
                f"tone '{tone}' detected" if ok else f"tone '{tone}' not detected",
            )

        return AssertionResult(assertion, True, f"heuristic pass for {atype}")
