/** VibefulTransport — connects to a Vibeful agent engine via REST API. */

import type { Transport, TransportConfig, Message, ConversationChunk } from './types';

export class VibefulTransport implements Transport {
  private baseUrl: string;
  private apiKey?: string;

  constructor(baseUrl = 'http://localhost:8000', apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      h['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  async sendMessage(
    messages: Message[],
    config?: TransportConfig,
  ): Promise<ConversationChunk[]> {
    const lastMsg = messages[messages.length - 1];
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messages,
        model: config?.model,
      }),
    });
    const data = await res.json();
    return data.chunks || [data];
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
