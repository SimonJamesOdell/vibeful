# Vibeful

Vibeful — a multi-tenant AI agent platform that lets companies embed conversational agents into their SaaS products.

**Stack:** Python 3.12 (LangGraph agent), Node.js/TypeScript (API + SDK + MCP), PostgreSQL + pgvector, Redis, DeepSeek API.

## Quick Start

```bash
# 1. Set your DeepSeek API key
export DEEPSEEK_API_KEY=sk-...

# 2. Start all services
docker compose up --build

# 3. Services available
# Agent Engine  → gRPC on :50051 (via Envoy :8080)
# API Gateway   → :3000
# Proxy         → :8000
# SDK Dev       → :5173
# PostgreSQL    → :5432
# Redis         → :6379
```

## Architecture

```
Browser (SDK) → Envoy :8080 → Agent Engine :50051 → DeepSeek API
                    ↑
              Proxy :8000 (auth, routing, events)
              API Gateway :3000 (REST CRUD)
              PostgreSQL :5432 + pgvector
              Redis :6379 (cache)
```

## Packages

| Package | Stack | Purpose |
|---------|-------|---------|
| `agent-engine` | Python, LangGraph, gRPC | Core conversational AI agent |
| `api-gateway` | Node/TypeScript, Express | REST API for agent CRUD, sessions |
| `proxy` | Python, FastAPI | Stateless credential-injecting gateway |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget |
| `shared` | TypeScript | Shared types and utilities |
| `mcp-servers` | Node/TypeScript | MCP tool servers |

## Development

### Python (agent-engine, proxy)

```bash
cd packages/agent-engine
pip install -e ".[dev]"
pytest
```

### Node.js (api-gateway, sdk, shared)

```bash
pnpm install
pnpm build
pnpm test
```

## Status

- ✅ Protocol defined (agent.proto)
- ✅ Agent graph (LangGraph: 13 nodes)
- ✅ LLM provider abstraction (DeepSeek + OpenAI)
- ✅ SQLite dev mode (no Docker required)
- ✅ Configurable agent graphs (YAML/JSON)
- ✅ Auth plugin system (api_key, jwt, passthrough)
- ✅ Eval framework (84 tests)
- ✅ REST API + Prometheus metrics
- ✅ Helm chart + Docker Compose

## Getting Started

```bash
pip install -e .
vibeful init
vibeful dev
```
