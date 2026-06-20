# Vibeful

Vibeful — a self-hosted AI agent platform. Build, deploy, and manage multiple conversational agents from a visual console. Embed them into any web app with 3 lines of code. "A CMS for AI agents."

**Stack:** Python 3.12 (LangGraph agent), Node.js/TypeScript (API + SDK + MCP), PostgreSQL + pgvector, Redis, DeepSeek API.

## Quick Start

```bash
git clone https://github.com/SimonJamesOdell/vibeful.git
cd vibeful
bash scripts/setup.sh
```

**That's it.** The setup script handles everything automatically:

- Checks what's installed on your system
- Offers to install anything that's missing
- Installs Vibeful's dependencies
- Checks your API key (you can paste it when prompted, or later in the browser)
- Starts the agent engine and management console
- Opens http://localhost:5174 — the Vibeful Guide greets you there

**No Docker required.** Uses SQLite for local development.
**No terminal expertise needed.** Just run the one command.

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
- ✅ Agent graph (LangGraph: 14 nodes + 11-phase analysis pipeline)
- ✅ LLM provider abstraction (DeepSeek + OpenAI)
- ✅ SQLite dev mode (no Docker required)
- ✅ Configurable agent graphs (YAML/JSON)
- ✅ Auth plugin system (api_key, jwt, passthrough)
- ✅ Eval framework (84 tests)
- ✅ REST API + Prometheus metrics + Lucid endpoints
- ✅ Helm chart + Docker Compose
- ✅ Analysis Pipeline (Lucid Sensai parity — 78/78 tests)
- ✅ Management Console (React Flow visual designer — 11 tabs including multi-agent dashboard)
- ✅ Multi-agent support — manage multiple agents from one console
- ✅ AI-powered Vibeful Guide — natural language agent configuration
- ✅ Lucid capabilities (Glyphs, Concepts, Global Memories, Token Credits)
- ✅ Embeddable SDK with command protocol for agent-driven UI

## Getting Started

```bash
pip install -e .
vibeful init
vibeful dev
```
