"""Graph Builder — builds a LangGraph StateGraph from a YAML/JSON config.

The config defines which nodes to include and how to wire them together.
This replaces the hardcoded build_agent_graph() with a config-driven approach.
"""

from __future__ import annotations

from typing import Any

import yaml

from langgraph.graph import StateGraph, END

from ..agent_graph import AgentState
from .registry import get_node


def build_graph_from_config(config: dict[str, Any]) -> Any:
    """Build a compiled LangGraph StateGraph from a config dict.

    Config format (YAML/JSON):

        graph:
          entry: setup
          nodes:
            - name: setup
              type: builtin.setup
            - name: react
              type: builtin.react_agent
              config:
                max_iterations: 5
            - name: completion
              type: builtin.stream_completion
          edges:
            - from: setup
              to: react
            - from: react
              to: completion

        Conditional edges:

          edges:
            - from: guard
              routes:
                safe: setup
                end: __END__

    Returns:
        CompiledStateGraph ready to invoke.
    """
    graph_config = config.get("graph", config)
    entry = graph_config.get("entry", "builtin.setup")
    nodes = graph_config.get("nodes", [])
    edges = graph_config.get("edges", [])

    builder = StateGraph(AgentState)

    # Register nodes
    for node_def in nodes:
        name = node_def["name"]
        node_type = node_def["type"]
        node_fn = get_node(node_type)
        builder.add_node(name, node_fn)

    # Set entry point
    if entry not in [n["name"] for n in nodes]:
        raise ValueError(f"Entry node '{entry}' not found in nodes list")
    builder.set_entry_point(entry)

    # Add edges
    for edge in edges:
        if "condition" in edge:
            # Conditional edge with named condition function (looked up in registry).
            # Must be checked before "routes" — both keys may be present when a
            # named condition is paired with a route map.
            from_node = edge["from"]
            routes = edge["routes"]
            condition_name = edge["condition"]
            condition_fn = get_node(condition_name) if condition_name else (
                lambda s: getattr(s, "route", "safe")
            )
            route_map = {
                label: (END if target == "__END__" else target)
                for label, target in routes.items()
            }
            builder.add_conditional_edges(from_node, condition_fn, route_map)
        elif "routes" in edge:
            # Conditional edge with lambda-based routing (reads state.route)
            from_node = edge["from"]
            routes = edge["routes"]
            # Replace __END__ with END sentinel
            route_map = {
                label: (END if target == "__END__" else target)
                for label, target in routes.items()
            }
            builder.add_conditional_edges(
                from_node,
                lambda s: getattr(s, "route", "safe"),
                route_map,
            )
        else:
            # Simple edge
            if edge.get("to") == "__END__":
                builder.add_edge(edge["from"], END)
            else:
                builder.add_edge(edge["from"], edge["to"])

    return builder.compile()


def build_graph_from_yaml(yaml_str: str) -> Any:
    """Build a graph from a YAML string.

    Args:
        yaml_str: YAML configuration string.

    Returns:
        CompiledStateGraph.
    """
    config = yaml.safe_load(yaml_str)
    return build_graph_from_config(config)


def build_graph_from_file(path: str) -> Any:
    """Build a graph from a YAML/JSON file.

    Args:
        path: Path to .yaml or .json file.

    Returns:
        CompiledStateGraph.
    """
    with open(path) as f:
        if path.endswith(".json"):
            import json
            config = json.load(f)
        else:
            config = yaml.safe_load(f)
    return build_graph_from_config(config)
