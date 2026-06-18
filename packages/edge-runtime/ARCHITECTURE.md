# Edge Architecture — Implementation Plan

A three-tier client-side graph architecture. This is the largest remaining architectural feature.

## Architecture

```
TIER 1: DISPLAY LAYER (browser)
  React UI, Zustand stores, MSL tags, ThreadStep CRUD
  Components: Display adapter, React SDK app, AMS
  → This tier renders. Consumes RuntimeEvents.

TIER 2: ORCHESTRATION LAYER (browser + Node.js)
  LangGraph JS graph, directive system, tool lifecycle,
  session management, persistence, event streaming
  Components: Graph runtime
  → This tier thinks. Runs ReAct loop, manages tools.

TIER 3: PLATFORM LAYER (server)
  Proxy service, RAG pipeline, MCP servers, PostgreSQL,
  credential vaults, analytics, Trust Engine
  → This tier serves. Proprietary server-side infrastructure.
```

## Three Consumption Modes

| Mode | What customer uses | What customer replaces |
|------|-------------------|----------------------|
| Full SDK | All three tiers | Nothing |
| Headless Graph | Tiers 2 + 3 | Tier 1 (build own UI) |
| Platform API | Tier 3 only | Tiers 1 + 2 (build above proxy) |

## Implementation Steps

### Step 1: Edge Runtime Package
- [ ] Create `packages/edge-runtime/` (TypeScript, LangGraph JS)
- [ ] Port agent graph to TypeScript: setup → fact_recall → buttons → system_prompt → router → rag → mcp_discovery → react_agent → stream_completion → citation → follow_up → fact_mining
- [ ] RuntimeEvent discriminated union type
- [ ] Proxy client (auth headers, session fetch, message persistence)

### Step 2: Display Adapter
- [ ] `edge-model-adapter.ts` — React hook consuming EdgeGraphRuntime
- [ ] Convert RuntimeEvent stream to Zustand/React state
- [ ] MSL tag generation for widget rendering

### Step 3: Headless Service
- [ ] Serverless container service wrapping EdgeGraphRuntime for non-browser callers
- [ ] Hono endpoints: POST /turn, POST /resume, DELETE /session/:id, GET /health
- [ ] NDJSON streaming of RuntimeEvents
- [ ] Per-thread session cache with TTL eviction

### Step 4: Verify Tier Separation
- [ ] Full SDK mode: all three tiers in browser
- [ ] Headless Graph: Tiers 2+3 in Node.js, customer provides Tier 1
- [ ] Platform API: Tier 3 only, customer builds Tiers 1+2

## Current Status
- **Tier 3 (Platform):** ✅ Complete — proxy, agent engine, RAG, MCP servers, PostgreSQL
- **Tier 2 (Orchestration):** ⏳ Not started — needs Port from Python to TypeScript
- **Tier 1 (Display):** ✅ Complete — React SDK with chat widget, managers, dashboards

## Key Constraint
The orchestration layer must run identically in a browser and in Node.js.
It has zero knowledge of React, Zustand, MSL, or any rendering concern.
