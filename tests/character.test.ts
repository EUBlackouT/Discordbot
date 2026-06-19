import { describe, it, expect } from 'vitest';
import {
  validateStandardArray,
  validatePointBuy,
  validateCharacterBuild,
  buildCharacterStats,
} from '../src/game/character/creator.js';
import { getRemainingPool } from '../src/game/character/draft-types.js';

describe('Ability assign pool options', () => {
  it('supports duplicate rolled scores with index-based option values', () => {
    const pool = getRemainingPool({ scorePool: [13, 14, 12, 12, 14, 11], abilityAssignment: {} });
    const optionValues = pool.map((_, index) => `pool_idx_${index}`);
    expect(new Set(optionValues).size).toBe(pool.length);
  });
});

describe('Standard Array validation', () => {
  it('accepts valid standard array', () => {
    expect(validateStandardArray([15, 14, 13, 12, 10, 8])).toBe(true);
  });

  it('rejects wrong values', () => {
    expect(validateStandardArray([15, 15, 13, 12, 10, 8])).toBe(false);
  });
});

describe('Point Buy validation', () => {
  it('accepts valid point buy', () => {
    const result = validatePointBuy({ STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 });
    expect(result.valid).toBe(true);
    expect(result.cost).toBeLessThanOrEqual(27);
  });

  it('rejects over-budget scores', () => {
    const result = validatePointBuy({ STR: 15, DEX: 15, CON: 15, INT: 15, WIS: 15, CHA: 15 });
    expect(result.valid).toBe(false);
  });
});

describe('Character build validation', () => {
  const validBuild = {
    name: 'Test Hero',
    race: 'Human',
    className: 'Fighter',
    background: 'Soldier',
    level: 1,
    abilityScores: { STR: 16, DEX: 14, CON: 15, INT: 10, WIS: 12, CHA: 8 },
    savingThrows: ['STR', 'CON'],
    skillProficiencies: ['Athletics', 'Intimidation'],
    hitPoints: 12,
    maxHitPoints: 12,
    hitDice: '1d10',
    armorClass: 16,
    speed: 30,
  };

  it('validates complete character', () => {
    const result = validateCharacterBuild(validBuild);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects incomplete character', () => {
    const result = validateCharacterBuild({ ...validBuild, name: '' });
    expect(result.valid).toBe(false);
  });

  it('rejects duplicate skills', () => {
    const result = validateCharacterBuild({
      ...validBuild,
      skillProficiencies: ['Athletics', 'Athletics'],
    });
    expect(result.valid).toBe(false);
  });

  it('builds stats correctly', () => {
    const stats = buildCharacterStats(validBuild);
    expect(stats.proficiencyBonus).toBe(2);
    expect(stats.abilityMods.STR).toBe(3);
  });
});
