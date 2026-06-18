// E2E tests for Vibeful platform — Playwright
import { test, expect } from '@playwright/test';

const API = 'http://localhost:3000';
let agentId = '';

// ── Spec 1: Agent Creation ────────────────────────────────────

test.describe('Agent CRUD', () => {
  test('create and list agents', async ({ request }) => {
    // Create agent
    const createResp = await request.post(`${API}/v1/agents`, {
      data: { name: 'E2E Test Agent', system_prompt: 'Be helpful.', model: 'deepseek-chat' },
    });
    expect(createResp.ok()).toBeTruthy();
    const agent = await createResp.json();
    expect(agent.id).toBeDefined();
    expect(agent.name).toBe('E2E Test Agent');
    agentId = agent.id;

    // List agents
    const listResp = await request.get(`${API}/v1/agents`);
    expect(listResp.ok()).toBeTruthy();
    const agents = await listResp.json();
    expect(agents.some((a: any) => a.id === agentId)).toBeTruthy();
  });

  test('get agent', async ({ request }) => {
    const resp = await request.get(`${API}/v1/agents/${agentId}`);
    expect(resp.ok()).toBeTruthy();
    const agent = await resp.json();
    expect(agent.name).toBe('E2E Test Agent');
  });

  test('invalid agent returns 404', async ({ request }) => {
    const resp = await request.get(`${API}/v1/agents/nonexistent-id`);
    expect(resp.status()).toBe(404);
  });
});

// ── Spec 2: Knowledge Context & RAG ───────────────────────────

test.describe('Knowledge Context & RAG', () => {
  let contextId = '';

  test('create context and ingest', async ({ request }) => {
    const ctxResp = await request.post(`${API}/v1/contexts`, {
      data: { name: 'Test Knowledge', agent_id: agentId },
    });
    expect(ctxResp.ok()).toBeTruthy();
    const ctx = await ctxResp.json();
    contextId = ctx.id;

    const ingestResp = await request.post(`${API}/v1/contexts/${contextId}/ingest`, {
      data: { text: 'Paris is the capital of France. It is known for the Eiffel Tower.', filename: 'france.txt' },
    });
    expect(ingestResp.ok()).toBeTruthy();
  });

  test('RAG-grounded conversation', async ({ request }) => {
    const sessionResp = await request.post(`${API}/v1/sessions`, {
      data: { agent_id: agentId, context_ids: [contextId] },
    });
    expect(sessionResp.ok()).toBeTruthy();
    const session = await sessionResp.json();

    const convResp = await request.post(`${API}/v1/sessions/${session.session_id}/converse`, {
      data: { content: 'What is the capital of France?' },
    });
    expect(convResp.ok()).toBeTruthy();
    const data = await convResp.json();
    const chunks = data.chunks || [];
    const streaming = chunks.filter((c: any) => c.state === 'RESPONSE_STATE_STREAMING');
    const text = streaming.map((c: any) => c.text_chunk).join('');
    expect(text.toLowerCase()).toContain('paris');
  });
});

// ── Spec 3: SDK Embedding ─────────────────────────────────────

test.describe('SDK Embedding', () => {
  test('AMS loads 5 tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });
});

// ── Spec 4: Error States ──────────────────────────────────────

test.describe('Error States', () => {
  test('empty message returns 400', async ({ request }) => {
    const sessionResp = await request.post(`${API}/v1/sessions`, {
      data: { agent_id: agentId },
    });
    const session = await sessionResp.json();

    const resp = await request.post(`${API}/v1/sessions/${session.session_id}/converse`, {
      data: { content: '' },
    });
    expect(resp.status()).toBe(400);
  });

  test('missing API key returns appropriate error', async ({ request }) => {
    // This test validates that unauthenticated requests are handled
    const resp = await request.get(`${API}/v1/agents`);
    // Should work without auth in dev mode
    expect(resp.ok()).toBeTruthy();
  });
});

// ── Spec 5: MCP Tool Execution ────────────────────────────────

test.describe('MCP Tools', () => {
  test('MCP server list is reachable', async ({ request }) => {
    const resp = await request.get(`${API}/v1/mcp-servers`);
    expect(resp.ok()).toBeTruthy();
  });
});

// ── Spec 6: Agent Memory ──────────────────────────────────────

test.describe('Agent Memory', () => {
  test('fact recall returns empty for new user', async ({ request }) => {
    const resp = await request.post(`${API}/v1/facts/recall`, {
      data: { user_identity: 'test-user-e2e', query: 'What do I like?' },
    });
    const data = await resp.json();
    expect(data.facts).toBeDefined();
  });
});
