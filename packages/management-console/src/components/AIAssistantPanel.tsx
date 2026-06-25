/**
 * AI Assistant Panel — persistent across all console tabs.
 * The LLM is the brain, the frontend is just hands.
 */

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Brain, X, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { processAICommand, lastAIError, clearLastAIError, type ConsoleContext } from '../lib/aiAssistant';
import {
  executeCommands, stripCommands, registerCommandHandler,
  CONSOLE_COMMANDS, type CommandResult,
} from '../lib/commandProtocol';
import { TEMPLATES } from '../lib/templates';
import { generateYaml } from '../lib/yamlGenerator';
import { applyStylingPreset, saveAgentStyling } from './StylingModal';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  commandResults?: CommandResult[];
}

interface Props {
  agents: Array<{ id: string; name: string }>;
  contexts: Array<{ id: string; name: string }>;
  activeTab: string;
  activeAgentId: string | null;
  onNavigate: (tab: any) => void;
  onAgentsChanged: () => void;
  onContextsChanged: () => void;
}

export default function AIAssistantPanel({ agents, contexts, activeTab, activeAgentId, onNavigate, onAgentsChanged, onContextsChanged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [onboarding, setOnboarding] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentsRef = useRef(agents);
  const contextsRef = useRef(contexts);
  agentsRef.current = agents;
  contextsRef.current = contexts;

  const { nodes, edges, loadGraph, addNode, setAgentName, agentName } = useFlowStore();

  // ── Register ALL command handlers ──────────────────────

  useEffect(() => {
    // Designer commands
    registerCommandHandler(CONSOLE_COMMANDS.ADD_NODE, (details) => {
      const nodeType = details.nodeType as string;
      const label = (details.label as string) || nodeType;
      const afterLabel = details.afterNodeId as string | undefined;
      let position: { x: number; y: number } | undefined = undefined;
      let afterNodeId: string | null = null;
      const existing = useFlowStore.getState().nodes;
      if (afterLabel) {
        const afterNode = existing.find(
          (n) => n.data.label === afterLabel || n.id === afterLabel
        );
        if (afterNode) {
          position = { x: afterNode.position.x, y: afterNode.position.y + 120 };
          afterNodeId = afterNode.id;
        }
      }
      // If no afterNodeId, place below the rightmost existing node
      if (!position && existing.length > 0) {
        const rightmost = existing.reduce((a, b) => a.position.x > b.position.x ? a : b);
        const belowRightmost = existing.filter((n) => n.position.x >= rightmost.position.x - 10);
        const lowest = belowRightmost.reduce((a, b) => a.position.y > b.position.y ? a : b);
        position = { x: rightmost.position.x, y: lowest.position.y + 120 };
      }
      useFlowStore.getState().addNode(nodeType, label, position);
      if (afterNodeId) {
        const state = useFlowStore.getState();
        const newNodeId = state.selectedNodeId;
        if (newNodeId) {
          const outgoingIdx = state.edges.findIndex((e) => e.source === afterNodeId);
          if (outgoingIdx >= 0) {
            const oldTarget = state.edges[outgoingIdx].target;
            const newEdges = state.edges.filter((_, i) => i !== outgoingIdx);
            newEdges.push({ id: `edge_${afterNodeId}_${newNodeId}`, source: afterNodeId, target: newNodeId });
            newEdges.push({ id: `edge_${newNodeId}_${oldTarget}`, source: newNodeId, target: oldTarget });
            useFlowStore.setState({ edges: newEdges });
          } else {
            useFlowStore.setState({ edges: [...state.edges, { id: `edge_${afterNodeId}_${newNodeId}`, source: afterNodeId, target: newNodeId }] });
          }
        }
      }
      return { nodeType, label };
    });

    registerCommandHandler(CONSOLE_COMMANDS.REMOVE_NODE, (details) => {
      const label = (details.label || details.node || details.name) as string;
      const state = useFlowStore.getState();
      const node = state.nodes.find((n) => n.data.label === label || n.id === label);
      if (node) {
        useFlowStore.setState({ nodes: state.nodes.filter((n) => n.id !== node.id), edges: state.edges.filter((e) => e.source !== node.id && e.target !== node.id) });
        return { label };
      }
      throw new Error(`Node '${label}' not found`);
    });

    registerCommandHandler(CONSOLE_COMMANDS.LOAD_TEMPLATE, (details) => {
      const template = details.template as string;
      const tpl = TEMPLATES[template];
      if (!tpl) throw new Error(`Unknown template: "${template}"`);
      const state = useFlowStore.getState();
      state.loadGraph([...tpl.nodes], [...tpl.edges]);
      // Preserve existing agent name — don't overwrite with template default
      if (!state.agentName || state.agentName === 'Unnamed Agent') {
        state.setAgentName(tpl.name);
      }
      setOnboarding(false);
      return { template, nodes: state.nodes.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DEPLOY, (_details) => {
      setAgentName(agentName || 'My Agent');
      window.dispatchEvent(new CustomEvent('vibeful:deploy'));
      return { name: agentName || 'My Agent', nodes: useFlowStore.getState().nodes.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.NAVIGATE, (details) => {
      const tab = details.tab as string;
      onNavigate(tab);
      return { tab };
    });

    registerCommandHandler(CONSOLE_COMMANDS.START_TOUR, (details) => {
      const steps = details.steps as Array<{ node: string; explanation: string }> | undefined;
      if (!steps || steps.length === 0) return { error: 'No tour steps provided' };
      const state = useFlowStore.getState();
      const tourSteps = steps.map((s) => {
        const node = state.nodes.find((n) => n.data.label.toLowerCase() === s.node.toLowerCase() || n.id === s.node);
        return node ? { nodeLabel: node.data.label, explanation: s.explanation } : null;
      }).filter(Boolean) as Array<{ nodeLabel: string; explanation: string }>;
      if (tourSteps.length > 0) {
        state.startTour(tourSteps);
        return { steps: tourSteps.length };
      }
      return { error: 'No matching nodes found on canvas' };
    });

    registerCommandHandler(CONSOLE_COMMANDS.HIGHLIGHT_NODE, (details) => {
      const nodeLabel = (details.node as string).toLowerCase();
      const state = useFlowStore.getState();
      const node = state.nodes.find((n) => n.data.label.toLowerCase() === nodeLabel || n.id === nodeLabel);
      if (node) {
        state.startTour([{ nodeLabel: node.data.label, explanation: (details.explanation as string) || '' }]);
        return { node: nodeLabel };
      }
      return { node: nodeLabel, error: 'Node not found on canvas' };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CLEAR_HIGHLIGHTS, () => {
      useFlowStore.getState().dismissTour();
      return {};
    });

    registerCommandHandler(CONSOLE_COMMANDS.AUTO_ALIGN, () => {
      useFlowStore.getState().autoAlign();
      return {};
    });

    // Agent commands
    registerCommandHandler(CONSOLE_COMMANDS.CREATE_AGENT, async (details) => {
      const name = (details.name as string || '').trim();
      const templateSpecified = details.template as string | undefined;

      // If the user didn't specify a template type, always show the modal.
      // Don't guess from the name — "bob" doesn't tell us anything about
      // what kind of agent the user wants.
      if (!templateSpecified || !['minimal','full','lucid'].includes(templateSpecified)) {
        // Detect a template hint from description or context, but only as a
        // default suggestion in the modal, not a decision.
        const hint = (details.description || details.template || '') as string;
        const suggestedTemplate = /lucid/.test(hint) ? 'lucid'
          : /full|complete/.test(hint) ? 'full'
          : 'minimal';
        window.dispatchEvent(new CustomEvent('vibeful:create-agent-modal', {
          detail: { name: name || undefined, template: suggestedTemplate },
        }));
        return { modal_shown: true, template: suggestedTemplate, name };
      }

      // User explicitly chose a template — create the agent with it
      const tpl = TEMPLATES[templateSpecified];
      if (!tpl) throw new Error(`Unknown template: "${templateSpecified}"`);

      const yaml = generateYaml(tpl.nodes, tpl.edges, name, '');

      const resp = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: details.description || '',
          system_prompt: details.system_prompt || '',
          config_yaml: yaml,
        }),
      });
      if (!resp.ok) throw new Error('Failed to create agent');
      const data = await resp.json();
      onAgentsChanged();
      const state = useFlowStore.getState();
      state.setAgentName(name);
      state.loadGraph([...tpl.nodes], [...tpl.edges]);
      return { id: data.id, name, template: templateSpecified, nodes: tpl.nodes.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DELETE_AGENT, async (details) => {
      let agentId = (details.agent_id || details.id) as string | undefined;
      let name = details.name as string | undefined;
      // If agent_id doesn't look like a UUID, treat it as a name
      if (agentId && !/^[0-9a-f-]{30,}$/i.test(agentId)) {
        name ||= agentId as string;
        agentId = undefined;
      }
      if (!agentId && name) {
        let match = agentsRef.current.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!match && /^[0-9a-f-]+$/i.test(name)) {
          match = agentsRef.current.find((a) => a.id.startsWith(name.toLowerCase()));
        }
        if (!match) throw new Error(`Agent '${name}' not found. Available: ${agentsRef.current.map((a) => a.name).join(', ')}`);
        agentId = match.id;
      }
      if (!agentId) throw new Error('agent_id or name required');
      const resp = await fetch(`/v1/agents/${agentId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete agent');
      onAgentsChanged();
      return { deleted: true, name: name || agentId };
    });

    registerCommandHandler(CONSOLE_COMMANDS.RENAME_AGENT, async (details) => {
      let agentId = (details.agent_id || details.id) as string | undefined;
      let name = details.name as string | undefined;
      const newName = (details.new_name || details.to) as string;
      if (!newName) throw new Error('new_name required');
      if (agentId && !/^[0-9a-f-]{30,}$/i.test(agentId)) {
        name ||= agentId as string;
        agentId = undefined;
      }
      if (!agentId && name) {
        let match = agentsRef.current.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!match && /^[0-9a-f-]+$/i.test(name)) {
          match = agentsRef.current.find((a) => a.id.startsWith(name.toLowerCase()));
        }
        if (!match) throw new Error(`Agent '${name}' not found. Available: ${agentsRef.current.map((a) => a.name).join(', ')}`);
        agentId = match.id;
      }
      if (!agentId) throw new Error('agent_id or name required');
      const resp = await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!resp.ok) throw new Error('Failed to rename agent');
      useFlowStore.getState().setAgentName(newName);
      onAgentsChanged();
      return { renamed: true, from: name || agentId, to: newName };
    });

    registerCommandHandler(CONSOLE_COMMANDS.SELECT_AGENT, async (details) => {
      let agentId = (details.agent_id || details.id) as string | undefined;
      let name = details.name as string | undefined;
      if (agentId && !/^[0-9a-f-]{30,}$/i.test(agentId)) {
        name ||= agentId as string;
        agentId = undefined;
      }
      if (!agentId && name) {
        let match = agentsRef.current.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!match) {
          // Only try ID prefix if input looks like a hex ID fragment (all hex chars)
          if (/^[0-9a-f-]+$/i.test(name)) {
            match = agentsRef.current.find((a) => a.id.startsWith(name.toLowerCase()));
          }
        }
        if (!match) throw new Error(`Agent '${name}' not found. Available: ${agentsRef.current.map((a) => a.name).join(', ')}`);
        agentId = match.id;
      }
      if (!agentId) throw new Error('agent_id or name required');
      onNavigate('designer');
      return { agent_id: agentId, name: name || agentId };
    });

    // Knowledge base commands
    registerCommandHandler(CONSOLE_COMMANDS.CREATE_CONTEXT, async (details) => {
      const name = details.name as string;
      if (!name) throw new Error('name is required');
      const resp = await fetch('/v1/contexts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agent_id: details.agent_id || '' }),
      });
      if (!resp.ok) throw new Error('Failed to create context');
      onContextsChanged();
      return { name };
    });

    registerCommandHandler(CONSOLE_COMMANDS.INGEST_CONTEXT, async (details) => {
      const contextId = details.context_id as string;
      const text = details.text as string;
      if (!contextId || !text) throw new Error('context_id and text required');
      const resp = await fetch(`/v1/contexts/${contextId}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename: details.filename || 'notes.txt' }),
      });
      if (!resp.ok) throw new Error('Failed to ingest');
      return { ingested: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DELETE_CONTEXT, async (details) => {
      const contextId = details.context_id as string;
      if (!contextId) throw new Error('context_id required');
      const resp = await fetch(`/v1/contexts/${contextId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete context');
      onContextsChanged();
      return { deleted: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.TEST_AGENT, () => {
      window.dispatchEvent(new CustomEvent('vibeful:test-agent'));
      return { opened: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.OPEN_KNOWLEDGE, () => {
      window.dispatchEvent(new CustomEvent('vibeful:open-knowledge'));
      return { opened: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.ATTACH_KNOWLEDGE, async (details) => {
      const contextIds = (details.context_ids as string[]) || [];
      const state = useFlowStore.getState();
      // Use the active agent ID from the store or the agentsRef
      const agentId = activeAgentId || '';
      if (!agentId) throw new Error('No agent selected');
      const resp = await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_ids: contextIds }),
      });
      if (!resp.ok) throw new Error('Failed to attach knowledge');
      window.dispatchEvent(new CustomEvent('vibeful:open-knowledge'));
      onContextsChanged();
      return { attached: contextIds.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DETACH_KNOWLEDGE, async (details) => {
      const contextId = details.context_id as string;
      if (!contextId) throw new Error('context_id required');
      const agentId = activeAgentId || '';
      if (!agentId) throw new Error('No agent selected');
      // Get current context_ids, remove the one to detach
      const resp = await fetch(`/v1/agents/${agentId}`);
      const agent = await resp.json();
      const currentIds = (agent.context_ids || []) as string[];
      const newIds = currentIds.filter((id: string) => id !== contextId);
      const updateResp = await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_ids: newIds }),
      });
      if (!updateResp.ok) throw new Error('Failed to detach knowledge');
      onContextsChanged();
      return { detached: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.ADD_EDGE, (details) => {
      const sourceLabel = (details.source as string || '').toLowerCase();
      const targetLabel = (details.target as string || '').toLowerCase();
      if (!sourceLabel || !targetLabel) throw new Error('source and target required');
      const state = useFlowStore.getState();
      const src = state.nodes.find((n) => n.data.label.toLowerCase() === sourceLabel || n.id === sourceLabel);
      const tgt = state.nodes.find((n) => n.data.label.toLowerCase() === targetLabel || n.id === targetLabel);
      if (!src) throw new Error(`Source node '${sourceLabel}' not found`);
      if (!tgt) throw new Error(`Target node '${targetLabel}' not found`);
      const edgeId = `edge_${src.id}_${tgt.id}`;
      if (state.edges.some((e) => e.source === src.id && e.target === tgt.id)) {
        return { edgeId, existed: true };
      }
      useFlowStore.setState({ edges: [...state.edges, { id: edgeId, source: src.id, target: tgt.id }] });
      return { edgeId, source: src.data.label, target: tgt.data.label };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CONFIGURE_ANALYSIS, (details) => {
      const phases = (details.phases || details) as Record<string, { enabled?: boolean }>;
      const state = useFlowStore.getState();
      const pipelineNode = state.nodes.find((n) => n.data.nodeType === 'builtin.analysis_pipeline' || n.data.label?.toLowerCase().includes('analysis'));
      if (!pipelineNode) throw new Error('No analysis pipeline node on canvas. Add one first.');
      const current = (pipelineNode.data.config?.phases || {}) as Record<string, unknown>;
      for (const [key, val] of Object.entries(phases)) {
        if (val && typeof val === 'object') {
          current[key] = { ...((current[key] as object) || {}), ...val };
        }
      }
      state.updateNodeConfig(pipelineNode.id, { phases: current });
      return { phases: Object.keys(phases) };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CLONE_AGENT, async (details) => {
      let agentId = (details.agent_id || details.id) as string | undefined;
      let name = details.name as string | undefined;
      if (agentId && !/^[0-9a-f-]{30,}$/i.test(agentId)) { name ||= agentId; agentId = undefined; }
      if (!agentId && name) {
        let match = agentsRef.current.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!match && /^[0-9a-f-]+$/i.test(name)) {
          match = agentsRef.current.find((a) => a.id.startsWith(name.toLowerCase()));
        }
        if (!match) throw new Error(`Agent '${name}' not found. Available: ${agentsRef.current.map((a) => a.name).join(', ')}`);
        agentId = match.id;
      }
      if (!agentId) throw new Error('agent_id or name required');
      const resp = await fetch(`/v1/agents/${agentId}`);
      if (!resp.ok) throw new Error('Agent not found');
      const agent = await resp.json();
      const cloneResp = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${agent.name} (copy)`,
          description: agent.description || '',
          system_prompt: agent.system_prompt || '',
          config_yaml: agent.config_json || '',
          styling: agent.styling_json || '',
        }),
      });
      if (!cloneResp.ok) throw new Error('Clone failed');
      onAgentsChanged();
      return { cloned: true, original: agent.name };
    });

    registerCommandHandler(CONSOLE_COMMANDS.SAVE_VERSION, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      if (!agentId) throw new Error('No agent selected');
      const state = useFlowStore.getState();
      const resp = await fetch(`/v1/agents/${agentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yaml_str: details.yaml || '',
          change_description: (details.description as string) || 'Saved via Vibeful Guide',
        }),
      });
      if (!resp.ok) throw new Error('Failed to save version');
      return { version: (await resp.json()).version_number };
    });

    registerCommandHandler(CONSOLE_COMMANDS.RESTORE_VERSION, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const version = details.version as number | string;
      if (!agentId || version === undefined) throw new Error('agent_id and version required');
      const resp = await fetch(`/v1/agents/${agentId}/versions/${version}/restore`, { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to restore version');
      const state = useFlowStore.getState();
      const agentResp = await fetch(`/v1/agents/${agentId}`);
      const agent = await agentResp.json();
      const { parseGraphFromYaml } = await import('../lib/yamlGenerator');
      const parsed = parseGraphFromYaml(agent);
      if (parsed) state.loadGraph(parsed.nodes, parsed.edges);
      state.setAgentName(agent.name || '');
      onAgentsChanged();
      return { restored: true, version };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CREATE_AB_TEST, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const name = details.name as string;
      if (!agentId || !name) throw new Error('agent_id and name required');
      const resp = await fetch('/v1/ab-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          name,
          variant_a_config: details.variant_a || {},
          variant_b_config: details.variant_b || {},
        }),
      });
      if (!resp.ok) throw new Error('Failed to create A/B test');
      return { name };
    });

    registerCommandHandler(CONSOLE_COMMANDS.START_AB_TEST, async (details) => {
      const testId = details.test_id as string;
      if (!testId) throw new Error('test_id required');
      const resp = await fetch(`/v1/ab-tests/${testId}/start`, { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to start A/B test');
      return { started: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.STOP_AB_TEST, async (details) => {
      const testId = details.test_id as string;
      if (!testId) throw new Error('test_id required');
      const resp = await fetch(`/v1/ab-tests/${testId}/stop`, { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to stop A/B test');
      return { stopped: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CREATE_GLYPH, async (details) => {
      const name = details.name as string;
      const symbol = details.symbol as string;
      if (!name || !symbol) throw new Error('name and symbol required');
      const resp = await fetch('/v1/glyphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol, description: (details.description as string) || '' }),
      });
      if (!resp.ok) throw new Error('Failed to create glyph');
      return { name, symbol };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DELETE_GLYPH, async (details) => {
      const name = details.name as string;
      if (!name) throw new Error('name required');
      const resp = await fetch(`/v1/glyphs/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete glyph');
      return { deleted: name };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CREDIT_TOKENS, async (details) => {
      const userIdentity = (details.user_identity || details.user) as string;
      const amount = details.amount as number;
      if (!userIdentity || !amount) throw new Error('user_identity and amount required');
      const resp = await fetch('/v1/tokens/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_identity: userIdentity, amount, agent_id: details.agent_id || '' }),
      });
      if (!resp.ok) throw new Error('Failed to credit tokens');
      const data = await resp.json();
      return { balance: data.balance };
    });

    registerCommandHandler(CONSOLE_COMMANDS.SET_PERSONALITY, (details) => {
      window.dispatchEvent(new CustomEvent('vibeful:personality-modal', { detail: details }));
      if (activeAgentId && details.tone) {
        fetch(`/v1/agents/${activeAgentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_prompt: details.tone }),
        }).catch(() => {});
      }
      return { personality: 'applied' };
    });

    registerCommandHandler(CONSOLE_COMMANDS.SET_STYLING, (details) => {
      // Scan all detail values for a known preset name (handles any param name the LLM might use)
      const KNOWN_PRESETS = ['light', 'dark', 'default', 'brand'];
      let preset: string | undefined;
      let font: string | undefined;
      for (const [k, v] of Object.entries(details)) {
        if (typeof v !== 'string' || !v.trim()) continue;
        const norm = v.toLowerCase().trim().replace(/\s+(mode|theme|preset|style)$/, '');
        if (KNOWN_PRESETS.includes(norm)) { preset = v; continue; }
        if (k === 'font' || k === 'fontFamily') { font = v; }
      }
      // Fallback: also check the standard param names directly
      if (!preset) preset = (details.preset || details.mode || details.theme) as string | undefined;
      if (!font) font = details.font as string | undefined;
      console.log('[SET_STYLING] raw details:', JSON.stringify(details), '→ preset:', preset, 'font:', font);
      window.dispatchEvent(new CustomEvent('vibeful:styling-modal', { detail: details }));
      // Apply preset directly via global callback — no event chain
      if (preset) {
        applyStylingPreset(preset);
        // Persist styling to localStorage so it survives navigation
        if (activeAgentId) saveAgentStyling(activeAgentId, preset);
      }
      return { styling: 'applied', ...details };
    });

    // ── MCP server commands ──────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.CREATE_MCP_SERVER, async (details) => {
      const name = details.name as string;
      const url = details.url as string;
      if (!name || !url) throw new Error('name and url required');
      const resp = await fetch('/v1/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          transport: (details.transport as string) || 'http',
          auth_type: (details.auth_type as string) || 'none',
          auth_header: (details.auth_header as string) || '',
          agent_id: (details.agent_id as string) || null,
        }),
      });
      if (!resp.ok) throw new Error('Failed to create MCP server');
      return { created: true, name, url };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DELETE_MCP_SERVER, async (details) => {
      const serverId = details.server_id as string;
      if (!serverId) throw new Error('server_id required');
      const resp = await fetch(`/v1/mcp-servers/${serverId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete MCP server');
      return { deleted: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.START_MCP_SERVER, async (details) => {
      const serverId = details.server_id as string;
      if (!serverId) throw new Error('server_id required');
      const resp = await fetch(`/v1/mcp-servers/${serverId}/start`, { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || 'Failed to start MCP server');
      }
      const data = await resp.json();
      if (data.status === 'ok' || data.status === 'started') {
        return { started: true, server_id: serverId };
      }
      throw new Error(data.error || 'Failed to start MCP server');
    });

    registerCommandHandler(CONSOLE_COMMANDS.STOP_MCP_SERVER, async (details) => {
      const serverId = details.server_id as string;
      if (!serverId) throw new Error('server_id required');
      const resp = await fetch(`/v1/mcp-servers/${serverId}/stop`, { method: 'POST' });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || 'Failed to stop MCP server');
      }
      const data = await resp.json();
      if (data.status === 'ok' || data.status === 'stopped') {
        return { stopped: true, server_id: serverId };
      }
      throw new Error(data.error || 'Failed to stop MCP server');
    });

    registerCommandHandler(CONSOLE_COMMANDS.ATTACH_MCP, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const serverUrls = (details.server_urls || details.urls) as string[];
      if (!agentId) throw new Error('No agent selected');
      if (!serverUrls || serverUrls.length === 0) throw new Error('server_urls required');
      const resp = await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcp_server_urls: serverUrls }),
      });
      if (!resp.ok) throw new Error('Failed to attach MCP servers');
      return { attached: serverUrls.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DETACH_MCP, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const serverUrl = details.server_url as string;
      if (!agentId) throw new Error('No agent selected');
      if (!serverUrl) throw new Error('server_url required');
      const resp = await fetch(`/v1/agents/${agentId}`);
      const agent = await resp.json();
      const currentUrls = (agent.mcp_server_urls || []) as string[];
      const newUrls = currentUrls.filter((u: string) => u !== serverUrl);
      const updateResp = await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mcp_server_urls: newUrls }),
      });
      if (!updateResp.ok) throw new Error('Failed to detach MCP server');
      return { detached: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CHECK_MCP_HEALTH, async () => {
      const resp = await fetch('/v1/mcp-servers/health');
      if (!resp.ok) throw new Error('Health check failed');
      const data = await resp.json();
      return { servers: data };
    });

    // ── Guardrails command ───────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.SET_GUARDRAILS, (details) => {
      const rules = details.rules as Record<string, boolean> | undefined;
      const customInstructions = details.custom_instructions as string | undefined;
      if (rules || customInstructions !== undefined) {
        const agentId = activeAgentId;
        if (agentId) {
          const key = `vibeful:guardrails:${agentId}`;
          try {
            const existing = JSON.parse(localStorage.getItem(key) || '{}');
            const state = {
              toggles: rules ? { ...existing.toggles, ...rules } : existing.toggles || {},
              customInstructions: customInstructions !== undefined ? customInstructions : (existing.customInstructions || ''),
            };
            localStorage.setItem(key, JSON.stringify(state));
          } catch {}
        }
      }
      window.dispatchEvent(new CustomEvent('vibeful:guardrails-modal', { detail: details }));
      return { guardrails: 'applied' };
    });

    // ── MCP bulk + discovery commands ────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.START_ALL_MCP, async () => {
      const resp = await fetch('/v1/mcp-servers/builtin/start', { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to start all MCP servers');
      const data = await resp.json();
      return { status: data.status };
    });

    registerCommandHandler(CONSOLE_COMMANDS.STOP_ALL_MCP, async () => {
      const resp = await fetch('/v1/mcp-servers/builtin/stop', { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to stop all MCP servers');
      const data = await resp.json();
      return { status: data.status };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DISCOVER_MCP_TOOLS, async (details) => {
      const serverUrl = details.server_url as string;
      if (!serverUrl) throw new Error('server_url required');
      const resp = await fetch(`${serverUrl.replace(/\/$/, '')}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'discover-1', method: 'tools/list', params: {} }),
      });
      if (!resp.ok) throw new Error('Tool discovery failed');
      const data = await resp.json();
      const tools = (data.result?.tools || []).map((t: any) => ({
        name: t.name,
        description: t.description || '',
      }));
      return { tools };
    });

    // ── Concepts & memories read commands ────────────────

    registerCommandHandler(CONSOLE_COMMANDS.LIST_CONCEPTS, async (details) => {
      const params = new URLSearchParams();
      if (details.domain) params.set('domain', details.domain as string);
      if (details.search) params.set('search', details.search as string);
      const resp = await fetch(`/v1/concepts?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to fetch concepts');
      const data = await resp.json();
      return { concepts: data.concepts || [] };
    });

    registerCommandHandler(CONSOLE_COMMANDS.LIST_GLOBAL_MEMORIES, async (details) => {
      const params = new URLSearchParams();
      if (details.type) params.set('type', details.type as string);
      const resp = await fetch(`/v1/global-memories?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to fetch global memories');
      const data = await resp.json();
      return { memories: data.memories || [] };
    });

    // ── Context file listing ─────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.LIST_CONTEXT_FILES, async (details) => {
      const contextId = details.context_id as string;
      if (!contextId) throw new Error('context_id required');
      const resp = await fetch(`/v1/contexts/${contextId}/files`);
      if (!resp.ok) throw new Error('Failed to fetch context files');
      const data = await resp.json();
      return { files: Array.isArray(data) ? data : [] };
    });

    // ── Token balance ────────────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.GET_TOKEN_BALANCE, async (details) => {
      const userIdentity = (details.user_identity || details.user) as string;
      if (!userIdentity) throw new Error('user_identity required');
      const params = new URLSearchParams({ user_identity: userIdentity });
      if (details.agent_id) params.set('agent_id', details.agent_id as string);
      const resp = await fetch(`/v1/tokens/balance?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to fetch token balance');
      return await resp.json();
    });

    // ── Agent description ────────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.SET_AGENT_DESCRIPTION, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const description = details.description as string;
      if (!agentId) throw new Error('No agent selected');
      if (description === undefined) throw new Error('description required');
      const resp = await fetch(`/v1/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      if (!resp.ok) throw new Error('Failed to update agent description');
      useFlowStore.getState().setAgentDescription?.(description);
      return { updated: true };
    });

    // ── Image analysis ───────────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.ANALYZE_IMAGE, async (details) => {
      const imageUrl = (details.image_url || details.url) as string;
      const question = (details.question || details.query || 'Describe this image') as string;
      if (!imageUrl) throw new Error('image_url required');
      // Use the converse endpoint with a vision-capable model
      const resp = await fetch('/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          system_prompt: 'You are a vision analysis assistant. Describe images clearly and accurately.',
          model: 'deepseek-chat',
          image_url: imageUrl,
        }),
      });
      if (!resp.ok) throw new Error('Image analysis failed');
      const data = await resp.json();
      return { analysis: data.response || data.content || 'No analysis returned' };
    });

    // ── Agent Pages command ───────────────────────────────

    registerCommandHandler(CONSOLE_COMMANDS.CREATE_PAGE, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const slug = details.slug as string;
      const title = (details.title as string) || slug || 'Untitled Page';
      if (!agentId) throw new Error('No agent selected');
      if (!slug) throw new Error('slug required');
      const resp = await fetch('/v1/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          slug: slug.toLowerCase().replace(/\s+/g, '-'),
          title,
          content_markdown: (details.content_markdown || details.content || '') as string,
          layout_json: (details.layout_json || '{}') as string,
          published: details.published ? 1 : 0,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).detail || 'Failed to create page');
      }
      const page = await resp.json();
      return { id: page.id, slug: page.slug, title: page.title };
    });

    registerCommandHandler(CONSOLE_COMMANDS.UPDATE_PAGE, async (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      const updates: Record<string, unknown> = {};
      if (details.title !== undefined) updates.title = details.title;
      if (details.content_markdown !== undefined) updates.content_markdown = details.content_markdown;
      if (details.content !== undefined) updates.content_markdown = details.content;
      if (details.layout_json !== undefined) updates.layout_json = details.layout_json;
      if (Object.keys(updates).length === 0) throw new Error('No fields to update');
      const resp = await fetch(`/v1/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!resp.ok) throw new Error('Failed to update page');
      return { updated: true, page_id: pageId };
    });

    registerCommandHandler(CONSOLE_COMMANDS.PUBLISH_PAGE, async (details) => {
      const pageId = details.page_id as string;
      const publish = details.publish !== false; // default to true
      if (!pageId) throw new Error('page_id required');
      const resp = await fetch(`/v1/pages/${pageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: publish ? 1 : 0 }),
      });
      if (!resp.ok) throw new Error('Failed to update page');
      return { published: publish, page_id: pageId };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DELETE_PAGE, async (details) => {
      const pageId = details.page_id as string;
      if (!pageId) throw new Error('page_id required');
      const resp = await fetch(`/v1/pages/${pageId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete page');
      return { deleted: true, page_id: pageId };
    });

    registerCommandHandler(CONSOLE_COMMANDS.LIST_PAGES, async (details) => {
      const params = new URLSearchParams();
      if (details.agent_id) params.set('agent_id', details.agent_id as string);
      const resp = await fetch(`/v1/pages?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to fetch pages');
      const pages = await resp.json();
      const publishedOnly = details.published_only !== false;
      const filtered = publishedOnly
        ? (Array.isArray(pages) ? pages.filter((p: any) => p.published) : pages)
        : pages;
      return { pages: filtered };
    });

    registerCommandHandler(CONSOLE_COMMANDS.GET_ANALYTICS, async () => {
      const resp = await fetch('/v1/analytics');
      if (!resp.ok) throw new Error('Failed to fetch analytics');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.BROWSE_MCP_CATALOG, async () => {
      const resp = await fetch('/v1/mcp-servers');
      if (!resp.ok) throw new Error('Failed to fetch MCP catalog');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.INSTALL_MCP_SERVER, async (details) => {
      const name = details.name as string;
      const url = details.url as string;
      const serverId = (details.server_id || details.id) as string | undefined;
      if (!name || !url) throw new Error('name and url required');
      const resp = await fetch('/v1/mcp-servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: serverId || undefined,
          name,
          url,
          transport: (details.transport as string) || 'http',
        }),
      });
      if (!resp.ok) throw new Error('Failed to install MCP server');
      return { installed: true, name, url };
    });

    registerCommandHandler(CONSOLE_COMMANDS.EXECUTE_AGENT, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const message = details.message as string;
      if (!agentId) throw new Error('No agent selected');
      if (!message) throw new Error('message required');
      const resp = await fetch(`/v1/agents/${agentId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!resp.ok) throw new Error('Agent execution failed');
      const data = await resp.json();
      return {
        response: data.response,
        tool_calls: data.tool_calls,
        usage: data.usage,
      };
    });

    registerCommandHandler(CONSOLE_COMMANDS.REGISTER_WEBHOOK, async (details) => {
      const url = details.url as string;
      const events = details.events as string[] | undefined;
      if (!url) throw new Error('url required');
      const resp = await fetch('/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events: events || ['conversation.completed'] }),
      });
      if (!resp.ok) throw new Error('Failed to register webhook');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.CREATE_API_KEY, async (details) => {
      const name = (details.name as string) || '';
      const agentId = (details.agent_id as string) || null;
      const resp = await fetch('/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agent_id: agentId }),
      });
      if (!resp.ok) throw new Error('Failed to create API key');
      const data = await resp.json();
      return { id: data.id, key_prefix: data.key_prefix, raw_key: data.raw_key };
    });

    registerCommandHandler(CONSOLE_COMMANDS.LIST_API_KEYS, async (details) => {
      const params = new URLSearchParams();
      if (details.agent_id) params.set('agent_id', details.agent_id as string);
      const resp = await fetch(`/v1/api-keys?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to list API keys');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.REVOKE_API_KEY, async (details) => {
      const keyId = details.key_id as string;
      if (!keyId) throw new Error('key_id required');
      const resp = await fetch(`/v1/api-keys/${keyId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to revoke API key');
      return { revoked: true };
    });

    registerCommandHandler(CONSOLE_COMMANDS.GET_AUDIT_LOG, async (details) => {
      const params = new URLSearchParams();
      if (details.resource_type) params.set('resource_type', details.resource_type as string);
      if (details.agent_id) params.set('agent_id', details.agent_id as string);
      if (details.limit) params.set('limit', String(details.limit));
      const resp = await fetch(`/v1/audit?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to fetch audit log');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.EXPORT_AGENT, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      if (!agentId) throw new Error('No agent selected');
      const resp = await fetch(`/v1/agents/${agentId}/export`);
      if (!resp.ok) throw new Error('Failed to export agent');
      const yaml = await resp.text();
      return { yaml, agent_id: agentId };
    });

    registerCommandHandler(CONSOLE_COMMANDS.IMPORT_AGENT, async (details) => {
      const yamlContent = details.yaml_content as string;
      if (!yamlContent) throw new Error('yaml_content required');
      const resp = await fetch('/v1/agents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml_content: yamlContent }),
      });
      if (!resp.ok) throw new Error('Failed to import agent');
      const data = await resp.json();
      onAgentsChanged();
      return { id: data.id, name: data.name };
    });

    registerCommandHandler(CONSOLE_COMMANDS.PROMOTE_AGENT, async (details) => {
      const sourceId = details.source_agent_id as string;
      const targetId = (details.target_agent_id || activeAgentId) as string;
      if (!sourceId) throw new Error('source_agent_id required');
      if (!targetId) throw new Error('target_agent_id required (or select an agent)');
      const resp = await fetch('/v1/agents/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_agent_id: sourceId, target_agent_id: targetId }),
      });
      if (!resp.ok) throw new Error('Failed to promote agent');
      onAgentsChanged();
      return { status: 'promoted', source: sourceId, target: targetId };
    });

    registerCommandHandler(CONSOLE_COMMANDS.EXPLAIN_PAGE, (details) => {
      const page = (details.page as string) || '';
      import('../lib/tourStore').then(({ useTourStore }) => {
        import('../lib/tourData').then(({ PAGE_TOURS }) => {
          const steps = PAGE_TOURS[page];
          if (steps && steps.length > 0) {
            useTourStore.getState().startTour(page, steps);
          }
        });
      });
      return { tour_started: page || 'current' };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CREATE_TEST, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      const inputMessage = details.input_message as string;
      if (!agentId) throw new Error('No agent selected');
      if (!inputMessage) throw new Error('input_message required');
      const resp = await fetch('/v1/agent-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          name: (details.name as string) || '',
          input_message: inputMessage,
          expected_contains: (details.expected_contains as string) || '',
          expected_not_contains: (details.expected_not_contains as string) || '',
        }),
      });
      if (!resp.ok) throw new Error('Failed to create test');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.LIST_TESTS, async (details) => {
      const params = new URLSearchParams();
      if (details.agent_id) params.set('agent_id', details.agent_id as string);
      const resp = await fetch(`/v1/agent-tests?${params.toString()}`);
      if (!resp.ok) throw new Error('Failed to list tests');
      return await resp.json();
    });

    registerCommandHandler(CONSOLE_COMMANDS.RUN_TESTS, async (details) => {
      const agentId = (details.agent_id || activeAgentId) as string;
      if (!agentId) throw new Error('No agent selected');
      const resp = await fetch(`/v1/agent-tests/run-all?agent_id=${agentId}`, { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to run tests');
      return await resp.json();
    });
  }, [onNavigate, onAgentsChanged, onContextsChanged, setAgentName, agentName]);

  // Quick-start auto-trigger: Dashboard "Create Chatbot" fires this event
  useEffect(() => {
    const onQuickStartDone = (e: Event) => {
      const { template, message } = (e as CustomEvent).detail as { template: string; message: string };
      setMessages((prev) => [...prev, { role: 'user', content: message }]);
      // Auto-trigger send to get the AI's confirmation
      setLoading(true);
      clearLastAIError();
      const ctx: ConsoleContext = {
        nodes,
        edges,
        selectedNodeId: useFlowStore.getState().selectedNodeId,
        activeTab: 'designer',
        agents: agents.slice(0, 20),
        contexts: contexts.slice(0, 20),
      };
      processAICommand(message, ctx, messages).then((responseText) => {
        if (responseText) {
          executeCommands(responseText).then((cmdResults) => {
            const cleanContent = stripCommands(responseText!);
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: cleanContent || responseText!,
              commandResults: cmdResults.length > 0 ? cmdResults : undefined,
            }]);
          });
        } else {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: `✅ Your ${template === 'minimal' ? 'chatbot' : 'agent'} is ready! The minimal template has been loaded with 4 nodes: Setup → System Prompt → ReAct Agent → Stream Completion.\n\nWant me to help you deploy it or customize the configuration?`,
          }]);
        }
        setLoading(false);
      }).catch(() => {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `✅ Your ${template === 'minimal' ? 'chatbot' : 'agent'} is built and ready on the canvas. Want me to help you deploy it?`,
        }]);
        setLoading(false);
      });
    };
    window.addEventListener('vibeful:quick-start-done', onQuickStartDone);
    return () => window.removeEventListener('vibeful:quick-start-done', onQuickStartDone);
  }, [agents, contexts, nodes, edges, messages]);

  // First-run welcome
  useEffect(() => {
    if (onboarding && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: "👋 I'm the Vibeful Guide. I can drive the entire console — create agents, manage knowledge bases, design graphs, and deploy. Just tell me what you need.\n\nWant to build a support bot? Set up a knowledge base? Design an agent flow? I'll do it.",
      }]);
      setOnboarding(false);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keep input focused during navigation events
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeTab]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    clearLastAIError();

    try {
      const ctx: ConsoleContext = {
        nodes,
        edges,
        selectedNodeId: useFlowStore.getState().selectedNodeId,
        activeTab,
        agents: agents.slice(0, 20),
        contexts: contexts.slice(0, 20),
      };
      const responseText = await processAICommand(msg, ctx, messages);

      if (responseText) {
        const cmdResults = await executeCommands(responseText);
        const cleanContent = stripCommands(responseText);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: cleanContent || responseText,
          commandResults: cmdResults.length > 0 ? cmdResults : undefined,
        }]);
      } else {
        const hint = lastAIError ? `Reason: ${lastAIError}` : 'Your DeepSeek API key may not be configured yet.';
        setMessages((prev) => [...prev, { role: 'system', content: `AI service unavailable. ${hint}` }]);
      }
    } catch (e: unknown) {
      setMessages((prev) => [...prev, { role: 'system', content: `AI engine error: ${e}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (collapsed) {
    return (
      <div className="w-10 flex-shrink-0 bg-slate-900 border-l border-slate-700 flex flex-col items-center pt-3">
        <button onClick={() => setCollapsed(false)} className="text-slate-500 hover:text-indigo-400" title="Open Guide">
          <PanelRightOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-[340px] flex-shrink-0 h-full flex flex-col bg-slate-900 border-l border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Vibeful Guide</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMessages([{ role: 'assistant', content: "Chat cleared. What can I help you with?" }])} className="text-slate-500 hover:text-slate-300 text-[10px] px-2 py-0.5 rounded hover:bg-slate-700" title="Clear chat">
            Clear
          </button>
          <button onClick={() => setCollapsed(true)} className="text-slate-500 hover:text-slate-300">
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-6">
            <p className="mb-2">I can help you:</p>
            <div className="text-slate-600 space-y-1">
              <p>• Create and configure agents</p>
              <p>• Manage knowledge bases</p>
              <p>• Design agent graphs</p>
              <p>• Navigate the console</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role !== 'user' && (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Brain size={12} className="text-white" />
              </div>
            )}
            <div className="max-w-[85%]">
              <div className={`rounded-lg px-3 py-2 text-xs ${
                msg.role === 'user' ? 'bg-indigo-600 text-white' :
                msg.role === 'system' ? 'bg-yellow-900/50 text-yellow-200 border border-yellow-800' :
                'bg-slate-800 text-slate-200'
              }`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.commandResults && msg.commandResults.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    {msg.commandResults.map((r, j) => (
                      <div key={j} className={`text-[10px] flex items-center gap-1 ${r.success ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{r.success ? '✓' : '✗'}</span>
                        <span>{r.action}</span>
                        {r.error && <span className="text-red-300">— {r.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={12} className="text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center flex-shrink-0">
              <Brain size={12} className="text-white" />
            </div>
            <div className="bg-slate-800 rounded-lg px-3 py-2">
              <Loader2 size={14} className="animate-spin text-indigo-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-700 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me to do anything…"
          className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}