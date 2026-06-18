"""Eval Runner — execute eval suites against an agent graph."""

from __future__ import annotations

import time
from typing import Any

from .protocol import (
    EvalCase, EvalResult, EvalSuite, EvalSuiteResult,
    EvalAssertion, AssertionResult,
)


class EvalRunner:
    """Runs eval cases against an agent graph and checks assertions."""

    def __init__(self, graph: Any):
        """
        Args:
            graph: A compiled LangGraph StateGraph from build_agent_graph().
        """
        self.graph = graph

    async def run_case(self, case: EvalCase) -> EvalResult:
        """Run a single eval case and return the result."""
        from ..agent_graph import AgentState

        start = time.perf_counter()

        try:
            state = AgentState(
                session_id=f"eval-{case.name}",
                user_message=case.input,
                system_prompt=case.context.get("system_prompt", ""),
                context_ids=case.context.get("context_ids", []),
            )
            result_state = await self.graph.ainvoke(state)
        except Exception as e:
            latency = (time.perf_counter() - start) * 1000
            return EvalResult(
                case=case, passed=False,
                latency_ms=latency, error=str(e),
            )

        latency = (time.perf_counter() - start) * 1000

        response = ""
        for chunk in getattr(result_state, "response_chunks", []):
            if chunk.get("state") == "STREAMING":
                response += chunk.get("text_chunk", "")

        blocked = getattr(result_state, "route", "safe") == "end"
        assertion_results = []

        for assertion in case.expects:
            ar = self._check_assertion(assertion, response, blocked, latency)
            assertion_results.append(ar)

        all_passed = all(ar.passed for ar in assertion_results)
        return EvalResult(
            case=case,
            passed=all_passed,
            response=response,
            assertion_results=assertion_results,
            latency_ms=latency,
        )

    def _check_assertion(
        self, assertion: EvalAssertion,
        response: str, blocked: bool, latency_ms: float,
    ) -> AssertionResult:
        """Check a single assertion."""
        atype = assertion.type
        value = assertion.value

        if atype == "contains":
            ok = str(value).lower() in response.lower()
            return AssertionResult(assertion, ok,
                f"contains '{value}'" if ok else f"missing '{value}'")

        elif atype == "not_contains":
            ok = str(value).lower() not in response.lower()
            return AssertionResult(assertion, ok,
                f"does not contain '{value}'" if ok else f"found '{value}'")

        elif atype == "blocked":
            if isinstance(value, bool):
                ok = blocked == value
            else:
                ok = blocked  # any blocking is a pass
            return AssertionResult(assertion, ok,
                "agent blocked" if blocked else "agent did not block")

        elif atype == "max_tokens":
            token_count = len(response.split())
            ok = token_count <= int(value)
            return AssertionResult(assertion, ok,
                f"{token_count} tokens <= {value}" if ok else f"{token_count} tokens > {value}")

        elif atype == "max_latency_ms":
            ok = latency_ms <= float(value)
            return AssertionResult(assertion, ok,
                f"{latency_ms:.0f}ms <= {value}ms" if ok else f"{latency_ms:.0f}ms > {value}ms")

        elif atype == "starts_with":
            ok = response.lower().startswith(str(value).lower())
            return AssertionResult(assertion, ok,
                f"starts with '{value}'" if ok else f"does not start with '{value}'")

        elif atype == "ends_with":
            ok = response.lower().endswith(str(value).lower())
            return AssertionResult(assertion, ok,
                f"ends with '{value}'" if ok else f"does not end with '{value}'")

        elif atype == "tone":
            # Uses LLM-as-judge — deferred to EvalJudge
            return AssertionResult(assertion, True,
                "tone check deferred to LLM judge")

        return AssertionResult(assertion, False, f"unknown assertion type: {atype}")

    async def run_suite(self, suite: EvalSuite) -> EvalSuiteResult:
        """Run all cases in a suite."""
        results = []
        passed = 0
        failed = 0
        errors = 0

        for case in suite.cases:
            result = await self.run_case(case)
            results.append(result)
            if result.error:
                errors += 1
            elif result.passed:
                passed += 1
            else:
                failed += 1

        return EvalSuiteResult(
            suite=suite, results=results,
            passed=passed, failed=failed, errors=errors,
        )

    def format_result(self, result: EvalSuiteResult) -> str:
        """Format a suite result as a readable string."""
        lines = [
            f"Suite: {result.suite.name}",
            f"Results: {result.passed} passed, {result.failed} failed, "
            f"{result.errors} errors ({result.pass_rate:.0%})",
            "",
        ]
        for r in result.results:
            status = "✓" if r.passed else ("✗" if not r.error else "!")
            lines.append(f"  {status} {r.case.name}")
            if r.error:
                lines.append(f"      Error: {r.error}")
            for ar in r.assertion_results:
                symbol = "✓" if ar.passed else "✗"
                lines.append(f"      {symbol} {ar.assertion.type}: {ar.detail}")
            if r.latency_ms:
                lines.append(f"      ({r.latency_ms:.0f}ms)")
        return "\n".join(lines)
