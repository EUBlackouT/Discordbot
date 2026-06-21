import { describe, it, expect } from 'vitest';
import { rollAbilityCheck } from '../src/game/dice/engine.js';
import {
  computeOutcomeTier,
  formatRollSummary,
  formatRollPlayerLine,
  narrationHintForTier,
} from '../src/game/checks/check-display.js';

const pending = {
  skill: 'Investigation',
  ability: 'INT',
  checkType: 'skill',
  dc: 14,
};

describe('computeOutcomeTier', () => {
  it('flags natural 20 as critical success', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 0,
      proficiencyBonus: 2,
      isProficient: true,
      dc: 20,
      rng: () => 0.99,
    });
    expect(computeOutcomeTier(roll)).toBe('critical_success');
  });

  it('flags bare failure on near miss', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 2,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 14,
      rng: () => 0.5, // d20 11 + 2 = 13
    });
    expect(roll.total).toBe(13);
    expect(computeOutcomeTier(roll)).toBe('bare_failure');
  });
});

describe('formatRollSummary', () => {
  it('shows ability and proficiency breakdown', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 2,
      proficiencyBonus: 2,
      isProficient: true,
      dc: 14,
      rng: () => 0.5,
    });
    const text = formatRollSummary(pending, roll);
    expect(text).toContain('INT (+2)');
    expect(text).toContain('prof (+2)');
    expect(text).toContain('vs DC **14**');
    expect(text).not.toContain('prof (+2) · prof'); // no dup
  });

  it('notes near miss on bare failure', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 2,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 14,
      rng: () => 0.5,
    });
    expect(formatRollSummary(pending, roll)).toContain('near miss');
  });
});

describe('formatRollPlayerLine', () => {
  it('is a short one-liner without modifier breakdown', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 2,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 14,
      rng: () => 0.5,
    });
    const line = formatRollPlayerLine(pending, roll);
    expect(line).toMatch(/Investigation — fails \(13 vs DC 14\)/);
    expect(line).not.toContain('d20');
    expect(line).not.toContain('INT');
  });
});

describe('narrationHintForTier', () => {
  it('returns guidance for every tier', () => {
    const tiers = [
      'critical_success',
      'solid_success',
      'bare_success',
      'bare_failure',
      'solid_failure',
      'critical_failure',
    ] as const;
    for (const tier of tiers) {
      expect(narrationHintForTier(tier).length).toBeGreaterThan(10);
    }
  });
});
