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
