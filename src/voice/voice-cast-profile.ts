import type { NpcSpeaker } from '../campaign/npc-speech.js';
import { inferNpcGender, type NpcGender } from './voice-gender.js';
import type { RegistryVoice } from './voice-registry.js';

export type VoiceAgeHint = 'young' | 'middle-aged' | 'old';
export type VoiceToneHint =
  | 'authoritative'
  | 'commanding'
  | 'stern'
  | 'warm'
  | 'gentle'
  | 'fearful'
  | 'raspy'
  | 'urgent'
  | 'mysterious'
  | 'cheerful';

export interface VoiceCastProfile {
  gender: NpcGender;
  role?: string;
  archetype: string;
  /** One-sentence casting note sent to the AI casting director. */
  idealVoiceBrief: string;
  accentHints: string[];
  ageHints: VoiceAgeHint[];
  toneHints: VoiceToneHint[];
  avoidHints: VoiceToneHint[];
}

const TONE_KEYWORDS: Record<VoiceToneHint, RegExp> = {
  authoritative: /\b(authoritative|assertive|commanding|strong|confident|no-nonsense|direct|firm)\b/i,
  commanding: /\b(command|commander|captain|marshal|officer|sergeant|stern|tough|gravel|gruff)\b/i,
  stern: /\b(stern|hard|strict|disciplined|iron|severe|rough|crisp)\b/i,
  warm: /\b(warm|friendly|kind|soothing|comforting|reassuring|pleasant|welcoming)\b/i,
  gentle: /\b(gentle|soft|calm|tender|mellow|light|delicate)\b/i,
  fearful: /\b(nervous|anxious|scared|fearful|timid|shaky|uneasy|worried)\b/i,
  raspy: /\b(hoarse|raspy|rough|raw|gravelly|croak|weathered|cracked)\b/i,
  urgent: /\b(urgent|fast|energetic|intense|pressing|hasty|quick)\b/i,
  mysterious: /\b(mysterious|dark|deep|enigmatic|brooding|shadowy)\b/i,
  cheerful: /\b(cheerful|happy|upbeat|bright|bubbly|playful|excited)\b/i,
};

const VOICE_NAME_HINTS: Record<string, VoiceToneHint[]> = {
  sarah: ['warm', 'gentle'],
  alice: ['gentle', 'warm'],
  charlotte: ['mysterious', 'stern'],
  matilda: ['cheerful', 'warm'],
  laura: ['warm', 'cheerful'],
  freya: ['mysterious'],
  jessica: ['warm'],
  bill: ['raspy', 'authoritative'],
  brian: ['authoritative', 'commanding'],
  clyde: ['authoritative', 'stern'],
  michael: ['raspy', 'authoritative'],
  liam: ['urgent'],
  harry: ['fearful'],
  jeremy: ['gentle'],
  chris: ['authoritative'],
  charlie: ['warm'],
};

function npcHaystack(npc: {
  name?: string;
  description?: string;
  visualDescription?: string;
  attitude?: string;
  goals?: string;
}): string {
  return [npc.name, npc.description, npc.visualDescription, npc.attitude, npc.goals]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function inferAccentHints(hay: string): string[] {
  const hints: string[] = [];
  if (/\b(english|british|cliffside|seawall|harbor|harbour|port city|council|watch tabard)\b/i.test(hay)) {
    hints.push('english', 'british');
  }
  if (/\b(australian|outback)\b/i.test(hay)) hints.push('australian');
  if (/\b(southern|american|frontier)\b/i.test(hay)) hints.push('american');
  if (/\b(irish|celtic)\b/i.test(hay)) hints.push('irish');
  return [...new Set(hints)];
}

function buildArchetypeLabel(profile: VoiceCastProfile): string {
  const age = profile.ageHints[0] ?? 'adult';
  const gender = profile.gender === 'unknown' ? 'person' : profile.gender;
  if (profile.role === 'authority') return `${age} ${gender} authority figure`;
  if (profile.role === 'clergy') return `${age} ${gender} clergy`;
  if (profile.role === 'elder') return `elderly ${gender}`;
  if (profile.role === 'merchant') return `${age} ${gender} merchant`;
  return `${age} ${gender} npc`;
}

function buildIdealVoiceBrief(
  npc: NpcSpeaker & { visualDescription?: string },
  profile: VoiceCastProfile,
): string {
  const name = npc.name ?? 'This NPC';
  const accent =
    profile.accentHints.length > 0
      ? ` Prefer ${profile.accentHints.slice(0, 2).join(' or ')} accent if available.`
      : '';

  switch (profile.role) {
    case 'authority':
      return (
        `${name}: a hard-edged officer or commander who barks orders under pressure — clipped, stern, parade-ground authority with iron discipline.` +
        ` Must sound capable of shouting over a riot. Avoid warm, motherly, velvety, playful, or "customer service" voices.${accent}`
      );
    case 'clergy':
      if (profile.toneHints.includes('fearful')) {
        return (
          `${name}: a frightened but determined acolyte — breathless, urgent whispers in crowds, faith under strain.` +
          ` Not cheerful, not smug, not a calm teacher.${accent}`
        );
      }
      return `${name}: clergy with measured conviction — calm but not sleepy, earnest not performative.${accent}`;
    case 'elder':
      return (
        `${name}: weathered elder — hoarse, tired, lived-in voice; may crack under fear.` +
        ` Must read older than middle age.${accent}`
      );
    case 'merchant':
      return `${name}: worldly trader voice — smooth or sly, street-smart, not noble and not cartoonish.${accent}`;
    default:
      return `${name}: ${profile.toneHints.join(', ') || 'neutral'} delivery that fits a dark fantasy scene.${accent}`;
  }
}

export function inferVoiceCastProfile(
  npc: NpcSpeaker & { visualDescription?: string; gender?: string },
): VoiceCastProfile {
  const hay = npcHaystack(npc);
  const attitude = (npc.attitude ?? '').toLowerCase();
  const profile: VoiceCastProfile = {
    gender: inferNpcGender(npc),
    archetype: '',
    idealVoiceBrief: '',
    accentHints: inferAccentHints(hay),
    ageHints: [],
    toneHints: [],
    avoidHints: [],
  };

  if (/\b(captain|commander|commandant|marshal|sergeant|lieutenant|guard|watch|soldier|warden|constable)\b/i.test(hay)) {
    profile.role = 'authority';
    profile.toneHints.push('authoritative', 'commanding', 'stern');
    profile.avoidHints.push('warm', 'gentle', 'cheerful');
    profile.ageHints.push('middle-aged');
  }

  if (/\b(sister|brother|priest|priestess|acolyte|cleric|monk|nun|faith|tidebound)\b/i.test(hay)) {
    profile.role = profile.role ?? 'clergy';
    profile.toneHints.push('gentle', 'urgent');
    profile.avoidHints.push('cheerful');
    if (/\b(young|anxious|desperate|ink-stained)\b/i.test(hay)) profile.ageHints.push('young');
  }

  if (/\b(crier|herald|elderly|old man|old woman|crone|ancient|grey-streaked|bald man|hoarse)\b/i.test(hay)) {
    profile.role = profile.role ?? 'elder';
    profile.toneHints.push('raspy', 'fearful');
    profile.ageHints.push('old');
  }

  if (/\b(merchant|trader|innkeeper|bartender|smuggler)\b/i.test(hay)) {
    profile.role = profile.role ?? 'merchant';
    profile.toneHints.push('warm', 'mysterious');
  }

  if (/\b(desperate|frantic|panicked|fearful|terrified|afraid)\b/i.test(hay) || /desperate|fearful|panicked/.test(attitude)) {
    profile.toneHints.push('fearful', 'urgent');
    profile.avoidHints.push('cheerful');
  }

  if (
    /\bcommanding|authoritative|stern|suspicious|iron discipline|disciplined|hard-faced\b/i.test(hay) ||
    /commanding|stern|authoritative|suspicious/.test(attitude)
  ) {
    profile.toneHints.push('authoritative', 'commanding', 'stern');
    profile.avoidHints.push('warm', 'gentle', 'cheerful');
  }

  if (/\bmiddle-aged\b/i.test(hay)) profile.ageHints.push('middle-aged');
  if (/\b(young woman|young man|youth|teen)\b/i.test(hay)) profile.ageHints.push('young');

  profile.toneHints = [...new Set(profile.toneHints)];
  profile.avoidHints = [...new Set(profile.avoidHints)];
  profile.ageHints = [...new Set(profile.ageHints)];
  profile.archetype = buildArchetypeLabel(profile);
  profile.idealVoiceBrief = buildIdealVoiceBrief(npc, profile);

  return profile;
}

function voiceText(voice: RegistryVoice): string {
  return [voice.name, voice.description, voice.age, voice.accent, voice.gender]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function voiceToneTags(voice: RegistryVoice): Set<VoiceToneHint> {
  const text = voiceText(voice);
  const tags = new Set<VoiceToneHint>();
  for (const [tone, re] of Object.entries(TONE_KEYWORDS) as Array<[VoiceToneHint, RegExp]>) {
    if (re.test(text)) tags.add(tone);
  }
  const nameKey = voice.name.toLowerCase().split(/[\s-]+/)[0] ?? '';
  for (const hint of VOICE_NAME_HINTS[nameKey] ?? []) tags.add(hint);
  return tags;
}

export function scoreVoiceForProfile(voice: RegistryVoice, profile: VoiceCastProfile): number {
  let score = 0;
  const text = voiceText(voice);
  const tags = voiceToneTags(voice);

  if (profile.gender !== 'unknown' && voice.gender) {
    score += voice.gender.toLowerCase() === profile.gender ? 4 : -20;
  }

  for (const age of profile.ageHints) {
    if ((voice.age ?? '').toLowerCase() === age) score += 3;
  }

  for (const accent of profile.accentHints) {
    if (text.includes(accent)) score += 2;
  }

  for (const tone of profile.toneHints) {
    if (tags.has(tone) || TONE_KEYWORDS[tone].test(text)) score += 2;
  }

  for (const avoid of profile.avoidHints) {
    if (tags.has(avoid) || TONE_KEYWORDS[avoid].test(text)) score -= 5;
  }

  if (profile.role === 'authority') {
    if (AUTHORITY_BLOCK_RE.test(text)) score -= 10;
    if (/\b(confident|assertive|strong|deep|gravel|gruff|no-nonsense|crisp|firm|professional)\b/i.test(text)) {
      score += 2;
    }
  }

  if (profile.role === 'elder' && (voice.age ?? '').toLowerCase() === 'old') score += 4;
  if (profile.role === 'clergy' && profile.ageHints.includes('young') && (voice.age ?? '').toLowerCase() === 'young') {
    score += 2;
  }

  return score;
}

export function summarizeCastProfile(profile: VoiceCastProfile): Record<string, unknown> {
  return {
    archetype: profile.archetype,
    ideal_voice_brief: profile.idealVoiceBrief,
    gender: profile.gender,
    role: profile.role,
    accent: profile.accentHints,
    age: profile.ageHints,
    seek: profile.toneHints,
    avoid: profile.avoidHints,
  };
}

export const MIN_AI_CAST_SCORE = 1;
export const CAST_SHORTLIST_SIZE = 15;

const AUTHORITY_BLOCK_RE =
  /\b(velvety|actress|sultry|seductive|breathy|soft-spoken|sweet|bubbly|playful|quirky|enthusiast|nurturing|motherly|reassuring|soothing|comforting|educator|storyteller|bright|warm)\b/i;

const ANXIOUS_BLOCK_RE =
  /\b(playful|bright|cheerful|bubbly|quirky|enthusiast|velvety|actress|sultry|seductive|reassuring|confident|soothing|calm)\b/i;

export function isVoiceAcceptableForProfile(
  voice: RegistryVoice,
  profile: VoiceCastProfile,
): boolean {
  const score = scoreVoiceForProfile(voice, profile);
  if (score < MIN_AI_CAST_SCORE) return false;
  if (isVoiceHardBlocked(voice, profile)) return false;

  const text = voiceText(voice);
  const tags = voiceToneTags(voice);

  if (profile.role === 'authority') {
    const hasCommandTone = profile.toneHints.some(
      (t) =>
        ['authoritative', 'commanding', 'stern'].includes(t) &&
        (tags.has(t as VoiceToneHint) || TONE_KEYWORDS[t as VoiceToneHint]?.test(text)),
    );
    if (!hasCommandTone && score < 6) return false;
  }

  return true;
}

function isVoiceHardBlocked(voice: RegistryVoice, profile: VoiceCastProfile): boolean {
  const text = voiceText(voice);
  if (profile.role === 'authority' && AUTHORITY_BLOCK_RE.test(text)) return true;
  if ((profile.role === 'clergy' || profile.toneHints.includes('fearful')) && ANXIOUS_BLOCK_RE.test(text)) {
    return true;
  }
  if (profile.role === 'elder' && (voice.age ?? '').toLowerCase() === 'young') return true;
  return false;
}

export interface RankedVoice {
  voice: RegistryVoice;
  score: number;
  acceptable: boolean;
}

/** Pre-rank catalog voices — used for AI shortlist and deterministic fallback. */
export function rankVoicesForProfile(
  npc: NpcSpeaker & { visualDescription?: string; gender?: string },
  voices: RegistryVoice[],
  usedVoiceIds: string[],
  narratorVoiceId: string,
): RankedVoice[] {
  const profile = inferVoiceCastProfile(npc);
  return voices
    .filter((v) => v.voiceId !== narratorVoiceId)
    .map((voice) => ({
      voice,
      score: scoreVoiceForProfile(voice, profile),
      acceptable:
        !usedVoiceIds.includes(voice.voiceId) && isVoiceAcceptableForProfile(voice, profile),
    }))
    .sort((a, b) => b.score - a.score);
}

export function pickVoiceForNpcProfile(
  npc: NpcSpeaker & { visualDescription?: string; gender?: string },
  voices: RegistryVoice[],
  usedVoiceIds: string[],
  narratorVoiceId: string,
): RegistryVoice | null {
  const profile = inferVoiceCastProfile(npc);
  const ranked = rankVoicesForProfile(npc, voices, usedVoiceIds, narratorVoiceId);
  const eligible = ranked.filter((r) => !usedVoiceIds.includes(r.voice.voiceId));
  const pool = eligible.length > 0 ? eligible : ranked;

  const acceptable = pool.filter((r) => r.acceptable);
  const soft = pool.filter((r) => !isVoiceHardBlocked(r.voice, profile));
  const fallbackRanked = acceptable.length > 0 ? acceptable : soft.length > 0 ? soft : pool;

  const topScore = fallbackRanked[0]?.score ?? -Infinity;
  const topTier = fallbackRanked.filter((r) => r.score === topScore);

  let hash = 0;
  for (let i = 0; i < npc.name.length; i++) hash = (hash * 31 + npc.name.charCodeAt(i)) >>> 0;
  return topTier[hash % topTier.length]?.voice ?? fallbackRanked[0]?.voice ?? null;
}

export function buildCastShortlist(
  npc: NpcSpeaker & { visualDescription?: string; gender?: string },
  voices: RegistryVoice[],
  usedVoiceIds: string[],
  narratorVoiceId: string,
  limit = CAST_SHORTLIST_SIZE,
): RankedVoice[] {
  const ranked = rankVoicesForProfile(npc, voices, usedVoiceIds, narratorVoiceId);
  const unused = ranked.filter((r) => !usedVoiceIds.includes(r.voice.voiceId));
  const pool = unused.length >= 3 ? unused : ranked;
  return pool.slice(0, limit);
}
