// @vibeful/shared — All types re-exported

// ── Core Protocol Types ──────────────────────────────────────

export enum ResponseState {
  UNSPECIFIED = 0,
  REFERENCES = 1,
  STREAMING = 2,
  TOOL_USED = 3,
  COMPLETED = 4,
  FOLLOW_UP = 5,
}

export interface AgentConfig {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextIds?: string[];
  mcpServerUrls?: string[];
}

export interface ToolCall {
  callId: string;
  name: string;
  arguments: string;
  mcpServer?: string;
}

export interface ToolResult {
  callId: string;
  content: string;
  success: boolean;
  error?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface ConversationChunk {
  state: ResponseState;
  textChunk?: string;
  toolCall?: ToolCall;
  followUpQuestions?: string[];
  usage?: TokenUsage;
  error?: string;
}

export interface Session {
  sessionId: string;
  createdAt: Date;
  lastActiveAt: Date;
  agentConfig: AgentConfig;
}

// ── Event Types ──────────────────────────────────────────────

export interface SessionEnvelopeEvent {
  eventName: 'SESSION_ENVELOPE';
  agentName: string;
  modelProvider: string;
  modelEndpoint: string;
  toolCount: number;
  toolNames: string[];
  contextIds: string[];
  timestamp: string;
}

export interface LlmCallEvent {
  eventName: 'llm_call';
  model: string;
  provider: string;
  costUsd: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  finishReason: string;
  elapsedMs: number;
  toolNames: string[];
}

export interface McpToolCallEvent {
  eventName: 'MCP_TOOL_CALL';
  toolName: string;
  mcpServerUid: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}

export type PlatformEvent = SessionEnvelopeEvent | LlmCallEvent | McpToolCallEvent;

export interface EventLogger {
  logEvent(event: PlatformEvent): Promise<void>;
  logLlmCall(event: LlmCallEvent): Promise<void>;
  logMcpToolCall(event: McpToolCallEvent): Promise<void>;
}

// ── Widget System ────────────────────────────────────────────

export * from './widgets';

// ── MCP Protocol ────────────────────────────────────────────

export * from './mcp';
