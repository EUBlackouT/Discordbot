import type { Character } from '@prisma/client';
import { parseCharacterSpellcasting, lookupSpell } from '../character/spell-reference.js';
import { parseJson, toJson } from '../../utils/helpers.js';
import { prisma } from '../../db/client.js';

export interface SpellSlotState {
  max: Record<string, number>;
  used: Record<string, number>;
}

export function getSpellSlotState(spellcastingRaw: string | null): SpellSlotState {
  const meta = parseCharacterSpellcasting(spellcastingRaw);
  const parsed = parseJson<Record<string, unknown>>(spellcastingRaw ?? '{}', {});
  const used = (parsed.slotsUsed as Record<string, number>) ?? {};
  return { max: meta.slots, used };
}

export function getRemainingSlots(state: SpellSlotState): Record<string, number> {
  const remaining: Record<string, number> = {};
  for (const [level, max] of Object.entries(state.max)) {
    const left = max - (state.used[level] ?? 0);
    if (left > 0) remaining[level] = left;
  }
  return remaining;
}

export function spellSlotLevel(spellKey: string): number | null {
  const spell = lookupSpell(spellKey);
  if (!spell) return null;
  return spell.level === 0 ? null : spell.level;
}

export function canCastSpell(spellcastingRaw: string | null, spellKey: string): { ok: boolean; reason?: string } {
  const level = spellSlotLevel(spellKey);
  if (level === null) return { ok: true };

  const state = getSpellSlotState(spellcastingRaw);
  const remaining = getRemainingSlots(state);
  const key = String(level);
  if ((remaining[key] ?? 0) <= 0) {
    return { ok: false, reason: `No ${level}${level === 1 ? 'st' : 'th'}-level spell slots remaining.` };
  }
  return { ok: true };
}

/** Persist slot consumption on the character record. */
export async function consumeSpellSlot(characterId: string, spellKey: string): Promise<void> {
  const level = spellSlotLevel(spellKey);
  if (level === null) return;

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return;

  const parsed = parseJson<Record<string, unknown>>(character.spellcasting ?? '{}', {});
  const used = (parsed.slotsUsed as Record<string, number>) ?? {};
  const key = String(level);
  used[key] = (used[key] ?? 0) + 1;
  parsed.slotsUsed = used;

  await prisma.character.update({
    where: { id: characterId },
    data: { spellcasting: toJson(parsed) },
  });
}

/** Clear all used spell slots (long rest). */
export async function restoreAllSpellSlots(characterId: string): Promise<void> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) return;

  const parsed = parseJson<Record<string, unknown>>(character.spellcasting ?? '{}', {});
  delete parsed.slotsUsed;

  await prisma.character.update({
    where: { id: characterId },
    data: { spellcasting: toJson(parsed) },
  });
}

export function formatSlotsForDisplay(spellcastingRaw: string | null): string {
  const state = getSpellSlotState(spellcastingRaw);
  const remaining = getRemainingSlots(state);
  const parts = Object.entries(remaining).map(([lvl, n]) => `Lv${lvl}: ${n}`);
  return parts.length ? parts.join(' · ') : 'No slots';
}
