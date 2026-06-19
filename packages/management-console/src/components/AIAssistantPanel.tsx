/**
 * AI Assistant Panel — Codewhale-pattern: LLM is brain, tools are hands.
 *
 * The LLM responds conversationally. When it wants to drive the UI,
 * it embeds ```vibeful-command blocks. The frontend extracts and executes
 * those blocks deterministically. No JSON parsing. No rigid formats.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { processAICommand, lastAIError, clearLastAIError } from '../lib/aiAssistant';
import {
  parseCommands, executeCommands, stripCommands, registerCommandHandler,
  CONSOLE_COMMANDS, type CommandResult,
} from '../lib/commandProtocol';
import { TEMPLATES } from '../lib/templates';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  commandResults?: CommandResult[];
}

export default function AIAssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { nodes, edges, loadGraph, addNode, setAgentName } = useFlowStore();

  // Register console command handlers
  useEffect(() => {
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

      // If placed after a specific node, reroute edges: afterNode → new → oldTarget
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

            // Shift all downstream nodes down to make space for the new node
            const shiftQueue = [oldTarget];
            const shifted = new Set<string>();
            const updatedNodes = state.nodes.map((n) => ({ ...n, position: { ...n.position } }));
            while (shiftQueue.length > 0) {
              const currentId = shiftQueue.shift()!;
              if (shifted.has(currentId)) continue;
              shifted.add(currentId);
              const node = updatedNodes.find((n) => n.id === currentId);
              if (node) node.position = { ...node.position, y: node.position.y + 120 };
              for (const e of newEdges.filter((e) => e.source === currentId)) {
                if (!shifted.has(e.target)) shiftQueue.push(e.target);
              }
            }

            useFlowStore.setState({ edges: newEdges, nodes: updatedNodes });
          } else {
            useFlowStore.setState({ edges: [...state.edges, { id: `edge_${afterNodeId}_${newNodeId}`, source: afterNodeId, target: newNodeId }] });
          }
        }
      }

      return { nodeType, label };
    });

    registerCommandHandler(CONSOLE_COMMANDS.REMOVE_NODE, (details) => {
      // Accept multiple field names the LLM might use
      const label = (details.label || details.node || details.name) as string;
      const state = useFlowStore.getState();
      const node = state.nodes.find(
        (n) => n.data.label === label || n.id === label
      );
      if (node) {
        // Remove the node and any edges connected to it
        useFlowStore.setState({
          nodes: state.nodes.filter((n) => n.id !== node.id),
          edges: state.edges.filter((e) => e.source !== node.id && e.target !== node.id),
        });
        return { label };
      }
      throw new Error(`Node '${label}' not found`);
    });

    registerCommandHandler(CONSOLE_COMMANDS.LOAD_TEMPLATE, (details) => {
      const template = details.template as string;
      const tpl = TEMPLATES[template];
      if (!tpl) {
        throw new Error(`Unknown template: "${template}". Available: ${Object.keys(TEMPLATES).join(', ')}`);
      }
      // Load synchronously so follow-up commands (start_tour) can read updated nodes
      const store = useFlowStore.getState();
      store.loadGraph([...tpl.nodes], [...tpl.edges]);
      store.setAgentName(tpl.name);
      return { template, nodes: store.nodes.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DEPLOY, (_details) => {
      const state = useFlowStore.getState();
      setAgentName(state.agentName || 'My Agent');
      window.dispatchEvent(new CustomEvent('vibeful:deploy'));
      return { name: state.agentName || 'My Agent', nodes: state.nodes.length };
    });

    registerCommandHandler(CONSOLE_COMMANDS.NAVIGATE, (details) => {
      const tab = details.tab as string;
      window.dispatchEvent(new CustomEvent('vibeful:navigate', { detail: tab }));
      return { tab };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CONFIGURE_ANALYSIS, (details) => {
      const phases = details.phases as Record<string, { enabled: boolean; temperature?: number }>;
      window.dispatchEvent(new CustomEvent('vibeful:configure-analysis', { detail: phases }));
      return { phases };
    });

    registerCommandHandler(CONSOLE_COMMANDS.ADD_EDGE, (details) => {
      const sourceLabel = details.source as string;
      const targetLabel = details.target as string;
      const state = useFlowStore.getState();
      const source = state.nodes.find((n) => n.data.label === sourceLabel || n.id === sourceLabel);
      const target = state.nodes.find((n) => n.data.label === targetLabel || n.id === targetLabel);
      if (source && target) {
        state.onConnect({ source: source.id, target: target.id, sourceHandle: null, targetHandle: null });
        return { source: sourceLabel, target: targetLabel };
      }
      throw new Error(`Could not find nodes: ${sourceLabel} → ${targetLabel}`);
    });

    registerCommandHandler(CONSOLE_COMMANDS.HIGHLIGHT_NODE, (details) => {
      const nodeLabel = (details.node as string).toLowerCase();
      const explanation = (details.explanation as string) || '';
      const state = useFlowStore.getState();
      const node = state.nodes.find((n) => n.data.label.toLowerCase() === nodeLabel || n.id === nodeLabel);
      if (node) {
        state.startTour([{ nodeLabel: node.data.label, explanation }]);
        return { node: nodeLabel };
      }
      return { node: nodeLabel, error: 'Node not found on canvas' };
    });

    registerCommandHandler(CONSOLE_COMMANDS.START_TOUR, (details) => {
      const steps = details.steps as Array<{ node: string; explanation: string }> | undefined;
      if (!steps || steps.length === 0) return { error: 'No tour steps provided' };
      const state = useFlowStore.getState();
      const tourSteps = steps
        .map((s) => {
          const searchLabel = s.node.toLowerCase();
          const node = state.nodes.find((n) => n.data.label.toLowerCase() === searchLabel || n.id === s.node);
          return node ? { nodeLabel: node.data.label, explanation: s.explanation } : null;
        })
        .filter(Boolean) as Array<{ nodeLabel: string; explanation: string }>;
      if (tourSteps.length > 0) {
        state.startTour(tourSteps);
        return { steps: tourSteps.length };
      }
      return { error: 'No matching nodes found on canvas' };
    });

    registerCommandHandler(CONSOLE_COMMANDS.CLEAR_HIGHLIGHTS, () => {
      useFlowStore.getState().dismissTour();
      return {};
    });
  }, []);

  // First-run onboarding: detect empty canvas
  useEffect(() => {
    if (nodes.length === 0 && messages.length === 0 && !onboarding) {
      setOnboarding(true);
      setMessages([{
        role: 'assistant',
        content: "👋 Welcome to Vibeful! I'm your Guide — an AI agent that helps you build AI agents.\n\nI see this is your first time here. Would you like me to walk you through building your first agent?\n\nJust say **yes** and I'll set up a working agent on this canvas in seconds. You can then embed it in your app with 3 lines of code.",
      }]);
    }
  }, [nodes.length]);

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
      const selectedNodeId = useFlowStore.getState().selectedNodeId;
      const responseText = await processAICommand(msg, nodes, edges, selectedNodeId, messages);

      if (responseText) {
        // Extract and execute vibeful-command blocks
        const cmdResults = await executeCommands(responseText);
        const cleanContent = stripCommands(responseText);

        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: cleanContent || responseText,
          commandResults: cmdResults.length > 0 ? cmdResults : undefined,
        }]);
      } else {
        const hint = lastAIError
          ? `Reason: ${lastAIError}`
          : 'Your DeepSeek API key may not be configured yet.';
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: `AI service unavailable. ${hint}` },
        ]);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[Vibeful] processAICommand failed:', e);
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: `AI engine error: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Vibeful Guide</span>
          {onboarding && (
            <span className="text-[9px] px-1.5 py-0.5 bg-indigo-600/30 text-indigo-300 rounded-full">
              onboarding
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !onboarding && (
          <div className="text-xs text-slate-500 text-center py-6">
            <p className="mb-2">I'm your Vibeful Guide. I can help you:</p>
            <div className="text-slate-600 space-y-1">
              <p>• Build agents on the canvas</p>
              <p>• Explain Vibeful concepts</p>
              <p>• Configure the analysis pipeline</p>
              <p>• Help you embed agents in your app</p>
            </div>
            <p className="mt-3 text-indigo-400">Just ask me anything!</p>
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
              <div
                className={`rounded-lg px-3 py-2 text-xs ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : msg.role === 'system'
                    ? 'bg-yellow-900/50 text-yellow-200 border border-yellow-800'
                    : 'bg-slate-800 text-slate-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Command results */}
                {msg.commandResults && msg.commandResults.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    {msg.commandResults.map((r, j) => (
                      <div
                        key={j}
                        className={`text-[10px] flex items-center gap-1 ${
                          r.success ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        <span>{r.success ? '✓' : '✗'}</span>
                        <span>{r.action}</span>
                        {r.error && <span className="text-red-300">— {r.error}</span>}
                        {(() => {
                          if (!r.error && r.result && typeof r.result === 'object' && 'error' in r.result) {
                            return <span className="text-red-300">— {String((r.result as Record<string,unknown>).error)}</span>;
                          }
                          return null;
                        })()}
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

      {/* Selected nodes context indicator */}
      {(() => {
        const selectedLabels = nodes.filter((n) => n.selected).map((n) => n.data.label);
        if (selectedLabels.length === 0) return null;
        return (
          <div className="px-3 pt-2 pb-0">
            <div className="flex items-center gap-1.5 text-[10px] text-indigo-300/70 bg-indigo-950/40 border border-indigo-800/30 rounded px-2 py-1">
              <span className="text-indigo-400">⊡</span>
              <span className="truncate">
                {selectedLabels.length === 1
                  ? `${selectedLabels[0]} → included in Guide context`
                  : `${selectedLabels.join(', ')} → included in Guide context`}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Input */}
      <div className="p-3 border-t border-slate-700 flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about Vibeful…"
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
