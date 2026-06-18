# Architecture Overview

Vibeful is a multi-tenant AI agent platform with a three-tier architecture.

## Service Topology

```
Browser (SDK) → Envoy :8080 → Agent Engine :50051 → DeepSeek API
                    ↑
              Proxy :8000 (auth, routing, events)
              API Gateway :3000 (REST CRUD)
              PostgreSQL :5432 + pgvector (documents + vectors)
              Redis :6379 (cache)
              MCP Servers :3100-3102 (tools)
```

## Agent Graph (14 nodes)

```
attack_guard ──(safe)──→ setup → fact_recall → planning → buttons → system_message_builder → router
       │                                                                                        ├─ rag → mcp_discovery → react_agent
       └──(end)──→ END                                                                          ├─ react_agent (direct)
                                                                                                └─ mcp_discovery (tool request)
                                                                   stream_completion → citation → follow_up → fact_mining → END
```

## Packages

| Package | Stack | Purpose |
|---------|-------|---------|
| `agent-engine` | Python, LangGraph, gRPC | Core AI agent with RAG, MCP, memory |
| `proxy` | Python, FastAPI | REST API + credential injection + event logging |
| `api-gateway` | Node/TypeScript, Express | Public REST endpoints |
| `sdk` | React/TypeScript, Vite | Embeddable chat widget + AMS |
| `mcp-servers` | Node/TypeScript | MCP tool servers |
| `shared` | TypeScript | Shared types |
| `edge-runtime` | TypeScript (planned) | Client-side LangGraph JS |

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
