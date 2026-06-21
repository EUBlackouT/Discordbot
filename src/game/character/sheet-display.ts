import { EmbedBuilder, AttachmentBuilder, type ActionRowBuilder, type StringSelectMenuBuilder } from 'discord.js';
import type { Character } from '@prisma/client';
import { parseJson } from '../../utils/helpers.js';
import {
  formatSpellKey,
  getCharacterSpellMeta,
  buildSheetSpellSelectRow,
  listSheetSpellKeys,
} from './spell-reference.js';

const SHEET_COLOR = 0x2d6a4f;
const ACCENT_COLOR = 0x1b4332;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}

function asNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'number') out[k] = v;
  }
  return out;
}

function chunkField(name: string, lines: string[], inline = false): { name: string; value: string; inline: boolean }[] {
  const text = lines.filter(Boolean).join('\n');
  if (!text) return [];
  if (text.length <= 1024) return [{ name, value: text, inline }];

  const fields: { name: string; value: string; inline: boolean }[] = [];
  let chunk = '';
  let part = 1;
  for (const line of lines) {
    const next = chunk ? `${chunk}\n${line}` : line;
    if (next.length > 1024) {
      if (chunk) fields.push({ name: part === 1 ? name : `${name} (cont.)`, value: chunk, inline });
      chunk = line.slice(0, 1024);
      part++;
    } else {
      chunk = next;
    }
  }
  if (chunk) fields.push({ name: part === 1 ? name : `${name} (cont.)`, value: chunk, inline });
  return fields;
}

function formatAbilityShort(ability: string, score: number, mod: number): string {
  const sign = mod >= 0 ? '+' : '';
  return `**${ability}** ${score} (${sign}${mod})`;
}

function hpBar(current: number, max: number): string {
  const pct = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  const filled = Math.round(pct * 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} **${current}/${max}**`;
}

export interface CharacterSheetPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
  files?: AttachmentBuilder[];
}

export function buildCharacterSheetPayload(
  character: Character,
  portraitPath?: string | null,
): CharacterSheetPayload {
  const embeds = buildCharacterSheetEmbeds(character, portraitPath);
  const spellRow = buildSheetSpellSelectRow(character.id, getCharacterSpellMeta(character));
  const files =
    portraitPath && /\.(png|jpe?g|webp)$/i.test(portraitPath)
      ? [new AttachmentBuilder(portraitPath, { name: 'portrait.png' })]
      : undefined;
  return {
    embeds,
    components: spellRow ? [spellRow] : [],
    files,
  };
}

export function buildCharacterSheetEmbeds(character: Character, portraitPath?: string | null): EmbedBuilder[] {
  const scores = asNumberRecord(parseJson(character.abilityScores, {}));
  const mods = asNumberRecord(parseJson(character.abilityMods, {}));
  const skills = asStringArray(parseJson(character.skillProficiencies, []));
  const saves = asStringArray(parseJson(character.savingThrows, []));
  const features = asStringArray(parseJson(character.features, []));
  const languages = asStringArray(parseJson(character.languages, []));
  const equipment = asStringArray(parseJson(character.equipment, []));
  const spellMeta = getCharacterSpellMeta(character);

  const abilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  const abilityRow1 = abilities
    .slice(0, 3)
    .map((a) => formatAbilityShort(a, scores[a] ?? 10, mods[a] ?? 0))
    .join('\n');
  const abilityRow2 = abilities
    .slice(3)
    .map((a) => formatAbilityShort(a, scores[a] ?? 10, mods[a] ?? 0))
    .join('\n');

  const header = new EmbedBuilder()
    .setColor(SHEET_COLOR)
    .setAuthor({ name: `${character.race} ${character.className}`, iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png' })
    .setTitle(character.name)
    .setDescription(
      [
        `**Level ${character.level} ${character.race} ${character.className}** · ${character.background}`,
        character.appearance?.trim() ? `*${character.appearance.trim().slice(0, 300)}*` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  if (portraitPath && /\.(png|jpe?g|webp)$/i.test(portraitPath)) {
    header.setThumbnail('attachment://portrait.png');
  }
  header.addFields(
      { name: 'Abilities', value: abilityRow1, inline: true },
      { name: '\u200b', value: abilityRow2, inline: true },
      {
        name: 'Vitality',
        value: [
          hpBar(character.hitPoints, character.maxHitPoints),
          `AC **${character.armorClass}** · Speed **${character.speed}** ft`,
          `Init **${character.initiative >= 0 ? '+' : ''}${character.initiative}** · Prof **+${character.proficiencyBonus}** · PP **${character.passivePerception}**`,
          `Hit Dice ${character.hitDice}`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Saves',
        value: saves.length ? saves.map((s) => `• ${s}`).join('\n') : '—',
        inline: true,
      },
      {
        name: 'Skills',
        value: skills.length ? skills.map((s) => `• ${s}`).join('\n') : '—',
        inline: true,
      },
    )
    .setFooter({ text: `Languages: ${languages.join(', ') || 'Common'}` });

  const detail = new EmbedBuilder().setColor(ACCENT_COLOR);

  if (spellMeta.cantrips.length > 0 || spellMeta.spellsKnown.length > 0) {
    const cantripLine = spellMeta.cantrips.length
      ? spellMeta.cantrips.map((k) => `• ${formatSpellKey(k)}`).join('\n')
      : null;
    const leveled = spellMeta.spellsKnown.filter((k) => !spellMeta.cantrips.includes(k));
    const preparedKeys = spellMeta.spellsPrepared.length ? spellMeta.spellsPrepared : leveled;
    const slotLine = spellMeta.slots['1'] ? `**Slots:** ${spellMeta.slots['1']} × 1st` : null;
    const preparedLine = preparedKeys.length
      ? `**Prepared**\n${preparedKeys.map((k) => `• ${formatSpellKey(k)}`).join('\n')}`
      : null;

    const spellBody = [slotLine, cantripLine ? `**Cantrips**\n${cantripLine}` : null, preparedLine]
      .filter(Boolean)
      .join('\n\n');

    detail.addFields({
      name: '✨ Spellcasting',
      value: spellBody.slice(0, 1024),
      inline: false,
    });

    if (listSheetSpellKeys(spellMeta).length > 0) {
      detail.addFields({
        name: '\u200b',
        value: '_Use the **Look up a spell** menu below for casting time, range, and effects._',
        inline: false,
      });
    }
  }

  if (features.length) {
    for (const field of chunkField('⚔️ Features & Traits', features.map((f) => `• ${f}`))) {
      detail.addFields(field);
    }
  }

  if (equipment.length) {
    const equipLines = equipment.map((e) => `• ${e}`);
    for (const field of chunkField('🎒 Equipment', equipLines)) {
      detail.addFields(field);
    }
  }

  if (Object.keys(spellMeta.classChoices).length) {
    detail.addFields({
      name: 'Class Choices',
      value: Object.entries(spellMeta.classChoices)
        .map(([k, v]) => `• **${k}:** ${v}`)
        .join('\n')
        .slice(0, 1024),
      inline: false,
    });
  }

  const flavor: string[] = [];
  if (character.personality) flavor.push(`**Personality** — ${character.personality}`);
  if (character.ideals) flavor.push(`**Ideal** — ${character.ideals}`);
  if (character.bonds) flavor.push(`**Bond** — ${character.bonds}`);
  if (character.flaws) flavor.push(`**Flaw** — ${character.flaws}`);

  if (flavor.length) {
    for (const field of chunkField('📜 Character', flavor)) {
      detail.addFields(field);
    }
  }

  const hasDetailFields = (detail.data.fields?.length ?? 0) > 0;
  return hasDetailFields ? [header, detail] : [header];
}

export function buildCharacterSheetMarkdown(character: Character): string {
  const embeds = buildCharacterSheetEmbeds(character);
  const parts = embeds.flatMap((embed) => {
    const data = embed.data;
    return [data.title, data.description, ...(data.fields?.map((f) => `${f.name}\n${f.value}`) ?? [])];
  });
  return parts.filter(Boolean).join('\n\n');
}
