# Getting Started

Add AI agents to your app in 5 minutes. Two paths — pick the one that fits.

## Prerequisites

- A [DeepSeek API key](https://platform.deepseek.com/api_keys) (free tier available)
- **Path A (Docker):** [Docker](https://docs.docker.com/get-docker/) — recommended for production
- **Path B (Local):** Python 3.12+ and Node.js 22+ — fastest for development

---

## Path A: Docker (Recommended for Production)

### 1. Clone and start

```bash
git clone https://github.com/vibeful/vibeful.git
cd vibeful
cp .env.example .env
```

Edit `.env` and add your DeepSeek API key:
```
DEEPSEEK_API_KEY=sk-your-key-here
```

## 2. Start Vibeful

```bash
docker compose up -d
```

This starts 10 services: PostgreSQL, Redis, Agent Engine, Proxy, API Gateway, 3 MCP servers, SDK dev server, and Envoy. First run downloads images (~2 min).

## 3. Open the Management Console

Go to **http://localhost:5174** — the Vibeful Management Console.

This is a visual agent design tool where you can drag-and-drop agent graph nodes, configure the analysis pipeline, manage versions, run A/B tests, and monitor performance — all from a React Flow canvas.

## 4. Design Your First Agent

1. Drag nodes from the **Node Palette** onto the canvas (start with Setup → System Prompt → ReAct Agent → Stream Completion)
2. Click any node to edit its **Properties** (e.g., set `max_iterations` on ReAct Agent)
3. Give your agent a **name** in the header bar
4. See the **YAML Preview** panel update in real-time
5. Click **Deploy** to push the config to the agent engine
6. Copy the **Agent ID** that appears

> **Tip:** Use the **AI Assistant** (wand button, bottom-right) to build agents with natural language: "Add an attack guard at the start" or "Enable impressions analysis."

## 5. Test Your Agent

```bash
curl -X POST http://localhost:3000/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"YOUR_AGENT_ID"}'

curl -X POST http://localhost:3000/v1/sessions/SESSION_ID/converse \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello!"}'
```

## 6. Enable Analysis Pipeline

Give your agent deeper understanding by enabling the analysis pipeline:

1. In the Management Console, add an **Analysis Pipeline** node before the ReAct Agent
2. Configure which phases to enable (memories, impressions, intent classification, etc.)
3. The **Conductor** phase dynamically adjusts response temperature based on user state

Or via API — add to your agent config:

```json
{
  "analysis": {
    "enabled": true,
    "phases": {
      "impressions": { "enabled": true, "temperature": 0.5 },
      "conductor": { "enabled": true, "temperature": 0.5 }
    }
  }
}
```

## 7. Add Knowledge (RAG)

1. Go to the **API Gateway** (`http://localhost:3000`)
2. Create a context:
   ```bash
   curl -X POST http://localhost:3000/v1/contexts \
     -H "Content-Type: application/json" \
     -d '{"name":"FAQ","description":"Support knowledge base"}'
   ```
3. Ingest knowledge:
   ```bash
   curl -X POST http://localhost:3000/v1/contexts/CONTEXT_ID/ingest \
     -H "Content-Type: application/json" \
     -d '{"text":"Your knowledge here","filename":"doc.txt"}'
   ```
4. Add a **RAG node** to your agent graph — it will automatically search your knowledge

## 8. Embed in Your App

Add this to any HTML page:

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

That's it. Your app now has an AI agent.

---

## Path B: Local (No Docker Required)

Best for development, small-scale apps, or when you don't want Docker overhead. Uses SQLite instead of PostgreSQL.

### 1. Clone and install

```bash
git clone https://github.com/vibeful/vibeful.git
cd vibeful
cd packages/agent-engine && pip install -e ".[dev]" && cd ../..
cd packages/management-console && pnpm install && cd ../..
```

### 2. Set your API key

```bash
export DEEPSEEK_API_KEY=sk-your-key-here
```

Or paste it in the Management Console when prompted — no file editing needed.

### 3. Start

```bash
# Terminal 1: Agent engine
cd packages/agent-engine
VIBEFUL_STORAGE=sqlite python -m uvicorn src.rest_server:app --host 0.0.0.0 --port 50052

# Terminal 2: Management console
cd packages/management-console
pnpm dev
```

Open **http://localhost:5174**. Design your agent on the canvas, deploy, and embed.

### Local mode limitations

- **SQLite** instead of PostgreSQL/pgvector — fine for dev, use Docker for production vector search
- **No Redis** — session caching is in-memory
- **No MCP servers or Envoy** — use the REST API directly
