"""Agent Evaluation Framework — test your agents with YAML-defined test suites.

Define what good looks like, run assertions, compare against golden responses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


@dataclass
class EvalAssertion:
    """A single assertion to check against an agent response."""
    type: Literal[
        "contains", "not_contains", "tone", "blocked",
        "max_tokens", "max_latency_ms", "starts_with", "ends_with",
    ]
    value: str | int | float = ""
    description: str = ""


@dataclass
class EvalCase:
    """A single evaluation test case."""
    name: str
    input: str
    expects: list[EvalAssertion] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvalResult:
    """Result of running a single eval case."""
    case: EvalCase
    passed: bool
    response: str = ""
    assertion_results: list[AssertionResult] = field(default_factory=list)
    latency_ms: float = 0
    error: str | None = None


@dataclass
class AssertionResult:
    """Result of a single assertion check."""
    assertion: EvalAssertion
    passed: bool
    detail: str = ""


@dataclass
class EvalSuite:
    """A collection of eval cases loaded from YAML."""
    name: str
    cases: list[EvalCase] = field(default_factory=list)


@dataclass
class EvalSuiteResult:
    """Aggregate result of running an entire eval suite."""
    suite: EvalSuite
    results: list[EvalResult] = field(default_factory=list)
    passed: int = 0
    failed: int = 0
    errors: int = 0

    @property
    def total(self) -> int:
        return len(self.results)

    @property
    def pass_rate(self) -> float:
        if self.total == 0:
            return 0.0
        return self.passed / self.total
