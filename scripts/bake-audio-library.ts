/**
 * Generate shipped ambience beds + spot SFX to assets/audio-library/ (192kbps).
 * Run once locally or in CI, commit the folder, deploy to VPS — no API calls at runtime.
 *
 * Usage: npm run bake:audio-library
 */
import '../src/config/load-env.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config/index.js';
import {
  AMBIENCE_BED_ARCHETYPES,
  ambienceBedSpecForArchetype,
} from '../src/voice/ambience-resolver.js';
import { SPOT_SFX_CUES } from '../src/voice/scene-sfx.js';
import { createElevenLabsClient } from '../src/voice/elevenlabs-client.js';
import type { AudioLibraryManifest } from '../src/voice/audio-library.js';

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

  const root = config.voice.audioLibraryDir;
  const bedsDir = join(root, 'beds');
  const spotsDir = join(root, 'spots');
  await mkdir(bedsDir, { recursive: true });
  await mkdir(spotsDir, { recursive: true });

  const format = config.voice.audioOutputFormat;
  console.log(`Baking audio library @ ${format} → ${root}\n`);

  const bakedBeds: string[] = [];
  for (const archetype of AMBIENCE_BED_ARCHETYPES) {
    const spec = ambienceBedSpecForArchetype(archetype);
    const dest = join(bedsDir, `${archetype}.mp3`);
    console.log(`  bed [${archetype}]…`);
    const buf = await client.generateSoundEffect(spec.prompt, spec.durationSeconds, true, format);
    await writeFile(dest, buf);
    bakedBeds.push(archetype);
  }

  const bakedSpots: string[] = [];
  for (const cue of SPOT_SFX_CUES) {
    const dest = join(spotsDir, `${cue.id}.mp3`);
    console.log(`  spot [${cue.id}]…`);
    const buf = await client.generateSoundEffect(cue.prompt, cue.durationSeconds, false, format);
    await writeFile(dest, buf);
    bakedSpots.push(cue.id);
  }

  const manifest: AudioLibraryManifest = {
    version: 1,
    outputFormat: format,
    generatedAt: new Date().toISOString(),
    beds: bakedBeds,
    spots: bakedSpots,
  };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nDone — ${bakedBeds.length} beds, ${bakedSpots.length} spot SFX`);
  console.log('Commit assets/audio-library/ then run: npm run bake:intro -- --fresh');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
