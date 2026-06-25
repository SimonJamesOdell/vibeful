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
    },
    {
      selector: '[data-tour="dashboard-kb"]',
      title: 'Knowledge Base',
      description: 'Each agent can be connected to knowledge contexts — documents, FAQs, and policies that the agent searches via RAG when answering questions.',
      position: 'bottom',
    },
    {
      selector: '[data-tour="dashboard-mcp"]',
      title: 'MCP Servers',
      description: 'MCP (Model Context Protocol) servers give agents access to external tools — web search, file reading, calculators, and any custom API you connect.',
      position: 'right',
    },
    {
      selector: '[data-tour="dashboard-pages"]',
      title: 'Agent Pages',
      description: 'Agents can create and publish interactive pages with forms, charts, and cards. Users visit /p/slug to see them.',
      position: 'left',
    },
  ],

  // ═══ AGENTS ═══
  agents: [
    {
      selector: '[data-tour="agents-list"]',
      title: 'Your Agents',
      description: 'Every agent you create appears here. Click an agent card to open it in the designer, or use the buttons to test, rename, or delete.',
      position: 'bottom',
    },
    {
      selector: '[data-tour="agents-create"]',
      title: 'Create an Agent',
      description: 'Click "Add Agent" to create a new one. You can also ask the Vibeful Guide — just say "create an agent named Support Bot."',
      position: 'right',
    },
  ],

  // ═══ KNOWLEDGE ═══
  knowledge: [
    {
      selector: '[data-tour="kb-sidebar"]',
      title: 'Knowledge Contexts',
      description: 'Each context is a collection of documents. Click a context to see its files — text, markdown, PDFs that the agent can search.',
      position: 'right',
    },
    {
      selector: '[data-tour="kb-files"]',
      title: 'Uploaded Files',
      description: 'Upload documents here. Vibeful chunks them, generates embeddings, and indexes them for RAG retrieval. The agent searches this when answering.',
      position: 'left',
    },
    {
      selector: '[data-tour="kb-create"]',
      title: 'New Context',
      description: 'Create a new knowledge context to organize documents by topic — product docs, support FAQs, company policies, etc.',
      position: 'bottom',
    },
  ],

  // ═══ MCP ═══
  mcp: [
    {
      selector: '[data-tour="mcp-servers"]',
      title: 'MCP Server List',
      description: 'All registered MCP servers appear here with health status. Green = healthy, red = unreachable. Start/stop built-in servers with the play/stop buttons.',
      position: 'bottom',
    },
    {
      selector: '[data-tour="mcp-health"]',
      title: 'Health Check',
      description: 'Each server is probed periodically. Hover over the status dot to see the last check result.',
      position: 'right',
    },
    {
      selector: '[data-tour="mcp-catalog"]',
      title: 'MCP Catalog',
      description: 'Browse and install pre-built MCP servers. One-click install for web-search, file-read, calculator, and community servers.',
      position: 'right',
    },
    {
      selector: '[data-tour="mcp-register"]',
      title: 'Register a Server',
      description: 'Connect your own MCP server by providing a name and URL. Choose HTTP or SSE transport. Optionally scope it to a specific agent.',
      position: 'bottom',
    },
  ],

  // ═══ PAGES ═══
  pages: [
    {
      selector: '[data-tour="pages-list"]',
      title: 'Agent Pages',
      description: 'Agents create pages with interactive widgets. Published pages appear at /p/slug. Click a page to edit it.',
      position: 'bottom',
    },
    {
      selector: '[data-tour="pages-create"]',
      title: 'Create a Page',
      description: 'Create a new page for an agent. Choose a slug (URL path), title, and write markdown content with embedded widgets.',
      position: 'right',
    },
  ],

  // ═══ DESIGNER ═══
  designer: [
    {
      selector: '[data-tour="designer-canvas"]',
      title: 'Agent Graph Canvas',
      description: 'This is where you design your agent\'s behavior. Drag nodes from the palette onto the canvas and connect them to build a pipeline.',
      position: 'bottom',
    },
    {
      selector: '[data-tour="designer-palette"]',
      title: 'Node Palette',
      description: '14 node types: Input, Guard, Memory, RAG, Router, React Agent, Completion, and more. Click to add, then drag to position.',
      position: 'right',
    },
    {
      selector: '[data-tour="designer-properties"]',
      title: 'Property Panel',
      description: 'Click any node to see its configuration. Each node type has different properties — model, temperature, max tokens, tool selection, etc.',
      position: 'left',
    },
    {
      selector: '[data-tour="designer-guide"]',
      title: 'Vibeful Guide',
      description: 'Ask the Guide to build your agent for you: "Add an attack guard at the start" or "Connect the RAG node to the LLM." It understands natural language.',
      position: 'left',
    },
  ],

  // ═══ ANALYTICS ═══
  analytics: [
    {
      selector: '[data-tour="analytics-overview"]',
      title: 'Platform Overview',
      description: 'See your agent count, knowledge contexts, MCP servers, and pages at a glance. Conversations today and token usage coming soon.',
      position: 'bottom',
    },
    {
      selector: '[data-tour="analytics-agent"]',
      title: 'Per-Agent Breakdown',
      description: 'Select an agent to see its specific analytics — how many pages it has, how many MCP servers are attached, and usage stats.',
      position: 'right',
    },
  ],
};
