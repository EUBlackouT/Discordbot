import { prisma } from '../../db/client.js';
import { toJson, parseJson } from '../../utils/helpers.js';
import {
  validateCharacterBuild,
  buildAppearanceDescription,
  buildPortraitPromptFromCharacter,
  type CharacterBuildInput,
} from './creator.js';
import {
  type CharacterDraftData,
  validateDraftForFinalize,
  assembleFeatures,
  assembleLanguages,
  buildStatsFromDraft,
  computeSpellSlots,
} from './draft-types.js';
import { SRD_RACES } from '../rules/srd-data.js';
import { loadRulesData } from '../rules/loader.js';

export async function getOrCreatePlayer(discordId: string, campaignId?: string) {
  const existing = await prisma.player.findFirst({
    where: { discordId, campaignId: campaignId ?? null },
  });
  if (existing) return existing;

  return prisma.player.create({
    data: { discordId, campaignId: campaignId ?? null },
  });
}

export async function getCharacterDraft(guildId: string, discordId: string) {
  return prisma.characterCreationDraft.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
  });
}

export async function upsertCharacterDraft(
  guildId: string,
  discordId: string,
  step: string,
  data: Record<string, unknown>,
  campaignId?: string,
  abilityMethod?: string,
) {
  const existing = await getCharacterDraft(guildId, discordId);
  const merged = existing ? { ...parseJson(existing.data, {}), ...data } : data;

  if (existing) {
    return prisma.characterCreationDraft.update({
      where: { id: existing.id },
      data: { step, data: toJson(merged), abilityMethod: abilityMethod ?? existing.abilityMethod, campaignId },
    });
  }

  return prisma.characterCreationDraft.create({
    data: {
      guildId,
      discordId,
      campaignId: campaignId ?? null,
      step,
      data: toJson(merged),
      abilityMethod,
    },
  });
}

export async function finalizeCharacter(guildId: string, discordId: string, campaignId?: string) {
  const draft = await getCharacterDraft(guildId, discordId);
  if (!draft) throw new Error('No character creation in progress.');

  const data = parseJson<CharacterDraftData>(draft.data, {});
  const rules = await loadRulesData();
  const race = SRD_RACES.find((r) => r.key === data.raceKey);
  const cls = rules.classes.find((c) => c.key === data.classKey);
  const bg = rules.backgrounds.find((b) => b.key === data.backgroundKey);

  if (!race || !cls || !bg) throw new Error('Incomplete character draft.');

  const errors = validateDraftForFinalize(data, race, cls);
  if (errors.length) throw new Error(errors.join('; '));

  const stats = buildStatsFromDraft(data, race, cls);
  const player = await getOrCreatePlayer(discordId, campaignId);

  const appearance = buildAppearanceDescription(data.appearanceAnswers ?? {});
  const features = assembleFeatures(race, cls, data, bg.features);
  const languages = assembleLanguages(race, data);
  const equipment = [
    ...(data.equipment ?? []),
    ...bg.equipment.filter((e) => !(data.equipment ?? []).some((x) => x.includes(e.split(' ')[0]))),
  ];

  const spellcastingPayload = cls.spellcasting
    ? {
        ability: cls.spellcasting.ability,
        ritual: cls.spellcasting.ritual,
        cantrips: data.cantrips ?? [],
        spellsKnown: data.spellsKnown ?? [],
        spellsPrepared: data.spellsPrepared ?? [],
        slots: computeSpellSlots(cls, 1),
        classChoices: data.classChoices ?? {},
      }
    : data.classChoices && Object.keys(data.classChoices).length
      ? { classChoices: data.classChoices }
      : null;

  const spellsKnown = [...(data.cantrips ?? []), ...(data.spellsKnown ?? [])];
  const spellsPrepared = cls.spellcasting?.spellsPrepared
    ? [...(data.cantrips ?? []), ...(data.spellsPrepared ?? [])]
    : spellsKnown;

  const build = {
    name: data.name!,
    race: race.name,
    className: cls.name,
    background: bg.name,
    level: 1,
    abilityScores: stats.abilityScores,
    savingThrows: cls.savingThrows as CharacterBuildInput['savingThrows'],
    skillProficiencies: stats.skills,
    hitPoints: stats.hitPoints,
    maxHitPoints: stats.maxHitPoints,
    hitDice: cls.hitDie,
    armorClass: stats.armorClass,
    speed: stats.speed,
    equipment,
    languages,
    features,
    personality: data.personalityTrait ?? '',
    ideals: data.ideal ?? '',
    bonds: data.bond ?? '',
    flaws: data.flaw ?? '',
    backstory: data.backstory ?? '',
    appearance,
    portraitPrompt: '',
  };

  const validation = validateCharacterBuild(build);
  if (!validation.valid) throw new Error(`Character incomplete: ${validation.errors.join(', ')}`);

  build.portraitPrompt = buildPortraitPromptFromCharacter(
    build.name,
    build.race,
    build.className,
    appearance,
    'text, watermark, UI, modern objects',
  );

  const character = await prisma.character.create({
    data: {
      guildId,
      campaignId: campaignId ?? null,
      playerId: player.id,
      ownerDiscordId: discordId,
      name: build.name,
      race: build.race,
      className: build.className,
      background: build.background,
      level: build.level,
      abilityScores: toJson(build.abilityScores),
      abilityMods: toJson(stats.abilityMods),
      proficiencyBonus: stats.proficiencyBonus,
      savingThrows: toJson(build.savingThrows),
      skillProficiencies: toJson(build.skillProficiencies),
      armorClass: build.armorClass,
      hitPoints: build.hitPoints,
      maxHitPoints: build.maxHitPoints,
      hitDice: build.hitDice,
      initiative: stats.initiative,
      speed: build.speed,
      passivePerception: stats.passivePerception,
      equipment: toJson(equipment),
      languages: toJson(languages),
      features: toJson(features),
      spellcasting: spellcastingPayload ? toJson(spellcastingPayload) : null,
      personality: build.personality,
      ideals: build.ideals,
      bonds: build.bonds,
      flaws: build.flaws,
      backstory: build.backstory,
      appearance: build.appearance,
      portraitPrompt: build.portraitPrompt,
      isComplete: true,
      isActive: true,
    },
  });

  await prisma.characterCreationDraft.delete({ where: { id: draft.id } });
  return character;
}

export async function getCharactersForPlayer(
  guildId: string,
  discordId: string,
  campaignId?: string,
) {
  return prisma.character.findMany({
    where: {
      guildId,
      ownerDiscordId: discordId,
      campaignId: campaignId ?? undefined,
      isActive: true,
    },
  });
}

export async function getCharacterSheet(characterId: string, guildId: string, discordId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, guildId, ownerDiscordId: discordId },
  });
  if (!character) throw new Error('Character not found.');

  const scores = parseJson<Record<string, number>>(character.abilityScores, {});
  const mods = parseJson<Record<string, number>>(character.abilityMods, {});
  const skills = parseJson<string[]>(character.skillProficiencies, []);
  const saves = parseJson<string[]>(character.savingThrows, []);
  const features = parseJson<string[]>(character.features, []);
  const languages = parseJson<string[]>(character.languages, []);
  const equipment = parseJson<string[]>(character.equipment, []);
  const spellMeta = parseJson<{
    cantrips?: string[];
    spellsKnown?: string[];
    spellsPrepared?: string[];
    slots?: Record<string, number>;
    classChoices?: Record<string, string>;
  }>(character.spellcasting ?? '{}', {});

  const spellsKnown = spellMeta.spellsKnown?.length
    ? [...(spellMeta.cantrips ?? []), ...spellMeta.spellsKnown]
    : parseJson<string[]>(character.spellcasting ?? '[]', []);
  const spellsPrepared = spellMeta.spellsPrepared ?? spellsKnown;
  const spellSlots = spellMeta.slots ?? {};
  const classChoices = spellMeta.classChoices ?? {};

  const lines = [
    `**${character.name}** — Level ${character.level} ${character.race} ${character.className}`,
    `Background: ${character.background}`,
    '',
    '**Ability Scores**',
    ...Object.entries(scores).map(([k, v]) => `${k}: ${v} (${mods[k] >= 0 ? '+' : ''}${mods[k]})`),
    '',
    `**AC:** ${character.armorClass} | **HP:** ${character.hitPoints}/${character.maxHitPoints}`,
    `**Speed:** ${character.speed} ft | **Initiative:** ${character.initiative >= 0 ? '+' : ''}${character.initiative}`,
    `**Proficiency:** +${character.proficiencyBonus} | **Passive Perception:** ${character.passivePerception}`,
    '',
    `**Saving Throws:** ${saves.join(', ')}`,
    `**Skills:** ${skills.join(', ') || 'None'}`,
    '',
    '**Features & Traits**',
    ...features.map((f) => `• ${f}`),
    '',
    `**Languages:** ${languages.join(', ') || 'Common'}`,
    `**Equipment:** ${equipment.join('; ') || 'None'}`,
  ];

  if (spellsKnown.length > 0) {
    lines.push('', '**Spells**');
    if (spellSlots['1']) lines.push(`Slots: ${spellSlots['1']} × 1st level`);
    lines.push(`Known: ${spellsKnown.join(', ')}`);
    if (spellsPrepared.length) lines.push(`Prepared: ${spellsPrepared.join(', ')}`);
  }

  if (Object.keys(classChoices).length) {
    lines.push('', '**Class Choices**', ...Object.entries(classChoices).map(([k, v]) => `• ${k}: ${v}`));
  }

  if (character.personality) lines.push('', `**Personality:** ${character.personality}`);
  if (character.ideals) lines.push(`**Ideal:** ${character.ideals}`);
  if (character.bonds) lines.push(`**Bond:** ${character.bonds}`);
  if (character.flaws) lines.push(`**Flaw:** ${character.flaws}`);
  if (character.appearance) lines.push('', `**Appearance:**\n${character.appearance}`);

  return lines.filter(Boolean).join('\n');
}

export async function deleteCharacter(characterId: string, guildId: string, discordId: string): Promise<void> {
  const character = await prisma.character.findFirst({
    where: { id: characterId, guildId, ownerDiscordId: discordId },
  });
  if (!character) throw new Error('Character not found.');
  await prisma.character.update({ where: { id: characterId }, data: { isActive: false } });
}

export function computeHpFromClass(hitDie: string, conMod: number, level: number): number {
  const dieSize = parseInt(hitDie.replace('d', ''), 10);
  const firstLevel = dieSize + conMod;
  const additional = Math.max(0, level - 1) * (Math.floor(dieSize / 2) + 1 + conMod);
  return Math.max(1, firstLevel + additional);
}

export function applyRaceBonuses(
  scores: Record<string, number>,
  bonuses: Record<string, number>,
): Record<string, number> {
  const result = { ...scores };
  for (const [ability, bonus] of Object.entries(bonuses)) {
    if (result[ability] !== undefined) result[ability] += bonus;
  }
  return result;
}
