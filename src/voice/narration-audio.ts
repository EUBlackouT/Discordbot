import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { AudioMixCacheOptions } from './audio-mixer.js';
import {
  concatSpeechFiles,
  mixSpeechWithAmbience,
  mixSpotSfxIntoSpeech,
  normalizeSpeechLoudness,
  probeDurationSeconds,
} from './audio-mixer.js';
import {
  ensureSpotSfxFile,
  estimateSpotOffsetSeconds,
} from './scene-sfx.js';
import { resolveNarrationSfxPlacements } from './narration-sfx-resolver.js';

export interface NarrationAudioContext {
  locationName?: string;
  sceneMood?: string;
}

async function mixSpotsIntoClip(
  speechPath: string,
  narrationText: string,
  maxCues: number,
  cache?: AudioMixCacheOptions,
  audioContext?: NarrationAudioContext,
): Promise<string> {
  if (!config.voice.spotSfxEnabled || !narrationText.trim()) return speechPath;

  const placements = await resolveNarrationSfxPlacements(narrationText, maxCues, audioContext);
  if (placements.length === 0) return speechPath;

  const duration = await probeDurationSeconds(speechPath);
  const timed: Array<{ path: string; offsetSec: number; volume: number }> = [];

  for (const placement of placements) {
    const sfxPath = await ensureSpotSfxFile(placement.cue);
    if (!sfxPath) continue;
    timed.push({
      path: sfxPath,
      offsetSec: estimateSpotOffsetSeconds(placement.charIndex, narrationText.length, duration),
      volume: placement.cue.volume * config.voice.spotSfxVolume,
    });
  }

  if (timed.length === 0) return speechPath;
  logger.debug(`Mixing ${timed.length} spot SFX into clip (${timed.map((t) => t.path).join(', ')})`);
  return mixSpotSfxIntoSpeech(speechPath, timed, cache);
}

/** Per-segment: loudness match + contextual spot SFX (accurate timing). */
export async function enrichSpeechSegment(
  speechPath: string,
  segmentText: string,
  cache?: AudioMixCacheOptions,
): Promise<string> {
  let path = await normalizeSpeechLoudness(speechPath, cache);
  path = await mixSpotsIntoClip(path, segmentText, config.voice.spotSfxMaxPerSegment, cache);
  return path;
}

/** Multi-segment intro/campaign clip: normalize + spots per segment, concat, then ambience bed. */
export async function buildLayeredNarrationTrack(
  segments: Array<{ speechPath: string; text: string; pauseAfterMs?: number }>,
  ambiencePath: string | null,
  mixCache?: AudioMixCacheOptions,
): Promise<string> {
  const processed: string[] = [];
  for (const seg of segments) {
    processed.push(await enrichSpeechSegment(seg.speechPath, seg.text, mixCache));
  }

  const pauseAfterMs = segments.slice(0, -1).map((seg) => seg.pauseAfterMs ?? config.voice.narrationPauseMs);
  let track =
    processed.length > 1
      ? await concatSpeechFiles(processed, { pauseAfterMs, cache: mixCache })
      : processed[0]!;
  track = await normalizeSpeechLoudness(track, mixCache);

  if (config.voice.ambienceEnabled && ambiencePath) {
    track = await mixSpeechWithAmbience(track, ambiencePath, mixCache);
  }

  return track;
}

/** Layer spot SFX then ambience bed under a single narration clip (live turns). */
export async function enrichNarrationAudio(
  speechPath: string,
  narrationText: string,
  ambiencePath: string | null,
  audioContext?: NarrationAudioContext,
): Promise<string> {
  let path = await normalizeSpeechLoudness(speechPath);
  path = await mixSpotsIntoClip(path, narrationText, config.voice.spotSfxMaxPerClip, undefined, audioContext);

  if (config.voice.ambienceEnabled && ambiencePath) {
    path = await mixSpeechWithAmbience(path, ambiencePath);
  }

  return path;
}
