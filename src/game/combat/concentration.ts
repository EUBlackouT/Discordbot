import { rollAbilityCheck } from '../dice/engine.js';

export function concentrationSaveDc(damageTaken: number): number {
  return Math.max(10, Math.floor(damageTaken / 2));
}

export function rollConcentrationSave(
  conModifier: number,
  dc: number,
): { success: boolean; total: number; breakdown: string; dc: number } {
  const roll = rollAbilityCheck({
    abilityModifier: conModifier,
    proficiencyBonus: 0,
    isProficient: false,
    dc,
  });
  return {
    success: roll.success,
    total: roll.total,
    breakdown: roll.breakdown,
    dc,
  };
}
