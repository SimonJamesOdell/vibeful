"""Regression Detector — monitors agent performance and detects degradation.

Tracks per-node metrics across agent versions/config changes.
Establishes baseline on deploy and alerts when performance degrades
significantly.

Usage:
    detector = RegressionDetector(db)
    await detector.record_execution(agent_id, node_id, metrics)
    alerts = await detector.check_regression(agent_id)
"""

from __future__ import annotations

import json as _json
import uuid as _uuid
from dataclasses import dataclass, field
from typing import Any
from datetime import datetime, timezone


@dataclass
class NodeMetrics:
    """Metrics recorded for a single node execution."""
    agent_id: str
    node_id: str
    node_type: str = ""
    node_name: str = ""
    success: bool = True
    latency_ms: int = 0
    tokens_used: int = 0
    tokens_prompt: int = 0
    tokens_completion: int = 0
    cost_usd: float = 0.0
    error: str = ""


@dataclass
class BaselineStats:
    """Rolling baseline statistics for a node."""
    agent_id: str = ""
    node_id: str = ""
    node_type: str = ""
    sample_count: int = 0
    mean_latency_ms: float = 0.0
    mean_tokens: float = 0.0
    success_rate: float = 1.0
    mean_cost: float = 0.0
    last_updated: str = ""


@dataclass
class RegressionAlert:
    """Alert emitted when a metric shows significant degradation."""
    agent_id: str
    node_id: str
    node_type: str = ""
    node_name: str = ""
    metric: str = ""        # latency, success_rate, tokens, cost
    baseline_value: float = 0.0
    current_value: float = 0.0
    pct_change: float = 0.0  # negative = degradation
    severity: str = "warning"  # warning, critical
    message: str = ""
    detected_at: str = ""


class RegressionDetector:
    """Tracks agent performance and detects regressions."""

    def __init__(self, db: Any):
        self.db = db
        self._thresholds = {
            "latency_ms": 0.20,      # 20% increase = warning
            "latency_ms_critical": 0.50,  # 50% increase = critical
            "success_rate": 0.05,    # 5% drop = warning
            "success_rate_critical": 0.10,  # 10% drop = critical
            "tokens_used": 0.30,     # 30% increase = warning
        }

    async def record_execution(self, metrics: NodeMetrics) -> None:
        """Record a single node execution for trend analysis."""
        await self.db.log_event("node_execution", {
            "agent_id": metrics.agent_id,
            "node_id": metrics.node_id,
            "node_type": metrics.node_type,
            "node_name": metrics.node_name,
            "success": metrics.success,
            "latency_ms": metrics.latency_ms,
            "tokens_used": metrics.tokens_used,
            "tokens_prompt": metrics.tokens_prompt,
            "tokens_completion": metrics.tokens_completion,
            "cost_usd": metrics.cost_usd,
            "error": metrics.error,
        })

    async def establish_baseline(self, agent_id: str, window_hours: int = 24) -> dict[str, BaselineStats]:
        """Compute baseline stats from recent executions.

        Uses the last `window_hours` of execution data as baseline.
        Returns a dict mapping node_id → BaselineStats.
        """
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    event_data->>'node_id' as node_id,
                    event_data->>'node_type' as node_type,
                    COUNT(*) as sample_count,
                    AVG((event_data->>'latency_ms')::numeric) as mean_latency_ms,
                    AVG((event_data->>'tokens_used')::numeric) as mean_tokens,
                    SUM(CASE WHEN (event_data->>'success')::boolean THEN 1 ELSE 0 END)::float 
                        / NULLIF(COUNT(*), 0) as success_rate,
                    AVG((event_data->>'cost_usd')::numeric) as mean_cost
                FROM events
                WHERE event_name = 'node_execution'
                    AND event_data->>'agent_id' = %s
                    AND created_at >= now() - (%s || ' hours')::interval
                GROUP BY event_data->>'node_id', event_data->>'node_type'
            """, (agent_id, str(window_hours)))

            baselines: dict[str, BaselineStats] = {}
            for row in await cur.fetchall():
                row = self.db._serialize_row(row)
                node_id = row.get("node_id", "")
                baselines[node_id] = BaselineStats(
                    agent_id=agent_id,
                    node_id=node_id,
                    node_type=row.get("node_type", ""),
                    sample_count=int(row.get("sample_count", 0)),
                    mean_latency_ms=float(row.get("mean_latency_ms", 0)),
                    mean_tokens=float(row.get("mean_tokens", 0)),
                    success_rate=float(row.get("success_rate", 1.0)),
                    mean_cost=float(row.get("mean_cost", 0)),
                    last_updated=datetime.now(timezone.utc).isoformat(),
                )

            # Cache baselines in events table
            await cur.execute("""
                INSERT INTO events (event_name, event_data)
                VALUES ('regression_baseline', %s)
            """, (_json.dumps({
                "agent_id": agent_id,
                "baselines": {
                    nid: {
                        "node_type": b.node_type,
                        "sample_count": b.sample_count,
                        "mean_latency_ms": b.mean_latency_ms,
                        "mean_tokens": b.mean_tokens,
                        "success_rate": b.success_rate,
                        "mean_cost": b.mean_cost,
                    }
                    for nid, b in baselines.items()
                },
                "established_at": datetime.now(timezone.utc).isoformat(),
            }),))

            await conn.commit()
            return baselines

    async def get_baseline(self, agent_id: str) -> dict[str, BaselineStats]:
        """Get the most recent baseline for an agent."""
        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT event_data FROM events
                WHERE event_name = 'regression_baseline'
                    AND event_data->>'agent_id' = %s
                ORDER BY created_at DESC LIMIT 1
            """, (agent_id,))
            row = await cur.fetchone()
            if not row:
                return {}

            data = row["event_data"]
            if isinstance(data, str):
                data = _json.loads(data)

            baselines: dict[str, BaselineStats] = {}
            for node_id, bd in data.get("baselines", {}).items():
                baselines[node_id] = BaselineStats(
                    agent_id=agent_id,
                    node_id=node_id,
                    node_type=bd.get("node_type", ""),
                    sample_count=int(bd.get("sample_count", 0)),
                    mean_latency_ms=float(bd.get("mean_latency_ms", 0)),
                    mean_tokens=float(bd.get("mean_tokens", 0)),
                    success_rate=float(bd.get("success_rate", 1.0)),
                    mean_cost=float(bd.get("mean_cost", 0)),
                )
            return baselines

    async def check_regression(self, agent_id: str, recent_hours: int = 1) -> list[RegressionAlert]:
        """Compare recent performance against baseline and emit alerts.

        Args:
            agent_id: Agent to check.
            recent_hours: Window for recent data comparison.

        Returns:
            List of RegressionAlert for any metrics exceeding thresholds.
        """
        baseline = await self.get_baseline(agent_id)
        if not baseline:
            return []

        conn = await self.db._get_conn()
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT
                    event_data->>'node_id' as node_id,
                    event_data->>'node_type' as node_type,
                    event_data->>'node_name' as node_name,
                    COUNT(*) as sample_count,
                    AVG((event_data->>'latency_ms')::numeric) as current_latency,
                    AVG((event_data->>'tokens_used')::numeric) as current_tokens,
                    SUM(CASE WHEN (event_data->>'success')::boolean THEN 1 ELSE 0 END)::float 
                        / NULLIF(COUNT(*), 0) as current_success_rate,
                    AVG((event_data->>'cost_usd')::numeric) as current_cost
                FROM events
                WHERE event_name = 'node_execution'
                    AND event_data->>'agent_id' = %s
                    AND created_at >= now() - (%s || ' hours')::interval
                GROUP BY event_data->>'node_id', event_data->>'node_type', event_data->>'node_name'
            """, (agent_id, str(recent_hours)))

            alerts: list[RegressionAlert] = []
            now_iso = datetime.now(timezone.utc).isoformat()

            for row in await cur.fetchall():
                row = self.db._serialize_row(row)
                node_id = row.get("node_id", "")
                bl = baseline.get(node_id)
                if not bl or bl.sample_count < 5:
                    continue  # Not enough baseline data

                current_latency = float(row.get("current_latency", 0))
                current_success = float(row.get("current_success_rate", 1.0))
                current_tokens = float(row.get("current_tokens", 0))

                # Check latency
                if bl.mean_latency_ms > 0 and current_latency > 0:
                    pct_change = (current_latency - bl.mean_latency_ms) / bl.mean_latency_ms
                    threshold = self._thresholds["latency_ms"]
                    critical = self._thresholds["latency_ms_critical"]
                    if pct_change > critical:
                        alerts.append(RegressionAlert(
                            agent_id=agent_id, node_id=node_id,
                            node_type=row.get("node_type", ""),
                            node_name=row.get("node_name", ""),
                            metric="latency_ms",
                            baseline_value=bl.mean_latency_ms,
                            current_value=current_latency,
                            pct_change=round(pct_change * 100, 1),
                            severity="critical",
                            message=f"Latency increased {round(pct_change*100)}% ({bl.mean_latency_ms:.0f}ms → {current_latency:.0f}ms)",
                            detected_at=now_iso,
                        ))
                    elif pct_change > threshold:
                        alerts.append(RegressionAlert(
                            agent_id=agent_id, node_id=node_id,
                            node_type=row.get("node_type", ""),
                            node_name=row.get("node_name", ""),
                            metric="latency_ms",
                            baseline_value=bl.mean_latency_ms,
                            current_value=current_latency,
                            pct_change=round(pct_change * 100, 1),
                            severity="warning",
                            message=f"Latency increased {round(pct_change*100)}% ({bl.mean_latency_ms:.0f}ms → {current_latency:.0f}ms)",
                            detected_at=now_iso,
                        ))

                # Check success rate
                if bl.success_rate > 0:
                    pct_drop = bl.success_rate - current_success
                    threshold = self._thresholds["success_rate"]
                    critical = self._thresholds["success_rate_critical"]
                    if pct_drop > critical:
                        alerts.append(RegressionAlert(
                            agent_id=agent_id, node_id=node_id,
                            node_type=row.get("node_type", ""),
                            node_name=row.get("node_name", ""),
                            metric="success_rate",
                            baseline_value=round(bl.success_rate * 100, 1),
                            current_value=round(current_success * 100, 1),
                            pct_change=round(-pct_drop * 100, 1),
                            severity="critical",
                            message=f"Success rate dropped {round(pct_drop*100)}% ({bl.success_rate*100:.1f}% → {current_success*100:.1f}%)",
                            detected_at=now_iso,
                        ))
                    elif pct_drop > threshold:
                        alerts.append(RegressionAlert(
                            agent_id=agent_id, node_id=node_id,
                            node_type=row.get("node_type", ""),
                            node_name=row.get("node_name", ""),
                            metric="success_rate",
                            baseline_value=round(bl.success_rate * 100, 1),
                            current_value=round(current_success * 100, 1),
                            pct_change=round(-pct_drop * 100, 1),
                            severity="warning",
                            message=f"Success rate dropped {round(pct_drop*100)}% ({bl.success_rate*100:.1f}% → {current_success*100:.1f}%)",
                            detected_at=now_iso,
                        ))

                # Check token usage
                if bl.mean_tokens > 0 and current_tokens > 0:
                    pct_change = (current_tokens - bl.mean_tokens) / bl.mean_tokens
                    if pct_change > self._thresholds["tokens_used"]:
                        alerts.append(RegressionAlert(
                            agent_id=agent_id, node_id=node_id,
                            node_type=row.get("node_type", ""),
                            node_name=row.get("node_name", ""),
                            metric="tokens_used",
                            baseline_value=bl.mean_tokens,
                            current_value=current_tokens,
                            pct_change=round(pct_change * 100, 1),
                            severity="warning",
                            message=f"Token usage increased {round(pct_change*100)}% ({bl.mean_tokens:.0f} → {current_tokens:.0f})",
                            detected_at=now_iso,
                        ))

            return alerts

    async def get_performance_summary(self, agent_id: str) -> dict[str, Any]:
        """Get a high-level performance summary for an agent."""
        baseline = await self.get_baseline(agent_id)
        alerts = await self.check_regression(agent_id)

        return {
            "agent_id": agent_id,
            "nodes_tracked": len(baseline),
            "baseline_established": len(baseline) > 0,
            "alerts": [
                {
                    "node_id": a.node_id,
                    "node_name": a.node_name,
                    "metric": a.metric,
                    "severity": a.severity,
                    "pct_change": a.pct_change,
                    "message": a.message,
                }
                for a in alerts
            ],
            "baselines": {
                nid: {
                    "node_type": b.node_type,
                    "success_rate": round(b.success_rate * 100, 1),
                    "mean_latency_ms": round(b.mean_latency_ms, 0),
                    "mean_tokens": round(b.mean_tokens, 0),
                    "sample_count": b.sample_count,
                }
                for nid, b in baseline.items()
            },
        }
