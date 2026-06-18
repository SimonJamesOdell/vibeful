# SDK Integration Guide

Embed AI agents into any web application. Three integration options — pick the one that fits your stack.

## Option 1: HTML Script Tag (Any Website)

Add this to any HTML page:

```html
<!-- 1. Add a container for the chat widget -->
<div id="vibeful-chat" style="max-width:400px;height:500px"></div>

<!-- 2. Include the Vibeful SDK -->
<script src="https://cdn.vibeful.ai/sdk/vibeful-sdk.umd.js"></script>

<!-- 3. Mount the agent -->
<script>
VibefulSDK.mount({
  target: '#vibeful-chat',
  agentId: 'YOUR_AGENT_ID',
  theme: {
    '--vibeful-user-bg': '#7c3aed',
    '--vibeful-send-bg': '#7c3aed'
  }
});
</script>
```

## Option 2: React Component

```bash
npm install @vibeful/sdk
```

```tsx
import { VibefulChat, useVibefulAgent } from '@vibeful/sdk';

function MySupportPage() {
  const { messages, streaming, loading, citations, followUps, send } =
    useVibefulAgent({ agentId: 'YOUR_AGENT_ID' });

  return (
    <VibefulChat
      agentId="YOUR_AGENT_ID"
      messages={messages}
      streaming={streaming}
      loading={loading}
      citations={citations}
      followUps={followUps}
      onSend={send}
      theme={{
        '--vibeful-user-bg': '#7c3aed'
      }}
    />
  );
}
```

## Option 3: REST API (Any Framework)

```javascript
// 1. Create a session (binds agent + knowledge)
const session = await fetch('https://your-instance:3000/v1/sessions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({ agent_id: 'YOUR_AGENT_ID' })
}).then(r => r.json());

// 2. Send a message
const response = await fetch(
  `https://your-instance:3000/v1/sessions/${session.session_id}/converse`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_API_KEY'
    },
    body: JSON.stringify({ content: 'Hello!' })
  }
).then(r => r.json());

// 3. Display the response
// response.chunks contains streaming text, tool calls, citations, and follow-ups
```

## Theming

Customize the chat widget with CSS custom properties:

| Variable | Default | Description |
|----------|---------|-------------|
| `--vibeful-user-bg` | `#2563eb` | User message bubble color |
| `--vibeful-user-text` | `#fff` | User message text color |
| `--vibeful-bot-bg` | `#f3f4f6` | Agent message bubble color |
| `--vibeful-bot-text` | `#111` | Agent message text color |
| `--vibeful-send-bg` | `#2563eb` | Send button color |
| `--vibeful-border` | `#e0e0e0` | Border color |
| `--vibeful-input-bg` | `#fff` | Input background |
| `--vibeful-input-text` | `#111` | Input text color |
