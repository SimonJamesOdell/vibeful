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
  const regex = /```vibeful-command\n([\s\S]*?)```/g;
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
  return text.replace(/```vibeful-command\n[\s\S]*?```/g, '').trim();
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
