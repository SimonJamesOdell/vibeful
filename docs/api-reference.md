# Vibeful API Reference

All endpoints are available at `http://localhost:50052` when running the agent engine.  
Authenticated endpoints require an API key passed as `Authorization: Bearer vf_...`.

---

## Agents

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/v1/agents` | — | Create an agent |
| `GET` | `/v1/agents` | — | List all agents |
| `GET` | `/v1/agents/:id` | — | Get agent details |
| `PUT` | `/v1/agents/:id` | — | Update agent config |
| `DELETE` | `/v1/agents/:id` | — | Delete agent |
| `POST` | `/v1/agents/:id/execute` | — | Headless invocation (returns response + tool calls + usage) |
| `POST` | `/v1/agents/:id/execute-keyed` | Key | Same as execute, requires API key |
| `POST` | `/v1/agents/:id/stream` | — | SSE streaming invocation |
| `GET` | `/v1/agents/:id/export` | — | Export agent as `.vibeful.yaml` bundle |
| `POST` | `/v1/agents/import` | — | Import agent from `.vibeful.yaml` |
| `POST` | `/v1/agents/promote` | — | Promote staging agent config to production |

### Agent Config Fields

```json
{
  "name": "Support Agent",
  "description": "Handles customer inquiries",
  "system_prompt": "You are a helpful support agent.",
  "model": "deepseek-chat",
  "temperature": 0.7,
  "max_tokens": 4096,
  "styling_json": "{...}",
  "context_ids": ["ctx-123"],
  "mcp_server_urls": ["http://localhost:3100"]
}
```

### Headless Execute

`POST /v1/agents/:id/execute`

```json
// Request
{
  "message": "What is 2+2?",
  "system_prompt": "Optional override",
  "model": "deepseek-chat",
  "temperature": 0.7,
  "context_ids": ["ctx-1"],
  "mcp_server_urls": ["http://localhost:3100"]
}

// Response
{
  "agent_id": "agent-123",
  "session_id": "sess-456",
  "response": "2 + 2 equals 4.",
  "tool_calls": [],
  "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
  "error": null,
  "finished": true
}
```

### SSE Streaming

`POST /v1/agents/:id/stream` — returns `text/event-stream`

```
data: {"type":"token","text":"2 + 2"}
data: {"type":"token","text":" equals"}
data: {"type":"tool_call","tool":{"name":"calculator","arguments":{"expression":"2+2"}}}
data: {"type":"tool_result","tool":{"result":4}}
data: {"type":"token","text":" 4."}
data: {"type":"complete","usage":{"total_tokens":25}}
data: [DONE]
```

### Export / Import

`GET /v1/agents/:id/export` returns a `.vibeful.yaml` file containing the full agent configuration.  
`POST /v1/agents/import` accepts `{"yaml_content": "..."}` and creates an agent from the bundle.

### Promote

`POST /v1/agents/promote` with `{"source_agent_id": "...", "target_agent_id": "..."}` copies system_prompt, model, temperature, config, and styling from source to target.

---

## MCP Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/mcp-servers` | List all servers (filter: `?agent_id=...`) |
| `POST` | `/v1/mcp-servers` | Register a server |
| `GET` | `/v1/mcp-servers/:id` | Get server details |
| `DELETE` | `/v1/mcp-servers/:id` | Delete server |
| `GET` | `/v1/mcp-servers/health` | Health-probes all registered servers |
| `POST` | `/v1/mcp-servers/builtin/start` | Start all built-in servers (Docker Compose) |
| `POST` | `/v1/mcp-servers/builtin/stop` | Stop all built-in servers |
| `POST` | `/v1/mcp-servers/:id/start` | Start a single built-in server |
| `POST` | `/v1/mcp-servers/:id/stop` | Stop a single built-in server |

### Registering a Server

```json
{
  "name": "my-tool",
  "url": "http://localhost:3105",
  "transport": "http",
  "auth_type": "none",
  "auth_header": "",
  "agent_id": null
}
```

### Health Check Response

```json
[
  {"id": "builtin-web-search", "name": "web-search", "healthy": true, "error": null},
  {"id": "builtin-calculator", "name": "calculator", "healthy": false, "error": "Connection refused"}
]
```

### Built-in Server IDs

| ID | Service Name | Port |
|----|-------------|------|
| `builtin-web-search` | `mcp-web-search` | 3100 |
| `builtin-file-read` | `mcp-file-read` | 3101 |
| `builtin-calculator` | `mcp-calculator` | 3102 |

---

## Agent Pages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/pages` | List pages (filter: `?agent_id=...`) |
| `POST` | `/v1/pages` | Create a page |
| `GET` | `/v1/pages/:id` | Get page by ID |
| `PUT` | `/v1/pages/:id` | Update page |
| `DELETE` | `/v1/pages/:id` | Delete page |
| `GET` | `/v1/pages/slug/:slug` | Get published page by slug |
| `POST` | `/v1/pages/:id/interact` | Send widget event to page's agent |

### Creating a Page

```json
{
  "agent_id": "agent-123",
  "slug": "about",
  "title": "About Us",
  "content_markdown": "# Welcome\n\nThis page is rendered by the agent.",
  "layout_json": "{}",
  "published": 1
}
```

### Widget Interaction (agent loop)

`POST /v1/pages/:id/interact`

```json
// Request — user clicked a button or submitted a form
{
  "widget_id": "form-1",
  "event_type": "submit",
  "value": null,
  "form_data": {"name": "Alice", "email": "alice@example.com"}
}

// Response — agent's update (may contain vibeful-command blocks)
{
  "page_id": "page-1",
  "response": "Thank you, Alice! Your form was submitted.\n\n```vibeful-command\n{\"action\":\"render_widget\",\"details\":{\"widget_id\":\"card-1\",\"type\":\"card\",\"props\":{\"title\":\"Submission Received\",\"content\":\"We'll be in touch.\"}}}\n```",
  "finished": true
}
```

Pages support `vibeful-command` blocks embedded in markdown for widget composition. See the SDK guide for widget types.

---

## API Keys

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/v1/api-keys` | — | Create a key (raw key returned once) |
| `GET` | `/v1/api-keys` | — | List keys (filter: `?agent_id=...`) |
| `DELETE` | `/v1/api-keys/:id` | — | Revoke a key |

### Create Key Response

```json
{
  "id": "key-1",
  "name": "production",
  "key_prefix": "vf_a1b2c3d4",
  "raw_key": "vf_a1b2c3d4e5f6...",  // Only returned once — save it now
  "agent_id": null,
  "revoked": 0
}
```

Authenticate requests with `Authorization: Bearer {raw_key}`. Keys are SHA-256 hashed in storage.

---

## Users & Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/users/register` | Register a new user (email + password) |
| `POST` | `/v1/users/login` | Login (returns user profile on success) |
| `POST` | `/v1/teams` | Create a team |
| `GET` | `/v1/teams` | List all teams |
| `POST` | `/v1/teams/:id/members` | Add a user to a team |
| `GET` | `/v1/teams/:id/members` | List team members (includes email + display_name) |

Passwords are SHA-256 hashed. Login returns user profile without the password_hash.

---

## Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/analytics` | Platform summary (agents, contexts, MCP, pages, per-agent breakdown) |
| `GET` | `/v1/analytics/per-agent` | Per-agent analytics (`?agent_id=...`) |

---

## Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/audit` | Event log (`?resource_type=agent&agent_id=...&limit=50`) |

---

## Agent Tests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/agent-tests` | Create a test case |
| `GET` | `/v1/agent-tests` | List test cases (`?agent_id=...`) |
| `DELETE` | `/v1/agent-tests/:id` | Delete a test case |
| `POST` | `/v1/agent-tests/:id/run` | Run a single test |
| `POST` | `/v1/agent-tests/run-all` | Run all tests for an agent (`?agent_id=...`) |

### Test Case

```json
{
  "agent_id": "agent-123",
  "name": "greeting test",
  "input_message": "Hello",
  "expected_contains": "Hi there",
  "expected_not_contains": "I don't know"
}
```

---

## Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/webhooks` | Register a webhook |

### Webhook Registration

```json
{
  "url": "https://myapp.example.com/hooks/vibeful",
  "events": ["conversation.completed", "page.published"]
}
```

Webhooks fire on `conversation.completed` with the full conversation result. Delivery is best-effort with a 10-second timeout.

---

## Knowledge Contexts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/contexts` | Create knowledge context |
| `GET` | `/v1/contexts` | List contexts |
| `GET` | `/v1/contexts/:id` | Get context |
| `POST` | `/v1/contexts/:id/ingest` | Ingest text (chunk → embed → store) |

---

## Converse (Direct Agent Chat)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/converse` | Chat with an agent (returns streaming response chunks) |

```json
// Request
{
  "agent_id": "agent-123",
  "message": "Hello",
  "system_prompt": "Optional override",
  "model": "deepseek-chat",
  "temperature": 0.7
}

// Response (streaming JSON chunks)
{"state": "STREAMING", "text_chunk": "Hello! "}
{"state": "STREAMING", "text_chunk": "How can I help?"}
{"state": "COMPLETED", "usage": {"total_tokens": 15}}
```

---

## Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Basic liveness check |
| `GET` | `/health/ready` | Readiness check (graph compiled?) |
| `GET` | `/metrics` | Prometheus metrics (text format) |
| `GET` | `/metrics/json` | Metrics as JSON |
