import type { CampaignStatePacket } from '../../campaign/state.js';
import type {
  AIService,
  ControllerInput,
  NarratorInput,
  MemoryExtractorInput,
  ImagePromptInput,
} from './types.js';
import type { ControllerDecision, MemoryExtractorOutput, AssetDecision } from '../../validation/schemas.js';
import { narrationLimitsForMode } from '../../campaign/message-mode.js';

/** Deterministic mock AI for local dev and tests without API keys */
export function createMockAIProvider(): AIService {
  return {
    async generateControllerDecision(input: ControllerInput): Promise<ControllerDecision> {
      const msg = input.playerMessage.toLowerCase();
      const character = input.statePacket.activeCharacters.find(
        (c) => c.id === input.characterId,
      ) ?? input.statePacket.activeCharacters[0];

      if (input.messageMode === 'observe') {
        const seesHenrick = /henrick|henrik/.test(msg);
        return {
          action: 'NARRATE',
          confidence: 0.95,
          reason: 'Player asked an observation question — answer briefly from chronicle.',
          narration_instruction: seesHenrick
            ? 'Answer yes or no: is Old Henrick still visible ahead? One sentence based on chronicle.'
            : 'Answer the player\'s question directly in one sentence from chronicle context.',
          state_updates: [],
          safety_flags: [],
        };
      }

      if (msg.includes('search') || msg.includes('investigate') || msg.includes('look') || msg.includes('scan')) {
        return {
          action: 'REQUEST_CHECK',
          confidence: 0.9,
          reason: 'Player is searching for something with meaningful consequences.',
          target_player_id: input.playerDiscordId,
          target_character_id: character?.id,
          check: {
            type: 'skill',
            skill: msg.includes('investigate') ? 'Investigation' : 'Perception',
            ability: msg.includes('investigate') ? 'INT' : 'WIS',
            dc: 14,
            advantageState: 'normal',
            publicReason: 'You carefully examine the area for anything out of place.',
            successConsequence: 'You notice disturbed dust near a hidden latch in the floor.',
            failureConsequence: 'You find nothing unusual—the hidden latch goes unnoticed.',
          },
          narration_instruction: 'Build tension. Ask the player to roll.',
          state_updates: [],
          safety_flags: [],
        };
      }

      if (msg.includes('henrick') || msg.includes('henrik') || (msg.includes('follow') && msg.includes('old'))) {
        return {
          action: 'START_SCENE',
          confidence: 0.95,
          reason: 'Player is following Old Henrick — advance to pursuit in the old quarter.',
          narration_instruction:
            'The party pushes through the riot after Old Henrick. Describe his herald coat, the dropped bell, watch whistles behind them, and ducking into narrow old-quarter alleys. Henrick glances back once — he knows something about the prisoner.',
          state_updates: [
            {
              type: 'travel_to_location',
              slug: 'mistharbor-old-quarter',
              name: 'Old Quarter Alleys',
              description: 'Narrow alleys between timber frames, rain-slick cobbles, shuttered windows.',
              visual_description: 'Dark medieval alley at night in heavy rain, lantern glow, wet cobblestones, timber buildings',
              mood: 'pursuit, dread',
            },
            {
              type: 'update_session_summary',
              summary: 'The party followed Old Henrick into the old quarter during the execution-yard riot.',
            },
          ],
          asset_decision_hint: { location_image_relevant: true },
          safety_flags: [],
        };
      }

      if (msg.includes('attack') || msg.includes('fight')) {
        return {
          action: 'START_COMBAT',
          confidence: 0.85,
          reason: 'Player initiated combat.',
          narration_instruction: 'Describe combat beginning. Use /combat commands.',
          state_updates: [],
          safety_flags: [],
        };
      }

      return {
        action: 'NARRATE',
        confidence: 0.8,
        reason: 'General action without check needed.',
        narration_instruction: `Narrate the outcome of the player's action: "${input.playerMessage}". Advance the scene — do not re-ask the same choice.`,
        state_updates: [
          {
            type: 'update_session_summary',
            summary: `The party acted: ${input.playerMessage.slice(0, 120)}`,
          },
        ],
        asset_decision_hint: { location_image_relevant: false },
        safety_flags: [],
      };
    },

    async generateNarration(input: NarratorInput): Promise<string> {
      const { controllerDecision, rollResult, playerMessage, messageMode } = input;
      const limits = narrationLimitsForMode(messageMode ?? 'action');

      if (controllerDecision.action === 'REQUEST_CHECK') {
        const check = controllerDecision.check!;
        return `Rain drums against the cobblestones as you ${check.publicReason.toLowerCase()}.\n\n**Roll ${check.skill ?? check.ability}** — DC ${check.dc}. Use \`/check\` when ready.`;
      }

      if (rollResult) {
        const consequence = rollResult.success
          ? rollResult.successConsequence
          : rollResult.failureConsequence;
        return `${rollResult.breakdown}\n\n${rollResult.success ? 'Success!' : 'Failure.'}\n\n${consequence}`;
      }

      if (limits.brief) {
        if (/henrick|henrik/.test(playerMessage.toLowerCase())) {
          return 'Yes — Old Henrick is still ahead of you, a hunched silhouette ducking between rain-darkened doorways.';
        }
        return controllerDecision.narration_instruction ?? 'You take in the scene around you.';
      }

      const instruction = controllerDecision.narration_instruction ?? '';
      return `${instruction}\n\nThe story moves forward.`;
    },

    async extractMemory(input: MemoryExtractorInput): Promise<MemoryExtractorOutput> {
      const facts: string[] = [];
      if (input.rollResult?.success) {
        facts.push('The party discovered a hidden latch in the execution yard.');
      } else if (input.rollResult && !input.rollResult.success) {
        facts.push('The party searched the area but found nothing obvious.');
      }

      return {
        new_public_facts: facts,
        new_hidden_facts: [],
        character_updates: [],
        npc_updates: [],
        location_updates: [],
        quest_updates: [],
        faction_updates: [],
        asset_updates: [],
        open_threads_added: [],
        open_threads_resolved: [],
        session_summary_update: input.statePacket.campaign.sessionSummary,
        chronicle_situation: input.statePacket.location
          ? `The party is in ${input.statePacket.location.name}. ${input.playerMessage.slice(0, 100)}`
          : undefined,
        chronicle_npc_status: [],
        chronicle_turn_line: input.playerMessage.slice(0, 120),
        importance: 3,
      };
    },

    async summarizeSession(statePacket: CampaignStatePacket): Promise<string> {
      return statePacket.campaign.sessionSummary;
    },

    async generateAssetDecision(statePacket: CampaignStatePacket): Promise<AssetDecision> {
      const location = statePacket.location;
      if (!location) {
        return { should_generate_image: false, reason: 'No location context', new_asset_needed: false };
      }

      if (location.activeAssetId) {
        return {
          should_generate_image: false,
          reason: 'Reusing existing location asset',
          asset_type: 'location',
          reuse_existing_asset_id: location.activeAssetId,
          new_asset_needed: false,
        };
      }

      if (location.visualDescription && statePacket.campaign.id) {
        return {
          should_generate_image: true,
          reason: 'First visit to major location without asset',
          asset_type: 'location',
          new_asset_needed: true,
        };
      }

      return { should_generate_image: false, reason: 'Not a major visual moment', new_asset_needed: false };
    },

    async generateImagePrompt(input: ImagePromptInput): Promise<{ prompt: string; negativePrompt: string }> {
      const style = input.styleProfile;
      const prompt = [
        input.assetType === 'character_portrait' ? 'Character portrait' : 'Location scene',
        input.subjectName,
        input.canonicalDescription,
        input.appearanceOrVisual,
        input.mood ? `Mood: ${input.mood}` : '',
        `Style: ${style.artStyle}`,
        `Palette: ${style.colorPalette}`,
        `Lighting: ${style.lightingMood}`,
        input.changeSummary ? `Changes: ${input.changeSummary}` : '',
        'No text, no watermark, no UI.',
      ]
        .filter(Boolean)
        .join('. ');

      return {
        prompt,
        negativePrompt: style.negativePrompt ?? 'text, watermark, UI, modern objects',
      };
    },
  };
}

