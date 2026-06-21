import type { PlotThread } from '../../validation/schemas.js';

export type PlayerGoalKind = 'move_away' | 'follow' | 'search' | 'dialogue' | 'other';

const MOVE_AWAY =
  /\b(escape|escap(?:e|ing)|flee(?:ing)?|run away|get out|leave|be off|move on|slip away|break free|run for it|get clear|make for|get away|bolt|vamoose|out of here|no time to spare)\b/i;

const FOLLOW =
  /\b(follow(?:ing)?|stay (?:with|by|close)|keep up|go with|trail|stick with|stay near|stay by|we'?re off|let'?s go|be off then)\b/i;

const SEARCH =
  /\b(search|inspect|investigate|examine|look for|find|check for|scour|ransack)\b/i;

export function classifyPlayerGoal(message: string): PlayerGoalKind {
  const text = message.trim();
  if (!text) return 'other';
  if (MOVE_AWAY.test(text)) return 'move_away';
  if (FOLLOW.test(text)) return 'follow';
  if (SEARCH.test(text)) return 'search';
  if (/^(i say|i tell|i whisper|i shout|i call out|i ask|")/i.test(text)) return 'dialogue';
  return 'other';
}

/** Goals that should advance geography or close a beat when repeated. */
export function isProgressionGoal(kind: PlayerGoalKind): boolean {
  return kind === 'move_away' || kind === 'follow';
}

export interface LoopPressureResult {
  goalKind: PlayerGoalKind;
  repeatCount: number;
  forceUrgent: boolean;
  requireTravel: boolean;
  controllerPolicy: string;
  narratorPolicy: string;
}

function escapeArcMessages(messages: string[]): string[] {
  return messages.filter((m) => {
    const k = classifyPlayerGoal(m);
    return k === 'move_away' || k === 'follow';
  });
}

/**
 * Detect when the player keeps declaring the same progression goal without world state changing.
 * Works for any beat — not tied to a specific NPC or location name.
 */
export function detectLoopPressure(
  recentPlayerMessages: string[],
  currentMessage: string,
): LoopPressureResult {
  const currentGoal = classifyPlayerGoal(currentMessage);
  const window = [...recentPlayerMessages.slice(-4), currentMessage];

  let repeatCount = 0;
  if (isProgressionGoal(currentGoal)) {
    repeatCount = escapeArcMessages(window).length;
  } else if (currentGoal === 'search') {
    repeatCount = window.filter((m) => classifyPlayerGoal(m) === 'search').length;
  } else {
    repeatCount = window.filter((m) => classifyPlayerGoal(m) === currentGoal && currentGoal !== 'other').length;
  }

  const forceUrgent = isProgressionGoal(currentGoal) && repeatCount >= 2;
  const requireTravel = isProgressionGoal(currentGoal) && repeatCount >= 3;

  const goalLabel =
    currentGoal === 'move_away'
      ? 'escape or leave the current danger'
      : currentGoal === 'follow'
        ? 'follow an ally or NPC to a new place'
        : currentGoal === 'search'
          ? 'search or investigate'
          : 'advance the current beat';

  const controllerPolicy = forceUrgent
    ? [
        'LOOP PRESSURE (system):',
        `The player has declared "${goalLabel}" ${repeatCount} times in recent turns without a location or beat change.`,
        requireTravel
          ? 'You MUST emit travel_to_location (or set_character_location for a solo PC) in state_updates AND use START_SCENE this turn.'
          : 'You MUST show concrete progress: new geography, a closed micro-beat, or a changed situation — not the same tension restaged.',
        'Do NOT loop identical peril (watch lanterns sweeping, crowd frenzy, time running out) unless something NEW happens.',
        'narration_instruction must describe what CHANGES — arrival, threshold crossed, pursuers left behind, or information gained.',
      ].join('\n')
    : '';

  const narratorPolicy = forceUrgent
    ? [
        'ANTI-LOOP (mandatory):',
        `The player already committed to: ${goalLabel}.`,
        'Do NOT reopen the same peril beat. Forbidden unless NEW facts: swinging lanterns, watch closing in, time slipping away, crowd panic restaged.',
        'Narrate what CHANGED — transit completion, new place, distance from the threat, or beat resolution.',
      ].join('\n')
    : '';

  return {
    goalKind: currentGoal,
    repeatCount,
    forceUrgent,
    requireTravel,
    controllerPolicy,
    narratorPolicy,
  };
}

/** Infer a travel update from chronicle hints and player language — no hardcoded story IDs. */
export function inferTravelFromContext(
  chronicle: string,
  playerMessage: string,
  currentLocation?: { name: string; slug: string } | null,
): Record<string, unknown> | null {
  const combined = `${chronicle}\n${playerMessage}`.toLowerCase();

  const towardPatterns = [
    /(?:fleeing|heading|running|toward|into|through|reach(?:ing)?)\s+(?:the\s+)?([a-z][a-z\s'-]{2,48})/gi,
    /\b(in(?:to)?\s+(?:the\s+)?(?:alley|alleys|archway|doorway|wharf|quarter|street|hideout|sanctuary|tunnel|passage|stairs|rooftops?))\b/gi,
  ];

  const candidates: string[] = [];
  for (const pattern of towardPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(combined)) !== null) {
      const place = match[1]?.trim();
      if (place && place.length > 2) candidates.push(place);
    }
  }

  const playerPlace = playerMessage.match(
    /\b(?:to|into|through)\s+(?:the\s+)?([a-z][a-z\s'-]{2,40})/i,
  )?.[1];
  if (playerPlace) candidates.unshift(playerPlace.trim());

  const raw =
    candidates.find((c) => !currentLocation?.name.toLowerCase().includes(c.slice(0, 8))) ??
    candidates[0] ??
    'rain-slick back alleys';

  const name = titleCasePlace(raw);
  const slug = slugify(name);

  if (currentLocation && slug === currentLocation.slug) {
    return {
      type: 'travel_to_location',
      slug: `${slug}-escape`,
      name: `${name} — Out of Sight`,
      description: `The party puts distance between themselves and ${currentLocation.name}. ${name} offers cover from the immediate chaos.`,
      visual_description: `Narrow medieval ${name}, wet cobblestones, rain, distant muffled shouts, warm lantern glow from a distant square, painterly dark fantasy, grounded realism`,
      mood: ' tense, breathless, fleeting safety',
    };
  }

  return {
    type: 'travel_to_location',
    slug,
    name,
    description: `The party reaches ${name}, leaving the worst of the immediate danger behind.`,
    visual_description: `Medieval ${name} at night in rain, wet stone, distant lights, painterly dark fantasy illustration, physically plausible`,
    mood: 'tense, urgent, slightly safer',
  };
}

function titleCasePlace(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function pickThreadToBump(threads: PlotThread[]): number {
  if (threads.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < threads.length; i++) {
    if (threads[i].status !== 'resolved' && threads[i].momentum >= threads[best].momentum) {
      best = i;
    }
  }
  return threads[best].status === 'resolved' ? -1 : best;
}
