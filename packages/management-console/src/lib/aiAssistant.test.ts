import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, processAICommand } from './aiAssistant';
import { TEMPLATES } from './templates';

// ═══════════════════════════════════════════════════════════════
// Invariants for the Vibeful Guide system prompt.
//
// REGRESSION GUARDS:
// - SYSTEM_PROMPT must be a non-empty string
// - The prompt must enforce brevity (1-2 lines after commands)
// - The prompt must document all key commands the LLM can emit
// - Template references must use valid keys
// - Node type descriptions must be injected dynamically
// ═══════════════════════════════════════════════════════════════

describe('SYSTEM_PROMPT invariants', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('enforces brevity — respond in 1-2 lines after commands', () => {
    expect(SYSTEM_PROMPT).toContain('1-2 lines');
  });

  it('enforces execution over explanation', () => {
    expect(SYSTEM_PROMPT).toContain('Execute, don\'t explain');
  });

  it('documents the add_node command', () => {
    expect(SYSTEM_PROMPT).toContain('add_node');
    expect(SYSTEM_PROMPT).toContain('nodeType');
  });

  it('documents the remove_node command', () => {
    expect(SYSTEM_PROMPT).toContain('remove_node');
  });

  it('documents the add_edge command with source/target', () => {
    expect(SYSTEM_PROMPT).toContain('add_edge');
    expect(SYSTEM_PROMPT).toContain('source');
    expect(SYSTEM_PROMPT).toContain('target');
  });

  it('documents the load_template command with valid template keys', () => {
    expect(SYSTEM_PROMPT).toContain('load_template');
    expect(SYSTEM_PROMPT).toContain('"minimal"');
    expect(SYSTEM_PROMPT).toContain('"full"');
    expect(SYSTEM_PROMPT).toContain('"lucid"');
  });

  it('documents the start_tour command', () => {
    expect(SYSTEM_PROMPT).toContain('start_tour');
  });

  it('documents the highlight_node command', () => {
    expect(SYSTEM_PROMPT).toContain('highlight_node');
  });

  it('documents the auto_align command', () => {
    expect(SYSTEM_PROMPT).toContain('auto_align');
    expect(SYSTEM_PROMPT).toContain('tidy up');
  });

  it('documents the create_agent command', () => {
    expect(SYSTEM_PROMPT).toContain('create_agent');
  });

  it('documents the deploy command', () => {
    expect(SYSTEM_PROMPT).toContain('deploy');
  });

  it('documents the navigate command', () => {
    expect(SYSTEM_PROMPT).toContain('navigate');
  });

  it('documents the set_personality command', () => {
    expect(SYSTEM_PROMPT).toContain('set_personality');
  });

  it('documents the set_styling command with valid presets', () => {
    expect(SYSTEM_PROMPT).toContain('set_styling');
    expect(SYSTEM_PROMPT).toContain('"light"');
    expect(SYSTEM_PROMPT).toContain('"dark"');
    expect(SYSTEM_PROMPT).toContain('"default"');
    expect(SYSTEM_PROMPT).toContain('"brand"');
  });

  it('documents knowledge commands', () => {
    expect(SYSTEM_PROMPT).toContain('create_context');
    expect(SYSTEM_PROMPT).toContain('ingest_context');
  });

  it('documents the test_agent command', () => {
    expect(SYSTEM_PROMPT).toContain('test_agent');
  });

  it('references available node types', () => {
    expect(SYSTEM_PROMPT).toContain('Available node types');
  });

  it('references available templates section', () => {
    expect(SYSTEM_PROMPT).toContain('Available templates');
  });

  it('contains the topic guardrail', () => {
    expect(SYSTEM_PROMPT).toContain('Topic Guardrail');
    expect(SYSTEM_PROMPT).toContain('ON-TOPIC');
    expect(SYSTEM_PROMPT).toContain('OFF-TOPIC');
  });
});

describe('processAICommand exports', () => {
  it('processAICommand is a function', () => {
    expect(typeof processAICommand).toBe('function');
  });
});
