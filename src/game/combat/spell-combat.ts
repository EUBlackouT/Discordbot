import type { Character } from '@prisma/client';
import { parseJson } from '../../utils/helpers.js';
import type { Ability } from '../../utils/helpers.js';
import { lookupSpell, parseCharacterSpellcasting } from '../character/spell-reference.js';
import { rollDamage, rollAbilityCheck } from '../dice/engine.js';
import type { AttackResult } from './combat-service.js';

export type SpellResolutionKind = 'attack' | 'save' | 'heal' | 'utility';

export type SpellActionEconomy = 'action' | 'bonus' | 'reaction' | 'free';

export interface SpellResolutionPlan {
  kind: SpellResolutionKind;
  spellKey: string;
  spellName: string;
  description: string;
  attackBonus?: number;
  damageExpr?: string;
  saveAbility?: Ability;
  saveDc?: number;
  healExpr?: string;
  requiresTarget: boolean;
  actionEconomy: SpellActionEconomy;
}

export interface SpellResolutionResult {
  plan: SpellResolutionPlan;
  attack?: AttackResult;
  saveRoll?: { success: boolean; total: number; breakdown: string };
  healing?: { amount: number; breakdown: string };
  narrativeHint: string;
}

const CONCENTRATION_SPELLS = new Set([
  'bless', 'bane', 'shield-of-faith', 'hex', 'hunters-mark', 'witch-bolt', 'faerie-fire',
  'entangle', 'fog-cloud', 'heroism', 'sanctuary', 'guidance', 'resistance',
]);

const SAVE_SPELLS: Record<string, Ability> = {
  'sacred-flame': 'DEX',
  'fire-bolt': 'DEX',
  'poison-spray': 'CON',
  'vicious-mockery': 'WIS',
  bane: 'CHA',
  'cure-wounds': 'CON',
  command: 'WIS',
  'inflict-wounds': 'CON',
};

export function parseSpellActionEconomy(spellKey: string): SpellActionEconomy {
  const spell = lookupSpell(spellKey);
  if (!spell) return 'action';
  const ct = spell.castingTime.toLowerCase();
  if (ct.includes('reaction')) return 'reaction';
  if (ct.includes('bonus')) return 'bonus';
  if (ct.includes('minute') || ct.includes('hour')) return 'action';
  return 'action';
}

export function isConcentrationSpell(spellKey: string): boolean {
  const spell = lookupSpell(spellKey);
  if (!spell) return false;
  if (CONCENTRATION_SPELLS.has(spellKey)) return true;
  return spell.duration.toLowerCase().includes('concentration');
}

const ATTACK_SPELL_DAMAGE: Record<string, string> = {
  'guiding-bolt': '4d6',
  'inflict-wounds': '3d10',
  'fire-bolt': '1d10',
  'sacred-flame': '1d8',
  'chill-touch': '1d8',
  'shocking-grasp': '1d8',
  'eldritch-blast': '1d10',
  'witch-bolt': '1d12',
};

export function planSpellResolution(spellKey: string, caster: Character): SpellResolutionPlan | null {
  const spell = lookupSpell(spellKey);
  if (!spell) return null;

  const mods = parseJson<Record<Ability, number>>(caster.abilityMods, {
    STR: 0,
    DEX: 0,
    CON: 0,
    INT: 0,
    WIS: 0,
    CHA: 0,
  });
  const meta = parseCharacterSpellcasting(caster.spellcasting);
  const spellAbility = (meta.classChoices.spellAbility as Ability) ?? inferCasterAbility(caster.className);
  const mod = mods[spellAbility] ?? 0;
  const prof = caster.proficiencyBonus;
  const saveDc = 8 + prof + mod;

  const actionEconomy = parseSpellActionEconomy(spellKey);

  if (spellKey === 'healing-word') {
    return {
      kind: 'heal',
      spellKey,
      spellName: spell.name,
      description: spell.description,
      healExpr: `1d4+${mod}`,
      requiresTarget: true,
      actionEconomy: 'bonus',
    };
  }

  if (spellKey === 'cure-wounds' || spell.name.toLowerCase().includes('heal')) {
    return {
      kind: 'heal',
      spellKey,
      spellName: spell.name,
      description: spell.description,
      healExpr: `1d8+${mod}`,
      requiresTarget: true,
      actionEconomy,
    };
  }

  if (spellKey === 'shield') {
    return {
      kind: 'utility',
      spellKey,
      spellName: spell.name,
      description: spell.description,
      requiresTarget: false,
      actionEconomy: 'reaction',
    };
  }

  if (['bless', 'guidance', 'resistance', 'shield-of-faith', 'sanctuary', 'hex', 'hunters-mark'].includes(spellKey)) {
    return {
      kind: 'utility',
      spellKey,
      spellName: spell.name,
      description: spell.description,
      requiresTarget: spellKey !== 'guidance',
      actionEconomy,
    };
  }

  if (SAVE_SPELLS[spellKey] || spell.description.toLowerCase().includes('saving throw')) {
    const saveAbility = SAVE_SPELLS[spellKey] ?? 'DEX';
    return {
      kind: 'save',
      spellKey,
      spellName: spell.name,
      description: spell.description,
      saveAbility,
      saveDc,
      damageExpr: ATTACK_SPELL_DAMAGE[spellKey] ?? '1d8',
      requiresTarget: true,
      actionEconomy,
    };
  }

  if (ATTACK_SPELL_DAMAGE[spellKey] || spell.range.toLowerCase().includes('ft')) {
    return {
      kind: 'attack',
      spellKey,
      spellName: spell.name,
      description: spell.description,
      attackBonus: prof + mod,
      damageExpr: ATTACK_SPELL_DAMAGE[spellKey] ?? '1d8',
      requiresTarget: true,
      actionEconomy,
    };
  }

  return {
    kind: 'utility',
    spellKey,
    spellName: spell.name,
    description: spell.description,
    requiresTarget: false,
    actionEconomy,
  };
}

function inferCasterAbility(className: string): Ability {
  const lower = className.toLowerCase();
  if (lower.includes('cleric') || lower.includes('druid') || lower.includes('ranger')) return 'WIS';
  if (lower.includes('paladin') || lower.includes('sorcerer') || lower.includes('warlock') || lower.includes('bard')) {
    return 'CHA';
  }
  return 'INT';
}

export function buildSpellNarrativeHint(plan: SpellResolutionPlan, result: Partial<SpellResolutionResult>): string {
  if (plan.kind === 'heal' && result.healing) {
    return `${plan.spellName} restores **${result.healing.amount}** HP (${result.healing.breakdown}).`;
  }
  if (plan.kind === 'save' && result.saveRoll) {
    const dmg = result.attack?.damage;
    return result.saveRoll.success
      ? `${plan.spellName}: target succeeds on ${plan.saveAbility} save (${result.saveRoll.breakdown}).`
      : `${plan.spellName}: target fails ${plan.saveAbility} save — **${dmg ?? 0}** damage.`;
  }
  if (plan.kind === 'attack' && result.attack) {
    return result.attack.hit
      ? `${plan.spellName} hits for **${result.attack.damage ?? 0}** (${result.attack.breakdown}).`
      : `${plan.spellName} misses (${result.attack.breakdown}).`;
  }
  return `${plan.spellName}: ${plan.description}`;
}

export function rollSpellSave(dc: number, saveMod = 0): { success: boolean; total: number; breakdown: string } {
  const roll = rollAbilityCheck({
    abilityModifier: saveMod,
    proficiencyBonus: 0,
    isProficient: false,
    dc,
  });
  return { success: roll.success, total: roll.total, breakdown: roll.breakdown };
}

export function rollSpellHeal(expr: string): { amount: number; breakdown: string } {
  const roll = rollDamage(expr);
  return { amount: roll.total, breakdown: roll.breakdown };
}
