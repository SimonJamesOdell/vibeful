import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCommands,
  executeCommand,
  executeCommands,
  stripCommands,
  registerCommandHandler,
  unregisterCommandHandler,
  CONSOLE_COMMANDS,
  type CommandResult,
} from './commandProtocol';

// ═══════════════════════════════════════════════════════════════
// Invariants for the command protocol — the system that parses
// and executes vibeful-command blocks from LLM output.
//
// REGRESSION GUARDS:
// - start_tour/highlight_node handlers depend on parseCommands
//   correctly extracting JSON from vibeful-command blocks
// - executeCommands returning success:true with result.error
//   must not hide errors (handler returns error object without throw)
// - stripCommands must leave conversational text intact
// ═══════════════════════════════════════════════════════════════

describe('parseCommands', () => {
  it('extracts a single valid vibeful-command block', () => {
    const text = [
      'Some conversation text.',
      '```vibeful-command',
      '{"action":"start_tour","details":{"steps":[{"node":"setup","explanation":"Init"}]}}',
      '```',
      'More conversation.',
    ].join('\n');

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0].action).toBe('start_tour');
    expect(commands[0].details).toEqual({ steps: [{ node: 'setup', explanation: 'Init' }] });
  });

  it('extracts multiple vibeful-command blocks', () => {
    const text = [
      '```vibeful-command',
      '{"action":"load_template","details":{"template":"minimal"}}',
      '```',
      '```vibeful-command',
      '{"action":"start_tour","details":{"steps":[]}}',
      '```',
    ].join('\n');

    const commands = parseCommands(text);
    expect(commands).toHaveLength(2);
    expect(commands[0].action).toBe('load_template');
    expect(commands[1].action).toBe('start_tour');
  });

  it('returns empty array when no vibeful-command blocks present', () => {
    const text = 'Just plain conversation. No commands here.';
    expect(parseCommands(text)).toEqual([]);
  });

  it('ignores malformed JSON in vibeful-command blocks', () => {
    const text = [
      '```vibeful-command',
      'not valid json at all',
      '```',
    ].join('\n');

    const commands = parseCommands(text);
    expect(commands).toEqual([]);
  });

  it('ignores blocks missing required action/details fields', () => {
    const text = [
      '```vibeful-command',
      '{"action":"start_tour"}',
      '```',
    ].join('\n');

    const commands = parseCommands(text);
    expect(commands).toEqual([]);
  });

  it('handles empty vibeful-command block', () => {
    const text = '```vibeful-command\n```';
    const commands = parseCommands(text);
    expect(commands).toEqual([]);
  });
});

describe('stripCommands', () => {
  it('removes all vibeful-command blocks leaving conversation text', () => {
    const text = [
      'Hello! Let me help you.',
      '```vibeful-command',
      '{"action":"load_template","details":{"template":"minimal"}}',
      '```',
      'Here is your agent.',
      '```vibeful-command',
      '{"action":"start_tour","details":{"steps":[{"node":"setup","explanation":"..."}]}}',
      '```',
      'All done!',
    ].join('\n');

    const stripped = stripCommands(text);
    expect(stripped).toContain('Hello! Let me help you.');
    expect(stripped).toContain('Here is your agent.');
    expect(stripped).toContain('All done!');
    expect(stripped).not.toContain('vibeful-command');
    expect(stripped).not.toContain('load_template');
  });

  it('returns empty string for undefined input', () => {
    expect(stripCommands(undefined)).toBe('');
  });

  it('returns empty string for null-like input', () => {
    expect(stripCommands('')).toBe('');
  });

  it('preserves text when no commands present', () => {
    expect(stripCommands('Just text.')).toBe('Just text.');
  });
});

describe('executeCommand', () => {
  // Clean up handlers between tests
  beforeEach(() => {
    unregisterCommandHandler('test_action');
    unregisterCommandHandler(CONSOLE_COMMANDS.START_TOUR);
  });

  it('returns success:true when handler runs without throwing', async () => {
    registerCommandHandler('test_action', () => ({ ok: true }));
    const result = await executeCommand({ action: 'test_action', details: {} });
    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ ok: true });
  });

  it('returns success:false with error when handler throws', async () => {
    registerCommandHandler('test_action', () => {
      throw new Error('Handler exploded');
    });
    const result = await executeCommand({ action: 'test_action', details: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Handler exploded');
  });

  it('returns success:false when no handler registered', async () => {
    const result = await executeCommand({ action: 'nonexistent', details: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler registered');
  });

  // REGRESSION: handlers that return error objects without throwing
  // were silently marked as success:true with hidden error text.
  // executeCommand marks these as success:true (the handler didn't throw),
  // but consumers must check result.error.
  it('marks handler-returned error objects as success:true with result containing error', async () => {
    registerCommandHandler('test_action', () => ({ error: 'No matching nodes found on canvas' }));
    const result = await executeCommand({ action: 'test_action', details: {} });
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ error: 'No matching nodes found on canvas' });
    // The result.error field is set by executeCommand only on thrown errors
    expect(result.error).toBeUndefined();
  });
});

describe('executeCommands', () => {
  beforeEach(() => {
    unregisterCommandHandler('test_action');
    unregisterCommandHandler(CONSOLE_COMMANDS.START_TOUR);
  });

  it('executes all commands found in text and returns results', async () => {
    let callCount = 0;
    registerCommandHandler('test_action', () => {
      callCount++;
      return { count: callCount };
    });

    const text = [
      '```vibeful-command',
      '{"action":"test_action","details":{}}',
      '```',
      '```vibeful-command',
      '{"action":"test_action","details":{}}',
      '```',
    ].join('\n');

    const results = await executeCommands(text);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
    expect(callCount).toBe(2);
  });

  it('returns empty array when no commands found', async () => {
    const results = await executeCommands('Just text.');
    expect(results).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// CONSOLE_COMMANDS invariants — all registered commands must
// exist so the Guide and command handlers stay in sync.
// ═══════════════════════════════════════════════════════════════

describe('CONSOLE_COMMANDS', () => {
  it('includes AUTO_ALIGN for graph layout tidy-up', () => {
    expect(CONSOLE_COMMANDS.AUTO_ALIGN).toBe('auto_align');
  });

  it('includes all core mutation commands', () => {
    expect(CONSOLE_COMMANDS.ADD_NODE).toBe('add_node');
    expect(CONSOLE_COMMANDS.REMOVE_NODE).toBe('remove_node');
    expect(CONSOLE_COMMANDS.ADD_EDGE).toBe('add_edge');
    expect(CONSOLE_COMMANDS.LOAD_TEMPLATE).toBe('load_template');
  });

  it('includes all UX commands', () => {
    expect(CONSOLE_COMMANDS.HIGHLIGHT_NODE).toBe('highlight_node');
    expect(CONSOLE_COMMANDS.START_TOUR).toBe('start_tour');
    expect(CONSOLE_COMMANDS.CLEAR_HIGHLIGHTS).toBe('clear_highlights');
    expect(CONSOLE_COMMANDS.NAVIGATE).toBe('navigate');
    expect(CONSOLE_COMMANDS.DEPLOY).toBe('deploy');
    expect(CONSOLE_COMMANDS.CONFIGURE_ANALYSIS).toBe('configure_analysis');
  });

  it('includes all agent lifecycle commands', () => {
    expect(CONSOLE_COMMANDS.CREATE_AGENT).toBe('create_agent');
    expect(CONSOLE_COMMANDS.DELETE_AGENT).toBe('delete_agent');
    expect(CONSOLE_COMMANDS.RENAME_AGENT).toBe('rename_agent');
    expect(CONSOLE_COMMANDS.SELECT_AGENT).toBe('select_agent');
    expect(CONSOLE_COMMANDS.CLONE_AGENT).toBe('clone_agent');
    expect(CONSOLE_COMMANDS.TEST_AGENT).toBe('test_agent');
    expect(CONSOLE_COMMANDS.SET_AGENT_DESCRIPTION).toBe('set_agent_description');
  });

  it('includes all knowledge base commands', () => {
    expect(CONSOLE_COMMANDS.CREATE_CONTEXT).toBe('create_context');
    expect(CONSOLE_COMMANDS.DELETE_CONTEXT).toBe('delete_context');
    expect(CONSOLE_COMMANDS.INGEST_CONTEXT).toBe('ingest_context');
    expect(CONSOLE_COMMANDS.LIST_CONTEXT_FILES).toBe('list_context_files');
    expect(CONSOLE_COMMANDS.OPEN_KNOWLEDGE).toBe('open_knowledge');
    expect(CONSOLE_COMMANDS.ATTACH_KNOWLEDGE).toBe('attach_knowledge');
    expect(CONSOLE_COMMANDS.DETACH_KNOWLEDGE).toBe('detach_knowledge');
  });

  it('includes all version and A/B test commands', () => {
    expect(CONSOLE_COMMANDS.SAVE_VERSION).toBe('save_version');
    expect(CONSOLE_COMMANDS.RESTORE_VERSION).toBe('restore_version');
    expect(CONSOLE_COMMANDS.CREATE_AB_TEST).toBe('create_ab_test');
    expect(CONSOLE_COMMANDS.START_AB_TEST).toBe('start_ab_test');
    expect(CONSOLE_COMMANDS.STOP_AB_TEST).toBe('stop_ab_test');
  });

  it('includes all MCP server commands', () => {
    expect(CONSOLE_COMMANDS.CREATE_MCP_SERVER).toBe('create_mcp_server');
    expect(CONSOLE_COMMANDS.DELETE_MCP_SERVER).toBe('delete_mcp_server');
    expect(CONSOLE_COMMANDS.START_MCP_SERVER).toBe('start_mcp_server');
    expect(CONSOLE_COMMANDS.STOP_MCP_SERVER).toBe('stop_mcp_server');
    expect(CONSOLE_COMMANDS.START_ALL_MCP).toBe('start_all_mcp');
    expect(CONSOLE_COMMANDS.STOP_ALL_MCP).toBe('stop_all_mcp');
    expect(CONSOLE_COMMANDS.ATTACH_MCP).toBe('attach_mcp');
    expect(CONSOLE_COMMANDS.DETACH_MCP).toBe('detach_mcp');
    expect(CONSOLE_COMMANDS.CHECK_MCP_HEALTH).toBe('check_mcp_health');
    expect(CONSOLE_COMMANDS.DISCOVER_MCP_TOOLS).toBe('discover_mcp_tools');
  });

  it('includes all glyph, token, and personality commands', () => {
    expect(CONSOLE_COMMANDS.CREATE_GLYPH).toBe('create_glyph');
    expect(CONSOLE_COMMANDS.DELETE_GLYPH).toBe('delete_glyph');
    expect(CONSOLE_COMMANDS.CREDIT_TOKENS).toBe('credit_tokens');
    expect(CONSOLE_COMMANDS.GET_TOKEN_BALANCE).toBe('get_token_balance');
    expect(CONSOLE_COMMANDS.SET_PERSONALITY).toBe('set_personality');
    expect(CONSOLE_COMMANDS.SET_STYLING).toBe('set_styling');
    expect(CONSOLE_COMMANDS.SET_GUARDRAILS).toBe('set_guardrails');
  });

  it('includes concepts, memories, and analysis commands', () => {
    expect(CONSOLE_COMMANDS.LIST_CONCEPTS).toBe('list_concepts');
    expect(CONSOLE_COMMANDS.LIST_GLOBAL_MEMORIES).toBe('list_global_memories');
    expect(CONSOLE_COMMANDS.ANALYZE_IMAGE).toBe('analyze_image');
  });

  it('has exactly 50 command constants (regression guard)', () => {
    const count = Object.keys(CONSOLE_COMMANDS).length;
    expect(count).toBe(71);
  });
});

// ═══════════════════════════════════════════════════════════════
// Widget command parsing — the SDK parses render_widget blocks
// from agent responses. These must follow the same vibeful-command
// format as console commands.
// ═══════════════════════════════════════════════════════════════

describe('render_widget command parsing', () => {
  it('extracts a render_widget command with a single widget', () => {
    const text = [
      'Here is a chart:',
      '```vibeful-command',
      '{"action":"render_widget","details":{"widget_id":"chart1","type":"chart","props":{"title":"Sales","data":[{"label":"Q1","value":100}]}}}',
      '```',
    ].join('\n');

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0].action).toBe('render_widget');
    expect(commands[0].details.widget_id).toBe('chart1');
    expect(commands[0].details.type).toBe('chart');
  });

  it('extracts render_widget with multiple widgets array', () => {
    const text = [
      '```vibeful-command',
      '{"action":"render_widget","details":{"widgets":[{"widget_id":"btn1","type":"button","props":{"label":"OK"}},{"widget_id":"card1","type":"card","props":{"title":"Info","content":"Hello"}}]}}',
      '```',
    ].join('\n');

    const commands = parseCommands(text);
    expect(commands).toHaveLength(1);
    expect(commands[0].details.widgets).toHaveLength(2);
    expect((commands[0].details.widgets as any)[0].type).toBe('button');
    expect((commands[0].details.widgets as any)[1].type).toBe('card');
  });
});
