// First MCP Servers — web_search, file_read, calculator

import { McpServer, type McpToolHandler } from './framework.js';
import type { ToolCallResult, McpTool } from '@vibeful/shared';

// ── Web Search Server (:3100) ─────────────────────────────────

const webSearchServer = new McpServer('web-search', '0.1.0');

const webSearchTool: McpTool = {
  name: 'web_search',
  description: 'Search the web for information. Returns snippets and URLs.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query' },
      max_results: { type: 'string', description: 'Max results (default 5)' },
    },
    required: ['query'],
  },
};

webSearchServer.registerTool({
  tool: webSearchTool,
  async execute(params): Promise<ToolCallResult> {
    const query = params.query as string;
    const maxResults = parseInt((params.max_results as string) || '5', 10);

    try {
      const resp = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      );
      const data = await resp.json() as any;
      const results = (data.RelatedTopics || [])
        .slice(0, maxResults)
        .map((r: any) => `${r.Text || ''} — ${r.FirstURL || ''}`)
        .filter(Boolean);

      return {
        content: [{
          type: 'text',
          text: results.length > 0
            ? results.join('\n\n')
            : `No results found for "${query}"`,
        }],
      };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Search failed: ${err.message}` }], isError: true };
    }
  },
});

// ── File Read Server (:3101) ──────────────────────────────────

const fileReadServer = new McpServer('file-read', '0.1.0');
import { readFile } from 'fs/promises';
import { join } from 'path';

const fileReadTool: McpTool = {
  name: 'file_read',
  description: 'Read contents of a file in the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file' },
      max_lines: { type: 'string', description: 'Max lines to return (default 200)' },
    },
    required: ['path'],
  },
};

fileReadServer.registerTool({
  tool: fileReadTool,
  async execute(params): Promise<ToolCallResult> {
    const filePath = (params.path as string || '').replace(/\.\./g, '');
    const maxLines = parseInt((params.max_lines as string) || '200', 10);
    try {
      const content = await readFile(join('/workspace', filePath), 'utf-8');
      const lines = content.split('\n').slice(0, maxLines).join('\n');
      return { content: [{ type: 'text', text: lines || '(empty file)' }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Cannot read ${filePath}: ${err.message}` }], isError: true };
    }
  },
});

// ── Calculator Server (:3102) ─────────────────────────────────

const calculatorServer = new McpServer('calculator', '0.1.0');

const calculatorTool: McpTool = {
  name: 'calculate',
  description: 'Evaluate a mathematical expression.',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: 'Math expression (e.g., "2 + 3 * 4")' },
    },
    required: ['expression'],
  },
};

calculatorServer.registerTool({
  tool: calculatorTool,
  async execute(params): Promise<ToolCallResult> {
    const expr = (params.expression as string) || '';
    try {
      const result = Function(`"use strict"; return (${expr})`)();
      return { content: [{ type: 'text', text: `${expr} = ${result}` }] };
    } catch (err: any) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
});

// ── Start all servers ─────────────────────────────────────────

const SERVICE_PORT = parseInt(process.env.MCP_PORT || '3100', 10);
const serviceName = process.env.MCP_SERVICE || 'web-search';

const servers: Record<string, { server: McpServer; port: number }> = {
  'web-search': { server: webSearchServer, port: 3100 },
  'file-read': { server: fileReadServer, port: 3101 },
  'calculator': { server: calculatorServer, port: 3102 },
};

const entry = servers[serviceName];
if (entry) {
  entry.server.listen(entry.port);
} else {
  // Start all on different ports
  webSearchServer.listen(3100);
  fileReadServer.listen(3101);
  calculatorServer.listen(3102);
}
