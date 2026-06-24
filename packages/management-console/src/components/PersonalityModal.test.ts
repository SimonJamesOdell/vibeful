import { describe, it, expect } from 'vitest';
import { PRESETS, type PersonalityConfig } from './PersonalityModal';

// ═══════════════════════════════════════════════════════════════
// Invariants for the PersonalityModal component.
//
// REGRESSION GUARDS:
// - PRESETS must define all 5 personality profiles with complete
//   and valid fields (every field required for preset application)
// - Values must fall in valid ranges (temperature 0-2, sliders 0-100)
// - System prompts must be non-empty strings
// - The interface and presets define the "existing functionality"
//   that the AI Guide (set_personality) depends on
// ═══════════════════════════════════════════════════════════════

const VALID_PRESET_KEYS = ['professional', 'friendly', 'creative', 'technical', 'playful'];
const REQUIRED_FIELDS = ['tone', 'temperature', 'formality', 'verbosity', 'humor', 'empathy', 'system_prompt'] as const;

describe('PRESETS invariants', () => {
  it('defines exactly the 5 expected preset keys', () => {
    const keys = Object.keys(PRESETS).sort();
    expect(keys).toEqual([...VALID_PRESET_KEYS].sort());
  });

  it('every preset has all required PersonalityConfig fields', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      for (const field of REQUIRED_FIELDS) {
        expect(preset, `"${key}" missing field "${field}"`).toHaveProperty(field);
        expect(preset[field], `"${key}" field "${field}" is null/undefined`).not.toBeNull();
        expect(preset[field], `"${key}" field "${field}" is undefined`).not.toBeUndefined();
      }
    }
  });

  it('every preset tone field matches its own key', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(preset.tone).toBe(key);
    }
  });

  it('temperature values are in range [0, 2]', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(preset.temperature, `"${key}" temperature out of range`)
        .toBeGreaterThanOrEqual(0);
      expect(preset.temperature, `"${key}" temperature out of range`)
        .toBeLessThanOrEqual(2);
    }
  });

  it('slider values (formality, verbosity, humor, empathy) are in range [0, 100]', () => {
    const sliderFields = ['formality', 'verbosity', 'humor', 'empathy'] as const;
    for (const [key, preset] of Object.entries(PRESETS)) {
      for (const field of sliderFields) {
        expect(preset[field], `"${key}" ${field} out of range`)
          .toBeGreaterThanOrEqual(0);
        expect(preset[field], `"${key}" ${field} out of range`)
          .toBeLessThanOrEqual(100);
      }
    }
  });

  it('every system_prompt is a non-empty string', () => {
    for (const [key, preset] of Object.entries(PRESETS)) {
      expect(typeof preset.system_prompt, `"${key}" system_prompt not a string`).toBe('string');
      expect(preset.system_prompt!.length, `"${key}" system_prompt is empty`).toBeGreaterThan(10);
    }
  });

  it('all system prompts are unique', () => {
    const prompts = Object.values(PRESETS).map((p) => p.system_prompt);
    const unique = new Set(prompts);
    expect(unique.size).toBe(Object.keys(PRESETS).length);
  });

  it('professional preset is cold/precise (low temp, low humor, high formality)', () => {
    const p = PRESETS.professional;
    expect(p.temperature).toBeLessThan(0.5);
    expect(p.formality).toBeGreaterThan(70);
    expect(p.humor).toBeLessThan(20);
  });

  it('playful preset is warm/loose (high temp, low formality, high humor)', () => {
    const p = PRESETS.playful;
    expect(p.temperature).toBeGreaterThan(0.7);
    expect(p.formality).toBeLessThan(30);
    expect(p.humor).toBeGreaterThan(70);
  });

  it('technical preset has lowest temperature', () => {
    const temps = Object.entries(PRESETS).map(([k, p]) => ({ key: k, temp: p.temperature! }));
    temps.sort((a, b) => a.temp - b.temp);
    expect(temps[0].key).toBe('technical');
  });

  it('creative preset has highest temperature', () => {
    const temps = Object.entries(PRESETS).map(([k, p]) => ({ key: k, temp: p.temperature! }));
    temps.sort((a, b) => b.temp - a.temp);
    expect(temps[0].key).toBe('creative');
  });
});

describe('PersonalityConfig type invariants', () => {
  it('all preset values are assignable to PersonalityConfig', () => {
    // TypeScript-level check: each preset must satisfy Partial<PersonalityConfig>
    // This is enforced at compile time, but runtime check verifies keys exist
    const validKeys: (keyof PersonalityConfig)[] = [
      'tone', 'temperature', 'formality', 'verbosity', 'humor', 'empathy', 'system_prompt',
    ];
    for (const [key, preset] of Object.entries(PRESETS)) {
      const presetKeys = Object.keys(preset);
      for (const pk of presetKeys) {
        expect(validKeys, `"${key}" has unknown field "${pk}"`).toContain(pk as keyof PersonalityConfig);
      }
    }
  });
});
