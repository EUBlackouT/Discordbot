import type { Ability } from '../../utils/helpers.js';
import type { ControllerDecision } from '../../validation/schemas.js';

export interface CheckIntent {
  type: 'skill' | 'ability' | 'save';
  skill?: string;
  ability: Ability;
  dc: number;
  publicReason: string;
  successConsequence: string;
  failureConsequence: string;
}

const SKILL_DEFS: Array<{ patterns: RegExp[]; skill: string; ability: Ability }> = [
  {
    patterns: [/\binvestig/i],
    skill: 'Investigation',
    ability: 'INT',
  },
  {
    patterns: [/\bpercep/i, /\blook around\b/, /\bscan\b/],
    skill: 'Perception',
    ability: 'WIS',
  },
  {
    patterns: [/\bstealth\b/, /\bsneak\b/, /\bhide\b/],
    skill: 'Stealth',
    ability: 'DEX',
  },
  {
    patterns: [/\bacrobat/i],
    skill: 'Acrobatics',
    ability: 'DEX',
  },
  {
    patterns: [/\bathlet/i, /\bclimb\b/, /\bjump\b/],
    skill: 'Athletics',
    ability: 'STR',
  },
  {
    patterns: [/\binsight\b/],
    skill: 'Insight',
    ability: 'WIS',
  },
  {
    patterns: [/\bpersuad/i, /\bconvinc/i],
    skill: 'Persuasion',
    ability: 'CHA',
  },
  {
    patterns: [/\bdeceiv/i, /\blie\b/, /\bbluff\b/],
    skill: 'Deception',
    ability: 'CHA',
  },
  {
    patterns: [/\bintimidat/i],
    skill: 'Intimidation',
    ability: 'CHA',
  },
];

function matchSkill(text: string): { skill: string; ability: Ability } | undefined {
  for (const def of SKILL_DEFS) {
    if (def.patterns.some((p) => p.test(text))) {
      return { skill: def.skill, ability: def.ability };
    }
  }
  return undefined;
}

/** Player explicitly asks to roll a check (including typos like "investigastion"). */
export function detectPlayerCheckIntent(message: string): CheckIntent | null {
  const text = message.trim().toLowerCase();
  if (!/\b(check|roll)\b/.test(text)) return null;

  const matched = matchSkill(text);
  if (!matched) return null;

  return buildCheckIntent(matched.skill, matched.ability, message);
}

/** Player tries to inspect/search without saying "check" — still warrants a roll. */
export function detectInspectIntent(message: string): CheckIntent | null {
  const text = message.trim().toLowerCase();
  if (/\b(check|roll)\b/.test(text)) return null;
  if (!/\b(inspect|investigate|search|examine|scrutinize|look for|look through|study)\b/.test(text)) {
    return null;
  }

  const matched = matchSkill(text) ?? { skill: 'Investigation', ability: 'INT' as Ability };
  return buildCheckIntent(matched.skill, matched.ability, message);
}

/** Pull "jewelry", "the latch", etc. from player text for contextual consequences. */
function extractSearchSubject(message: string): string | null {
  const text = message.trim().toLowerCase();
  if (!/\b(search|look|find|inspect|examine|investigate|study)\b/.test(text)) return null;

  const forMatch = text.match(/\bfor\s+(?:the\s+|any\s+|some\s+)?(.+?)(?:\.|$|\?|\band\b)/);
  const raw = forMatch?.[1]?.trim();
  if (raw && raw.length >= 3 && raw.length <= 60 && !/^(it|that|this|there|here|clues?)$/i.test(raw)) {
    return raw.replace(/\s+/g, ' ');
  }

  const objectMatch = text.match(
    /\b(?:inspect|examine|investigate|search|study)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\.|$|\?|\bfor\b)/,
  );
  const object = objectMatch?.[1]?.trim();
  if (object && object.length >= 3 && object.length <= 60) {
    return object.replace(/\s+/g, ' ');
  }

  return null;
}

function buildCheckIntent(skill: string, ability: Ability, playerMessage: string): CheckIntent {
  const subject = extractSearchSubject(playerMessage);
  const focus = subject ?? 'what you are examining';

  if (subject) {
    return {
      type: 'skill',
      skill,
      ability,
      dc: 14,
      publicReason: `You use ${skill} to examine ${subject}.`,
      successConsequence: `You learn something concrete and actionable about ${subject}.`,
      failureConsequence: `You find no useful detail about ${subject}, or the attempt draws complications.`,
    };
  }

  return {
    type: 'skill',
    skill,
    ability,
    dc: 14,
    publicReason: `You attempt a ${skill} check on ${focus}.`,
    successConsequence: `Your ${skill} check succeeds — reveal a meaningful clue tied to ${focus}.`,
    failureConsequence: `Your ${skill} check fails — ${focus} yields nothing useful or the attempt goes wrong.`,
  };
}

export function buildRequestCheckDecision(
  intent: CheckIntent,
  discordId: string,
  characterId?: string,
  reason = 'Player action requires a roll.',
): ControllerDecision {
  return {
    action: 'REQUEST_CHECK',
    confidence: 1,
    reason,
    target_player_id: discordId,
    target_character_id: characterId,
    check: {
      type: intent.type,
      skill: intent.skill,
      ability: intent.ability,
      dc: intent.dc,
      advantageState: 'normal',
      publicReason: intent.publicReason,
      successConsequence: intent.successConsequence,
      failureConsequence: intent.failureConsequence,
    },
    narration_instruction: 'Set the moment, then ask the player to roll — do not reveal success or failure.',
    state_updates: [],
    safety_flags: [],
  };
}
