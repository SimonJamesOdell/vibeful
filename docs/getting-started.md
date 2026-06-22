# Getting Started

Add AI agents to your app in minutes. Two paths — pick the one that fits.

## Prerequisites

- A [DeepSeek API key](https://platform.deepseek.com/api_keys) (free tier available)
- Python 3.12+ and Node.js 22+
- **Docker** is optional — needed only for the full production-like stack

---

## First-Time Setup

Run the setup script. It detects your system, installs missing dependencies, and boots everything.

**Linux / macOS / WSL:**
```bash
git clone https://github.com/SimonJamesOdell/vibeful.git
cd vibeful
bash scripts/setup.sh
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/SimonJamesOdell/vibeful.git
cd vibeful
.\scripts\setup.ps1
```

The script:
- Checks for Python 3.12+ and Node.js 22+
- Creates a Python virtual environment
- Installs all Python and Node.js dependencies
- Prompts for your DeepSeek API key
- Starts the agent engine (REST API) on port 50052
- Starts the management console on port 5174

Open **http://localhost:5174** — the Vibeful Guide greets you there.

## Day-to-Day Development

After the initial setup, use these commands:

```bash
npm run dev        # Start agent engine + console (SQLite, no Docker)
npm run stack      # Start full Docker architecture (PostgreSQL, Redis, Envoy, proxy)
npm run stack:down # Tear down Docker stack
npm run build      # Production builds
npm run test       # Run all tests
```

`npm run dev` starts both the agent engine and management console as child processes. Press Ctrl+C to stop both.

## Docker Stack

For testing the full production-like architecture:

```bash
npm run stack
```

This starts 8 Docker services: PostgreSQL (pgvector), Redis, Envoy (gRPC proxy), agent engine (REST + gRPC), management console, proxy, MCP web search, and SDK dev server.

Open **http://localhost:5174** for the management console — it connects to the agent engine REST API inside Docker.

---

## Design Your First Agent

1. Open the **Management Console** at http://localhost:5174
2. Drag nodes from the **Node Palette** onto the canvas
3. Connect them with edges — start simple: Setup → System Prompt → ReAct Agent → Stream Completion
4. Click any node to edit its **Properties**
5. Give your agent a **name** in the header bar
6. Click **Deploy** to push the config to the agent engine
7. Copy the **Agent ID** that appears

> **Tip:** Use the **AI Assistant** (bottom-right panel) to build agents with natural language: "Add an attack guard at the start" or "add a RAG node after the system prompt."

### Apply Guardrails

**System Prompt (behavioral):** Click the System Prompt node and write your agent's constitution — what it will and won't do.

**Attack Guard (security):** Add an Attack Guard node to detect prompt injection, jailbreak attempts, XSS, and SQLi.

**Token Budget (cost):** Use the Supervisor tab to set per-agent token limits.

## Add Knowledge (RAG)

1. In the Management Console, go to the **Contexts** tab
2. Create a knowledge context and ingest documents
3. Add a **RAG node** to your agent graph — it automatically searches your knowledge

Or via API:

```bash
curl -X POST http://localhost:50052/v1/contexts \
  -H "Content-Type: application/json" \
  -d '{"name":"FAQ","description":"Support knowledge base"}'

curl -X POST http://localhost:50052/v1/contexts/CONTEXT_ID/ingest \
  -H "Content-Type: application/json" \
  -d '{"text":"Your knowledge here","filename":"doc.txt"}'
```

## Enable Analysis Pipeline

Give your agent deeper understanding by adding an **Analysis Pipeline** node before the ReAct Agent. Configure which of the 11 parallel LLM phases to enable — memories, impressions, concepts, intent classification, and more. The Conductor phase dynamically adjusts response temperature based on user state.

## Embed in Your App

```html
<div id="vibeful-chat" style="max-width:400px;height:500px"></div>
<script src="https://cdn.vibeful.ai/sdk/vibeful-sdk.umd.js"></script>
<script>
VibefulSDK.mount({
  target: '#vibeful-chat',
  agentId: 'YOUR_AGENT_ID'
});
</script>
```

Three lines. Your app now has an AI agent.

---

## API Reference

All endpoints are served by the agent engine REST API at `http://localhost:50052/v1/`.

See [docs/api-reference.md](api-reference.md) for the full API reference.
