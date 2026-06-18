"""Rate limiting middleware for the REST API.

Simple token-bucket implementation. Configure via env vars:
- VIBEFUL_RATE_LIMIT_REQUESTS: max requests per window (default: 100)
- VIBEFUL_RATE_LIMIT_WINDOW_SEC: window duration in seconds (default: 60)
"""

from __future__ import annotations

import os
import time
from collections import defaultdict

RATE_LIMIT = int(os.getenv("VIBEFUL_RATE_LIMIT_REQUESTS", "100"))
RATE_WINDOW = int(os.getenv("VIBEFUL_RATE_LIMIT_WINDOW_SEC", "60"))


class TokenBucket:
    """Per-key token bucket rate limiter."""

    def __init__(self, max_tokens: int = RATE_LIMIT, window_sec: int = RATE_WINDOW):
        self.max_tokens = max_tokens
        self.window_sec = window_sec
        self._buckets: dict[str, tuple[float, int]] = {}

    def allow(self, key: str) -> bool:
        """Check if a request is allowed. Returns True if within limit."""
        now = time.monotonic()
        if key not in self._buckets:
            self._buckets[key] = (now, 1)
            return True

        window_start, count = self._buckets[key]
        if now - window_start > self.window_sec:
            # Window expired, reset
            self._buckets[key] = (now, 1)
            return True

        if count < self.max_tokens:
            self._buckets[key] = (window_start, count + 1)
            return True

        return False

    def remaining(self, key: str) -> int:
        """Number of requests remaining in the current window."""
        if key not in self._buckets:
            return self.max_tokens
        window_start, count = self._buckets[key]
        now = time.monotonic()
        if now - window_start > self.window_sec:
            return self.max_tokens
        return max(0, self.max_tokens - count)

    def cleanup(self) -> None:
        """Remove expired buckets."""
        now = time.monotonic()
        expired = [
            k for k, (start, _) in self._buckets.items()
            if now - start > self.window_sec
        ]
        for k in expired:
            del self._buckets[k]


# Global instance
limiter = TokenBucket()
