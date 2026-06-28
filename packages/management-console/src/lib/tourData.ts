import type { PageTourStep } from './tourStore';

/** Tour step definitions for every page in the management console. */

export const PAGE_TOURS: Record<string, PageTourStep[]> = {

  // ═══ DASHBOARD ═══
  dashboard: [
    {
      selector: '[data-tour="dashboard-agents"]',
      title: 'Agent Overview',
      description: 'This card shows all your agents with quick actions — test them, rename, or delete. Click any agent to open it in the designer.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#agents',
    },
    {
      selector: '[data-tour="dashboard-kb"]',
      title: 'Knowledge Base',
      description: 'Each agent can be connected to knowledge contexts — documents, FAQs, and policies that the agent searches via RAG when answering questions.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#knowledge-contexts',
    },
    {
      selector: '[data-tour="dashboard-mcp"]',
      title: 'MCP Servers',
      description: 'MCP (Model Context Protocol) servers give agents access to external tools — web search, file reading, calculators, and any custom API you connect.',
      position: 'right',
      learnMoreUrl: 'docs.html#mcp-servers',
    },
    {
      selector: '[data-tour="dashboard-pages"]',
      title: 'Pages',
      description: 'Each page is a standalone document with markdown content and interactive widgets. Published pages appear at /p/slug.',
      position: 'left',
      learnMoreUrl: 'docs.html#agent-pages',
    },
    {
      selector: '[data-tour="dashboard-widgets"]',
      title: 'Widgets',
      description: 'Interactive components embedded in pages — buttons, forms, charts, tables. Create widgets inside the Page Editor and they render dynamically.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#agent-pages',
    },
    {
      selector: '[data-tour="dashboard-conversations"]',
      title: 'Recent Conversations',
      description: 'Live agent activity feed — see recent sessions, message counts, and which agents are handling conversations right now.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#analytics',
    },
  ],

  // ═══ AGENTS ═══
  agents: [
    {
      selector: '[data-tour="agents-list"]',
      title: 'Your Agents',
      description: 'Every agent you create appears here. Click an agent card to open it in the designer, or use the buttons to test, rename, or delete.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#agents',
    },
    {
      selector: '[data-tour="agents-create"]',
      title: 'Create an Agent',
      description: 'Click "Add Agent" to create a new one. You can also ask the Vibeful Guide — just say "create an agent named Support Bot."',
      position: 'right',
      learnMoreUrl: 'docs.html#agents',
    },
  ],

  // ═══ KNOWLEDGE ═══
  knowledge: [
    {
      selector: '[data-tour="kb-sidebar"]',
      title: 'Knowledge Contexts',
      description: 'Each context is a collection of documents. Click a context to see its files — text, markdown, PDFs that the agent can search.',
      position: 'right',
      learnMoreUrl: 'docs.html#knowledge-contexts',
    },
    {
      selector: '[data-tour="kb-files"]',
      title: 'Uploaded Files',
      description: 'Upload documents here. Vibeful chunks them, generates embeddings, and indexes them for RAG retrieval. The agent searches this when answering.',
      position: 'left',
      learnMoreUrl: 'docs.html#knowledge-contexts',
    },
    {
      selector: '[data-tour="kb-create"]',
      title: 'New Context',
      description: 'Create a new knowledge context to organize documents by topic — product docs, support FAQs, company policies, etc.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#knowledge-contexts',
    },
  ],

  // ═══ MCP ═══
  mcp: [
    {
      selector: '[data-tour="mcp-servers"]',
      title: 'MCP Server List',
      description: 'All registered MCP servers appear here with health status. Green = healthy, red = unreachable. Start/stop built-in servers with the play/stop buttons.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#mcp-servers',
    },
    {
      selector: '[data-tour="mcp-health"]',
      title: 'Health Check',
      description: 'Each server is probed periodically. Hover over the status dot to see the last check result.',
      position: 'right',
      learnMoreUrl: 'docs.html#mcp-servers',
    },
    {
      selector: '[data-tour="mcp-catalog"]',
      title: 'MCP Catalog',
      description: 'Browse and install pre-built MCP servers. One-click install for web-search, file-read, calculator, and community servers.',
      position: 'right',
      learnMoreUrl: 'docs.html#mcp-servers',
    },
    {
      selector: '[data-tour="mcp-register"]',
      title: 'Register a Server',
      description: 'Connect your own MCP server by providing a name and URL. Choose HTTP or SSE transport. Optionally scope it to a specific agent.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#mcp-servers',
    },
  ],

  // ═══ PAGES ═══
  pages: [
    {
      selector: '[data-tour="pages-list"]',
      title: 'Agent Pages',
      description: 'Agents create pages with interactive widgets. Published pages appear at /p/slug. Click a page to edit it.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#agent-pages',
    },
    {
      selector: '[data-tour="pages-create"]',
      title: 'Create a Page',
      description: 'Create a new page for an agent. Choose a slug (URL path), title, and write markdown content with embedded widgets.',
      position: 'right',
      learnMoreUrl: 'docs.html#agent-pages',
    },
  ],

  // ═══ DESIGNER ═══
  designer: [
    {
      selector: '[data-tour="designer-canvas"]',
      title: 'Agent Graph Canvas',
      description: 'This is where you design your agent\'s behavior. Drag nodes from the palette onto the canvas and connect them to build a pipeline.',
      position: 'bottom',
      learnMoreUrl: 'docs/architecture.md',
    },
    {
      selector: '[data-tour="designer-palette"]',
      title: 'Node Palette',
      description: '14 node types: Input, Guard, Memory, RAG, Router, React Agent, Completion, and more. Click to add, then drag to position.',
      position: 'right',
      learnMoreUrl: 'docs/architecture.md',
    },
    {
      selector: '[data-tour="designer-properties"]',
      title: 'Property Panel',
      description: 'Click any node to see its configuration. Each node type has different properties — model, temperature, max tokens, tool selection, etc.',
      position: 'left',
      learnMoreUrl: 'docs/api-reference.md',
    },
    {
      selector: '[data-tour="designer-guide"]',
      title: 'Vibeful Guide',
      description: 'Ask the Guide to build your agent for you: "Add an attack guard at the start" or "Connect the RAG node to the LLM." It understands natural language.',
      position: 'left',
      learnMoreUrl: 'docs/getting-started.md',
    },
  ],

  // ═══ ANALYTICS ═══
  analytics: [
    {
      selector: '[data-tour="analytics-overview"]',
      title: 'Platform Overview',
      description: 'See your agent count, knowledge contexts, MCP servers, and pages at a glance. Conversations today and token usage coming soon.',
      position: 'bottom',
      learnMoreUrl: 'docs.html#analytics',
    },
    {
      selector: '[data-tour="analytics-agent"]',
      title: 'Per-Agent Breakdown',
      description: 'Select an agent to see its specific analytics — how many pages it has, how many MCP servers are attached, and usage stats.',
      position: 'right',
      learnMoreUrl: 'docs.html#analytics',
    },
  ],

  // ═══ SYSTEM HEALTH ═══
  health: [
    {
      selector: '[data-tour="health-status"]',
      title: 'Engine & API Status',
      description: 'At-a-glance health of your Vibeful engine and DeepSeek API connection. Green means everything is running.',
      position: 'bottom',
      learnMoreUrl: 'docs/getting-started.md',
    },
    {
      selector: '[data-tour="health-diagnostics"]',
      title: 'Quick Diagnostics',
      description: 'Endpoint URLs, API key status, and database configuration — all in one place. Check here when something isn\'t working.',
      position: 'right',
      learnMoreUrl: 'docs/getting-started.md',
    },
    {
      selector: '[data-tour="health-troubleshooting"]',
      title: 'Troubleshooting',
      description: 'Common fixes for engine startup, API key setup, and database issues. Copy the commands directly from here.',
      position: 'right',
      learnMoreUrl: 'docs/getting-started.md',
    },
  ],
};
