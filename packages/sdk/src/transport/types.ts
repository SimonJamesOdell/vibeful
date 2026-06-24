/** Transport interface — pluggable backend for the chat SDK.

Implement this interface to connect VibefulChat to any agent backend.
Built-in transports: VibefulTransport, OpenAITransport.
*/

export interface AgentData {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  personality: string;
  tone: string;
  created_at: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface ConversationChunk {
  state: string;
  text_chunk?: string;
  tool_call?: { call_id: string; name: string; arguments: string };
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number };
  error?: string;
  citations?: unknown[];
  follow_up_questions?: string[];
  quick_replies?: unknown[];
}

export interface TransportConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  headers?: Record<string, string>;
}

export interface Transport {
  /** Send a message and receive response chunks. */
  sendMessage(
    messages: Message[],
    config?: TransportConfig,
  ): Promise<ConversationChunk[]>;

  /** Stream a response (yield chunks as they arrive). */
  streamMessage?(
    messages: Message[],
    config?: TransportConfig,
  ): AsyncIterable<ConversationChunk>;

  /** Check if the transport is healthy. */
  healthCheck?(): Promise<boolean>;
}
