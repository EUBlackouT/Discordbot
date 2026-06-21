import type { AmbienceContext } from './ambience-context.js';

export interface AmbienceSpec {
  prompt: string;
  durationSeconds: number;
  label: string;
}

const ARCHETYPE_PROMPTS: Record<string, string> = {
  urban_crowd:
    'Busy medieval street ambience, distant indistinct crowd murmur and footsteps on cobblestones, occasional muffled shouts, seamless loop, no clear speech',
  alley:
    'Narrow rainy alley ambience, distant voices and footsteps echoing, dripping water, low urban murmur, seamless loop, no intelligible dialogue',
  tavern:
    'Medieval tavern interior, muted chatter and laughter, mugs clinking, crackling hearth, warm crowded room, seamless loop',
  harbor:
    'Cliffside harbor ambience, sea wind, gulls, rope and rigging creak, distant waves, rain on stone, seamless loop',
  execution:
    'Tense public square crowd, anxious murmurs, rain on cobblestones, distant guards, somber atmosphere, seamless loop',
  forest:
    'Dark forest ambience, wind in trees, distant birds, rustling leaves, occasional branch creak, seamless loop',
  dungeon:
    'Underground stone ambience, distant water drips, faint echo, cold air, subtle rumble, seamless loop',
  temple:
    'Stone temple interior, hollow reverb, distant chant-like tones without words, candle flicker ambience, seamless loop',
  castle:
    'Castle interior stone halls, distant footsteps, torch flicker, drafty corridors, low echo, seamless loop',
  wilderness:
    'Open wilderness wind, distant hawk cry, grass rustling, sparse and lonely, seamless loop',
  combat:
    'Distant battle ambience, muffled shouts, clashing steel far away, tense drum-like pulse low in mix, seamless loop',
  camp:
    'Night camp ambience, soft crackling fire, crickets, faint wind, occasional distant owl, seamless loop',
  default:
    'Dark fantasy atmospheric wind and low stone ambience, subtle and unobtrusive, seamless loop, no melody',
};

/** All loopable bed types — used by audio library bake + runtime resolver. */
export const AMBIENCE_BED_ARCHETYPES = Object.keys(ARCHETYPE_PROMPTS);

export function ambienceBedSpecForArchetype(archetype: string): AmbienceSpec {
  const base = ARCHETYPE_PROMPTS[archetype] ?? ARCHETYPE_PROMPTS.default!;
  return {
    prompt: base,
    durationSeconds: 22,
    label: archetype,
  };
}

function haystack(ctx: AmbienceContext): string {
  return [
    ctx.locationName,
    ctx.locationSlug,
    ctx.mood,
    ctx.sceneMood,
    ctx.description,
    ctx.visualDescription,
    ctx.currentChanges,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function pickArchetype(text: string, combatActive?: boolean): keyof typeof ARCHETYPE_PROMPTS {
  if (combatActive) return 'combat';
  if (/\b(alley|alleys|lane|backstreet|slum)\b/.test(text)) return 'alley';
  if (/\b(execution yard|execution square)\b/.test(text)) return 'execution';
  if (/\b(execution|scaffold|gibbet|hang)\b/.test(text)) return 'execution';
  if (/\b(market|bazaar|square|yard|crowd|riot|street|quarter)\b/.test(text)) return 'urban_crowd';
  if (/\b(tavern|inn|pub|alehouse|bar)\b/.test(text)) return 'tavern';
  if (/\b(harbor|harbour|port|dock|mistharbor|sea|ship|wharf)\b/.test(text)) return 'harbor';
  if (/\b(forest|wood|grove|glade|tree)\b/.test(text)) return 'forest';
  if (/\b(cave|dungeon|crypt|tunnel|sewer|underground|catacomb)\b/.test(text)) return 'dungeon';
  if (/\b(temple|church|shrine|chapel|sanctum|oracle)\b/.test(text)) return 'temple';
  if (/\b(castle|keep|fortress|hall|throne|court)\b/.test(text)) return 'castle';
  if (/\b(camp|campfire|bivouac)\b/.test(text)) return 'camp';
  if (/\b(plain|road|wild|moor|hill|mountain|wilderness)\b/.test(text)) return 'wilderness';
  return 'default';
}

/** Build an ElevenLabs SFX prompt for a loopable location bed. */
export function resolveAmbienceSpec(ctx: AmbienceContext): AmbienceSpec {
  const text = haystack(ctx);
  const archetype = pickArchetype(text, ctx.combatActive);
  const base = ARCHETYPE_PROMPTS[archetype] ?? ARCHETYPE_PROMPTS.default;

  const moodBits: string[] = [];
  if (/\b(rain|storm|wet)\b/.test(text)) moodBits.push('rain');
  if (/\b(tense|danger|hostile|ominous|charged)\b/.test(text)) moodBits.push('tense mood');
  if (/\b(quiet|still|silent|hush)\b/.test(text)) moodBits.push('hushed');

  const detail = [ctx.locationName, ctx.mood, ctx.sceneMood].filter(Boolean).join(', ');
  const prompt = `${base}. Setting: ${detail || 'fantasy location'}.${moodBits.length ? ` ${moodBits.join(', ')}.` : ''}`;

  return {
    prompt: prompt.slice(0, 420),
    durationSeconds: 22,
    label: archetype,
  };
}
