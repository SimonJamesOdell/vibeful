# API Reference

All endpoints are available at `http://localhost:3000/v1/`.

## Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/agents` | Create an agent |
| `GET` | `/v1/agents` | List all agents |
| `GET` | `/v1/agents/:id` | Get agent details |
| `PUT` | `/v1/agents/:id` | Update agent |
| `DELETE` | `/v1/agents/:id` | Delete agent |

### Agent Config Fields

```json
{
  "name": "Support Agent",
  "description": "Handles customer inquiries",
  "system_prompt": "You are a helpful support agent.",
  "model": "deepseek-chat",
  "temperature": 0.7,
  "max_tokens": 4096,
  "personality": "friendly and professional",
  "tone": "professional",
  "icebreaker": "Hello! How can I help you today?",
  "policy": "Do not discuss pricing",
  "context_ids": ["ctx-123"],
  "mcp_server_urls": ["http://mcp-web-search:3100"],
  "quick_replies": [
    {"label": "Refund policy", "message": "What is your refund policy?"}
  ]
}
```

## Knowledge Contexts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/contexts` | Create knowledge context |
| `GET` | `/v1/contexts` | List contexts |
| `GET` | `/v1/contexts/:id` | Get context |
| `POST` | `/v1/contexts/:id/ingest` | Ingest text (chunk → embed → store) |

## Sessions & Conversation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/sessions` | Create session (binds agent + contexts) |
| `POST` | `/v1/sessions/:id/converse` | Send message, get agent response |
| `GET` | `/v1/sessions/:id` | Get session with message history |

### Converse Response

```json
{
  "session_id": "...",
  "chunks": [
    {"state": "RESPONSE_STATE_REFERENCES", "text_chunk": "Found 2 sources."},
    {"state": "RESPONSE_STATE_STREAMING", "text_chunk": "The capital..."},
    {"state": "RESPONSE_STATE_TOOL_USED", "tool_call": {"name": "web_search"}},
    {"state": "RESPONSE_STATE_COMPLETED", "usage": {"total_tokens": 150, "cost_usd": 0.0003}},
    {"state": "RESPONSE_STATE_REFERENCES", "citations": [{"filename": "france-facts.txt", "similarity": 0.92}]},
    {"state": "RESPONSE_STATE_FOLLOW_UP", "follow_up_questions": ["What about..."]}
  ]
}
```

## MCP Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/mcp-servers` | Register MCP server |
| `GET` | `/v1/mcp-servers` | List servers |

## Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/events` | Query structured events |
| `GET` | `/v1/cost` | Cost aggregation |
| `GET` | `/v1/analytics/usage` | Usage statistics |
| `GET` | `/v1/analytics/knowledge-gaps` | Unanswered questions |
| `GET` | `/v1/analytics/themes` | Intent cohort themes |

## Agent Memory (Facts)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/facts/recall` | Recall facts about a user |
| `DELETE` | `/v1/facts/:id` | Delete specific fact |
| `DELETE` | `/v1/facts` | Delete all facts (GDPR) |

## Threads

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/threads` | Create event-driven thread |
| `GET` | `/v1/threads/:id` | Get thread status |
| `POST` | `/v1/threads/:id/deliver` | Mark thread as delivered |

## Authentication

All endpoints (except `/health`) require an API key:
```
Authorization: Bearer dev-key-123
```
or
```
X-API-Key: dev-key-123
```
