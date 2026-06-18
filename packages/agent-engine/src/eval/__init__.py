"""Eval package — test your agents with YAML-defined test suites."""

from .protocol import EvalCase, EvalAssertion, EvalResult, EvalSuite, EvalSuiteResult
from .runner import EvalRunner
from .judge import EvalJudge
from .golden import GoldenRecorder, GoldenRecord

__all__ = [
    "EvalCase",
    "EvalAssertion",
    "EvalResult",
    "EvalSuite",
    "EvalSuiteResult",
    "EvalRunner",
    "EvalJudge",
    "GoldenRecorder",
    "GoldenRecord",
]
