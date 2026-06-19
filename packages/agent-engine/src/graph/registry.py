"""Node Registry — register and look up agent graph nodes by name.

Built-in nodes are auto-registered. Custom nodes via register_node().
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

# Registry: name -> node function
_registry: dict[str, Callable] = {}


def register_node(name: str, node_fn: Callable) -> None:
    """Register a node function under a name.

    Args:
        name: Node type name, e.g. 'builtin.setup' or 'my_org.audit_log'.
        node_fn: Async function (state: AgentState) -> AgentState or -> str.
    """
    _registry[name] = node_fn


def get_node(name: str) -> Callable:
    """Look up a registered node by name.

    Raises ValueError if not found.
    """
    if name not in _registry:
        available = ", ".join(sorted(_registry))
        raise ValueError(
            f"Unknown node type '{name}'. Available: {available}"
        )
    return _registry[name]


def list_nodes() -> list[str]:
    """List all registered node names."""
    return sorted(_registry)


def is_registered(name: str) -> bool:
    """Check if a node is registered."""
    return name in _registry


def _register_builtins() -> None:
    """Register all built-in nodes. Called at import time."""
    from ..agent_graph import (
        attack_guard_node,
        setup_node,
        fact_recall_node,
        planning_node,
        buttons_node,
        system_message_builder_node,
        rag_node,
        mcp_discovery_node,
        react_agent_node,
        stream_completion_node,
        citation_node,
        follow_up_node,
        fact_mining_node,
    )
    from ..analysis_pipeline import analysis_pipeline_node, output_router_node
    from ..quality_nodes import classify_intent as router_node

    builtins = {
        "builtin.attack_guard": attack_guard_node,
        "builtin.setup": setup_node,
        "builtin.fact_recall": fact_recall_node,
        "builtin.planning": planning_node,
        "builtin.buttons": buttons_node,
        "builtin.system_message_builder": system_message_builder_node,
        "builtin.rag": rag_node,
        "builtin.mcp_discovery": mcp_discovery_node,
        "builtin.react_agent": react_agent_node,
        "builtin.stream_completion": stream_completion_node,
        "builtin.citation": citation_node,
        "builtin.follow_up": follow_up_node,
        "builtin.fact_mining": fact_mining_node,
        "builtin.router": router_node,
        "builtin.analysis_pipeline": analysis_pipeline_node,
        "builtin.output_router": output_router_node,
    }
    for name, fn in builtins.items():
        register_node(name, fn)


# Auto-register builtins on import
_register_builtins()
