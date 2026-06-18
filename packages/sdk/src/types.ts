import type { Transport, TransportConfig } from './transport';

export interface VibefulChatProps {
  /** Agent ID (for Vibeful backend). */
  agentId?: string;
  /** Pluggable transport — use VibefulTransport, OpenAITransport, or custom. */
  transport?: Transport;
  /** Transport config (apiKey, model, baseUrl). */
  transportConfig?: TransportConfig;
  /** Placeholder text in the input field. */
  placeholder?: string;
  /** CSS custom properties for theming. */
  theme?: Record<string, string>;
}
