"""Tests for the rate limiting module.

Covers:
- TokenBucket.allow(): allows within limit, blocks at boundary
- TokenBucket.remaining(): accurate count
- Window reset behavior after expiry
- Multiple concurrent keys with independent limits
- TokenBucket.cleanup(): removes expired buckets
- Custom limit/window configuration
"""

from __future__ import annotations

import time
import pytest
from src.rate_limit import TokenBucket


# ═══════════════════════════════════════════════════════════════
# Basic allow / deny behavior
# ═══════════════════════════════════════════════════════════════

class TestAllowWithinLimit:
    def test_single_request_allowed(self):
        bucket = TokenBucket(max_tokens=10, window_sec=60)
        assert bucket.allow("key1") is True

    def test_multiple_requests_within_limit(self):
        bucket = TokenBucket(max_tokens=5, window_sec=60)
        for _ in range(5):
            assert bucket.allow("key1") is True

    def test_blocked_at_limit(self):
        bucket = TokenBucket(max_tokens=3, window_sec=60)
        for _ in range(3):
            assert bucket.allow("key1") is True
        # 4th request should be blocked
        assert bucket.allow("key1") is False

    def test_stays_blocked_after_limit(self):
        bucket = TokenBucket(max_tokens=2, window_sec=60)
        assert bucket.allow("key1") is True
        assert bucket.allow("key1") is True
        assert bucket.allow("key1") is False
        assert bucket.allow("key1") is False  # still blocked


class TestWindowReset:
    def test_reset_after_window_expiry(self, monkeypatch):
        """After the window expires, the bucket should reset."""
        bucket = TokenBucket(max_tokens=3, window_sec=60)

        # Exhaust the bucket
        for _ in range(3):
            assert bucket.allow("key1") is True
        assert bucket.allow("key1") is False

        # Advance time past the window
        future = time.monotonic() + 61
        monkeypatch.setattr(time, "monotonic", lambda: future)

        # Should be allowed again (window reset)
        assert bucket.allow("key1") is True

    def test_partial_window_no_reset(self, monkeypatch):
        """If the window hasn't fully expired, limit still applies."""
        bucket = TokenBucket(max_tokens=3, window_sec=60)

        for _ in range(3):
            assert bucket.allow("key1") is True
        assert bucket.allow("key1") is False

        # Advance only 30 seconds (within window)
        future = time.monotonic() + 30
        monkeypatch.setattr(time, "monotonic", lambda: future)

        # Still blocked
        assert bucket.allow("key1") is False


class TestRemaining:
    def test_remaining_full_bucket(self):
        bucket = TokenBucket(max_tokens=10, window_sec=60)
        assert bucket.remaining("key1") == 10

    def test_remaining_after_use(self):
        bucket = TokenBucket(max_tokens=10, window_sec=60)
        bucket.allow("key1")
        bucket.allow("key1")
        assert bucket.remaining("key1") == 8

    def test_remaining_at_zero(self):
        bucket = TokenBucket(max_tokens=2, window_sec=60)
        bucket.allow("key1")
        bucket.allow("key1")
        assert bucket.remaining("key1") == 0

    def test_remaining_unknown_key(self):
        bucket = TokenBucket(max_tokens=10, window_sec=60)
        assert bucket.remaining("nonexistent") == 10

    def test_remaining_after_window_expiry(self, monkeypatch):
        bucket = TokenBucket(max_tokens=5, window_sec=60)
        for _ in range(5):
            bucket.allow("key1")
        assert bucket.remaining("key1") == 0

        future = time.monotonic() + 61
        monkeypatch.setattr(time, "monotonic", lambda: future)

        assert bucket.remaining("key1") == 5  # reset


class TestMultipleKeys:
    def test_independent_keys(self):
        """Each key has its own independent bucket."""
        bucket = TokenBucket(max_tokens=2, window_sec=60)

        # Exhaust key1
        assert bucket.allow("key1") is True
        assert bucket.allow("key1") is True
        assert bucket.allow("key1") is False

        # key2 should still have full capacity
        assert bucket.allow("key2") is True
        assert bucket.allow("key2") is True
        assert bucket.allow("key2") is False

    def test_key_isolation(self):
        """Using one key does not affect another."""
        bucket = TokenBucket(max_tokens=5, window_sec=60)
        for _ in range(3):
            bucket.allow("key1")
        assert bucket.remaining("key1") == 2
        assert bucket.remaining("key2") == 5  # untouched


class TestCleanup:
    def test_cleanup_removes_expired(self, monkeypatch):
        """Cleanup should remove buckets whose windows have expired."""
        bucket = TokenBucket(max_tokens=5, window_sec=60)

        bucket.allow("key1")
        assert "key1" in bucket._buckets

        # Advance past window
        future = time.monotonic() + 61
        monkeypatch.setattr(time, "monotonic", lambda: future)

        bucket.cleanup()
        assert "key1" not in bucket._buckets

    def test_cleanup_keeps_active(self):
        """Cleanup should not remove active buckets."""
        bucket = TokenBucket(max_tokens=5, window_sec=60)
        bucket.allow("active_key")
        bucket.cleanup()
        assert "active_key" in bucket._buckets

    def test_cleanup_removes_only_expired(self, monkeypatch):
        """Cleanup should only remove expired keys, not all keys."""
        bucket = TokenBucket(max_tokens=5, window_sec=60)

        bucket.allow("old_key")

        # Advance time
        future = time.monotonic() + 61
        monkeypatch.setattr(time, "monotonic", lambda: future)

        bucket.allow("new_key")  # starts a fresh window

        bucket.cleanup()

        # old_key should be gone, new_key should remain
        assert "old_key" not in bucket._buckets
        assert "new_key" in bucket._buckets


class TestCustomConfiguration:
    def test_custom_max_tokens(self):
        bucket = TokenBucket(max_tokens=100, window_sec=60)
        assert bucket.max_tokens == 100
        for _ in range(100):
            assert bucket.allow("key1") is True
        assert bucket.allow("key1") is False

    def test_custom_window(self, monkeypatch):
        bucket = TokenBucket(max_tokens=3, window_sec=10)
        for _ in range(3):
            assert bucket.allow("key1") is True
        assert bucket.allow("key1") is False

        # Advance 5 seconds — still within window
        future = time.monotonic() + 5
        monkeypatch.setattr(time, "monotonic", lambda: future)
        assert bucket.allow("key1") is False

        # Advance 11 seconds — window expired
        future = time.monotonic() + 11
        monkeypatch.setattr(time, "monotonic", lambda: future)
        assert bucket.allow("key1") is True

    def test_defaults_from_env(self, monkeypatch):
        """TokenBucket defaults come from module-level RATE_LIMIT/RATE_WINDOW."""
        bucket = TokenBucket()
        # Defaults: 100 requests per 60 seconds
        assert bucket.max_tokens >= 1
        assert bucket.window_sec >= 1


# ═══════════════════════════════════════════════════════════════
# invariant: rate limit must be consistent
# ═══════════════════════════════════════════════════════════════

class TestRateLimitInvariants:
    """Structural invariants for the rate limiter."""

    def test_allow_never_raises(self):
        """allow() should never raise an exception for any key."""
        bucket = TokenBucket(max_tokens=1, window_sec=60)
        for _ in range(100):
            # Should not raise, just return True/False
            result = bucket.allow("test")
            assert isinstance(result, bool)

    def test_remaining_never_negative(self):
        """remaining() should never return negative."""
        bucket = TokenBucket(max_tokens=5, window_sec=60)
        for _ in range(20):
            bucket.allow("key1")
        assert bucket.remaining("key1") >= 0

    def test_cleanup_is_idempotent(self):
        """Calling cleanup multiple times should be safe."""
        bucket = TokenBucket(max_tokens=5, window_sec=60)
        bucket.allow("key1")
        bucket.cleanup()
        bucket.cleanup()  # should not raise
        bucket.cleanup()  # should not raise

    def test_buckets_dict_always_exists(self):
        """The internal _buckets dict must always exist."""
        bucket = TokenBucket()
        assert isinstance(bucket._buckets, dict)
        bucket.cleanup()
        assert isinstance(bucket._buckets, dict)
