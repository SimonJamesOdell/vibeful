# Vibeful — Platform Instructions for Agentic Programming Tools

> **Tooling-agnostic.** These instructions apply regardless of which agentic
> programming tool you use — CodeWhale, Codex, Copilot, Claude Code, Cursor,
> or any other. Vibeful's REST API and YAML-based graph configuration are
> designed to be consumed by any tool that can POST JSON and write YAML.

## What Vibeful Is

Vibeful is a self-hosted AI agent development platform — think "WordPress for AI agents."
It provides the backend for building agent-native web applications across three tiers:

| Tier | Name | Pattern |
|------|------|---------|
| 1 | Embed | Drop a chat widget into any existing page |
| 2 | Integrate | Headless API + webhooks + SDK for backend agent workflows |
| 3 | Agent-Native | Agents create pages, render widgets, handle interactions — thin frontend shell |

---

## Complete Build Process

> **Follow these steps in order.** Every step is required for a working result.
> The vibeful engine must be running on `http://localhost:50052` before starting.

### Step 1 — Start the Vibeful Engine

```bash
cd vibeful/packages/agent-engine
.venv\Scripts\python.exe -m uvicorn src.rest_server:app --host 127.0.0.1 --port 50052
```

Verify: `curl http://localhost:50052/health` → `{"status":"ok"}`

The engine needs a DeepSeek API key in `vibeful/.env`:
```
DEEPSEEK_API_KEY=sk-your-key-here
```

### Step 2 — Scaffold the Project Shell

Create a thin React project alongside vibeful. See the [Project Scaffold Template](#project-scaffold-template) below.

The shell must:
- Depend on `@vibeful/sdk` and `@vibeful/shared` (file: references into `../vibeful/packages/`)
- Proxy `/v1` to `http://localhost:50052` in vite.config.ts
- Contain NO business logic, product data, or hardcoded content
- Use `VibefulChat` from the SDK for the assistant widget

### Step 3 — Create the Agent

**Every agent must be created with ALL of these fields populated.** An agent
with missing fields will not function correctly in the Management Console.

```
POST /v1/agents
```

Required fields:

| Field | Required | Example / Notes |
|-------|----------|-----------------|
| `name` | Yes | `"My Store Agent"` |
| `description` | Yes | Short summary of the agent's purpose |
| `system_prompt` | Yes | Full domain knowledge, tone, rules — be comprehensive |
| `model` | Yes | `"deepseek-chat"` |
| `temperature` | Yes | `0.7` |
| `config_yaml` | **Yes** | Full LangGraph pipeline — see [Agent Graph Configuration](#agent-graph-configuration) |
| `styling` | **Yes** | Preset name — see [Agent Styling](#agent-styling) |
| `context_ids` | No (set later) | Link to knowledge base after creating it |

**Do NOT create an agent with an empty `config_yaml` or empty `styling`.**
The Management Console visual designer will show a blank canvas, and the
site owner will have no way to understand or edit the pipeline.

### Step 4 — Configure the Agent Graph

Set `config_yaml` to a complete LangGraph pipeline. The vibeful engine
compiles this YAML into a per-agent LangGraph StateGraph at runtime.
16 built-in nodes are available — see the registry in
`packages/agent-engine/src/graph/registry.py`.

**Reference: full 15-node pipeline** (suitable for most applications):

```yaml
graph:
  entry: attack_guard
  nodes:
    - name: attack_guard
      type: builtin.attack_guard
    - name: setup
      type: builtin.setup
    - name: fact_recall
      type: builtin.fact_recall
    - name: planning
      type: builtin.planning
    - name: buttons
      type: builtin.buttons
    - name: system_message_builder
      type: builtin.system_message_builder
    - name: analysis_pipeline
      type: builtin.analysis_pipeline
    - name: rag
      type: builtin.rag
    - name: mcp_discovery
      type: builtin.mcp_discovery
    - name: react_agent
      type: builtin.react_agent
    - name: output_router
      type: builtin.output_router
    - name: stream_completion
      type: builtin.stream_completion
    - name: citation
      type: builtin.citation
    - name: follow_up
      type: builtin.follow_up
    - name: fact_mining
      type: builtin.fact_mining
  edges:
    - from: attack_guard
      routes:
        safe: setup
        end: __END__
    - from: setup
      to: fact_recall
    - from: fact_recall
      to: planning
    - from: planning
      to: buttons
    - from: buttons
      to: system_message_builder
    - from: system_message_builder
      to: analysis_pipeline
    - from: analysis_pipeline
      condition: builtin.router
      routes:
        rag: rag
        react_agent: react_agent
        mcp_discovery: mcp_discovery
    - from: rag
      to: mcp_discovery
    - from: mcp_discovery
      to: react_agent
    - from: react_agent
      to: output_router
    - from: output_router
      to: stream_completion
    - from: stream_completion
      to: citation
    - from: citation
      to: follow_up
    - from: follow_up
      to: fact_mining
    - from: fact_mining
      to: __END__
```

> **Note:** The `analysis_pipeline` edge uses `condition: builtin.router`
> (NOT plain `routes`). This calls the registered `router_node` function
> which classifies user intent and routes to `rag`, `react_agent`, or
> `mcp_discovery`. Using plain `routes` without `condition` will fail.

**Available built-in node types** (callable by name in the graph config):

- `builtin.attack_guard` — Blocks injection/jailbreak attempts
- `builtin.setup` — Initializes session state and system prompt
- `builtin.fact_recall` — Retrieves stored user facts from memory
- `builtin.planning` — Generates execution plans for complex queries
- `builtin.buttons` — Emits quick-reply button suggestions
- `builtin.system_message_builder` — Assembles the final system message
- `builtin.analysis_pipeline` — Runs parallel LLM analysis (intent, tone, etc.)
- `builtin.rag` — Retrieves relevant chunks from knowledge bases (requires PostgreSQL + pgvector)
- `builtin.mcp_discovery` — Discovers tools from configured MCP server URLs
- `builtin.react_agent` — Core ReAct loop (think → act → observe)
- `builtin.output_router` — Post-processes responses through DML segment routing
- `builtin.stream_completion` — Streams the final response text
- `builtin.citation` — Builds citations from RAG results
- `builtin.follow_up` — Generates follow-up question suggestions
- `builtin.fact_mining` — Extracts and stores new facts from the conversation
- `builtin.router` — Condition function for intent-based routing (use with `condition: builtin.router`)

### Step 5 — Set Agent Styling

Set `styling` to one of these presets. The styling controls the Management
Console appearance and is read by SDK components via CSS custom properties.

**Available presets:**

| Preset | Background | Text Color | Font | Use Case |
|--------|-----------|------------|------|----------|
| `light` | `#ffffff` | `#1e293b` | system-ui | Clean, professional, e-commerce |
| `dark` | `#0f172a` | `#f1f5f9` | Inter | Developer tools, night-mode apps |
| `default` | `#1e293b` | `#e2e8f0` | Inter | General purpose |
| `brand` | `#4f46e5` | `#ffffff` | Poppins | Branded experiences |

CSS custom properties set by styling:
- `--vibeful-bg` — background color
- `--vibeful-fg` — text/foreground color
- `--vibeful-font` — font family
- `--vibeful-font-size` — base font size

**Do not leave styling empty.** An agent without styling will not apply
any visual theme in the Management Console or SDK widgets.

### Step 6 — Create a Knowledge Base

If the agent needs RAG (product catalogs, documentation, policies):

```
POST /v1/contexts
Body: {"name": "Product Catalog", "agent_id": "<agent-id>"}

POST /v1/contexts/{context_id}/ingest
Body: {"text": "<full catalog markdown>", "filename": "catalog.md"}
```

After creating the context, link it to the agent:

```
PUT /v1/agents/{agent_id}
Body: {"context_ids": ["<context_id>"]}
```

> **Windows / SQLite note:** RAG (vector search) requires PostgreSQL +
> pgvector. On SQLite dev mode, the `rag` node will skip gracefully
> (no error, no retrieval). The agent still works from its system prompt.
> For full RAG, run `npm run stack` with Docker.

### Step 7 — Create Agent Pages

Create pages for each section of the application. Pages are markdown
documents with optional vibeful widgets that the frontend renders.

```
POST /v1/pages
Body: {
  "agent_id": "<agent-id>",
  "slug": "products",
  "title": "Our Products",
  "content_markdown": "# Products\n\n...",
  "published": true
}
```

**Every application should have at minimum:**
- A home page (slug: `home`)
- Category/section pages for each major content area
- An about/contact page

**Widgets in pages** use HTML data attributes:
```html
<div data-vibeful-widget='{"widget_id":"my-btn","type":"button","props":{"label":"Click Me","variant":"primary"}}'></div>
```

Available widget types: `button`, `card`, `form`, `chart`, `table`.

### Step 8 — Build the Frontend Shell

The project shell must render pages from vibeful and include the chat widget.
The SDK's `VibefulApp` component is a chat-only agent shell — it does NOT
render pages. For a storefront-style application, build a custom shell that:

1. **Fetches pages** from `GET /v1/pages/slug/{slug}`
2. **Renders markdown** content from the page's `content_markdown` field
3. **Includes `VibefulChat`** as a slide-out drawer or fixed widget
4. **Has navigation** between page slugs
5. **Contains no business logic or product data** — everything comes from vibeful

Reference implementation: see `kentsofas/src/App.tsx` for a working storefront
shell with page routing, navigation, and a chat drawer.

### Step 9 — Verify End-to-End

Before considering the build complete, verify:

- [ ] Engine is running and healthy (`/health`)
- [ ] Agent responds to conversations via `/v1/sessions/{id}/converse`
- [ ] Agent's `config_yaml` has nodes defined (check `GET /v1/agents/{id}` → `config_json` field)
- [ ] Agent's `styling_json` is not empty
- [ ] Knowledge base is created and linked (check `context_ids` field)
- [ ] Pages exist and are fetchable (`GET /v1/pages/slug/home`)
- [ ] Frontend shell builds without TypeScript errors (`pnpm build`)
- [ ] Frontend shell renders pages from vibeful when navigating
- [ ] Chat widget appears and the agent responds correctly
- [ ] Response time is acceptable (no RAG errors in the response chunks)

### Quick Verification Script

```bash
# Check engine health
curl http://localhost:50052/health

# Check agent has graph config and styling
curl http://localhost:50052/v1/agents | python -c "import sys,json; agents=json.load(sys.stdin); [print(f'{a[\"name\"]}: graph={bool(a.get(\"config_json\"))}, styling={a.get(\"styling_json\",\"\")}') for a in agents]"

# Check pages exist
curl http://localhost:50052/v1/pages | python -c "import sys,json; pages=json.load(sys.stdin); print(f'{len(pages)} pages: {[p[\"slug\"] for p in pages]}')"

# Test a conversation
curl -X POST http://localhost:50052/v1/sessions -H 'Content-Type: application/json' -d '{"agent_id":"<agent-id>"}'
# (use the returned session_id to send a message)
```

---

## Seed URL Workflow

When the build task includes a seed URL (e.g. "build a modern replacement for
https://www.suite-world.co.uk"), follow this pattern to extract the domain
model and feed it into vibeful:

### 1. Fetch and extract the domain model

```
GET the seed URL → extract:
  - Site name, location, contact details
  - Product categories / services hierarchy
  - Brands or suppliers mentioned
  - Pricing language (ranges, offers, discounts)
  - Policies (delivery, returns, guarantees)
  - Financing or payment options
  - Tone of voice (formal, warm, technical, etc.)
  - Visual style cues (colours, fonts, imagery themes)
```

### 2. Encode into the agent's system_prompt

The system prompt should contain the full domain model extracted above.
Be comprehensive — the agent IS the application's intelligence layer.
Include category hierarchies, brand lists, pricing guidance, service
policies, and tone instructions. See the kentsofas agent for a reference.

### 3. Encode into the knowledge base

Ingest the catalog text into a vibeful context for RAG retrieval:
```
POST /v1/contexts → POST /v1/contexts/{id}/ingest
```
The knowledge base text should duplicate the system prompt's domain
knowledge in a structured markdown format. When RAG is available
(PostgreSQL + pgvector), the agent retrieves relevant chunks at query
time. When on SQLite, the agent falls back to its system prompt.

### 4. Create pages matching the site structure

Each major section of the seed site becomes a vibeful page:
- Home page with category overview and featured content
- One page per product/service category
- About / contact page

Pages use the `POST /v1/pages` endpoint with `published: true`.
Include vibeful widgets (`data-vibeful-widget` attributes) for
interactive elements like "Ask about this category" buttons.

### 5. Match styling to the seed site's visual identity

Choose a styling preset that matches the seed site's tone:
- E-commerce / professional → `light`
- Developer tools / technical → `dark`
- Branded experience → `brand`

Custom CSS beyond presets goes in the project shell's `index.css`.

---

## Design Philosophy: WordPress for Agentic Systems

> **Everything about the system and its behaviour must be configurable
> through the vibeful console — not through code changes.**

After the initial build, the site owner should be able to:

| Change | How (in the Management Console) |
|--------|-------------------------------|
| Agent behaviour and tone | Edit system prompt in the agent designer |
| Agent pipeline (which nodes run) | Drag/drop nodes in the visual graph editor |
| Visual theme | Styling modal — pick preset, upload fonts, set colours |
| Page content | Pages tab — edit markdown, add/remove widgets |
| Product knowledge | Knowledge tab — upload or edit documents |
| Tools available to the agent | MCP tab — add/remove MCP server URLs |
| Follow-up questions | Edit quick-reply buttons in the agent designer |
| Guardrails and safety | Guardrails modal — configure blocked patterns |

The build process produces a *starting point* that the site owner
can then refine entirely through the console. No React code changes.
No Python changes. No redeploys. The console is the application's
control panel — just like WordPress's admin dashboard.

**What the builder must NOT do:**
- Hardcode product data in the React shell
- Build custom chat components (use `VibefulChat` from the SDK)
- Embed business logic in the frontend
- Require code changes for content updates

**What the builder MUST ensure:**
- Every agent field is populated (system_prompt, config_yaml, styling)
- Pages exist for every content section
- The frontend shell fetches and renders pages from the API
- The chat widget is integrated and functional
- The site owner can reach every setting through the console

---

## Architecture Rule (NON-NEGOTIABLE)

**Vibeful IS the backend. Every project built on vibeful is a thin rendering shell.**

When building a project on top of vibeful, the dependency direction is:
```
Vibeful (owns everything) → Project (thin shell, SDK consumer)
```

### What lives WHERE

| Concern | Where it lives |
|---------|---------------|
| Agent definitions (system prompts, graphs, tools) | Vibeful — via `/v1/agents` API or Management Console |
| Knowledge bases / RAG content | Vibeful — via `/v1/contexts` |
| Page content and widget definitions | Vibeful — via `/v1/pages` |
| MCP tools | Vibeful — via `/v1/mcp-servers` |
| Frontend rendering | Project — thin shell using `@vibeful/sdk` components |
| Chat widget | `@vibeful/sdk` `VibefulChat` component — do NOT build custom |

### When an API endpoint returns 404 or 500

**DO NOT** bypass vibeful by hardcoding data or building standalone frontends.
1. Diagnose the server issue (check routes in `packages/agent-engine/src/rest_server.py`)
2. The running server may need a restart to pick up route additions in the source
3. Fix the server, then retry the API call
4. Never treat vibeful as optional — it IS the application

---

## Agent Graph Configuration

The agent graph is defined in YAML and stored in the agent's `config_yaml` field
(stored as `config_json` in the database). At runtime, `graph/builder.py` compiles
it into a LangGraph StateGraph. The Management Console visual designer reads this
same config to render the drag-and-drop node editor.

### How conditional edges work

Two formats are supported:

**1. Routes format** (reads `state.route`):
```yaml
- from: attack_guard
  routes:
    safe: setup
    end: __END__
```
Use this when the source node sets `state.route` on the AgentState.

**2. Condition format** (calls a registered function by name):
```yaml
- from: analysis_pipeline
  condition: builtin.router
  routes:
    rag: rag
    react_agent: react_agent
    mcp_discovery: mcp_discovery
```
Use this when you need a named function (like `builtin.router`) to
determine the route. The function receives the full AgentState and
returns a route string. The `condition` key MUST be checked before
`routes` in the builder — both keys may be present in the same edge.

### Node naming rules

- Node `name` fields are arbitrary identifiers (e.g. `setup`, `my_react`)
- Multiple nodes CAN share the same `type` (e.g. two `builtin.react_agent` nodes with different names)
- Node names must match the `to` and `from` values in edges
- The `entry` field must match one of the node names

---

## Agent Styling

Styling is set via the `styling` field when creating or updating an agent.
The value is stored in the `styling_json` database column. The Management
Console's StylingModal reads this value to apply visual themes.

### Presets

| Preset | `--vibeful-bg` | `--vibeful-fg` | `--vibeful-font` | `--vibeful-font-size` |
|--------|---------------|---------------|-----------------|---------------------|
| `light` | `#ffffff` | `#1e293b` | `system-ui` | `14px` |
| `dark` | `#0f172a` | `#f1f5f9` | `"Inter", sans-serif` | `14px` |
| `default` | `#1e293b` | `#e2e8f0` | `"Inter", sans-serif` | `14px` |
| `brand` | `#4f46e5` | `#ffffff` | `"Poppins", sans-serif` | `14px` |

### Applying styling via API

```
PUT /v1/agents/{agent_id}
Body: {"styling": "light"}
```

### How styling reaches the frontend

1. Agent's `styling_json` is read by the Management Console
2. `applyStylingToDOM(preset)` sets CSS custom properties on `document.documentElement`
3. SDK components reference these CSS variables for theming
4. The project shell's `index.css` can also define `--vibeful-*` variables for the chat widget theme

---

## Key API Endpoints

The agent engine serves on port 50052 by default. Key routes:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Engine health check |
| `POST /v1/agents` | Create agent |
| `GET /v1/agents` | List all agents |
| `GET /v1/agents/{id}` | Get agent details |
| `PUT /v1/agents/{id}` | Update agent (any field) |
| `DELETE /v1/agents/{id}` | Delete agent |
| `POST /v1/contexts` | Create knowledge base |
| `POST /v1/contexts/{id}/ingest` | Add documents to knowledge base |
| `POST /v1/pages` | Create agent page |
| `GET /v1/pages` | List all pages |
| `GET /v1/pages/slug/{slug}` | Get page by URL slug |
| `PUT /v1/pages/{id}` | Update page |
| `POST /v1/sessions` | Create a conversation session |
| `POST /v1/sessions/{id}/converse` | Send a message in a session |
| `POST /v1/agents/{id}/execute` | Headless agent invocation |
| `POST /v1/agents/{id}/stream` | Streaming SSE agent responses |
| `POST /v1/mcp-servers` | Create MCP server |

---

## SDK Components

The `@vibeful/sdk` package provides React components that consume the vibeful API:

- `VibefulApp` — Full agent-driven application shell (page routing + widget rendering)
- `VibefulChat` — Embedded chat widget (use this, don't build custom)
- `WidgetRenderer` — Renders agent page widgets (buttons, forms, cards, tables)
- `AgentManager` — Agent CRUD admin UI
- `ContextManager` — Knowledge base admin UI
- `McpManager` — MCP server admin UI

### Page rendering

`VibefulApp` is a **chat-only** shell — it does not render pages from the
`/v1/pages` API. For a storefront or content site, build a custom shell
that fetches pages by slug and renders the `content_markdown` field.

The vibeful API serves pages at `GET /v1/pages/slug/{slug}`. The response
includes `title`, `content_markdown`, and `layout_json`. Render the markdown
client-side (see the kentsofas reference implementation for a simple
markdown-to-HTML renderer).

Widget blocks in page markdown use the format:
```html
<div data-vibeful-widget='{"widget_id":"id","type":"button","props":{...}}'></div>
```

These are rendered by the SDK's `WidgetRenderer` component. Import it and
pass the parsed widget specs.

---

## Project Scaffold Template

A vibeful-based project should look like:

```
project/
├── package.json          # React + @vibeful/sdk dependency
├── vite.config.ts        # Proxy /v1 to engine for CORS-free dev
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx          # Mount the App component
    ├── App.tsx           # Page routing shell + chat widget
    └── index.css         # Theme only — no business logic
```

### Quick Start (3 steps)

```bash
# 1. Create the project directory alongside vibeful
mkdir my-project && cd my-project

# 2. Create package.json with these dependencies:
#    - react, react-dom (^19)
#    - @vibeful/sdk (file:../vibeful/packages/sdk)
#    - @vibeful/shared (file:../vibeful/packages/shared)
#    - vite, @vitejs/plugin-react, typescript (dev)

# 3. Create src/main.tsx:
#    import { VibefulChat } from '@vibeful/sdk';
#    ReactDOM.createRoot(root).render(<App />);

# Then: pnpm install && pnpm dev
# The SDK connects to the vibeful engine on port 50052 by default.
```

**No product data, page content, or business logic in the React app.**
Everything comes from vibeful via the SDK.

### SDK Connection

The SDK's `VibefulClient` connects to `http://localhost:50052` by default (the vibeful agent engine).
To use a different host or port, set the `VITE_PROXY_URL` environment variable:
```bash
# In project/.env:
VITE_PROXY_URL=http://your-vibeful-host:50052
```

### Important Endpoints

The SDK depends on these vibeful server endpoints. If any return 404, add them to `rest_server.py`:

| Endpoint | Used by |
|----------|---------|
| `POST /v1/sessions` | `VibefulApp`, `VibefulChat` — creates a session |
| `POST /v1/sessions/{id}/converse` | `VibefulApp`, `VibefulChat` — sends messages |
| `GET /v1/agents` | `AgentManager` — lists agents |
| `POST /v1/agents` | `AgentManager` — creates agents |
| `PUT /v1/agents/{id}` | `AgentManager` — updates agents |
| `POST /v1/contexts` | `ContextManager` — creates knowledge bases |
| `POST /v1/contexts/{id}/ingest` | `ContextManager` — adds documents |
| `POST /v1/agents/{id}/execute` | `useAgent` hook — headless invocation |
| `POST /v1/agents/{id}/stream` | `useAgentStream` hook — SSE streaming |

---

## UI Design System (REQUIRED for SaaS / Ecommerce)

> **Every frontend shell built on vibeful for a SaaS or ecommerce application
> MUST follow this design system.** The constraints below are not suggestions —
> they are the contract between "it works" and "it's ready to sell."

### Technology Stack (Non-Negotiable)

The frontend shell MUST use:

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | React 19+ | Vibeful SDK is React; the shell must match |
| Styling | Tailwind CSS 4.x | Utility-first, tree-shakeable, consistent |
| Components | shadcn/ui (new-york style) | Accessible, composable, design-system ready |
| Icons | lucide-react | Matches shadcn/ui conventions |

**No exceptions.** Do NOT use Material UI, Chakra, Ant Design, raw CSS files,
inline `<style>` tags, or CSS modules alongside Tailwind. Tailwind + shadcn/ui
covers every visual need. If a component doesn't exist in shadcn/ui, compose it
from existing primitives — do not reach for another library.

### Design Tokens (CSS Custom Properties)

Extend the `--vibeful-*` token set with these additional SaaS/ecommerce tokens.
Define them in the project shell's `index.css` on `:root`:

```css
:root {
  /* === Vibeful base (inherited from agent styling) === */
  --vibeful-bg: #ffffff;
  --vibeful-fg: #1e293b;
  --vibeful-font: system-ui, -apple-system, sans-serif;

  /* === Spacing — 8pt grid === */
  --space-1: 0.25rem;   /*  4px */
  --space-2: 0.5rem;    /*  8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */

  /* === Soft neutral palette === */
  --color-surface:      #ffffff;
  --color-surface-alt:  #f8fafc;
  --color-surface-hover:#f1f5f9;
  --color-border:       #e2e8f0;
  --color-border-strong:#cbd5e1;
  --color-text-primary:   #0f172a;
  --color-text-secondary: #475569;
  --color-text-muted:     #94a3b8;
  --color-accent:         #6366f1;
  --color-accent-hover:   #4f46e5;
  --color-accent-subtle:  #eef2ff;
  --color-success:        #10b981;
  --color-warning:        #f59e0b;
  --color-error:          #ef4444;

  /* === Typography scale === */
  --text-xs:   0.75rem;    /* 12px — captions, labels */
  --text-sm:   0.875rem;   /* 14px — body small, meta */
  --text-base: 1rem;       /* 16px — body */
  --text-lg:   1.125rem;   /* 18px — lead, card titles */
  --text-xl:   1.25rem;    /* 20px — section headings */
  --text-2xl:  1.5rem;     /* 24px — page subtitles */
  --text-3xl:  1.875rem;   /* 30px — page titles */
  --text-4xl:  2.25rem;    /* 36px — hero headings */

  /* === Radii === */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* === Shadows === */
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04);
  --shadow-card-hover: 0 4px 6px -1px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04);
  --shadow-modal: 0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04);
}
```

### Typography Hierarchy (Strict)

Every page MUST use exactly these levels — no ad-hoc font sizes:

| Level | Tailwind class | CSS variable | Use |
|-------|---------------|-------------|-----|
| H1 / Hero | `text-4xl font-bold tracking-tight` | `--text-4xl` | Page hero, once per page |
| H2 / Title | `text-3xl font-semibold tracking-tight` | `--text-3xl` | Page title |
| H3 / Section | `text-2xl font-semibold` | `--text-2xl` | Major sections |
| H4 / Subsection | `text-xl font-medium` | `--text-xl` | Card group headers |
| Body | `text-base leading-relaxed` | `--text-base` | All body copy |
| Body Small | `text-sm leading-relaxed` | `--text-sm` | Meta, captions, secondary text |
| Caption | `text-xs text-muted-foreground` | `--text-xs` | Labels, timestamps, footnotes |

Font weight progression: `font-bold` (H1) → `font-semibold` (H2-H3) → `font-medium` (H4) → `font-normal` (body).
Do NOT use `font-extrabold`, `font-black`, or `font-thin` in SaaS/ecommerce shells.

### Color Palette Rules

- **Surfaces:** `bg-white` for cards on `bg-slate-50` page background. Never use pure gray (`bg-gray-*`) as a page background — it reads as unfinished.
- **Text:** `text-slate-900` for primary, `text-slate-600` for secondary, `text-slate-400` for muted. Never use pure black (`#000`) or `text-gray-500` alone.
- **Accent:** Single accent color (`indigo-500` / `--color-accent`). One accent per application. Use accent for primary buttons, active states, links, and focus rings only.
- **Semantic colors:** Success (green), warning (amber), error (red) — use only for status indicators, toasts, and form validation. Never as decorative colors.
- **Borders:** `border-slate-200` (default), `border-slate-300` (strong). Never use borders heavier than 1px except for focus rings.

### Layout Rules

**Every page is a grid of cards.** No exceptions.

```
Page = Navigation + [Card Grid] + Footer
Card Grid = repeat(Card, columns: 1|2|3|4)
Card = visual container with border, radius, shadow, and padding
```

| Concept | Implementation |
|---------|---------------|
| Page container | `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` |
| Card grid | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6` |
| Card component | `rounded-lg border bg-card p-6 shadow-sm` |
| Section spacing | `space-y-12` between major sections, `space-y-6` within sections |
| Page padding | `py-12` top and bottom for content areas |

**Spacing is always multiples of 4px (0.25rem).** Tailwind's default spacing
scale already enforces this — never use arbitrary values like `p-[7px]` or
`mt-[13px]`. If Tailwind doesn't have the exact step you need, go to the
nearest 4px multiple (e.g. use `p-2` (8px) or `p-3` (12px), not 7px or 13px).

### Component Requirements

Every interactive surface MUST handle four visual states:

| State | Definition | How to render |
|-------|-----------|---------------|
| **Default** | Component is idle and interactive | Normal styling with hover-ready transitions |
| **Loading** | Data is being fetched or action is processing | Skeleton screens (NOT spinners) for card grids; `Spinner` for buttons |
| **Empty** | Query returned zero results | Illustration + descriptive text + clear CTA ("Create your first X") |
| **Error** | Query failed or action errored | Alert card with error message + retry button. Never show raw error stacks to users. |

**Skeleton screens** use shadcn/ui's `<Skeleton>` component. For a card grid,
render 3-6 skeleton cards matching the exact dimensions of real cards. A spinner
alone is not an acceptable loading state for any page-level content area.

**Empty states** must include:
1. A lucide-react icon (e.g. `<PackageOpen />`, `<Inbox />`) at `size={48}`
2. A heading: "No items yet" / "Nothing here"
3. A description: what would appear here and why it's empty
4. A primary action button when applicable

**Error states** must include:
1. An `<Alert variant="destructive">` from shadcn/ui
2. The error title and a human-readable description
3. A "Try again" button that re-triggers the failed operation
4. Never expose raw `Error.message` or stack traces

### shadcn/ui Component Selection

Start from this curated set. Only add components when the design requires them:

**Always include:**
- `Button` (all variants: default, secondary, outline, ghost, destructive, link)
- `Card` (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- `Input`, `Textarea`, `Label`
- `Badge` (default, secondary, outline, destructive)
- `Skeleton`
- `Separator`
- `Avatar` (Avatar, AvatarImage, AvatarFallback)
- `DropdownMenu`

**Add when needed:**
- `Dialog` / `Sheet` — for modals and slide-overs
- `Table` — for data tables (never raw `<table>` elements)
- `Tabs` — for switching between views within a page
- `Select` / `Combobox` — for dropdowns
- `Toast` / `Sonner` — for notifications
- `Tooltip` — for icon-only buttons
- `Pagination` — for paginated lists

**Never add:**
- Raw HTML `<table>`, `<select>`, `<dialog>`, or `<input>` without shadcn/ui wrappers
- CSS art, decorative gradients, or background patterns
- Custom component libraries that duplicate shadcn/ui functionality

### Build Order: Structure → Style → Logic

When building a page, follow this sequence strictly:

1. **Structure (layout).** Place the navigation, grid skeleton, and footer. Use
   semantic HTML (`<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`).
   Verify the page works as plain unstyled HTML.
2. **Style (visual design).** Apply Tailwind classes for spacing, typography,
   colors, and shadows. Add the loading, empty, and error states. The page
   should look complete with static placeholder data — no logic yet.
3. **Logic (data).** Wire up API calls, state management, and event handlers
   LAST. The UI should already be visually correct before a single `fetch()`
   call is written.

**Anti-pattern (forbidden):** Writing all the logic first with `console.log`
and raw `<div>` dumps, then "styling later." Every div on the page should
look production-ready from the moment it's rendered, even with placeholder
data. Logic is layered onto an already-polished UI, not applied as a
post-hoc paint job.

### Visual Hierarchy Checklist

Before marking any page complete, verify:

- [ ] The most important element on the page is visually dominant (size, position, or contrast)
- [ ] The eye flows naturally: top-left → primary content → supporting info → actions
- [ ] Cards have consistent internal spacing (header, content, footer at same Y positions across a row)
- [ ] Text contrast meets WCAG AA: ≥4.5:1 for body, ≥3:1 for large text
- [ ] Interactive elements have visible focus rings (`ring-2 ring-offset-2`)
- [ ] Hover states exist on all clickable elements
- [ ] No two elements compete for attention at equal visual weight
- [ ] White space is intentional, not accidental — empty areas guide the eye, not fill gaps
- [ ] The page is legible at 320px wide (mobile) without horizontal scrolling
- [ ] No raw inline styles or arbitrary pixel values exist

---

## Known Issues & Platform Notes

### Windows / SQLite

- RAG (vector search) requires PostgreSQL + pgvector. On SQLite, the `rag` node
  skips gracefully — the agent still responds from its system prompt.
- For full RAG, run `npm run stack` to start the Docker stack (PostgreSQL + Redis).

### Engine restart required

- Changes to `rest_server.py`, `agent_graph.py`, `graph/builder.py`, or
  `graph/registry.py` require an engine restart to take effect.
- Agent config changes (via `PUT /v1/agents/{id}`) take effect immediately —
  the per-agent graph cache is invalidated on update.

### Per-agent graph cache

- Compiled graphs are cached by agent ID. The cache is invalidated when the
  agent is updated or deleted.
- Agents with empty `config_json` (no nodes) fall back to the global default
  graph (hardcoded in `agent_graph.py:build_agent_graph()`).
