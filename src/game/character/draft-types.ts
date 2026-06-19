import type { Ability } from '../../utils/helpers.js';
import { ABILITIES, abilityModifier, proficiencyBonus, POINT_BUY_BUDGET } from '../../utils/helpers.js';
import type { AbilityScores } from '../../validation/schemas.js';
import { validatePointBuy, validateStandardArray, computeAbilityMods, computePassivePerception } from './creator.js';
import { computeHpFromClass } from './service.js';
import type { SrdClass, SrdRace } from '../rules/srd-data.js';

export interface CharacterDraftData {
  raceKey?: string;
  race?: string;
  raceTraits?: string[];
  speed?: number;
  size?: string;
  classKey?: string;
  className?: string;
  hitDie?: string;
  savingThrows?: string[];
  classChoices?: Record<string, string>;
  backgroundKey?: string;
  background?: string;
  backgroundSkills?: string[];
  backgroundFeatures?: string[];
  backgroundEquipment?: string[];
  personalityOptions?: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] };
  abilityMethod?: 'standard' | 'roll' | 'pointbuy';
  scorePool?: number[];
  abilityAssignment?: Partial<Record<Ability, number>>;
  pointBuyScores?: Record<Ability, number>;
  halfElfBonuses?: [Ability, Ability];
  classSkills?: string[];
  expertiseSkills?: string[];
  extraLanguages?: string[];
  equipmentPackage?: string;
  equipment?: string[];
  cantrips?: string[];
  spellsKnown?: string[];
  spellsPrepared?: string[];
  personalityTrait?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
  backstory?: string;
  name?: string;
  appearanceAnswers?: Record<string, string>;
  appearanceIndex?: number;
}

export type WizardStep =
  | 'race'
  | 'class'
  | 'class_choice'
  | 'background'
  | 'abilities_method'
  | 'abilities_assign'
  | 'half_elf_abilities'
  | 'skills'
  | 'expertise'
  | 'languages'
  | 'equipment'
  | 'cantrips'
  | 'spells_known'
  | 'spells_prepared'
  | 'personality'
  | 'name'
  | 'appearance'
  | 'review';

export function nextStep(step: WizardStep, data: CharacterDraftData, cls?: SrdClass | null): WizardStep {
  const order: WizardStep[] = [
    'race', 'class', 'class_choice', 'background', 'abilities_method', 'abilities_assign',
    'half_elf_abilities', 'skills', 'expertise', 'languages', 'equipment',
    'cantrips', 'spells_known', 'spells_prepared', 'personality', 'name', 'appearance', 'review',
  ];
  let idx = order.indexOf(step) + 1;
  while (idx < order.length) {
    const candidate = order[idx];
    if (!shouldIncludeStep(candidate, data, cls)) {
      idx++;
      continue;
    }
    return candidate;
  }
  return 'review';
}

export function shouldIncludeStep(step: WizardStep, data: CharacterDraftData, cls?: SrdClass | null): boolean {
  switch (step) {
    case 'class_choice':
      return Boolean(cls?.level1Choices?.length);
    case 'half_elf_abilities':
      return data.raceKey === 'half-elf';
    case 'expertise':
      return data.classKey === 'rogue';
    case 'languages':
      return (data.raceKey === 'half-elf' || data.raceKey === 'high-elf' || data.raceKey === 'human') && !data.extraLanguages?.length;
    case 'cantrips':
      return Boolean(cls?.spellcasting?.cantripsKnown);
    case 'spells_known':
      return Boolean(cls?.spellcasting?.spellsKnown);
    case 'spells_prepared':
      return Boolean(cls?.spellcasting?.spellsPrepared);
    default:
      return !['class_choice', 'half_elf_abilities', 'expertise', 'languages', 'cantrips', 'spells_known', 'spells_prepared'].includes(step);
  }
}

export function getAssignedCount(data: CharacterDraftData): number {
  return Object.keys(data.abilityAssignment ?? {}).length;
}

export function getRemainingPool(data: CharacterDraftData): number[] {
  const pool = [...(data.scorePool ?? [])];
  const used = Object.values(data.abilityAssignment ?? {});
  for (const v of used) {
    const i = pool.indexOf(v);
    if (i >= 0) pool.splice(i, 1);
  }
  return pool;
}

export function getNextAbilityToAssign(data: CharacterDraftData): Ability | null {
  for (const a of ABILITIES) {
    if (data.abilityAssignment?.[a] === undefined) return a;
  }
  return null;
}

export function finalizeAbilityScores(
  data: CharacterDraftData,
  race: SrdRace,
): AbilityScores {
  const base: AbilityScores = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 };
  if (data.abilityMethod === 'pointbuy' && data.pointBuyScores) {
    Object.assign(base, data.pointBuyScores);
  } else if (data.abilityAssignment) {
    for (const a of ABILITIES) {
      base[a] = data.abilityAssignment[a] ?? 8;
    }
  }
  for (const [ability, bonus] of Object.entries(race.abilityBonuses)) {
    const key = ability as Ability;
    if (base[key] !== undefined) base[key] += bonus;
  }
  if (data.raceKey === 'half-elf' && data.halfElfBonuses) {
    for (const a of data.halfElfBonuses) {
      base[a] += 1;
    }
  }
  return base;
}

export function computeSpellSlots(cls: SrdClass, level: number): Record<string, number> {
  if (!cls.spellcasting) return {};
  // SRD level 1 full casters: 2 slots; warlock: 1 slot
  if (cls.key === 'warlock') return { '1': 1 };
  if (cls.spellcasting.spellsPrepared || cls.spellcasting.spellsKnown) {
    return { '1': 2 };
  }
  return {};
}

export function computeSpellsPreparedCount(abilityScore: number, level: number): number {
  const mod = abilityModifier(abilityScore);
  return Math.max(1, mod + level);
}

export function validateDraftForFinalize(
  data: CharacterDraftData,
  race: SrdRace,
  cls: SrdClass,
): string[] {
  const errors: string[] = [];
  if (!data.name?.trim()) errors.push('Name required');
  if (!data.raceKey) errors.push('Race required');
  if (!data.classKey) errors.push('Class required');
  if (!data.backgroundKey) errors.push('Background required');

  if (data.abilityMethod === 'pointbuy' && data.pointBuyScores) {
    const pb = validatePointBuy(data.pointBuyScores as AbilityScores);
    if (!pb.valid) errors.push(pb.error ?? 'Invalid point buy');
  } else if (data.scorePool) {
    const assigned = Object.values(data.abilityAssignment ?? {});
    if (assigned.length !== 6) errors.push('Assign all ability scores');
    else if (data.abilityMethod === 'standard' && !validateStandardArray(assigned)) {
      errors.push('Invalid standard array assignment');
    }
  }

  const skillCount = cls.skillChoices.count;
  if ((data.classSkills?.length ?? 0) !== skillCount) {
    errors.push(`Choose ${skillCount} class skills`);
  }

  if (data.classKey === 'rogue') {
    const profSkills = assembleSkills(data);
    if ((data.expertiseSkills?.length ?? 0) !== 2) {
      errors.push('Choose 2 skills for Expertise');
    } else if (!data.expertiseSkills!.every((s) => profSkills.includes(s))) {
      errors.push('Expertise skills must be from your proficiencies');
    }
  }

  if (cls.level1Choices?.length) {
    for (const choice of cls.level1Choices) {
      if (!data.classChoices?.[choice.key]) errors.push(`Choose ${choice.label}`);
    }
  }

  if (cls.spellcasting) {
    const sc = cls.spellcasting;
    if ((data.cantrips?.length ?? 0) !== sc.cantripsKnown) {
      errors.push(`Choose ${sc.cantripsKnown} cantrips`);
    }
    if (sc.spellsKnown && (data.spellsKnown?.length ?? 0) !== sc.spellsKnown) {
      errors.push(`Choose ${sc.spellsKnown} level-1 spells`);
    }
    if (sc.spellsPrepared) {
      const scores = finalizeAbilityScores(data, race);
      const ability = sc.ability as Ability;
      const max = computeSpellsPreparedCount(scores[ability], 1);
      if ((data.spellsPrepared?.length ?? 0) < 1 || (data.spellsPrepared?.length ?? 0) > max) {
        errors.push(`Prepare 1–${max} level-1 spells`);
      }
    }
  }

  return errors;
}

export function assembleFeatures(
  race: SrdRace,
  cls: SrdClass,
  data: CharacterDraftData,
  backgroundFeatures: string[],
): string[] {
  const features = [...race.traits, ...cls.features, ...backgroundFeatures];
  if (cls.level1Choices) {
    for (const choice of cls.level1Choices) {
      const picked = data.classChoices?.[choice.key];
      const opt = choice.options.find((o) => o.key === picked);
      if (opt) features.push(`${choice.label}: ${opt.label}`);
    }
  }
  if (data.expertiseSkills?.length) {
    features.push(`Expertise: ${data.expertiseSkills.join(', ')} (double proficiency)`);
  }
  return features;
}

export function assembleLanguages(race: SrdRace, data: CharacterDraftData): string[] {
  return [...race.languages, ...(data.extraLanguages ?? [])];
}

export function assembleSkills(data: CharacterDraftData): string[] {
  const all = [...(data.backgroundSkills ?? []), ...(data.classSkills ?? [])];
  return [...new Set(all)];
}

export function buildStatsFromDraft(
  data: CharacterDraftData,
  race: SrdRace,
  cls: SrdClass,
) {
  const abilityScores = finalizeAbilityScores(data, race);
  const mods = computeAbilityMods(abilityScores);
  const prof = proficiencyBonus(1);
  const skills = assembleSkills(data);
  const hp = computeHpFromClass(cls.hitDie, mods.CON, 1);
  const ac = 10 + mods.DEX;

  return {
    abilityScores,
    abilityMods: mods,
    proficiencyBonus: prof,
    passivePerception: computePassivePerception(mods.WIS, skills.includes('Perception'), prof),
    initiative: mods.DEX,
    hitPoints: hp,
    maxHitPoints: hp,
    armorClass: ac,
    speed: race.speed,
    skills,
  };
}

export const EXTRA_LANGUAGES = [
  'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial',
  'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon',
];
