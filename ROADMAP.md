# Vibeful Unified Platform — Roadmap

> Last updated: 2026-06-19
> Current state: **Beta-ready.** All phases code-complete. 162/162 tests. TypeScript clean. Vite build passing. Proxy serves all Lucid endpoints. Vibeful Guide provides AI-assisted onboarding.

---

## What's Built (Complete)

### Core Agent Engine
- [x] LangGraph agent graph (14 nodes): attack_guard, setup, fact_recall, planning, buttons, system_message_builder, analysis_pipeline, rag, mcp_discovery, react_agent, output_router, stream_completion, citation, follow_up, fact_mining
- [x] Configurable graph builder (YAML/JSON → compiled StateGraph)
- [x] Node registry (builtin.* namespace, custom node registration)
- [x] LLM provider abstraction (DeepSeek + OpenAI + Anthropic protocol)
- [x] ReAct tool-calling loop (built-in tools + MCP tools)
- [x] RAG pipeline (pgvector semantic search)
- [x] MCP client (tool discovery + execution)
- [x] Agent Memory (fact mining, recall, deletion)
- [x] Streaming (SSE) and gRPC servers
- [x] REST API server (FastAPI)
- [x] Multi-tenant session management
- [x] Attack guard (prompt injection, jailbreak, XSS, SQLi)
- [x] Prometheus metrics
- [x] Quality nodes (citations, follow-ups, quick replies)
- [x] API Gateway (Express/TypeScript): agent CRUD, contexts, sessions, content ingestion

### Analysis Pipeline (Lucid Sensai parity)
- [x] Pre-response analysis (11 parallel LLM phases):
  - memories (0.2), impressions (0.5), concepts (0.5), assumptions (0.2)
  - intent (0.4), code_detect (0.5), search_detect (0.4)
  - global_memories (0.5), next (0.5), search_execute
- [x] Conductor phase — dynamically overrides response temperature/top_p
- [x] DML output router — 6 precision profiles (CODE:0.1, MATH:0.1, FACT:0.3, ANALOGY:1.0, HUMOR:1.8, STORY:1.5)
- [x] DML instruction injection into system prompt
- [x] Per-phase toggle + per-phase temperature configuration
- [x] pipeline orchestrator (asyncio.gather for parallel phases)

### Database
- [x] PostgreSQL + pgvector
- [x] Tables: agents, sessions, messages, events, contexts, context_files, context_chunks, facts, mcp_servers, workflows, threads
- [x] Lucid tables: global_memories (with embedding search), concepts (with embedding search), glyphs, token_credits, token_transactions
- [x] DatabaseLucidMixin — CRUD for all Lucid tables
- [x] TokenTracker — per-user budget management (debit/credit/balance)
- [x] GlyphSystem — glyph CRUD + prompt formatting

### Configuration
- [x] Analysis config block in AgentConfig (YAML + TypeScript types)
- [x] agent-lucid.yaml — full example with all 11 phases
- [x] Backward compatibility — analysis disabled by default, no-op when absent
- [x] All phases individually toggleable from AMS

### Tests
- [x] test_analysis_pipeline.py — 60+ tests
- [x] AnalysisConfig parsing, phase toggling, parallel execution
- [x] Conductor override, DML parsing, output routing
- [x] Global memories, next predictions, search execution
- [x] TokenTracker, GlyphSystem, backward compatibility

### Files Modified
- `vibeful/packages/agent-engine/src/agent_graph.py` — 17 insertions
- `vibeful/packages/agent-engine/src/database.py` — 44 insertions
- `vibeful/packages/agent-engine/src/graph/registry.py` — 3 insertions
- `vibeful/packages/agent-engine/src/llm/deepseek.py` — 9 insertions
- `vibeful/packages/agent-engine/src/llm/protocol.py` — 2 insertions
- `vibeful/packages/agent-engine/src/main.py` — 4 insertions
- `vibeful/packages/agent-engine/src/rest_server.py` — 6 insertions
- `vibeful/packages/api-gateway/src/index.ts` — 25 insertions

### Files Created
- `vibeful/packages/agent-engine/src/analysis_pipeline.py` — 1,108 lines
- `vibeful/packages/agent-engine/src/database_lucid.py` — 296 lines
- `vibeful/packages/agent-engine/src/token_tracker.py` — 43 lines
- `vibeful/packages/agent-engine/src/glyph_system.py` — 70 lines
- `vibeful/packages/agent-engine/configs/agent-lucid.yaml` — 65 lines
- `vibeful/packages/agent-engine/tests/test_analysis_pipeline.py` — 1,163 lines

---

## Phase 1: Visual Agent Graph Designer

> **Source pattern**: LSML Composer React Flow canvas
> **Goal**: Replace hand-edited YAML with drag-and-drop visual designer

### Tasks
- [ ] Create `vibeful/packages/management-console/` package (React 19 + Vite + Tailwind 4 + shadcn/ui)
- [ ] React Flow canvas with Vibeful node palette (14 node types in collapsible sections)
- [ ] Property panel — per-node-type editors (react_agent: max_iterations; rag: context_ids; analysis: 11 phase toggles)
- [ ] Edge connection with conditional route labels (safe/end for attack_guard, rag/react_agent/mcp_discovery for router)
- [ ] Real-time YAML preview panel (generates valid `graph:` YAML on every change)
- [ ] Save/Load — POST/GET `/v1/agents` via existing api-gateway
- [ ] Deploy button — pushes config to agent engine, returns agent ID
- [ ] Template system — save/load common agent patterns (support bot, sales, lucid, minimal)
- [ ] Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y redo, Delete remove, Ctrl+C/V copy/paste nodes
- [ ] Multi-select + bulk operations (move, delete, duplicate)

### Files to create
- `management-console/package.json`
- `management-console/src/App.tsx`
- `management-console/src/components/FlowCanvas.tsx`
- `management-console/src/components/NodePalette.tsx`
- `management-console/src/components/PropertyPanel.tsx`
- `management-console/src/components/CodePreview.tsx`
- `management-console/src/lib/yamlGenerator.ts`
- `management-console/src/lib/flowStore.ts` (Zustand)

---

## Phase 2: AI-Assisted Configuration

> **Source pattern**: LSML Composer aiAssistant.ts + proposalGenerator.ts
> **Goal**: Natural language commands + AI-suggested optimizations

### Tasks
- [ ] AI Assistant chat panel — natural language → graph mutations
- [ ] Supported commands: "add X node", "remove Y", "connect A to B", "enable impressions analysis"
- [ ] LLM Proposals tab — AI analyzes current agent config, suggests optimizations
- [ ] Proposal display: problem, solution, benefits, risks, confidence score
- [ ] One-click apply / dismiss for proposals
- [ ] Integration with Vibeful's LLM provider abstraction (Groq/DeepSeek)
- [ ] Context injection: available node types, current graph state, analysis phases

### Files to create
- `management-console/src/components/AIAssistantPanel.tsx`
- `management-console/src/components/ProposalCard.tsx`
- `management-console/src/lib/aiAssistant.ts`
- `management-console/src/lib/proposalGenerator.ts`
- `management-console/src/lib/workflowMutation.ts` (adapted from lsml-composer)

---

## Phase 3: Version Management

> **Source pattern**: LSML Composer VERSIONING.md + workflowVersions table
> **Goal**: Complete audit trail for every agent config change

### Backend
- [ ] New PostgreSQL table: `agent_versions` (agent_id, version_number, author, change_description, config_snapshot, lsml_code, tags, created_at)
- [ ] API endpoints: `GET /v1/agents/:id/versions`, `GET /v1/agents/:id/versions/:vid`, `POST /v1/agents/:id/versions/:vid/restore`
- [ ] Auto-save trigger on agent config changes (debounced 2s)

### Frontend
- [ ] Version history panel — chronological timeline
- [ ] Diff viewer — side-by-side config comparison
- [ ] Rollback — one-click restore to any version
- [ ] Authorship badges: human vs ai:{model}
- [ ] Export/Import version history as JSON
- [ ] 100-version limit with automatic cleanup

### Files to modify
- `vibeful/packages/api-gateway/src/index.ts` — new version endpoints
- `vibeful/packages/agent-engine/src/database.py` — agent_versions table + methods

### Files to create
- `management-console/src/components/VersionHistory.tsx`
- `management-console/src/components/DiffViewer.tsx`

---

## Phase 4: A/B Testing Framework

> **Source pattern**: LSML Composer AB_TESTING.md + abTests table
> **Goal**: Scientific comparison of agent config variants

### Backend
- [ ] New PostgreSQL tables: `ab_tests`, `ab_test_results`
- [ ] API endpoints: `POST /v1/ab-tests`, `GET /v1/ab-tests`, `POST /v1/ab-tests/:id/start`, `POST /v1/ab-tests/:id/stop`
- [ ] Traffic splitting at proxy/API gateway level (variant A vs B)
- [ ] Metric collection: success rate, latency, token cost, CSAT
- [ ] Statistical analysis: confidence intervals, p-values, winner declaration

### Frontend
- [ ] A/B Test creation wizard — select baseline + variant, set metrics, sample size
- [ ] Live results dashboard — per-variant metrics, running statistics
- [ ] Winner declaration with confidence level
- [ ] Test history with archived results

### Files to modify
- `vibeful/packages/api-gateway/src/index.ts` — A/B test endpoints
- `vibeful/packages/agent-engine/src/database.py` — ab_tests + ab_test_results tables

### Files to create
- `management-console/src/components/ABTestWizard.tsx`
- `management-console/src/components/ABTestDashboard.tsx`
- `management-console/src/lib/statistics.ts`

---

## Phase 5: Regression Detection

> **Source pattern**: LSML Composer regressionDetection.ts
> **Goal**: Detect when agent config changes degrade performance

### Backend
- [ ] New Python module: `regression_detector.py`
- [ ] Metrics tracked: node failure rate, average latency, token consumption, error rate
- [ ] Baseline establishment on deploy
- [ ] Statistical comparison (Student's t-test, Mann-Whitney)
- [ ] Alert thresholds: p < 0.05 with >10% degradation
- [ ] Integration with Prometheus metrics

### Frontend
- [ ] Regression monitor dashboard
- [ ] Per-node performance charts (success rate, latency, tokens)
- [ ] Alert feed with severity levels
- [ ] Rollback suggestion on detected regression

### Files to create
- `vibeful/packages/agent-engine/src/regression_detector.py`
- `management-console/src/components/RegressionMonitor.tsx`
- `management-console/src/components/PerformanceCharts.tsx`

---

## Phase 6: Glyph, Concept & Global Memory Manager

> **Goal**: Visual management for Lucid capability stores

### Tasks
- [ ] Glyph Manager: add/edit/delete glyphs, assign to concepts, preview symbols
- [ ] Concept Browser: search by domain, view glyph associations, edit descriptions
- [ ] Global Memory Explorer: browse by type (system_ontology, concept_synthesis, collective_truth), search by embedding
- [ ] All CRUD via existing api-gateway (new endpoints or direct DB queries)

### Files to modify
- `vibeful/packages/api-gateway/src/index.ts` — glyph/concept/global_memory endpoints

### Files to create
- `management-console/src/components/GlyphManager.tsx`
- `management-console/src/components/ConceptBrowser.tsx`
- `management-console/src/components/GlobalMemoryExplorer.tsx`

---

## Phase 7: Token Credit Dashboard

> **Goal**: Per-user budget management UI

### Tasks
- [ ] Balance overview — current balance, total used, total purchased
- [ ] Transaction history — chronological list, filter by type
- [ ] Purchase flow — credit tokens to user account
- [ ] Refund flow — reverse usage debits
- [ ] Per-agent budget limits

### Files to create
- `management-console/src/components/TokenDashboard.tsx`
- `management-console/src/components/TransactionHistory.tsx`
- `management-console/src/components/PurchaseFlow.tsx`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Vibeful SDK  │  │ Mgmt Console │  │ LSML Composer (legacy) │ │
│  │(chat widget) │  │(React Flow)  │  │(reference patterns)   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────────┘ │
└─────────┼─────────────────┼─────────────────────────────────────┘
          │                 │
┌─────────┼─────────────────┼─────────────────────────────────────┐
│  Envoy :8080                                                     │
│  ┌──────┴─────────────────┴──────────────────────────────────┐  │
│  │  Proxy :8000 (auth, routing)                               │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│                         │                                        │
│  ┌──────────────────────┴──────────────────────────────────┐    │
│  │  API Gateway :3000 (Express/TypeScript)                  │    │
│  │  /v1/agents  /v1/contexts  /v1/sessions                  │    │
│  │  /v1/versions /v1/ab-tests (Phase 3-4)                   │    │
│  └──────────┬───────────────────────────────┬───────────────┘    │
│             │                               │                    │
│  ┌──────────┴───────────┐  ┌────────────────┴──────────────┐    │
│  │ Agent Engine :50051  │  │ Agent Engine REST :50052      │    │
│  │ (gRPC)               │  │ (FastAPI)                      │    │
│  │                      │  │                                │    │
│  │ LangGraph (14 nodes) │  │ Analysis Pipeline (11 phases)  │    │
│  │ ReAct loop           │  │ Conductor + DML Router         │    │
│  │ RAG + MCP            │  │                                │    │
│  └──────────┬───────────┘  └────────────────┬──────────────┘    │
│             │                               │                    │
│  ┌──────────┴───────────────────────────────┴──────────────┐    │
│  │ PostgreSQL :5432 + pgvector                              │    │
│  │                                                          │    │
│  │ Core:   agents, sessions, messages, events, contexts     │    │
│  │ Memory: facts, global_memories, concepts, glyphs         │    │
│  │ Billing: token_credits, token_transactions               │    │
│  │ Mgmt:   agent_versions, ab_tests (Phase 3-4)             │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Redis :6379 (cache)                                       │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

```
Phase 1 (now)     → Visual Designer    — the core UX unlock
Phase 2           → AI Assistant       — builds on Phase 1's graph state
Phase 3           → Version Management — tracks Phase 1-2 changes
Phase 4           → A/B Testing        — uses Version Management + metrics
Phase 5           → Regression Detect  — uses A/B Testing data
Phase 6           → Glyph/Concept/Mgr  — independent, can parallelize
Phase 7           → Token Dashboard    — independent, can parallelize
```

Phases 6 and 7 are independent and can be built concurrently with any phase.

---

## Phase 8: Multi-Agent Console

> **Goal**: Manage multiple agents from one dashboard. Switch between agents in the Designer. Clone, delete, and organize agents.
> **Priority**: P0 — backend supports multiple agents, console doesn't expose it.

### 8.1 — Agent List Dashboard

- [ ] New "Agents" tab in the console header
- [ ] Fetch agents from `GET /v1/agents` (endpoint exists)
- [ ] Agent cards: name, description, model, node count, last modified
- [ ] Click agent → switches to Designer with that agent's graph loaded
- [ ] Empty state: "No agents yet — create one in the Designer"
- [ ] Delete agent with confirmation dialog

### 8.2 — Agent Selector in Designer

- [ ] Dropdown in the Designer header listing all agents
- [ ] Switching agents loads that agent's saved graph (or fresh canvas if new)
- [ ] "New Agent" option in the dropdown
- [ ] Current agent name editable in the header
- [ ] Single-agent users see no dropdown — no UX change

### 8.3 — Clone & Delete

- [ ] Clone button: duplicates agent config and graph, opens the clone
- [ ] Delete button: confirmation dialog, removes from list, switches to next agent
- [ ] Both operations use existing REST endpoints

### 8.4 — Agent-Scoped Tabs

- [ ] Versions tab filters by selected agent
- [ ] Proposals tab scoped to selected agent
- [ ] A/B Tests tab scoped to selected agent
- [ ] Monitor tab scoped to selected agent
- [ ] Glyphs, Concepts, Memories, Tokens remain global (cross-agent)

### Files to create
- `management-console/src/components/AgentList.tsx`
- `management-console/src/components/AgentSelector.tsx`

### Files to modify
- `management-console/src/App.tsx` — add Agents tab, agent selector, agent state

---

## Phase 9: UI Widget System

> **Goal**: Agents can render widgets (buttons, cards, forms, charts, tables) in the host application on demand via the vibeful-command protocol.
> **Priority**: P1 — unlocks CMS-style visual capabilities for agents.

### 9.1 — Widget Specification

- [ ] Define `WidgetSpec` JSON schema in shared types
- [ ] Widget types: `button`, `card`, `form`, `chart`, `table` (v1)
- [ ] Each widget has: `widget_id`, `type`, `props`, optional `position`/`layout`
- [ ] Widgets can be composed into layouts (row, column, grid)
- [ ] Widget interactions reported back to agent via `widget_event` messages

### 9.2 — SDK Widget Renderer

- [ ] `<WidgetRenderer>` component in SDK that renders WidgetSpec arrays
- [ ] Each widget type has a dedicated React component
- [ ] Widget events bubble up to the SDK's conversation handler
- [ ] Theme support via CSS custom properties (consistent with chat widget)

### 9.3 — Console Widget Designer

- [ ] New "Widgets" tab in the console
- [ ] Drag-and-drop widget templates onto a canvas
- [ ] Configure widget props (label, variant, fields, data source)
- [ ] Save widget templates → agents reference them by `template_id`
- [ ] Guide can create and modify widget templates via natural language

### Files to create
- `packages/sdk/src/components/WidgetRenderer.tsx`
- `packages/sdk/src/components/widgets/ButtonWidget.tsx`
- `packages/sdk/src/components/widgets/CardWidget.tsx`
- `packages/sdk/src/components/widgets/FormWidget.tsx`
- `packages/sdk/src/components/widgets/ChartWidget.tsx`
- `packages/sdk/src/components/widgets/TableWidget.tsx`
- `packages/shared/src/widgets.ts` — WidgetSpec types
- `management-console/src/components/WidgetDesigner.tsx`

---

## Phase 10: Integration Tiers

> **Goal**: Three integration models from passive embed to agent-centric greenfield apps.
> **Priority**: P1 — defines the product's market positioning.

### 10.1 — Tier 1: Passive Embed

- [ ] Chat widget + optional simple widgets (buttons, cards)
- [ ] Agent has read access to limited host state
- [ ] Integration: `<VibefulChat agentId="..." />` — 1 line
- [ ] Host app can pass `context` object for agent awareness
- [ ] Use case: SaaS support bot, knowledge base assistant

### 10.2 — Tier 2: Active Embed

- [ ] Agent drives host app UX via full command protocol
- [ ] Host registers command handlers: `navigate`, `open-modal`, `update-state`, `scroll-to`, `focus-element`, `set-theme`
- [ ] Agent can trigger multi-step workflows across the host app
- [ ] Host can send state snapshots to agent for context
- [ ] Use case: Analytics dashboard with agent that builds queries and navigates

### 10.3 — Tier 3: Agent-Centric Greenfield

- [ ] `VibefulApp` — full-page React component, agent IS the shell
- [ ] Widget system composes the entire UI
- [ ] Console "Pages" tab: define routes → agent behaviors + widget layouts
- [ ] No host app needed — agent-native applications
- [ ] Use case: Internal tools, admin panels, agent-native products

### Decision: Tier 3 Scope
Tier 3 is the biggest scope expansion — it changes the product from "embeddable agent platform" to "agent-native application platform." This competes with Retool/Appsmith but differentiated by agent-first design. Recommend building Tier 1+2 first, then evaluating demand before committing to Tier 3.

### Files to create
- `packages/sdk/src/VibefulApp.tsx` — full-page agent shell
- `packages/sdk/src/hooks/useHostCommands.ts` — command registration hook
- `management-console/src/components/PageDesigner.tsx` — route/widget designer
- `docs/integration-tiers.md` — developer guide

---

## Phase 11: Platform Hardening

> **Goal**: CI/CD pipeline, comprehensive testing, rate limiting, and database migrations.
> **Priority**: P0 — the platform is feature-complete but lacks quality gates.

### 8.1 — Local-First CI/CD Pipeline

**Design principle**: Run everything on local hardware. Zero cloud CI cost. Provider-agnostic — any CI system invokes the same target.

#### Tasks
- [ ] Create `Makefile` at repo root with these targets:
  - `make ci` — full pipeline (lint → typecheck → test → build)
  - `make lint` — Python (ruff) + TypeScript (eslint)
  - `make typecheck` — mypy + tsc --noEmit
  - `make test` — pytest + vitest + Playwright E2E
  - `make test-unit` — pytest only (fast feedback)
  - `make test-e2e` — Playwright E2E
  - `make build` — vite build (management-console + sdk)
  - `make clean` — remove build artifacts
- [ ] Create `scripts/ci.sh` — single script that runs `make ci` with colored output and timing
- [ ] Create `scripts/pre-commit` — installable git hook (runs lint + typecheck on staged files)
- [ ] Create optional `.github/workflows/ci.yml` — calls `make ci`, clearly documented as optional
- [ ] Create `.gitlab-ci.yml.example` — shows how GitLab CI calls the same `make ci`
- [ ] Document: "To run CI locally: `make ci`. To skip cloud CI, just don't push the workflow file."

#### Files to create
- `Makefile`
- `scripts/ci.sh`
- `scripts/pre-commit`
- `.github/workflows/ci.yml` (optional, documented as such)
- `.gitlab-ci.yml.example`

### 8.2 — Management Console Test Suite

> **Goal**: 80%+ coverage on the visual designer. Catch regressions in the drag-and-drop UX.

#### Tasks
- [ ] Add `vitest` + `@testing-library/react` to management-console devDependencies
- [ ] Unit tests: `flowStore.test.ts` (node CRUD, selection, undo), `yamlGenerator.test.ts` (serialization round-trip)
- [ ] Component tests: `NodePalette.test.tsx` (renders categories, collapse), `PropertyPanel.test.tsx` (field editors)
- [ ] Integration: `FlowCanvas.test.tsx` (add node → connect → YAML matches expected)
- [ ] Playwright E2E: `vibeful-console.spec.ts`
  - Open console → drag "Setup" onto canvas → verify node appears
  - Add 3 nodes → connect them → click Deploy → verify agent created
  - Open AI Assistant → type "add an attack guard" → verify node appears on canvas

#### Files to create
- `management-console/src/__tests__/`
- `management-console/src/__tests__/flowStore.test.ts`
- `management-console/src/__tests__/yamlGenerator.test.ts`
- `management-console/src/__tests__/NodePalette.test.tsx`
- `management-console/src/__tests__/PropertyPanel.test.tsx`
- `management-console/e2e/vibeful-console.spec.ts`

### 8.3 — Rate Limiting

> **Goal**: Prevent API abuse. Token credits handle budget; rate limiting handles volume.

#### Tasks
- [ ] Add `slowapi` (Python) dependency to agent-engine
- [ ] Apply `@limiter.limit("60/minute")` to `/v1/sessions/:id/converse`
- [ ] Apply `@limiter.limit("300/minute")` to GET endpoints
- [ ] Apply `@limiter.limit("30/minute")` to POST `/v1/ai/assist`
- [ ] Configurable via env: `VIBEFUL_RATE_LIMIT_CONVERSE`, `VIBEFUL_RATE_LIMIT_GLOBAL`
- [ ] Rate limit headers in responses (`X-RateLimit-*`)
- [ ] API Gateway: add `express-rate-limit` middleware as second layer

#### Files to modify
- `packages/agent-engine/src/rest_server.py`
- `packages/agent-engine/pyproject.toml` (add `slowapi`)
- `packages/api-gateway/src/index.ts` (add `express-rate-limit`)

### 8.4 — Database Migrations (Alembic)

> **Goal**: Replace imperative `init_schema()` with versioned, reversible migrations.

#### Tasks
- [ ] Add `alembic` to agent-engine devDependencies
- [ ] Run `alembic init` in `packages/agent-engine/`
- [ ] Extract current schema into initial migration (all CREATE TABLE statements)
- [ ] Add Lucid tables migration (global_memories, concepts, glyphs, token_credits, transactions, agent_versions, ab_tests)
- [ ] Add `make migrate` and `make migrate-rollback` targets to Makefile
- [ ] Update `main.py` and `rest_server.py` to run `alembic upgrade head` instead of `init_schema()`
- [ ] Keep `init_schema()` as dev-only SQLite fallback path

#### Files to create/modify
- `packages/agent-engine/alembic/` (directory + config + env.py)
- `packages/agent-engine/alembic/versions/001_initial_schema.py`
- `packages/agent-engine/alembic/versions/002_lucid_tables.py`
- `packages/agent-engine/src/main.py` (replace init_schema call)
- `packages/agent-engine/src/rest_server.py` (replace init_schema call)
- `Makefile` (add migrate targets)

---

## Phase 12: Production Readiness

> **Goal**: Backup/restore, structured logging, SQLite Lucid compatibility.
> **Priority**: P1 — needed before any real production deployment.

### 9.1 — Backup & Restore

> **Goal**: One-command PostgreSQL backup and restore.

#### Tasks
- [ ] Create `scripts/backup.sh` — `pg_dump` to timestamped file
- [ ] Create `scripts/restore.sh` — `pg_restore` from backup file
- [ ] Add `make backup` and `make restore` targets
- [ ] Document in `docs/production.md` (new doc)
- [ ] Optional: S3/GCS backup script for automated off-site backups

#### Files to create
- `scripts/backup.sh`
- `scripts/restore.sh`
- `docs/production.md`

### 9.2 — Structured Logging & Request Tracing

> **Goal**: Every request gets a trace ID. Logs are JSON-structured. Debuggable in production.

#### Tasks
- [ ] Agent engine: add `structlog` for JSON-structured logging
- [ ] Add request ID middleware (`X-Request-Id` header propagation)
- [ ] Log every API call with: request_id, method, path, status, latency_ms, user_identity
- [ ] API Gateway: add `morgan` with request ID injection
- [ ] Document log format and how to query with `jq`

#### Files to modify
- `packages/agent-engine/src/rest_server.py`
- `packages/agent-engine/src/main.py`
- `packages/api-gateway/src/index.ts`
- `packages/agent-engine/pyproject.toml` (add `structlog`)

### 9.3 — SQLite Dev Mode Lucid Compatibility

> **Goal**: Lucid tables work in SQLite dev mode (no Docker/PostgreSQL required).

#### Tasks
- [ ] Add SQLite schema creation for all Lucid tables in `storage/sqlite.py`
- [ ] Replace pgvector embedding ops with SQLite-compatible alternatives:
  - Cosine similarity via pure Python (numpy) for dev mode
  - Or use `sqlite-vec` extension
- [ ] Test: `VIBEFUL_STORAGE=sqlite pytest tests/` passes without PostgreSQL
- [ ] Document: "For production, use PostgreSQL. For local dev, SQLite works for everything except vector search quality."

#### Files to modify
- `packages/agent-engine/src/storage/sqlite.py`
- `packages/agent-engine/src/database_lucid.py`

---

## Phase 13: Ecosystem Growth

> **Goal**: MCP server examples, interactive docs, and a developer playground.
> **Priority**: P2 — strategic differentiators, not blocking.

### 10.1 — MCP Server Examples

> **Goal**: Ready-to-use tool servers so users don't start from scratch.

#### Tasks
- [ ] `mcp-web-search` — DuckDuckGo/Bing search tool (already scaffolded)
- [ ] `mcp-weather` — Open-Meteo free weather API tool
- [ ] `mcp-calculator` — Safe math evaluation tool
- [ ] `mcp-filesystem` — Read/write files within a sandboxed directory
- [ ] Each server: Dockerfile, README with curl test, registered in `docker-compose.yml`
- [ ] Document in `docs/mcp-servers.md` (new doc)

#### Files to create
- `packages/mcp-servers/src/web-search/`
- `packages/mcp-servers/src/weather/`
- `packages/mcp-servers/src/calculator/`
- `packages/mcp-servers/src/filesystem/`
- `docs/mcp-servers.md`

### 10.2 — SDK Documentation Site

> **Goal**: Interactive docs with live playground. Not a marketing page — a developer tool.

#### Tasks
- [ ] Create `website/` as a VitePress or Docusaurus site
- [ ] Pages: Getting Started, API Reference, SDK Guide, MCP Guide, Architecture, FAQ
- [ ] Embed live playground: `<VibefulChat>` component with a demo agent
- [ ] Publish to GitHub Pages or similar
- [ ] Link from root README and main website

#### Files to create/modify
- `website/` (convert from single HTML to full doc site)

### 10.3 — E2E Test Expansion

> **Goal**: End-to-end tests covering the full user journey.

#### Tasks
- [ ] SDK E2E: mount widget → send message → verify response
- [ ] Console E2E: drag nodes → deploy → converse via SDK → verify analysis results
- [ ] API E2E: create agent → create session → converse → check facts stored → check token debited
- [ ] Run in CI: `make test-e2e` starts Docker Compose, runs Playwright, tears down

#### Files to create
- `packages/sdk/e2e/` (expand existing)
- `packages/management-console/e2e/`
- `tests/e2e/` (API-level E2E)

---

## Updated Implementation Order

```
Phase 1-7 (done)   → Platform feature-complete ✅
Phase 8  (in progress) → Multi-agent console: dashboard, selector, scoped tabs
Phase 9               → UI Widget System: widgets rendered via vibeful-command
Phase 10              → Integration Tiers: passive/active embed → greenfield apps
Phase 11              → CI/CD, tests, rate limiting, DB migrations
Phase 12              → Backup, logging, SQLite Lucid support
Phase 13              → MCP examples, interactive docs, E2E expansion
```

---


1. **Visual designer generates YAML, not LSML** — Vibeful's native config format
2. **React 19 + React Flow + Tailwind 4 + shadcn/ui** — same stack as LSML Composer
3. **Zustand for state** — lighter than Redux, already in LSML Composer
4. **Auth via existing session/cookie system** — no new auth layer
5. **All AI calls use Vibeful's LLM provider abstraction** — DeepSeek/Groq, not direct API calls
6. **New tables in PostgreSQL, not MySQL** — existing infrastructure
7. **Management console is a NEW package** — doesn't modify sdk or agent-engine
8. **No LSML Composer code copied directly** — patterns adapted, code rewritten
9. **Local-first CI/CD** — `make ci` runs everything locally. No cloud CI required. Provider-agnostic by design — any CI system (GitHub Actions, GitLab CI, Jenkins, etc.) invokes the same `make ci` target.
