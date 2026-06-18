# Getting Started

Add AI agents to your app in 5 minutes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed
- A [DeepSeek API key](https://platform.deepseek.com/api_keys) (free tier available)

## 1. Clone and Configure

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

## 3. Open the Admin Panel

Go to **http://localhost:5173** — the Agent Management Studio (AMS).

## 4. Create Your First Agent

1. Click the **Agents** tab
2. Fill in: Name = "Support Agent", System Prompt = "You are a helpful support agent. Be concise."
3. Click **Create Agent**
4. Copy the Agent ID that appears in the sidebar

## 5. Test Your Agent

1. Click the **Chat** tab
2. Paste your Agent ID in the header input
3. Type "Hello!" and press Send

## 6. Add Knowledge (RAG)

1. Click the **Contexts** tab
2. Create a context called "FAQ"
3. Paste some knowledge text and click **Ingest & Embed**
4. Go back to the Chat tab — your agent now answers from your knowledge

## 7. Embed in Your App

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
