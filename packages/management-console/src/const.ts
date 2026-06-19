/** Vibeful agent graph node type definitions for the visual designer. */

export interface VibefulNodeType {
  type: string;
  label: string;
  category: 'core' | 'processing' | 'quality' | 'analysis';
  color: string;
  description: string;
  defaultConfig?: Record<string, unknown>;
  configSchema?: ConfigField[];
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'textarea';
  defaultValue?: unknown;
  options?: { value: string; label: string }[];
}

export const VIBEFUL_NODE_TYPES: VibefulNodeType[] = [
  // ── Core ──
  {
    type: 'builtin.attack_guard',
    label: 'Attack Guard',
    category: 'core',
    color: '#ef4444',
    description: 'Detects prompt injection, jailbreak, XSS, SQLi. Routes to END if blocked.',
    configSchema: [
      { key: 'block_mode', label: 'Block Mode', type: 'select', defaultValue: 'block', options: [{ value: 'block', label: 'Block (reject)' }, { value: 'flag', label: 'Flag (log only)' }, { value: 'passthrough', label: 'Passthrough (no filter)' }] },
    ],
  },
  {
    type: 'builtin.setup',
    label: 'Setup',
    category: 'core',
    color: '#6b7280',
    description: 'Initializes messages, response chunks, and tool results.',
  },
  {
    type: 'builtin.planning',
    label: 'Planning',
    category: 'core',
    color: '#8b5cf6',
    description: 'Generates execution plan for complex multi-step queries.',
    configSchema: [
      { key: 'max_plan_steps', label: 'Max Plan Steps', type: 'number', defaultValue: 5 },
    ],
  },
  {
    type: 'builtin.buttons',
    label: 'Quick Replies',
    category: 'core',
    color: '#06b6d4',
    description: 'Emits quick-reply button chips from agent config.',
  },
  {
    type: 'builtin.system_message_builder',
    label: 'System Prompt',
    category: 'core',
    color: '#f59e0b',
    description: 'Builds the system prompt. Defaults to helpful assistant if none configured.',
    configSchema: [
      { key: 'system_prompt_text', label: 'System Prompt', type: 'textarea', defaultValue: '' },
    ],
  },
  {
    type: 'builtin.router',
    label: 'Router',
    category: 'core',
    color: '#a855f7',
    description: 'Routes based on user intent: RAG (knowledge questions), ReAct (direct), MCP (tools).',
  },

  // ── Processing ──
  {
    type: 'builtin.rag',
    label: 'RAG',
    category: 'processing',
    color: '#10b981',
    description: 'Retrieves relevant chunks from knowledge contexts via pgvector.',
    configSchema: [
      { key: 'context_ids', label: 'Context IDs', type: 'text', defaultValue: '' },
    ],
  },
  {
    type: 'builtin.mcp_discovery',
    label: 'MCP Discovery',
    category: 'processing',
    color: '#3b82f6',
    description: 'Discovers tools from configured MCP server URLs.',
    configSchema: [
      { key: 'mcp_server_urls', label: 'MCP Server URLs', type: 'text', defaultValue: '' },
    ],
  },
  {
    type: 'builtin.react_agent',
    label: 'ReAct Agent',
    category: 'processing',
    color: '#6366f1',
    description: 'Core LLM agent loop. Calls tools, thinks, iterates. Uses conductor temperature if set.',
    defaultConfig: { max_iterations: 5 },
    configSchema: [
      { key: 'max_iterations', label: 'Max Iterations', type: 'number', defaultValue: 5 },
    ],
  },
  {
    type: 'builtin.fact_recall',
    label: 'Fact Recall',
    category: 'processing',
    color: '#14b8a6',
    description: 'Recalls relevant facts about the user from previous conversations.',
    configSchema: [
      { key: 'max_facts', label: 'Max Facts', type: 'number', defaultValue: 5 },
    ],
  },
  {
    type: 'builtin.fact_mining',
    label: 'Fact Mining',
    category: 'processing',
    color: '#0d9488',
    description: 'Extracts new facts about the user from the conversation after response.',
  },

  // ── Quality ──
  {
    type: 'builtin.stream_completion',
    label: 'Stream Completion',
    category: 'quality',
    color: '#22c55e',
    description: 'Finalizes the response, emits usage stats (tokens, cost).',
    configSchema: [
      { key: 'include_usage', label: 'Include Usage Stats', type: 'boolean', defaultValue: true },
    ],
  },
  {
    type: 'builtin.citation',
    label: 'Citation',
    category: 'quality',
    color: '#eab308',
    description: 'Builds citations from RAG results used in the response.',
  },
  {
    type: 'builtin.follow_up',
    label: 'Follow-Up',
    category: 'quality',
    color: '#f97316',
    description: 'Generates 2-3 follow-up questions after the turn completes.',
  },

  // ── Analysis ──
  {
    type: 'builtin.analysis_pipeline',
    label: 'Analysis Pipeline',
    category: 'analysis',
    color: '#ec4899',
    description: 'Runs pre-response analysis (11 parallel LLM phases). Conductor overrides temperature.',
    configSchema: [
      { key: 'conductor_temperature', label: 'Conductor Temperature', type: 'number', defaultValue: 0.7 },
    ],
  },
  {
    type: 'builtin.output_router',
    label: 'Output Router',
    category: 'analysis',
    color: '#d946ef',
    description: 'Post-processes response through DML segment routing (CODE:0.1, STORY:1.5, etc.).',
    configSchema: [
      { key: 'enable_dml_routing', label: 'Enable DML Routing', type: 'boolean', defaultValue: true },
    ],
  },
];

export const NODE_CATEGORIES = [
  { key: 'core', label: 'Core Nodes', icon: 'Shield' },
  { key: 'processing', label: 'Processing Nodes', icon: 'Cpu' },
  { key: 'quality', label: 'Quality Nodes', icon: 'CheckCircle' },
  { key: 'analysis', label: 'Analysis Nodes', icon: 'Brain' },
] as const;
