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

## Agent Versions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/agents/:id/versions` | List version history |
| `GET` | `/v1/agents/:id/versions/:vid` | Get specific version |
| `POST` | `/v1/agents/:id/versions` | Save a new version |
| `POST` | `/v1/agents/:id/versions/:vid/restore` | Restore agent to a previous version |

### Save Version Body

```json
{
  "config": { "nodes": [...], "edges": [...], "agentName": "..." },
  "yaml_str": "name: Support Agent\n...",
  "author": "human",
  "change_description": "Added attack guard node",
  "tags": ["security"]
}
```

## A/B Tests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/ab-tests` | Create A/B test |
| `GET` | `/v1/ab-tests` | List tests (optional `?agent_id=`) |
| `POST` | `/v1/ab-tests/:id/start` | Start test (begin traffic splitting) |
| `POST` | `/v1/ab-tests/:id/stop` | Stop test and declare winner |
| `GET` | `/v1/ab-tests/:id/results` | Get test results with statistics |

## Performance & Regression

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/agents/:id/performance` | Get per-node performance metrics |
| `POST` | `/v1/agents/:id/baseline` | Establish performance baseline |

## Glyphs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/glyphs` | List all glyphs |
| `POST` | `/v1/glyphs` | Create or update a glyph |
| `DELETE` | `/v1/glyphs/:name` | Delete a glyph by name |

### Glyph Object

```json
{
  "name": "recursion",
  "symbol": "🌀",
  "description": "Recursive depth and self-reference",
  "glyphset": "meta"
}
```

## Concepts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/concepts` | List concepts (`?domain=`&`search=`) |

## Global Memories

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/global-memories` | List global memories (`?type=system_ontology`) |

## Token Credits

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/tokens/balance` | Get balance (`?user_identity=`&`agent_id=`) |
| `POST` | `/v1/tokens/credit` | Add credits to a user |
| `GET` | `/v1/tokens/transactions` | Transaction history (`?user_identity=`&`limit=`) |

### Credit Request Body

```json
{
  "user_identity": "user-123",
  "amount": 10000,
  "transaction_type": "purchase",
  "description": "Monthly top-up",
  "agent_id": "agent-abc"
}
```

## AI Assist

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/ai/assist` | Natural language → graph mutations |

### Request Body

```json
{
  "system_prompt": "You are an AI assistant for the Vibeful visual agent designer...",
  "message": "Add an attack guard at the start",
  "temperature": 0.2,
  "max_tokens": 500
}
```

## Analysis Configuration

Configure per-agent analysis pipeline in the agent config:

```json
{
  "analysis": {
    "enabled": true,
    "phases": {
      "memories": { "enabled": true, "temperature": 0.2 },
      "impressions": { "enabled": true, "temperature": 0.5 },
      "concepts": { "enabled": false },
      "conductor": { "enabled": true, "temperature": 0.5 },
      "code_detect": { "enabled": true, "temperature": 0.5 }
    }
  }
}
```

**Phases:** `memories`, `impressions`, `concepts`, `assumptions`, `intent`, `conductor`, `code_detect`, `search_detect`, `global_memories`, `next`, `search_execute`, `output_routing`

## Authentication

All endpoints (except `/health`) require an API key:
```
Authorization: Bearer dev-key-123
```
or
```
X-API-Key: dev-key-123
```
