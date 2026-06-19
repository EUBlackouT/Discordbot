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

export const controllerDecisionSchema = z.object({
  action: z.enum([
    'NARRATE',
    'ASK_PLAYER',
    'REQUEST_CHECK',
    'RESOLVE_CHECK',
    'START_COMBAT',
    'CONTINUE_COMBAT',
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
});

export type ControllerDecision = z.infer<typeof controllerDecisionSchema>;

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
  importance: z.number().int().min(1).max(5).default(3),
});

export type MemoryExtractorOutput = z.infer<typeof memoryExtractorSchema>;

export const assetDecisionSchema = z.object({
  should_generate_image: z.boolean(),
  reason: z.string(),
  asset_type: z.enum(['character_portrait', 'location', 'npc_portrait', 'item']).optional(),
  reuse_existing_asset_id: z.string().optional(),
  new_asset_needed: z.boolean(),
  change_summary: z.string().optional(),
});

export type AssetDecision = z.infer<typeof assetDecisionSchema>;

export function parseControllerDecision(data: unknown): ControllerDecision {
  return controllerDecisionSchema.parse(normalizeControllerPayload(data));
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
  return memoryExtractorSchema.parse(data);
}

export function parseAssetDecision(data: unknown): AssetDecision {
  return assetDecisionSchema.parse(data);
}
