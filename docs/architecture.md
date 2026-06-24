# Vibeful Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Management Console                       │
│              React + React Flow :5174 (Vite)               │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │Dashboard │ │ Designer │ │  Agents  │ │   MCP    │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Analytics│ │Knowledge │ │  Pages   │ │Settings  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                             │
│  Vibeful Guide: Natural language → agent configuration     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP /v1/* (proxy)
┌──────────────────────▼──────────────────────────────────────┐
│                   Agent Engine                              │
│              Python / LangGraph / FastAPI                   │
│              REST :50052                                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Agent Graph (LangGraph)                 │   │
│  │  Setup → Guard → Router → RAG → React → Completion  │   │
│  │    │        │        │       │       │              │   │
│  │    └────────┴────────┴───┬───┴───────┘              │   │
│  │                          │                           │   │
│  │  ┌───────────────────────▼──────────────────────┐   │   │
│  │  │        Analysis Pipeline (11 phases)         │   │   │
│  │  │  Memories → Impressions → Concepts → Intent  │   │   │
│  │  │  → Conductor → Code Detect → Search Detect   │   │   │
│  │  │  → Global Memories → Next → Search           │   │   │
│  │  │  → Output Routing                            │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ REST API  │ │  SSE     │ │ Webhooks │ │ API Keys │    │
│  │ 72 routes │ │ Stream   │ │ Fire     │ │ SHA-256  │    │
│  └───────────┘ └──────────┘ └──────────┘ └──────────┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Storage Layer                       │  │
│  │  SQLite (dev)    PostgreSQL + pgvector (prod)        │  │
│  │  Tables: agents, pages, mcp_servers, api_keys,       │  │
│  │  contexts, embeddings, users, teams, audit_events,   │  │
│  │  agent_tests, webhooks, glyphs, concepts, sessions   │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    ▼                  ▼                  ▼
┌────────┐    ┌──────────────┐    ┌─────────────┐
│DeepSeek│    │  PostgreSQL  │    │    Redis     │
│  API   │    │  + pgvector  │    │   (cache)    │
└────────┘    └──────────────┘    └─────────────┘
```

## Packages

| Package | Stack | Purpose | Tests |
|---------|-------|---------|-------|
| `agent-engine` | Python, LangGraph, FastAPI | Core agent engine — REST + SSE + graph | 602 |
| `management-console` | React, React Flow, Tailwind, Vite | Visual agent designer + platform dashboard | 136 |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget + React hooks | — |
| `sdk-python` | Python, httpx | Headless agent client (`pip install vibeful`) | 26 |
| `shared` | TypeScript | Shared types and utilities | — |
| `mcp-servers` | Node/TypeScript | Built-in MCP tool servers | — |
| `proxy` | Python, FastAPI | Auth, session routing, analytics | — |
| `api-gateway` | Node/TypeScript | API gateway | — |

## Integration Tiers

```
┌──────────────────────────────────────────────────────────────┐
│ Tier 1: Embed                                               │
│ <script src="vibeful-sdk.umd.js"></script>                  │
│ VibefulSDK.mount({ target: '#chat', agentId: '...' })       │
│                                                              │
│ → Chat widget, voice I/O, widgets, CSS theming              │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Tier 2: Integrate                                           │
│ POST /v1/agents/:id/execute                                 │
│ POST /v1/agents/:id/stream (SSE)                            │
│ POST /v1/webhooks (event subscription)                      │
│                                                              │
│ → Headless invocation, streaming, webhooks, API keys        │
│ → Python SDK (vibeful), JS hooks (useAgent, useAgentStream) │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Tier 3: Agent-Native                                        │
│ Agent creates pages → users interact → agent updates        │
│                                                              │
│ → Page CRUD, widget composition, event loop                 │
│ → Agent-to-agent delegation                                 │
│ → Import/export, staging → production                       │
└──────────────────────────────────────────────────────────────┘
```

## Key Endpoints

| Category | Endpoints | Count |
|----------|-----------|-------|
| Agents | CRUD + execute + stream + export/import + promote | 12 |
| MCP Servers | CRUD + health + start/stop | 9 |
| Pages | CRUD + slug lookup + interact | 7 |
| API Keys | CRUD | 3 |
| Users & Teams | Register + login + teams CRUD + members | 6 |
| Analytics | Platform summary + per-agent | 2 |
| Audit | Event log | 1 |
| Agent Tests | CRUD + run single + run all | 5 |
| Webhooks | Register | 1 |
| Converse | Direct agent chat | 1 |
| Knowledge | Contexts + ingest | 4 |
| Health | Liveness + readiness + metrics | 4 |
| **Total** | | **55** |

## Guide Commands

The Vibeful Guide supports 70 natural-language commands covering all platform operations — from creating agents and configuring MCP servers to publishing pages and running tests. The command protocol (`vibeful-command` blocks) is the same one agents use to render widgets in pages.

## Data Flow

```
User Message
    │
    ▼
Agent Graph (LangGraph)
    ├── Setup: Initialize state
    ├── Attack Guard: Block injection/jailbreak
    ├── Router: Classify intent (greeting, RAG, tool)
    ├── RAG: Retrieve relevant knowledge chunks
    ├── MCP Discovery: Find appropriate tools
    ├── React Agent: LLM loop with tool use
    └── Stream Completion: Yield response chunks
            │
            ▼
    Response (text/SSE/JSON)
            │
    ┌───────┴───────┐
    ▼               ▼
  User          Webhook
 (display)    (fire event)
```

## Deployment

**Dev mode** (SQLite, no Docker):
```bash
npm run dev
```

**Docker stack** (PostgreSQL, Redis, Envoy):
```bash
npm run stack
```

**Helm chart** (Kubernetes):
```
deploy/helm/vibeful/
```
