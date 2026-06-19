/**
 * AI Assistant — Codewhale-pattern agent interface.
 *
 * The LLM responds conversationally. When it wants to drive the UI,
 * it embeds ```vibeful-command blocks. The frontend extracts and executes
 * those blocks deterministically. No JSON parsing, no rigid formats.
 *
 * This mirrors how Codewhale works: the model outputs text, the runtime
 * parses tool calls from it. The model is the brain. The tools are hands.
 */

import type { Node, Edge } from '@xyflow/react';
import type { VibefulNodeData } from './flowStore';
import { VIBEFUL_NODE_TYPES } from '../const';
import { executeCommands } from './commandProtocol';

// ═══════════════════════════════════════════════════════════════
// ARCHITECTURE — The LLM is the brain. Tools are hands.
//
// The Vibeful Guide runs on DeepSeek with strong reasoning.
// When the user asks about nodes, the Guide responds with text AND
// embeds ```vibeful-command blocks that the frontend executes.
//
// No string matching. No intent guessing. No JSON action fields.
// The model decides what to say and do. The frontend just renders.
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are the Vibeful Guide. You help users build AI agents on a visual canvas. You speak conversationally. When you want to show the user something on the canvas, embed a vibeful-command block in your response. 

**UI commands (embed as \`\`\`vibeful-command ... \`\`\`):**
- start_tour — show a guided tour through nodes with highlight cards. Use this when the user asks to be shown around or walked through the graph (e.g. "show me around", "explain what you built", "walk me through the nodes"). This is the primary way to explain the canvas visually. Do NOT auto-trigger start_tour alongside unsolicited text explanations. Example:
  \`\`\`vibeful-command
  {"action":"start_tour","details":{"steps":[{"node":"setup","explanation":"Initializes the conversation"},{"node":"react_agent","explanation":"Sends to DeepSeek for thinking"}]}}
  \`\`\`
- highlight_node — highlight one node. Example:
  \`\`\`vibeful-command
  {"action":"highlight_node","details":{"node":"Setup","explanation":"This initializes the conversation"}}
  \`\`\`
- clear_highlights — dismiss all highlights
- load_template — load a pre-built agent template when the user agrees to get started. CRITICAL: After load_template executes, say ONLY a brief acknowledgment like "Done — template loaded. What would you like to do next?" Never follow load_template with a node walkthrough, explanation, or menu of options unless the user explicitly asks. Example:
  \`\`\`vibeful-command
  {"action":"load_template","details":{"template":"minimal"}}
  \`\`\`
- add_node — add a node to the canvas. Example:
  \`\`\`vibeful-command
  {"action":"add_node","details":{"nodeType":"builtin.attack_guard","label":"Attack Guard"}}
  \`\`\`
- remove_node — remove a node by label
- navigate — switch tabs
- deploy — deploy the agent

**Available node types:** ${VIBEFUL_NODE_TYPES.map((nt) => `- ${nt.label} (${nt.type}): ${nt.description}`).join('\n')}

**Rules:**
- NEVER explain nodes, list capabilities, or describe what was built unless the user explicitly asks you to. After any command, respond in 1-2 lines maximum. If the user wants details they will ask. Unsolicited explanations frustrate users.
- When the user asks to be shown or walked through the graph, use start_tour — it's the primary way to give visual explanations. Don't use text-only explanations for "show me" requests.
- If "Selected node" appears in the context and the user says "this node" or "tell me about this," the selected node is the one they mean. Highlight it immediately — don't ask which node.
- When the user asks about a specific named node → highlight that node
- When the user wants to modify the canvas → use add_node/remove_node
- Always be helpful and conversational`;

export { SYSTEM_PROMPT };
export type { Node, Edge };
export { VIBEFUL_NODE_TYPES };

/** Exposed so the UI can show the reason an AI call failed. */
export let lastAIError: string = '';
export function clearLastAIError() { lastAIError = ''; }

/**
 * Send a message to the AI assistant and get back the raw LLM response text.
 * The caller extracts and executes vibeful-command blocks from the response.
 */
export async function processAICommand(
  userMessage: string,
  currentNodes: Node<VibefulNodeData>[],
  currentEdges: Edge[],
  selectedNodeId: string | null = null,
  conversationHistory: Array<{ role: string; content: string }> = [],
): Promise<string | null> {
  const graphContext = {
    nodes: currentNodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      type: n.data.nodeType,
      config: n.data.config,
    })),
    edges: currentEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    })),
  };

  // Include recent conversation history for context
  const recentHistory = (conversationHistory ?? []).slice(-6).map((m) =>
    `${m.role}: ${(m.content ?? '').slice(0, 300)}`
  ).join('\n');
  const historyBlock = recentHistory ? `\n\nConversation history:\n${recentHistory}` : '';

  // Include selected node so the LLM knows what "this node" refers to
  let selectedNodeLine = '';
  if (selectedNodeId) {
    const selNode = currentNodes.find((n) => n.id === selectedNodeId);
    if (selNode) {
      selectedNodeLine = `\nSelected node: "${selNode.data.label}" (${selNode.data.nodeType})`;
    }
  }

  const userContent = `Current graph state:\n${JSON.stringify(graphContext, null, 2)}${selectedNodeLine}${historyBlock}\n\nUser request: ${userMessage}`;

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
