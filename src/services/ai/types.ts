import type { CampaignStatePacket } from '../../campaign/state.js';
import type { ControllerDecision, MemoryExtractorOutput } from '../../validation/schemas.js';
import type { AssetDecision } from '../../validation/schemas.js';

import type { MessageMode } from '../../campaign/message-mode.js';

export interface ControllerInput {
  playerMessage: string;
  playerDiscordId: string;
  characterId?: string;
  statePacket: CampaignStatePacket;
  campaignChronicle: string;
  messageMode: MessageMode;
  dmPolicy: string;
}

export interface NarratorInput {
  controllerDecision: ControllerDecision;
  statePacket: CampaignStatePacket;
  playerMessage: string;
  characterName?: string;
  rollResult?: {
    total: number;
    success: boolean;
    breakdown: string;
    successConsequence: string;
    failureConsequence: string;
  };
  toneGuide?: string;
  maxParagraphs?: number;
  maxTokens?: number;
  messageMode?: MessageMode;
  campaignChronicle?: string;
  brief?: boolean;
}

export interface MemoryExtractorInput {
  playerMessage: string;
  dmResponse: string;
  controllerDecision: ControllerDecision;
  statePacket: CampaignStatePacket;
  campaignChronicle: string;
  rollResult?: { success: boolean };
}

export interface ImagePromptInput {
  assetType: 'character_portrait' | 'location' | 'npc_portrait' | 'item';
  subjectName: string;
  canonicalDescription: string;
  appearanceOrVisual?: string;
  mood?: string;
  styleProfile: Record<string, string>;
  continuityConstraints?: string;
  previousPrompt?: string;
  changeSummary?: string;
}

export interface AIService {
  generateControllerDecision(input: ControllerInput): Promise<ControllerDecision>;
  generateNarration(input: NarratorInput): Promise<string>;
  extractMemory(input: MemoryExtractorInput): Promise<MemoryExtractorOutput>;
  summarizeSession(statePacket: CampaignStatePacket): Promise<string>;
  generateAssetDecision(
    statePacket: CampaignStatePacket,
    hint?: ControllerDecision['asset_decision_hint'],
  ): Promise<AssetDecision>;
  generateImagePrompt(input: ImagePromptInput): Promise<{ prompt: string; negativePrompt: string }>;
}

export const DM_POLICY = `
You are the AI DM Controller. Output ONLY valid JSON matching the required schema.
Rules:
- Never decide player character actions — the player already chose; narrate outcomes
- When the player declares a concrete action (follow someone, flee, search, go somewhere), use NARRATE or START_SCENE and describe what happens next
- Do NOT use ASK_PLAYER or CLARIFY_ACTION when intent is clear — advance the story
- narration_instruction must say what happens NEXT, not re-pose the same choice
- Persist world changes in state_updates when location or situation changes
- Request checks only when uncertainty AND meaningful consequences exist
- Do not reveal hidden facts unless discovered
- Never invent or modify character stats
- Use REQUEST_CHECK when a roll is needed; do NOT narrate success/failure before roll
- Use RECAP only when the player asks for a summary
- Use START_SCENE / END_SCENE when the location or scene changes — set location_image_relevant when a new vista should be shown
- Players ask in plain chat for party, quests, NPCs, and location — do NOT tell them to use slash commands
- Preserve player agency; keep the story moving forward every turn
- Read campaign_chronicle as CANONICAL TRUTH — never contradict NPC positions or facts already established there
- If chronicle shows an ongoing pursuit/scene, RESOLVE or CHANGE it this turn (arrival, confrontation, loss of trail) — do not restage the same chase
- message_mode "observe" = player asked a question; use NARRATE with narration_instruction to answer directly in 1-2 sentences, no new scene
- message_mode "action" = player did something; advance the plot with new consequences

state_updates (array of objects) — use when the world changes:
- travel_to_location: { "type": "travel_to_location", "slug": "old-quarter-alleys", "name": "Old Quarter Alleys", "description": "...", "visual_description": "...", "mood": "..." }
- set_location_changes: { "type": "set_location_changes", "current_changes": "what changed here" }
- update_session_summary: { "type": "update_session_summary", "summary": "one sentence of what just happened" }
`.trim();
