import { prisma } from '../db/client.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createAIProvider } from '../services/ai/index.js';
import type { NpcSpeaker } from '../campaign/npc-speech.js';
import {
  compactVoiceForAi,
  fallbackVoicePick,
  filterNpcCastingVoices,
  getEnglishVoices,
  type RegistryVoice,
} from './voice-registry.js';
import { filterVoicesByGender, inferNpcGender } from './voice-gender.js';
import {
  buildCastShortlist,
  inferVoiceCastProfile,
  isVoiceAcceptableForProfile,
  scoreVoiceForProfile,
  summarizeCastProfile,
} from './voice-cast-profile.js';

export interface VoicedNpc extends NpcSpeaker {
  voiceId: string;
  voiceLabel: string;
}

const ai = createAIProvider();

export function getNarratorVoiceId(): string {
  return config.voice.narratorVoiceId.trim();
}

export async function listUsedNpcVoiceIds(campaignId: string): Promise<string[]> {
  const npcs = await prisma.nPC.findMany({
    where: { campaignId, isActive: true, elevenLabsVoiceId: { not: '' } },
    select: { elevenLabsVoiceId: true },
  });
  return npcs.map((n) => n.elevenLabsVoiceId).filter(Boolean);
}

async function persistNpcVoice(
  npcId: string,
  voiceId: string,
  voiceLabel: string,
): Promise<void> {
  await prisma.nPC.update({
    where: { id: npcId },
    data: { elevenLabsVoiceId: voiceId, voiceLabel },
  });
}

export async function assignVoiceToNpcById(npcId: string): Promise<VoicedNpc | null> {
  const row = await prisma.nPC.findUnique({ where: { id: npcId } });
  if (!row) return null;
  if (row.elevenLabsVoiceId) {
    return npcRowToVoiced(row);
  }
  return assignVoiceToNpcRecord(row);
}

export async function assignVoiceToNpcRecord(
  row: {
    id: string;
    campaignId: string;
    name: string;
    description: string;
    attitude: string;
    goals: string;
    visualDescription?: string;
    elevenLabsVoiceId?: string;
    voiceLabel?: string;
  },
  options?: { forceRecast?: boolean },
): Promise<VoicedNpc> {
  if (row.elevenLabsVoiceId && !options?.forceRecast) {
    const voices = await getNpcCastingVoices();
    const current = voices.find((v) => v.voiceId === row.elevenLabsVoiceId);
    const profile = inferVoiceCastProfile(row);
    if (current && isVoiceAcceptableForProfile(current, profile)) {
      return npcRowToVoiced(row);
    }
    logger.info(
      `Recasting ${row.name} — "${row.voiceLabel ?? row.elevenLabsVoiceId}" does not fit role`,
    );
  }

  const [voices, usedIdsRaw] = await Promise.all([
    getNpcCastingVoices(),
    listUsedNpcVoiceIds(row.campaignId),
  ]);
  const usedIds = usedIdsRaw.filter((id) => id !== row.elevenLabsVoiceId);

  const cast = await castVoiceForNpc(
    {
      id: row.id,
      name: row.name,
      description: row.description,
      attitude: row.attitude,
      goals: row.goals,
      visualDescription: row.visualDescription,
      gender: inferNpcGender(row),
    },
    voices,
    usedIds,
  );

  await persistNpcVoice(row.id, cast.voiceId, cast.voiceLabel);
  logger.info(`Voice cast: ${row.name} → ${cast.voiceLabel} (${cast.voiceId})`);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    attitude: row.attitude,
    goals: row.goals,
    voiceId: cast.voiceId,
    voiceLabel: cast.voiceLabel,
  };
}

function npcRowToVoiced(row: {
  id: string;
  name: string;
  description: string;
  attitude: string;
  goals: string;
  elevenLabsVoiceId?: string;
  voiceLabel?: string;
}): VoicedNpc {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    attitude: row.attitude,
    goals: row.goals,
    voiceId: row.elevenLabsVoiceId!,
    voiceLabel: row.voiceLabel ?? row.elevenLabsVoiceId!,
  };
}

export async function castVoiceForNpc(
  npc: NpcSpeaker & { visualDescription?: string; gender?: string },
  voices: RegistryVoice[],
  usedVoiceIds: string[],
): Promise<{ voiceId: string; voiceLabel: string; reason?: string }> {
  const narratorId = getNarratorVoiceId();
  const gender = inferNpcGender(npc);
  const genderPool = filterVoicesByGender(voices, gender);
  const profile = inferVoiceCastProfile(npc);
  const shortlist = buildCastShortlist(npc, genderPool, usedVoiceIds, narratorId);
  const candidateVoices = shortlist.map((row) => ({
    ...compactVoiceForAi(row.voice),
    cast_score: row.score,
    recommended: row.acceptable,
  }));

  try {
    const result = await ai.assignNpcVoice({
      npc: { ...npc, gender: gender === 'unknown' ? undefined : gender },
      englishVoices: candidateVoices,
      usedVoiceIds,
      narratorVoiceId: narratorId,
      castProfile: summarizeCastProfile(profile),
    });
    const hit = genderPool.find((v) => v.voiceId === result.voice_id);
    if (hit && hit.voiceId !== narratorId) {
      const fit = scoreVoiceForProfile(hit, profile);
      if (isVoiceAcceptableForProfile(hit, profile)) {
        return {
          voiceId: hit.voiceId,
          voiceLabel: result.voice_label || hit.name,
          reason: result.reason,
        };
      }
      logger.warn(
        `AI voice "${hit.name}" poor fit for ${npc.name} (score ${fit}) — using profile cast`,
      );
    }
  } catch (err) {
    logger.warn(`AI voice cast failed for ${npc.name}`, err);
  }

  const fallback = fallbackVoicePick(npc, genderPool, usedVoiceIds);
  if (fallback) {
    return { voiceId: fallback.voiceId, voiceLabel: fallback.name, reason: 'profile cast' };
  }

  throw new Error(`No eligible NPC voice for ${npc.name}`);
}

/** Ensure an NPC has a persisted unique voice before they speak. */
export async function ensureNpcVoice(
  campaignId: string,
  npc: NpcSpeaker,
): Promise<VoicedNpc> {
  if (npc.id && npc.voiceId) {
    return {
      ...npc,
      voiceId: npc.voiceId,
      voiceLabel: npc.voiceLabel ?? npc.voiceId,
    };
  }

  if (npc.id) {
    const row = await prisma.nPC.findUnique({ where: { id: npc.id } });
    if (row?.elevenLabsVoiceId) return npcRowToVoiced(row);
    if (row) return assignVoiceToNpcRecord(row);
  }

  const byName = await prisma.nPC.findFirst({
    where: { campaignId, name: npc.name, isActive: true },
  });
  if (byName) {
    if (byName.elevenLabsVoiceId) return npcRowToVoiced(byName);
    return assignVoiceToNpcRecord(byName);
  }

  // Ephemeral speaker not in DB — cast without persist (shouldn't happen in normal play)
  const [voices, usedIds] = await Promise.all([
    getNpcCastingVoices(),
    listUsedNpcVoiceIds(campaignId),
  ]);
  const cast = await castVoiceForNpc(npc, voices, usedIds);
  return {
    ...npc,
    voiceId: cast.voiceId,
    voiceLabel: cast.voiceLabel,
  };
}

/** Assign or fix voices for all campaign NPCs (recasts poor fits). */
export async function assignVoicesForCampaign(campaignId: string): Promise<void> {
  const npcs = await prisma.nPC.findMany({
    where: { campaignId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const npc of npcs) {
    try {
      await assignVoiceToNpcRecord(npc);
    } catch (err) {
      logger.warn(`Failed to cast voice for ${npc.name}`, err);
    }
  }
}

/** English premade voices eligible for NPC lines (avoids professional voices that 403 at TTS). */
export async function getNpcCastingVoices(forceRefresh = false): Promise<RegistryVoice[]> {
  const all = await getEnglishVoices(forceRefresh);
  const npc = filterNpcCastingVoices(all);
  if (npc.length > 0) return npc;
  logger.warn('No premade NPC voices in registry — falling back to full English pool');
  return all;
}

/** Drop a blocked voice assignment and pick a new premade cast. */
export async function recastNpcVoiceByName(
  campaignId: string,
  npcName: string,
  blockedVoiceId?: string,
): Promise<VoicedNpc | null> {
  const row = await prisma.nPC.findFirst({
    where: { campaignId, name: npcName, isActive: true },
  });
  if (!row) return null;

  if (blockedVoiceId && row.elevenLabsVoiceId !== blockedVoiceId) {
    return npcRowToVoiced(row);
  }

  await prisma.nPC.update({
    where: { id: row.id },
    data: { elevenLabsVoiceId: '', voiceLabel: '' },
  });

  logger.warn(`Recasting NPC voice for ${npcName} — previous id ${blockedVoiceId ?? row.elevenLabsVoiceId} unusable`);
  return assignVoiceToNpcRecord({ ...row, elevenLabsVoiceId: '', voiceLabel: '' });
}

export async function createNpcWithVoice(
  campaignId: string,
  data: {
    name: string;
    description?: string;
    visualDescription?: string;
    goals?: string;
    secrets?: string;
    attitude?: string;
    locationId?: string | null;
  },
): Promise<VoicedNpc> {
  const npc = await prisma.nPC.create({
    data: {
      campaignId,
      name: data.name,
      description: data.description ?? '',
      visualDescription: data.visualDescription ?? '',
      goals: data.goals ?? '',
      secrets: data.secrets ?? '',
      attitude: data.attitude ?? 'neutral',
      locationId: data.locationId ?? undefined,
      isActive: true,
    },
  });
  return assignVoiceToNpcRecord(npc);
}
