import type { NpcSpeaker } from '../campaign/npc-speech.js';
import { inferVoiceCastProfile } from './voice-cast-profile.js';

/** How an NPC speaks — affects dialogue generation and TTS delivery tags. */
export type NpcSpeechRegister =
  | 'neutral'
  | 'command_bark'
  | 'military_clipped'
  | 'dockside_blunt'
  | 'fearful_hushed'
  | 'clergy_measured'
  | 'merchant_smooth'
  | 'elder_raspy'
  | 'noble_formal';

const REGISTER_V3_TAGS: Partial<Record<NpcSpeechRegister, string>> = {
  command_bark: '[shouts]',
  military_clipped: '[firm]',
  dockside_blunt: '[rough]',
  fearful_hushed: '[nervously]',
  clergy_measured: '[calm]',
  merchant_smooth: '[smooth]',
  elder_raspy: '[tired]',
  noble_formal: '[formal]',
};

export function inferNpcSpeechRegister(
  npc: Pick<NpcSpeaker, 'name' | 'description' | 'attitude' | 'goals'> & {
    visualDescription?: string;
    gender?: string;
  },
): NpcSpeechRegister {
  const profile = inferVoiceCastProfile(npc);
  const hay = [npc.name, npc.description, npc.visualDescription, npc.attitude, npc.goals]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (profile.role === 'authority') {
    if (/\b(shout|yell|riot|seize|clear that|front ranks)\b/i.test(hay)) return 'command_bark';
    return 'military_clipped';
  }
  if (profile.role === 'elder') return 'elder_raspy';
  if (profile.role === 'clergy') {
    if (profile.toneHints.includes('fearful')) return 'fearful_hushed';
    return 'clergy_measured';
  }
  if (profile.role === 'merchant') return 'merchant_smooth';
  if (/\b(lord|lady|duke|count|noble|court)\b/i.test(hay)) return 'noble_formal';
  if (/\b(dock|sailor|smuggler|fishwife|tavern)\b/i.test(hay)) return 'dockside_blunt';

  return 'neutral';
}

/** Eleven v3 delivery prefix — performance hint, not a rewrite of the line. */
export function registerToV3Tag(register: NpcSpeechRegister): string | undefined {
  return REGISTER_V3_TAGS[register];
}

/** Hint for the dialogue LLM — word choice and rhythm, not voice ID. */
export function buildDialogueStyleHint(register: NpcSpeechRegister): string {
  switch (register) {
    case 'command_bark':
      return 'Speak in clipped commands — short imperatives, parade-ground diction, no filler, may shout.';
    case 'military_clipped':
      return 'Speak in terse, disciplined sentences — orders and facts, little warmth.';
    case 'dockside_blunt':
      return 'Speak in plain dockside speech — blunt, salt-stained, contractions, no court poetry.';
    case 'fearful_hushed':
      return 'Speak breathless and urgent — fragmented sentences, whispers in crowds, fear under control.';
    case 'clergy_measured':
      return 'Speak with quiet conviction — faith-flavored wording, not preachy sermons.';
    case 'merchant_smooth':
      return 'Speak smooth and practical — deals, hedging, charm when useful.';
    case 'elder_raspy':
      return 'Speak like a tired elder — hoarse asides, old-fashioned phrasing, weary humor.';
    case 'noble_formal':
      return 'Speak in formal court diction — complete sentences, titles, controlled emotion.';
    default:
      return 'Speak naturally for the scene — distinct from Chronicler narration.';
  }
}

export function buildSpeechDeliveryContext(
  npc: Pick<NpcSpeaker, 'name' | 'description' | 'attitude' | 'goals'> & {
    visualDescription?: string;
    gender?: string;
  },
  extras?: {
    sceneMood?: string;
    controllerAction?: string;
    combatActive?: boolean;
  },
) {
  const register = inferNpcSpeechRegister(npc);
  return {
    isNpc: true as const,
    npcName: npc.name,
    npcDescription: npc.description,
    npcAttitude: npc.attitude,
    speechRegister: register,
    sceneMood: extras?.sceneMood,
    controllerAction: extras?.controllerAction,
    combatActive: extras?.combatActive,
  };
}
