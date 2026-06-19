# Vibeful Unified Platform — Roadmap

> Last updated: 2026-06-19
> Current state: All 7 phases code-complete. 78/78 tests passing. TypeScript clean. Vite build passing.

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

## Key Decisions Record

1. **Visual designer generates YAML, not LSML** — Vibeful's native config format
2. **React 19 + React Flow + Tailwind 4 + shadcn/ui** — same stack as LSML Composer
3. **Zustand for state** — lighter than Redux, already in LSML Composer
4. **Auth via existing session/cookie system** — no new auth layer
5. **All AI calls use Vibeful's LLM provider abstraction** — DeepSeek/Groq, not direct API calls
6. **New tables in PostgreSQL, not MySQL** — existing infrastructure
7. **Management console is a NEW package** — doesn't modify sdk or agent-engine
8. **No LSML Composer code copied directly** — patterns adapted, code rewritten
