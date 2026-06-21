/** Original campaign intro — dark fantasy political intrigue, SRD-compatible mechanics only */

export const DEFAULT_CAMPAIGN_NAME = 'The Veiled Compact';

export const INTRO_LOCATION = {
  slug: 'mistharbor-execution-yard',
  name: 'Mistharbor Execution Yard',
  description:
    'A rain-swept public square in the cliffside port of Mistharbor. Iron gibbets line the seaward wall. Lanterns gutter in the salt wind as a crowd gathers for a state execution.',
  visualDescription:
    'Eye-level view of a grounded medieval execution square at dusk in heavy rain. Wet cobblestones reflecting warm lantern light. A sturdy wooden scaffold with stairs bolted against a stone seawall — iron gibbets and rope tackle fixed to the wall, nothing floating. Dense crowd in hoods and cloaks, city watch in dark tabards holding lanterns, grey stone port buildings with slate roofs. Painterly dark fantasy illustration, physically plausible, grim atmospheric realism.',
  mood: 'tense, ominous, politically charged',
  lighting: 'lantern light cutting through rain, deep shadows',
  architecture: 'cliffside medieval port, slate roofs, iron fixtures',
  landmarks: ['wooden execution scaffold', 'seaward gibbets on stone wall', 'herald platform'],
  persistentObjects: ['rain-slick cobblestones', 'herald banner with broken seal'],
  isMajor: true,
};

export const INTRO_SCENE = {
  name: 'The Vanishing Condemned',
  description:
    'During a public execution in Mistharbor, the condemned spy vanishes in a pale sigil. Witnesses in the front ranks are accused of witchcraft as the watch moves to seize them.',
  mood: 'immediate danger, accusation, no time to think',
};

export const INTRO_NPCS = [
  {
    name: 'Captain Mira Thornvale',
    gender: 'female' as const,
    description: 'Hard-faced city watch captain with a scarred jaw and iron discipline.',
    visualDescription: 'Middle-aged woman, short grey-streaked hair, scarred jaw, dark watch tabard with silver pins, rain on her cloak.',
    goals: 'Restore order, find the vanished prisoner, satisfy the Council.',
    secrets: 'She knows the prisoner was a Council informant and the execution was staged.',
    attitude: 'suspicious',
  },
  {
    name: 'Sister Caldra Venn',
    gender: 'female' as const,
    description: 'A hooded acolyte of the Tidebound faith who grabs the nearest strangers.',
    visualDescription: 'Young woman in sea-green robes, hood half-back, ink-stained fingers, anxious eyes.',
    goals: 'Protect innocents from mob violence, decode the sky sigil.',
    secrets: 'She saw the same sigil in a forbidden text last night.',
    attitude: 'desperate',
  },
  {
    name: 'Old Henrick the Crier',
    gender: 'male' as const,
    description: 'The town crier who was reading the prisoner\'s crimes when the omen struck.',
    visualDescription: 'Elderly man, bald, booming voice gone hoarse, tattered herald coat, clutching a broken bell.',
    goals: 'Survive the riot, sell information to whoever pays.',
    secrets: 'He was paid to omit the prisoner\'s true name from the proclamation.',
    attitude: 'fearful',
  },
];

export const INTRO_QUEST = {
  title: 'Marked by the Pale Sigil',
  description:
    'The sky sigil has branded every witness in the yard. The watch hunts scapegoats, not truth. Escape before you are chained where the prisoner stood — then learn who staged this omen and why.',
  objectives: [
    'Escape the execution yard before the watch seizes you',
    'Learn what the pale sigil means — and why it chose witnesses',
    'Find shelter and allies before Mistharbor locks down',
  ],
  isPrimary: true,
};

export const INTRO_FACTION = {
  name: 'The Mistharbor Council',
  description: 'The ruling council of merchant-lords and naval officers who govern the cliff port.',
  reputation: -1,
  goals: 'Maintain order and suppress rumors of arcane conspiracy.',
};

export const INTRO_MEMORY = {
  public: [
    'The party witnessed the condemned prisoner vanish during a public execution in Mistharbor.',
    'A pale sigil burned across the sky and marked those who saw it.',
    'Captain Thornvale ordered the arrest of witnesses in the front ranks.',
    'Old Henrick the crier fled when the omen struck, omitting the prisoner\'s true name.',
  ],
  hidden: [
    'The vanished prisoner was a Council informant whose staged execution went wrong.',
    'Captain Thornvale was ordered to arrest anyone who reacts visibly to the sigil.',
  ],
};

export const INTRO_CHOICES = [
  'We go with Sister Caldra — stay tight and push for the seaward alleys before the gates finish closing.',
  'We hold at the scaffold with whoever\'s still standing and see what the smoking manacles left behind.',
  'We break from the knot and follow Old Henrick — he knows what he wasn\'t paid to read aloud.',
];

export interface OpeningChoice {
  label: string;
  action: string;
}

export interface OpeningSceneContent {
  locationName: string;
  locationTagline: string;
  narrative: string;
  choices: OpeningChoice[];
}

export interface OpeningPartyContext {
  partyNames?: string[];
}

function formatPartyInCrowd(names: string[]): string {
  if (names.length === 0) return 'You are packed in with strangers and dockhands';
  if (names.length === 1) return `**${names[0]}** is packed in with strangers and dockhands`;
  if (names.length === 2) return `**${names[0]}** and **${names[1]}** are packed in with the rest`;
  const lead = names
    .slice(0, -1)
    .map((n) => `**${n}**`)
    .join(', ');
  return `${lead}, and **${names[names.length - 1]}** are packed in with the rest`;
}

export interface OpeningVoiceSegment {
  kind: 'narrator' | 'npc';
  text: string;
  npcName?: string;
  attitude?: string;
  /** Silence after this clip when stitching the intro (milliseconds). */
  pauseAfterMs?: number;
}

function formatPartyInCrowdSpeech(names: string[]): string {
  if (names.length === 0) return 'You are packed in with strangers and dockhands';
  if (names.length === 1) return `${names[0]} is packed in with strangers and dockhands`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are packed in with the rest`;
  const lead = names.slice(0, -1).join(', ');
  return `${lead}, and ${names[names.length - 1]} are packed in with the rest`;
}

/** Scripted intro for multi-voice VC playback (Chronicler + NPC lines). */
export function buildOpeningVoiceScript(party?: OpeningPartyContext): OpeningVoiceSegment[] {
  const crowd = formatPartyInCrowdSpeech(party?.partyNames ?? []);

  return [
    {
      kind: 'narrator',
      text:
        `Mistharbor clings to black cliffs above a churning harbor — a port city ruled by merchant-lords who call public hangings justice and call silence loyalty. ` +
        `Tonight the square below the seawall is packed: dockhands, fishwives, off-duty sailors, and strangers who came to see a spy die. ` +
        `${crowd} under a row of iron gibbets, close enough to smell wet rope and the tar they use on the scaffold.`,
      pauseAfterMs: 750,
    },
    {
      kind: 'narrator',
      text:
        `The condemned stands hooded on the wooden platform, wrists locked in iron. Old Henrick the crier sways on his step below, voice raw from shouting the prisoner's crimes into the rain — ` +
        `treason against the Council, smuggling names across the border, sins the crowd was meant to hear before the drop. His bell hangs cracked at his hip. He keeps one thumb over a line on the parchment, as if afraid the next word might burn.`,
      pauseAfterMs: 900,
    },
    {
      kind: 'narrator',
      text: 'Then Henrick stops mid-sentence.',
      pauseAfterMs: 1200,
    },
    {
      kind: 'narrator',
      text:
        `The hooded figure vanishes. Not a fall — not a trick of the rope — simply gone. Manacles clang empty on the boards and smoke curls from them like breath in winter. ` +
        `A beat of silence, then the square detonates: screams, shoving, someone retching against the stones.`,
      pauseAfterMs: 850,
    },
    {
      kind: 'narrator',
      text:
        `Pale fire tears across the belly of the clouds — a sigil no priest claims, sharp enough to leave salt behind your eyes. ` +
        `Everyone who looked up feels branded. You see the same ghost-light reflected on the faces pressed around you.`,
      pauseAfterMs: 750,
    },
    {
      kind: 'narrator',
      text:
        `Captain Mira Thornvale of the city watch drives her horse into the riot, tabard dark with rain. She does not look surprised.`,
      pauseAfterMs: 850,
    },
    {
      kind: 'npc',
      npcName: 'Captain Mira Thornvale',
      attitude: 'commanding',
      text: 'Witchcraft in the front ranks! Clear that section — seize the whole knot of them!',
      pauseAfterMs: 550,
    },
    {
      kind: 'narrator',
      text:
        `Sister Caldra Venn fights through in sea-green robes, ink staining her fingers, hood half-back. She grabs the nearest shoulders — maybe yours.`,
      pauseAfterMs: 850,
    },
    {
      kind: 'npc',
      npcName: 'Sister Caldra Venn',
      attitude: 'desperate',
      text: '[urgently] You saw it too. [whispers] The seaward alleys still breathe — move together, or they\'ll pick us off one by one.',
      pauseAfterMs: 600,
    },
    {
      kind: 'narrator',
      text:
        `Henrick's bell finally hits the cobbles. He turns his herald's coat inside-out and slides backward into the mob, lips still shaping a name he was paid not to read aloud. ` +
        `Behind you, the yard gates begin to grind shut. Someone on the gibbets is already testing rope for a scapegoat.`,
    },
  ];
}

export function buildOpeningSceneContent(party?: OpeningPartyContext): OpeningSceneContent {
  const crowd = formatPartyInCrowd(party?.partyNames ?? []);

  const narrative =
    `**Mistharbor** clings to black cliffs above a churning harbor — a port city ruled by merchant-lords who call public hangings *justice* and call silence *loyalty*. ` +
    `Tonight the square below the seawall is packed: dockhands, fishwives, off-duty sailors, and strangers who came to see a spy die. ` +
    `${crowd} under a row of iron gibbets, close enough to smell wet rope and the tar they use on the scaffold.\n\n` +
    `The condemned stands hooded on the wooden platform, wrists locked in iron. **Old Henrick the crier** sways on his step below, voice raw from shouting the prisoner's crimes into the rain — ` +
    `treason against the Council, smuggling names across the border, sins the crowd was *meant* to hear before the drop. His bell hangs cracked at his hip. He keeps one thumb over a line on the parchment, as if afraid the next word might burn.\n\n` +
    `Then Henrick stops mid-sentence.\n\n` +
    `The hooded figure **vanishes**. Not a fall — not a trick of the rope — simply gone. Manacles clang empty on the boards and smoke curls from them like breath in winter. ` +
    `A beat of silence, then the square detonates: screams, shoving, someone retching against the stones.\n\n` +
    `Pale fire tears across the belly of the clouds — a sigil no priest claims, sharp enough to leave salt behind your eyes. ` +
    `Everyone who looked up feels branded. You see the same ghost-light reflected on the faces pressed around you.\n\n` +
    `Captain **Mira Thornvale** of the city watch drives her horse into the riot, tabard dark with rain. She does not look surprised. ` +
    `*"Witchcraft in the front ranks. Clear that section — seize the whole knot of them!"*\n\n` +
    `**Sister Caldra Venn** fights through in sea-green robes, ink staining her fingers, hood half-back. She grabs the nearest shoulders — maybe yours. ` +
    `*"You saw it too. The seaward alleys still breathe — move together, or they'll pick us off one by one."*\n\n` +
    `Henrick's bell finally hits the cobbles. He turns his herald's coat inside-out and slides backward into the mob, lips still shaping a name he was paid *not* to read aloud.\n\n` +
    `Behind you, the yard gates begin to grind shut. Someone on the gibbets is already testing rope for a scapegoat.`;

  return {
    locationName: INTRO_LOCATION.name,
    locationTagline: 'Mistharbor · rain · rope',
    narrative,
    choices: [
      { label: 'Flee with Caldra', action: INTRO_CHOICES[0] },
      { label: 'Reach the scaffold', action: INTRO_CHOICES[1] },
      { label: 'Follow Henrick', action: INTRO_CHOICES[2] },
    ],
  };
}

/** @deprecated Use buildOpeningSceneContent for rich embeds */
export function buildOpeningNarration(): string {
  const c = buildOpeningSceneContent();
  return `${c.narrative}\n\n${c.choices.map((ch, i) => `${i + 1}. ${ch.action}`).join('\n')}`;
}
