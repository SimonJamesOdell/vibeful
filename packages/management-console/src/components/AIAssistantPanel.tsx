import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Wand2 } from 'lucide-react';
import { useFlowStore } from '../lib/flowStore';
import { processAICommand, applyAICommand, type AICommand } from '../lib/aiAssistant';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  command?: AICommand;
}

export default function AIAssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { nodes, edges, loadGraph } = useFlowStore();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const command = await processAICommand(msg, nodes, edges);

      if (command) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: command.explanation,
            command,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: "I couldn't process that command. Try something like 'add an attack guard' or 'enable impressions analysis'.",
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'system',
          content: 'Error connecting to AI service. Make sure the agent engine is running on port 50052.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyCommand = (command: AICommand) => {
    if (command.action === 'setup_template') {
      const { template } = command.details as { template: string };
      // Trigger template load via global event
      window.dispatchEvent(new CustomEvent('vibeful:load-template', { detail: template }));
      return;
    }

    if (command.action === 'configure_analysis') {
      const { phases } = command.details as { phases: Record<string, { enabled: boolean; temperature?: number }> };
      window.dispatchEvent(new CustomEvent('vibeful:configure-analysis', { detail: phases }));
      return;
    }

    const result = applyAICommand(command, nodes, edges);
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

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible(!visible)}
        className={`fixed bottom-4 right-4 z-50 p-3 rounded-full shadow-lg transition-colors ${
          visible ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
        }`}
        title="AI Assistant"
      >
        <Wand2 size={18} />
      </button>

      {/* Panel */}
      {visible && (
        <div className="fixed bottom-16 right-4 z-50 w-96 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col max-h-[500px]">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-indigo-400" />
              <span className="text-sm font-medium text-slate-200">AI Assistant</span>
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
            {messages.length === 0 && (
              <div className="text-xs text-slate-500 text-center py-6">
                <p className="mb-2">Describe what you want to build:</p>
                <p className="text-slate-600">
                  "Add an attack guard at the start"<br />
                  "Enable impressions analysis with temp 0.3"<br />
                  "Add a RAG node after the system prompt"
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role !== 'user' && (
                  <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {msg.role === 'assistant' ? (
                      <Bot size={12} className="text-indigo-400" />
                    ) : (
                      <span className="text-[10px] text-slate-400">!</span>
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : msg.role === 'system'
                      ? 'bg-yellow-900/50 text-yellow-200 border border-yellow-800'
                      : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  <p>{msg.content}</p>

                  {msg.command && (
                    <button
                      onClick={() => handleApplyCommand(msg.command!)}
                      className="mt-2 flex items-center gap-1 px-2 py-1 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors"
                    >
                      <Wand2 size={10} /> Apply
                    </button>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User size={12} className="text-white" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                  <Bot size={12} className="text-indigo-400" />
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
              placeholder="Describe a change…"
              className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              disabled={loading}
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="p-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white rounded transition-colors"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
