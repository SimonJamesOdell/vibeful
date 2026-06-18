# feat-vibeful-core — Vibeful Platform Core

**Created:** 2026-06-18  
**Status:** Active development

---

## What This Is

A multi-tenant AI agent platform. Pluggable LLM backend, MCP-extensible tool system,
embeddable React SDK, configurable agent graphs defined in YAML.

## Architecture

```
SDK (React/Vite) → Envoy :8080 → Agent Engine :50051 (Python/LangGraph/gRPC)
                    ↑              ↓
              Proxy :8000     MCP Servers :3100-3102
              API Gateway :3000
                    ↓
         PostgreSQL :5432 + pgvector
         Redis :6379
```

## What's Built

### Agent Engine
- LangGraph agent graph: 13 nodes — attack guard, setup, fact recall, planning,
  quick replies, system prompt, RAG, MCP discovery, ReAct agent, stream completion,
  citations, follow-ups, fact mining
- Pluggable LLM provider (DeepSeek, OpenAI, custom)
- gRPC + REST API + WebSocket transports
- Configurable agent graphs via `build_graph_from_config()` (YAML/JSON)
- 84 tests (async pytest, mock-based)

### Platform Services
- API Gateway (Node/TypeScript, Express)
- Proxy (Python, FastAPI) with auth plugin system
- MCP servers (web-search, calculator, file-read)
- Edge runtime architecture (LangGraph JS)

### SDK
- Embeddable chat widget with Shadow DOM isolation
- Voice input/output, widget rendering, admin components
- Pluggable transport layer (Vibeful, OpenAI-compatible, custom)
- Publishable as `@vibeful/sdk`

### Deployment
- Helm chart for Kubernetes
- Production Docker Compose configuration
- One-click deploy script (AWS, GCP, Azure, DigitalOcean, Docker)

## Current Focus

- Agent eval framework (YAML test suites, golden responses, LLM-as-judge)
- Zero-config dev mode (SQLite, no Docker required)
- CLI (`vibeful init|dev|chat|dashboard|export`)

## Patterns & Conventions

- **Python**: async/await, LangGraph, psycopg async, httpx
- **TypeScript**: React 19, Vite, pnpm workspaces
- **gRPC**: proto-first, Envoy gRPC-Web bridge
- **Testing**: pytest + pytest-asyncio, mocked LLM clients
- **Database**: PostgreSQL + pgvector, idempotent schema init
- **MCP**: HTTP/SSE transport, tool discovery cache

