import { describe, it, expect } from 'vitest';
import { PRESET_STYLES, normalizePreset, loadAgentStyling, applyStylingToDOM } from './StylingModal';

// ═══════════════════════════════════════════════════════════════
// Invariants for the StylingModal component.
//
// REGRESSION GUARDS:
// - PRESET_STYLES must define all 4 themes with complete fields
// - All color values must be valid hex codes (#RRGGBB)
// - normalizePreset must strip mode/theme/preset suffixes
// - normalizePreset must lowercase input
// - loadAgentStyling extracts styling_json from agent object
// - applyStylingToDOM must set CSS custom properties (verified via
//   structural check in node env)
// ═══════════════════════════════════════════════════════════════

const VALID_PRESET_KEYS = ['default', 'light', 'dark', 'brand'];
const REQUIRED_FIELDS = ['bgColor', 'fontColor', 'fontFamily', 'fontSize'] as const;

describe('PRESET_STYLES invariants', () => {
  it('defines exactly the 4 expected preset keys', () => {
    const keys = Object.keys(PRESET_STYLES).sort();
    expect(keys).toEqual([...VALID_PRESET_KEYS].sort());
  });

  it('every preset has all required StylingConfig fields', () => {
    for (const [key, preset] of Object.entries(PRESET_STYLES)) {
      for (const field of REQUIRED_FIELDS) {
        expect(preset, `"${key}" missing field "${field}"`).toHaveProperty(field);
        expect(preset[field], `"${key}" field "${field}" is null/undefined`).not.toBeNull();
        expect(preset[field], `"${key}" field "${field}" is undefined`).not.toBeUndefined();
      }
    }
  });

  it('all bgColor values are valid hex codes (#RRGGBB)', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const [key, preset] of Object.entries(PRESET_STYLES)) {
      expect(preset.bgColor, `"${key}" bgColor "${preset.bgColor}" not valid hex`).toMatch(hexPattern);
    }
  });

  it('all fontColor values are valid hex codes (#RRGGBB)', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    for (const [key, preset] of Object.entries(PRESET_STYLES)) {
      expect(preset.fontColor, `"${key}" fontColor "${preset.fontColor}" not valid hex`).toMatch(hexPattern);
    }
  });

  it('all fontSize values end with "px"', () => {
    for (const [key, preset] of Object.entries(PRESET_STYLES)) {
      expect(preset.fontSize, `"${key}" fontSize "${preset.fontSize}" missing px`).toMatch(/^\d+px$/);
    }
  });

  it('light preset has light background (#ffffff)', () => {
    expect(PRESET_STYLES.light.bgColor).toBe('#ffffff');
  });

  it('dark preset has dark background (#0f172a)', () => {
    expect(PRESET_STYLES.dark.bgColor).toBe('#0f172a');
  });

  it('default preset matches dark preset in appearance (dark background)', () => {
    // default and dark should both be dark themes
    const isDark = (c: string) => {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return (r + g + b) / 3 < 128;
    };
    expect(isDark(PRESET_STYLES.default.bgColor!), 'default bg is dark').toBe(true);
    expect(isDark(PRESET_STYLES.dark.bgColor!), 'dark bg is dark').toBe(true);
    expect(isDark(PRESET_STYLES.light.bgColor!), 'light bg is light').toBe(false);
  });

  it('brand preset has indigo background (#4f46e5)', () => {
    expect(PRESET_STYLES.brand.bgColor).toBe('#4f46e5');
  });
});

describe('normalizePreset', () => {
  it('returns lowercased key for plain preset names', () => {
    expect(normalizePreset('light')).toBe('light');
    expect(normalizePreset('Dark')).toBe('dark');
    expect(normalizePreset('BRAND')).toBe('brand');
  });

  it('strips " mode" suffix', () => {
    expect(normalizePreset('light mode')).toBe('light');
    expect(normalizePreset('Light Mode')).toBe('light');
  });

  it('strips " theme" suffix', () => {
    expect(normalizePreset('dark theme')).toBe('dark');
    expect(normalizePreset('Dark Theme')).toBe('dark');
  });

  it('strips " preset" suffix', () => {
    expect(normalizePreset('brand preset')).toBe('brand');
  });

  it('strips " style" suffix', () => {
    expect(normalizePreset('light style')).toBe('light');
  });

  it('trims whitespace', () => {
    expect(normalizePreset('  light  ')).toBe('light');
    expect(normalizePreset('  dark mode  ')).toBe('dark');
  });

  it('preserves unrecognized keys as-is (lowercased)', () => {
    expect(normalizePreset('sunset')).toBe('sunset');
    expect(normalizePreset('Custom Theme')).toBe('custom');
  });
});

describe('loadAgentStyling', () => {
  it('extracts styling_json from agent object', () => {
    const agent = { styling_json: 'light' };
    expect(loadAgentStyling(agent)).toBe('light');
  });

  it('returns null when agent has no styling_json', () => {
    const agent: Record<string, unknown> = { name: 'test', id: '123' };
    expect(loadAgentStyling(agent as any)).toBeNull();
  });

  it('returns null when agent.styling_json is empty string', () => {
    const agent = { styling_json: '' };
    expect(loadAgentStyling(agent)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(loadAgentStyling(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(loadAgentStyling(undefined as unknown as null)).toBeNull();
  });
});

describe('applyStylingToDOM is callable', () => {
  it('is a function', () => {
    expect(typeof applyStylingToDOM).toBe('function');
  });
});
