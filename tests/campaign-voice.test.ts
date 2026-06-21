import { describe, expect, it, vi, beforeEach } from 'vitest';

const { speakWithVoice, isConnected } = vi.hoisted(() => ({
  speakWithVoice: vi.fn(),
  isConnected: vi.fn(() => true),
}));

vi.mock('../src/voice/voice-manager.js', () => ({
  voiceManager: {
    isConnected,
    speakWithVoice,
  },
}));

vi.mock('../src/voice/npc-voice-service.js', () => ({
  getNarratorVoiceId: () => 'narrator-id',
}));

vi.mock('../src/config/index.js', () => ({
  config: {
    voice: {
      speakMode: 'narration',
    },
  },
}));

import { speakCampaignTurn } from '../src/voice/campaign-voice.js';

describe('speakCampaignTurn', () => {
  beforeEach(() => {
    speakWithVoice.mockClear();
    isConnected.mockReturnValue(true);
  });

  it('speaks NPC dialogue even when VOICE_SPEAK_MODE is narration', () => {
    speakCampaignTurn('guild-1', {
      narration: 'Aye, I hear ye, lad!',
      controllerAction: 'NPC_DIALOGUE',
      npcVoiceId: 'henrick-voice',
      npcSpeaker: 'Old Henrick the Crier',
      campaignId: 'camp-1',
    });

    expect(speakWithVoice).toHaveBeenCalledWith(
      'guild-1',
      'Aye, I hear ye, lad!',
      'henrick-voice',
      expect.objectContaining({ isNpc: true }),
      expect.any(Object),
    );
  });
});
