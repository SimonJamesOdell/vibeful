// @vibeful/shared — MCP Protocol Types
import type { WidgetType } from './widgets';

// ── JSON-RPC 2.0 ──────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ── MCP Lifecycle ─────────────────────────────────────────────

export interface InitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: {
    tools?: { listChanged?: boolean };
    resources?: { subscribe?: boolean; listChanged?: boolean };
  };
}

// ── MCP Tools ─────────────────────────────────────────────────

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolsListResult {
  tools: McpTool[];
}

export interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// ── MCP Server Config ─────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  transport: 'http' | 'sse' | 'stdio';
  auth_type?: 'none' | 'api_key' | 'bearer';
  auth_header?: string;
  enabled: boolean;
}

// ── Widget Types ──────────────────────────────────────────────

export interface WidgetDefinition {
  type: WidgetType;
  title: string;
  data: unknown;
  config?: Record<string, unknown>;
}

// ── Workflow Types ────────────────────────────────────────────

export type WorkflowStepType = 'gather_input' | 'rag_search' | 'llm_analyze' | 'deliver_message' | 'tool_call';

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  config: Record<string, unknown>;
  variable?: string; // @variable_name for data passing
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  maxSteps?: number; // max 50
}
