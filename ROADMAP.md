# Vibeful — Development Roadmap

> **Principle:** Build a multi-tenant AI agent platform from the ground up.
> **Date:** 2026-06-18

---

## Architecture Overview (The Target)

```
                      Customer Product (Web/Mobile)
                                │
                      ┌─────────┴─────────┐
                      │  Embeddable SDK    │  React/TypeScript, Shadow DOM
                      │  (Display Tier)    │  port :5173 (Vite dev)
                      └─────────┬─────────┘
                                │ gRPC-Web (HTTP/2)
                      ┌─────────┴─────────┐
                      │  Envoy Proxy       │  gRPC-Web → gRPC bridge
                      │  port :8080        │
                      └─────────┬─────────┘
                                │ gRPC (HTTP/2)
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
  ┌───────┴───────┐   ┌────────┴────────┐   ┌───────┴───────┐
  │  Agent Engine  │   │  API Gateway     │   │  Proxy         │
  │  Python        │   │  Node/TypeScript │   │  FastAPI        │
  │  LangGraph     │   │  REST + CRUD     │   │  Auth, routing  │
  │  gRPC :50051   │   │  port :3000      │   │  port :8000     │
  └───────┬───────┘   └────────┬────────┘   └───────┬───────┘
          │                    │                     │
          │         ┌──────────┴──────────┐          │
          │         │                     │          │
  ┌───────┴─────┐  ┌┴────────────┐  ┌────┴────┐     │
  │ MCP Servers │  │ PostgreSQL   │  │  Redis  │     │
  │ Node/TS     │  │ + pgvector   │  │  cache  │     │
  │ :3006+      │  │ :5432        │  │ :6379   │     │
  └─────────────┘  └─────────────┘  └─────────┘     │
                                                     │
  ┌──────────────────────────────────────────────────┘
  │  DeepSeek API (inference + embeddings)
  │  api.deepseek.com
  └──────────────────────────────────────────────────
```

---

## Phase 0 — Foundation (Week 1-2)

*Goal: A single agent that can hold a conversation. No UI, no multi-tenancy, no MCP. Just the core loop working end-to-end.*

### 0.1 — Project Scaffold
- [x] Set up monorepo: `vibeful/packages/{agent-engine, api-gateway, proxy, sdk, mcp-servers, shared}`
- [x] Configure: Python (uv/pip), Node.js/TypeScript (pnpm workspaces), shared ESLint + prettier
- [x] Set up Docker Compose: PostgreSQL+pgvector, Redis, Envoy, all services
- [x] Initialize Git repo with `.gitignore`, `docker-compose.yml`, `README.md`

### 0.2 — Agent Engine Core (Python 3.12, LangGraph, gRPC)
- [x] Scaffold `packages/agent-engine/` with Python project (pyproject.toml, venv)
- [x] Implement LangGraph agent graph: `START → Setup → SystemPrompt → Router → ReActAgent → StreamCompletion → END`
- [x] DeepSeek API client: chat completions with tool-calling support
- [x] gRPC service definition (`agent.proto`): `StreamConversation` RPC with bidirectional streaming
- [x] Streaming response states: `STREAMING`, `TOOL_USED`, `COMPLETED`, `FOLLOW_UP`
- [x] Basic state management per conversation turn (TypedDict state)
- [x] Tool-calling loop: agent decides → execute → feed result → continue

### 0.3 — Conversation Protocol
- [x] Define turn-based conversation contract (messages, tools, streaming states)
- [x] Session lifecycle: create, resume (5-minute staleness eviction), expire
- [x] Message persistence: PostgreSQL `messages` table (session_id, role, content, tool_calls)

### 0.4 — Verification
- [x] "Hello world" agent that responds to text input
- [x] Agent that uses a single hardcoded tool (e.g., `get_current_time`)
- [x] Multi-turn conversation with context retention
- [x] Streaming response works end-to-end

---

## Phase 1 — APIs & Configuration (Week 3-4)

*Goal: Create and configure agents through an API. Still no UI — everything via curl/HTTP.*

### 1.1 — Management API
- [ ] Agent CRUD: create, read, update, delete agent configurations
- [ ] Agent config fields: name, description, personality, tone, LLM model selection, output format, icebreaker messages, policy boundaries
- [ ] API authentication (API keys, at minimum)
- [ ] Request validation and error handling

### 1.2 — Knowledge Contexts
- [ ] Context CRUD: create, read, update, delete knowledge contexts
- [ ] Content ingestion: text upload endpoint
- [ ] Vector embedding pipeline: chunk → embed → store (use pgvector, Chroma, or similar)
- [ ] RAG retrieval: semantic search against stored knowledge
- [ ] Wire RAG into the agent graph (RAGNode in the agent pipeline)

### 1.3 — Agent Session Binding
- [ ] Session creation: bind user + agent + knowledge contexts + tools
- [ ] Multi-tenancy model: same agent, isolated knowledge per session
- [ ] Session metadata: pass context IDs, tool lists, feature flags
- [ ] Anonymous vs authenticated session modes

### 1.4 — Verification
- [ ] Create agent via API → converse with it → verify it uses configured personality
- [ ] Upload knowledge → query agent → verify grounded responses from knowledge
- [ ] Two sessions with different knowledge → verify responses differ
- [ ] Session expiry and cleanup

---

## Phase 2 — Tools & Extensibility (Week 5-6)

*Goal: Agents can call external tools through a standardized protocol. The platform becomes extensible.*

### 2.1 — MCP Server Protocol
- [ ] Implement Model Context Protocol (MCP) server interface
- [ ] Tool discovery: `tools/list` endpoint
- [ ] Tool execution: `tools/call` endpoint with JSON-RPC
- [ ] Server lifecycle: initialize, heartbeat, shutdown
- [ ] Server registration: configure MCP server URLs per agent

### 2.2 — First MCP Servers
- [ ] **Search MCP** — web search capability
- [ ] **Calculator MCP** — deterministic computation
- [ ] **File MCP** — read/write files in a sandbox
- [ ] Each server as a standalone process, connected via HTTP/SSE

### 2.3 — Widget System (Dynamic UI)
- [ ] Define widget protocol: when an agent calls a tool, the SDK renders a widget
- [ ] Widget types: chart, form, table, card, custom
- [ ] Widget Studio concept: conversational UI builder
- [ ] First widget: data table rendering from tool output

### 2.4 — Workflows
- [ ] Workflow definition: pre-built sequences of steps
- [ ] Step types: gather_input, rag_search, llm_analyze, deliver_message
- [ ] Variable passing between steps (`@variable_name`)
- [ ] Workflow execution engine inside the agent graph

### 2.5 — Verification
- [ ] Agent calls external MCP server → tool executes → result flows back to conversation
- [ ] Widget renders in SDK when tool is called
- [ ] Multi-step workflow completes end-to-end

---

## Phase 3 — Frontend SDK (Week 7-8)

*Goal: Embed agents into customer products. The thing prospects actually see.*

### 3.1 — Embeddable Chat SDK
- [ ] React component library for agent chat
- [ ] Shadow DOM encapsulation for style isolation
- [ ] Streaming message display (typewriter effect)
- [ ] Widget rendering inside chat (charts, forms, tables)
- [ ] Theming: CSS custom properties for brand colors, fonts, spacing
- [ ] Responsive design (mobile + desktop)

### 3.2 — Agent Management Studio (AMS)
- [ ] Admin dashboard for agent configuration
- [ ] Agent builder: form-based creation with preview
- [ ] Knowledge context manager: upload, view, test retrieval
- [ ] Tool/MCP server configuration UI
- [ ] Session analytics: usage, costs, common questions

### 3.3 — Voice Input
- [x] Speech-to-text via browser Web Speech API
- [x] Voice input button in chat widget
- [x] Review/edit before send pattern

### 3.4 — Verification
- [ ] Embed SDK in a test page → full conversation works
- [ ] Theme customization applies correctly
- [ ] Widget renders inside chat
- [ ] Voice input → transcription → agent response

---

## Phase 4 — Observability & Trust (Week 9-10)

*Goal: Know what's happening in production. Answer: "can I trust this agent?"*

### 4.1 — Event Pipeline
- [ ] Structured event emission from all services
- [ ] Event types:
  - `SESSION_ENVELOPE` — agent config served to client
  - `llm_call` — every LLM invocation (messages, tokens, cost, tools)
  - `MCP_TOOL_CALL` — every tool execution (latency, success/failure)
  - `MCP_SESSION_INIT` — MCP server health
  - `MCP_TOOLS_LISTED` — tool discovery results
  - Client-side: turn health, turn completion
- [ ] Event storage (ClickHouse or PostgreSQL)
- [ ] Cost tracking per call, per session, per agent

### 4.2 — Agent Behavior Testing (Supply Side)
- [ ] Scenario-based test framework
- [ ] Synthetic user: LLM-driven simulated conversation partner
- [ ] Assertions: deterministic + LLM-judge evaluators
- [ ] Test case creation: conversational (admin describes scenario, system generates test)
- [ ] Regression detection: run test battery on config changes

### 4.3 — Conversational Analytics (Demand Side)
- [ ] Intent persistence: log user inputs with embeddings
- [ ] Output persistence: log agent responses with embeddings
- [ ] Hybrid search: semantic (vector) + lexical (BM25) across conversations
- [ ] Cohort theme detection: cluster intents to surface emerging topics
- [ ] Knowledge gap detection: "users ask X, agent has no good answer"

### 4.4 — Trust Engine (Combined)
- [ ] Feedback loop: analytics surfaces problem → test case created → fix applied → test verifies → regression caught
- [ ] Meta Agent: conversational interface for querying analytics + running tests
- [ ] Predictors: per-turn classifiers (refusal reason, tool grounding, outcome status, knowledge gap)

### 4.5 — Verification
- [ ] Events flow to storage and are queryable
- [ ] Cost dashboard shows accurate per-agent spend
- [ ] Behavior test catches a regression after a config change
- [ ] Analytics surfaces a knowledge gap from real conversations

---

## Phase 5 — Production Hardening (Week 11-12)

*Goal: Multi-tenant, secure, scalable, deployable.*

### 5.1 — Multi-Tenancy
- [ ] Tenant isolation: separate data per organization
- [ ] Account management: create, configure, manage tenants
- [ ] Role-based access: admin, editor, viewer per tenant
- [ ] API key management per tenant

### 5.2 — Authentication & Authorization
- [ ] User authentication (OAuth2, magic links, or SSO)
- [ ] API authentication (bearer tokens, API keys)
- [ ] Session-level access control (which agent + contexts per user)
- [ ] Rate limiting per tenant

### 5.3 — Webhooks
- [ ] Webhook registration API (max 50 per tenant)
- [ ] Event triggers: agent.created, agent.updated, context.file_added, session.completed, mcp_server.connected
- [ ] Retry logic with exponential backoff
- [ ] Webhook delivery logs

### 5.4 — Deployment
- [ ] Dockerize all services
- [ ] CI/CD pipeline (build, test, deploy)
- [ ] Infrastructure-as-code (Terraform or Pulumi)
- [ ] Environment separation: dev, staging, production
- [ ] Secrets management (environment variables, vault)

### 5.5 — Documentation
- [ ] Public API reference (OpenAPI spec)
- [ ] SDK integration guide
- [ ] Agent configuration guide
- [ ] MCP server development guide
- [ ] Self-serve onboarding flow

---

## Phase 6 — Advanced Features (Week 13+)

*Goal: Features that differentiate the platform.*

### 6.1 — Agent Memory (Fact System)
- [ ] Fact mining: extract user facts from conversations
- [ ] Fact recall: retrieve relevant facts in new conversations
- [ ] Three-layer access control: org policy → agent config → user controls
- [ ] User data rights: view, edit, delete own facts

### 6.2 — Threads (Event-Driven Conversations)
- [ ] Backend-initiated sessions
- [ ] Pre-generated first response before user arrives
- [ ] Notification + deep link delivery
- [ ] Thread title auto-generation

### 6.3 — Content Sync & Scheduled Ingestion
- [ ] Scheduled content sync: poll external sources and ingest into knowledge contexts
- [ ] Webhook-driven ingestion: receive content from third-party systems
- [ ] File upload API: PDF, DOCX, HTML → extract text → chunk → embed
- [ ] Status dashboard: last sync time, chunk count, ingest errors

### 6.4 — Agent Builder SDK
- [ ] Embeddable agent configuration inside customer products
- [ ] Components: Agent Builder, Agent Configuration, Context Builder, Context Configuration
- [ ] White-label: customer's end-users build their own agents

### 6.5 — Edge Architecture (Client-Side Agent)
- [ ] Client-side LangGraph runtime (browser-compatible)
- [ ] Proxy service for credential injection and LLM routing
- [ ] Three-tier separation: display → orchestration → platform
- [ ] Directive system for agent instructions
- [ ] Headless service for non-browser callers and testing

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Agent-first interface** for analytics/testing | Admins interact via conversation with a Meta Agent, not dashboards |
| **Session-based multi-tenancy** | Same agent, isolated knowledge per session — simpler than per-tenant agent instances |
| **Shadow DOM for SDK** | Style isolation prevents host-page CSS from breaking the chat widget |
| **Dual demand/supply trust model** | Neither analytics alone nor testing alone answers "can I trust this agent?" |
| **Closed feedback loop** | Analytics finds problems → tests pin expected behavior → changes fix → tests verify → regressions caught |
| **Stateless proxy** | Credential injection, LLM routing, event logging — no business logic in the gateway |
| **MCP for extensibility** | Standardized tool protocol — once a tool speaks MCP, any agent can use it |
| **Structured events from day one** | Every llm_call, tool execution, session init logged — non-negotiable for debugging and cost tracking |

---

## Concrete Tech Stack

| Layer | Vibeful | Why |
|-------|---------------------|---------|-----|
| **Inference** | **DeepSeek API** | User directive |
| **Embeddings** | DeepSeek embeddings (or local model) | Consistency with inference provider |
| **Agent Engine** | Python 3.12, LangGraph, gRPC (:50051) | Proven pattern with streaming support |
| **API Gateway** | Node.js/TypeScript, containerized | Standard containers, portable |
| **Proxy** | FastAPI (Python), stateless | Credential injection, LLM routing, event logging |
| **gRPC Bridge** | Envoy Proxy (:8080) | Browsers can't speak gRPC natively |
| **Frontend SDK** | React/TypeScript, Shadow DOM | Style isolation, embeddable widgets |
| **Admin Studio** | React/TypeScript | Consistent stack with the SDK |
| **MCP Servers** | Node.js/TypeScript | Standard MCP protocol, portable tool servers |
| **Edge Runtime** | LangGraph JS (TypeScript) | Client-side agent execution (Phase 6) |
| **Database** | PostgreSQL (with pgvector) | Document model + vector search in one DB |
| **Vector DB** | pgvector (in PostgreSQL) | Single DB for vectors + documents |
| **Caching** | Redis | Fast, battle-tested session/rate-limit store |
| **Auth** | Supabase Auth or Clerk | Portable; no cloud lock-in |
| **Secrets** | Environment variables + Doppler | Simple, container-native |
| **Observability** | PostgreSQL events + structured logging | Simple pipeline; queryable with standard SQL |
| **Hosting** | Docker (dev) → any cloud (prod) | No vendor lock-in; standard containers |
| **CI/CD** | GitHub Actions | Widely supported, free for public repos |
| **Testing** | Playwright (E2E), Vitest (JS), pytest (Python) | Full-stack test coverage across languages |
| **Monorepo** | Single repo: `vibeful/packages/*` | Simpler coordination, shared tooling |

### Why these choices

- **Python for the agent engine.** LangGraph is Python-native. The graph pipeline (Setup → Router → RAG → ReAct → Stream) maps cleanly to Python's async model. gRPC streaming is well-supported.
- **Node.js/TypeScript for everything else.** One language for API, MCP servers, and SDK. The edge runtime needs to run in browsers — TypeScript compiles to JS.
- **PostgreSQL + pgvector as single DB.** pgvector handles vector search. JSONB columns handle document storage. One database to operate.
- **DeepSeek for LLM.** DeepSeek offers both chat and reasoner models, covering general conversation and complex reasoning in one API.
- **No cloud lock-in.** Standard containers and open-source equivalents so Vibeful runs anywhere.

---

## Iteration Strategy

**Principle:** A working minimal system beats a complete design document.

- Each phase ends with a **working** artifact you can show someone
- Phase 0 is the hard gate — if the core agent loop doesn't work, nothing else matters
- Phases 1-3 build the product surface (what customers see)
- Phases 4-5 build the operational surface (what you need to run it)
- Phase 6 is the long tail — prioritize based on customer demand

**First milestone:** End of Phase 0. A single agent that converses with streaming responses and uses one hardcoded tool. That's the "hello world" that proves the architecture works.

---

## Architecture Decisions — Why We Chose This Stack

| Decision | Rationale |
|----------|-----------|
| PostgreSQL + pgvector as single DB | Vector search and document storage in one database. Simple to operate. |
| No separate workflow engine | REST API + RAG pipeline handles content ingestion directly. |
| No separate vector DB | pgvector avoids managing a second database for embeddings. |
| Container-native secrets | `.env` + Docker env vars + optional Doppler. No cloud lock-in. |
| Widget Studio included | Conversational widget creation is core to the platform. |
| Attack guard from day one | Production agents get attacked. Guard before public launch. |
| Connection chain monitoring | Production-ready platforms need chain visibility. |

---

## Implementation Roadmap

### Phase 7 — Trust & Conversation Quality (must-have)

*Goal: Agents that cite sources, guide conversations, and route intelligently.*

#### 7.1 — CitationNode
- [ ] After RAG retrieval, mark which chunks were used in the response
- [ ] Emit `RESPONSE_STATE_REFERENCES` with chunk IDs and similarity scores
- [ ] Render citations in the SDK chat widget as clickable source links

#### 7.2 — FollowUpQuestionsNode
- [ ] After stream completion, ask LLM to generate 2-3 follow-up questions
- [ ] Emit `RESPONSE_STATE_FOLLOW_UP` with question strings
- [ ] Render as tappable chips below the agent response in the SDK

#### 7.3 — ButtonsNode (Quick Replies)
- [ ] Agent config: define quick-reply buttons ("What's your refund policy?", "Talk to a human")
- [ ] Emit quick replies as structured data in the conversation response
- [ ] Render as horizontal chip bar in the SDK

#### 7.4 — RouterNode (Full Routing)
- [ ] Classify user input into: `rag_required`, `direct_answer`, `workflow_trigger`
- [ ] Route to RAGNode, ReActAgent, or WorkflowEngine based on classification
- [ ] Use a lightweight classifier (keyword + embedding similarity, not a full LLM call)

### Phase 8 — Platform Integrity (must-have)

*Goal: Multi-tenant access control, browser E2E tests, and the edge architecture.*

#### 8.1 — Labels & Access Control
- [ ] Tag system: agents, contexts, and sessions carry label arrays
- [ ] Session creation: filter available agents/contexts by user's labels
- [ ] API-level enforcement: reject access to unlabeled resources
- [ ] SDK: only show agents/contexts the current user can access

#### 8.2 — E2E Tests (Playwright)
- [ ] Agent creation + conversation flow
- [ ] Knowledge context ingestion + RAG-grounded response
- [ ] MCP tool execution (web_search)
- [ ] SDK embedding: chat widget renders, sends message, receives response
- [ ] Error states: invalid agent ID, missing API key, network failure

#### 8.3 — Widget Studio (Conversational Widget Builder)
- [ ] Conversational interface: admin says "Build me a product catalog widget"
- [ ] Agent generates widget config from conversation (type, fields, data mapping)
- [ ] Preview: widget renders in-chat before saving
- [ ] Save: widget config stored, mapped to MCP tool
- [ ] SDK: auto-render configured widget when mapped tool is called

#### 8.4 — Edge Architecture (Client-Side Graph)
- [ ] Tier 2: Build LangGraph JS runtime in `packages/edge-runtime/`
- [ ] Port the agent graph (setup → fact_recall → router → RAG → ReAct → completion → citations → follow_up → fact_mining) to TypeScript
- [ ] Tier 3: Proxy service already exists — verify it works with edge runtime
- [ ] Tier 1: Build display adapter that consumes RuntimeEvents and updates SDK state
- [ ] Headless mode: verify edge runtime works in Node.js (no browser)

### Phase 9 — Production & Refinement (should-have)

*Goal: Ship-ready deployment, branded UX, and proactive conversations.*

#### 9.1 — Production Deployment
- [ ] Multi-environment config (dev/staging/prod)
- [ ] Terraform or Pulumi for infrastructure-as-code
- [ ] SSL termination + domain configuration
- [ ] Health check monitoring + alerting
- [ ] Database backup + restore procedures

#### 9.2 — Design System & Theming
- [ ] Design token specification (colors, typography, spacing, radii, shadows)
- [ ] Per-agent theme configuration in agent config
- [ ] SDK: apply theme tokens to chat widget, widgets, and AMS
- [ ] White-label: remove Vibeful branding, allow full customer branding

#### 9.3 — PlanningNode
- [ ] LLM-generated execution plans for complex multi-step queries
- [ ] Plan visualization in the SDK (step list with checkmarks)
- [ ] Fallback to ReAct loop when no plan is needed

#### 9.4 — AttackResponseNode
- [ ] Detect adversarial inputs (prompt injection, jailbreak attempts, excessive length)
- [ ] Return safe canned response instead of processing the attack
- [ ] Log attack attempts with pattern classification

#### 9.5 — Connection Chain Monitoring
- [ ] Real-time health checks: SDK → Agent Engine → MCP Server → Tool
- [ ] Status dashboard in AMS Observability tab
- [ ] Alert when any link in the chain fails (configurable threshold)

#### 9.6 — One-Click Deploy & SDK Snippet
- [ ] "Deploy to production" button in AMS — generates Docker run command or cloud deploy script
- [ ] SDK snippet generator: paste agent ID, get copy-paste HTML/JS embed code
- [ ] Embed code includes theme customization, placeholder text, and agent ID

#### 9.7 — Usage Analytics Dashboard
- [ ] Embedded analytics in AMS: per-agent usage, cost trends, session counts, tool usage breakdown
- [ ] Time-range selector (7d, 30d, 90d)
- [ ] Export to CSV / PDF
- [ ] Scheduled email reports

#### 9.8 — Meta Agent (Closed Feedback Loop)
- [ ] Conversational interface for querying analytics ("Show me the top 5 knowledge gaps")
- [ ] Auto-generate behavior tests from knowledge gaps ("Create a test for the refund question")
- [ ] Run test battery on config changes, flag regressions
- [ ] Present results conversationally: "3 tests passed, 1 regression in refund handling"

### Phase 10 — Refinements (could-have)

*Goal: Advanced analytics and predictor infrastructure.*

#### 10.1 — Corpus Intelligence
- [ ] Hot docs: most-retrieved chunks per context
- [ ] Dead docs: never-retrieved chunks
- [ ] Retrieved-but-not-used: chunks that were retrieved but not cited in final response

#### 10.2 — Predictor Scaffold
- [ ] Per-turn classifiers: refusal_reason, tool_grounding, outcome_status, knowledge_gap_signal
- [ ] Uniform train / serve / correct loop
- [ ] Embed in analytics pipeline

#### 10.3 — Voice TTS
- [ ] Text-to-speech for agent responses
- [ ] Toggle in SDK: text-only / voice / both

---

## Build Status (2026-06-18)

| Phase | Status | Priority |
|-------|--------|----------|
| **0 — Foundation** | ✅ Complete | — |
| **1 — APIs & Config** | ✅ Complete | — |
| **2 — MCP & Tools** | ✅ Complete | — |
| **3 — Frontend SDK** | ✅ Complete | — |
| **4 — Observability** | ✅ Complete | — |
| **5 — Production** | ✅ Complete | — |
| **6 — Advanced (memory, threads)** | ✅ Complete | — |
| **7 — Trust & Conversation** | ✅ Complete | 🔴 Must-have |
| **8 — Platform Integrity** | ✅ Complete | 🔴 Must-have |
| **9 — Production & Refinement** | ✅ Complete | 🟡 Should-have |
| **10 — Refinements** | ✅ Complete | 🟢 Could-have |

---

## Phase 11 — General Solution Improvements (P0-P3)

*Goal: Make Vibeful adoptable by any SaaS company as the foundation of their own agentic systems.*

### P0 — Five-Minute Quickstart (must-have for adoption)

#### P0.1 — LLM Provider Abstraction
- [x] Define `LlmProvider` protocol (`src/llm/protocol.py`)
- [x] Rename `DeepSeekClient` → `DeepSeekProvider` implementing the protocol
- [x] Add `OpenAIProvider` (trivial, same API shape)
- [x] Add `AnthropicProvider`
- [x] Create `get_provider(name)` factory
- [x] Wire provider selection through agent config

#### P0.2 — Zero-Dependency Dev Mode
- [x] Define `StorageBackend` protocol
- [x] Implement `SqliteBackend` with `sqlite-vec` for vector search
- [x] Refactor existing PostgreSQL code behind `PostgresBackend`
- [x] Add in-memory fallback when no DB is configured
- [x] `vibeful dev` works with zero external dependencies

#### P0.3 — CLI
- [ ] `vibeful dev` — start local dev server (SQLite mode)
- [ ] `vibeful dev --docker` — start with full Docker stack
- [ ] `vibeful chat <agent>` — interactive terminal chat
- [ ] `pip install vibeful` package entry point

### P1 — Enterprise Adoption (blocks serious use)

#### P1.1 — Configurable Agent Graphs
- [ ] Agent graph defined in YAML/JSON
- [ ] `build_agent_graph(config)` reads config and wires dynamically
- [ ] Plugin system: `register_node(name, node_fn)`
- [ ] Built-in node library: guard, setup, router, react, rag, completion, citation, follow_up
- [ ] Custom nodes via plugin registration

#### P1.2 — Auth Plugin System
- [ ] `AuthProvider` protocol (`authenticate`, `authorize`)
- [ ] Built-in: `api_key`, `jwt`, `passthrough` providers
- [ ] Wire into proxy middleware
- [ ] Per-agent auth configuration

#### P1.3 — Agent Evaluation Framework
- [ ] YAML-based eval test definitions (input, expects)
- [ ] Assertion types: contains, not_contains, tone, blocked, max_tokens
- [ ] LLM-as-judge for semantic assertions
- [ ] Golden-response recording and diffing
- [ ] `vibeful agent test <name>` CLI command

#### P1.4 — SDK as Standalone npm Package
- [ ] Extract SDK to publishable `@vibeful/sdk` package
- [ ] Pluggable transport layer (gRPC-Web, WebSocket, OpenAI-compatible)
- [ ] Storybook for component development
- [ ] npm publish pipeline

### P2 — Production Hardening

- [ ] REST + WebSocket transport alongside gRPC
- [ ] Prometheus metrics endpoint on all services
- [ ] OpenTelemetry tracing across the service chain
- [ ] `vibeful dashboard` — terminal UI for live observability
- [ ] Rate limiting and quota management
- [ ] Agent versioning with rollback

### P3 — Deployment & Ecosystem

- [ ] `vibeful export helm` — generate Helm chart
- [ ] `vibeful export docker-compose` — production compose
- [ ] One-click deploy scripts for common clouds (AWS, GCP, Azure)
- [ ] Terraform module for infrastructure