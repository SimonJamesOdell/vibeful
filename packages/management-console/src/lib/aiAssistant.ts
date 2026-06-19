/**
 * AI Assistant — Natural language commands to modify Vibeful agent graphs.
 *
 * Adapted from lsml-composer/server/aiAssistant.ts.
 * Uses Vibeful's existing LLM provider abstraction via the api-gateway proxy.
 */

import type { Node, Edge } from '@xyflow/react';
import type { VibefulNodeData } from './flowStore';
import { VIBEFUL_NODE_TYPES } from '../const';

export interface AICommand {
  action: 'add_node' | 'remove_node' | 'add_edge' | 'remove_edge' | 'modify_node' | 'setup_template' | 'configure_analysis' | 'explain';
  details: Record<string, unknown>;
  explanation: string;
}

// ═══════════════════════════════════════════════════════════════
// ARCHITECTURE PRINCIPLE — This is the LLM's instruction set.
//
// The Vibeful Guide runs on DeepSeek with a massive context window
// and strong reasoning. It is the semantic brain of the system.
// The frontend is hands — deterministic tools (start_tour, add_node,
// navigate) that execute the LLM's intent but never interpret user
// input themselves.
//
// When users ask open-ended questions ("what do these nodes mean?",
// "how do I add RAG?"), the LLM receives the full graph context,
// reasons about the user's goal, and responds with explain actions
// that embed UI-driving commands. No string matching. No guessing.
// ═══════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `CRITICAL — Decide action before responding. Read the user's message and the graph state. Ask yourself: "Is the user trying to LEARN something, or CHANGE something?"

QUESTION → action: "explain"
  — "what", "how", "why", "explain", "tell me", "describe", "show me", "?"
  — Embed start_tour (multiple nodes) or highlight_node (single node) in a vibeful-command block

COMMAND → action: the appropriate graph modification
  — "add", "remove", "connect", "delete", "make", "create", "deploy"
  — Use add_node / remove_node / setup_template / configure_analysis

When uncertain: use "explain".

**Node types on canvas:** ${VIBEFUL_NODE_TYPES.map((nt) => `- ${nt.label} (${nt.type}): ${nt.description}`).join('\n')}

**UI commands (embed in explanation as \`\`\`vibeful-command ... \`\`\` blocks):**
- start_tour  — highlight each node in sequence with step-through cards
- highlight_node — highlight one node by label  (details: node, explanation)
- clear_highlights — dismiss all highlights
- navigate — switch tabs

**JSON response format (return ONLY this):**
{"action":"explain"|"add_node"|"remove_node"|"add_edge"|"remove_edge"|"modify_node"|"setup_template"|"configure_analysis","details":{},"explanation":"text + vibeful-command blocks"}

**Examples:**
"What do these nodes mean?" → {"action":"explain","details":{},"explanation":"Let me walk through your nodes!\\n\\n\`\`\`vibeful-command\\n{\\"action\\":\\"start_tour\\",\\"details\\":{\\"steps\\":[...]}}\\n\`\`\`"}
"What does the pipeline do?" → {"action":"explain","details":{},"explanation":"The pipeline runs analysis phases...\\n\\n\`\`\`vibeful-command\\n{\\"action\\":\\"highlight_node\\",\\"details\\":{\\"node\\":\\"Analysis Pipeline\\",\\"explanation\\":\\"8 parallel phases...\\"}}\\n\`\`\`"}
"Add an attack guard" → {"action":"add_node","details":{"nodeType":"builtin.attack_guard","label":"Attack Guard"},"explanation":"Adding Attack Guard node."}`;

/**
 * Send a natural language command to the AI Assistant and get back a mutation command.
 * Uses the api-gateway proxy (which routes to Groq/DeepSeek via the agent engine).
 */
export async function processAICommand(
  userMessage: string,
  currentNodes: Node<VibefulNodeData>[],
  currentEdges: Edge[],
  conversationHistory: Array<{ role: string; content: string }> = [],
): Promise<AICommand | null> {
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

  // Include recent conversation history for context (last 6 messages)
  const recentHistory = conversationHistory.slice(-6).map((m) =>
    `${m.role}: ${m.content.slice(0, 300)}`
  ).join('\n');
  const historyBlock = recentHistory ? `\n\nConversation history:\n${recentHistory}` : '';

  const userContent = `Current graph state:\n${JSON.stringify(graphContext, null, 2)}${historyBlock}\n\nUser request: ${userMessage}`;

  try {
    const resp = await fetch('/v1/ai/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_prompt: SYSTEM_PROMPT,
        message: userContent,
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!resp.ok) {
      // Try to extract error detail from 503 response
      let detail = '';
      try {
        const err = await resp.json();
        detail = err.detail || '';
      } catch {}
      // Fallback: call agent engine REST directly, passing detail
      return await fallbackAI(SYSTEM_PROMPT, userContent, detail);
    }

    const data = await resp.json();
    const content = data.response || data.content || '';
    let result = parseAIResponse(content);

    // If the LLM responded conversationally (not JSON), wrap it as an explain command
    if (!result && content.trim()) {
      result = {
        action: 'explain',
        details: {},
        explanation: content.trim(),
      };
    }

    // Intent guard: if the user clearly asked a question but the LLM returned
    // a non-explain action, override to explain. Catches mistakes like
    // "setup_template" or "add_node" when the user said "explain what..."
    if (result && result.action !== 'explain') {
      const questionWords = /\b(what|explain|how|why|who|where|when|which|tell me about|describe|walk me through|show me|\?)\b/i;
      if (questionWords.test(userMessage)) {
        console.warn('[Vibeful] INTENT GUARD FIRED — LLM returned', result.action, 'but user message contains question words. Overriding to explain.');

        // Build a start_tour from the actual nodes on the canvas
        const tourSteps = currentNodes.map((n) => ({
          node: n.data.label as string,
          explanation: n.data.nodeType
            ? `${n.data.label} (${n.data.nodeType.replace('builtin.', '')})`
            : n.data.label as string,
        }));
        const tourCmd = `\`\`\`vibeful-command\n${JSON.stringify({ action: 'start_tour', details: { steps: tourSteps } })}\n\`\`\``;

        // Combine the LLM's text with an interactive tour
        const llmText = result.explanation || content.trim();
        result = {
          action: 'explain',
          details: {},
          explanation: `⚡ INTENT GUARD ACTIVATED ⚡ The LLM returned "${result.action}" but your message was clearly a question.\n\nLet me walk you through each node on your canvas! Use the arrows below to step through.\n\n${tourCmd}\n\n${llmText}`,
        };
      }
    }

    return result;
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return await fallbackAI(SYSTEM_PROMPT, userContent, errMsg);
  }
}

async function fallbackAI(systemPrompt: string, userContent: string, _lastError?: string): Promise<AICommand | null> {
  // Store the last error for the caller to read (module-level)
  lastAIError = _lastError || lastAIError;
  try {
    const resp = await fetch('http://localhost:50052/converse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userContent,
        system_prompt: systemPrompt,
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data.response || data.content || '';
    return parseAIResponse(content);
  } catch {
    return null;
  }
}

/** Exposed so the UI can show the reason an AI call failed. */
export let lastAIError: string = '';
export function clearLastAIError() { lastAIError = ''; }

function parseAIResponse(content: string): AICommand | null {
  try {
    // Strip any markdown code fences
    let json = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();

    // Find the first { and last }
    const start = json.indexOf('{');
    const end = json.lastIndexOf('}');
    if (start >= 0 && end > start) {
      json = json.slice(start, end + 1);
    }

    const parsed = JSON.parse(json);
    if (!parsed.action || !parsed.details) return null;
    // Ensure explanation is never undefined — some callers dereference it directly
    return { ...parsed, explanation: parsed.explanation || '' } as AICommand;
  } catch {
    return null;
  }
}

/**
 * Apply an AI command to the flow store state.
 * Returns updated nodes and edges.
 */
export function applyAICommand(
  command: AICommand,
  nodes: Node<VibefulNodeData>[],
  edges: Edge[],
): { nodes: Node<VibefulNodeData>[]; edges: Edge[] } | null {
  let newNodes = [...nodes];
  let newEdges = [...edges];
  let idCounter = 0;
  const makeId = () => `ai_node_${Date.now()}_${++idCounter}`;

  switch (command.action) {
    case 'add_node': {
      const details = command.details as {
        nodeType: string;
        label: string;
        afterNodeId?: string;
      };
      const nodeTypeInfo = VIBEFUL_NODE_TYPES.find((nt) => nt.type === details.nodeType);
      const label = details.label || nodeTypeInfo?.label || 'New Node';
      const id = makeId();

      // Position: after specified node, or at end
      let y = newNodes.length * 120 + 50;
      if (details.afterNodeId) {
        const afterNode = newNodes.find((n) => n.id === details.afterNodeId || n.data.label === details.afterNodeId);
        if (afterNode) {
          y = afterNode.position.y + 120;
        }
      }

      const newNode: Node<VibefulNodeData> = {
        id,
        type: 'vibefulNode',
        position: { x: 250, y },
        data: {
          label,
          nodeType: details.nodeType,
          config: nodeTypeInfo?.defaultConfig || {},
        },
      };

      // If placed after a specific node, auto-connect
      if (details.afterNodeId) {
        const afterNode = newNodes.find((n) => n.id === details.afterNodeId || n.data.label === details.afterNodeId);
        if (afterNode) {
          // Shift downstream nodes down
          const downstreamNodes = getDownstreamNodes(afterNode.id, newNodes, newEdges);
          for (const dn of downstreamNodes) {
            dn.position = { ...dn.position, y: dn.position.y + 120 };
          }
          newEdges.push({
            id: `ai_edge_${afterNode.id}_${id}`,
            source: afterNode.id,
            target: id,
          });
        }
      }

      newNodes.push(newNode);
      break;
    }

    case 'remove_node': {
      const { nodeId } = command.details as { nodeId: string };
      const node = newNodes.find((n) => n.id === nodeId || n.data.label === nodeId);
      if (node) {
        newNodes = newNodes.filter((n) => n.id !== node.id);
        newEdges = newEdges.filter(
          (e) => e.source !== node.id && e.target !== node.id
        );
      }
      break;
    }

    case 'add_edge': {
      const { sourceNodeId, targetNodeId } = command.details as {
        sourceNodeId: string;
        targetNodeId: string;
      };
      const source = newNodes.find((n) => n.id === sourceNodeId || n.data.label === sourceNodeId);
      const target = newNodes.find((n) => n.id === targetNodeId || n.data.label === targetNodeId);
      if (source && target) {
        newEdges.push({
          id: `ai_edge_${source.id}_${target.id}`,
          source: source.id,
          target: target.id,
        });
      }
      break;
    }

    case 'modify_node': {
      const { nodeId, updates } = command.details as {
        nodeId: string;
        updates: { label?: string; config?: Record<string, unknown> };
      };
      newNodes = newNodes.map((n) => {
        if (n.id === nodeId || n.data.label === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              label: updates.label || n.data.label,
              config: updates.config ? { ...n.data.config, ...updates.config } : n.data.config,
            },
          };
        }
        return n;
      });
      break;
    }

    case 'setup_template': {
      // Template setup is handled by the App component
      // Return null to signal the App should handle this
      return null;
    }

    case 'configure_analysis': {
      // Analysis config is handled by the App component
      // Return null to signal the App should handle this
      return null;
    }

    default:
      return null;
  }

  return { nodes: newNodes, edges: newEdges };
}

function getDownstreamNodes(
  startNodeId: string,
  nodes: Node<VibefulNodeData>[],
  edges: Edge[],
): Node<VibefulNodeData>[] {
  const visited = new Set<string>();
  const result: Node<VibefulNodeData>[] = [];
  const queue = [startNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const targets = edges
      .filter((e) => e.source === currentId)
      .map((e) => e.target);

    for (const targetId of targets) {
      const targetNode = nodes.find((n) => n.id === targetId);
      if (targetNode && !visited.has(targetId)) {
        result.push(targetNode);
        queue.push(targetId);
      }
    }
  }

  return result;
}
