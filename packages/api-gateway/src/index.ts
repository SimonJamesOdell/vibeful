// API Gateway — REST API
// REST endpoints for agent CRUD, knowledge contexts, content ingestion, and conversation.

import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
app.use(express.json({ limit: '10mb' }));

// CORS — allow the management console and SDK to call the API
app.use((_req: Request, res: Response, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// The agent-engine REST server handles all API calls in local dev mode.
// In Docker production, set PROXY_URL=http://proxy:8000 via environment.
const PROXY_URL = process.env.PROXY_URL || 'http://localhost:50052';

// Serve the Vibeful website as static files (after CORS, before API routes)
app.use(express.static(path.join(__dirname, '..', '..', '..', 'website')));

// ── Health ─────────────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-gateway', phase: 1 });
});

// ── Agents ─────────────────────────────────────────────────────

interface PhaseConfig {
  enabled?: boolean;
  temperature?: number;
}

interface AnalysisConfig {
  enabled?: boolean;
  phases?: {
    memories?: PhaseConfig;
    impressions?: PhaseConfig;
    concepts?: PhaseConfig;
    assumptions?: PhaseConfig;
    intent?: PhaseConfig;
    conductor?: PhaseConfig;
    code_detect?: PhaseConfig;
    search_detect?: PhaseConfig;
    global_memories?: PhaseConfig;
    next?: PhaseConfig;
    search_execute?: PhaseConfig;
    output_routing?: PhaseConfig;
  };
}

interface AgentConfig {
  name: string;
  description?: string;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  personality?: string;
  tone?: string;
  icebreaker?: string;
  policy?: string;
  output_format?: string;
  tools?: string[];
  context_ids?: string[];
  mcp_server_urls?: string[];
  analysis?: AnalysisConfig;
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

// ── Agent Versions ─────────────────────────────────────────────

// GET /v1/agents/:id/versions — list version history
app.get('/v1/agents/:id/versions', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}/versions`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/agents/:id/versions/:vid — get specific version
app.get('/v1/agents/:id/versions/:vid', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}/versions/${req.params.vid}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/agents/:id/versions — save a new version
app.post('/v1/agents/:id/versions', async (req: Request, res: Response) => {
  try {
    const body = req.body as { config?: any; yaml_str?: string; author?: string; change_description?: string; tags?: string[] };
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}/versions`, {
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

// POST /v1/agents/:id/versions/:vid/restore — restore a version
app.post('/v1/agents/:id/versions/:vid/restore', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}/versions/${req.params.vid}/restore`, {
      method: 'POST',
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── A/B Tests ──────────────────────────────────────────────────

// POST /v1/ab-tests — create test
app.post('/v1/ab-tests', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/ab-tests`, {
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

// GET /v1/ab-tests — list tests
app.get('/v1/ab-tests', async (req: Request, res: Response) => {
  try {
    const agentId = req.query.agent_id as string;
    const url = agentId ? `${PROXY_URL}/v1/ab-tests?agent_id=${agentId}` : `${PROXY_URL}/v1/ab-tests`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/ab-tests/:id/start
app.post('/v1/ab-tests/:id/start', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/ab-tests/${req.params.id}/start`, { method: 'POST' });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/ab-tests/:id/stop
app.post('/v1/ab-tests/:id/stop', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/ab-tests/${req.params.id}/stop`, { method: 'POST' });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Performance / Regression ───────────────────────────────────

// GET /v1/agents/:id/performance
app.get('/v1/agents/:id/performance', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}/performance`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /v1/agents/:id/baseline — establish performance baseline
app.post('/v1/agents/:id/baseline', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/agents/${req.params.id}/baseline`, { method: 'POST' });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /v1/ab-tests/:id/results
app.get('/v1/ab-tests/:id/results', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/ab-tests/${req.params.id}/results`);
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

// ── Glyphs ─────────────────────────────────────────────────────

app.get('/v1/glyphs', async (_req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/glyphs`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/v1/glyphs', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/glyphs`, {
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

app.delete('/v1/glyphs/:name', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/glyphs/${req.params.name}`, { method: 'DELETE' });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Concepts ───────────────────────────────────────────────────

app.get('/v1/concepts', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    if (req.query.domain) params.set('domain', req.query.domain as string);
    if (req.query.search) params.set('search', req.query.search as string);
    const qs = params.toString();
    const resp = await fetch(`${PROXY_URL}/v1/concepts${qs ? '?' + qs : ''}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Global Memories ────────────────────────────────────────────

app.get('/v1/global-memories', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    if (req.query.type) params.set('type', req.query.type as string);
    const qs = params.toString();
    const resp = await fetch(`${PROXY_URL}/v1/global-memories${qs ? '?' + qs : ''}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Token Credits ──────────────────────────────────────────────

app.get('/v1/tokens/balance', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    params.set('user_identity', req.query.user_identity as string);
    if (req.query.agent_id) params.set('agent_id', req.query.agent_id as string);
    const resp = await fetch(`${PROXY_URL}/v1/tokens/balance?${params}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/v1/tokens/credit', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/tokens/credit`, {
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

app.get('/v1/tokens/transactions', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    params.set('user_identity', req.query.user_identity as string);
    if (req.query.limit) params.set('limit', req.query.limit as string);
    const resp = await fetch(`${PROXY_URL}/v1/tokens/transactions?${params}`);
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Assist ──────────────────────────────────────────────────

app.post('/v1/ai/assist', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/ai/assist`, {
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

// ── A/B Test Results ───────────────────────────────────────────

app.get('/v1/ab-tests/:id/results', async (req: Request, res: Response) => {
  try {
    const resp = await fetch(`${PROXY_URL}/v1/ab-tests/${req.params.id}/results`);
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
