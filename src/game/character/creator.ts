import {
  ABILITIES,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_MAX,
  POINT_BUY_MIN,
  STANDARD_ARRAY,
  abilityModifier,
  proficiencyBonus,
  type Ability,
} from '../../utils/helpers.js';
import { abilityScoresSchema, type AbilityScores } from '../../validation/schemas.js';

export interface CharacterBuildInput {
  name: string;
  race: string;
  className: string;
  background: string;
  level: number;
  abilityScores: AbilityScores;
  savingThrows: Ability[];
  skillProficiencies: string[];
  hitPoints: number;
  maxHitPoints: number;
  hitDice: string;
  armorClass: number;
  speed: number;
  equipment?: string[];
  languages?: string[];
  features?: string[];
  personality?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  backstory?: string;
  appearance?: string;
  portraitPrompt?: string;
}

export function validateStandardArray(scores: number[]): boolean {
  if (scores.length !== 6) return false;
  const sorted = [...scores].sort((a, b) => b - a);
  const expected = [...STANDARD_ARRAY].sort((a, b) => b - a);
  return sorted.every((v, i) => v === expected[i]);
}

export function validatePointBuy(scores: AbilityScores): { valid: boolean; cost: number; error?: string } {
  let cost = 0;
  for (const ability of ABILITIES) {
    const score = scores[ability];
    if (score < POINT_BUY_MIN || score > POINT_BUY_MAX) {
      return { valid: false, cost: 0, error: `${ability} must be ${POINT_BUY_MIN}-${POINT_BUY_MAX} for point buy` };
    }
    const c = POINT_BUY_COSTS[score];
    if (c === undefined) return { valid: false, cost: 0, error: `Invalid score for ${ability}` };
    cost += c;
  }
  if (cost > POINT_BUY_BUDGET) {
    return { valid: false, cost, error: `Point buy cost ${cost} exceeds budget ${POINT_BUY_BUDGET}` };
  }
  return { valid: true, cost };
}

export function computeAbilityMods(scores: AbilityScores): Record<Ability, number> {
  const mods = {} as Record<Ability, number>;
  for (const ability of ABILITIES) {
    mods[ability] = abilityModifier(scores[ability]);
  }
  return mods;
}

export function computePassivePerception(wisMod: number, isProficient: boolean, profBonus: number): number {
  return 10 + wisMod + (isProficient ? profBonus : 0);
}

export function validateCharacterBuild(input: CharacterBuildInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.name?.trim()) errors.push('Character name is required');
  if (!input.race) errors.push('Race is required');
  if (!input.className) errors.push('Class is required');
  if (!input.background) errors.push('Background is required');
  if (input.level < 1 || input.level > 20) errors.push('Level must be 1-20');

  const scoreResult = abilityScoresSchema.safeParse(input.abilityScores);
  if (!scoreResult.success) {
    errors.push('Invalid ability scores');
  }

  if (input.savingThrows.length !== new Set(input.savingThrows).size) {
    errors.push('Duplicate saving throw proficiencies');
  }
  if (input.skillProficiencies.length !== new Set(input.skillProficiencies).size) {
    errors.push('Duplicate skill proficiencies');
  }

  if (input.hitPoints < 1) errors.push('Hit points must be at least 1');
  if (input.armorClass < 1) errors.push('Armor class must be at least 1');

  return { valid: errors.length === 0, errors };
}

export function buildCharacterStats(input: CharacterBuildInput) {
  const mods = computeAbilityMods(input.abilityScores);
  const prof = proficiencyBonus(input.level);
  const passivePerception = computePassivePerception(
    mods.WIS,
    input.skillProficiencies.includes('Perception'),
    prof,
  );

  return {
    abilityMods: mods,
    proficiencyBonus: prof,
    passivePerception,
    initiative: mods.DEX,
  };
}

export const APPEARANCE_QUESTIONS = [
  { key: 'species_traits', question: 'Describe visible ancestry/species traits (horns, ears, skin tone, etc.)' },
  { key: 'build', question: 'Body type and build?' },
  { key: 'age', question: 'Age impression (youthful, weathered, ancient)?' },
  { key: 'face', question: 'Face, hair, and eyes?' },
  { key: 'clothing', question: 'Clothing and armor style?' },
  { key: 'weapon', question: 'Signature weapon or focus?' },
  { key: 'colors', question: 'Dominant colors and materials?' },
  { key: 'mood', question: 'Expression and personality in their bearing?' },
  { key: 'marks', question: 'Scars, tattoos, symbols, or distinguishing marks?' },
  { key: 'avoid', question: 'Anything to avoid in their portrait?' },
] as const;

export function buildAppearanceDescription(answers: Record<string, string>): string {
  return APPEARANCE_QUESTIONS.map((q) => {
    const answer = answers[q.key]?.trim();
    return answer ? `${q.question} ${answer}` : null;
  })
    .filter(Boolean)
    .join('\n');
}

export function buildPortraitPromptFromCharacter(
  name: string,
  race: string,
  className: string,
  appearance: string,
  styleNegative: string,
): string {
  return [
    `Character portrait of ${name}, ${race} ${className}.`,
    appearance,
    'Portrait framing, head and shoulders, fantasy illustration.',
    `Avoid: ${styleNegative}`,
  ]
    .filter(Boolean)
    .join(' ');
}
