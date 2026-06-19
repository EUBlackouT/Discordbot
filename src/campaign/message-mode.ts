/** How the player is engaging — controls narration length and controller behavior. */

export type MessageMode = 'action' | 'observe' | 'dialogue';

const OBSERVE =
  /\b(do i|can i|am i|are we|is (he|she|it|the)|do we|can (we|you) see|still see|still hear|what do i see|what can i see|where is|where are|who is here|anyone (around|nearby)|in sight|visible|notice anything)\b/i;

const DIALOGUE = /^(i say|i tell|i whisper|i shout|i call out|i ask|")/i;

export function classifyMessageMode(message: string): MessageMode {
  const text = message.trim();
  if (!text) return 'action';

  if (DIALOGUE.test(text)) return 'dialogue';

  const looksLikeQuestion =
    text.endsWith('?') ||
    /^(do|does|did|can|could|am|are|is|was|were|have|has|will|would|should)\b/i.test(text);

  if (looksLikeQuestion && (OBSERVE.test(text) || text.length < 100)) {
    return 'observe';
  }

  return 'action';
}

export interface NarrationLimits {
  maxParagraphs: number;
  maxTokens: number;
  brief: boolean;
}

export function narrationLimitsForMode(mode: MessageMode): NarrationLimits {
  switch (mode) {
    case 'observe':
      return { maxParagraphs: 1, maxTokens: 120, brief: true };
    case 'dialogue':
      return { maxParagraphs: 2, maxTokens: 280, brief: false };
    case 'action':
    default:
      return { maxParagraphs: 3, maxTokens: 500, brief: false };
  }
}
