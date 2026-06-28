/**
 * Vibeful Command Protocol — structured commands that agents emit
 * to drive host application interfaces.
 *
 * This is the same protocol used by the Vibeful Guide agent to
 * control the Management Console. End users' agents use the same
 * protocol to drive their own applications.
 *
 * Usage (host app):
 *   import { registerCommandHandler } from '@vibeful/sdk/commands';
 *   registerCommandHandler('navigate', ({ route }) => router.push(route));
 *   registerCommandHandler('open-modal', ({ id }) => openModal(id));
 *
 * Usage (agent response):
 *   The agent emits responses with embedded command blocks:
 *   ```vibeful-command
 *   {"action":"navigate","details":{"route":"/settings"}}
 *   ```
 */

export interface VibefulCommand {
  action: string;
  details: Record<string, unknown>;
}

export interface CommandResult {
  action: string;
  success: boolean;
  error?: string;
  result?: unknown;
}

type CommandHandler = (details: Record<string, unknown>) => Promise<unknown> | unknown;

const commandHandlers = new Map<string, CommandHandler>();

/**
 * Register a handler for a command action.
 * Multiple handlers can be registered for the same action
 * (they execute in registration order).
 */
export function registerCommandHandler(action: string, handler: CommandHandler): void {
  commandHandlers.set(action, handler);
}

/**
 * Remove a command handler.
 */
export function unregisterCommandHandler(action: string): void {
  commandHandlers.delete(action);
}

/**
 * Parse commands from agent response text.
 * Commands are embedded as ```vibeful-command JSON blocks.
 */
export function parseCommands(text: string): VibefulCommand[] {
  const commands: VibefulCommand[] = [];
  const regex = /```vibeful-command\s*([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.action && parsed.details) {
        commands.push({ action: parsed.action, details: parsed.details });
      }
    } catch {
      // Skip malformed command blocks
    }
  }
  return commands;
}

/**
 * Execute a parsed command against registered handlers.
 */
export async function executeCommand(command: VibefulCommand): Promise<CommandResult> {
  const handler = commandHandlers.get(command.action);
  if (!handler) {
    return { action: command.action, success: false, error: `No handler registered for '${command.action}'` };
  }
  try {
    const result = await handler(command.details);
    return { action: command.action, success: true, result };
  } catch (err: any) {
    return { action: command.action, success: false, error: err.message };
  }
}

/**
 * Parse and execute all commands found in agent response text.
 * Returns results for each command found.
 */
export async function executeCommands(text: string): Promise<CommandResult[]> {
  const commands = parseCommands(text);
  const results: CommandResult[] = [];
  for (const cmd of commands) {
    results.push(await executeCommand(cmd));
  }
  return results;
}

/**
 * Strip command blocks from text for clean display.
 */
export function stripCommands(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/```vibeful-command\s*[\s\S]*?```/g, '').trim();
}

/**
 * Pre-defined command actions for the Management Console.
 * These are the built-in actions the Vibeful Guide agent uses.
 */
export const CONSOLE_COMMANDS = {
  ADD_NODE: 'add_node',
  REMOVE_NODE: 'remove_node',
  ADD_EDGE: 'add_edge',
  DEPLOY: 'deploy',
  LOAD_TEMPLATE: 'load_template',
  CONFIGURE_ANALYSIS: 'configure_analysis',
  NAVIGATE: 'navigate',
  HIGHLIGHT_NODE: 'highlight_node',
  START_TOUR: 'start_tour',
  CLEAR_HIGHLIGHTS: 'clear_highlights',
  AUTO_ALIGN: 'auto_align',
  CREATE_AGENT: 'create_agent',
  DELETE_AGENT: 'delete_agent',
  SELECT_AGENT: 'select_agent',
  CREATE_CONTEXT: 'create_context',
  INGEST_CONTEXT: 'ingest_context',
  DELETE_CONTEXT: 'delete_context',
  TEST_AGENT: 'test_agent',
  RENAME_AGENT: 'rename_agent',
  CLONE_AGENT: 'clone_agent',
  SAVE_VERSION: 'save_version',
  RESTORE_VERSION: 'restore_version',
  CREATE_AB_TEST: 'create_ab_test',
  START_AB_TEST: 'start_ab_test',
  STOP_AB_TEST: 'stop_ab_test',
  CREATE_GLYPH: 'create_glyph',
  DELETE_GLYPH: 'delete_glyph',
  CREDIT_TOKENS: 'credit_tokens',
  SET_PERSONALITY: 'set_personality',
  SET_STYLING: 'set_styling',
  OPEN_KNOWLEDGE: 'open_knowledge',
  ATTACH_KNOWLEDGE: 'attach_knowledge',
  DETACH_KNOWLEDGE: 'detach_knowledge',
  CREATE_MCP_SERVER: 'create_mcp_server',
  DELETE_MCP_SERVER: 'delete_mcp_server',
  START_MCP_SERVER: 'start_mcp_server',
  STOP_MCP_SERVER: 'stop_mcp_server',
  ATTACH_MCP: 'attach_mcp',
  DETACH_MCP: 'detach_mcp',
  CHECK_MCP_HEALTH: 'check_mcp_health',
  SET_GUARDRAILS: 'set_guardrails',
  DISCOVER_MCP_TOOLS: 'discover_mcp_tools',
  START_ALL_MCP: 'start_all_mcp',
  STOP_ALL_MCP: 'stop_all_mcp',
  LIST_CONCEPTS: 'list_concepts',
  LIST_GLOBAL_MEMORIES: 'list_global_memories',
  LIST_CONTEXT_FILES: 'list_context_files',
  GET_TOKEN_BALANCE: 'get_token_balance',
  SET_AGENT_DESCRIPTION: 'set_agent_description',
  ANALYZE_IMAGE: 'analyze_image',
  CREATE_PAGE: 'create_page',
  UPDATE_PAGE: 'update_page',
  PUBLISH_PAGE: 'publish_page',
  DELETE_PAGE: 'delete_page',
  LIST_PAGES: 'list_pages',
  GET_ANALYTICS: 'get_analytics',
  BROWSE_MCP_CATALOG: 'browse_mcp_catalog',
  INSTALL_MCP_SERVER: 'install_mcp_server',
  EXECUTE_AGENT: 'execute_agent',
  REGISTER_WEBHOOK: 'register_webhook',
  CREATE_API_KEY: 'create_api_key',
  LIST_API_KEYS: 'list_api_keys',
  REVOKE_API_KEY: 'revoke_api_key',
  GET_AUDIT_LOG: 'get_audit_log',
  EXPORT_AGENT: 'export_agent',
  IMPORT_AGENT: 'import_agent',
  PROMOTE_AGENT: 'promote_agent',
  CREATE_TEST: 'create_test',
  LIST_TESTS: 'list_tests',
  RUN_TESTS: 'run_tests',
  EXPLAIN_PAGE: 'explain_page',
  // Widgets
  CREATE_WIDGET: 'create_widget',
  DELETE_WIDGET: 'delete_widget',
  LIST_WIDGETS: 'list_widgets',
  // Shell & Site Build
  SCAFFOLD_SHELL: 'scaffold_shell',
  BUILD_SITE: 'build_site',
} as const;

/**
 * Pre-defined command actions for end-user applications.
 * Users extend this with their own actions.
 */
export const APP_COMMANDS = {
  NAVIGATE: 'navigate',
  OPEN_MODAL: 'open-modal',
  CLOSE_MODAL: 'close-modal',
  SCROLL_TO: 'scroll-to',
  UPDATE_STATE: 'update-state',
  CALL_API: 'call-api',
  SHOW_TOAST: 'show-toast',
  SET_THEME: 'set-theme',
  FOCUS_ELEMENT: 'focus-element',
  SUBMIT_FORM: 'submit-form',
} as const;
