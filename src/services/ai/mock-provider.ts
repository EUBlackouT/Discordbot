import type { CampaignStatePacket } from '../../campaign/state.js';
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
import type { ControllerDecision, MemoryExtractorOutput, AssetDecision } from '../../validation/schemas.js';
import { narrationLimitsForMode } from '../../campaign/message-mode.js';
import { findNpcInMessage } from '../../campaign/npc-speech.js';
import { OFFLINE_VOICE_POOL, fallbackVoicePick } from '../../voice/voice-registry.js';
import type { CheckOutcomeTier } from '../../game/checks/check-display.js';

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

      const addressedNpc = findNpcInMessage(input.playerMessage, input.statePacket.activeNpcs);
      if (input.messageMode === 'dialogue' && addressedNpc) {
        return {
          action: 'NPC_DIALOGUE',
          confidence: 0.95,
          reason: 'Player spoke to an NPC.',
          npc_name: addressedNpc.name,
          narration_instruction: 'Answer the player in first person; stay in character.',
          state_updates: [],
          safety_flags: [],
        };
      }

      if (
        msg.includes('search') ||
        msg.includes('investigate') ||
        msg.includes('inspect') ||
        msg.includes('examine') ||
        msg.includes('look') ||
        msg.includes('scan')
      ) {
        const investigation =
          msg.includes('investigate') || msg.includes('inspect') || msg.includes('examine');
        return {
          action: 'REQUEST_CHECK',
          confidence: 0.9,
          reason: 'Player is searching for something with meaningful consequences.',
          target_player_id: input.playerDiscordId,
          target_character_id: character?.id,
          check: {
            type: 'skill',
            skill: investigation ? 'Investigation' : 'Perception',
            ability: investigation ? 'INT' : 'WIS',
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
          narration_instruction: 'Describe steel ringing and the fight erupting.',
          combat: {
            enemies: [{ name: 'Hostile Guard', ac: 16, hp: 11, attackBonus: 3, damage: '1d6+1' }],
            danger_level: 4,
          },
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
        return `${check.publicReason}\n\nTap **Roll** when ready.`;
      }

      if (rollResult) {
        const tier = (rollResult.outcomeTier ?? (rollResult.success ? 'solid_success' : 'solid_failure')) as CheckOutcomeTier;
        const consequence = rollResult.success
          ? rollResult.successConsequence
          : rollResult.failureConsequence;
        const firstBeat = consequence.split(/[.!?]/)[0]?.trim() ?? consequence;
        switch (tier) {
          case 'critical_success':
            return `${firstBeat}. The truth clicks into place — more than you hoped for.`;
          case 'solid_success':
            return `${firstBeat}.`;
          case 'bare_success':
            return `${firstBeat} — though you cannot be sure what it means yet.`;
          case 'bare_failure':
            return `Almost. ${firstBeat}, but the answer slips away.`;
          case 'critical_failure':
            return `${firstBeat}. Worse — you may have misread the scene entirely.`;
          case 'solid_failure':
          default:
            return `${firstBeat}.`;
        }
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

    async generateNpcDialogue(input: NpcDialogueInput): Promise<string> {
      const topic = input.playerMessage.toLowerCase();
      if (/omen|sigil/.test(topic)) {
        return `*Rain beads on my hood as I lean close.*\n\n"I saw it too — that pale mark in the sky. It's not a blessing. Someone wanted witnesses branded before the truth could spread. We need to move before Thornvale's watch decides we're the witchcraft they're hunting."`;
      }
      return `*${input.npc.name} meets your eyes.*\n\n"I hear you. Ask what you will — but speak quickly."`;
    },

    async assignNpcVoice(input: NpcVoiceCastInput) {
      const voices = input.englishVoices.length > 0
        ? input.englishVoices
        : OFFLINE_VOICE_POOL.map((v) => ({ voice_id: v.voiceId, name: v.name }));
      const pool = voices.map((v) => ({
        voiceId: String(v.voice_id),
        name: String(v.name ?? v.voice_id),
        gender: (v as { gender?: string }).gender,
        age: (v as { age?: string }).age,
        description: (v as { description?: string }).description,
      }));
      const pick = fallbackVoicePick(input.npc, pool, input.usedVoiceIds);
      if (!pick) {
        const fallback = voices[0];
        return {
          voice_id: fallback ? String(fallback.voice_id) : '',
          voice_label: fallback ? String(fallback.name ?? 'unknown') : 'unknown',
          reason: 'mock fallback empty',
        };
      }
      return {
        voice_id: pick.voiceId,
        voice_label: pick.name,
        reason: 'mock profile cast',
      };
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
        plot_threads:
          input.statePacket.campaign.plotThreads.length > 0
            ? input.statePacket.campaign.plotThreads
            : input.rollResult?.success
              ? [
                  {
                    id: 'follow-henrick',
                    title: 'Chasing Old Henrick',
                    summary: 'The party is pursuing Henrick through the riot.',
                    campaign_tie: 'Henrick may know who staged the vanishing — catching or losing him shapes the main conspiracy arc.',
                    stakes: 'He reaches allies in the old quarter before the watch seals the alleys.',
                    status: 'active' as const,
                    momentum: 25,
                    possible_endings: [
                      {
                        id: 'cornered',
                        summary: 'Henrick barricades a bolt-hole.',
                        trigger_hint: 'Party closes distance or blocks exits.',
                        campaign_advance: 'Party gains a lead on the faction hiding vanishers.',
                      },
                      {
                        id: 'lost',
                        summary: 'The crowd swallows the trail.',
                        trigger_hint: 'Delays or failed checks during the chase.',
                        campaign_advance: 'Watch tightens on witnesses; party must find another way into the conspiracy.',
                      },
                    ],
                    controller_guidance: 'Show chase progress each turn; close the beat when momentum rises.',
                  },
                ]
              : [],
        campaign_throughline:
          input.statePacket.campaign.campaignThroughline ||
          input.statePacket.activeQuest?.title ||
          'Uncover who staged the execution-yard vanishing and survive the fallout.',
        importance: 3,
      };
    },

    async extractNarrationSfx(input: NarrationSfxInput) {
      const text = input.narrationText;
      const cues = [];
      const pulseMatch = text.match(/\b(puls(e|ing)|throb(bing)?)\b/i);
      if (pulseMatch && pulseMatch.index !== undefined) {
        cues.push({
          id: 'pulse',
          anchor_phrase: pulseMatch[0],
          prompt: 'Low rhythmic magical pulse, soft throbbing energy, brief',
          duration_seconds: 2.2,
          volume: 0.35,
        });
      }
      const humMatch = text.match(/\b(hum(ming)?|thrum(ming)?|energy|residue|arcane)\b/i);
      if (humMatch && humMatch.index !== undefined && cues.length < (input.maxCues ?? 3)) {
        cues.push({
          id: 'energy_hum',
          anchor_phrase: humMatch[0],
          prompt: 'Soft magical energy hum, faint crackle, brief',
          duration_seconds: 2,
          volume: 0.3,
        });
      }
      return { cues: cues.slice(0, input.maxCues ?? 3) };
    },

    async summarizeSession(statePacket: CampaignStatePacket): Promise<string> {
      return statePacket.campaign.sessionSummary;
    },

    async generateAssetDecision(
      statePacket: CampaignStatePacket,
      hint?: ControllerDecision['asset_decision_hint'],
    ): Promise<AssetDecision> {
      const location = statePacket.location;
      if (!location) {
        return { should_generate_image: false, reason: 'No location context', new_asset_needed: false };
      }

      if (hint?.location_image_relevant && !location.activeAssetId) {
        return {
          should_generate_image: true,
          reason: 'Controller flagged a major visual moment at a new vista',
          asset_type: 'location',
          new_asset_needed: true,
        };
      }

      if (location.activeAssetId && !hint?.location_image_relevant) {
        return {
          should_generate_image: false,
          reason: 'Reusing existing location asset',
          asset_type: 'location',
          reuse_existing_asset_id: location.activeAssetId,
          new_asset_needed: false,
        };
      }

      if (!location.activeAssetId && location.visualDescription) {
        return {
          should_generate_image: true,
          reason: 'First visit to a described location without art',
          asset_type: 'location',
          new_asset_needed: true,
        };
      }

      if (hint?.location_image_relevant) {
        return {
          should_generate_image: true,
          reason: 'Flavor or dramatic beat at current location',
          asset_type: 'location',
          new_asset_needed: !location.activeAssetId,
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

