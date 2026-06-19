import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, processAICommand } from './aiAssistant';
import { TEMPLATES } from './templates';

// ═══════════════════════════════════════════════════════════════
// Invariants for the Vibeful Guide system prompt.
//
// REGRESSION GUARDS:
// - start_tour must NOT auto-trigger when the Guide is explaining
//   nodes conversationally (the prompt must explicitly forbid this)
// - The start_tour example must use labels that exist in at least
//   one template (otherwise the LLM will never produce working tours)
// - SYSTEM_PROMPT must be a non-empty string
// ═══════════════════════════════════════════════════════════════

describe('SYSTEM_PROMPT invariants', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('forbids auto-triggering start_tour alongside text explanations', () => {
    // The prompt must contain language that explicitly prevents
    // the LLM from auto-triggering start_tour when it's giving
    // unsolicited text explanations (not when the user asks).
    const hasExplicitDoNotEmit = SYSTEM_PROMPT.includes('Do NOT auto-trigger start_tour')
      || SYSTEM_PROMPT.includes('Do NOT emit start_tour');

    const hasUnsolicitedRule = SYSTEM_PROMPT.includes('unsolicited text explanations')
      || SYSTEM_PROMPT.includes('text alone');

    expect(hasExplicitDoNotEmit || hasUnsolicitedRule).toBe(true);
  });

  it('requires explicit user request for start_tour', () => {
    // The prompt must indicate that start_tour is for user-requested tours only
    const requiresExplicitAsk =
      SYSTEM_PROMPT.includes('when the user asks')
      || SYSTEM_PROMPT.includes('explicitly asks for a tour')
      || SYSTEM_PROMPT.includes('explicitly asks')
      || SYSTEM_PROMPT.includes('only when the user explicitly asks');

    expect(requiresExplicitAsk).toBe(true);
  });

  it('start_tour example uses labels present in TEMPLATES', () => {
    // Extract the start_tour example from the system prompt
    const match = SYSTEM_PROMPT.match(/"node":"([^"]+)"/g);
    expect(match).not.toBeNull();

    const exampleLabels = match!.map((m) => m.replace(/"node":"/, '').replace('"', ''));

    // Collect all known template node labels
    const allTemplateLabels = new Set<string>();
    for (const template of Object.values(TEMPLATES)) {
      for (const node of template.nodes) {
        allTemplateLabels.add(node.data.label);
      }
    }

    // Also collect lowercase versions for case-insensitive matching
    const allLabelsLower = new Set(
      [...allTemplateLabels].map((l) => l.toLowerCase()),
    );

    for (const label of exampleLabels) {
      const found = allTemplateLabels.has(label) || allLabelsLower.has(label.toLowerCase());
      expect(found).toBe(true);
    }
  });

  it('references available node types', () => {
    // The prompt injects VIBEFUL_NODE_TYPES dynamically
    expect(SYSTEM_PROMPT).toContain('Available node types');
  });

  it('load_template example references valid template name', () => {
    expect(SYSTEM_PROMPT).toContain('"template":"minimal"');
    expect(Object.keys(TEMPLATES)).toContain('minimal');
  });

  // ═══════════════════════════════════════════════════════════
  // Brevity invariants — Guide must not explain unprompted
  // ═══════════════════════════════════════════════════════════

  it('enforces brevity — forbids unsolicited node explanations', () => {
    expect(SYSTEM_PROMPT).toContain('NEVER explain nodes');
  });

  it('enforces response length — max 1-2 lines after commands', () => {
    expect(SYSTEM_PROMPT).toContain('1-2 lines');
  });

  it('forbids unsolicited explanations specifically', () => {
    expect(SYSTEM_PROMPT).toContain('Unsolicited explanations');
  });

  // ═══════════════════════════════════════════════════════════
  // Template name invariants — LLM must know valid keys
  // ═══════════════════════════════════════════════════════════

  it('lists available templates section', () => {
    expect(SYSTEM_PROMPT).toContain('Available templates');
  });

  it('references all three template keys', () => {
    expect(SYSTEM_PROMPT).toContain('"minimal"');
    expect(SYSTEM_PROMPT).toContain('"full"');
    expect(SYSTEM_PROMPT).toContain('"lucid"');
  });

  it('instructs LLM to use EXACT template keys', () => {
    expect(SYSTEM_PROMPT).toContain('EXACT keys');
  });
});

describe('processAICommand exports', () => {
  it('processAICommand is a function', () => {
    expect(typeof processAICommand).toBe('function');
  });
});
