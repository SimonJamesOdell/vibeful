# Architecture Overview

Vibeful is a self-hosted AI agent platform with a unified architecture that runs identically in local dev mode (SQLite, no Docker) and production mode (PostgreSQL, Docker).

## Service Topology

```
┌─────────────────────────────────────────────┐
│              Management Console              │
│              React Flow :5174               │
│              (Vite dev or static build)     │
└──────────────────┬──────────────────────────┘
                   │ HTTP /v1/*
┌──────────────────▼──────────────────────────┐
│           Agent Engine                       │
│           Python / LangGraph                 │
│                                              │
│   ┌─────────────┐    ┌──────────────────┐   │
│   │ REST Server │    │   gRPC Server     │   │
│   │ :50052      │    │   :50051          │   │
│   │ (console,   │    │   (SDK streaming) │   │
│   │  CRUD, AI   │    │                   │   │
│   │  assist)    │    │                   │   │
│   └──────┬──────┘    └────────┬──────────┘   │
│          │                    │              │
│   ┌──────▼────────────────────▼──────────┐   │
│   │          Agent Graph                 │   │
│   │     (14 nodes + analysis pipeline)   │   │
│   └──────────────────────────────────────┘   │
│                    │                         │
└────────────────────┼─────────────────────────┘
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
  PostgreSQL      Redis        DeepSeek API
  + pgvector      (cache)

  (Docker mode)   (Docker)     (both modes)
  ────────────    ───────     ───────────
  SQLite          in-memory
  (local dev)     (local dev)
```

### Two Run Modes

| Mode | Command | Database | Services |
|------|---------|----------|----------|
| **Local dev** | `npm run dev` | SQLite | Agent engine (REST) + Management console |
| **Docker** | `npm run stack` | PostgreSQL + Redis | Full stack: agent engine (REST+gRPC), console, Envoy, proxy, MCP |

Both modes run the same code. The REST server auto-detects PostgreSQL via `DATABASE_URL` and falls back to SQLite.

### Management Console

A full visual agent designer with 10 integrated tabs:

| Tab | Purpose |
|-----|---------|
| Designer | Drag-and-drop React Flow canvas for building agent graphs |
| Templates | Pre-built agent patterns (Minimal, Full, Lucid) |
| Versions | Auto-saved version history with diff viewer and rollback |
| Proposals | AI-suggested optimizations by analyzing your graph |
| A/B Tests | Scientific comparison of agent config variants |
| Monitor | Per-node performance metrics with regression alerts |
| Glyphs | Symbolic visual representations for concepts |
| Concepts | Named conceptual frameworks with domain filtering |
| Memories | Cross-user global knowledge patterns |
| Tokens | Per-user token credit management |

## Agent Graph (14 nodes + analysis pipeline)

```
attack_guard ──(safe)──→ setup → fact_recall → planning → buttons → system_message_builder
       │                                                                  │
       └──(end)──→ END                                           analysis_pipeline (11 parallel LLM phases)
                                                                        │
                                                                      router
                                                                   ├─ rag → react_agent
                                                                   ├─ react_agent (direct)
                                                                   └─ mcp_discovery (tool request)
                                                                        │
                                                              output_router (DML segmentation)
                                                                        │
                                                   stream_completion → citation → follow_up → fact_mining → END
```

### Analysis Pipeline (Lucid Sensai parity)

11 parallel LLM phases run before the main response:

| Phase | Temperature | Purpose |
|-------|-------------|---------|
| memories | 0.2 | Extract new user facts |
| impressions | 0.5 | Emotional tone / mindset |
| concepts | 0.5 | New conceptual frameworks |
| assumptions | 0.2 | Implicit user assumptions |
| intent | 0.4 | Rich intent classification |
| code_detect | 0.5 | Code generation requests |
| search_detect | 0.4 | Web search needed? |
| global_memories | 0.5 | Cross-user patterns |
| next | 0.5 | Predicted follow-ups |
| conductor | 0.5 | Dynamically sets response temperature/top_p |
| search_execute | 0.0 | Executes web search if needed |

## Packages

| Package | Stack | Role |
|---------|-------|------|
| `agent-engine` | Python, LangGraph | Core AI agent — REST + gRPC servers, agent graph, analysis pipeline |
| `management-console` | React 19, React Flow, Tailwind 4 | Visual agent designer + platform dashboard |
| `proxy` | Python, FastAPI | Auth, session routing, analytics, facts, threads |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget with command protocol |
| `mcp-servers` | Node/TypeScript | MCP tool servers (web search, file read, calculator) |
| `shared` | TypeScript | Shared types and MCP protocol utilities |

## Data Flow

```
1. Management Console sends HTTP requests to Agent Engine REST (:50052)
   — Agent CRUD, knowledge contexts, AI assist, health checks
2. SDK widget connects via Envoy (:8080) → Agent Engine gRPC (:50051)
   — Streaming conversation with tool calls
3. Proxy (:8000) handles session routing, analytics, facts, threads
4. Agent Engine runs LangGraph:
   - attack_guard: detects prompt injection, jailbreak, XSS, SQLi
   - fact_recall: retrieves user facts from memory
   - router: classifies intent (RAG, direct, MCP)
   - rag: searches pgvector for relevant knowledge
   - react_agent: calls LLM with tools + knowledge
   - citation: identifies sources used in the response
   - follow_up: generates suggested next questions
   - fact_mining: extracts new facts about the user
5. Response streams back through the same path
```
