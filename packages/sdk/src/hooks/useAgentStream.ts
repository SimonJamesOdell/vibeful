import { useState, useCallback, useRef, useEffect } from 'react';

/** A single streaming event from the agent. */
export interface StreamEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'complete' | 'error';
  /** Text chunk (for 'token' events). */
  text?: string;
  /** Tool call data (for 'tool_call' and 'tool_result' events). */
  tool?: {
    name: string;
    arguments?: Record<string, unknown>;
    result?: unknown;
  };
  /** Usage data (for 'complete' events). */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /** Error message (for 'error' events). */
  message?: string;
}

/** Options for useAgentStream hook. */
export interface UseAgentStreamOptions {
  baseUrl?: string;
  agentId?: string;
  /** Called for each streaming event. */
  onEvent?: (event: StreamEvent) => void;
}

/** Return type of useAgentStream hook. */
export interface UseAgentStreamReturn {
  /** Accumulated full response text. */
  text: string;
  /** Accumulated tool calls. */
  toolCalls: Array<StreamEvent['tool'] & { result?: unknown }>;
  /** True while streaming. */
  streaming: boolean;
  /** True when stream has completed. */
  done: boolean;
  /** Error if stream failed. */
  error: string | null;
  /** Start streaming a message to the agent. */
  stream: (message: string, overrides?: {
    agentId?: string;
    systemPrompt?: string;
  }) => void;
  /** Reset accumulated text, tool calls, and error. */
  reset: () => void;
}

/**
 * React hook for streaming agent responses via Server-Sent Events (SSE).
 *
 * Use this for chat interfaces, real-time dashboards, or any UX that benefits
 * from incremental response rendering rather than waiting for the full response.
 *
 * @example
 * ```tsx
 * const { text, streaming, done, stream } = useAgentStream({
 *   agentId: 'agent-123',
 *   onEvent: (event) => {
 *     if (event.type === 'tool_call') console.log('Tool called:', event.tool?.name);
 *   },
 * });
 *
 * <button onClick={() => stream('What is the weather?')}>Ask</button>
 * <pre>{streaming ? text + '▊' : text}</pre>
 * ```
 */
export function useAgentStream(options: UseAgentStreamOptions = {}): UseAgentStreamReturn {
  const { baseUrl = '', agentId: defaultAgentId, onEvent } = options;
  const [text, setText] = useState('');
  type ToolEntry = StreamEvent['tool'] & { result?: unknown };
  const [toolCalls, setToolCalls] = useState<ToolEntry[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setText('');
    setToolCalls([]);
    setStreaming(false);
    setDone(false);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const stream = useCallback(
    async (message: string, overrides: Parameters<UseAgentStreamReturn['stream']>[1] = {}) => {
      const agentId = overrides.agentId || defaultAgentId;
      if (!agentId) throw new Error('agentId is required');

      // Reset state for new stream
      if (abortRef.current) abortRef.current.abort();
      setText('');
      setToolCalls([]);
      setStreaming(true);
      setDone(false);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const resp = await fetch(`${baseUrl}/v1/agents/${agentId}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            system_prompt: overrides.systemPrompt,
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || 'Stream request failed');
        }

        const reader = resp.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));
              switch (event.type) {
                case 'token':
                  setText((prev) => prev + (event.text || ''));
                  break;
                case 'tool_call':
                  if (event.tool) setToolCalls((prev) => [...prev, event.tool as NonNullable<StreamEvent['tool']>]);
                  break;
                case 'tool_result':
                  setToolCalls((prev) =>
                    prev.map((t, i) =>
                      i === prev.length - 1 ? { ...t, result: event.tool?.result } : t,
                    ),
                  );
                  break;
                case 'complete':
                  setDone(true);
                  setStreaming(false);
                  break;
                case 'error':
                  setError(event.message || 'Stream error');
                  setStreaming(false);
                  break;
              }
              onEvent?.(event);
            } catch {
              // Skip malformed events
            }
          }
        }

        // Process remaining buffer
        if (buffer.startsWith('data: ') && buffer !== 'data: [DONE]') {
          try {
            const event: StreamEvent = JSON.parse(buffer.slice(6));
            if (event.type === 'complete') {
              setDone(true);
              setStreaming(false);
            }
            onEvent?.(event);
          } catch { /* skip */ }
        }

        setStreaming(false);
        setDone(true);
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        setStreaming(false);
      }
    },
    [baseUrl, defaultAgentId, onEvent],
  );

  return { text, toolCalls, streaming, done, error, stream, reset };
}