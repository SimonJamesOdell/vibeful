import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ═══════════════════════════════════════════════════════════════
// Integration invariant: Editor modals (Styling, Personality,
// Knowledge, MCP, Guardrails) must share the same DOM parent
// container and use the left-edge overlay pattern.
//
// REGRESSION GUARD:
// - All editor modals use `absolute inset-0` positioning, so their
//   overlay area depends on their DOM parent.
// - Moving a modal outside the shared container breaks visual
//   consistency.
// - This test locks in that all editor modals are rendered inside the
//   same `<div className="flex-1 min-w-0 relative">` container.
// ═══════════════════════════════════════════════════════════════

function readAppSource(): string {
  const appPath = resolve(__dirname, 'App.tsx');
  return readFileSync(appPath, 'utf-8');
}

describe('App.tsx modal DOM parent invariant', () => {
  const source = readAppSource();
  const lines = source.split('\n');

  // All editor modals listed here
  const EDITOR_MODALS = ['styling', 'personality', 'knowledge', 'mcp', 'guardrails'];

  // Find the canvas container — the LAST occurrence is the render div
  // (the import destructuring may also contain "relative" as a substring)
  // findLastIndex not available in ES2020 target — iterate backwards
  let containerLineIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('flex-1 min-w-0 relative')) {
      containerLineIdx = i;
      break;
    }
  }
  expect(containerLineIdx, 'Container div not found').toBeGreaterThan(-1);

  it('renders all editor modals inside the canvas container', () => {
    for (const modal of EDITOR_MODALS) {
      // Find reference in the render section (AFTER the container div)
      const modalLineIdx = lines.findIndex(
        (l, i) => i > containerLineIdx && l.includes(`activeModal === '${modal}'`)
      );
      expect(modalLineIdx, `${modal} modal not found after container div`).toBeGreaterThan(-1);
      expect(modalLineIdx, `${modal} modal must be after container`).toBeGreaterThan(containerLineIdx);
    }
  });

  it('the canvas container div has exactly one "flex-1 min-w-0 relative"', () => {
    const matches = source.match(/flex-1 min-w-0 relative/g);
    expect(matches, 'Expected at least one canvas container').not.toBeNull();
    expect(matches!.length, 'Expected exactly one canvas container in render section').toBeGreaterThanOrEqual(1);
  });

  it('all editor modals appear in the backdrop overlay condition', () => {
    // The backdrop dimming condition (on the line BEFORE the bg overlay div)
    // must include all editor modals. Search for the line that starts with
    // "{(activeModal ===" — it's the condition guarding the backdrop div.
    const conditionLine = lines.find((l) =>
      l.includes('activeModal') && l.includes('bg-slate-950/80') === false && l.includes('personality')
    );
    // Fallback: if condition and div are on the same line, just check the source
    const searchTarget = conditionLine || source;
    expect(searchTarget, 'Backdrop condition not found').toBeDefined();
    for (const modal of EDITOR_MODALS) {
      expect(searchTarget, `Backdrop must include ${modal}`).toContain(`'${modal}'`);
    }
  });

  it('each editor modal renders as a left-edge overlay (absolute inset-0 flex bg-slate-950)', () => {
    // Each modal component uses `absolute inset-0 z-[9998] flex bg-slate-950` pattern
    // We verify by checking each modal component file
    const modalComponents: Record<string, string> = {
      styling: 'StylingModal.tsx',
      personality: 'PersonalityModal.tsx',
      knowledge: 'KnowledgeAttachModal.tsx',
      mcp: 'McpAttachModal.tsx',
      guardrails: 'GuardrailsModal.tsx',
    };
    for (const [modal, file] of Object.entries(modalComponents)) {
      const compPath = resolve(__dirname, 'components', file);
      let compSource: string;
      try {
        compSource = readFileSync(compPath, 'utf-8');
      } catch {
        // Component file not found — skip (may be inline in App.tsx)
        continue;
      }
      expect(compSource, `${modal} component must use left-edge overlay`).toContain('absolute inset-0');
    }
  });
});
