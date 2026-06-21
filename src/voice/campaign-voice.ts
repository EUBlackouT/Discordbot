import type { CampaignTurnResult } from '../core/campaign-loop.js';
import { config } from '../config/index.js';
import { voiceManager } from './voice-manager.js';
import { getNarratorVoiceId } from './npc-voice-service.js';
import type { SpeechDeliveryContext } from './speech-delivery.js';
import { logger } from '../utils/logger.js';

import type { NpcSpeechRegister } from './npc-speech-style.js';

function deliveryFromResult(result: CampaignTurnResult): SpeechDeliveryContext {
  return {
    isNpc: Boolean(result.npcVoiceId),
    npcName: result.npcSpeaker,
    npcDescription: result.npcDescription,
    npcAttitude: result.npcAttitude,
    speechRegister: result.speechRegister as NpcSpeechRegister | undefined,
    sceneMood: result.sceneMood,
    controllerAction: result.controllerAction,
    combatActive: result.combatActive,
  };
}

/** Speak campaign narration in the guild voice channel when connected. */
export function speakCampaignTurn(
  guildId: string,
  result: CampaignTurnResult,
): void {
  if (result.isPrivate || !result.narration?.trim()) return;
  if (!voiceManager.isConnected(guildId)) {
    logger.info('Voice skip: not connected (use `/voice join`, not manual move only)');
    return;
  }

  const delivery = deliveryFromResult(result);
  const isNpcLine = Boolean(result.npcVoiceId);
  const isNpcDialogue = result.controllerAction === 'NPC_DIALOGUE';

  if (
    isNpcLine &&
    !isNpcDialogue &&
    config.voice.speakMode === 'narration'
  ) {
    logger.info('Voice skip: NPC line with VOICE_SPEAK_MODE=narration (set to `all` for ambient NPC speech)');
    return;
  }

  if (config.voice.speakMode === 'off') {
    logger.info('Voice skip: VOICE_SPEAK_MODE=off');
    return;
  }

  if (isNpcLine && result.npcVoiceId) {
    voiceManager.speakWithVoice(guildId, result.narration, result.npcVoiceId, delivery, {
      campaignId: result.campaignId,
      ambience: result.ambience,
    });
    return;
  }

  voiceManager.speakWithVoice(guildId, result.narration, getNarratorVoiceId(), delivery, {
    campaignId: result.campaignId,
    ambience: result.ambience,
  });
}
