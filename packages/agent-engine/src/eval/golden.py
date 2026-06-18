"""Golden Response System — record and compare agent responses.

Usage:
    recorder.record(name, input, response)   # save golden response
    recorder.compare(name, input, response)  # compare against golden
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any


GOLDEN_DIR = os.getenv("VIBEFUL_GOLDEN_DIR", "golden")


@dataclass
class GoldenRecord:
    """A recorded golden response."""
    name: str
    input: str
    response: str
    recorded_at: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


class GoldenRecorder:
    """Record and compare agent responses against known-good outputs."""

    def __init__(self, directory: str = GOLDEN_DIR):
        self.directory = directory
        os.makedirs(directory, exist_ok=True)

    def record(self, name: str, input_text: str, response: str,
               metadata: dict[str, Any] | None = None) -> None:
        """Save a golden response to disk."""
        from datetime import datetime
        record = GoldenRecord(
            name=name,
            input=input_text,
            response=response,
            recorded_at=datetime.utcnow().isoformat(),
            metadata=metadata or {},
        )
        path = os.path.join(self.directory, f"{name}.golden.json")
        with open(path, "w") as f:
            json.dump({
                "name": record.name,
                "input": record.input,
                "response": record.response,
                "recorded_at": record.recorded_at,
                "metadata": record.metadata,
            }, f, indent=2)

    def load(self, name: str) -> GoldenRecord | None:
        """Load a golden record from disk."""
        path = os.path.join(self.directory, f"{name}.golden.json")
        if not os.path.exists(path):
            return None
        with open(path) as f:
            data = json.load(f)
        return GoldenRecord(
            name=data["name"],
            input=data["input"],
            response=data["response"],
            recorded_at=data.get("recorded_at", ""),
            metadata=data.get("metadata", {}),
        )

    def compare(self, name: str, actual: str) -> dict[str, Any]:
        """Compare an actual response against the golden record.

        Returns dict with 'match' (bool), 'diff' (str), and 'golden' (str).
        """
        golden = self.load(name)
        if golden is None:
            return {"match": False, "diff": "No golden record found", "golden": ""}

        if actual == golden.response:
            return {"match": True, "diff": "", "golden": golden.response}

        # Simple word-level diff
        golden_words = set(golden.response.lower().split())
        actual_words = set(actual.lower().split())
        missing = golden_words - actual_words
        extra = actual_words - golden_words
        diff_parts = []
        if missing:
            diff_parts.append(f"Missing: {', '.join(sorted(missing)[:10])}")
        if extra:
            diff_parts.append(f"Extra: {', '.join(sorted(extra)[:10])}")

        return {
            "match": False,
            "diff": "; ".join(diff_parts) or "Responses differ",
            "golden": golden.response,
            "actual": actual,
        }
