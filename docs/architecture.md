# Architecture Overview

Vibeful is a multi-tenant AI agent platform with a three-tier architecture.

## Service Topology

```
Browser (SDK) ────→ Envoy :8080 → Agent Engine :50051 → DeepSeek API
     │                    ↑
     │              Proxy :8000 (auth, routing, events)
     │              API Gateway :3000 (REST CRUD)
     │              PostgreSQL :5432 + pgvector
     │              Redis :6379 (cache)
     │              MCP Servers :3100-3102 (tools)
     │
     └── Management Console :5174 (React Flow visual designer)
```

### Management Console (Phase 1+)

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

The **Conductor** synthesizes results and overrides the response temperature. The **DML Output Router** post-processes responses through 6 precision profiles (CODE:0.1, MATH:0.1, FACT:0.3, ANALOGY:1.0, HUMOR:1.8, STORY:1.5).

## Packages

| Package | Stack | Purpose |
|---------|-------|---------|
| `agent-engine` | Python, LangGraph, gRPC | Core AI agent with RAG, MCP, memory, analysis |
| `management-console` | React 19, React Flow, Tailwind 4 | Visual agent designer + platform management |
| `proxy` | Python, FastAPI | REST API + credential injection + event logging |
| `api-gateway` | Node/TypeScript, Express | Public REST endpoints |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget |
| `mcp-servers` | Node/TypeScript | MCP tool servers |
| `shared` | TypeScript | Shared types |

## Data Flow

```
1. User types message in chat widget (SDK)
2. SDK sends POST /v1/sessions/:id/converse to API Gateway (:3000)
3. API Gateway proxies to Proxy (:8000)
4. Proxy loads session from PostgreSQL, sends gRPC to Agent Engine (:50051)
5. Agent Engine runs LangGraph:
   - attack_guard: detects and blocks prompt injection, jailbreak, XSS, SQLi
   - fact_recall: retrieves user facts from memory
   - planning: generates execution plan for complex queries
   - router: classifies intent (RAG, direct, MCP)
   - rag: searches pgvector for relevant knowledge
   - mcp_discovery: discovers tools from MCP servers
   - react_agent: calls LLM with tools + knowledge (max 5 iterations)
   - citation: identifies which sources were used in the response
   - follow_up: generates suggested next questions
   - fact_mining: extracts new facts about the user
6. Response streams back through Proxy → API Gateway → SDK
7. SDK renders message + citations + follow-up chips
```
