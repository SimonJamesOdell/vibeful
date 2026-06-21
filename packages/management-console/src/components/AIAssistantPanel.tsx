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

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  commandResults?: CommandResult[];
}

interface Props {
  agents: Array<{ id: string; name: string }>;
  contexts: Array<{ id: string; name: string }>;
  activeTab: string;
  onNavigate: (tab: any) => void;
  onAgentsChanged: () => void;
  onContextsChanged: () => void;
}

export default function AIAssistantPanel({ agents, contexts, activeTab, onNavigate, onAgentsChanged, onContextsChanged }: Props) {
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
      let position = undefined;
      let afterNodeId: string | null = null;
      if (afterLabel) {
        const afterNode = useFlowStore.getState().nodes.find(
          (n) => n.data.label === afterLabel || n.id === afterLabel
        );
        if (afterNode) {
          position = { x: afterNode.position.x, y: afterNode.position.y + 120 };
          afterNodeId = afterNode.id;
        }
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
      useFlowStore.getState().loadGraph([...tpl.nodes], [...tpl.edges]);
      useFlowStore.getState().setAgentName(tpl.name);
      setOnboarding(false);
      return { template, nodes: useFlowStore.getState().nodes.length };
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
      const name = details.name as string;
      if (!name) throw new Error('name is required');
      const resp = await fetch('/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: details.description || '', system_prompt: details.system_prompt || '' }),
      });
      if (!resp.ok) throw new Error('Failed to create agent');
      const data = await resp.json();
      onAgentsChanged();
      useFlowStore.getState().setAgentName(name);
      return { id: data.id, name };
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
        // Try exact name match first, then ID prefix match
        let match = agentsRef.current.find((a) => a.name.toLowerCase() === name.toLowerCase());
        if (!match) {
          match = agentsRef.current.find((a) => a.id.startsWith(name));
        }
        if (!match) throw new Error(`Agent "${name}" not found`);
        agentId = match.id;
      }
      if (!agentId) throw new Error('agent_id or name required');
      const resp = await fetch(`/v1/agents/${agentId}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to delete agent');
      onAgentsChanged();
      return { deleted: true, name: name || agentId };
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
          match = agentsRef.current.find((a) => a.id.startsWith(name));
        }
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
        <button onClick={() => setCollapsed(true)} className="text-slate-500 hover:text-slate-300">
          <PanelRightClose size={14} />
        </button>
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