"""Structured JSON logging — replaces print() with leveled, timestamped logs.

Usage:
    from .logging import log
    log.info("agent_started", port=50051)
    log.error("llm_call_failed", model="deepseek-chat", error=str(e))
"""

from __future__ import annotations

import json
import os
import sys
import time
from typing import Any

LOG_LEVEL = os.getenv("VIBEFUL_LOG_LEVEL", "INFO").upper()
LOG_FORMAT = os.getenv("VIBEFUL_LOG_FORMAT", "json")  # json or text

_levels = {"DEBUG": 10, "INFO": 20, "WARN": 30, "ERROR": 40}
_current_level = _levels.get(LOG_LEVEL, 20)


def _emit(level: str, message: str, **kwargs: Any) -> None:
    if _levels.get(level, 20) < _current_level:
        return

    record = {
        "ts": time.time(),
        "level": level,
        "msg": message,
        **kwargs,
    }

    if LOG_FORMAT == "text":
        extras = " ".join(f"{k}={v}" for k, v in kwargs.items())
        print(f"[{level.lower()}] {message} {extras}", file=sys.stderr)
    else:
        print(json.dumps(record), file=sys.stderr)


def debug(message: str, **kwargs: Any) -> None:
    _emit("DEBUG", message, **kwargs)


def info(message: str, **kwargs: Any) -> None:
    _emit("INFO", message, **kwargs)


def warn(message: str, **kwargs: Any) -> None:
    _emit("WARN", message, **kwargs)


def error(message: str, **kwargs: Any) -> None:
    _emit("ERROR", message, **kwargs)
