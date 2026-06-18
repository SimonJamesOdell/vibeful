# Frequently Asked Questions

## What is Vibeful?

Vibeful is an open-source platform for building and deploying AI agents. It's like WordPress for AI agents — you configure agents through a web admin panel, add knowledge, connect tools, and embed them in your app with a few lines of code.

## How is this different from just using the DeepSeek API directly?

Vibeful provides the infrastructure layer on top of the LLM: RAG (agents answer from your documents), multi-turn conversation management, MCP tool integration (search, databases, APIs), agent memory (remembers users across sessions), analytics (know what users ask and where gaps are), and a ready-to-embed chat widget.

## What LLM does it use?

DeepSeek by default. Swap via `VIBEFUL_LLM_PROVIDER` env var (supports `openai`, `deepseek`, or custom providers). Any OpenAI-compatible API works.

## Do I need a GPU?

No. Vibeful doesn't run models locally — it calls the DeepSeek API. You only need Docker.

## How much does it cost?

Vibeful itself is free (MIT license). Your only cost is DeepSeek API usage — approximately $0.27 per million input tokens and $1.10 per million output tokens. A typical support conversation costs less than $0.01.

## Can I use my own domain?

Yes. The Docker Compose file maps ports to localhost. For production, put it behind nginx/Caddy with SSL and your domain.

## How do I add more knowledge?

Use the Contexts tab in the AMS, or the REST API:
```
POST /v1/contexts/:id/ingest
{"text": "Your knowledge here", "filename": "doc.txt"}
```
Vibeful chunks the text, generates embeddings, and stores them in pgvector. The agent automatically searches this knowledge when answering questions.

## How do I give agents new capabilities?

Build an MCP server. Vibeful includes a server framework — just define tools and their handlers:
```typescript
const myServer = new McpServer('my-tools');
myServer.registerTool({
  tool: { name: 'check_inventory', ... },
  async execute(params) { return await db.query(...); }
});
myServer.listen(3103);
```
Then register it: `POST /v1/mcp-servers {"name":"Inventory","url":"http://my-server:3103"}`

## Does it support multiple users/tenants?

Yes. Sessions isolate conversations. Labels control which agents and contexts each user can access. Each user gets their own conversation thread.

## Can agents remember users?

Yes. The Agent Memory (Fact System) extracts facts from conversations and recalls them in future sessions. Users can view and delete their data (GDPR-ready).

## How do I deploy to production?

```bash
# Set a strong API key
VIBEFUL_API_KEYS=your-strong-key-here

# Use docker-compose.prod.yml (with resource limits, restart policies)
docker compose -f docker-compose.prod.yml up -d

# Put behind a reverse proxy (nginx/Caddy) with SSL
```

## What's the difference between Vibeful and LangChain/CrewAI?

LangChain and CrewAI are frameworks for building AI applications. Vibeful is a complete platform — it includes the agent engine PLUS the admin panel, embeddable SDK, knowledge management, analytics, and multi-tenancy. You could build Vibeful with LangChain, but Vibeful gives you the finished product.

## How do I contribute?

See [CONTRIBUTING.md](../CONTRIBUTING.md). Good first issues: add new MCP servers, improve documentation, write E2E tests, add widget types.

## Where can I get help?

- GitHub Discussions
- Documentation: `docs/`
- API Reference: `docs/api-reference.md`
