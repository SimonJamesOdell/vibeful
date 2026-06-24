import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User, Loader2, Play } from 'lucide-react';
import { loadAgentStyling, applyStylingToDOM, PRESET_STYLES, normalizePreset } from './StylingModal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentConfig {
  system_prompt: string;
  temperature: number;
  model: string;
  context_ids: string[];
  mcp_server_urls: string[];
}

/** Snapshot + restore CSS custom properties set by applyStylingToDOM */
function snapshotStylingVars(): Record<string, string> {
  const root = document.documentElement;
  return {
    bg: root.style.getPropertyValue('--vibeful-bg'),
    fg: root.style.getPropertyValue('--vibeful-fg'),
    font: root.style.getPropertyValue('--vibeful-font'),
    fontSize: root.style.getPropertyValue('--vibeful-font-size'),
  };
}

function restoreStylingVars(prev: Record<string, string>) {
  const root = document.documentElement;
  if (prev.bg) root.style.setProperty('--vibeful-bg', prev.bg); else root.style.removeProperty('--vibeful-bg');
  if (prev.fg) root.style.setProperty('--vibeful-fg', prev.fg); else root.style.removeProperty('--vibeful-fg');
  if (prev.font) root.style.setProperty('--vibeful-font', prev.font); else root.style.removeProperty('--vibeful-font');
  if (prev.fontSize) root.style.setProperty('--vibeful-font-size', prev.fontSize); else root.style.removeProperty('--vibeful-font-size');
}

export default function TestChatModal({ agentId, agentName, onClose }: { agentId: string | null; agentName: string; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: `Hi! I'm **${agentName}**. Ask me anything to test how I respond.`,
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [stylingPreset, setStylingPreset] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevVarsRef = useRef<Record<string, string>>({});

  // Fetch agent config and styling on mount
  useEffect(() => {
    if (!agentId) { setConfigLoaded(true); return; }
    // Snapshot current CSS vars before applying agent styling
    prevVarsRef.current = snapshotStylingVars();

    fetch(`/v1/agents/${agentId}`)
      .then((r) => r.json())
      .then((agent) => {
        setAgentConfig({
          system_prompt: agent.system_prompt || '',
          temperature: agent.temperature ?? 0.7,
          model: agent.model || 'deepseek-chat',
          context_ids: Array.isArray(agent.context_ids) ? agent.context_ids : [],
          mcp_server_urls: Array.isArray(agent.mcp_server_urls) ? agent.mcp_server_urls : [],
        });
        // Apply agent styling to DOM
        const preset = loadAgentStyling(agent);
        if (preset) {
          setStylingPreset(preset);
          applyStylingToDOM(preset);
        }
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, [agentId]);

  // Restore previous styling vars on unmount
  useEffect(() => {
    return () => {
      restoreStylingVars(prevVarsRef.current);
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || !agentId) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const resp = await fetch('/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          system_prompt: agentConfig?.system_prompt || `You are ${agentName}. Be helpful and concise.`,
          model: agentConfig?.model || 'deepseek-chat',
          temperature: agentConfig?.temperature ?? 0.7,
          max_tokens: 4096,
          context_ids: agentConfig?.context_ids || [],
          mcp_server_urls: agentConfig?.mcp_server_urls || [],
        }),
      });
      const data = await resp.json();
      if (data.session_id) setSessionId(data.session_id);
      const reply = data.response || data.content || 'No response.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, the agent is not reachable right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Resolve CSS variable values for dynamic styling
  const cssVar = (name: string, fallback: string) => `var(${name}, ${fallback})`;

  const handleClose = () => {
    restoreStylingVars(prevVarsRef.current);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="border border-slate-700 rounded-2xl shadow-2xl w-[480px] max-h-[640px] flex flex-col overflow-hidden"
        style={{
          backgroundColor: cssVar('--vibeful-bg', '#0f172a'),
          fontFamily: cssVar('--vibeful-font', '"Inter", sans-serif'),
          fontSize: cssVar('--vibeful-font-size', '14px'),
          color: cssVar('--vibeful-fg', '#e2e8f0'),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700" style={{ backgroundColor: 'var(--vibeful-bg, #1e293b)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: cssVar('--vibeful-fg', '#4f46e5') }}>
              <Play size={14} style={{ color: cssVar('--vibeful-bg', '#ffffff') }} />
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: cssVar('--vibeful-fg', '#e2e8f0') }}>Test: {agentName}</div>
              <div className="text-[10px] text-slate-500">
                {!configLoaded ? 'Loading agent config…' : !agentId ? 'No agent selected' : agentConfig?.context_ids?.length ? `Using ${agentConfig.context_ids.length} knowledge base(s)` : 'No knowledge bases attached'}
              </div>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] max-h-[420px]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role !== 'user' && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `linear-gradient(135deg, ${cssVar('--vibeful-fg', '#4f46e5')}, ${cssVar('--vibeful-bg', '#9333ea')})` }}
                >
                  <Bot size={11} className="text-white" />
                </div>
              )}
              <div
                className="max-w-[80%] rounded-lg px-3 py-2 text-xs"
                style={{
                  backgroundColor: msg.role === 'user'
                    ? cssVar('--vibeful-fg', '#4f46e5')
                    : cssVar('--vibeful-bg', '#1e293b'),
                  color: msg.role === 'user'
                    ? cssVar('--vibeful-bg', '#ffffff')
                    : cssVar('--vibeful-fg', '#e2e8f0'),
                }}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User size={11} className="text-slate-300" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${cssVar('--vibeful-fg', '#4f46e5')}, ${cssVar('--vibeful-bg', '#9333ea')})` }}
              >
                <Bot size={11} className="text-white" />
              </div>
              <div className="rounded-lg px-3 py-2" style={{ backgroundColor: cssVar('--vibeful-bg', '#1e293b') }}>
                <Loader2 size={12} className="animate-spin" style={{ color: cssVar('--vibeful-fg', '#818cf8') }} />
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
            placeholder={agentId ? 'Type a test message…' : 'Select an agent to test'}
            disabled={!agentId}
            className="flex-1 border border-slate-600 rounded-lg px-3 py-2 text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            style={{
              backgroundColor: cssVar('--vibeful-bg', '#1e293b'),
              color: cssVar('--vibeful-fg', '#e2e8f0'),
              borderColor: cssVar('--vibeful-fg', 'rgb(71, 85, 105)'),
              opacity: 0.4,
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || !agentId}
            className="px-3 py-2 disabled:opacity-50 text-white rounded-lg transition-colors"
            style={{ backgroundColor: cssVar('--vibeful-fg', '#4f46e5'), color: cssVar('--vibeful-bg', '#ffffff') }}
          >
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}