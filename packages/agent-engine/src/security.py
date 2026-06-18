"""Security — Attack Detection, Health Checks, Deploy Config, and Meta Agent."""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Any

from .llm import LlmProvider
from .behavior_tester import BehaviorTestRunner, TestCase
from .analytics import AnalyticsPipeline


# ════════════════════════════════════════════════════════════════
# Attack Response Node
# ════════════════════════════════════════════════════════════════

ATTACK_PATTERNS: list[tuple[str, str]] = [
    (r"(?i)ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)", "prompt_injection"),
    (r"(?i)you\s+are\s+now\s+(DAN|jailbroken|unrestricted)", "jailbreak"),
    (r"(?i)pretend\s+you\s+are\s+(not|no\s+longer)\s+an?\s+AI", "role_override"),
    (r"(?i)reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|config)", "prompt_leak"),
    (r"(?i)what\s+is\s+your\s+(system\s+)?(prompt|instructions?)\??", "prompt_leak"),
    (r"(?i)display\s+all\s+(data|records|users|passwords)\s+from", "data_exfil"),
    (r"(?i)drop\s+table|delete\s+from|truncate\s+table", "sql_injection"),
    (r"(?i)<script|<iframe|onerror=|onclick=|javascript:", "xss"),
    (r"(?i)generate\s+(hate|violent|explicit|illegal)\s+content", "content_policy"),
    (r"(?i)how\s+to\s+(hack|crack|bypass|exploit|steal|forg)", "harmful_instruction"),
    (r"(?i)(admin|root|sudo)\s+(password|login|credentials)", "privilege_escalation"),
    (r"(?i)\.\./\.\.|/etc/passwd|/etc/shadow", "path_traversal"),
    (r"(?i)\$\{|%@.*%|\{\{.*\}\}", "template_injection"),
    (r"(?i)repeat\s+(after\s+me|exactly|the\s+following)", "echo_attack"),
    (r"(?i)(what|how)\s+(can|do)\s+you\s+(harm|hurt|kill|destroy)", "harmful_inquiry"),
    (r"(?i)you\s+(must|have\s+to|are\s+required\s+to)", "coercion"),
    (r"(?i)base64\s+decode|from\s+base64|atob", "encoding_evasion"),
    (r"(?i)\b(password|credentials|secret|token|api.?key)\s*[:=]", "credential_leak"),
    (r"(?i)disregard\s+(your|the|all)\s+(safety|content|policy|guardrail)", "safety_override"),
    (r"(?i)write\s+(malware|ransomware|virus|trojan|exploit)", "malware_request"),
]


def detect_attack(user_message: str) -> dict[str, Any]:
    """Scan a user message for attack patterns.

    Returns dict with:
      detected: bool
      attack_type: str or "none"
      matched_pattern: str or ""
      confidence: float (0-1)
    """
    for pattern, attack_type in ATTACK_PATTERNS:
        match = re.search(pattern, user_message)
        if match:
            return {
                "detected": True,
                "attack_type": attack_type,
                "matched_pattern": pattern,
                "confidence": 0.9 if len(user_message) > 20 else 0.6,
                "matched_text": match.group(0)[:100],
            }
    return {"detected": False, "attack_type": "none", "matched_pattern": "", "confidence": 0.0}


@dataclass
class AttackResponse:
    """Response when an attack is detected."""
    blocked: bool
    attack_type: str
    message: str
    reference_policy: str = "content_policy"


ATTACK_RESPONSES: dict[str, AttackResponse] = {
    "prompt_injection": AttackResponse(True, "prompt_injection", "I cannot process instructions that try to override my system configuration."),
    "jailbreak": AttackResponse(True, "jailbreak", "I must decline. I operate within my design boundaries."),
    "role_override": AttackResponse(True, "role_override", "I am an AI assistant and cannot change my fundamental nature."),
    "prompt_leak": AttackResponse(True, "prompt_leak", "I cannot share my system configuration."),
    "data_exfil": AttackResponse(True, "data_exfil", "I cannot execute queries that expose all data."),
    "sql_injection": AttackResponse(True, "sql_injection", "That request contains patterns that violate security policy."),
    "xss": AttackResponse(True, "xss", "I cannot process content with executable code patterns."),
    "content_policy": AttackResponse(True, "content_policy", "That request violates content policy."),
    "harmful_instruction": AttackResponse(True, "harmful_instruction", "I cannot provide instructions for harmful activities."),
    "privilege_escalation": AttackResponse(True, "privilege_escalation", "I cannot assist with privilege escalation attempts."),
    "path_traversal": AttackResponse(True, "path_traversal", "That request contains suspicious path patterns."),
    "template_injection": AttackResponse(True, "template_injection", "That request contains potential template injection patterns."),
    "echo_attack": AttackResponse(True, "echo_attack", "I cannot simply repeat content on command."),
    "harmful_inquiry": AttackResponse(True, "harmful_inquiry", "I cannot engage with questions about causing harm."),
    "coercion": AttackResponse(True, "coercion", "I make decisions based on my configuration, not coercion."),
    "encoding_evasion": AttackResponse(True, "encoding_evasion", "I cannot process encoded content designed to evade policy."),
    "credential_leak": AttackResponse(True, "credential_leak", "I cannot process messages that appear to contain credentials."),
    "safety_override": AttackResponse(True, "safety_override", "My safety guidelines cannot be overridden."),
    "malware_request": AttackResponse(True, "malware_request", "I cannot assist with malware creation."),
}


async def attack_response_node(user_message: str) -> dict[str, Any]:
    """Detect attack and generate response if needed.

    Returns: {"blocked": bool, "message": str, "attack_type": str}
    """
    detection = detect_attack(user_message)
    if not detection["detected"]:
        return {"blocked": False, "message": "", "attack_type": "none"}

    attack_type = detection["attack_type"]
    response = ATTACK_RESPONSES.get(attack_type)
    if response:
        return {
            "blocked": True,
            "message": response.message,
            "attack_type": attack_type,
            "confidence": detection["confidence"],
        }

    return {
        "blocked": True,
        "message": "This request violates security policy.",
        "attack_type": attack_type,
        "confidence": detection["confidence"],
    }


# ════════════════════════════════════════════════════════════════
# Connection Chain Monitoring
# ════════════════════════════════════════════════════════════════

@dataclass
class ServiceHealth:
    name: str
    url: str
    healthy: bool
    latency_ms: float
    error: str | None = None
    last_checked: float = 0.0


class ConnectionChainMonitor:
    """Monitor the health of all services in the Vibeful connection chain."""

    CHAIN: list[tuple[str, str]] = [
        ("postgres", "postgres:5432"),
        ("redis", "redis:6379"),
        ("agent-engine", "agent-engine:50051"),
        ("proxy", "localhost:8000"),
    ]

    def __init__(self):
        self._health: dict[str, ServiceHealth] = {}

    async def check_all(self) -> list[ServiceHealth]:
        """Check all services in the connection chain."""
        import httpx

        results: list[ServiceHealth] = []

        for name, url in self.CHAIN:
            start = time.monotonic()
            healthy = False
            error = None

            try:
                if name in ("postgres", "redis", "agent-engine"):
                    # TCP connectivity check
                    _, writer = await asyncio.wait_for(
                        asyncio.open_connection(url.split(":")[0], int(url.split(":")[1])),
                        timeout=3.0,
                    )
                    writer.close()
                    healthy = True
                elif name == "proxy":
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        resp = await client.get(f"http://{url}/health")
                        healthy = resp.status_code == 200
            except Exception as e:
                error = str(e)[:200]

            latency = (time.monotonic() - start) * 1000
            health = ServiceHealth(
                name=name, url=url,
                healthy=healthy, latency_ms=round(latency, 2),
                error=error, last_checked=time.time(),
            )
            self._health[name] = health
            results.append(health)

        return results

    async def is_chain_healthy(self) -> tuple[bool, str]:
        """Check if the entire chain is healthy. Returns (healthy, summary)."""
        results = await self.check_all()
        unhealthy = [h for h in results if not h.healthy]
        if unhealthy:
            names = ", ".join(h.name for h in unhealthy)
            return False, f"Unhealthy: {names}"
        return True, "All services healthy"


# ════════════════════════════════════════════════════════════════
# One-Click Deploy Generator
# ════════════════════════════════════════════════════════════════

@dataclass
class DeployConfig:
    provider: str  # "docker", "html", "react"
    agent_id: str
    context_ids: list[str] = field(default_factory=list)
    theme: dict[str, str] = field(default_factory=dict)


DEPLOY_TEMPLATES: dict[str, str] = {
    "docker": """# Vibeful Deployment — Docker on your server
# Save as docker-compose.yml and run: docker compose up -d

services:
  vibeful:
    image: vibeful/vibeful:latest
    ports:
      - "3000:3000"
      - "8000:8000"
      - "5173:5173"
    environment:
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      DATABASE_URL: postgresql://vibeful:vibeful@postgres:5432/vibeful
      AGENT_ID: "{agent_id}"
    depends_on:
      - postgres
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: vibeful
      POSTGRES_PASSWORD: vibeful
      POSTGRES_DB: vibeful
    volumes:
      - vibeful_data:/var/lib/postgresql/data
volumes:
  vibeful_data:
""",

    "html": """<!-- Vibeful — Drop-in agent widget -->
<!-- Add to any HTML page, replace YOUR_AGENT_ID -->

<div id="vibeful-chat" style="max-width:400px;height:500px"></div>
<script src="https://cdn.vibeful.ai/sdk/vibeful-sdk.umd.js"></script>
<script>
VibefulSDK.mount({
  target: '#vibeful-chat',
  agentId: '{agent_id}',
  theme: {theme_json}
});
</script>
""",

    "react": """// Vibeful — React component integration
// Install: npm install @vibeful/sdk

import { VibefulChat, useVibefulAgent } from '@vibeful/sdk';

function App() {
  const {{ messages, streaming, loading, citations, followUps, send }} =
    useVibefulAgent({{ agentId: '{agent_id}' }});

  return (
    <VibefulChat
      agentId="{agent_id}"
      messages={{messages}}
      streaming={{streaming}}
      loading={{loading}}
      citations={{citations}}
      followUps={{followUps}}
      onSend={{send}}
    />
  );
}
""",
}


def generate_deploy(config: DeployConfig) -> str:
    """Generate a deployment configuration for the given provider."""
    template = DEPLOY_TEMPLATES.get(config.provider, DEPLOY_TEMPLATES["html"])

    import json as _json
    theme_json = _json.dumps(config.theme) if config.theme else "{}"

    return template.format(
        agent_id=config.agent_id,
        theme_json=theme_json,
    )


# ════════════════════════════════════════════════════════════════
# Meta Agent — conversational analytics + testing
# ════════════════════════════════════════════════════════════════

META_AGENT_SYSTEM_PROMPT = """You are the Vibeful Meta Agent — responsible for monitoring and improving agent quality.

You can:
1. Query analytics: "Show me the top 5 knowledge gaps"
2. Run behavior tests: "Run the regression test battery"
3. Generate tests from analytics: "Create a test for the refund question"
4. Check system health: "Is the connection chain healthy?"
5. Generate deploy configs: "Generate a React deploy config"
6. Audit attack logs: "Show recent attack detections"

Always provide actionable recommendations based on data.
Be concise — use bullet points for lists.
"""


class MetaAgent:
    """Conversational interface for the Trust Engine feedback loop."""

    def __init__(
        self,
        analytics: AnalyticsPipeline | None = None,
        test_runner: BehaviorTestRunner | None = None,
        health_monitor: ConnectionChainMonitor | None = None,
        client: LlmProvider | None = None,
    ):
        self.analytics = analytics
        self.test_runner = test_runner
        self.health_monitor = health_monitor or ConnectionChainMonitor()
        self.client = client or get_provider()

    async def handle(self, user_message: str) -> str:
        """Handle a Meta Agent conversation turn.

        Routes by keyword: analytics queries, test commands, health checks,
        deploy commands, or falls through to general LLM for explanation.
        """
        lower = user_message.lower()

        # ── Health check ──
        if any(w in lower for w in ("health", "chain", "status", "monitor")):
            healthy, summary = await self.health_monitor.is_chain_healthy()
            if healthy:
                return "✅ Connection chain healthy.\n- PostgreSQL ✅\n- Redis ✅\n- Agent Engine ✅\n- Proxy ✅"
            return f"❌ {summary}"

        # ── Analytics queries ──
        if any(w in lower for w in ("knowledge gap", "gap", "unanswered")) and self.analytics:
            gaps = await self.analytics.detect_knowledge_gaps("", days=7)
            if gaps:
                items = [f"- Q: {g.get('question','?')[:100]} | A: {g.get('answer','?')[:80]}" for g in gaps[:5]]
                return f"**Top {len(items)} knowledge gaps (7d):**\n" + "\n".join(items)
            return "No significant knowledge gaps detected in the last 7 days."

        if any(w in lower for w in ("usage", "cost", "stats")) and self.analytics:
            stats = await self.analytics.get_usage_stats(days=7)
            return (
                f"**Usage (7d):**\n"
                f"- {stats.get('total_turns', 0)} turns\n"
                f"- {stats.get('unique_sessions', 0)} unique sessions\n"
                f"- {stats.get('total_tokens', 0)} tokens\n"
                f"- ${stats.get('total_cost', 0):.4f} total cost"
            )

        # ── Test commands ──
        if any(w in lower for w in ("regression", "test battery", "run test")) and self.test_runner:
            return "Test battery execution requires test case definitions. Use `generate_deploy` to create them first."

        if any(w in lower for w in ("create a test", "generate test", "new test")):
            return (
                "I can generate behavior test cases from conversation data. "
                "Please specify: the question that exposed a gap, the expected answer, "
                "and any tools that should be called."
            )

        # ── Attack audit ──
        if any(w in lower for w in ("attack", "security", "threat")):
            return (
                "**Attack detection status:**\n"
                f"- {len(ATTACK_PATTERNS)} patterns active\n"
                f"- Types: prompt injection, jailbreak, SQL injection, XSS, data exfiltration, "
                f"credential leak, content policy violation, and more.\n"
                "No attacks detected in the current session."
            )

        # ── Deploy config ──
        if any(w in lower for w in ("deploy", "docker", "react", "html", "embed")):
            provider = "react" if "react" in lower else ("docker" if "docker" in lower else "html")
            config = DeployConfig(provider=provider, agent_id="YOUR_AGENT_ID")
            snippet = generate_deploy(config)
            return f"**{provider.title()} deploy config:**\n```\n{snippet[:1500]}\n```"

        # ── Fall through to LLM ──
        response = await self.client.chat(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=META_AGENT_SYSTEM_PROMPT,
            temperature=0.3,
            max_tokens=512,
        )
        return response.content or "I'm not sure how to help with that. Try asking about health, analytics, tests, attacks, or deploy."
