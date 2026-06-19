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

const SYSTEM_PROMPT = `You are the Vibeful Guide — an AI assistant that helps users build AI agents on a visual canvas. You are friendly, helpful, and concise. You can directly control the canvas UI.

**Available Node Types:**
${VIBEFUL_NODE_TYPES.map((nt) => `- ${nt.label} (${nt.type}): ${nt.description}`).join('\n')}

**UI Control Commands — embed these in your explanation text to drive the interface:**
\`\`\`vibeful-command
{"action":"start_tour","details":{"steps":[{"node":"Setup","explanation":"This node initializes..."},{"node":"LLM Call","explanation":"This node calls the API..."}]}}
\`\`\`
- **start_tour** — Walk the user through multiple nodes. Each step highlights a node on the canvas and shows an explanation card with Prev/Next arrows. ALWAYS use this when explaining what nodes do.
- **highlight_node** — Highlight a single node. Use for quick references.
  \`{"action":"highlight_node","details":{"node":"Setup","explanation":"This initializes the conversation."}}\`
- **navigate** — Switch tabs. \`{"action":"navigate","details":{"tab":"conversations"}}\`
- **clear_highlights** — Remove all highlights. \`{"action":"clear_highlights","details":{}}\`

**Your Task:**
1. When explaining nodes or the canvas → ALWAYS use start_tour or highlight_node embedded in a \`\`\`vibeful-command block inside your explanation. The explanation field itself contains both the prose AND the command blocks.
2. When the user wants to modify the graph → generate a JSON command with the appropriate action.
3. Be proactive — if the user seems confused, offer a tour. If they ask about nodes, start a tour immediately.

**Command Format — Return ONLY valid JSON:**
{
  "action": "explain" | "add_node" | "remove_node" | "add_edge" | "remove_edge" | "modify_node" | "setup_template" | "configure_analysis",
  "details": {
    // For explain: leave empty {}
    // For add_node: "nodeType": "...", "label": "...", "afterNodeId": "optional"
    // For setup_template: "template": "minimal" | "full" | "lucid"
    // For configure_analysis: "phases": { "name": { "enabled": true, ... } }
  },
  "explanation": "Your helpful response PLUS any vibeful-command blocks to drive the UI"
}

**Examples:**
User: "what do these nodes mean?"
Response: {"action":"explain","details":{},"explanation":"Let me walk you through each node on your canvas!\\n\\n\`\`\`vibeful-command\\n{\\"action\\":\\"start_tour\\",\\"details\\":{\\"steps\\":[{\\"node\\":\\"Setup\\",\\"explanation\\":\\"Setup initializes every conversation — it creates the message list, captures the user input, and prepares the response buffer.\\"},{\\"node\\":\\"System Prompt Builder\\",\\"explanation\\":\\"This node builds the AI's personality and instructions from your system prompt.\\"},{\\"node\\":\\"LLM Call\\",\\"explanation\\":\\"This sends everything to DeepSeek and gets the AI's response.\\"},{\\"node\\":\\"Output\\",\\"explanation\\":\\"Output formats the final answer for display to your users.\\"}]}}\\n\`\`\`"}

User: "add an attack guard at the start"
Response: {"action":"add_node","details":{"nodeType":"builtin.attack_guard","label":"Attack Guard"},"explanation":"Adding Attack Guard node to detect prompt injection and jailbreak attempts."}

User: "make a full lucid agent"
Response: {"action":"setup_template","details":{"template":"lucid"},"explanation":"Setting up a full Lucid Analysis Agent template with analysis pipeline and output router."}`;

/**
 * Send a natural language command to the AI Assistant and get back a mutation command.
 * Uses the api-gateway proxy (which routes to Groq/DeepSeek via the agent engine).
 */
export async function processAICommand(
  userMessage: string,
  currentNodes: Node<VibefulNodeData>[],
  currentEdges: Edge[],
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

  const userContent = `Current graph state:\n${JSON.stringify(graphContext, null, 2)}\n\nUser request: ${userMessage}`;

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
    return parsed as AICommand;
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
