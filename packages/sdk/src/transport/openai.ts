/** OpenAITransport — connects to any OpenAI-compatible chat completions API.

Works with OpenAI, DeepSeek, Anthropic (via compatible proxy), local models, etc.
*/

import type { Transport, TransportConfig, Message, ConversationChunk } from './types';

export class OpenAITransport implements Transport {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl = 'https://api.openai.com/v1', apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  async sendMessage(
    messages: Message[],
    config?: TransportConfig,
  ): Promise<ConversationChunk[]> {
    const key = config?.apiKey || this.apiKey;
    if (!key) {
      return [{ state: 'COMPLETED', error: 'No API key provided' }];
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: config?.model || 'gpt-4o',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return [{ state: 'COMPLETED', error: `API error: ${res.status} ${err}` }];
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};

    return [{
      state: 'COMPLETED',
      text_chunk: content,
      usage: {
        prompt_tokens: usage.prompt_tokens || 0,
        completion_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
        cost_usd: 0,
      },
    }];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
