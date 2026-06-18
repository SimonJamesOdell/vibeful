"""Agent Behavior Testing — synthetic user + assertion framework.

Implements the supply-side of the Trust Engine:
- Scenario-based testing with synthetic users
- Deterministic + LLM-judge assertions
- Test case creation and execution
"""

from __future__ import annotations

import json as _json
from dataclasses import dataclass, field
from typing import Any, Literal

from .llm import get_provider, LlmProvider


@dataclass
class TestCase:
    """A behavior test case for an agent."""
    id: str
    name: str
    description: str = ""
    agent_config: dict[str, Any] = field(default_factory=dict)
    turns: list["TestTurn"] = field(default_factory=list)
    assertions: list["TestAssertion"] = field(default_factory=list)


@dataclass
class TestTurn:
    """One turn in a test scenario."""
    user_message: str
    expected_tool_calls: list[str] = field(default_factory=list)
    expected_keywords: list[str] = field(default_factory=list)
    disallowed_keywords: list[str] = field(default_factory=list)


@dataclass
class TestAssertion:
    """A post-execution assertion."""
    type: Literal["contains", "not_contains", "tool_called", "tool_not_called", "token_budget", "llm_judge"]
    target: str  # "any_turn", "turn_N", "final_response"
    value: str | int | float | None = None
    description: str = ""


@dataclass
class TestTurnResult:
    """Result of executing a single test turn."""
    turn_index: int
    user_message: str
    agent_response: str
    tool_calls: list[str] = field(default_factory=list)
    tokens_used: int = 0
    passed_assertions: list[str] = field(default_factory=list)
    failed_assertions: list[str] = field(default_factory=list)


@dataclass
class TestResult:
    """Result of executing a full test case."""
    test_id: str
    test_name: str
    passed: bool
    total_assertions: int = 0
    passed_assertions: int = 0
    turn_results: list[TestTurnResult] = field(default_factory=list)
    failure_details: list[str] = field(default_factory=list)


class BehaviorTestRunner:
    """Executes behavior test cases against the agent engine via the proxy API."""

    def __init__(self, proxy_url: str = "http://proxy:8000", client: LlmProvider | None = None):
        self.proxy_url = proxy_url.rstrip("/")
        self.llm_client = client or get_provider()

    async def run_test(self, test: TestCase) -> TestResult:
        """Execute all turns in a test case and evaluate assertions."""
        import httpx

        # Create a session for this test
        async with httpx.AsyncClient(timeout=120.0) as http:
            session_resp = await http.post(
                f"{self.proxy_url}/v1/sessions",
                json={"agent_config": test.agent_config},
            )
            session = session_resp.json()
            session_id = session["session_id"]

            turn_results: list[TestTurnResult] = []
            full_response = ""

            for i, turn in enumerate(test.turns):
                resp = await http.post(
                    f"{self.proxy_url}/v1/sessions/{session_id}/converse",
                    json={"content": turn.user_message},
                )
                data = resp.json()
                chunks = data.get("chunks", [])

                # Extract response text and tool calls
                response_text = ""
                tool_calls: list[str] = []
                tokens = 0
                for chunk in chunks:
                    if chunk.get("state") in ("STREAMING", "REFERENCES"):
                        response_text += chunk.get("text_chunk", "")
                    elif chunk.get("state") == "TOOL_USED":
                        tc = chunk.get("tool_call", {})
                        if tc.get("name"):
                            tool_calls.append(tc["name"])
                    elif chunk.get("state") == "COMPLETED":
                        tokens = chunk.get("usage", {}).get("total_tokens", 0)

                full_response += response_text

                # Evaluate turn-level assertions
                passed: list[str] = []
                failed: list[str] = []
                for assertion in test.assertions:
                    target = assertion.target
                    is_this_turn = target in ("any_turn", f"turn_{i}", f"turn_{i+1}")
                    if not is_this_turn and target != "any_turn":
                        continue

                    ok, msg = _eval_assertion(assertion, response_text, tool_calls, tokens)
                    if ok:
                        passed.append(f"{assertion.type}: {assertion.description}" or assertion.type)
                    else:
                        failed.append(f"{assertion.type}: {msg or assertion.description}")

                turn_results.append(TestTurnResult(
                    turn_index=i,
                    user_message=turn.user_message,
                    agent_response=response_text,
                    tool_calls=tool_calls,
                    tokens_used=tokens,
                    passed_assertions=passed,
                    failed_assertions=failed,
                ))

            # Evaluate final-response assertions
            for assertion in test.assertions:
                if assertion.target != "final_response":
                    continue
                ok, msg = _eval_assertion(assertion, full_response, [], 0)
                if not ok:
                    turn_results[-1].failed_assertions.append(msg or assertion.description)
                else:
                    turn_results[-1].passed_assertions.append(assertion.description or assertion.type)

            # Aggregate
            total = len(test.assertions)
            all_failed = [f for tr in turn_results for f in tr.failed_assertions]
            passed_count = total - len(set(all_failed))

            return TestResult(
                test_id=test.id,
                test_name=test.name,
                passed=len(all_failed) == 0,
                total_assertions=total,
                passed_assertions=passed_count,
                turn_results=turn_results,
                failure_details=list(set(all_failed)),
            )

    async def run_test_battery(self, tests: list[TestCase]) -> list[TestResult]:
        """Run multiple test cases and return all results."""
        results = []
        for test in tests:
            results.append(await self.run_test(test))
        return results


def _eval_assertion(
    assertion: TestAssertion,
    response_text: str,
    tool_calls: list[str],
    tokens: int,
) -> tuple[bool, str | None]:
    """Evaluate a single assertion. Returns (passed, failure_message)."""
    atype = assertion.type
    val = assertion.value

    if atype == "contains":
        if val and isinstance(val, str) and val.lower() in response_text.lower():
            return True, None
        return False, f"Expected text '{val}' not found in response"

    if atype == "not_contains":
        if val and isinstance(val, str) and val.lower() in response_text.lower():
            return False, f"Disallowed text '{val}' found in response"
        return True, None

    if atype == "tool_called":
        if val and val in tool_calls:
            return True, None
        return False, f"Expected tool '{val}' was not called. Called: {tool_calls}"

    if atype == "tool_not_called":
        if val and val in tool_calls:
            return False, f"Tool '{val}' was called but should not have been"
        return True, None

    if atype == "token_budget":
        if val and isinstance(val, (int, float)) and tokens <= val:
            return True, None
        return False, f"Token budget exceeded: {tokens} > {val}"

    # Unknown assertion type — pass by default
    return True, None
