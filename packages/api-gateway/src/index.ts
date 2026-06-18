// API Gateway — REST API
// REST endpoints for agent CRUD, knowledge contexts, content ingestion, and conversation.

import express from 'express';
import type { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '10mb' }));

// DB module — Python database.py via child process
// In production, this would share the same PostgreSQL connection pool.
// The Python agent-engine owns the DB schema; the gateway
// calls it via HTTP to the proxy, which routes to the agent engine.
const AGENT_ENGINE_URL = process.env.AGENT_ENGINE_URL || 'agent-engine:50051';
const PROXY_URL = process.env.PROXY_URL || 'http://proxy:8000';

// ── Health ─────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', phase: 1 });
});

// ── Agents ─────────────────────────────────────────────────────

interface AgentConfig {
  name: string;
  description?: string;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  personality?: string;
  tone?: string;
  icebreaker?: string;
  policy?: string;
  output_format?: string;
  tools?: string[];
  context_ids?: string[];
  mcp_server_urls?: string[];
}

// POST /v1/agents — create agent
app.post('/v1/agents', async (req: Request, res: Response) => {
  try {
    const body = req.body as AgentConfig;
    if (!body.name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const resp = await fetch(`${PROXY_URL}/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/agents — list agents
app.get('/v1/agents', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/agents/:id — get agent
app.get('/v1/agents/:id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /v1/agents/:id — update agent
app.put('/v1/agents/:id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /v1/agents/:id — delete agent
app.delete('/v1/agents/:id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}`, {
      method: 'DELETE',
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Knowledge Contexts ─────────────────────────────────────────

// POST /v1/contexts — create context
app.post('/v1/contexts', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/contexts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/contexts — list contexts
app.get('/v1/contexts', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/contexts`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/contexts/:id — get context
app.get('/v1/contexts/:id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/contexts/${req.params.id}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/contexts/:id/ingest — ingest text into context
app.post('/v1/contexts/:id/ingest', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/contexts/${req.params.id}/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Sessions ───────────────────────────────────────────────────

// POST /v1/sessions — create session
app.post('/v1/sessions', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/sessions/:id/converse — send message to agent
app.post('/v1/sessions/:id/converse', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/sessions/${req.params.id}/converse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/sessions/:id — get session
app.get('/v1/sessions/:id', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/sessions/${req.params.id}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[api-gateway] listening on :${PORT}`);
  console.log(`[api-gateway] Proxying to ${PROXY_URL}`);
});
