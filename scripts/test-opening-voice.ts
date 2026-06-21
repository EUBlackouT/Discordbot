import '../src/config/load-env.js';
import { buildOpeningVoiceScript, INTRO_SCENE } from '../src/campaign/intro.js';
import { createElevenLabsClient } from '../src/voice/elevenlabs-client.js';
import { prepareSpeechForTts, type SpeechDeliveryContext } from '../src/voice/speech-delivery.js';
import { getNarratorVoiceId } from '../src/voice/npc-voice-service.js';
import { filterNpcCastingVoices } from '../src/voice/voice-registry.js';
import { readFileSync } from 'node:fs';
import { config } from '../src/config/index.js';
import { mixContinuousNarration, concatSpeechFiles } from '../src/voice/audio-mixer.js';
import { join } from 'node:path';

const deliveryBase: SpeechDeliveryContext = {
  sceneMood: INTRO_SCENE.mood,
  controllerAction: 'START_SCENE',
};

async function main(): Promise<void> {
  const client = createElevenLabsClient();
  if (!client) {
    console.error('No ElevenLabs client');
    process.exit(1);
  }

  const segments = buildOpeningVoiceScript();
  const speechPaths: string[] = [];
  const narratorId = getNarratorVoiceId();
  const cached = JSON.parse(readFileSync('assets/voice-cache/english-voices.json', 'utf8')).voices;
  const npcVoiceId = filterNpcCastingVoices(cached)[0]?.voiceId ?? narratorId;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const prepared = prepareSpeechForTts(
      seg.text,
      { ...deliveryBase, isNpc: seg.kind === 'npc', npcAttitude: seg.attitude },
      config.voice.maxCharsPerLine,
    );
    console.log(`\n[${i + 1}/${segments.length}] ${seg.kind} model=${prepared.modelId} chars=${prepared.text.length}`);
    console.log(`preview: ${prepared.text.slice(0, 80)}…`);
    try {
      const voiceId = seg.kind === 'narrator' ? narratorId : npcVoiceId;
      const path = await client.textToSpeechCached(prepared.text, voiceId, {
        modelId: prepared.modelId,
        voiceSettings: prepared.voiceSettings,
      });
      speechPaths.push(path);
      console.log(`OK → ${path}`);
    } catch (err) {
      console.error(`FAILED segment ${i + 1}:`, err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  console.log('\nConcat…');
  const concatPath = await concatSpeechFiles(speechPaths);
  console.log('Concat OK →', concatPath);

  const ambience = join(
    config.voice.ambienceDir,
    '9da02596-a083-40ca-8f6f-9ceb1faa352b',
    '9641ede8b8210b5d.mp3',
  );
  console.log('\nMix with ambience…');
  const mixed = await mixContinuousNarration(speechPaths, ambience);
  console.log('Mix OK →', mixed);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
