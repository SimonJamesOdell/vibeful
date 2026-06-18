"""Terminal dashboard for live Vibeful observability.

Usage: vibeful dashboard
Shows: requests/sec, avg latency, token usage, cost, error rate.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time


async def dashboard_loop(refresh_sec: float = 2.0) -> None:
    """Display a live-updating terminal dashboard."""
    from .metrics import metrics as m

    try:
        while True:
            _clear()
            print("╔══════════════════════════════════════════════════════╗")
            print("║              Vibeful Agent Dashboard                 ║")
            print("╠══════════════════════════════════════════════════════╣")

            # Requests
            total = m.counter("vibeful_requests_total")
            errors = m.counter("vibeful_errors_total")
            print(f"║  Requests:  {total:<8}  Errors: {errors:<8}            ║")

            # Latency
            avg_lat = m.histogram_avg("vibeful_request_latency_ms")
            p50 = m.histogram_p50("vibeful_request_latency_ms")
            p99 = m.histogram_p99("vibeful_request_latency_ms")
            print(f"║  Latency:   avg {avg_lat:>8.1f}ms  p50 {p50:>8.1f}ms  p99 {p99:>8.1f}ms ║")

            # Tokens
            prompt_tokens = m.counter("vibeful_prompt_tokens_total")
            completion_tokens = m.counter("vibeful_completion_tokens_total")
            print(f"║  Tokens:    prompt {prompt_tokens:>8}  completion {completion_tokens:>8} ║")

            # Cost
            cost = m.gauge("vibeful_cost_usd_total")
            print(f"║  Cost:      ${cost:.4f}                                  ║")

            # Error rate
            rate = (errors / total * 100) if total > 0 else 0.0
            status = "🟢" if rate < 1 else ("🟡" if rate < 5 else "🔴")
            print(f"║  Status:    {status}  Error rate: {rate:.1f}%                     ║")

            print("╚══════════════════════════════════════════════════════╝")
            print(f"  Refreshing every {refresh_sec}s. Press Ctrl+C to exit.")

            await asyncio.sleep(refresh_sec)
    except KeyboardInterrupt:
        _clear()
        print("Dashboard stopped.")


def _clear() -> None:
    """Clear the terminal."""
    os.system("cls" if os.name == "nt" else "clear")
