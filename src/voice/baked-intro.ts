import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { buildOpeningVoiceScript, INTRO_LOCATION, INTRO_SCENE, INTRO_NPCS } from '../campaign/intro.js';
import { config } from '../config/index.js';
import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { fallbackVoicePick, filterNpcCastingVoices, OFFLINE_VOICE_POOL } from './voice-registry.js';
import { getNarratorVoiceId, getNpcCastingVoices, castVoiceForNpc } from './npc-voice-service.js';

export const BAKED_INTRO_ID = 'mistharbor-opening';
export const BAKED_INTRO_AUDIO = `${BAKED_INTRO_ID}.mp3`;
export const BAKED_INTRO_MANIFEST = `${BAKED_INTRO_ID}.manifest.json`;

export interface BakedIntroManifest {
  version: 2;
  scriptHash: string;
  profileHash: string;
  bakeSessionId?: string;
  narratorVoiceId: string;
  npcVoices: Record<string, string>;
  npcVoiceLabels: Record<string, string>;
  ambienceEnabled: boolean;
  ambienceMixed: boolean;
  generatedAt: string;
}

export interface BakedIntroAssets {
  playPath: string;
  manifest: BakedIntroManifest;
}

function bakedDir(): string {
  return config.voice.bakedIntroDir;
}

/** Hash of the generic-crowd voice script — invalidates baked audio when intro text changes. */
export function openingScriptHash(): string {
  const segments = buildOpeningVoiceScript();
  return createHash('sha256').update(JSON.stringify(segments)).digest('hex').slice(0, 16);
}

/** Includes TTS models + voice IDs so rebakes happen when delivery settings change. */
export function bakedIntroProfileHash(): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        scriptHash: openingScriptHash(),
        narratorVoiceId: getNarratorVoiceId(),
        narratorModel: config.voice.narratorTtsModelId || config.voice.ttsModelId,
        npcModel: config.voice.npcTtsModelId,
        emotions: config.voice.emotionsEnabled,
    deliveryVersion: '2026-06-21-chronicler-tags-v1',
    voiceCastVersion: '2026-06-21-system-v1',
        introNpcVoiceIds: config.voice.introNpcVoiceIds,
        ambienceVolume: config.voice.ambienceVolume,
        speechVolume: config.voice.speechVolume,
        spotSfxEnabled: config.voice.spotSfxEnabled,
        narrationPauseMs: config.voice.narrationPauseMs,
        audioOutputFormat: config.voice.audioOutputFormat,
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

/** Character-aware voices for intro NPC lines (used when baking and when seeding DB). */
export async function introNpcVoiceMap(): Promise<
  Record<string, { voiceId: string; voiceLabel: string }>
> {
  const narratorId = getNarratorVoiceId();
  const pool = await getNpcCastingVoices();
  const voicePool = pool.length ? pool : filterNpcCastingVoices(OFFLINE_VOICE_POOL);
  const usedIds = [narratorId];
  const map: Record<string, { voiceId: string; voiceLabel: string }> = {};

  const introSpeakers = INTRO_NPCS.filter((npc) =>
    buildOpeningVoiceScript().some((seg) => seg.npcName === npc.name),
  );

  for (const npc of introSpeakers) {
    const override =
      npc.name === 'Captain Mira Thornvale'
        ? config.voice.introNpcVoiceIds['Captain Mira Thornvale']?.trim()
        : npc.name === 'Sister Caldra Venn'
          ? config.voice.introNpcVoiceIds['Sister Caldra Venn']?.trim()
          : '';
    if (override) {
      map[npc.name] = { voiceId: override, voiceLabel: `${npc.name} (override)` };
      usedIds.push(override);
      continue;
    }

    try {
      const cast = await castVoiceForNpc(
        {
          name: npc.name,
          description: npc.description,
          visualDescription: npc.visualDescription,
          attitude: npc.attitude,
          goals: npc.goals,
          gender: npc.gender,
        },
        voicePool,
        usedIds,
      );
      map[npc.name] = { voiceId: cast.voiceId, voiceLabel: cast.voiceLabel };
      usedIds.push(cast.voiceId);
    } catch (err) {
      logger.warn(`Intro voice cast failed for ${npc.name}`, err);
      const fallback = fallbackVoicePick(npc, voicePool, usedIds);
      if (fallback) {
        map[npc.name] = { voiceId: fallback.voiceId, voiceLabel: fallback.name };
        usedIds.push(fallback.voiceId);
      }
    }
  }

  return map;
}

async function readManifest(): Promise<BakedIntroManifest | null> {
  try {
    const raw = await readFile(join(bakedDir(), BAKED_INTRO_MANIFEST), 'utf8');
    return JSON.parse(raw) as BakedIntroManifest;
  } catch {
    return null;
  }
}

/** True when shipped/baked prologue mp3 exists and matches the current intro script + narrator voice. */
export async function isBakedIntroReady(): Promise<boolean> {
  if (!config.voice.bakedIntroEnabled) return false;

  const manifest = await readManifest();
  if (!manifest) return false;
  if (manifest.scriptHash !== openingScriptHash()) return false;
  if (manifest.profileHash !== bakedIntroProfileHash()) return false;
  if (manifest.narratorVoiceId !== getNarratorVoiceId()) return false;

  try {
    await access(join(bakedDir(), BAKED_INTRO_AUDIO));
    return true;
  } catch {
    return false;
  }
}

export async function resolveBakedIntroVoice(): Promise<BakedIntroAssets | null> {
  if (!(await isBakedIntroReady())) return null;

  const manifest = await readManifest();
  if (!manifest) return null;

  const playPath = join(bakedDir(), BAKED_INTRO_AUDIO);
  logger.info(
    `Opening voice: baked prologue ${BAKED_INTRO_AUDIO} (generated ${manifest.generatedAt}${manifest.bakeSessionId ? `, session ${manifest.bakeSessionId.slice(0, 12)}` : ''})`,
  );
  return { playPath, manifest };
}

/** Pin intro NPC voices in DB so later dialogue matches the baked prologue cast. */
export async function seedIntroNpcVoices(campaignId: string, manifest: BakedIntroManifest): Promise<void> {
  for (const [name, voiceId] of Object.entries(manifest.npcVoices)) {
    const label = manifest.npcVoiceLabels[name] ?? 'intro';
    const updated = await prisma.nPC.updateMany({
      where: { campaignId, name },
      data: { elevenLabsVoiceId: voiceId, voiceLabel: label },
    });
    if (updated.count > 0) {
      logger.debug(`Intro voice seed: ${name} → ${label}`);
    }
  }
}

export function bakedIntroAmbienceContext() {
  return {
    locationName: INTRO_LOCATION.name,
    locationSlug: INTRO_LOCATION.slug,
    mood: INTRO_LOCATION.mood,
    sceneMood: INTRO_SCENE.mood,
    description: INTRO_LOCATION.description,
    visualDescription: INTRO_LOCATION.visualDescription,
    currentChanges: '',
  };
}
