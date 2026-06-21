import { prisma } from '../db/client.js';
import { config } from '../config/index.js';
import {
  buildOpeningVoiceScript,
  INTRO_LOCATION,
  INTRO_SCENE,
  INTRO_NPCS,
  type OpeningPartyContext,
  type OpeningVoiceSegment,
} from '../campaign/intro.js';
import { buildSpeechDeliveryContext } from './npc-speech-style.js';
import { buildAmbienceContext } from './ambience-context.js';
import type { AmbienceContext } from './ambience-context.js';
import { ensureAmbienceLoop } from './ambience-cache.js';
import { concatSpeechFiles } from './audio-mixer.js';
import { buildLayeredNarrationTrack } from './narration-audio.js';
import { resolveBakedIntroVoice, seedIntroNpcVoices } from './baked-intro.js';
import {
  assignVoicesForCampaign,
  getNarratorVoiceId,
  recastNpcVoiceByName,
} from './npc-voice-service.js';
import { createElevenLabsClient, ElevenLabsClient } from './elevenlabs-client.js';
import { prepareSpeechForTts, type SpeechDeliveryContext } from './speech-delivery.js';
import { voiceManager } from './voice-manager.js';
import { logger } from '../utils/logger.js';

interface OpeningLocation {
  id: string;
  name: string;
  slug: string;
  description: string;
  visualDescription: string;
  mood: string;
  currentChanges: string;
}

export interface PreparedOpeningVoice {
  playPath: string;
  campaignId: string;
  ambience?: AmbienceContext;
  segmentCount: number;
  /** Speech track already includes ambience bed mixed under narration. */
  ambienceMixed?: boolean;
}

async function renderSegmentSpeech(
  client: ElevenLabsClient,
  campaignId: string,
  seg: OpeningVoiceSegment,
  deliveryBase: SpeechDeliveryContext,
  byName: Map<string, { elevenLabsVoiceId: string; attitude: string }>,
): Promise<string | null> {
  if (seg.kind === 'narrator') {
    const prepared = prepareSpeechForTts(
      seg.text,
      { ...deliveryBase, isNpc: false },
      config.voice.maxCharsPerLine,
    );
    return client.textToSpeechCached(prepared.text, getNarratorVoiceId(), {
      modelId: prepared.modelId,
      voiceSettings: prepared.voiceSettings,
    });
  }

  const npc = byName.get(seg.npcName ?? '');
  if (!npc?.elevenLabsVoiceId) {
    logger.warn(`Opening voice skip NPC line — no cast for ${seg.npcName ?? 'unknown'}`);
    return null;
  }

  const prepared = prepareSpeechForTts(
    seg.text,
    {
      ...buildSpeechDeliveryContext(
        INTRO_NPCS.find((n) => n.name === seg.npcName) ?? {
          name: seg.npcName ?? 'NPC',
          description: '',
          attitude: seg.attitude ?? npc.attitude,
        },
        {
          sceneMood: deliveryBase.sceneMood,
          controllerAction: deliveryBase.controllerAction,
        },
      ),
      npcAttitude: seg.attitude ?? npc.attitude,
    },
    config.voice.maxCharsPerLine,
  );

  try {
    return await client.textToSpeechCached(prepared.text, npc.elevenLabsVoiceId, {
      modelId: prepared.modelId,
      voiceSettings: prepared.voiceSettings,
    });
  } catch (err) {
    if (!ElevenLabsClient.isVoiceAccessDenied(err) || !seg.npcName) throw err;

    const recast = await recastNpcVoiceByName(campaignId, seg.npcName, npc.elevenLabsVoiceId);
    if (!recast?.voiceId) throw err;

    byName.set(seg.npcName, { elevenLabsVoiceId: recast.voiceId, attitude: npc.attitude });
    logger.info(`Opening voice retry: ${seg.npcName} → ${recast.voiceLabel}`);
    return client.textToSpeechCached(prepared.text, recast.voiceId, {
      modelId: prepared.modelId,
      voiceSettings: prepared.voiceSettings,
    });
  }
}

/** Render intro TTS + ambience mix. Call playCampaignOpeningVoice right after posting text. */
export async function prepareCampaignOpeningVoice(
  guildId: string,
  campaignId: string,
  location: OpeningLocation,
  party?: OpeningPartyContext,
): Promise<PreparedOpeningVoice | null> {
  if (!config.voice.enabled || !voiceManager.isEnabled()) return null;
  if (!voiceManager.isConnected(guildId)) {
    logger.info('Opening voice skip: bot not in VC — run `/voice join` before `/campaign start`');
    return null;
  }
  if (!(await voiceManager.waitForReady(guildId))) {
    logger.warn('Opening voice skip: Discord voice link not ready');
    return null;
  }

  const client = createElevenLabsClient();
  if (!client) return null;

  const baked = await resolveBakedIntroVoice();
  if (baked) {
    void assignVoicesForCampaign(campaignId).catch((err) =>
      logger.warn('Background NPC voice assign failed', err),
    );
    void seedIntroNpcVoices(campaignId, baked.manifest).catch((err) =>
      logger.warn('Intro NPC voice seed failed', err),
    );

    const ambience = buildAmbienceContext(
      {
        location: {
          id: location.id,
          name: location.name,
          slug: location.slug,
          description: location.description,
          visualDescription: location.visualDescription,
          mood: location.mood,
          currentChanges: location.currentChanges,
        },
        scene: { mood: INTRO_SCENE.mood },
      },
      location.slug,
    );

    return {
      playPath: baked.playPath,
      campaignId,
      ambience: ambience ?? undefined,
      segmentCount: buildOpeningVoiceScript().length,
      ambienceMixed: baked.manifest.ambienceMixed,
    };
  }

  const ambience = buildAmbienceContext(
    {
      location: {
        id: location.id,
        name: location.name,
        slug: location.slug,
        description: location.description,
        visualDescription: location.visualDescription,
        mood: location.mood,
        currentChanges: location.currentChanges,
      },
      scene: { mood: INTRO_SCENE.mood },
    },
    location.slug,
  );

  const ambiencePathPromise =
    config.voice.ambienceEnabled && ambience
      ? ensureAmbienceLoop(campaignId, ambience)
      : Promise.resolve(null);

  await assignVoicesForCampaign(campaignId);
  const [npcRows, ambiencePath] = await Promise.all([
    prisma.nPC.findMany({
      where: { campaignId, isActive: true },
      select: { name: true, elevenLabsVoiceId: true, voiceLabel: true, attitude: true },
    }),
    ambiencePathPromise,
  ]);

  if (ambiencePath) {
    logger.info(`Opening ambience ready: ${ambience?.locationName ?? 'scene'}`);
  } else if (config.voice.ambienceEnabled) {
    logger.warn('Opening ambience unavailable — prologue speech only');
  }

  const byName = new Map(npcRows.map((n) => [n.name, n]));
  const deliveryBase: SpeechDeliveryContext = {
    sceneMood: INTRO_SCENE.mood,
    controllerAction: 'START_SCENE',
  };
  const segments = buildOpeningVoiceScript(party);

  logger.info(
    `Opening voice: rendering ${segments.length} segments (${npcRows.filter((n) => n.elevenLabsVoiceId).length} NPC voices cast)`,
  );

  const rendered = await Promise.all(
    segments.map(async (seg, index) => {
      try {
        const path = await renderSegmentSpeech(client, campaignId, seg, deliveryBase, byName);
        if (!path) {
          logger.warn(`Opening voice: segment ${index + 1}/${segments.length} (${seg.kind}) produced no audio`);
        }
        return path;
      } catch (err) {
        logger.warn(`Opening voice: segment ${index + 1}/${segments.length} failed`, err);
        return null;
      }
    }),
  );
  const speechPaths = rendered.filter((p): p is string => Boolean(p));

  if (speechPaths.length === 0) {
    logger.warn('Opening voice: no speech segments rendered');
    return null;
  }

  if (speechPaths.length < segments.length) {
    logger.warn(`Opening voice: only ${speechPaths.length}/${segments.length} segments rendered`);
  }

  const segmentInputs: Array<{ speechPath: string; text: string; pauseAfterMs?: number }> = [];
  for (let i = 0; i < segments.length; i++) {
    const path = rendered[i];
    if (path) {
      segmentInputs.push({
        speechPath: path,
        text: segments[i]!.text,
        pauseAfterMs: segments[i]!.pauseAfterMs,
      });
    }
  }

  const speechOnly =
    segmentInputs.length > 1
      ? await concatSpeechFiles(
          segmentInputs.map((s) => s.speechPath),
          {
            pauseAfterMs: segmentInputs
              .slice(0, -1)
              .map((s) => s.pauseAfterMs ?? config.voice.narrationPauseMs),
          },
        )
      : segmentInputs[0]!.speechPath;

  logger.info(
    `Opening voice: layering ${segmentInputs.length} segments (normalize + spot SFX per clip)`,
  );
  const playPath = await buildLayeredNarrationTrack(
    segmentInputs,
    config.voice.ambienceEnabled ? ambiencePath : null,
  );

  logger.info(`Opening voice prepared — ${playPath} (${speechPaths.length} segments)`);
  return {
    playPath,
    campaignId,
    ambience: ambience ?? undefined,
    segmentCount: speechPaths.length,
    ambienceMixed: Boolean(
      config.voice.ambienceEnabled && ambiencePath && playPath !== speechOnly,
    ),
  };
}

/** Start VC playback — call immediately after the opening text message is sent. */
export function playCampaignOpeningVoice(guildId: string, prepared: PreparedOpeningVoice): void {
  logger.info(
    `Opening voice playing (${prepared.segmentCount} segments${prepared.ambienceMixed ? ', ambience mixed in' : ''})`,
  );
  voiceManager.playNarrationFile(guildId, prepared.playPath, {
    campaignId: prepared.campaignId,
    ambience: prepared.ambience,
    ambienceMixed: prepared.ambienceMixed,
    resumeBedAfter: true,
  });
}

/** Prepare + play without text sync (legacy). Prefer prepare/play from campaign start. */
export async function speakCampaignOpening(
  guildId: string,
  campaignId: string,
  location: OpeningLocation,
  party?: OpeningPartyContext,
): Promise<void> {
  const prepared = await prepareCampaignOpeningVoice(guildId, campaignId, location, party);
  if (prepared) playCampaignOpeningVoice(guildId, prepared);
}
