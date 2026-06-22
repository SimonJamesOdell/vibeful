# Vibeful

Vibeful — a self-hosted AI agent platform. Build, deploy, and manage multiple conversational agents from a visual console. Embed them into any web app with 3 lines of code. "A CMS for AI agents."

**Stack:** Python 3.12 (LangGraph agent), Node.js/TypeScript (console + SDK), PostgreSQL + pgvector, Redis, DeepSeek API.

## Quick Start

```bash
git clone https://github.com/SimonJamesOdell/vibeful.git
cd vibeful
bash scripts/setup.sh
```

**That's it.** The setup script handles everything automatically:

- Checks what's installed on your system
- Installs any missing dependencies
- Sets up a Python virtual environment
- Checks your API key (paste it when prompted, or later in the browser)
- Starts the agent engine and management console
- Opens http://localhost:5174 — the Vibeful Guide greets you there

**No Docker required for development.** Uses SQLite.  
**Windows users:** run `.\scripts\setup.ps1` in PowerShell instead.

## Day-to-Day Commands

| Command | What it does | When |
|---------|-------------|------|
| `npm run dev` | Starts agent engine + management console | Daily development |
| `npm run stack` | Full Docker architecture (PG, Redis, Envoy, proxy) | Testing the complete stack |
| `npm run stack:down` | Tears down Docker stack | Cleanup |
| `npm run console` | Just the management console (Vite) | Frontend-only work |
| `npm run build` | Production builds | Before deployment |
| `npm run test` | Run all tests | CI / pre-commit |

## Architecture

```
┌─────────────────────────────────────────────┐
│              Management Console              │
│              React Flow :5174               │
└──────────────────┬──────────────────────────┘
                   │ HTTP /v1/*
┌──────────────────▼──────────────────────────┐
│           Agent Engine (REST + gRPC)         │
│              Python / LangGraph              │
│              REST :50052  gRPC :50051       │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
 PostgreSQL    Redis       DeepSeek API
 + pgvector    (cache)
```

**Dev mode** (SQLite): `npm run dev` — agent engine REST + console, no Docker.  
**Docker mode** (PostgreSQL): `npm run stack` — adds Envoy, proxy, Redis, MCP servers.

## Packages

| Package | Stack | Purpose |
|---------|-------|---------|
| `agent-engine` | Python, LangGraph | Core AI agent — REST + gRPC servers |
| `management-console` | React, React Flow, Tailwind | Visual agent designer + platform dashboard |
| `proxy` | Python, FastAPI | Auth, session routing, analytics |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget |
| `shared` | TypeScript | Shared types and utilities |
| `mcp-servers` | Node/TypeScript | MCP tool servers |

## Development

### Python (agent-engine)

```bash
cd packages/agent-engine
source .venv/bin/activate   # or .venv\Scripts\Activate.ps1 on Windows
pip install -e ".[dev]"
pytest
```

### Node.js (console, sdk)

```bash
pnpm install
pnpm build
pnpm test
```

## Status

- ✅ Agent graph (LangGraph: 14 nodes + 11-phase analysis pipeline)
- ✅ LLM provider abstraction (DeepSeek + OpenAI)
- ✅ SQLite dev mode (no Docker required)
- ✅ Configurable agent graphs (YAML/JSON)
- ✅ Auth plugin system (api_key, jwt, passthrough)
- ✅ Eval framework (84 tests)
- ✅ REST API + Prometheus metrics + Lucid endpoints
- ✅ Helm chart + Docker Compose
- ✅ Analysis Pipeline (Lucid Sensai parity — 78/78 tests)
- ✅ Management Console (React Flow visual designer — 11 tabs)
- ✅ Multi-agent support — manage multiple agents from one console
- ✅ AI-powered Vibeful Guide — natural language agent configuration
- ✅ Lucid capabilities (Glyphs, Concepts, Global Memories, Token Credits)
- ✅ Embeddable SDK with command protocol for agent-driven UI
- ✅ Cross-platform — Windows, macOS, Linux

## Documentation

Canonical docs live in [`docs/`](docs/). Run `npm run docs:sync` to copy them to the website. See [docs/getting-started.md](docs/getting-started.md) for the full guide.
