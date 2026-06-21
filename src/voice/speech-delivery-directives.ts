import type { NpcSpeechRegister } from './npc-speech-style.js';
import type { SpeechDeliveryContext, SpeechEmotion } from './speech-delivery-types.js';

export type DeliveryIntensity = 'neutral' | 'moderate' | 'strong' | 'extreme';

export interface DeliveryDirective {
  emotion: SpeechEmotion;
  intensity: DeliveryIntensity;
  register?: NpcSpeechRegister;
}

const V3_TAG_RE =
  /\[(?:angry|shouts|shouting|yelling|yells|loudly|firm|rough|nervously|scared|calm|smooth|tired|formal|urgently|whispers|dramatic|excited|sorrowful|happily|happy|laughs|sighs|clears throat|emphasized|rushed|pause)\]\s*/gi;

const SHOUT_CUE_RE =
  /\b(seize|clear|halt|stop|move|now|witchcraft|front ranks|arrest|charge|orders|hold|back|drop|fire|run)\b/i;
const FEAR_CUE_RE =
  /\b(help|please|don't|hide|run|they'?re coming|afraid|terror|panic|trembl|mercy|gods)\b/i;
const HAPPY_CUE_RE = /\b(thank|thanks|bless|wonderful|glad|joy|celebrate|laugh|smile|good news)\b/i;
const WHISPER_CUE_RE = /\b(whisper|murmur|hiss|under (?:your|their|my) breath|quietly|softly)\b/i;

const EMOTION_OPENING: Record<SpeechEmotion, Partial<Record<DeliveryIntensity, string[]>>> = {
  angry: {
    moderate: ['[angry]'],
    strong: ['[angry]', '[shouts]'],
    extreme: ['[angry]', '[shouts]', '[loudly]'],
  },
  commanding: {
    moderate: ['[firm]'],
    strong: ['[angry]', '[shouts]'],
    extreme: ['[angry]', '[shouts]', '[loudly]'],
  },
  urgent: {
    moderate: ['[urgently]'],
    strong: ['[urgently]', '[rushed]'],
    extreme: ['[urgently]', '[rushed]', '[shouts]'],
  },
  fearful: {
    moderate: ['[nervously]'],
    strong: ['[scared]', '[nervously]'],
    extreme: ['[scared]', '[nervously]', '[rushed]'],
  },
  desperate: {
    moderate: ['[desperately]'],
    strong: ['[desperately]', '[nervously]'],
    extreme: ['[desperately]', '[scared]', '[rushed]'],
  },
  sad: {
    moderate: ['[sorrowful]'],
    strong: ['[sorrowful]'],
    extreme: ['[sorrowful]'],
  },
  excited: {
    moderate: ['[excited]'],
    strong: ['[happily]', '[excited]'],
    extreme: ['[happily]', '[excited]', '[loudly]'],
  },
  whisper: {
    moderate: ['[whispers]'],
    strong: ['[whispers]'],
    extreme: ['[whispers]'],
  },
  dramatic: {
    moderate: ['[dramatic]'],
    strong: ['[dramatic]'],
    extreme: ['[dramatic]', '[shouts]'],
  },
  tense: {
    moderate: ['[tense]'],
    strong: ['[tense]'],
    extreme: ['[tense]', '[rushed]'],
  },
  mysterious: {
    moderate: ['[mysteriously]'],
    strong: ['[mysteriously]'],
    extreme: ['[mysteriously]'],
  },
  neutral: {},
};

const CLAUSE_TAGS: Record<SpeechEmotion, Partial<Record<DeliveryIntensity, string[]>>> = {
  angry: { strong: ['[yelling]'], extreme: ['[yelling]', '[emphasized]'] },
  commanding: { strong: ['[shouts]'], extreme: ['[yelling]', '[loudly]'] },
  urgent: { strong: ['[rushed]'], extreme: ['[rushed]', '[shouts]'] },
  fearful: { strong: ['[nervously]'], extreme: ['[scared]', '[whispers]'] },
  desperate: { strong: ['[nervously]'], extreme: ['[scared]', '[rushed]'] },
  excited: { strong: ['[excited]'], extreme: ['[happily]', '[loudly]'] },
  sad: { moderate: ['[sorrowful]'] },
  whisper: { moderate: ['[whispers]'], strong: ['[whispers]'], extreme: ['[whispers]'] },
  dramatic: { strong: ['[dramatic]'], extreme: ['[shouts]'] },
  tense: { strong: ['[tense]'] },
  mysterious: { moderate: ['[mysteriously]'] },
  neutral: {},
};

export function stripV3DeliveryTags(text: string): string {
  return text.replace(V3_TAG_RE, '').replace(/\s+/g, ' ').trim();
}

function countExclamations(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

function inferRegisterForLine(
  register: NpcSpeechRegister | undefined,
  text: string,
  emotion: SpeechEmotion,
): NpcSpeechRegister | undefined {
  if (register && register !== 'neutral') return register;
  if (emotion === 'commanding' || emotion === 'angry') {
    if (SHOUT_CUE_RE.test(text) || countExclamations(text) >= 2) return 'command_bark';
    return 'military_clipped';
  }
  return register;
}

export function inferDeliveryIntensity(
  text: string,
  emotion: SpeechEmotion,
  ctx: SpeechDeliveryContext,
): DeliveryIntensity {
  let score = 0;
  const exclamations = countExclamations(text);

  if (exclamations >= 1) score += 1;
  if (exclamations >= 2) score += 1;
  if (exclamations >= 3) score += 1;
  if (/\b(yell|shout|scream|bellow|roar)s?\b/i.test(text)) score += 2;
  if (SHOUT_CUE_RE.test(text) && (emotion === 'commanding' || emotion === 'angry' || emotion === 'urgent')) {
    score += 2;
  }
  if (ctx.speechRegister === 'command_bark') score += 2;
  if (ctx.combatActive) score += 1;
  if (/riot|danger|charged|hostile|immediate danger/.test(ctx.sceneMood ?? '')) score += 1;
  if (ctx.controllerAction === 'START_SCENE' && ctx.isNpc && (emotion === 'commanding' || emotion === 'angry')) {
    score += 1;
  }
  if (FEAR_CUE_RE.test(text) && (emotion === 'fearful' || emotion === 'desperate')) score += 1;
  if (HAPPY_CUE_RE.test(text) && emotion === 'excited') score += 1;

  if (score >= 5) return 'extreme';
  if (score >= 3) return 'strong';
  if (score >= 1) return 'moderate';
  return 'neutral';
}

export function buildDeliveryDirective(
  text: string,
  emotion: SpeechEmotion,
  ctx: SpeechDeliveryContext,
): DeliveryDirective {
  const clean = stripV3DeliveryTags(text);
  let register = inferRegisterForLine(ctx.speechRegister, clean, emotion);
  let resolvedEmotion = emotion;

  if (WHISPER_CUE_RE.test(clean)) resolvedEmotion = 'whisper';
  else if (HAPPY_CUE_RE.test(clean)) resolvedEmotion = 'excited';
  else if (FEAR_CUE_RE.test(clean) && resolvedEmotion === 'neutral') resolvedEmotion = 'fearful';
  else if (
    ctx.isNpc &&
    SHOUT_CUE_RE.test(clean) &&
    countExclamations(clean) > 0 &&
    (resolvedEmotion === 'neutral' || resolvedEmotion === 'dramatic')
  ) {
    resolvedEmotion = 'commanding';
  }

  if (
    ctx.isNpc &&
    register === 'command_bark' &&
    (resolvedEmotion === 'neutral' || resolvedEmotion === 'dramatic')
  ) {
    resolvedEmotion = 'commanding';
  }

  // Narrator describes action; NPC-style commanding tags make the chronicler sound like another speaker.
  if (!ctx.isNpc) {
    if (resolvedEmotion === 'commanding' || resolvedEmotion === 'angry') {
      resolvedEmotion = /riot|danger|scream|detonate|charged|hostile/i.test(clean) ? 'tense' : 'dramatic';
    }
    if (register === 'command_bark' || register === 'military_clipped') {
      register = undefined;
    }
  }

  return {
    emotion: resolvedEmotion,
    intensity: inferDeliveryIntensity(clean, resolvedEmotion, { ...ctx, speechRegister: register }),
    register,
  };
}

function tagsForOpening(directive: DeliveryDirective): string[] {
  const table = EMOTION_OPENING[directive.emotion] ?? {};
  return table[directive.intensity] ?? table.moderate ?? table.strong ?? [];
}

function tagsForClause(directive: DeliveryDirective, sentence: string, index: number): string[] {
  if (index === 0) return [];
  const table = CLAUSE_TAGS[directive.emotion] ?? {};
  const base = table[directive.intensity] ?? table.strong ?? table.moderate ?? [];
  if (
    directive.intensity === 'extreme' &&
    (directive.emotion === 'commanding' || directive.emotion === 'angry') &&
    /!/.test(sentence)
  ) {
    return [...new Set([...base, '[shouts]', '[loudly]'])];
  }
  return base;
}

function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text.trim()];
}

function prefixTags(tags: string[], sentence: string): string {
  const unique = tags.filter((tag) => !sentence.includes(tag));
  if (unique.length === 0) return sentence;
  return `${unique.join('')} ${sentence}`;
}

/** Apply Eleven v3 performance tags derived from emotion + intensity. */
export function applyDeliveryDirectives(
  text: string,
  directive: DeliveryDirective,
  options?: { chronicler?: boolean },
): string {
  const clean = stripV3DeliveryTags(text);
  if (!clean) return text;

  const opening = tagsForOpening(directive);
  const sentences = splitSentences(clean);

  // Chronicler: one emotional opening for the whole clip — repeating tags per sentence
  // makes v3 switch voice on character names ("the condemned", "Henrick", etc.).
  if (options?.chronicler) {
    if (sentences.length <= 1) {
      return prefixTags(opening, sentences[0] ?? clean);
    }
    const first = prefixTags(opening, sentences[0]!);
    return [first, ...sentences.slice(1)].join(' [pause] ');
  }

  const rendered = sentences.map((sentence, index) => {
    const clauseTags = tagsForClause(directive, sentence, index);
    if (index === 0) {
      return prefixTags(opening, sentence);
    }
    return prefixTags(clauseTags, sentence);
  });

  return rendered.join(' ');
}

export function voiceSettingsForDirective(
  directive: DeliveryDirective,
  options?: { chronicler?: boolean },
): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
} {
  const base = { similarity_boost: 0.72, use_speaker_boost: true };

  const intensityStyle: Record<DeliveryIntensity, number> = {
    neutral: 0.34,
    moderate: 0.48,
    strong: 0.68,
    extreme: 0.82,
  };

  const intensityStability: Record<DeliveryIntensity, number> = {
    neutral: 0.5,
    moderate: 0.42,
    strong: 0.28,
    extreme: 0.18,
  };

  let stability = intensityStability[directive.intensity];
  let style = intensityStyle[directive.intensity];
  let similarity_boost = base.similarity_boost;

  if (directive.emotion === 'whisper' || directive.emotion === 'fearful') {
    stability = Math.max(stability, 0.34);
    style = Math.min(style, directive.intensity === 'extreme' ? 0.62 : 0.5);
  }

  if (directive.emotion === 'commanding' || directive.emotion === 'angry') {
    style = Math.max(style, directive.intensity === 'extreme' ? 0.85 : 0.68);
    stability = Math.min(stability, directive.intensity === 'extreme' ? 0.16 : 0.26);
  }

  if (options?.chronicler) {
    stability = Math.max(stability, 0.52);
    style = Math.max(style, 0.42);
    similarity_boost = Math.max(similarity_boost, 0.78);
  }

  return { ...base, stability, style, similarity_boost };
}
