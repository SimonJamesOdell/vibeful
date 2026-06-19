// VibefulApp — Tier 3 Agent-Centric Greenfield shell.
//
// A full-page React component where the agent IS the application.
// Combines VibefulChat, WidgetRenderer, and routing into one shell.
// No host app needed — the agent is the platform.
//
// Usage:
//   <VibefulApp agentId="my-agent" />

import React, { useState, useCallback } from 'react';
import { VibefulChat } from './VibefulChat';
import { WidgetRenderer } from './WidgetRenderer';
import { useVibefulAgent } from '../hooks/useVibefulAgent';
import { useHostCommands } from '../hooks/useHostCommands';
import type { WidgetSpec, WidgetEvent } from '@vibeful/shared';

export interface VibefulAppProps {
  agentId: string;
  contextIds?: string[];
  mcpUrls?: string[];
  /** Optional page title */
  title?: string;
  /** Optional host context for agent awareness */
  context?: Record<string, unknown>;
  /** Callback for widget events (button clicks, form submits) */
  onWidgetEvent?: (event: WidgetEvent) => void;
}

export function VibefulApp({
  agentId,
  contextIds,
  mcpUrls,
  title = 'Vibeful',
  context,
  onWidgetEvent,
}: VibefulAppProps) {
  const [navStack, setNavStack] = useState<string[]>(['/']);
  const currentRoute = navStack[navStack.length - 1];

  const {
    messages, streaming, loading, usage, citations, followUps, quickReplies, widgets,
    send, handleQuickReply,
  } = useVibefulAgent({ agentId, contextIds, mcpUrls, context });

  // Register host commands so the agent can control the app shell
  useHostCommands({
    navigate: useCallback(({ route }: Record<string, unknown>) => {
      if (typeof route === 'string') {
        setNavStack((prev) => [...prev, route]);
      }
    }, []),
    'open-modal': useCallback(({ id, title, content }: Record<string, unknown>) => {
      // Simple modal via state — host apps can override with custom handlers
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999';
      modal.innerHTML = `<div style="background:#fff;border-radius:12px;padding:2rem;max-width:500px;width:90%">
        <h3 style="margin:0 0 1rem">${title || 'Notification'}</h3>
        <p style="margin:0 0 1rem;color:#4b5563">${content || ''}</p>
        <button onclick="this.closest('[style*=\\'fixed\\']').remove()" style="padding:0.5rem 1rem;border-radius:6px;border:none;background:#6366f1;color:#fff;cursor:pointer">OK</button>
      </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }, []),
    'set-theme': useCallback(({ theme }: Record<string, unknown>) => {
      if (typeof theme === 'string') {
        document.documentElement.setAttribute('data-theme', theme);
      }
    }, []),
    'show-toast': useCallback(({ message, type }: Record<string, unknown>) => {
      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed;bottom:2rem;right:2rem;padding:0.75rem 1.5rem;border-radius:8px;color:#fff;font-size:0.9rem;z-index:9999;animation:fadeIn 0.3s;background:${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#6366f1'}`;
      toast.textContent = String(message || '');
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
    }, []),
  });

  return (
    <div className="vibeful-app" style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', background: '#f9fafb' }}>
      {/* Header */}
      <header style={{ padding: '0.75rem 1.5rem', background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{title}</h1>
        {navStack.length > 1 && (
          <button
            onClick={() => setNavStack((prev) => prev.slice(0, -1))}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff', cursor: 'pointer' }}
          >
            ← Back
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#9ca3af' }}>{currentRoute}</span>
      </header>

      {/* Body: widgets + chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '1rem', gap: '1rem' }}>
        {/* Widgets area */}
        {widgets.length > 0 && (
          <div style={{ flex: '0 0 auto' }}>
            <WidgetRenderer widgets={widgets} onWidgetEvent={onWidgetEvent} />
          </div>
        )}

        {/* Chat area */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <VibefulChat
            agentId={agentId}
            messages={messages}
            streaming={streaming}
            loading={loading}
            usage={usage}
            citations={citations}
            followUps={followUps}
            quickReplies={quickReplies}
            onQuickReply={handleQuickReply}
            onSend={send}
            widgets={widgets}
            onWidgetEvent={onWidgetEvent}
          />
        </div>
      </div>
    </div>
  );
}
