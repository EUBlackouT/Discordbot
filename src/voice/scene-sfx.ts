import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createElevenLabsClient } from './elevenlabs-client.js';
import { resolveLibrarySpot } from './audio-library.js';

export interface SpotSfxCue {
  id: string;
  patterns: RegExp[];
  prompt: string;
  durationSeconds: number;
  /** Relative loudness 0–1 under speech */
  volume: number;
}

/** Quiet contextual one-shots triggered by narration text (max 3 per clip). */
export const SPOT_SFX_CUES: SpotSfxCue[] = [
  {
    id: 'bell',
    patterns: [/\bbell(s)?\b/i, /\bbell finally hits/i, /\bbell hangs/i],
    prompt: 'Single small brass hand bell clang on wet cobblestones, clear, brief, no voice',
    durationSeconds: 1.6,
    volume: 0.72,
  },
  {
    id: 'retch',
    patterns: [/\bretch(ing|es)?\b/i, /\bvomit/i],
    prompt: 'Person retching on stone pavement, muffled, unpleasant, brief, crowd nearby',
    durationSeconds: 2,
    volume: 0.52,
  },
  {
    id: 'manacles',
    patterns: [/\bmanacles?\b.*\bclang/i, /\bclang.*\bmanacles/i, /\bmanacles clang/i],
    prompt: 'Iron manacles clanging on wooden scaffold boards, metallic, brief',
    durationSeconds: 1.2,
    volume: 0.58,
  },
  {
    id: 'crowd_scream',
    patterns: [/\bscreams?\b/i, /\bsquare detonates/i, /\briot\b/i],
    prompt: 'Frightened crowd screams swelling in a stone square, panicked, brief but loud',
    durationSeconds: 3.5,
    volume: 0.82,
  },
  {
    id: 'gates',
    patterns: [/\bgates?\b.*\b(grind|shut|close)/i, /\bgrind shut\b/i],
    prompt: 'Heavy iron gates grinding shut on stone hinges, slow, ominous, brief',
    durationSeconds: 2.2,
    volume: 0.4,
  },
  {
    id: 'horse',
    patterns: [/\bhorse\b/i, /\bhooves?\b/i, /\bdrives her horse\b/i],
    prompt: 'Horse hooves on wet cobblestones pushing through a panicked crowd, brief',
    durationSeconds: 2,
    volume: 0.38,
  },
  {
    id: 'birds',
    patterns: [/\bbirds?\b/i, /\bgulls?\b/i, /\bchirp(ing|s)?\b/i, /\bowl\b/i],
    prompt: 'Soft distant birds and gulls, forest or harbor, gentle, brief',
    durationSeconds: 2.5,
    volume: 0.16,
  },
  {
    id: 'fire',
    patterns: [/\bpale fire\b/i, /\bsigil\b/i, /\bghost-light\b/i],
    prompt: 'Brief supernatural pale fire whoosh in storm clouds, magical, not explosive',
    durationSeconds: 2,
    volume: 0.18,
  },
  {
    id: 'sword',
    patterns: [/\bclash(ing)? steel\b/i, /\bsword(s)?\b/i, /\bblade(s)?\b/i],
    prompt: 'Distant muffled sword clash, brief, not close mic',
    durationSeconds: 1.5,
    volume: 0.22,
  },
  {
    id: 'pulse',
    patterns: [
      /\bpuls(e|ing)\b/i,
      /\bthrob(bing)?\b/i,
      /\bheartbeat\b/i,
      /\brhythmic\b.*\b(hum|beat|pulse)/i,
    ],
    prompt: 'Low rhythmic magical pulse, soft throbbing energy, brief, under dialogue',
    durationSeconds: 2.5,
    volume: 0.38,
  },
  {
    id: 'energy_hum',
    patterns: [
      /\b(hum(ming)?|buzz(ing)?)\b.*\b(energy|magic|arcane|residue|sigil)/i,
      /\b(energy|magic|arcane|residue|sigil)\b.*\b(hum(ming)?|buzz(ing)?|radiat)/i,
      /\bresidue\b/i,
      /\barcane\b/i,
    ],
    prompt: 'Soft magical energy hum and faint crackle, mystical, brief, not loud',
    durationSeconds: 2.2,
    volume: 0.32,
  },
  {
    id: 'chain',
    patterns: [/\bchain(s)?\b/i, /\bshackle(s)?\b/i, /\biron\b.*\b(bind|bound)/i],
    prompt: 'Iron chains or shackles rattling briefly, metallic, close but not harsh',
    durationSeconds: 1.4,
    volume: 0.48,
  },
  {
    id: 'magic_whoosh',
    patterns: [
      /\bwhoosh\b/i,
      /\bspark(s|ing)?\b/i,
      /\bflare\b/i,
      /\bghost-light\b/i,
      /\bsupernatural\b/i,
    ],
    prompt: 'Brief supernatural magic whoosh or spark, airy, not explosive',
    durationSeconds: 1.8,
    volume: 0.28,
  },
];

export interface SpotSfxPlacement {
  cue: SpotSfxCue;
  charIndex: number;
}

export function findSpotSfxPlacements(text: string, maxCues = 3): SpotSfxPlacement[] {
  const found: SpotSfxPlacement[] = [];
  const usedIds = new Set<string>();

  for (const cue of SPOT_SFX_CUES) {
    if (usedIds.has(cue.id)) continue;
    for (const pattern of cue.patterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        found.push({ cue, charIndex: match.index });
        usedIds.add(cue.id);
        break;
      }
    }
  }

  return found.sort((a, b) => a.charIndex - b.charIndex).slice(0, maxCues);
}

function sfxCachePath(cueId: string, prompt: string): string {
  const hash = createHash('sha256').update(`${cueId}|${prompt}`).digest('hex').slice(0, 16);
  return join(config.voice.ambienceDir, '_sfx', `${cueId}-${hash}.mp3`);
}

export async function ensureSpotSfxFile(cue: SpotSfxCue): Promise<string | null> {
  if (!config.voice.spotSfxEnabled) return null;

  if (config.voice.preferAudioLibrary) {
    const library = await resolveLibrarySpot(cue.id);
    if (library) return library;
  }

  const client = createElevenLabsClient();
  if (!client) return null;

  const path = sfxCachePath(cue.id, cue.prompt);
  try {
    await access(path);
    return path;
  } catch {
    // generate
  }

  await mkdir(join(config.voice.ambienceDir, '_sfx'), { recursive: true });

  try {
    logger.debug(`Generating spot SFX [${cue.id}]`);
    const buf = await client.generateSoundEffect(cue.prompt, cue.durationSeconds, false);
    await writeFile(path, buf);
    return path;
  } catch (err) {
    logger.warn(`Spot SFX [${cue.id}] generation failed`, err);
    return null;
  }
}

export function estimateSpotOffsetSeconds(
  charIndex: number,
  textLength: number,
  speechDurationSec: number,
): number {
  if (textLength <= 0) return 0;
  const ratio = charIndex / textLength;
  return Math.max(0, Math.min(speechDurationSec * 0.92, ratio * speechDurationSec));
}
