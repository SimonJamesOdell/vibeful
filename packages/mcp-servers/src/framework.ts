// MCP Server Framework — base class for building MCP-compatible servers

import express from 'express';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  InitializeResult,
  ToolsListResult,
  ToolCallParams,
  ToolCallResult,
  McpTool,
} from '@vibeful/shared';

export interface McpToolHandler {
  tool: McpTool;
  execute(params: Record<string, unknown>): Promise<ToolCallResult>;
}

export class McpServer {
  private app = express();
  private tools = new Map<string, McpToolHandler>();
  public readonly info: { name: string; version: string };

  constructor(name: string, version = '0.1.0') {
    this.info = { name, version };
    this.app.use(express.json());

    // JSON-RPC endpoint
    this.app.post('/mcp', async (req, res) => {
      const rpc = req.body as JsonRpcRequest;
      const response = await this.handleRpc(rpc);
      res.json(response);
    });

    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', name, tools: this.tools.size });
    });
  }

  registerTool(handler: McpToolHandler): void {
    this.tools.set(handler.tool.name, handler);
  }

  listen(port: number): void {
    this.app.listen(port, () => {
      console.log(`[mcp:${this.info.name}] listening on :${port} (${this.tools.size} tools)`);
    });
  }

  private async handleRpc(rpc: JsonRpcRequest): Promise<JsonRpcResponse> {
    const base = { jsonrpc: '2.0' as const, id: rpc.id };

    try {
      switch (rpc.method) {
        case 'initialize':
          return { ...base, result: this.buildInitResult() };
        case 'tools/list':
          return { ...base, result: this.buildToolsList() };
        case 'tools/call':
          return { ...base, result: await this.handleToolCall((rpc.params as unknown) as ToolCallParams) };
        default:
          return { ...base, error: { code: -32601, message: `Method not found: ${rpc.method}` } };
      }
    } catch (err: any) {
      return { ...base, error: { code: -32000, message: err.message } };
    }
  }

  private buildInitResult(): InitializeResult {
    return {
      protocolVersion: '2024-11-05',
      serverInfo: this.info,
      capabilities: { tools: {} },
    };
  }

  private buildToolsList(): ToolsListResult {
    return {
      tools: Array.from(this.tools.values()).map((h) => h.tool),
    };
  }

  private async handleToolCall(params: ToolCallParams): Promise<ToolCallResult> {
    const handler = this.tools.get(params.name);
    if (!handler) {
      return { content: [{ type: 'text', text: `Tool not found: ${params.name}` }], isError: true };
    }
    return handler.execute(params.arguments || {});
  }
}
