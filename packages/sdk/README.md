# @vibeful/sdk

Embeddable AI chat widget with pluggable transport — works with Vibeful, OpenAI, DeepSeek, or any compatible API.

```bash
npm install @vibeful/sdk
```

## Quick Start

```tsx
import { VibefulChat, OpenAITransport } from '@vibeful/sdk';

function App() {
  return (
    <VibefulChat
      transport={new OpenAITransport('https://api.openai.com/v1', 'sk-...')}
      transportConfig={{ model: 'gpt-4o' }}
    />
  );
}
```

## Transports

The SDK ships with two built-in transports:

| Transport | Backend | Use when |
|-----------|---------|----------|
| `OpenAITransport` | OpenAI, DeepSeek, any `/v1/chat/completions` | Quick start, no backend needed |
| `VibefulTransport` | Vibeful agent engine | Full platform features (RAG, MCP, sessions) |

### Custom Transport

Implement the `Transport` interface for any backend:

```ts
import type { Transport, Message, ConversationChunk } from '@vibeful/sdk';

const myTransport: Transport = {
  async sendMessage(messages, config) {
    const res = await fetch('https://my-api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, ...config }),
    });
    return res.json();
  },
};
```

## Components

| Component | Purpose |
|-----------|---------|
| `VibefulChat` | Main chat widget |
| `ShadowWrapper` | Shadow DOM style isolation |
| `WidgetRenderer` | Render tool-output widgets (charts, forms, tables) |
| `VoiceInput` | Speech-to-text input button |
| `VoiceOutput` | Text-to-speech output |
| `AgentManager` | Admin dashboard for agent config |
| `ContextManager` | Knowledge context upload and management |
| `McpManager` | MCP server configuration |
| `WidgetStudio` | Conversational widget builder |

## API

```tsx
<VibefulChat
  // Transport (required)
  transport={new OpenAITransport()}
  transportConfig={{ apiKey: 'sk-...', model: 'gpt-4o' }}

  // Vibeful-specific
  agentId="support-bot"

  // Styling
  placeholder="Ask me anything..."
  theme={{
    '--vibeful-primary': '#6366f1',
    '--vibeful-radius': '12px',
  }}
/>
```

## License

MIT
