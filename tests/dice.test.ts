import { describe, it, expect } from 'vitest';
import {
  parseRollExpression,
  executeRoll,
  rollAbilityScores,
  rollAbilityCheck,
} from '../src/game/dice/engine.js';

describe('Dice Parser', () => {
  it('parses 1d20', () => {
    const p = parseRollExpression('1d20');
    expect(p.count).toBe(1);
    expect(p.sides).toBe(20);
  });

  it('parses 2d6+3', () => {
    const p = parseRollExpression('2d6+3');
    expect(p.count).toBe(2);
    expect(p.modifier).toBe(3);
  });

  it('parses 4d6dl1', () => {
    const p = parseRollExpression('4d6dl1');
    expect(p.dropLowest).toBe(1);
  });

  it('rejects invalid expressions', () => {
    expect(() => parseRollExpression('invalid')).toThrow();
  });
});

describe('4d6 drop lowest', () => {
  it('drops lowest die', () => {
    // rng() must return 0–1; these values produce d6 faces 6, 5, 4, 1
    let i = 0;
    const rolls = [0.99, 0.82, 0.65, 0.0];
    const rng = () => rolls[i++ % rolls.length];
    const result = executeRoll('4d6dl1', 'normal', rng);
    expect(result.keptDice).toHaveLength(3);
    expect(result.droppedDice).toContain(1);
    expect(result.total).toBe(15);
  });

  it('rollAbilityScores returns 6 scores', () => {
    const scores = rollAbilityScores(() => 0.9);
    expect(scores).toHaveLength(6);
    scores.forEach((s) => expect(s).toBeGreaterThanOrEqual(3));
  });
});

describe('Advantage/Disadvantage', () => {
  it('advantage keeps higher d20', () => {
    let i = 0;
    const rng = () => [0.1, 0.9][i++]; // rolls 3 and 19
    const result = executeRoll('1d20', 'advantage', rng);
    expect(result.keptDice[0]).toBeGreaterThanOrEqual(15);
  });

  it('disadvantage keeps lower d20', () => {
    let i = 0;
    const rng = () => [0.1, 0.9][i++];
    const result = executeRoll('1d20', 'disadvantage', rng);
    expect(result.keptDice[0]).toBeLessThanOrEqual(5);
  });
});

describe('Skill checks', () => {
  it('calculates success against DC', () => {
    const result = rollAbilityCheck({
      abilityModifier: 3,
      proficiencyBonus: 2,
      isProficient: true,
      dc: 15,
      rng: () => 0.75, // high roll
    });
    expect(result.total).toBeGreaterThanOrEqual(15);
    expect(result.success).toBe(true);
  });

  it('calculates saving throw failure', () => {
    const result = rollAbilityCheck({
      abilityModifier: -1,
      proficiencyBonus: 2,
      isProficient: false,
      dc: 20,
      rng: () => 0.1,
    });
    expect(result.success).toBe(false);
  });
});
