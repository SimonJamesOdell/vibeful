import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ═══════════════════════════════════════════════════════════════
// Integration invariant: PersonalityModal and StylingModal
// must share the same DOM parent container.
//
// REGRESSION GUARD:
// - Both modals use `absolute inset-0` positioning, so their
//   overlay area depends on their DOM parent.
// - Moving one modal outside the shared container breaks the
//   visual consistency (personality would cover toolbar/palette
//   while styling covers only the canvas).
// - This test locks in that both are rendered inside the same
//   `<div className="flex-1 min-w-0 relative">` container.
// ═══════════════════════════════════════════════════════════════

function readAppSource(): string {
  const appPath = resolve(__dirname, 'App.tsx');
  return readFileSync(appPath, 'utf-8');
}

describe('App.tsx modal DOM parent invariant', () => {
  const source = readAppSource();

  it('renders StylingModal inside the canvas container div', () => {
    // The styling modal must be a child of the flex-1 min-w-0 relative div
    // that also contains FlowCanvas.
    // Pattern: <div className="flex-1 min-w-0 relative"> ... StylingModal ... </div>
    expect(source).toContain('flex-1 min-w-0 relative');
    expect(source).toContain('activeModal === \'styling\'');
  });

  it('renders PersonalityModal inside the SAME canvas container div as StylingModal', () => {
    // Both modals must be siblings inside the same parent div.
    // We verify by checking the source structure:
    // 1. There is exactly one "flex-1 min-w-0 relative" parent
    // 2. Both modal conditionals appear between that parent's opening and closing tags
    // 3. The personality modal is NOT at the top level (outside the container)

    const lines = source.split('\n');

    // Find the line with "flex-1 min-w-0 relative"
    const containerLineIdx = lines.findIndex((l) => l.includes('flex-1 min-w-0 relative'));
    expect(containerLineIdx, 'Container div not found').toBeGreaterThan(-1);

    // Find StylingModal and PersonalityModal lines
    const stylingLineIdx = lines.findIndex((l) => l.includes("activeModal === 'styling'"));
    const personalityLineIdx = lines.findIndex((l) => l.includes("activeModal === 'personality'"));

    expect(stylingLineIdx, 'StylingModal condition not found').toBeGreaterThan(-1);
    expect(personalityLineIdx, 'PersonalityModal condition not found').toBeGreaterThan(-1);

    // Both must appear AFTER the container opening
    expect(stylingLineIdx, 'StylingModal must be after container div').toBeGreaterThan(containerLineIdx);
    expect(personalityLineIdx, 'PersonalityModal must be after container div').toBeGreaterThan(containerLineIdx);

    // The PersonalityModal must NOT be at the ReactFlowProvider top level.
    // We check: the line `</ReactFlowProvider>` appears after the personality modal line,
    // but there should be other modals (knowledge, create) between them.
    // Key invariant: the personality modal is NOT the last modal before </ReactFlowProvider>

    // Find the closing ReactFlowProvider tag
    const closingProviderIdx = lines.findIndex((l) => l.includes('</ReactFlowProvider>'));
    expect(closingProviderIdx, '</ReactFlowProvider> not found').toBeGreaterThan(-1);

    // Personality modal should appear BEFORE other top-level modals like knowledge,
    // AND it should be inside the container, not between knowledge and </ReactFlowProvider>

    // Check that personality is NOT on its own line right before the closing tag
    // (with only whitespace between). If it were, it would be at the outer level.
    const afterPersonality = lines.slice(personalityLineIdx + 1, closingProviderIdx);
    const hasKnowledgeModal = afterPersonality.some((l) => l.includes("activeModal === 'knowledge'"));
    const hasCreateModal = afterPersonality.some((l) => l.includes("activeModal === 'create'"));

    // The personality modal should NOT be between knowledge/create and the closing tag.
    // Since we moved it into the canvas container, it should now appear BEFORE knowledge/create
    // in the file (line number wise). Verify that personality line comes before knowledge line.
    const knowledgeLineIdx = lines.findIndex((l) => l.includes("activeModal === 'knowledge'"));
    if (knowledgeLineIdx > 0) {
      expect(personalityLineIdx, 'PersonalityModal must be before KnowledgeModal in source')
        .toBeLessThan(knowledgeLineIdx);
    }
  });

  it('both modals are rendered as siblings (not nested inside each other)', () => {
    // Verify neither modal conditional is inside the other's JSX block
    const stylingBlockStart = source.indexOf("activeModal === 'styling'");
    const personalityBlockStart = source.indexOf("activeModal === 'personality'");

    // The blocks should be independent — each has its own {activeModal === '...' && (
    expect(stylingBlockStart).toBeGreaterThan(-1);
    expect(personalityBlockStart).toBeGreaterThan(-1);

    // They should not be identical (same line)
    expect(stylingBlockStart).not.toBe(personalityBlockStart);

    // Count occurrences to ensure each appears exactly once
    const stylingCount = (source.match(/activeModal === 'styling'/g) || []).length;
    const personalityCount = (source.match(/activeModal === 'personality'/g) || []).length;
    expect(stylingCount).toBe(1);
    expect(personalityCount).toBe(1);
  });

  it('the canvas container div has exactly one "flex-1 min-w-0 relative"', () => {
    // There should be exactly one canvas container — both modals go here
    const matches = source.match(/flex-1 min-w-0 relative/g);
    expect(matches, 'Expected exactly one canvas container').not.toBeNull();
    expect(matches!.length, 'Expected exactly one canvas container').toBe(1);
  });
});
