/**
 * Enhanced AI Assistant Panel — with onboarding mode, analysis display,
 * and Vibeful command protocol integration.
 *
 * Replaces the original AIAssistantPanel.tsx.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Wand2, Brain, ChevronDown, ChevronRight } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { processAICommand, applyAICommand, type AICommand, lastAIError, clearLastAIError } from '../lib/aiAssistant';
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

    registerCommandHandler(CONSOLE_COMMANDS.HIGHLIGHT_NODE, (details) => {
      const nodeLabel = details.node as string;
      const explanation = (details.explanation as string) || '';
      const state = useFlowStore.getState();
      const node = state.nodes.find((n) => n.data.label === nodeLabel || n.id === nodeLabel);
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
          const node = state.nodes.find((n) => n.data.label === s.node || n.id === s.node);
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

  // Normalize text for flexible matching: strip punctuation, collapse whitespace, lowercase
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();

  // ═══════════════════════════════════════════════════════════════
  // ARCHITECTURE PRINCIPLE — LLM drives the UI; tools are hands, not brain.
  //
  // The ONBOARDING_QA dictionary below is a LOCAL FALLBACK for factual
  // questions that don't involve the canvas (e.g. "what is Vibeful?").
  // It must NOT interpret user intent, pre-guess responses, or attempt
  // semantic understanding. That is the LLM's job.
  //
  // Node-explanation questions ("what do these mean?", "explain the
  // nodes") MUST fall through to the LLM via processAICommand(). The
  // LLM receives the full graph context, understands the user's intent
  // semantically, and responds with start_tour/highlight_node commands
  // that drive the UI through the deterministic command protocol.
  //
  // If you find yourself adding a string-match entry to handle what the
  // user "probably means" — stop. That's the LLM's job. Add it to the
  // SYSTEM_PROMPT in aiAssistant.ts instead, so the LLM learns to
  // handle that intent dynamically for any canvas state.
  // ═══════════════════════════════════════════════════════════════

  // Local answers for common onboarding questions (no LLM needed)
  const NODE_TOUR_INTRO = "Let me walk you through each node on your canvas! I've highlighted the first one — use the arrows below to step through.\n\n";
  const NODE_TOUR_CMD = '```vibeful-command\n{"action":"start_tour","details":{"steps":[' +
    '{"node":"Setup","explanation":"Setup initializes every conversation. It creates the message list, captures the user input, and prepares the response buffer."},' +
    '{"node":"System Prompt Builder","explanation":"This node constructs the AI personality and instructions. It takes your system prompt and any context (like RAG results) to build the final prompt sent to the LLM."},' +
    '{"node":"LLM Call","explanation":"This is where the magic happens! The LLM Call node sends everything to DeepSeek API and waits for a response. You can configure the model, temperature, and max tokens here."},' +
    '{"node":"Output","explanation":"Output formats the LLM response for display. It handles streaming chunks, trims extra whitespace, and makes sure the final answer looks clean for your users."}' +
    ']}}\n```';

  // Build Q&A with normalized keys for flexible matching.
  // NOTE: node-explanation questions intentionally NOT here — the LLM handles those
  // dynamically with start_tour/highlight_node commands based on actual canvas state.
  const _rawQa: Array<[string, string]> = [
    ['what is this', "This is the Vibeful agent designer — a visual canvas where you build AI agents by connecting nodes. Each node is a step in your agent's decision process. You design the flow, Vibeful runs it. Think of it like a flowchart that makes AI decisions."],
    ['what is vibeful', "Vibeful is a platform for building, testing, and deploying AI agents. You design an agent's behavior on this canvas, then embed it in your app with a few lines of code. No ML expertise needed — just describe what you want the agent to do."],
    ['how do i build an agent', "You're already doing it! The 4 nodes on your canvas form a working agent. To customize it:\n\n• Add nodes: type 'add a RAG node' or 'add an attack guard'\n• Remove nodes: click a node and press Delete\n• Connect nodes: drag from one node's edge to another\n\nOnce you're happy, click Deploy and you'll get 3 lines of code to embed it in your app."],
    ['how do i deploy', "Click the Deploy button in the toolbar (top right), or type 'deploy' here. You'll get a code snippet — 3 lines of JavaScript/TypeScript — that you paste into your app. The agent runs on Vibeful's infrastructure; your app just sends messages and receives responses."],
    ['what next', "You've got a working agent on the canvas! Here are some ideas:\n\n• **Add intelligence**: type 'add a RAG node' to give your agent knowledge from your documents\n• **Add safety**: type 'add an attack guard' to protect against prompt injection\n• **Test it**: switch to the Conversations tab and chat with your agent\n• **Deploy it**: click Deploy to get the embed code\n\nWhat would you like to try?"],
  ];
  const ONBOARDING_QA: Record<string, string> = {};
  for (const [key, val] of _rawQa) {
    ONBOARDING_QA[normalize(key)] = val;
  }

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);

    // --- Local onboarding Q&A: answer common questions without the LLM ---
    const normMsg = normalize(msg);
    let localResponse: string | undefined;

    // Exact normalized match against the local Q&A dictionary
    if (onboarding) {
      localResponse = ONBOARDING_QA[normMsg];
    }

    if (localResponse) {
      const cmdResults = await executeCommands(localResponse);
      const cleanContent = stripCommands(localResponse);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: cleanContent,
        commandResults: cmdResults.length > 0 ? cmdResults : undefined,
      }]);
      return;
    }

    // --- Onboarding fast path: "yes" without needing the LLM ---
    const isOnboarding = nodes.length === 0 && edges.length === 0 && onboarding;
    if (isOnboarding && ONBOARDING_YES.has(normMsg)) {
      const explain = "Let's build your first agent! I'm setting up a minimal template on the canvas now — you'll see nodes appear in a moment.";
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: explain,
      }]);
      window.dispatchEvent(new CustomEvent('vibeful:load-template', { detail: 'minimal' }));
      setLoading(false);
      // Keep onboarding=true so follow-up Q&A still uses local fast path
      return;
    }

    setLoading(true);
    clearLastAIError();

    try {
      const command = await processAICommand(msg, nodes, edges);

      if (command) {
        // Explain commands: parse commands from explanation, show text, no Apply button
        if (command.action === 'explain') {
          let cmdResults = await executeCommands(command.explanation);
          // If the LLM decided to explain but didn't embed commands, and nodes exist, append a tour
          if (cmdResults.length === 0 && nodes.length > 0) {
            const tourSteps = nodes.map((n) => ({
              node: n.data.label as string,
              explanation: n.data.nodeType
                ? `${n.data.label} (${n.data.nodeType.replace('builtin.', '')})`
                : n.data.label as string,
            }));
            const tourCmd = `\`\`\`vibeful-command\n${JSON.stringify({ action: 'start_tour', details: { steps: tourSteps } })}\n\`\`\``;
            const augmentedExplanation = command.explanation + '\n\n' + tourCmd;
            cmdResults = await executeCommands(augmentedExplanation);
            command.explanation = augmentedExplanation;
          }
          const cleanContent = stripCommands(command.explanation);
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: cleanContent || command.explanation,
            commandResults: cmdResults.length > 0 ? cmdResults : undefined,
          }]);
        } else {
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
        }
      } else {
        const hint = lastAIError
          ? `Reason: ${lastAIError}`
          : 'Your DeepSeek API key may not be configured yet.';
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: `AI service unavailable. ${hint}`,
          },
        ]);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error('[Vibeful] processAICommand failed:', e);
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: `AI engine error: ${errMsg}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCommand = (command: AICommand) => {
    if (command.action === 'explain') {
      return; // No action to apply for conversational responses
    }
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

              {/* Apply button — hidden for explain-only commands */}
              {msg.command && msg.command.action !== 'explain' && (
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
  );
}
