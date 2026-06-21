import { createHash } from 'node:crypto';
import { createAIProvider } from '../services/ai/index.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { NarrationSfxCue } from '../validation/schemas.js';
import {
  findSpotSfxPlacements,
  type SpotSfxCue,
  type SpotSfxPlacement,
} from './scene-sfx.js';

const ai = createAIProvider();

const SENSORY_KEYWORDS =
  /\b(puls(e|ing)|throb(bing)?|thrum(ming)?|hum(ming)?|buzz(ing)?|crackl(e|ing)|sizzl(e|ing)|whisper(ing)?|hiss(ing)?|drip(ping)?|howl(ing)?|rumble|thunder|heartbeat|energy|magical|arcane|residue|sigil|glow(ing)?|spark(s|ing)?|static|wind|rain|footsteps|chain(s)?|metal|wood|creak(ing)?|splash(ing)?|fire|flame|scream(s|ing)?|moan(ing)?|clang(ing)?|clink(ing)?|whoosh|roar(ing)?)\b/i;

const aiCueCache = new Map<string, SpotSfxPlacement[]>();

function cacheKey(text: string, maxCues: number): string {
  return createHash('sha256').update(`${text}|${maxCues}`).digest('hex').slice(0, 20);
}

function cueFromAi(aiCue: NarrationSfxCue): SpotSfxCue {
  const id = aiCue.id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 40) || 'ai_cue';
  return {
    id: `ai_${id}`,
    patterns: [],
    prompt: aiCue.prompt,
    durationSeconds: aiCue.duration_seconds,
    volume: aiCue.volume,
  };
}

function anchorIndex(text: string, anchorPhrase: string): number {
  const phrase = anchorPhrase.trim();
  if (!phrase) return 0;
  const idx = text.toLowerCase().indexOf(phrase.toLowerCase());
  return idx >= 0 ? idx : 0;
}

function mergePlacements(
  regex: SpotSfxPlacement[],
  aiPlacements: SpotSfxPlacement[],
  maxCues: number,
): SpotSfxPlacement[] {
  const merged = [...regex];
  const usedIds = new Set(regex.map((p) => p.cue.id));

  for (const placement of aiPlacements) {
    if (merged.length >= maxCues) break;
    if (usedIds.has(placement.cue.id)) continue;
    merged.push(placement);
    usedIds.add(placement.cue.id);
  }

  return merged.sort((a, b) => a.charIndex - b.charIndex).slice(0, maxCues);
}

function shouldAskAi(text: string, regexCount: number, maxCues: number): boolean {
  if (!config.voice.spotSfxAiEnabled) return false;
  if (regexCount >= maxCues) return false;
  if (!text.trim()) return false;
  return regexCount === 0 ? SENSORY_KEYWORDS.test(text) : SENSORY_KEYWORDS.test(text);
}

/** Regex cues first, then AI-generated one-shots for sensory narration the library missed. */
export async function resolveNarrationSfxPlacements(
  text: string,
  maxCues: number,
  context?: { locationName?: string; sceneMood?: string },
): Promise<SpotSfxPlacement[]> {
  const regexPlacements = findSpotSfxPlacements(text, maxCues);
  if (!shouldAskAi(text, regexPlacements.length, maxCues)) {
    return regexPlacements;
  }

  const key = cacheKey(text, maxCues);
  const cached = aiCueCache.get(key);
  if (cached) {
    return mergePlacements(regexPlacements, cached, maxCues);
  }

  try {
    const extracted = await ai.extractNarrationSfx({
      narrationText: text,
      locationName: context?.locationName,
      sceneMood: context?.sceneMood,
      maxCues: maxCues - regexPlacements.length,
    });

    const aiPlacements: SpotSfxPlacement[] = extracted.cues.map((cue) => ({
      cue: cueFromAi(cue),
      charIndex: anchorIndex(text, cue.anchor_phrase),
    }));

    aiCueCache.set(key, aiPlacements);
    if (aiCueCache.size > 200) {
      const first = aiCueCache.keys().next().value;
      if (first) aiCueCache.delete(first);
    }

    const merged = mergePlacements(regexPlacements, aiPlacements, maxCues);
    if (aiPlacements.length > 0) {
      logger.debug(
        `Narration SFX: ${regexPlacements.length} regex + ${aiPlacements.length} AI → ${merged.length} total`,
      );
    }
    return merged;
  } catch (err) {
    logger.warn('AI narration SFX extraction failed — regex only', err);
    return regexPlacements;
  }
}
