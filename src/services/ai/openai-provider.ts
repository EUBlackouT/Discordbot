import OpenAI from 'openai';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import {
  parseControllerDecision,
  parseMemoryExtractor,
  parseNarrationSfxExtractor,
  parseAssetDecision,
  parseNpcVoiceCast,
  type ControllerDecision,
  type MemoryExtractorOutput,
  type AssetDecision,
} from '../../validation/schemas.js';
import type {
  AIService,
  ControllerInput,
  NarratorInput,
  NpcDialogueInput,
  MemoryExtractorInput,
  NarrationSfxInput,
  ImagePromptInput,
  NpcVoiceCastInput,
} from './types.js';
import { buildDialogueStyleHint, inferNpcSpeechRegister } from '../../voice/npc-speech-style.js';
import { DM_POLICY } from './types.js';
import type { CampaignStatePacket } from '../../campaign/state.js';
import { CHECK_RESOLVE_NARRATION_RULES } from '../../game/checks/check-display.js';
import { COMBAT_NARRATION_RULES, COMBAT_START_NARRATION_RULES } from '../../game/combat/combat-display.js';
import { MULTIPLAYER_DM_POLICY } from './types.js';

const CONTROLLER_JSON_SHAPE = `{
  "action": "NARRATE",
  "confidence": 0.85,
  "reason": "Player declared a clear action; story advances",
  "narration_instruction": "Describe what happens next — consequences, movement, NPC reactions",
  "state_updates": [{ "type": "update_session_summary", "summary": "Brief note of what just happened" }],
  "safety_flags": []
}`;

const CONTROLLER_COMBAT_SHAPE = `{
  "action": "START_COMBAT",
  "confidence": 0.9,
  "reason": "Guards draw steel after the party refuses to stand down",
  "combat": {
    "enemies": [
      { "name": "City Guard", "ac": 16, "hp": 11, "attackBonus": 3, "damage": "1d6+1" }
    ],
    "danger_level": 4
  },
  "narration_instruction": "Steel rings free. Initiative is rolled — describe the clash beginning.",
  "state_updates": [{ "type": "update_session_summary", "summary": "A fight broke out with the city guard." }],
  "safety_flags": []
}`;

const CONTROLLER_CONTINUE_COMBAT_SHAPE = `{
  "action": "CONTINUE_COMBAT",
  "confidence": 0.9,
  "reason": "A cultist chants and more shadows peel from the wall",
  "combat": {
    "add_enemies": [
      { "name": "Shadow Cultist", "ac": 12, "hp": 9, "attackBonus": 4, "damage": "1d6+2" }
    ]
  },
  "narration_instruction": "Describe reinforcements joining — use exact HP from state.combat after they arrive",
  "state_updates": [],
  "safety_flags": []
}`;

const CONTROLLER_ESCALATE_SHAPE = `{
  "action": "NARRATE",
  "confidence": 0.85,
  "reason": "Scene is hostile but combat has not started — warn the player",
  "combat": { "escalate": true, "danger_level": 4 },
  "narration_instruction": "Describe weapons half-drawn, closing ranks, a clear last chance to back down or fight",
  "state_updates": [],
  "safety_flags": []
}`;

const CONTROLLER_REST_SETUP_SHAPE = `{
  "action": "REST",
  "confidence": 0.9,
  "reason": "Party wants to camp in the enemy castle courtyard — too dangerous to sleep soundly",
  "rest": { "outcome": "setup", "camp_prompt": "The stones are cold and patrols pass nearby. Who takes first watch, and do you light a fire?" },
  "narration_instruction": "Describe them finding a corner to camp, unease, distant sounds",
  "state_updates": [{ "type": "update_session_summary", "summary": "Party attempts to camp in hostile territory." }],
  "safety_flags": []
}`;

const CONTROLLER_CHECK_SHAPE = `{
  "action": "REQUEST_CHECK",
  "confidence": 0.9,
  "reason": "Inspecting for clues has uncertain outcome",
  "target_player_id": "<discord user id>",
  "check": {
    "type": "skill",
    "skill": "Investigation",
    "ability": "INT",
    "dc": 14,
    "advantageState": "normal",
    "publicReason": "You search the scaffold for how the prisoner vanished.",
    "successConsequence": "You find a trail in the scorch marks.",
    "failureConsequence": "The crowd obscures the scene before you learn anything."
  },
  "narration_instruction": "Set the moment; ask for the roll — do not reveal outcome",
  "state_updates": [],
  "safety_flags": []
}`;

const CONTROLLER_SYSTEM_PROMPT = `You are the AI DM Controller for a tabletop RPG.
Return ONLY a single JSON object — no markdown, no wrapper keys, no commentary.
Required fields: action (string enum), confidence (0-1 number), reason (string).
Optional: narration_instruction, state_updates (array), safety_flags (array), check, asset_decision_hint.

Example (narrate):
${CONTROLLER_JSON_SHAPE}

Example (request check — check.type MUST be "skill", "ability", or "save"; put skill name in check.skill, NOT check.type):
${CONTROLLER_CHECK_SHAPE}

Example (start combat — include combat.enemies with stats):
${CONTROLLER_COMBAT_SHAPE}

Example (mid-fight reinforcements — use combat.add_enemies with full stats):
${CONTROLLER_CONTINUE_COMBAT_SHAPE}

Example (escalate tension without starting combat yet):
${CONTROLLER_ESCALATE_SHAPE}

Example (rest / camp — use REST with rest.outcome; do not restore HP unless outcome is approve):
${CONTROLLER_REST_SETUP_SHAPE}

Valid action values: NARRATE, ASK_PLAYER, REQUEST_CHECK, RESOLVE_CHECK, START_COMBAT, CONTINUE_COMBAT, REST, NPC_DIALOGUE, UPDATE_STATE, PRIVATE_WHISPER, CLARIFY_ACTION, END_SCENE, START_SCENE, RECAP, ASSET_DECISION, ERROR_RECOVERY.`;

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
        acting_player: input.actingPlayer ?? null,
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
Responses will be read aloud later (voice/TTS): keep it tight, vivid, and speakable.
Use short sentences. ${maxParagraphs} short paragraph(s) max — usually 2-5 sentences total unless a major scene change.
One sensory detail beats three. No recap of what they already know.
Read campaign_chronicle first — it is canonical truth. Never contradict it or reset the scene.
If they are already following someone, show progress — not the same chase again.
Do not reintroduce NPCs the party left behind unless the player returns to them.
Follow narration_instruction from the controller decision.
Never mention JSON, controllers, or prompts.`;

      const userContent = JSON.stringify({
        player_message: input.playerMessage,
        message_mode: input.messageMode ?? 'action',
        character_name: input.characterName,
        acting_player: input.actingPlayer ?? null,
        pov_location: input.povLocation ?? input.statePacket.location,
        campaign_chronicle: input.campaignChronicle,
        decision: input.controllerDecision,
        state: input.statePacket,
        roll_result: input.rollResult,
        combat_outcome: input.combatOutcome,
        tone: input.toneGuide ?? 'dark fantasy, tense, ominous',
        max_paragraphs: maxParagraphs,
      });

      const isResolveCheck = input.controllerDecision.action === 'RESOLVE_CHECK';
      const isStartCombat = input.controllerDecision.action === 'START_COMBAT';
      const resolveNote = isResolveCheck ? `\n\n${CHECK_RESOLVE_NARRATION_RULES}` : '';
      const combatNote = input.statePacket.combat
        ? `\n\n${isStartCombat && !input.combatOutcome ? COMBAT_START_NARRATION_RULES : COMBAT_NARRATION_RULES}`
        : '';
      const splitParty =
        input.actingPlayer && input.actingPlayer.separatedParty.length > 0
          ? `\n\n${MULTIPLAYER_DM_POLICY}\nNarrate only from ${input.actingPlayer.characterName}'s POV at ${input.actingPlayer.locationName ?? 'their location'}. Separated allies: ${input.actingPlayer.separatedParty.map((p) => `${p.name} (${p.locationName ?? 'elsewhere'})`).join(', ')}.`
          : '';
      const antiLoop = input.antiLoopPolicy ? `\n\n${input.antiLoopPolicy}` : '';

      return callText(
        client,
        config.ai.models.narrator,
        system + resolveNote + combatNote + splitParty + antiLoop,
        userContent,
        input.maxTokens ?? (brief ? 100 : 280),
      );
    },

    async generateNpcDialogue(input: NpcDialogueInput): Promise<string> {
      const register = inferNpcSpeechRegister(input.npc);
      const styleHint = buildDialogueStyleHint(register);
      const system = `You are ${input.npc.name} in a dark fantasy tabletop campaign.
The player just spoke to YOU. Reply as this character in first person — your actual spoken words.
Do NOT write in third person ("${input.npc.name} believes..." or "she says...").
Do NOT use Chronicler narration. You ARE the character talking.
Speech style: ${styleHint}
Write lines that sound right when performed aloud — if furious, use biting imperatives and exclamation; if terrified, breathless fragments; if joyful, let warmth show. Do not add [tags] or volume stage directions; voice performance is handled separately.
Stay true to campaign_chronicle, your description, attitude, and goals.
Keep it speakable for voice/TTS: 2-5 sentences unless the player asked something that needs more.
You may add one brief *action beat* in italics before or after your line if needed.
Never mention JSON, controllers, or prompts.`;

      const userContent = JSON.stringify({
        npc: input.npc,
        player_message: input.playerMessage,
        character_name: input.characterName,
        campaign_chronicle: input.campaignChronicle,
        instruction: input.controllerDecision.narration_instruction,
        attitude: input.npc.attitude,
        goals: input.npc.goals,
      });

      return callText(
        client,
        config.ai.models.narrator,
        system,
        userContent,
        input.maxTokens ?? 220,
      );
    },

    async assignNpcVoice(input: NpcVoiceCastInput) {
      const system = `You are a voice casting director for a dark fantasy tabletop RPG (English only).
Pick exactly ONE voice_id from the provided shortlist (english_voices). Each entry includes cast_score (higher = better fit) and recommended (true = passes hard filters).

Rules:
- NEVER pick narrator_voice_id
- Prefer recommended voices with high cast_score that are NOT in used_voice_ids
- cast_profile.ideal_voice_brief is the creative brief — treat it as ground truth
- cast_profile.avoid tones are disqualifying — never pick a voice that matches them
- Gender in cast_profile is mandatory when set
- Examples:
  • Watch captain in a riot → stern, commanding, can bark orders; NOT warm/reassuring/velvety/playful/educator
  • Desperate young acolyte → urgent, anxious, breathy; NOT cheerful teacher or smug narrator
  • Old town crier → old, hoarse, weathered; NOT young or smooth influencer

Return ONLY JSON: { "voice_id": "<id from shortlist>", "voice_label": "<name>", "reason": "<short why>" }`;

      const userContent = JSON.stringify({
        npc: input.npc,
        cast_profile: input.castProfile,
        english_voices: input.englishVoices,
        used_voice_ids: input.usedVoiceIds,
        narrator_voice_id: input.narratorVoiceId,
      });

      return callJson(
        client,
        config.ai.models.controller,
        system,
        userContent,
        parseNpcVoiceCast,
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
For npc_updates: when a NEW recurring NPC appears, include { "name": "...", "description": "...", "attitude": "...", "create": true } — voice is auto-cast
Never contradict the existing campaign_chronicle unless this turn genuinely changed things.

PLOT THREADS (plot_threads array — return the FULL updated list each turn):
- Main campaign context: use activeQuest, session summary, chronicle, and campaign_throughline (one sentence you maintain).
- plot_threads are **beats inside that campaign** (a chase, a mystery, a standoff) — NOT separate campaigns or finales.
- Each thread: id, title, summary, campaign_tie (how it serves the main story), stakes, status, momentum 0-100, possible_endings[], controller_guidance
- Each possible_ending: summary, trigger_hint, campaign_advance (what the MAIN campaign gains when this beat closes — e.g. "learn the sigil-maker's symbol", "Henrick leads party to the bolt-hole faction")
- Bump momentum +10–25 when the player repeats the same beat without progress; set ready_to_resolve when momentum >= 70
- When a beat closes: remove it from plot_threads and add open_threads/session facts that bridge into the next beat of the SAME campaign
- Always set campaign_throughline to the current main-campaign focus in one sentence
- Derive everything from play — do NOT invent unrelated plotlines`;

      const userContent = JSON.stringify({
        player_message: input.playerMessage,
        dm_response: input.dmResponse,
        decision: input.controllerDecision,
        roll_success: input.rollResult?.success,
        campaign_chronicle: input.campaignChronicle,
        state_summary: input.statePacket.campaign.sessionSummary,
        party_positions: input.statePacket.partyPositions,
        existing_plot_threads: input.statePacket.campaign.plotThreads,
        campaign_throughline: input.statePacket.campaign.campaignThroughline,
        active_quest: input.statePacket.activeQuest,
        open_threads: input.statePacket.campaign.openThreads,
      });

      return callJson(client, config.ai.models.memory, system, userContent, parseMemoryExtractor);
    },

    async extractNarrationSfx(input: NarrationSfxInput) {
      const system = `Extract contextual sound effects for TTS narration. Output JSON: { "cues": [...] }.
Each cue: id (short slug), anchor_phrase (exact substring from narration for timing), prompt (ElevenLabs SFX generation — no speech), duration_seconds (0.8–3.5), volume (0.12–0.85).
Rules:
- Max ${input.maxCues ?? 3} cues; only sounds the narration explicitly evokes (pulse, hum, clang, drip, crowd, magic whoosh, etc.)
- Prompts describe ONE brief sound — no music beds, no dialogue
- Prefer subtle under-speech volumes (0.15–0.45) unless the moment is loud (scream, explosion)
- anchor_phrase MUST appear verbatim in the narration text
- Return empty cues array if nothing sensory is described`;

      const userContent = JSON.stringify({
        narration: input.narrationText,
        location: input.locationName,
        mood: input.sceneMood,
        max_cues: input.maxCues ?? 3,
      });

      return callJson(
        client,
        config.ai.models.memory,
        system,
        userContent,
        parseNarrationSfxExtractor,
      );
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
      const system = `Decide if a scene image should be generated or an existing location asset reused.
Output JSON: should_generate_image, reason, asset_type, reuse_existing_asset_id, new_asset_needed, change_summary.

Generate images for IMPORTANT visual moments — not every line of dialogue:
- YES: new location first visit, major scene change, combat erupting, dramatic reveals, camp at night, pivotal NPC introduction, strong flavor moments
- NO: routine movement, short replies, repeating the same unchanged location, pure mechanical rolls
Reuse location images when returning to a known place unless the scene changed dramatically (fire, destruction, time of day shift).`;

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
