/**
 * Enhanced AI Assistant Panel — with onboarding mode, analysis display,
 * and Vibeful command protocol integration.
 *
 * Replaces the original AIAssistantPanel.tsx.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Wand2, Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { processAICommand, applyAICommand, type AICommand } from '../lib/aiAssistant';
import { VIBEFUL_GUIDE_SYSTEM_PROMPT } from '../lib/vibefulGuide';
import {
  parseCommands, executeCommands, stripCommands, registerCommandHandler,
  CONSOLE_COMMANDS, type CommandResult,
} from '../lib/commandProtocol';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  command?: AICommand;
  commandResults?: CommandResult[];
  analysis?: Record<string, unknown>;
  showAnalysis?: boolean;
}

export default function AIAssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
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
      // Find position after specified node
      let position = undefined;
      if (afterLabel) {
        const afterNode = useFlowStore.getState().nodes.find(
          (n) => n.data.label === afterLabel || n.id === afterLabel
        );
        if (afterNode) {
          position = { x: afterNode.position.x, y: afterNode.position.y + 120 };
        }
      }
      useFlowStore.getState().addNode(nodeType, label, position);
      return { nodeType, label };
    });

    registerCommandHandler(CONSOLE_COMMANDS.REMOVE_NODE, (details) => {
      const label = details.label as string;
      const node = useFlowStore.getState().nodes.find(
        (n) => n.data.label === label || n.id === label
      );
      if (node) {
        useFlowStore.getState().selectNode(node.id);
        useFlowStore.getState().removeSelectedNodes();
        return { label };
      }
      throw new Error(`Node '${label}' not found`);
    });

    registerCommandHandler(CONSOLE_COMMANDS.LOAD_TEMPLATE, (details) => {
      const template = details.template as string;
      window.dispatchEvent(new CustomEvent('vibeful:load-template', { detail: template }));
      return { template };
    });

    registerCommandHandler(CONSOLE_COMMANDS.DEPLOY, (_details) => {
      const state = useFlowStore.getState();
      setAgentName(state.agentName || 'My Agent');
      // Trigger deploy via DOM event
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
  }, []);

  // First-run onboarding: detect empty canvas
  useEffect(() => {
    if (nodes.length === 0 && messages.length === 0 && !onboarding) {
      setOnboarding(true);
      setVisible(true);
      setMessages([{
        role: 'assistant',
        content: "👋 Welcome to Vibeful! I'm your Guide — an AI agent that helps you build AI agents.\n\nI see this is your first time here. Would you like me to walk you through building your first agent?\n\nJust say **yes** and I'll set up a working agent on this canvas in seconds. You can then embed it in your app with 3 lines of code.",
      }]);
    }
  }, [nodes.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Try to parse analysis data from API response
  const extractAnalysis = (response: string): Record<string, unknown> | undefined => {
    try {
      // Analysis may be attached as a separate field in future API versions
      return undefined;
    } catch {
      return undefined;
    }
  };

  // Simple affirmatives the user might respond with to the onboarding prompt
  const ONBOARDING_YES = new Set([
    'yes', 'yeah', 'yea', 'yep', 'yup', 'sure', 'ok', 'okay',
    "let's go", 'lets go', 'go ahead', 'please', 'do it',
    'yes please', 'yes!', 'yeah!', 'sure!',
  ]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);

    // --- Onboarding fast path: "yes" without needing the LLM ---
    const isOnboarding = nodes.length === 0 && edges.length === 0 && onboarding;
    if (isOnboarding && ONBOARDING_YES.has(msg.toLowerCase())) {
      const explain = "Let's build your first agent! I'm setting up a minimal template on the canvas now — you'll see nodes appear in a moment.";
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: explain,
      }]);
      window.dispatchEvent(new CustomEvent('vibeful:load-template', { detail: 'minimal' }));
      setLoading(false);
      setOnboarding(false);
      return;
    }

    setLoading(true);

    try {
      const command = await processAICommand(
        `${VIBEFUL_GUIDE_SYSTEM_PROMPT}\n\n---\n\n${msg}`,
        nodes,
        edges
      );

      if (command) {
        // Parse any embedded vibeful-command blocks from explanation
        const cmdResults = await executeCommands(command.explanation);
        const cleanContent = stripCommands(command.explanation);
        const analysis = extractAnalysis(command.explanation);

        const newMsg: ChatMessage = {
          role: 'assistant',
          content: cleanContent || command.explanation,
          command,
          commandResults: cmdResults.length > 0 ? cmdResults : undefined,
          analysis,
        };

        setMessages((prev) => [...prev, newMsg]);

        // Auto-apply commands if they affect the graph
        if (command.action !== 'setup_template' && command.action !== 'configure_analysis') {
          const result = applyAICommand(command, useFlowStore.getState().nodes, useFlowStore.getState().edges);
          if (result) {
            loadGraph(result.nodes, result.edges);
          }
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: "The AI service didn't return a usable response. Your DeepSeek API key may not be configured yet — click the amber banner at the top to set it up.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: "Error reaching the AI engine on port 50052. Check that the agent engine is running (look for 'Vibeful is Ready').",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCommand = (command: AICommand) => {
    if (command.action === 'setup_template') {
      const { template } = command.details as { template: string };
      window.dispatchEvent(new CustomEvent('vibeful:load-template', { detail: template }));
      return;
    }

    if (command.action === 'configure_analysis') {
      const { phases } = command.details as { phases: Record<string, { enabled: boolean; temperature?: number }> };
      window.dispatchEvent(new CustomEvent('vibeful:configure-analysis', { detail: phases }));
      return;
    }

    const result = applyAICommand(command, useFlowStore.getState().nodes, useFlowStore.getState().edges);
    if (result) {
      loadGraph(result.nodes, result.edges);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleAnalysis = (index: number) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === index ? { ...m, showAnalysis: !m.showAnalysis } : m))
    );
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible(!visible)}
        className={`fixed bottom-4 right-4 z-50 p-3 rounded-full shadow-lg transition-all ${
          visible
            ? 'bg-indigo-600 text-white scale-110'
            : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:scale-105'
        }`}
        title="Vibeful Guide"
      >
        <Wand2 size={18} />
      </button>

      {/* Panel */}
      {visible && (
        <div className="fixed bottom-16 right-4 z-50 w-96 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col max-h-[550px]">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700 bg-slate-800/50">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-indigo-400" />
              <span className="text-sm font-medium text-slate-200">Vibeful Guide</span>
              {onboarding && (
                <span className="text-[9px] px-1.5 py-0.5 bg-indigo-600/30 text-indigo-300 rounded-full">
                  onboarding
                </span>
              )}
            </div>
            <button
              onClick={() => setVisible(false)}
              className="text-slate-500 hover:text-slate-300 text-xs"
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
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
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Analysis toggle */}
                    {msg.analysis && (
                      <button
                        onClick={() => toggleAnalysis(i)}
                        className="mt-2 flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        {msg.showAnalysis ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                        Analysis
                      </button>
                    )}
                    {msg.analysis && msg.showAnalysis && (
                      <div className="mt-1 p-2 bg-slate-900 rounded text-[10px] text-slate-400 font-mono">
                        {JSON.stringify(msg.analysis, null, 1)}
                      </div>
                    )}

                    {/* Apply button */}
                    {msg.command && (
                      <button
                        onClick={() => handleApplyCommand(msg.command!)}
                        className="mt-2 flex items-center gap-1 px-2 py-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                      >
                        <Wand2 size={10} /> Apply
                      </button>
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
      )}
    </>
  );
}
