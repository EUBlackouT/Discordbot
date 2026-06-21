import { z } from 'zod';
import { ABILITIES } from '../utils/helpers.js';

const abilityScoreSchema = z.number().int().min(1).max(30);

export const abilityScoresSchema = z.object({
  STR: abilityScoreSchema,
  DEX: abilityScoreSchema,
  CON: abilityScoreSchema,
  INT: abilityScoreSchema,
  WIS: abilityScoreSchema,
  CHA: abilityScoreSchema,
});

export type AbilityScores = z.infer<typeof abilityScoresSchema>;

export const checkRequestSchema = z.object({
  type: z.enum(['ability', 'skill', 'save']),
  skill: z.string().optional(),
  ability: z.enum(ABILITIES as unknown as [string, ...string[]]),
  dc: z.number().int().min(1).max(40),
  advantageState: z.enum(['normal', 'advantage', 'disadvantage']).default('normal'),
  publicReason: z.string().min(1),
  successConsequence: z.string().min(1),
  failureConsequence: z.string().min(1),
});

export const combatEnemySchema = z.object({
  name: z.string().min(1),
  ac: z.number().int().min(1).max(30).optional(),
  hp: z.number().int().min(1).max(500).optional(),
  attackBonus: z.number().int().optional(),
  damage: z.string().optional(),
});

export const combatDirectiveSchema = z.object({
  enemies: z.array(combatEnemySchema).optional(),
  escalate: z.boolean().optional(),
  add_enemies: z.array(combatEnemySchema).optional(),
  end_combat: z.boolean().optional(),
  danger_level: z.number().int().min(1).max(5).optional(),
});

export const restDirectiveSchema = z.object({
  outcome: z.enum(['deny', 'setup', 'approve', 'interrupt']),
  camp_prompt: z.string().optional(),
  interrupt_type: z.enum(['ambush', 'patrol', 'nightmare', 'visitor', 'weather', 'omen', 'other']).optional(),
});

export const controllerDecisionSchema = z.object({
  action: z.enum([
    'NARRATE',
    'ASK_PLAYER',
    'REQUEST_CHECK',
    'RESOLVE_CHECK',
    'START_COMBAT',
    'CONTINUE_COMBAT',
    'REST',
    'NPC_DIALOGUE',
    'UPDATE_STATE',
    'PRIVATE_WHISPER',
    'CLARIFY_ACTION',
    'END_SCENE',
    'START_SCENE',
    'RECAP',
    'ASSET_DECISION',
    'ERROR_RECOVERY',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  target_player_id: z.string().optional(),
  target_character_id: z.string().optional(),
  check: checkRequestSchema.optional(),
  narration_instruction: z.string().optional(),
  state_updates: z.array(z.record(z.unknown())).default([]),
  asset_decision_hint: z
    .object({
      location_image_relevant: z.boolean().optional(),
      character_image_relevant: z.boolean().optional(),
    })
    .optional(),
  safety_flags: z.array(z.string()).default([]),
  private_message: z.string().optional(),
  npc_name: z.string().optional(),
  npc_dialogue: z.string().optional(),
  combat: combatDirectiveSchema.optional(),
  rest: restDirectiveSchema.optional(),
});

export type ControllerDecision = z.infer<typeof controllerDecisionSchema>;

export const plotThreadEndingSchema = z.object({
  id: z.string(),
  summary: z.string(),
  trigger_hint: z.string(),
  /** What the main campaign gains when this beat closes this way — not a campaign finale. */
  campaign_advance: z.string().default(''),
});

export const plotThreadSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  /** How this beat serves the overarching campaign (e.g. "Surfaces who staged the vanishing"). */
  campaign_tie: z.string().default(''),
  stakes: z.string().default(''),
  status: z.enum(['active', 'cooling', 'ready_to_resolve', 'resolved']).default('active'),
  momentum: z.number().int().min(0).max(100).default(0),
  possible_endings: z.array(plotThreadEndingSchema).max(5).default([]),
  controller_guidance: z.string().default(''),
});

export type PlotThread = z.infer<typeof plotThreadSchema>;
export type PlotThreadEnding = z.infer<typeof plotThreadEndingSchema>;

export const memoryExtractorSchema = z.object({
  new_public_facts: z.array(z.string()).default([]),
  new_hidden_facts: z.array(z.string()).default([]),
  character_updates: z.array(z.record(z.unknown())).default([]),
  npc_updates: z.array(z.record(z.unknown())).default([]),
  location_updates: z.array(z.record(z.unknown())).default([]),
  quest_updates: z.array(z.record(z.unknown())).default([]),
  faction_updates: z.array(z.record(z.unknown())).default([]),
  asset_updates: z.array(z.record(z.unknown())).default([]),
  open_threads_added: z.array(z.string()).default([]),
  open_threads_resolved: z.array(z.string()).default([]),
  session_summary_update: z.string().default(''),
  chronicle_situation: z.string().optional(),
  chronicle_npc_status: z
    .array(z.object({ name: z.string(), status: z.string() }))
    .default([]),
  chronicle_turn_line: z.string().optional(),
  /** Full updated plot thread state — AI replaces the campaign list each extraction. */
  plot_threads: z.array(plotThreadSchema).default([]),
  /** One sentence: what the whole campaign is about right now (primary quest + current pressure). */
  campaign_throughline: z.string().optional(),
  importance: z.number().int().min(1).max(5).default(3),
});

export const narrationSfxCueSchema = z.object({
  id: z.string(),
  anchor_phrase: z.string(),
  prompt: z.string(),
  duration_seconds: z.number().min(0.5).max(4).default(2),
  volume: z.number().min(0.1).max(1).default(0.35),
});

export const narrationSfxExtractorSchema = z.object({
  cues: z.array(narrationSfxCueSchema).max(3).default([]),
});

export type NarrationSfxCue = z.infer<typeof narrationSfxCueSchema>;
export type NarrationSfxExtractorOutput = z.infer<typeof narrationSfxExtractorSchema>;

export type MemoryExtractorOutput = z.infer<typeof memoryExtractorSchema>;

export const assetDecisionSchema = z.object({
  should_generate_image: z.boolean(),
  reason: z.string(),
  asset_type: z.enum(['character_portrait', 'location', 'npc_portrait', 'item']).optional(),
  reuse_existing_asset_id: z.string().optional(),
  new_asset_needed: z.boolean(),
  change_summary: z.string().optional(),
});

export type RestDirective = z.infer<typeof restDirectiveSchema>;
export type AssetDecision = z.infer<typeof assetDecisionSchema>;

export const npcVoiceCastSchema = z.object({
  voice_id: z.string().min(1),
  voice_label: z.string().default(''),
  reason: z.string().default(''),
});

export type NpcVoiceCastOutput = z.infer<typeof npcVoiceCastSchema>;

export function parseNpcVoiceCast(data: unknown): NpcVoiceCastOutput {
  const obj = data as Record<string, unknown>;
  return npcVoiceCastSchema.parse({
    voice_id: obj.voice_id ?? obj.voiceId,
    voice_label: obj.voice_label ?? obj.voiceLabel ?? '',
    reason: obj.reason ?? '',
  });
}

export function parseControllerDecision(data: unknown): ControllerDecision {
  const normalized = normalizeControllerPayload(data) as Record<string, unknown>;
  if (normalized.check && typeof normalized.check === 'object') {
    normalized.check = normalizeCheckObject(normalized.check as Record<string, unknown>);
  }
  if (normalized.combat && typeof normalized.combat === 'object') {
    normalized.combat = normalizeCombatObject(normalized.combat as Record<string, unknown>);
  }
  if (normalized.rest && typeof normalized.rest === 'object') {
    normalized.rest = normalizeRestObject(normalized.rest as Record<string, unknown>);
  }
  return controllerDecisionSchema.parse(normalized);
}

function normalizeRestObject(rest: Record<string, unknown>): Record<string, unknown> {
  const outcome = rest.outcome;
  const valid = ['deny', 'setup', 'approve', 'interrupt'];
  return {
    ...rest,
    outcome: typeof outcome === 'string' && valid.includes(outcome) ? outcome : 'setup',
  };
}

function normalizeCombatObject(combat: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...combat };
  const normalizeEnemyList = (list: unknown) => {
    if (!Array.isArray(list)) return list;
    return list.map((e) => {
      if (!e || typeof e !== 'object') return e;
      const enemy = e as Record<string, unknown>;
      return {
        name: enemy.name ?? 'Hostile Foe',
        ac: typeof enemy.ac === 'number' ? enemy.ac : 12,
        hp: typeof enemy.hp === 'number' ? enemy.hp : 14,
        attackBonus: typeof enemy.attackBonus === 'number' ? enemy.attackBonus : 3,
        damage: typeof enemy.damage === 'string' ? enemy.damage : '1d6+1',
      };
    });
  };
  if (Array.isArray(normalized.enemies)) {
    normalized.enemies = normalizeEnemyList(normalized.enemies);
  }
  if (Array.isArray(normalized.add_enemies)) {
    normalized.add_enemies = normalizeEnemyList(normalized.add_enemies);
  }
  return normalized;
}

const SKILL_TYPE_ALIASES: Record<string, { skill: string; ability: string }> = {
  investigation: { skill: 'Investigation', ability: 'INT' },
  investigastion: { skill: 'Investigation', ability: 'INT' },
  perception: { skill: 'Perception', ability: 'WIS' },
  stealth: { skill: 'Stealth', ability: 'DEX' },
  athletics: { skill: 'Athletics', ability: 'STR' },
  acrobatics: { skill: 'Acrobatics', ability: 'DEX' },
  insight: { skill: 'Insight', ability: 'WIS' },
  persuasion: { skill: 'Persuasion', ability: 'CHA' },
  deception: { skill: 'Deception', ability: 'CHA' },
  intimidation: { skill: 'Intimidation', ability: 'CHA' },
};

function normalizeCheckObject(check: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...check };

  const rawType = typeof normalized.type === 'string' ? normalized.type.toLowerCase() : '';
  if (rawType && !['ability', 'skill', 'save'].includes(rawType)) {
    const alias = SKILL_TYPE_ALIASES[rawType.replace(/\s+/g, '')];
    if (alias) {
      normalized.type = 'skill';
      normalized.skill = normalized.skill ?? alias.skill;
      normalized.ability = normalized.ability ?? alias.ability;
    }
  }

  const rawSkill = typeof normalized.skill === 'string' ? normalized.skill.toLowerCase() : '';
  if (rawSkill) {
    const compact = rawSkill.replace(/\s+/g, '');
    const alias = SKILL_TYPE_ALIASES[compact] ?? (compact.includes('investig') ? SKILL_TYPE_ALIASES.investigation : undefined);
    if (alias) {
      normalized.skill = alias.skill;
      normalized.ability = normalized.ability ?? alias.ability;
      normalized.type = normalized.type ?? 'skill';
    }
  }

  if (!normalized.type && normalized.skill) normalized.type = 'skill';
  if (!normalized.type) normalized.type = 'skill';

  normalized.ability = normalized.ability ?? 'INT';
  normalized.dc = typeof normalized.dc === 'number' ? normalized.dc : 14;
  normalized.advantageState =
    normalized.advantageState ?? normalized.advantage_state ?? 'normal';
  normalized.publicReason =
    (normalized.publicReason as string) ??
    (normalized.public_reason as string) ??
    'You attempt the check.';
  normalized.successConsequence =
    (normalized.successConsequence as string) ??
    (normalized.success_consequence as string) ??
    'You succeed.';
  normalized.failureConsequence =
    (normalized.failureConsequence as string) ??
    (normalized.failure_consequence as string) ??
    'You fail.';

  return normalized;
}

function normalizeControllerPayload(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;

  let obj = data as Record<string, unknown>;

  for (const key of ['decision', 'controller_decision', 'controllerDecision', 'response', 'result', 'output']) {
    const nested = obj[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      obj = normalizeControllerPayload(nested) as Record<string, unknown>;
      break;
    }
  }

  const normalized = { ...obj };

  if (normalized.action === undefined && typeof normalized.action_type === 'string') {
    normalized.action = normalized.action_type;
  }
  if (normalized.reason === undefined && typeof normalized.rationale === 'string') {
    normalized.reason = normalized.rationale;
  }
  if (normalized.narration_instruction === undefined && typeof normalized.narrationInstruction === 'string') {
    normalized.narration_instruction = normalized.narrationInstruction;
  }
  if (normalized.state_updates === undefined && Array.isArray(normalized.stateUpdates)) {
    normalized.state_updates = normalized.stateUpdates;
  }
  if (normalized.safety_flags === undefined && Array.isArray(normalized.safetyFlags)) {
    normalized.safety_flags = normalized.safetyFlags;
  }

  return normalized;
}

export function parseMemoryExtractor(data: unknown): MemoryExtractorOutput {
  const obj = data as Record<string, unknown>;
  return memoryExtractorSchema.parse({
    ...obj,
    plot_threads: obj.plot_threads ?? obj.plotThreads ?? [],
  });
}

export function parsePlotThreads(data: unknown): PlotThread[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => plotThreadSchema.parse(item));
}

export function parseNarrationSfxExtractor(data: unknown): NarrationSfxExtractorOutput {
  return narrationSfxExtractorSchema.parse(data);
}

export function parseAssetDecision(data: unknown): AssetDecision {
  return assetDecisionSchema.parse(data);
}
