import type { NpcSpeechRegister } from './npc-speech-style.js';

export type SpeechEmotion =
  | 'neutral'
  | 'tense'
  | 'fearful'
  | 'angry'
  | 'urgent'
  | 'sad'
  | 'whisper'
  | 'excited'
  | 'mysterious'
  | 'dramatic'
  | 'commanding'
  | 'desperate';

export interface SpeechDeliveryContext {
  isNpc?: boolean;
  npcName?: string;
  npcDescription?: string;
  npcAttitude?: string;
  speechRegister?: NpcSpeechRegister;
  sceneMood?: string;
  controllerAction?: string;
  combatActive?: boolean;
}

export interface ElevenVoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

export interface PreparedSpeech {
  text: string;
  modelId: string;
  voiceSettings: ElevenVoiceSettings;
  emotion: SpeechEmotion;
}
