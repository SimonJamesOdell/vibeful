// API Client — manages agent sessions and conversation with the Vibeful proxy

const PROXY_URL = import.meta.env.VITE_PROXY_URL || 'http://localhost:8000';

export interface AgentData {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  personality: string;
  tone: string;
  created_at: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface ConversationChunk {
  state: string;
  text_chunk?: string;
  tool_call?: { call_id: string; name: string; arguments: string };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number };
  error?: string;
  citations?: unknown[];
  follow_up_questions?: string[];
  quick_replies?: unknown[];
}

export class VibefulClient {
  private baseUrl: string;

  constructor(baseUrl = PROXY_URL) {
    this.baseUrl = baseUrl;
  }

  // ── Agents ────────────────────────────────

  async createAgent(data: Partial<AgentData>): Promise<AgentData> {
    const res = await fetch(`${this.baseUrl}/v1/agents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    return res.json();
  }

  async listAgents(): Promise<AgentData[]> {
    const res = await fetch(`${this.baseUrl}/v1/agents`);
    return res.json();
  }

  async getAgent(id: string): Promise<AgentData> {
    const res = await fetch(`${this.baseUrl}/v1/agents/${id}`);
    return res.json();
  }

  async deleteAgent(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/v1/agents/${id}`, { method: 'DELETE' });
  }

  // ── Contexts ──────────────────────────────

  async createContext(name: string, agentId?: string) {
    const res = await fetch(`${this.baseUrl}/v1/contexts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, agent_id: agentId }),
    });
    return res.json();
  }

  async listContexts() {
    const res = await fetch(`${this.baseUrl}/v1/contexts`);
    return res.json();
  }

  async ingestText(contextId: string, text: string, filename = 'upload.txt') {
    const res = await fetch(`${this.baseUrl}/v1/contexts/${contextId}/ingest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, filename }),
    });
    return res.json();
  }

  // ── MCP Servers ────────────────────────────

  async createMcpServer(name: string, url: string, agentId?: string) {
    const res = await fetch(`${this.baseUrl}/v1/mcp-servers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, agent_id: agentId }),
    });
    return res.json();
  }

  async listMcpServers(agentId?: string) {
    const params = agentId ? `?agent_id=${agentId}` : '';
    const res = await fetch(`${this.baseUrl}/v1/mcp-servers${params}`);
    return res.json();
  }

  // ── Sessions ───────────────────────────────

  async createSession(agentId: string, contextIds?: string[], mcpUrls?: string[]) {
    const res = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, context_ids: contextIds, mcp_server_urls: mcpUrls }),
    });
    return res.json();
  }

  async converse(sessionId: string, content: string, toolResults?: unknown[]): Promise<ConversationChunk[]> {
    const res = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}/converse`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, tool_results: toolResults }),
    });
    const data = await res.json();
    return data.chunks || [];
  }
}

export const client = new VibefulClient();
