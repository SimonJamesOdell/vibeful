# E2E Tests — Playwright specifications for the Vibeful platform

These test specs cover the critical user journeys. Run with:
```bash
npx playwright test
```

## Spec 1: Agent Creation & Conversation
- [ ] Create agent via POST /v1/agents
- [ ] Verify agent appears in GET /v1/agents list
- [ ] Create session bound to agent
- [ ] Send message via POST /v1/sessions/:id/converse
- [ ] Verify response contains STREAMING and COMPLETED states
- [ ] Verify token usage is reported

## Spec 2: Knowledge Context & RAG
- [ ] Create knowledge context
- [ ] Ingest text content into context
- [ ] Create agent with context
- [ ] Ask a question covered by the knowledge
- [ ] Verify response uses the ingested knowledge
- [ ] Verify RAG references appear in response

## Spec 3: MCP Tool Execution
- [ ] Register MCP server (web_search)
- [ ] Create agent with MCP server URL
- [ ] Ask a question requiring web search
- [ ] Verify TOOL_USED state appears with tool_call
- [ ] Verify agent uses tool results in response

## Spec 4: SDK Embedding
- [ ] Load SDK dev page at localhost:5173
- [ ] Verify 5 tabs render (Chat, Agents, Contexts, MCP Servers, Observability)
- [ ] Create agent via Agents tab form
- [ ] Enter agent ID in Chat tab header
- [ ] Send a message
- [ ] Verify response appears in chat widget
- [ ] Verify citations render (if knowledge context configured)
- [ ] Verify follow-up questions render as tappable chips

## Spec 5: Error States
- [ ] Missing API key → returns 401
- [ ] Invalid agent ID → returns 404
- [ ] Empty message content → returns 400
- [ ] Agent engine unreachable → graceful error message
- [ ] Knowledge ingestion with empty text → returns 400

## Spec 6: Agent Memory (Facts)
- [ ] Create session with user_identity
- [ ] Send message with personal information
- [ ] Verify fact is mined and stored
- [ ] Create new session with same user_identity
- [ ] Send unrelated message
- [ ] Verify fact_recall node retrieves stored facts
- [ ] Delete fact via API
- [ ] Verify fact is removed
