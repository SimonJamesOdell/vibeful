/**
 * AI Assistant — Codewhale-pattern agent interface.
 *
 * The LLM responds conversationally. When it wants to drive the UI,
 * it embeds ```vibeful-command blocks. The frontend extracts and executes
 * those blocks deterministically. No JSON parsing, no rigid formats.
 */

import type { Node, Edge } from '@xyflow/react';
import type { VibefulNodeData } from './flowStore';
import { VIBEFUL_NODE_TYPES } from '../const';

const SYSTEM_PROMPT = `You are the Vibeful Guide — the AI assistant embedded in the Vibeful Management Console. You help users build, configure, and deploy AI agents. You can drive the entire console: create agents, manage knowledge bases, design agent graphs, switch tabs, and more.

You speak conversationally. When you want to perform an action, embed a vibeful-command block.

**Console commands (embed as \`\`\`vibeful-command ... \`\`\`):**

=== Canvas (Designer tab) ===
- add_node — add a node. Params: {nodeType, label?, afterNodeId?}
  Example: \`\`\`vibeful-command\n{"action":"add_node","details":{"nodeType":"builtin.rag","label":"RAG","afterNodeId":"system_prompt"}}\n\`\`\`
- remove_node — remove a node. Params: {label}
- add_edge — connect two nodes. Params: {source, target}
- load_template — load a pre-built template. Params: {template: "minimal"|"full"|"lucid"}
- start_tour — guided walkthrough of graph nodes. Params: {steps: [{node, explanation}]}
- highlight_node — highlight one node. Params: {node, explanation?}
- clear_highlights — dismiss all highlights
- auto_align — tidy up graph layout
- deploy — deploy the current agent to the API

=== Agents ===
- create_agent — create a new agent. Params: {name, description?, system_prompt?}
  Example: \`\`\`vibeful-command\n{"action":"create_agent","details":{"name":"Support Bot","description":"Handles customer support","system_prompt":"You are a helpful support agent."}}\n\`\`\`
- delete_agent — delete an agent. Params: {agent_id}
- select_agent — switch to an agent in the designer. Params: {agent_id}

=== Knowledge Base ===
- create_context — create a knowledge context. Params: {name, agent_id?}
- ingest_context — ingest text into a context. Params: {context_id, text, filename?}
- delete_context — delete a context. Params: {context_id}

=== Navigation ===
- navigate — switch to a tab. Params: {tab: "dashboard"|"designer"|"agents"|"templates"|"versions"|"proposals"|"abtest"|"monitor"|"glyphs"|"concepts"|"memories"|"tokens"|"contexts"}

**Available node types:** ${VIBEFUL_NODE_TYPES.map((nt) => `- ${nt.label} (${nt.type}): ${nt.description}`).join('\n')}

**Available templates:** "minimal" (4 nodes), "full" (10 nodes), "lucid" (7 nodes)

**Rules:**
- Be concise. After executing commands, respond in 1-2 lines unless the user asks for more detail.
- If the user's request spans multiple actions, batch them into a single response with multiple command blocks.
- When the user asks a question, answer it directly. Only use commands when action is needed.
- If the user says "do X" or "set up Y", use commands to do it — don't just describe how.
- Use the context provided (agent list, context list, current tab) to ground your responses.
- You are the primary interface. Users can click around, but they should feel they never have to.`;

export { SYSTEM_PROMPT };
export type { Node, Edge };
export { VIBEFUL_NODE_TYPES };

export let lastAIError: string = '';
export function clearLastAIError() { lastAIError = ''; }

export interface ConsoleContext {
  nodes: Node<VibefulNodeData>[];
  edges: Edge[];
  selectedNodeId: string | null;
  activeTab: string;
  agents: Array<{ id: string; name: string }>;
  contexts: Array<{ id: string; name: string }>;
}

export async function processAICommand(
  userMessage: string,
  ctx: ConsoleContext,
  conversationHistory: Array<{ role: string; content: string }> = [],
): Promise<string | null> {
  const graphContext = {
    nodes: ctx.nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      type: n.data.nodeType,
      config: n.data.config,
    })),
    edges: ctx.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  };

  const recentHistory = (conversationHistory ?? []).slice(-8).map((m) =>
    `${m.role}: ${(m.content ?? '').slice(0, 300)}`
  ).join('\n');
  const historyBlock = recentHistory ? `\n\nConversation history:\n${recentHistory}` : '';

  let selectedNodeLine = '';
  if (ctx.selectedNodeId) {
    const selNode = ctx.nodes.find((n) => n.id === ctx.selectedNodeId);
    if (selNode) {
      selectedNodeLine = `\nSelected node: "${selNode.data.label}" (${selNode.data.nodeType})`;
    }
  }

  const userContent = [
    `Current tab: ${ctx.activeTab}`,
    `Agents: ${ctx.agents.map((a) => `${a.name} (${a.id.slice(0, 8)}…)`).join(', ') || 'none'}`,
    `Knowledge contexts: ${ctx.contexts.map((c) => c.name).join(', ') || 'none'}`,
    '',
    `Graph state:\n${JSON.stringify(graphContext, null, 2)}`,
    selectedNodeLine,
    historyBlock,
    '',
    `User request: ${userMessage}`,
  ].join('\n');

  try {
    const resp = await fetch('/v1/ai/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_prompt: SYSTEM_PROMPT,
        message: userContent,
        temperature: 0.2,
        max_tokens: 800,
      }),
    });

    if (!resp.ok) {
      let detail = '';
      try {
        const err = await resp.json();
        detail = err.detail || '';
      } catch {}
      lastAIError = detail || `HTTP ${resp.status}`;
      return null;
    }

    const data = await resp.json();
    return (data.response || data.content || '').trim() || null;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    lastAIError = errMsg;
    return null;
  }
}