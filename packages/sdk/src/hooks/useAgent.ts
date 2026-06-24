import { useState, useCallback } from 'react';

/** Result from a headless agent invocation. */
export interface AgentResult {
  agent_id: string;
  session_id: string;
  response: string;
  tool_calls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
  }>;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: string | null;
  finished: boolean;
}

/** Options for useAgent hook. */
export interface UseAgentOptions {
  /** Base URL of the Vibeful agent engine (default: '' for same-origin). */
  baseUrl?: string;
  /** Default agent ID to invoke. */
  agentId?: string;
}

/** Return type of useAgent hook. */
export interface UseAgentReturn {
  /** Invoke an agent with a message and optional overrides. Returns the full result. */
  invoke: (message: string, overrides?: {
    agentId?: string;
    systemPrompt?: string;
    model?: string;
    temperature?: number;
    contextIds?: string[];
    mcpServerUrls?: string[];
  }) => Promise<AgentResult>;
  /** The result of the last invocation (null before first call). */
  result: AgentResult | null;
  /** True while a request is in flight. */
  loading: boolean;
  /** Error from the last failed invocation (null on success). */
  error: string | null;
  /** Clear the result, error, and loading state. */
  reset: () => void;
}

/**
 * React hook for headless agent invocation via the Vibeful execute API.
 *
 * Use this when you want programmatic control over agent conversations
 * rather than the embedded chat widget. Suitable for backend-driven
 * workflows, form handlers, or any non-chat-UI context.
 *
 * @example
 * ```tsx
 * const { invoke, result, loading } = useAgent({ agentId: 'agent-123' });
 *
 * const handleSubmit = async (formData: FormData) => {
 *   const res = await invoke(formData.message);
 *   console.log(res.response, res.tool_calls);
 * };
 * ```
 */
export function useAgent(options: UseAgentOptions = {}): UseAgentReturn {
  const { baseUrl = '', agentId: defaultAgentId } = options;
  const [result, setResult] = useState<AgentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  const invoke = useCallback(
    async (message: string, overrides: Parameters<UseAgentReturn['invoke']>[1] = {}) => {
      const agentId = overrides.agentId || defaultAgentId;
      if (!agentId) throw new Error('agentId is required (set it in options or overrides)');

      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${baseUrl}/v1/agents/${agentId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            system_prompt: overrides.systemPrompt,
            model: overrides.model,
            temperature: overrides.temperature,
            context_ids: overrides.contextIds,
            mcp_server_urls: overrides.mcpServerUrls,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || 'Agent execution failed');
        }

        const data: AgentResult = await resp.json();
        setResult(data);
        return data;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, defaultAgentId],
  );

  return { invoke, result, loading, error, reset };
}