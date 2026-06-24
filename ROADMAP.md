# Vibeful — Roadmap

> Last updated: 2026-06-24
> Current state: **All 6 roadmap phases complete.** 566 Python + 136 front-end = 702 tests. 70 Guide commands. See below for details.

---

## Vision

**WordPress for agents.** A self-hosted platform to build, configure, deploy, embed, and monetize AI agents. From simple embedded chat widgets to completely agent-driven systems — one console, one SDK, one API surface.

Three integration tiers:
1. **Embed** — 3-line `<script>` tag drops an agent chat widget into any site
2. **Integrate** — Headless REST API + webhooks for backend-driven agent workflows
3. **Agent-native** — Agents as the application layer, emitting pages, forms, and dashboards dynamically

---

## What's Built

- **Agent Engine** — LangGraph (14+ nodes), ReAct loop, RAG (pgvector), MCP client, analysis pipeline (11 phases + conductor), attack guard, streaming
- **Management Console** — React Flow canvas, node palette, property panel, templates, AI Guide (50 commands), dashboard, agent lifecycle (CRUD + clone + rename), version history, A/B testing, KB management, MCP server tab, styling/personality/guardrails modals
- **SDK** — Embeddable chat widget, `vibeful-command` protocol for agent-driven UI (widgets), styling via CSS custom properties
- **MCP** — Three built-in servers (web-search, file-read, calculator) with full CRUD, health checks, Docker Compose start/stop, attach/detach to agents
- **Deployment** — Docker Compose, Helm chart, SQLite dev mode (no Docker required), cross-platform

---

## Phase 1: Pages & Publishing

> **The biggest gap.** Agents today are chat-only. They need to produce pages, forms, and dashboards — not just text responses.
> **Goal:** Let agents render structured content (pages, forms, charts, tables) that users interact with beyond the chat bubble.

### 1.1 — Agent Pages

- [ ] New database table: `agent_pages` (id, agent_id, slug, title, content_markdown, layout_json, published, created_at, updated_at)
- [ ] REST endpoints: `POST/GET/PUT/DELETE /v1/pages`, `GET /v1/pages/:slug`
- [ ] Pages tab in console: list pages, create/edit with markdown editor, preview, publish/unpublish
- [ ] Agents can create pages via Guide command: `create_page` with title + markdown content
- [ ] Page routing: `/p/:slug` serves the published page with the agent's SDK widget embedded

### 1.2 — Widget Composition in Pages

- [ ] Pages support `vibeful-command` widget blocks inline in markdown (same protocol as chat)
- [ ] Widget types: `card`, `form`, `chart`, `table`, `button`, `image`, `embed`
- [ ] Agent can emit a page with embedded widgets: "show me a dashboard of Q3 sales"
- [ ] `<WidgetRenderer>` in SDK handles the full widget spec

### 1.3 — Page Templates

- [ ] Pre-built page templates: Landing, Dashboard, FAQ, Report, Form
- [ ] Templates stored as markdown + widget placeholder blocks
- [ ] Console: pick template → agent populates it with data
- [ ] SDK exposes `renderPage(slug)` for host apps to embed agent pages directly

### Deliverables
- `packages/agent-engine/src/rest_server.py` — page CRUD endpoints
- `packages/agent-engine/src/storage/sqlite.py` — `agent_pages` table
- `management-console/src/components/PageEditor.tsx` — markdown + widget editor
- `management-console/src/components/PageList.tsx` — page list in Pages tab
- `packages/sdk/src/components/WidgetRenderer.tsx` — full widget renderer
- `packages/sdk/src/components/widgets/*.tsx` — per-widget-type components
- `packages/shared/src/widgets.ts` — WidgetSpec TypeScript types

---

## Phase 2: Observability & Analytics

> **What's the ROI of an agent?** Without analytics, you don't know which agents work, which fail, or what they cost.
> **Goal:** A dashboard that answers: how many conversations? What's the cost? Where are the failures? Are users satisfied?

### 2.1 — Conversation Analytics

- [ ] Track: conversation count, message count, average length, session duration
- [ ] Per-agent and aggregate views
- [ ] Time range filters (today, week, month, custom)
- [ ] Export as CSV/JSON

### 2.2 — Cost Tracking

- [ ] Token usage: prompt tokens, completion tokens, total
- [ ] Cost estimation per model (DeepSeek, OpenAI, Anthropic rates)
- [ ] Per-agent, per-user, per-day breakdown
- [ ] Budget alerts: notify when approaching configured limit

### 2.3 — Quality Metrics

- [ ] User feedback collection: thumbs up/down per response
- [ ] Guardrail trigger rate: how often are guardrails blocking responses?
- [ ] Tool call success rate: which MCP tools fail most?
- [ ] Knowledge base hit rate: is RAG pulling relevant chunks?
- [ ] Latency distribution: P50, P95, P99 per agent

### 2.4 — Analytics Dashboard

- [ ] New "Analytics" tab in console
- [ ] Overview card: conversations today, cost today, satisfaction score
- [ ] Charts: conversation volume over time, cost over time, latency distribution
- [ ] Top agents by usage, top failures by type
- [ ] Guide command: `get_analytics` for querying metrics via natural language

### Deliverables
- `packages/agent-engine/src/analytics.py` — metric collection + aggregation
- `packages/agent-engine/src/rest_server.py` — analytics endpoints
- `management-console/src/components/AnalyticsDashboard.tsx`

---

## Phase 3: Ecosystem & MCP Marketplace

> **WordPress won because of plugins.** Vibeful wins if third parties build MCP servers.
> **Goal:** Make MCP server discovery, installation, and authoring as easy as WordPress plugins.

### 3.1 — MCP Server Catalog

- [ ] Registry: `vibeful/registry` repo or API with curated MCP server list
- [ ] Metadata: name, description, author, version, tools list, install count, rating
- [ ] Console: "Browse Servers" tab showing catalog with search + categories
- [ ] One-click install: pulls server config, registers in DB, starts if built-in
- [ ] Health badge per server in catalog (live probe)

### 3.2 — MCP Authoring Toolkit

- [ ] `create-vibeful-mcp` CLI: `npx create-vibeful-mcp my-server`
- [ ] Template with framework.ts, example tool, README, Dockerfile
- [ ] Local dev server with hot reload (`npm run dev`)
- [ ] Publish command: `npm run publish` → opens PR to registry
- [ ] Documentation: authoring guide, best practices, example servers

### 3.3 — Agent Template Marketplace

- [ ] Shareable agent templates (export as `.vibeful.yaml`)
- [ ] Console: "Templates" tab with community templates
- [ ] Import template → creates agent with all config, styling, KB refs
- [ ] Rating system: stars, usage count, author attribution

### Deliverables
- `create-vibeful-mcp/` — CLI scaffolding tool
- `packages/mcp-servers/README.md` — authoring guide
- `management-console/src/components/McpCatalog.tsx` — browse + install
- `management-console/src/components/TemplateMarketplace.tsx`
- Registry API (standalone or integrated into agent-engine)

---

## Phase 4: Integration Depth

> **Chat widget is the start, not the end.** Heavy integrations need headless APIs, webhooks, and real-time streaming.
> **Goal:** Vibeful agents can drive backend workflows, not just front-end chat.

### 4.1 — Headless Agent API

- [ ] `POST /v1/agents/:id/execute` — invoke agent programmatically, get full response
- [ ] Supports: message, system_prompt, context_ids, mcp_server_urls, streaming
- [ ] Returns: response text, tool calls made, analysis results, token usage
- [ ] SDKs: Python (`pip install vibeful`), JavaScript (`npm install @vibeful/client`)
- [ ] API key auth: per-agent or per-user keys with scoped permissions

### 4.2 — Webhook System

- [ ] Webhook registration: URL, events to subscribe to, secret for HMAC validation
- [ ] Events: `conversation.started`, `conversation.completed`, `tool.called`, `guardrail.triggered`, `error.occurred`, `page.published`
- [ ] Retry with exponential backoff, dead letter queue
- [ ] Console: webhook management UI (create, test, view delivery logs)

### 4.3 — Real-time Streaming

- [ ] Server-Sent Events (SSE) endpoint: `GET /v1/agents/:id/stream`
- [ ] WebSocket endpoint: `ws://localhost:50052/v1/stream`
- [ ] Events: `token`, `tool_call`, `tool_result`, `complete`, `error`
- [ ] SDK updates to consume streaming events

### 4.4 — SDK Expansion

- [ ] Python SDK: `vibeful` package on PyPI
- [ ] React hooks: `useAgent`, `useAgentStream`, `useAgentPage`
- [ ] Agent-to-agent communication: `POST /v1/agents/:id/delegate` for agent chaining
- [ ] SDK documentation site (VitePress or Docusaurus)

### Deliverables
- `packages/agent-engine/src/rest_server.py` — `/execute`, `/stream`, webhook endpoints
- `packages/sdk-python/` — Python client library
- `packages/sdk/src/hooks/` — React hooks for headless agent usage
- `management-console/src/components/WebhookManager.tsx`
- `website/docs/` — SDK documentation

---

## Phase 5: Multi-tenancy & Monetization

> **A platform needs users, teams, and billing.**
> **Goal:** Organizations can manage multiple users, multiple agents, and bill their customers.

### 5.1 — User & Team Management

- [ ] Users table: id, email, password_hash, role (admin, editor, viewer)
- [ ] Teams/Organizations: group users, scope agents and KBs to a team
- [ ] Invite flow: email invitation → accept → join team
- [ ] Role-based access: admin (full), editor (configure agents), viewer (read-only)
- [ ] Console: Settings → Team page, invite UI, role management

### 5.2 — API Key Management

- [ ] Per-user API keys with scoped permissions
- [ ] Key types: admin (full access), agent (single agent), read-only
- [ ] Key rotation, revocation, usage tracking
- [ ] Console: Settings → API Keys page

### 5.3 — Billing & Monetization

- [ ] Usage metering: track token consumption per agent per customer
- [ ] Stripe integration: subscription plans (Free, Pro, Enterprise)
- [ ] Plan limits: agents per plan, conversations per month, MCP servers, KB size
- [ ] Invoice generation, payment history
- [ ] Console: Settings → Billing page
- [ ] White-label option: custom domain, custom branding, remove Vibeful logo

### Deliverables
- `packages/agent-engine/src/auth/` — user, team, API key management
- `packages/agent-engine/src/billing.py` — Stripe integration
- `packages/agent-engine/src/rest_server.py` — auth + billing endpoints
- `management-console/src/pages/Settings.tsx` — Team, API Keys, Billing tabs

---

## Phase 6: Enterprise Scale

> **Production-grade reliability, security, and compliance.**
> **Goal:** Vibeful runs in enterprise environments with SOC2, SSO, audit logs, and HA.

### 6.1 — High Availability

- [ ] Agent engine horizontal scaling (stateless + Redis session store)
- [ ] PostgreSQL read replicas for analytics queries
- [ ] Kubernetes operator for automated scaling and self-healing
- [ ] Multi-region deployment support

### 6.2 — Security & Compliance

- [ ] SSO: SAML, OIDC, LDAP integration
- [ ] Audit logging: every config change, conversation, and admin action logged
- [ ] Data retention policies: auto-delete conversations after N days
- [ ] PII detection and redaction in conversation logs
- [ ] SOC2 Type II readiness checklist

### 6.3 — Advanced Testing

- [ ] Automated agent test suites: define test cases (input → expected output/behavior)
- [ ] CI/CD integration: run test suite on config change, block deploy on regression
- [ ] Staging environments: clone agent → staging → test → promote to production
- [ ] Load testing: simulate N concurrent conversations, measure latency

### 6.4 — Migration & Import

- [ ] Import from OpenAI Assistants API, LangChain, or custom formats
- [ ] Export agent as portable `.vibeful.yaml` bundle (graph + KB refs + styling + personality)
- [ ] Bulk operations: create/update/delete multiple agents via API

### Deliverables
- `deploy/helm/vibeful/` — updated Helm chart with HA config
- `packages/agent-engine/src/audit.py` — audit logging
- `packages/agent-engine/tests/load/` — load testing scripts
- `packages/agent-engine/src/migration.py` — import/export tools

---

## Implementation Order

```
Phase 1 (next)     → Pages & Publishing       — the core UX unlock
Phase 2             → Observability & Analytics — proves agent ROI
Phase 3             → Ecosystem & MCP Marketplace — flywheel starts
Phase 4             → Integration Depth         — expands addressable market
Phase 5             → Multi-tenancy & Monetization — business model
Phase 6             → Enterprise Scale          — production readiness
```

Phases 2 and 3 can overlap. Phase 4 can begin once Phase 1 ships (Pages are the prerequisite for Widgets). Phases 5 and 6 are gated on Phase 4 (headless API + webhooks are prerequisites for multi-tenancy billing).

---

## Guiding Principles

1. **The AI Guide can do everything the UI can.** Every new feature must have a corresponding Guide command. The Guide is the primary interface for non-technical users.

2. **Self-hosted first, cloud later.** Docker Compose and SQLite must work before Kubernetes and PostgreSQL. The 5-minute install is sacred.

3. **MCP is the plugin system.** Don't invent a proprietary extension mechanism. Every integration should be an MCP server.

4. **Guardrails are not optional.** Every agent path — chat widget, headless API, streaming — must pass through the guardrail layer.

5. **Test what you build.** Every phase ships with tests. The Python test suite and vitest suite grow with the codebase.
