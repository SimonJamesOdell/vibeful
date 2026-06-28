# Vibeful

Vibeful — a self-hosted AI agent platform. Build, deploy, and manage multiple conversational agents from a visual console. Embed them into any web app with 3 lines of code. "A CMS for AI agents."

**Tooling-agnostic.** Vibeful's REST API and YAML-based agent graph configuration work with any agentic programming tool — CodeWhale, Codex, Copilot, Claude Code, Cursor, or any other. If it can POST JSON and write YAML, it can build on Vibeful.

**Stack:** Python 3.12 (LangGraph / FastAPI), Node.js/TypeScript (React + Vite), PostgreSQL + pgvector, Redis, DeepSeek API.

**764 tests. 72 endpoints. 70 Guide commands. 0 TypeScript errors.**

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

## Three Integration Tiers

| Tier | Name | How | When |
|------|------|-----|------|
| **1** | Embed | `<script>` tag → chat widget | Add an agent to any static page |
| **2** | Integrate | Headless API + webhooks + SDKs | Backend-driven agent workflows |
| **3** | Agent-native | Agents create pages with interactive widgets | Fully agent-driven applications |

See [docs/sdk-guide.md](docs/sdk-guide.md) for code examples at every tier.

## Day-to-Day Commands

| Command | What it does | When |
|---------|-------------|------|
| `npm run dev` | Starts agent engine + management console | Daily development |
| `npm run stack` | Full Docker architecture (PG, Redis, Envoy, proxy) | Testing the complete stack |
| `npm run stack:down` | Tears down Docker stack | Cleanup |
| `npm run console` | Just the management console (Vite) | Frontend-only work |
| `npm run build` | Production builds | Before deployment |
| `npm run test` | Run all tests (all packages) | CI / pre-commit |

## Architecture

```
┌─────────────────────────────────────────────┐
│              Management Console              │
│              React Flow :5174               │
│   Dashboard · Designer · Agents · MCP ·     │
│   Knowledge · Pages · Analytics             │
└──────────────────┬──────────────────────────┘
                   │ HTTP /v1/*
┌──────────────────▼──────────────────────────┐
│           Agent Engine                       │
│           Python / LangGraph / FastAPI       │
│           REST + SSE + Webhooks :50052      │
│                                              │
│   Agent Graph: Setup → Guard → Router →     │
│   RAG → React → Completion                  │
│                                              │
│   Analysis Pipeline (11 parallel phases)    │
│                                              │
│   Storage: SQLite (dev) / PostgreSQL (prod) │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
 PostgreSQL    Redis       DeepSeek API
 + pgvector    (cache)
```

## Packages

| Package | Stack | Purpose | Tests |
|---------|-------|---------|-------|
| `agent-engine` | Python, LangGraph, FastAPI | Core agent engine — REST + SSE + webhooks | 602 |
| `management-console` | React, React Flow, Tailwind | Visual agent designer + platform dashboard | 136 |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget + React hooks | — |
| `sdk-python` | Python, httpx | Headless agent client (`pip install vibeful`) | 26 |
| `shared` | TypeScript | Shared types and utilities | — |
| `mcp-servers` | Node/TypeScript | MCP tool servers | — |

## Key Features

- **Visual Agent Designer** — React Flow canvas with 14+ node types, drag-and-drop configuration
- **Vibeful Guide** — Natural language → agent configuration (70 commands)
- **Agent Lifecycle** — Create, edit, clone, rename, delete, version history, A/B testing
- **MCP Tools** — Built-in web-search, file-read, calculator; plug in any MCP server
- **Knowledge Base** — Upload documents, auto-chunk, embed, RAG retrieval
- **Agent Pages** — Agents create and publish interactive pages with form, chart, table, and card widgets
- **Widget Event Loop** — Users interact with widgets → agent processes → page updates
- **Python SDK** — `pip install vibeful` → `execute()` + `stream()` headless invocation
- **API Keys** — SHA-256 hashed, `vf_` prefix, scoped permissions
- **Users & Teams** — Registration, login, team management
- **Webhooks** — Subscribe to `conversation.completed` events
- **Import/Export** — Agents as portable `.vibeful.yaml` bundles
- **Staging → Production** — Promote tested agent configs with one click
- **Automated Testing** — Define test cases (input → expected output), run suites

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

### Python SDK

```bash
cd packages/sdk-python
pip install -e ".[dev]"
pytest
```

## Status

- ✅ Agent graph (LangGraph: Setup → Guard → Router → RAG → React → Completion)
- ✅ Analysis Pipeline (11 parallel phases: memories, impressions, concepts, conductor, etc.)
- ✅ SQLite dev mode (no Docker required)
- ✅ Configurable agent graphs (YAML/JSON)
- ✅ MCP server management (CRUD, health, Docker start/stop)
- ✅ Agent Pages (CRUD, markdown editor, widget composition, event loop)
- ✅ 72 REST API endpoints across 12 categories
- ✅ Python SDK (`vibeful` package, 26 tests)
- ✅ JS SDK hooks (`useAgent`, `useAgentStream`)
- ✅ Webhook delivery (fire-and-forget, 10s timeout)
- ✅ API key management (SHA-256 hashed, scoped)
- ✅ Users & teams (registration, login, team membership)
- ✅ Import/export + staging/promotion
- ✅ Audit logging
- ✅ Automated agent testing
- ✅ Helm chart + Docker Compose
- ✅ Cross-platform — Windows, macOS, Linux
- ✅ 764 tests (602 Python + 136 vitest + 26 Python SDK)
- ✅ 70 Guide commands covering all console operations
- ✅ TypeScript clean across both packages

## Documentation

Canonical docs live in [`docs/`](docs/). Run `npm run docs:sync` to copy them to the website.

- [Getting Started](docs/getting-started.md)
- [API Reference](docs/api-reference.md) — 72 endpoints across 12 categories
- [SDK Integration Guide](docs/sdk-guide.md) — all 3 tiers with code examples
- [Architecture](docs/architecture.md)
- [FAQ](docs/faq.md)
- [Roadmap](ROADMAP.md)
