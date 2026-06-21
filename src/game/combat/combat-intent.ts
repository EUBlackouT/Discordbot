import type { ControllerDecision } from '../../validation/schemas.js';
import type { CombatEnemyInput } from './combat-service.js';
import { formatSpellKey, lookupSpell } from '../character/spell-reference.js';

export interface CombatActionIntent {
  kind: 'attack' | 'cast_spell' | 'flee' | 'end_turn' | 'reaction';
  targetName?: string;
  spellKey?: string;
}

export interface CombatStartIntent {
  enemies: CombatEnemyInput[];
  reason: string;
}

const ATTACK_PATTERNS = [
  /\b(?:i\s+)?attack\b/i,
  /\b(?:i\s+)?strike\b/i,
  /\b(?:i\s+)?hit\b/i,
  /\b(?:i\s+)?shoot\b/i,
  /\b(?:i\s+)?stab\b/i,
  /\b(?:i\s+)?slash\b/i,
  /\b(?:i\s+)?swing\b/i,
  /\bfight\b/i,
  /\brush\b.*\b(?:enemy|guard|them)\b/i,
];

const CAST_PATTERNS = [
  /\b(?:i\s+)?cast\s+(.+)/i,
  /\b(?:i\s+)?use\s+(.+?)\s+(?:on|at|against)\b/i,
  /\b(?:i\s+)?use\s+(.+)/i,
];

const FLEE_PATTERNS = [/\b(?:i\s+)?(?:flee|run away|retreat|escape)\b/i];
const END_TURN_PATTERNS = [/\b(?:end|done with)\s+(?:my\s+)?turn\b/i, /\bpass\b/i];

const HOSTILE_NPC_PATTERNS = [
  /\b(?:draws?|raises?|levels?)\s+(?:a\s+)?(?:weapon|blade|sword|knife|crossbow|bow)\b/i,
  /\b(?:guards?|soldiers?|enemies?)\s+(?:surround|close in|advance|attack)\b/i,
  /\b(?:ambush|ambushed)\b/i,
  /\b(?:hostile|aggressive|threatening)\b/i,
];

const REACTION_PATTERNS = [
  /\b(?:cast\s+)?shield\b/i,
  /\bhellish\s+rebuke\b/i,
];

export function detectCombatAction(message: string): CombatActionIntent | null {
  const text = message.trim();

  if (END_TURN_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'end_turn' };
  }

  if (FLEE_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'flee' };
  }

  if (REACTION_PATTERNS.some((p) => p.test(text))) {
    const spellKey = /\bshield\b/i.test(text) ? 'shield' : 'hellish-rebuke';
    return { kind: 'reaction', spellKey, targetName: extractTargetName(text) };
  }

  for (const pattern of CAST_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const spellPhrase = match[1]?.trim() ?? '';
      const spellKey = resolveSpellKeyFromPhrase(spellPhrase);
      const target = extractTargetName(text);
      return { kind: 'cast_spell', spellKey: spellKey ?? undefined, targetName: target };
    }
  }

  if (ATTACK_PATTERNS.some((p) => p.test(text))) {
    return { kind: 'attack', targetName: extractTargetName(text) };
  }

  return null;
}

/** Player-initiated violence or clear hostile scene — suggest combat start. */
export function detectCombatStartIntent(
  message: string,
  activeNpcs: Array<{ name: string }>,
): CombatStartIntent | null {
  const action = detectCombatAction(message);
  if (action?.kind === 'attack' || action?.kind === 'cast_spell') {
    const enemies = inferEnemiesFromContext(message, activeNpcs, action.targetName);
    return {
      enemies,
      reason: action.kind === 'cast_spell' ? 'Player cast a hostile spell.' : 'Player initiated an attack.',
    };
  }

  if (
    /\b(?:charge|rush|draw\s+(?:my\s+)?(?:weapon|mace|sword|blade|axe|hammer))\b/i.test(message) &&
    /\b(?:guard|enemy|foe|them|him|her|assailant|soldier)\b/i.test(message)
  ) {
    return {
      enemies: inferEnemiesFromContext(message, activeNpcs),
      reason: 'Player rushed into melee.',
    };
  }

  if (/\b(?:initiative|roll initiative)\b/i.test(message)) {
    return {
      enemies: inferEnemiesFromContext(message, activeNpcs),
      reason: 'Player called for initiative.',
    };
  }

  return null;
}

export function detectHostileSceneSignal(recentNarration: string): boolean {
  return HOSTILE_NPC_PATTERNS.some((p) => p.test(recentNarration));
}

function extractTargetName(message: string): string | undefined {
  const patterns = [
    /\b(?:attack|strike|hit|shoot|stab|slash|swing at|cast .+? (?:on|at|against))\s+(?:the\s+)?([a-z][\w\s'-]{1,40})/i,
    /\bon\s+(?:the\s+)?([a-z][\w\s'-]{1,40})/i,
    /\bat\s+(?:the\s+)?([a-z][\w\s'-]{1,40})/i,
  ];
  for (const p of patterns) {
    const m = message.match(p);
    const raw = m?.[1]?.trim();
    if (raw && !/^(him|her|them|it|me|my)$/i.test(raw)) {
      return raw.replace(/\s+(with|using).*$/i, '').trim();
    }
  }
  return undefined;
}

function resolveSpellKeyFromPhrase(phrase: string): string | null {
  const cleaned = phrase
    .toLowerCase()
    .replace(/\s+on\s+.+$/i, '')
    .replace(/\s+at\s+.+$/i, '')
    .trim();
  const key = cleaned.replace(/\s+/g, '-');
  if (lookupSpell(key)) return key;

  const allWords = cleaned.split(/\s+/);
  for (let len = allWords.length; len >= 1; len--) {
    const candidate = allWords.slice(0, len).join('-');
    if (lookupSpell(candidate)) return candidate;
  }

  return null;
}

function inferEnemiesFromContext(
  message: string,
  activeNpcs: Array<{ name: string }>,
  targetName?: string,
): CombatEnemyInput[] {
  if (targetName) {
    const lower = targetName.toLowerCase();
    if (/\bguard/.test(lower)) {
      return [{ name: 'City Guard', ac: 16, hp: 11, attackBonus: 3, damage: '1d6+1' }];
    }
    const npc = activeNpcs.find(
      (n) => n.name.toLowerCase().includes(targetName.toLowerCase()) || targetName.toLowerCase().includes(n.name.toLowerCase()),
    );
    return [{ name: npc?.name ?? titleCase(targetName), ac: 13, hp: 16, attackBonus: 4, damage: '1d6+2' }];
  }

  const lower = message.toLowerCase();
  if (/\bguard/.test(lower)) {
    return [{ name: 'City Guard', ac: 16, hp: 11, attackBonus: 3, damage: '1d6+1' }];
  }
  if (/\bthug|bandit|rogue/.test(lower)) {
    return [{ name: 'Thug', ac: 13, hp: 16, attackBonus: 4, damage: '1d6+2' }];
  }
  if (/\bcultist/.test(lower)) {
    return [{ name: 'Cultist', ac: 12, hp: 9, attackBonus: 3, damage: '1d4+1' }];
  }

  const hostileNpc = activeNpcs[0];
  if (hostileNpc) {
    return [{ name: hostileNpc.name, ac: 13, hp: 18, attackBonus: 4, damage: '1d8+1' }];
  }

  return [{ name: 'Hostile Foe', ac: 12, hp: 14, attackBonus: 3, damage: '1d6+1' }];
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildStartCombatDecision(
  intent: CombatStartIntent,
  discordId: string,
  characterId?: string,
): ControllerDecision {
  const enemyList = intent.enemies.map((e) => e.name).join(', ');
  return {
    action: 'START_COMBAT',
    confidence: 0.9,
    reason: intent.reason,
    target_player_id: discordId,
    target_character_id: characterId,
    narration_instruction: `Combat erupts against ${enemyList}. Describe blades drawn and foes reacting — do not narrate attack hits or damage yet.`,
    combat: { enemies: intent.enemies },
    state_updates: [
      { type: 'update_session_summary', summary: `Combat began against ${enemyList}.` },
    ],
    safety_flags: [],
  };
}

export function buildContinueCombatDecision(
  reason: string,
  killInstruction?: string,
): ControllerDecision {
  return {
    action: 'CONTINUE_COMBAT',
    confidence: 0.9,
    reason,
    narration_instruction: killInstruction
      ? `${killInstruction} Match the mechanical outcome exactly — do not invent extra attacks.`
      : 'Describe the exchange based on the mechanical result — vivid consequences, no invented extra hits.',
    state_updates: [],
    safety_flags: [],
  };
}

export function formatSpellName(spellKey?: string): string {
  return spellKey ? formatSpellKey(spellKey) : 'spell';
}
