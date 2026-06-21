/** Infer NPC gender from explicit field or description for voice casting. */
export type NpcGender = 'female' | 'male' | 'unknown';

const FEMALE_RE =
  /\b(woman|women|female|girl|lady|mother|sister|priestess|daughter|queen|widow|maiden|wife|nun|actress|waitress|she\b|her\b)\b/i;
const MALE_RE =
  /\b(man|men|male|boy|lord|father|brother|king|son|husband|monk|priest\b|actor|waiter|he\b|his\b|elderly man|bald man)\b/i;

export function inferNpcGender(npc: {
  name?: string;
  description?: string;
  visualDescription?: string;
  gender?: string;
}): NpcGender {
  const explicit = (npc.gender ?? '').trim().toLowerCase();
  if (explicit === 'female' || explicit === 'f') return 'female';
  if (explicit === 'male' || explicit === 'm') return 'male';

  const hay = [npc.name, npc.description, npc.visualDescription].filter(Boolean).join(' ');
  if (FEMALE_RE.test(hay)) return 'female';
  if (MALE_RE.test(hay)) return 'male';
  return 'unknown';
}

export function filterVoicesByGender<T extends { gender?: string }>(
  voices: T[],
  gender: NpcGender,
): T[] {
  if (gender === 'unknown') return voices;
  const want = gender;
  const filtered = voices.filter((v) => (v.gender ?? '').toLowerCase() === want);
  return filtered.length > 0 ? filtered : voices;
}
