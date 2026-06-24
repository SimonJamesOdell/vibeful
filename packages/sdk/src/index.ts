// @vibeful/sdk — embeddable AI chat widget + admin components
// Works with any OpenAI-compatible API or Vibeful backend.

// Components
export { VibefulChat } from './components/VibefulChat';
export { VibefulApp } from './components/VibefulApp';
export { ShadowWrapper } from './components/ShadowWrapper';
export { WidgetRenderer } from './components/WidgetRenderer';
export { AgentManager } from './components/AgentManager';
export { ContextManager } from './components/ContextManager';
export { McpManager } from './components/McpManager';
export { VoiceInput } from './components/VoiceInput';
export { VoiceOutput } from './components/VoiceOutput';
export { WidgetStudio } from './components/WidgetStudio';
export { ObservabilityDashboard } from './components/ObservabilityDashboard';
export { useVibefulAgent } from './hooks/useVibefulAgent';
export { useHostCommands, dispatchHostCommand, HOST_COMMANDS } from './hooks/useHostCommands';
export { useAgent } from './hooks/useAgent';
export type { AgentResult, UseAgentOptions, UseAgentReturn } from './hooks/useAgent';
export { useAgentStream } from './hooks/useAgentStream';
export type { StreamEvent, UseAgentStreamOptions, UseAgentStreamReturn } from './hooks/useAgentStream';

// Client (use Transport interface for new integrations)
export { client, VibefulClient } from './client';

// Transport — pluggable backend
export { VibefulTransport, OpenAITransport } from './transport';
export type { Transport, TransportConfig, Message, ConversationChunk } from './transport';

// Types
export type { AgentData } from './transport';
export type { VibefulChatProps } from './types';
