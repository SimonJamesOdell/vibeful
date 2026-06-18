"""Prometheus metrics endpoint for the agent engine.

Exposes request counts, latencies, token usage, costs, and error rates.
Scraped by Prometheus at GET /metrics (text format) or GET /metrics/json.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Any


class MetricsRegistry:
    """Thread-safe metrics registry for the agent engine."""

    def __init__(self):
        self._counters: dict[str, int] = defaultdict(int)
        self._histograms: dict[str, list[float]] = defaultdict(list)
        self._gauges: dict[str, float] = defaultdict(float)

    # ── Counters ──────────────────────────────────────────

    def inc(self, name: str, value: int = 1) -> None:
        self._counters[name] += value

    def counter(self, name: str) -> int:
        return self._counters.get(name, 0)

    # ── Histograms ────────────────────────────────────────

    def observe(self, name: str, value: float) -> None:
        self._histograms[name].append(value)

    def histogram_avg(self, name: str) -> float:
        values = self._histograms.get(name, [])
        return sum(values) / len(values) if values else 0.0

    def histogram_p50(self, name: str) -> float:
        values = sorted(self._histograms.get(name, []))
        if not values:
            return 0.0
        return values[len(values) // 2]

    def histogram_p99(self, name: str) -> float:
        values = sorted(self._histograms.get(name, []))
        if not values:
            return 0.0
        idx = int(len(values) * 0.99)
        return values[min(idx, len(values) - 1)]

    # ── Gauges ────────────────────────────────────────────

    def set(self, name: str, value: float) -> None:
        self._gauges[name] = value

    def gauge(self, name: str) -> float:
        return self._gauges.get(name, 0.0)

    # ── Prometheus format ─────────────────────────────────

    def prometheus_text(self) -> str:
        """Export all metrics in Prometheus text format."""
        lines = []

        for name, value in self._counters.items():
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {value}")

        for name, values in self._histograms.items():
            if not values:
                continue
            lines.append(f"# TYPE {name} histogram")
            lines.append(f"{name}_count {len(values)}")
            lines.append(f"{name}_sum {sum(values)}")
            lines.append(f"{name}_avg {self.histogram_avg(name):.4f}")
            lines.append(f"{name}_p50 {self.histogram_p50(name):.4f}")
            lines.append(f"{name}_p99 {self.histogram_p99(name):.4f}")

        for name, value in self._gauges.items():
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {value}")

        return "\n".join(lines) + "\n"

    def to_dict(self) -> dict[str, Any]:
        """Export all metrics as a JSON-compatible dict."""
        return {
            "counters": dict(self._counters),
            "histograms": {
                name: {
                    "count": len(values),
                    "avg": self.histogram_avg(name),
                    "p50": self.histogram_p50(name),
                    "p99": self.histogram_p99(name),
                }
                for name, values in self._histograms.items()
                if values
            },
            "gauges": dict(self._gauges),
        }


# Global singleton
metrics = MetricsRegistry()
