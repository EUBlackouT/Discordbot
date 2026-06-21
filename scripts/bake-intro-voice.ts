/**
 * Render the Mistharbor prologue to assets/voice/baked/.
 * By default re-requests ALL segments from ElevenLabs and rebuilds all ffmpeg layers.
 * Spot SFX + ambience bed timing are preserved (same cues, fresh speech underneath).
 *
 * Usage:
 *   npm run bake:intro          # full rebake (all 10 TTS calls + restitch)
 *   npm run bake:intro -- --use-cache   # reuse cached TTS mp3s when prompts match
 */
import '../src/config/load-env.js';
import { mkdir, writeFile, copyFile, unlink, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { config } from '../src/config/index.js';
import { buildOpeningVoiceScript, INTRO_LOCATION, INTRO_SCENE, INTRO_NPCS } from '../src/campaign/intro.js';
import { buildSpeechDeliveryContext } from '../src/voice/npc-speech-style.js';
import { buildAmbienceContext } from '../src/voice/ambience-context.js';
import { resolveAmbienceSpec } from '../src/voice/ambience-resolver.js';
import { resolveLibraryBed } from '../src/voice/audio-library.js';
import { createElevenLabsClient } from '../src/voice/elevenlabs-client.js';
import { buildLayeredNarrationTrack } from '../src/voice/narration-audio.js';
import {
  BAKED_INTRO_AUDIO,
  BAKED_INTRO_ID,
  BAKED_INTRO_MANIFEST,
  bakedIntroProfileHash,
  introNpcVoiceMap,
  openingScriptHash,
  type BakedIntroManifest,
} from '../src/voice/baked-intro.js';
import { getNarratorVoiceId } from '../src/voice/npc-voice-service.js';
import { prepareSpeechForTts, type SpeechDeliveryContext } from '../src/voice/speech-delivery.js';

const deliveryBase: SpeechDeliveryContext = {
  sceneMood: INTRO_SCENE.mood,
  controllerAction: 'START_SCENE',
};

function previewTts(text: string, max = 140): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

async function main(): Promise<void> {
  if (!config.voice.elevenLabsApiKey.trim()) {
    console.error('ELEVENLABS_API_KEY is required');
    process.exit(1);
  }

  const client = createElevenLabsClient();
  if (!client) {
    console.error('Could not create ElevenLabs client');
    process.exit(1);
  }

  const outDir = config.voice.bakedIntroDir;
  await mkdir(outDir, { recursive: true });

  const dest = join(outDir, BAKED_INTRO_AUDIO);
  const tempDest = join(outDir, `${BAKED_INTRO_ID}.baking.mp3`);

  const narratorId = getNarratorVoiceId();
  const npcVoices = await introNpcVoiceMap();
  const segments = buildOpeningVoiceScript();
  const segmentInputs: Array<{ speechPath: string; text: string; pauseAfterMs?: number }> = [];

  const useCache = process.argv.includes('--use-cache');
  const fullRebake = !useCache;
  const bakeSessionId = `${bakedIntroProfileHash()}-${Date.now()}-${randomBytes(4).toString('hex')}`;

  console.log(
    `Full intro rebake: ${segments.length} ElevenLabs TTS requests (${fullRebake ? 'ALL fresh API calls' : 'cache ok'})…`,
  );
  console.log(`Bake session: ${bakeSessionId}`);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const isNpc = seg.kind === 'npc';
    const npc = seg.npcName ? npcVoices[seg.npcName] : undefined;
    const voiceId = isNpc ? npc?.voiceId : narratorId;

    if (!voiceId) {
      console.error(`No voice for segment ${i + 1} (${seg.npcName ?? 'narrator'})`);
      process.exit(1);
    }

    const deliveryCtx =
      isNpc && seg.npcName
        ? buildSpeechDeliveryContext(
            INTRO_NPCS.find((n) => n.name === seg.npcName) ?? {
              name: seg.npcName,
              description: '',
              attitude: seg.attitude ?? 'neutral',
            },
            deliveryBase,
          )
        : { ...deliveryBase, isNpc: false };

    const prepared = prepareSpeechForTts(seg.text, deliveryCtx, config.voice.maxCharsPerLine);

    console.log(
      `  [${i + 1}/${segments.length}] ${seg.kind}${seg.npcName ? ` (${seg.npcName})` : ''} emotion=${prepared.emotion} model=${prepared.modelId}`,
    );
    console.log(`    → ${previewTts(prepared.text, 200)}`);

    const path = await client.textToSpeechCached(prepared.text, voiceId, {
      modelId: prepared.modelId,
      voiceSettings: prepared.voiceSettings,
      force: fullRebake,
      cacheBust: fullRebake ? bakeSessionId : undefined,
    });
    segmentInputs.push({ speechPath: path, text: seg.text, pauseAfterMs: seg.pauseAfterMs });
  }

  let playPath = segmentInputs[0]!.speechPath;
  let ambienceMixed = false;
  let ambiencePath: string | null = null;

  if (config.voice.ambienceEnabled) {
    const ambienceCtx = buildAmbienceContext(
      {
        location: {
          id: 'baked-intro',
          name: INTRO_LOCATION.name,
          slug: INTRO_LOCATION.slug,
          description: INTRO_LOCATION.description,
          visualDescription: INTRO_LOCATION.visualDescription,
          mood: INTRO_LOCATION.mood,
          currentChanges: '',
        },
        scene: { mood: INTRO_SCENE.mood },
      },
      INTRO_LOCATION.slug,
    );
    const spec = resolveAmbienceSpec(ambienceCtx);
    ambiencePath = await resolveLibraryBed(spec.label);
    if (!ambiencePath) {
      ambiencePath = join(outDir, 'mistharbor-execution-yard-ambience.mp3');
      try {
        await access(ambiencePath);
        console.log(`Using cached intro bed (${spec.label})`);
      } catch {
        console.log(`Generating ambience bed (${spec.label})…`);
        const ambienceBuf = await client.generateSoundEffect(spec.prompt, spec.durationSeconds, true);
        await writeFile(ambiencePath, ambienceBuf);
      }
    } else {
      console.log(`Using library bed (${spec.label}) — speech layers rebuilt fresh`);
    }
  }

  console.log('Restitching: per-segment spot SFX + loudness + paragraph gaps + ambience bed…');
  playPath = await buildLayeredNarrationTrack(segmentInputs, ambiencePath, {
    sessionId: bakeSessionId,
    rebuild: fullRebake,
  });
  ambienceMixed = Boolean(ambiencePath);

  await copyFile(playPath, tempDest);

  const manifest: BakedIntroManifest = {
    version: 2,
    scriptHash: openingScriptHash(),
    profileHash: bakedIntroProfileHash(),
    bakeSessionId,
    narratorVoiceId: narratorId,
    npcVoices: Object.fromEntries(Object.entries(npcVoices).map(([k, v]) => [k, v.voiceId])),
    npcVoiceLabels: Object.fromEntries(Object.entries(npcVoices).map(([k, v]) => [k, v.voiceLabel])),
    ambienceEnabled: config.voice.ambienceEnabled,
    ambienceMixed,
    generatedAt: new Date().toISOString(),
  };

  await writeFile(join(outDir, BAKED_INTRO_MANIFEST), JSON.stringify(manifest, null, 2), 'utf8');
  await copyFile(tempDest, dest);
  try {
    await unlink(tempDest);
  } catch {
    // ignore
  }

  console.log(`\nDone → ${dest}`);
  console.log(`Script hash: ${manifest.scriptHash} | profile: ${manifest.profileHash}`);
  console.log(`Ambience mixed: ${ambienceMixed} | Spot SFX: ${config.voice.spotSfxEnabled}`);
  console.log('Restart the bot — `/campaign start` will use this file instantly.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
