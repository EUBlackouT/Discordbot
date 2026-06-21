import { prisma } from '../../db/client.js';
import { toJson, parseJson } from '../../utils/helpers.js';
import type { Character } from '@prisma/client';
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
import { SRD_RACES, SRD_CLASSES, SRD_BACKGROUNDS, type SrdBackground, type SrdClass, type SrdRace } from '../rules/srd-data.js';

interface AssembledCharacter {
  build: CharacterBuildInput & { portraitPrompt: string };
  stats: ReturnType<typeof buildStatsFromDraft>;
  equipment: string[];
  features: string[];
  languages: string[];
  spellcastingPayload: Record<string, unknown> | null;
}

function resolveDraftEntities(data: CharacterDraftData) {
  const race = SRD_RACES.find((r) => r.key === data.raceKey);
  const cls = SRD_CLASSES.find((c) => c.key === data.classKey);
  const bg = SRD_BACKGROUNDS.find((b) => b.key === data.backgroundKey);
  return { race, cls, bg };
}

function assembleCharacterFromDraft(
  data: CharacterDraftData,
  race: SrdRace,
  cls: SrdClass,
  bg: SrdBackground,
): AssembledCharacter {
  const stats = buildStatsFromDraft(data, race, cls);
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

  const build: CharacterBuildInput & { portraitPrompt: string } = {
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
    portraitPrompt: buildPortraitPromptFromCharacter(
      data.name!,
      race.name,
      cls.name,
      appearance,
      'text, watermark, UI, modern objects',
    ),
  };

  return { build, stats, equipment, features, languages, spellcastingPayload };
}

function characterRecordFromAssembly(
  assembled: AssembledCharacter,
  ids: { guildId: string; discordId: string; playerId: string; campaignId: string | null },
  preview = false,
): Character {
  const { build, stats, equipment, features, languages, spellcastingPayload } = assembled;
  const now = new Date();
  return {
    id: preview ? 'preview' : '',
    guildId: ids.guildId,
    campaignId: ids.campaignId,
    playerId: ids.playerId,
    ownerDiscordId: ids.discordId,
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
    personality: build.personality ?? '',
    ideals: build.ideals ?? '',
    bonds: build.bonds ?? '',
    flaws: build.flaws ?? '',
    backstory: build.backstory ?? '',
    appearance: build.appearance ?? '',
    portraitPrompt: build.portraitPrompt,
    conditions: '[]',
    inventory: '[]',
    currency: '{}',
    currentLocationId: null,
    isComplete: !preview,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

/** Build a full sheet-compatible character from wizard draft data (not persisted). */
export function buildCharacterPreviewFromDraft(data: CharacterDraftData): Character | null {
  const { race, cls, bg } = resolveDraftEntities(data);
  if (!race || !cls || !bg || !data.name?.trim()) return null;

  const errors = validateDraftForFinalize(data, race, cls);
  if (errors.length) return null;

  const assembled = assembleCharacterFromDraft(data, race, cls, bg);
  const validation = validateCharacterBuild(assembled.build);
  if (!validation.valid) return null;

  return characterRecordFromAssembly(
    assembled,
    { guildId: '', discordId: '', playerId: '', campaignId: null },
    true,
  );
}

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
  const { race, cls, bg } = resolveDraftEntities(data);

  if (!race || !cls || !bg) throw new Error('Incomplete character draft.');

  const errors = validateDraftForFinalize(data, race, cls);
  if (errors.length) throw new Error(errors.join('; '));

  const assembled = assembleCharacterFromDraft(data, race, cls, bg);
  const validation = validateCharacterBuild(assembled.build);
  if (!validation.valid) throw new Error(`Character incomplete: ${validation.errors.join(', ')}`);

  const player = await getOrCreatePlayer(discordId, campaignId);
  const { build, stats, equipment, features, languages, spellcastingPayload } = assembled;

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

/** Update stored appearance text and rebuild the portrait prompt for image generation. */
export async function updateCharacterAppearance(characterId: string, lookDescription: string) {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const appearance = lookDescription.trim();
  if (!appearance) throw new Error('Appearance description cannot be empty.');

  const portraitPrompt = buildPortraitPromptFromCharacter(
    character.name,
    character.race,
    character.className,
    appearance,
    'text, watermark, UI, modern objects',
  );

  return prisma.character.update({
    where: { id: characterId },
    data: { appearance, portraitPrompt },
  });
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
      isActive: true,
      ...(campaignId ? { campaignId } : {}),
    },
  });
}

/** Resolve which character a slash command targets. */
export async function resolveCharacterForPlayer(
  guildId: string,
  discordId: string,
  options: { name?: string | null; campaignId?: string | null },
) {
  const all = await prisma.character.findMany({
    where: { guildId, ownerDiscordId: discordId, isActive: true },
  });

  if (options.name?.trim()) {
    return all.find((c) => c.name.toLowerCase() === options.name!.trim().toLowerCase()) ?? null;
  }

  if (options.campaignId) {
    const { getActiveCharacterForPlayer } = await import('../../tenant/campaign-member.js');
    const active = await getActiveCharacterForPlayer(options.campaignId, discordId);
    if (active) return active;
    const inCampaign = all.find((c) => c.campaignId === options.campaignId);
    if (inCampaign) return inCampaign;
  }

  if (all.length === 1) return all[0];
  return null;
}

export async function getCharacterSheet(characterId: string, guildId: string, discordId: string) {
  const character = await prisma.character.findFirst({
    where: { id: characterId, guildId, ownerDiscordId: discordId },
  });
  if (!character) throw new Error('Character not found.');

  const { buildCharacterSheetMarkdown } = await import('./sheet-display.js');
  return buildCharacterSheetMarkdown(character);
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
