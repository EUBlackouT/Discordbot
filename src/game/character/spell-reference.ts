import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import type { Character } from '@prisma/client';
import { SRD_SPELLS } from '../rules/srd-spells.js';
import type { SrdSpell } from '../rules/srd-data.js';
import { parseJson } from '../../utils/helpers.js';

const SPELL_BY_KEY = new Map(SRD_SPELLS.map((s) => [s.key, s]));

export function formatSpellKey(key: string): string {
  return SPELL_BY_KEY.get(key)?.name ?? key.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function lookupSpell(key: string): SrdSpell | undefined {
  return SPELL_BY_KEY.get(key);
}

export interface CharacterSpellMeta {
  cantrips: string[];
  spellsKnown: string[];
  spellsPrepared: string[];
  slots: Record<string, number>;
  classChoices: Record<string, string>;
}

export function parseCharacterSpellcasting(raw: string | null): CharacterSpellMeta {
  const empty: CharacterSpellMeta = {
    cantrips: [],
    spellsKnown: [],
    spellsPrepared: [],
    slots: {},
    classChoices: {},
  };
  if (!raw) return empty;

  const parsed = parseJson<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    return { ...empty, spellsKnown: parsed.filter((x): x is string => typeof x === 'string') };
  }
  if (!parsed || typeof parsed !== 'object') return empty;

  const obj = parsed as Record<string, unknown>;
  const cantrips = asStringArray(obj.cantrips);
  const spellsKnown = asStringArray(obj.spellsKnown);
  const combined = spellsKnown.length ? [...cantrips, ...spellsKnown] : cantrips;

  return {
    cantrips,
    spellsKnown: combined,
    spellsPrepared: asStringArray(obj.spellsPrepared),
    slots: asNumberRecord(obj.slots),
    classChoices: Object.fromEntries(
      Object.entries(obj.classChoices ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
  };
}

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

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function buildSpellDetailEmbed(spell: SrdSpell): EmbedBuilder {
  const levelLabel = spell.level === 0 ? 'Cantrip' : `${spell.level}${ordinal(spell.level)}-level`;
  return new EmbedBuilder()
    .setColor(0x6b4c9a)
    .setTitle(`📖 ${spell.name}`)
    .setDescription(spell.description)
    .addFields(
      { name: 'School', value: spell.school, inline: true },
      { name: 'Casting Time', value: spell.castingTime, inline: true },
      { name: 'Range', value: spell.range, inline: true },
      { name: 'Components', value: spell.components, inline: true },
      { name: 'Duration', value: spell.duration, inline: true },
      { name: 'Level', value: levelLabel, inline: true },
    )
    .setFooter({ text: spell.ritual ? 'Ritual spell · SRD reference' : 'SRD reference — mechanics in play are narrated by the DM' });
}

/** Spell keys the player can look up on their sheet (prepared first, then other known). */
export function listSheetSpellKeys(meta: CharacterSpellMeta): string[] {
  const prepared = meta.spellsPrepared.length ? meta.spellsPrepared : [];
  const leveledKnown = meta.spellsKnown.filter((k) => !meta.cantrips.includes(k));
  const ordered = [...meta.cantrips, ...(prepared.length ? prepared : leveledKnown)];
  return [...new Set(ordered)];
}

export function buildSheetSpellSelectRow(characterId: string, meta: CharacterSpellMeta): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const keys = listSheetSpellKeys(meta);
  if (keys.length === 0) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`char_sheet_spell:${characterId}`)
    .setPlaceholder('📖 Look up a spell…')
    .addOptions(
      keys.slice(0, 25).map((key) => {
        const spell = lookupSpell(key);
        const label = formatSpellKey(key).slice(0, 100);
        const level = spell?.level === 0 ? 'Cantrip' : spell ? `Lv ${spell.level}` : '';
        const desc = spell
          ? `${spell.school} · ${spell.castingTime}`.slice(0, 100)
          : undefined;
        return { label, value: key, description: desc || level || undefined };
      }),
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

import { getRemainingSlots, getSpellSlotState } from '../combat/spell-slots.js';

/** Compact spell summaries for AI controller / narrator context. */
export function summarizeSpellsForAI(spellcasting: string | null): {
  cantrips: string[];
  prepared: string[];
  slots: Record<string, number>;
  slotsRemaining: Record<string, number>;
} {
  const meta = parseCharacterSpellcasting(spellcasting);
  const slotState = getSpellSlotState(spellcasting);
  const remaining = getRemainingSlots(slotState);
  const describe = (key: string) => {
    const spell = lookupSpell(key);
    if (!spell) return formatSpellKey(key);
    return `${spell.name} (${spell.castingTime}, ${spell.range}): ${spell.description.slice(0, 100)}`;
  };

  const leveled = meta.spellsKnown.filter((k) => !meta.cantrips.includes(k));
  const prepared = meta.spellsPrepared.length ? meta.spellsPrepared : leveled;

  return {
    cantrips: meta.cantrips.map(describe),
    prepared: prepared.map(describe),
    slots: meta.slots,
    slotsRemaining: remaining,
  };
}

export function getCharacterSpellMeta(character: Character): CharacterSpellMeta {
  return parseCharacterSpellcasting(character.spellcasting);
}
