import React, { useState, useRef, useEffect } from 'react';
import type { Message } from '../client';
import type { Citation, QuickReply } from '../hooks/useVibefulAgent';
import { WidgetRenderer, type WidgetRendererProps } from './WidgetRenderer';
import type { WidgetSpec, WidgetEvent } from '@vibeful/shared';

interface VibefulChatProps {
  agentId: string;
  contextIds?: string[];
  mcpUrls?: string[];
  placeholder?: string;
  theme?: Record<string, string>;
  onSend?: (content: string) => Promise<void>;
  messages?: Message[];
  streaming?: string;
  loading?: boolean;
  usage?: { total_tokens: number; cost_usd: number } | null;
  citations?: Citation[];
  followUps?: string[];
  quickReplies?: QuickReply[];
  onQuickReply?: (reply: QuickReply) => void;
  widgets?: WidgetSpec[];
  onWidgetEvent?: (event: WidgetEvent) => void;
}

export function VibefulChat({
  placeholder = 'Type a message...',
  theme = {},
  onSend,
  messages = [],
  streaming = '',
  loading = false,
  usage = null,
  citations = [],
  followUps = [],
  quickReplies = [],
  onQuickReply,
  widgets = [],
  onWidgetEvent,
}: VibefulChatProps) {
  const [input, setInput] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleSend = () => {
    if (!input.trim() || loading) return;
    onSend?.(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const cssVars = { ...theme } as React.CSSProperties;

  return (
    <div
      className="vibeful-chat"
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '600px',
        border: '1px solid var(--vibeful-border, #e0e0e0)', borderRadius: '8px',
        overflow: 'hidden', fontFamily: 'system-ui, sans-serif', ...cssVars,
      }}
    >
      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              marginBottom: '0.75rem', display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '80%', padding: '0.5rem 0.75rem', borderRadius: '12px',
                background: msg.role === 'user' ? 'var(--vibeful-user-bg, #2563eb)' : 'var(--vibeful-bot-bg, #f3f4f6)',
                color: msg.role === 'user' ? 'var(--vibeful-user-text, #fff)' : 'var(--vibeful-bot-text, #111)',
                whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5,
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {streaming && (
          <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                maxWidth: '80%', padding: '0.5rem 0.75rem', borderRadius: '12px',
                background: 'var(--vibeful-bot-bg, #f3f4f6)',
                color: 'var(--vibeful-bot-text, #111)',
                whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5,
              }}
            >
              {streaming}
              <span style={{ animation: 'blink 1s infinite' }}>▌</span>
            </div>
          </div>
        )}
        {loading && !streaming && (
          <div style={{ textAlign: 'center', color: '#999', padding: '0.5rem' }}>Thinking...</div>
        )}

        {/* Citations */}
        {citations.length > 0 && (
          <div style={{ margin: '0.75rem 0', padding: '0.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem' }}>Sources</div>
            {citations.map((c, i) => (
              <div key={i} style={{ fontSize: '0.75rem', color: '#334155', marginBottom: '0.15rem' }}>
                <span style={{ color: '#2563eb', fontWeight: 600 }}>[{i + 1}]</span>{' '}
                <span style={{ fontStyle: 'italic' }}>{c.filename}</span>
                {c.similarity > 0 && <span style={{ color: '#94a3b8' }}> ({(c.similarity * 100).toFixed(0)}%)</span>}
                {c.text_snippet && (
                  <span style={{ color: '#64748b' }}> — "{c.text_snippet.substring(0, 100)}…"</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Follow-up questions */}
        {followUps.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {followUps.map((q, i) => (
              <button
                key={i}
                onClick={() => onSend?.(q)}
                disabled={loading}
                style={{
                  padding: '0.3rem 0.6rem', fontSize: '0.8rem', borderRadius: '16px',
                  border: '1px solid var(--vibeful-border, #e0e0e0)',
                  background: '#fff', color: '#334155', cursor: loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Quick replies */}
        {quickReplies.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {quickReplies.map((r, i) => (
              <button
                key={i}
                onClick={() => onQuickReply?.(r)}
                disabled={loading}
                style={{
                  padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '16px',
                  border: 'none', background: 'var(--vibeful-user-bg, #2563eb)',
                  color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap', fontWeight: 500,
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Widgets rendered inline between messages and input */}
        {widgets.length > 0 && (
          <div style={{ padding: '0 1rem 0.5rem' }}>
            <WidgetRenderer widgets={widgets} onWidgetEvent={onWidgetEvent} />
          </div>
        )}

        <div ref={messagesEnd} />
      </div>

      {/* Usage */}
      {usage && (
        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: '#999', padding: '0 1rem' }}>
          {usage.total_tokens} tokens · ${usage.cost_usd.toFixed(4)}
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', padding: '0.75rem', borderTop: '1px solid var(--vibeful-border, #e0e0e0)' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={loading}
          rows={2}
          style={{
            flex: 1, border: '1px solid var(--vibeful-border, #e0e0e0)',
            borderRadius: '8px', padding: '0.5rem', fontSize: '0.9rem',
            resize: 'none', fontFamily: 'inherit',
            background: 'var(--vibeful-input-bg, #fff)',
            color: 'var(--vibeful-input-text, #111)',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            marginLeft: '0.5rem', padding: '0.5rem 1rem',
            background: loading ? '#93c5fd' : 'var(--vibeful-send-bg, #2563eb)',
            color: '#fff', border: 'none', borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
