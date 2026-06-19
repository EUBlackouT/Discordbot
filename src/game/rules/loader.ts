import { prisma } from '../../db/client.js';
import type { Ability } from '../../utils/helpers.js';
import { parseJson } from '../../utils/helpers.js';
import type { SrdClass, SrdRace, SrdSpell } from './srd-data.js';
import { SRD_CLASSES, SRD_RACES, SRD_BACKGROUNDS, SRD_SPELLS } from './srd-data.js';

export interface RulesData {
  races: Array<{
    key: string;
    name: string;
    speed: number;
    size: string;
    traits: string[];
    abilityBonuses: Record<string, number>;
    languages: string[];
    extraLanguageChoices?: number;
  }>;
  classes: Array<{
    key: string;
    name: string;
    hitDie: string;
    primaryAbility: string;
    savingThrows: string[];
    skillChoices: { count: number; options: string[] };
    features: string[];
    spellcasting?: SrdClass['spellcasting'];
    level1Choices?: SrdClass['level1Choices'];
    startingEquipment: SrdClass['startingEquipment'];
  }>;
  backgrounds: Array<{
    key: string;
    name: string;
    skillProficiencies: string[];
    features: string[];
    equipment: string[];
    personalityTraits: string[];
    ideals: string[];
    bonds: string[];
    flaws: string[];
  }>;
  skills: Array<{ key: string; name: string; ability: string }>;
  spells: SrdSpell[];
  conditions: Array<{ key: string; name: string; description: string }>;
}

let cachedRules: RulesData | null = null;

function staticRules(): RulesData {
  return {
    races: SRD_RACES.map((r) => ({ ...r })),
    classes: SRD_CLASSES.map((c) => ({ ...c })),
    backgrounds: SRD_BACKGROUNDS.map((b) => ({ ...b })),
    skills: [],
    spells: SRD_SPELLS,
    conditions: [],
  };
}

/** Authoritative SRD content from static module; DB used for skills/conditions when present. */
export async function loadRulesData(): Promise<RulesData> {
  if (cachedRules) return cachedRules;

  const base = staticRules();
  const [dbSkills, conditions] = await Promise.all([
    prisma.rulesSkill.findMany(),
    prisma.rulesCondition.findMany(),
  ]);

  if (dbSkills.length > 0) {
    base.skills = dbSkills.map((s) => ({ key: s.key, name: s.name, ability: s.ability }));
  } else {
    base.skills = [
      { key: 'acrobatics', name: 'Acrobatics', ability: 'DEX' },
      { key: 'perception', name: 'Perception', ability: 'WIS' },
      { key: 'athletics', name: 'Athletics', ability: 'STR' },
    ];
  }
  base.conditions = conditions.map((c) => ({ key: c.key, name: c.name, description: c.description }));

  cachedRules = base;
  return cachedRules;
}

export async function getRaceByKey(key: string) {
  return prisma.rulesRace.findUnique({ where: { key } });
}

export async function getClassByKey(key: string) {
  return prisma.rulesClass.findUnique({ where: { key } });
}

export async function getBackgroundByKey(key: string) {
  return prisma.rulesBackground.findUnique({ where: { key } });
}

export function getSpellsForClass(rules: RulesData, classKey: string, level: number): SrdSpell[] {
  return rules.spells.filter((s) => s.level === level && s.classes.includes(classKey));
}

export function getClassDefinition(rules: RulesData, classKey: string) {
  return rules.classes.find((c) => c.key === classKey);
}

export function getRaceDefinition(rules: RulesData, raceKey: string): SrdRace | undefined {
  return SRD_RACES.find((r) => r.key === raceKey);
}

export function getSkillAbility(skillName: string, rules: RulesData): Ability {
  const skill = rules.skills.find((s) => s.name === skillName || s.key === skillName);
  return (skill?.ability ?? 'WIS') as Ability;
}

export function getDcGuideline(taskDifficulty: 'easy' | 'medium' | 'hard' | 'very_hard'): number {
  const map = { easy: 10, medium: 15, hard: 20, very_hard: 25 };
  return map[taskDifficulty];
}
