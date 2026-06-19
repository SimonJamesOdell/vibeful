"""Smoke test — verifies the full Vibeful REST API works end-to-end.

Runs against a live agent engine REST server (:50052).
Uses SQLite backend — no Docker or PostgreSQL required.

Usage:
    # Start the server first:
    cd packages/agent-engine
    VIBEFUL_STORAGE=sqlite python -m uvicorn src.rest_server:app --host 127.0.0.1 --port 50052

    # Then run the smoke test:
    python tests/smoke_test.py
"""

from __future__ import annotations

import json
import sys
import httpx

BASE = "http://127.0.0.1:50052"
PASSED = 0
FAILED = 0


def check(name: str, fn):
    global PASSED, FAILED
    try:
        fn()
        PASSED += 1
        print(f"  PASS {name}")
    except Exception as e:
        FAILED += 1
        print(f"  FAIL {name} — {e}")


async def main():
    print("Vibeful Smoke Test\n")

    async with httpx.AsyncClient(timeout=10.0) as client:
        agent_id = None

        # ── Health ──────────────────────────────────────────
        def health():
            r = httpx.get(f"{BASE}/health")
            assert r.status_code == 200
            assert r.json()["status"] == "ok"
        check("Health", health)

        # ── Health Config ───────────────────────────────────
        def health_config():
            r = httpx.get(f"{BASE}/v1/health/config")
            assert r.status_code == 200
            data = r.json()
            assert "needs_setup" in data
            print(f"      needs_setup={data['needs_setup']}")
        check("Health config", health_config)

        # ── Setup API Key ───────────────────────────────────
        def setup_key():
            r = httpx.post(f"{BASE}/v1/setup/api-key",
                           json={"api_key": "sk-test-smoke-verification"})
            assert r.status_code == 200
            assert r.json()["configured"] is True
        check("Setup API key", setup_key)

        # ── Health Config After Setup ───────────────────────
        def health_config_after():
            r = httpx.get(f"{BASE}/v1/health/config")
            assert r.status_code == 200
            assert r.json()["needs_setup"] is False
        check("Health config (after setup)", health_config_after)

        # ── Create Agent ────────────────────────────────────
        def create_agent():
            nonlocal agent_id
            r = httpx.post(f"{BASE}/v1/agents", json={
                "name": "Smoke Test Agent",
                "system_prompt": "Be helpful.",
                "model": "deepseek-chat",
                "temperature": 0.7,
            })
            assert r.status_code == 200
            data = r.json()
            assert "id" in data
            assert data["name"] == "Smoke Test Agent"
            agent_id = data["id"]
            print(f"      agent_id={agent_id}")
        check("Create agent", create_agent)

        # ── List Agents ─────────────────────────────────────
        def list_agents():
            r = httpx.get(f"{BASE}/v1/agents")
            assert r.status_code == 200
            agents = r.json()
            assert isinstance(agents, list)
            assert len(agents) >= 1
        check("List agents", list_agents)

        # ── Get Agent ───────────────────────────────────────
        def get_agent():
            r = httpx.get(f"{BASE}/v1/agents/{agent_id}")
            assert r.status_code == 200
            assert r.json()["name"] == "Smoke Test Agent"
        check("Get agent", get_agent)

        # ── Create Glyph ────────────────────────────────────
        def create_glyph():
            r = httpx.post(f"{BASE}/v1/glyphs", json={
                "name": "smoke-test-glyph",
                "symbol": "🧪",
                "description": "Smoke test glyph",
            })
            assert r.status_code == 200
            assert r.json()["name"] == "smoke-test-glyph"
        check("Create glyph", create_glyph)

        # ── List Glyphs ─────────────────────────────────────
        def list_glyphs():
            r = httpx.get(f"{BASE}/v1/glyphs")
            assert r.status_code == 200
            assert len(r.json().get("glyphs", [])) >= 1
        check("List glyphs", list_glyphs)

        # ── Delete Glyph ────────────────────────────────────
        def delete_glyph():
            r = httpx.delete(f"{BASE}/v1/glyphs/smoke-test-glyph")
            assert r.status_code == 200
            assert r.json()["deleted"] == "smoke-test-glyph"
        check("Delete glyph", delete_glyph)

        # ── Concepts ────────────────────────────────────────
        def concepts():
            r = httpx.get(f"{BASE}/v1/concepts")
            assert r.status_code == 200
            assert "concepts" in r.json()
        check("Concepts", concepts)

        # ── Global Memories ─────────────────────────────────
        def global_memories():
            r = httpx.get(f"{BASE}/v1/global-memories?type=general")
            assert r.status_code == 200
            assert "memories" in r.json()
        check("Global memories", global_memories)

        # ── Token Balance ───────────────────────────────────
        def token_balance():
            r = httpx.get(f"{BASE}/v1/tokens/balance",
                          params={"user_identity": "smoke-user"})
            assert r.status_code == 200
            assert "balance" in r.json()
        check("Token balance", token_balance)

        # ── Token Credit ────────────────────────────────────
        def token_credit():
            r = httpx.post(f"{BASE}/v1/tokens/credit", json={
                "user_identity": "smoke-user",
                "amount": 5000,
            })
            assert r.status_code == 200
            assert r.json()["balance"] >= 5000
        check("Token credit", token_credit)

        # ── Save Agent Version ──────────────────────────────
        def save_version():
            r = httpx.post(f"{BASE}/v1/agents/{agent_id}/versions", json={
                "yaml_str": "name: smoke-test",
                "author": "smoke-test",
                "change_description": "Initial smoke test version",
            })
            assert r.status_code == 200
            assert r.json()["version_number"] == 1
        check("Save agent version", save_version)

        # ── List Agent Versions ─────────────────────────────
        def list_versions():
            r = httpx.get(f"{BASE}/v1/agents/{agent_id}/versions")
            assert r.status_code == 200
            versions = r.json().get("versions", [])
            assert len(versions) >= 1
        check("List agent versions", list_versions)

        # ── Create A/B Test ─────────────────────────────────
        ab_test_id = None

        def create_ab_test():
            nonlocal ab_test_id
            r = httpx.post(f"{BASE}/v1/ab-tests", json={
                "agent_id": agent_id,
                "name": "Smoke AB Test",
                "variant_a_config": {"temp": 0.7},
                "variant_b_config": {"temp": 0.3},
            })
            assert r.status_code == 200
            data = r.json()
            assert data["name"] == "Smoke AB Test"
            ab_test_id = data["id"]
        check("Create A/B test", create_ab_test)

        # ── List A/B Tests ──────────────────────────────────
        def list_ab_tests():
            r = httpx.get(f"{BASE}/v1/ab-tests")
            assert r.status_code == 200
            assert len(r.json().get("tests", [])) >= 1
        check("List A/B tests", list_ab_tests)

        # ── Start A/B Test ──────────────────────────────────
        def start_ab_test():
            r = httpx.post(f"{BASE}/v1/ab-tests/{ab_test_id}/start")
            assert r.status_code == 200
            assert r.json()["status"] == "running"
        check("Start A/B test", start_ab_test)

        # ── A/B Test Results ────────────────────────────────
        def ab_test_results():
            r = httpx.get(f"{BASE}/v1/ab-tests/{ab_test_id}/results")
            assert r.status_code == 200
            assert "results" in r.json()
        check("A/B test results", ab_test_results)

    # ── Summary ────────────────────────────────────────────────
    total = PASSED + FAILED
    print(f"\n{'='*50}")
    print(f"  Smoke Test Complete: {PASSED}/{total} passed")
    if FAILED > 0:
        print(f"  {FAILED} FAILURES")
    print(f"{'='*50}")

    return FAILED


if __name__ == "__main__":
    import asyncio
    failed = asyncio.run(main())
    sys.exit(failed)
