import { prisma } from '../../db/client.js';
import { parseJson, toJson } from '../../utils/helpers.js';
import { restoreAllSpellSlots } from './spell-slots.js';
import { getActiveCombat, updateParticipantSpellSlots } from './combat-service.js';
import { getRemainingSlots, getSpellSlotState } from './spell-slots.js';

export interface LongRestResult {
  characterName: string;
  hpRestored: number;
  hitPoints: number;
  maxHitPoints: number;
  slotsRestored: boolean;
}

export const CAMP_PENDING_THREAD = '⛺ Camp in progress';

export function isCampPending(openThreads: string[]): boolean {
  return openThreads.some((t) => t.includes(CAMP_PENDING_THREAD));
}

export async function setCampPending(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;
  const threads = parseJson<string[]>(campaign.openThreads, []);
  if (!isCampPending(threads)) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { openThreads: toJson([...threads, CAMP_PENDING_THREAD]) },
    });
  }
}

export async function clearCampPending(campaignId: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;
  const threads = parseJson<string[]>(campaign.openThreads, []).filter(
    (t) => !t.includes(CAMP_PENDING_THREAD),
  );
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { openThreads: toJson(threads) },
  });
}

/** Long rest: full HP, clear conditions, restore all spell slots. */
export async function performLongRest(characterId: string, campaignId?: string): Promise<LongRestResult> {
  const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
  const hpRestored = character.maxHitPoints - character.hitPoints;

  await prisma.character.update({
    where: { id: characterId },
    data: {
      hitPoints: character.maxHitPoints,
      conditions: toJson([]),
    },
  });

  await restoreAllSpellSlots(characterId);

  const cid = campaignId;
  if (cid) {
    const combat = await getActiveCombat(cid);
    if (combat) {
      const participant = combat.participants.find((p) => p.characterId === characterId);
      if (participant) {
        const updated = await prisma.character.findUnique({ where: { id: characterId } });
        const slots = getRemainingSlots(getSpellSlotState(updated?.spellcasting ?? null));
        await updateParticipantSpellSlots(cid, participant.id, slots);
      }
    }
  }

  return {
    characterName: character.name,
    hpRestored,
    hitPoints: character.maxHitPoints,
    maxHitPoints: character.maxHitPoints,
    slotsRestored: true,
  };
}

export async function performPartyLongRest(campaignId: string, characterIds: string[]): Promise<LongRestResult[]> {
  const results: LongRestResult[] = [];
  for (const id of characterIds) {
    results.push(await performLongRest(id, campaignId));
  }
  return results;
}

export function formatRestRecoverySummary(results: LongRestResult[]): string {
  if (!results.length) return '';
  return results
    .map((r) => `**${r.characterName}**: ${r.hitPoints}/${r.maxHitPoints} HP · spell slots restored`)
    .join('\n');
}
