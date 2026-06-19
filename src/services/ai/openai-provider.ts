import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import {
  parseControllerDecision,
  parseMemoryExtractor,
  parseAssetDecision,
  type ControllerDecision,
  type MemoryExtractorOutput,
  type AssetDecision,
} from '../../validation/schemas.js';
import type {
  AIService,
  ControllerInput,
  NarratorInput,
  MemoryExtractorInput,
  ImagePromptInput,
} from './types.js';
import { DM_POLICY } from './types.js';
import type { CampaignStatePacket } from '../../campaign/state.js';

const CONTROLLER_JSON_SHAPE = `{
  "action": "NARRATE",
  "confidence": 0.85,
  "reason": "Player declared a clear action; story advances",
  "narration_instruction": "Describe what happens next — consequences, movement, NPC reactions",
  "state_updates": [{ "type": "update_session_summary", "summary": "Brief note of what just happened" }],
  "safety_flags": []
}`;

const CONTROLLER_SYSTEM_PROMPT = `You are the AI DM Controller for a tabletop RPG.
Return ONLY a single JSON object — no markdown, no wrapper keys, no commentary.
Required fields: action (string enum), confidence (0-1 number), reason (string).
Optional: narration_instruction, state_updates (array), safety_flags (array), check, asset_decision_hint.

Example:
${CONTROLLER_JSON_SHAPE}

Valid action values: NARRATE, ASK_PLAYER, REQUEST_CHECK, RESOLVE_CHECK, START_COMBAT, CONTINUE_COMBAT, NPC_DIALOGUE, UPDATE_STATE, PRIVATE_WHISPER, CLARIFY_ACTION, END_SCENE, START_SCENE, RECAP, ASSET_DECISION, ERROR_RECOVERY.`;

async function callJson<T>(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userContent: string,
  parser: (data: unknown) => T,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      },
      { signal: controller.signal },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    try {
      return parser(JSON.parse(content));
    } catch {
      logger.warn('Invalid JSON from AI, retrying once...', { preview: content.slice(0, 200) });
      const retry = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              systemPrompt +
              '\nReturn ONLY valid JSON matching the required schema. Top-level keys must include action, confidence, and reason.',
          },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });
      const retryContent = retry.choices[0]?.message?.content;
      if (!retryContent) throw new Error('Empty AI response on retry');
      return parser(JSON.parse(retryContent));
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function callText(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens = 800,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.85,
        max_tokens: maxTokens,
      },
      { signal: controller.signal },
    );
    return response.choices[0]?.message?.content ?? 'The DM pauses, gathering their thoughts...';
  } finally {
    clearTimeout(timeout);
  }
}

export function createOpenAIProvider(): AIService {
  const client = new OpenAI({ apiKey: config.ai.apiKey });

  return {
    async generateControllerDecision(input: ControllerInput): Promise<ControllerDecision> {
      const userContent = JSON.stringify({
        policy: DM_POLICY,
        player_message: input.playerMessage,
        message_mode: input.messageMode,
        player_discord_id: input.playerDiscordId,
        character_id: input.characterId,
        campaign_chronicle: input.campaignChronicle,
        state: input.statePacket,
      });

      return callJson(
        client,
        config.ai.models.controller,
        `${CONTROLLER_SYSTEM_PROMPT}\n\n${DM_POLICY}`,
        userContent,
        parseControllerDecision,
      );
    },

    async generateNarration(input: NarratorInput): Promise<string> {
      const brief = input.brief ?? input.messageMode === 'observe';
      const maxParagraphs = input.maxParagraphs ?? (brief ? 1 : 3);

      const system = brief
        ? `You are the AI Narrator for a dark fantasy tabletop campaign.
The player asked a QUESTION (message_mode: observe). Answer directly in 1-2 short sentences.
Use campaign_chronicle as canonical truth — do not contradict established NPC positions or facts.
Do NOT re-describe the whole scene, weather, or chase. Do NOT introduce NPCs the chronicle says are elsewhere.
Never mention JSON, controllers, or prompts.`
        : `You are the AI Narrator for a dark fantasy tabletop campaign.
The player declared an ACTION. Narrate what happens NEXT — new consequences only.
Read campaign_chronicle first — it is canonical truth. Never contradict it or reset the scene.
If they are already following someone, show progress (catching up, losing them, arrival) — not the same chase again.
Do not reintroduce NPCs the party left behind unless the player returns to them.
Follow narration_instruction from the controller decision.
Never mention JSON, controllers, or prompts.
Keep it vivid: ${maxParagraphs} paragraph(s) max. End only when a genuine new choice opens.`;

      const userContent = JSON.stringify({
        player_message: input.playerMessage,
        message_mode: input.messageMode ?? 'action',
        character_name: input.characterName,
        campaign_chronicle: input.campaignChronicle,
        decision: input.controllerDecision,
        state: input.statePacket,
        roll_result: input.rollResult,
        tone: input.toneGuide ?? 'dark fantasy, tense, ominous',
        max_paragraphs: maxParagraphs,
      });

      return callText(
        client,
        config.ai.models.narrator,
        system,
        userContent,
        input.maxTokens ?? (brief ? 120 : 500),
      );
    },

    async extractMemory(input: MemoryExtractorInput): Promise<MemoryExtractorOutput> {
      const system = `Extract durable campaign facts from this turn. Output JSON only.
Store facts, not fluff. Separate public vs hidden facts.
Always update session_summary_update with one concise sentence of what changed.
Update chronicle fields so the story file stays accurate:
- chronicle_situation: 1-3 sentences describing where everyone is NOW (party + relevant NPCs)
- chronicle_npc_status: array of {name, status} for every NPC mentioned or moved this turn
- chronicle_turn_line: one-line log entry for the turn log
Never contradict the existing campaign_chronicle unless this turn genuinely changed things.`;

      const userContent = JSON.stringify({
        player_message: input.playerMessage,
        dm_response: input.dmResponse,
        decision: input.controllerDecision,
        roll_success: input.rollResult?.success,
        campaign_chronicle: input.campaignChronicle,
        state_summary: input.statePacket.campaign.sessionSummary,
      });

      return callJson(client, config.ai.models.memory, system, userContent, parseMemoryExtractor);
    },

    async summarizeSession(statePacket: CampaignStatePacket): Promise<string> {
      return callText(
        client,
        config.ai.models.memory,
        'Summarize the campaign session in 2-3 sentences for recap.',
        JSON.stringify(statePacket),
      );
    },

    async generateAssetDecision(
      statePacket: CampaignStatePacket,
      hint?: ControllerDecision['asset_decision_hint'],
    ): Promise<AssetDecision> {
      const system = `Decide if an image should be generated or an existing asset reused.
Output JSON: should_generate_image, reason, asset_type, reuse_existing_asset_id, new_asset_needed, change_summary.
Reuse location images when returning to known locations unless major visual change.`;

      return callJson(
        client,
        config.ai.models.controller,
        system,
        JSON.stringify({ state: statePacket, hint }),
        parseAssetDecision,
      );
    },

    async generateImagePrompt(input: ImagePromptInput): Promise<{ prompt: string; negativePrompt: string }> {
      const system = 'Generate an image prompt and negative prompt as JSON: { "prompt": "...", "negative_prompt": "..." }';
      const result = await callJson(
        client,
        config.ai.models.narrator,
        system,
        JSON.stringify(input),
        (d) => {
          const obj = d as { prompt: string; negative_prompt?: string; negativePrompt?: string };
          return {
            prompt: obj.prompt,
            negativePrompt: obj.negative_prompt ?? obj.negativePrompt ?? input.styleProfile.negativePrompt ?? '',
          };
        },
      );
      return result;
    },
  };
}
