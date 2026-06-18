// Dev Harness — full Vibeful platform demo with tabs
import React, { useState } from 'react';
import { VibefulChat } from './components/VibefulChat';
import { AgentManager } from './components/AgentManager';
import { ContextManager } from './components/ContextManager';
import { McpManager } from './components/McpManager';
import { ObservabilityDashboard } from './components/ObservabilityDashboard';
import { useVibefulAgent } from './hooks/useVibefulAgent';

const TABS = ['Chat', 'Agents', 'Contexts', 'MCP Servers', 'Observability'] as const;
type Tab = (typeof TABS)[number];

export function DevHarness() {
  const [tab, setTab] = useState<Tab>('Chat');
  const [agentId, setAgentId] = useState('');
  const { messages, streaming, loading, usage, citations, followUps, quickReplies, send, handleQuickReply } = useVibefulAgent({ agentId });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Vibeful</h1>
        <span style={{ color: '#999', fontSize: '0.8rem' }}>AI Agent Platform</span>
        <div style={{ flex: 1 }} />
        <input
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          placeholder="Agent ID (for Chat)"
          style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', border: '1px solid #d0d0d0', fontSize: '0.8rem', width: '280px' }}
        />
      </header>

      {/* Tabs */}
      <nav style={{ display: 'flex', borderBottom: '1px solid #e0e0e0', padding: '0 1.5rem' }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '0.6rem 1rem', border: 'none', background: 'transparent', cursor: 'pointer',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === t ? '#2563eb' : '#666', fontWeight: tab === t ? 600 : 400,
              fontSize: '0.85rem',
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'Chat' && (
          <div style={{ maxWidth: '600px', margin: '2rem auto', height: 'calc(100vh - 120px)' }}>
            {agentId ? (
              <VibefulChat agentId={agentId} messages={messages} streaming={streaming} loading={loading} usage={usage} citations={citations} followUps={followUps} quickReplies={quickReplies} onSend={send} onQuickReply={handleQuickReply} />
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '4rem' }}>Enter an Agent ID above to start chatting</div>
            )}
          </div>
        )}
        {tab === 'Agents' && <AgentManager />}
        {tab === 'Contexts' && <ContextManager />}
        {tab === 'MCP Servers' && <McpManager />}
        {tab === 'Observability' && <ObservabilityDashboard />}
      </main>
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')!).render(<DevHarness />);
