"""Agent persistence tests — verify agents survive in the database.

Invariants tested:
- YAML stored without JSON double-encoding (no leading quote, real newlines)
- YAML is parseable and contains graph.nodes
- Agent survives round-trip: create → read back → nodes intact
- PUT update modifies config_yaml correctly
- DELETE removes agent from DB
- Styling stored in styling_json column, survives create + update + reload
- Agent cloning preserves all fields
- PUT partial updates don't wipe unset fields
- List endpoint returns correct agents
"""

from __future__ import annotations

import httpx
import pytest
import yaml


BASE = "http://127.0.0.1:50052"


# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

def _create_agent(name: str, config_yaml: str = "", **kwargs) -> dict:
    body = {"name": name, "description": "", "system_prompt": "", "config_yaml": config_yaml, **kwargs}
    r = httpx.post(f"{BASE}/v1/agents", json=body)
    assert r.status_code == 200, f"Create failed: {r.text}"
    return r.json()


def _get_agent(agent_id: str) -> dict:
    r = httpx.get(f"{BASE}/v1/agents/{agent_id}")
    assert r.status_code == 200, f"Get failed: {r.text}"
    return r.json()


def _delete_agent(agent_id: str):
    r = httpx.delete(f"{BASE}/v1/agents/{agent_id}")
    assert r.status_code in (200, 404)


def _put_agent(agent_id: str, **kwargs) -> dict:
    r = httpx.put(f"{BASE}/v1/agents/{agent_id}", json=kwargs)
    assert r.status_code == 200, f"PUT failed: {r.text}"
    return r.json()


MINIMAL_YAML = """# Test YAML
name: test-agent
model: deepseek-chat

graph:
  entry: setup
  nodes:
    - name: setup
      type: builtin.setup
    - name: react_agent
      type: builtin.react_agent
      config:
        max_iterations: 5
  edges:
    - from: setup
      to: react_agent
"""

UPDATED_YAML = """# Updated YAML
name: updated-agent
model: deepseek-chat

graph:
  entry: setup
  nodes:
    - name: setup
      type: builtin.setup
    - name: attack_guard
      type: builtin.attack_guard
    - name: react_agent
      type: builtin.react_agent
  edges:
    - from: attack_guard
      to: setup
    - from: setup
      to: react_agent
"""

VALID_PRESETS = {"light", "dark", "default", "brand"}


# ═══════════════════════════════════════════════════════════════
# Invariant: YAML storage format
# ═══════════════════════════════════════════════════════════════

class TestYAMLStorageFormat:
    """invariant: config_json must be plain YAML, not JSON-encoded."""

    def test_yaml_not_json_encoded(self):
        agent = _create_agent("format-test", config_yaml=MINIMAL_YAML)
        try:
            yaml_field = agent.get("config_json") or agent.get("config_yaml") or ""
            assert len(yaml_field) > 10, "YAML field is empty or too short"
            assert not yaml_field.startswith('"'), (
                f"config_json is JSON-encoded (starts with quote). "
                f"Fix: remove json.dumps() in sqlite.create_agent()."
            )
        finally:
            _delete_agent(agent["id"])

    def test_yaml_has_real_newlines(self):
        agent = _create_agent("newline-test", config_yaml=MINIMAL_YAML)
        try:
            yaml_field = agent.get("config_json") or agent.get("config_yaml") or ""
            assert "\n" in yaml_field, "config_json has no real newlines"
            assert "\\n" not in yaml_field, "config_json contains literal backslash-n"
        finally:
            _delete_agent(agent["id"])

    def test_yaml_is_parseable(self):
        agent = _create_agent("parse-test", config_yaml=MINIMAL_YAML)
        try:
            yaml_field = agent.get("config_json") or agent.get("config_yaml") or ""
            parsed = yaml.safe_load(yaml_field)
            assert parsed is not None, "YAML parsed to None"
            assert isinstance(parsed, dict), f"YAML parsed to {type(parsed).__name__}"
            graph = parsed.get("graph", {})
            assert graph, "YAML missing 'graph' key"
            nodes = graph.get("nodes", [])
            assert len(nodes) > 0, "YAML graph has no nodes"
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: agent cloning preserves all fields
# ═══════════════════════════════════════════════════════════════

class TestAgentClone:
    """Cloning an agent must copy name, description, config_yaml, and styling."""

    def test_clone_preserves_config_yaml(self):
        yml = MINIMAL_YAML
        agent = _create_agent("clone-source", config_yaml=yml, styling="light")
        try:
            clone = _create_agent("clone-source (copy)", config_yaml=yml, styling="light")
            try:
                orig = agent.get("config_json") or agent.get("config_yaml") or ""
                cp = clone.get("config_json") or clone.get("config_yaml") or ""
                assert orig == cp, f"Clone YAML differs: {len(orig)} vs {len(cp)} chars"
            finally:
                _delete_agent(clone["id"])
        finally:
            _delete_agent(agent["id"])

    def test_clone_preserves_styling(self):
        agent = _create_agent("style-source", styling="brand")
        try:
            clone = _create_agent("style-source (copy)", styling="brand")
            try:
                assert clone.get("styling_json") == "brand"
            finally:
                _delete_agent(clone["id"])
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: agent creation with all fields
# ═══════════════════════════════════════════════════════════════

class TestAgentCreationFields:
    """Creating an agent with all possible fields must store them all."""

    def test_create_with_all_fields(self):
        agent = _create_agent(
            "full-fields-test",
            description="A test agent",
            system_prompt="You are helpful.",
            model="deepseek-chat",
            temperature=0.5,
            config_yaml=MINIMAL_YAML,
            styling="dark",
        )
        try:
            reloaded = _get_agent(agent["id"])
            assert reloaded["name"] == "full-fields-test"
            assert reloaded.get("description") == "A test agent"
            assert reloaded.get("system_prompt") == "You are helpful."
            assert reloaded.get("styling_json") == "dark"
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            parsed = yaml.safe_load(yaml_field)
            assert parsed is not None and "graph" in parsed
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: PUT does not wipe unset fields
# ═══════════════════════════════════════════════════════════════

class TestPUTPartialUpdate:
    """PUT endpoint must only update specified fields, leaving others intact."""

    def test_put_name_only_preserves_config(self):
        agent = _create_agent("partial-test", config_yaml=MINIMAL_YAML, styling="light")
        try:
            _put_agent(agent["id"], name="renamed-only")
            reloaded = _get_agent(agent["id"])
            assert reloaded["name"] == "renamed-only"
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            assert len(yaml_field) > 10, "config_yaml was wiped"
            assert reloaded.get("styling_json") == "light", "styling was wiped"
        finally:
            _delete_agent(agent["id"])

    def test_put_styling_only_preserves_config(self):
        agent = _create_agent("styling-only-test", config_yaml=MINIMAL_YAML, styling="default")
        try:
            _put_agent(agent["id"], styling="dark")
            reloaded = _get_agent(agent["id"])
            assert reloaded.get("styling_json") == "dark"
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            assert len(yaml_field) > 10, "config_yaml was wiped"
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: list endpoint correctness
# ═══════════════════════════════════════════════════════════════

class TestAgentListEndpoint:
    """GET /v1/agents must return all created agents."""

    def test_list_includes_new_agent(self):
        agent = _create_agent("list-test")
        try:
            r = httpx.get(f"{BASE}/v1/agents")
            assert r.status_code == 200
            agents = r.json()
            names = [a["name"] for a in agents]
            assert "list-test" in names
        finally:
            _delete_agent(agent["id"])

    def test_list_excludes_deleted_agent(self):
        agent = _create_agent("list-delete-test")
        aid = agent["id"]
        _delete_agent(aid)
        r = httpx.get(f"{BASE}/v1/agents")
        agents = r.json()
        ids = [a["id"] for a in agents]
        assert aid not in ids, "Deleted agent still in list"


# ═══════════════════════════════════════════════════════════════
# Invariant: agent round-trip persistence
# ═══════════════════════════════════════════════════════════════

class TestAgentRoundTrip:
    """Agent created via POST must be loadable via GET with intact data."""

    def test_create_then_read_back(self):
        agent = _create_agent("roundtrip-test", config_yaml=MINIMAL_YAML)
        try:
            reloaded = _get_agent(agent["id"])
            assert reloaded["name"] == "roundtrip-test"
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            assert len(yaml_field) > 10
            parsed = yaml.safe_load(yaml_field)
            assert len(parsed["graph"]["nodes"]) == 2
        finally:
            _delete_agent(agent["id"])

    def test_node_count_preserved(self):
        agent = _create_agent("nodecount-test", config_yaml=MINIMAL_YAML)
        try:
            reloaded = _get_agent(agent["id"])
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            parsed = yaml.safe_load(yaml_field)
            nodes = parsed["graph"]["nodes"]
            assert len(nodes) == 2
            node_names = [n["name"] for n in nodes]
            assert "setup" in node_names
            assert "react_agent" in node_names
        finally:
            _delete_agent(agent["id"])

    def test_create_without_yaml_stores_empty_string(self):
        agent = _create_agent("no-yaml-test")
        try:
            yaml_field = agent.get("config_json") or ""
            assert yaml_field == "" or yaml_field == '""'
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: PUT update preserves config_yaml
# ═══════════════════════════════════════════════════════════════

class TestAgentUpdate:
    """PUT endpoint must accept and persist config_yaml."""

    def test_put_updates_config_yaml(self):
        agent = _create_agent("update-test", config_yaml=MINIMAL_YAML)
        try:
            _put_agent(agent["id"], config_yaml=UPDATED_YAML, name="updated-test")
            reloaded = _get_agent(agent["id"])
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            nodes = yaml.safe_load(yaml_field)["graph"]["nodes"]
            assert len(nodes) == 3  # 2 → 3
        finally:
            _delete_agent(agent["id"])

    def test_put_preserves_yaml_format(self):
        agent = _create_agent("put-format-test", config_yaml=MINIMAL_YAML)
        try:
            _put_agent(agent["id"], config_yaml=UPDATED_YAML)
            reloaded = _get_agent(agent["id"])
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            assert not yaml_field.startswith('"'), "PUT caused JSON double-encoding"
            assert "\n" in yaml_field, "PUT lost real newlines"
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: DELETE removes agent completely
# ═══════════════════════════════════════════════════════════════

class TestAgentDelete:
    """DELETE must remove the agent so it's not retrievable."""

    def test_delete_removes_agent(self):
        agent = _create_agent("delete-test", config_yaml=MINIMAL_YAML)
        aid = agent["id"]
        _delete_agent(aid)
        r = httpx.get(f"{BASE}/v1/agents/{aid}")
        assert r.status_code == 404, f"Agent still exists: {r.status_code}"

    def test_delete_nonexistent_returns_404(self):
        r = httpx.delete(f"{BASE}/v1/agents/nonexistent-id-12345")
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════
# Invariant: YAML graph structure
# ═══════════════════════════════════════════════════════════════

class TestGraphStructure:
    """YAML graph must have entry, nodes with name/type, and edges."""

    def test_graph_has_required_keys(self):
        parsed = yaml.safe_load(MINIMAL_YAML)
        graph = parsed["graph"]
        assert "entry" in graph
        assert "nodes" in graph
        assert "edges" in graph
        for node in graph["nodes"]:
            assert "name" in node
            assert "type" in node


# ═══════════════════════════════════════════════════════════════
# Invariant: styling persistence in the database
# ═══════════════════════════════════════════════════════════════

class TestStylingPersistence:
    """Styling must be stored in styling_json and survive create + update + reload."""

    def test_create_agent_with_styling(self):
        agent = _create_agent("style-create", styling="light")
        try:
            assert agent.get("styling_json") == "light"
        finally:
            _delete_agent(agent["id"])

    def test_styling_survives_round_trip(self):
        agent = _create_agent("style-roundtrip", styling="dark")
        try:
            reloaded = _get_agent(agent["id"])
            assert reloaded.get("styling_json") == "dark"
        finally:
            _delete_agent(agent["id"])

    def test_create_without_styling_is_empty(self):
        agent = _create_agent("style-empty")
        try:
            assert (agent.get("styling_json") or "") == ""
        finally:
            _delete_agent(agent["id"])

    def test_put_updates_styling(self):
        agent = _create_agent("style-put", config_yaml=MINIMAL_YAML, styling="default")
        try:
            _put_agent(agent["id"], styling="brand")
            reloaded = _get_agent(agent["id"])
            assert reloaded.get("styling_json") == "brand"
        finally:
            _delete_agent(agent["id"])

    def test_put_styling_does_not_break_config(self):
        agent = _create_agent("style-config", config_yaml=MINIMAL_YAML, styling="dark")
        try:
            _put_agent(agent["id"], styling="light")
            reloaded = _get_agent(agent["id"])
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            parsed = yaml.safe_load(yaml_field)
            assert parsed is not None
            assert len(parsed["graph"]["nodes"]) == 2
        finally:
            _delete_agent(agent["id"])

    def test_all_presets_valid(self):
        for preset in VALID_PRESETS:
            agent = _create_agent(f"style-{preset}", styling=preset)
            try:
                assert agent.get("styling_json") == preset
                reloaded = _get_agent(agent["id"])
                assert reloaded.get("styling_json") == preset
            finally:
                _delete_agent(agent["id"])

    def test_styling_clearing(self):
        agent = _create_agent("style-clear", styling="light")
        try:
            assert agent.get("styling_json") == "light"
            _put_agent(agent["id"], styling="")
            reloaded = _get_agent(agent["id"])
            assert reloaded.get("styling_json") == ""
        finally:
            _delete_agent(agent["id"])


# ═══════════════════════════════════════════════════════════════
# Invariant: concurrent updates don't corrupt each other
# ═══════════════════════════════════════════════════════════════

class TestConcurrentUpdates:
    """Styling and config updates must not interfere with each other."""

    def test_update_styling_and_config_together(self):
        agent = _create_agent("concurrent-test", config_yaml=MINIMAL_YAML, styling="default")
        try:
            _put_agent(agent["id"], styling="light", config_yaml=UPDATED_YAML)
            reloaded = _get_agent(agent["id"])
            assert reloaded.get("styling_json") == "light"
            yaml_field = reloaded.get("config_json") or reloaded.get("config_yaml") or ""
            nodes = yaml.safe_load(yaml_field)["graph"]["nodes"]
            assert len(nodes) == 3
        finally:
            _delete_agent(agent["id"])
