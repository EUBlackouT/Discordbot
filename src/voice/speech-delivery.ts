import { config } from '../config/index.js';
import { stripActionBeats, stripForSpeech } from './text-for-speech.js';
import {
  applyDeliveryDirectives,
  buildDeliveryDirective,
  voiceSettingsForDirective,
} from './speech-delivery-directives.js';
import type {
  ElevenVoiceSettings,
  PreparedSpeech,
  SpeechDeliveryContext,
  SpeechEmotion,
} from './speech-delivery-types.js';

export type { ElevenVoiceSettings, PreparedSpeech, SpeechDeliveryContext, SpeechEmotion } from './speech-delivery-types.js';

function modelSupportsAudioTags(modelId: string): boolean {
  return modelId.includes('eleven_v3') || modelId === 'eleven_v3';
}

export function resolveTtsModel(isNpc: boolean, ctx?: SpeechDeliveryContext): string {
  if (!isNpc) {
    return config.voice.narratorTtsModelId || config.voice.ttsModelId;
  }
  if (config.voice.emotionsEnabled && config.voice.npcTtsModelId) {
    return config.voice.npcTtsModelId;
  }
  return config.voice.ttsModelId;
}

export function inferSpeechEmotion(text: string, ctx: SpeechDeliveryContext): SpeechEmotion {
  const lower = text.toLowerCase();
  const attitude = (ctx.npcAttitude ?? '').toLowerCase();
  const mood = (ctx.sceneMood ?? '').toLowerCase();

  if (ctx.controllerAction === 'START_SCENE' && !ctx.isNpc) return 'dramatic';

  if (/\b(whisper|murmur|hiss(?:es)?|under (?:your|their|my) breath)\b/i.test(lower)) return 'whisper';
  if (/\b(laugh|chuckle|grin|thank|bless|wonderful|glad)\w*/i.test(lower)) return 'excited';
  if (/\b(trembl|terror|panic|frighten|afraid|scared|help me|mercy)\w*/i.test(lower)) return 'fearful';

  if (ctx.isNpc) {
    if (/!{2,}|\b(shout|yell|roar|bellow|scream)s?\b/i.test(lower)) return 'angry';
    if (/\b(seize|clear that|halt|front ranks|witchcraft|arrest them|orders)\b/i.test(lower) && /!/.test(text)) {
      return 'commanding';
    }
    if (/desperate|frantic|panicked|pleading/.test(attitude)) return 'desperate';
    if (/fearful|terrified|afraid|panicked/.test(attitude)) return 'fearful';
    if (/commanding|captain|marshal|stern|authoritative|disciplined|iron/.test(attitude)) {
      return /!/.test(text) ? 'commanding' : 'tense';
    }
    if (/hostile|angry|scorn|furious/.test(attitude)) return 'angry';
    if (/urgent/.test(attitude)) return 'urgent';
    if (/sorrow|grief|mournful/.test(attitude)) return 'sad';
  }

  if (/\b(sigh|grief|mourn|weep|tear|sob)\w*/i.test(lower)) return 'sad';
  if (/\b(hurry|rush|now\b|quickly|run)\b/i.test(lower) && /!/.test(text)) return 'urgent';
  if (/\b(ominous|shadow|dread|eerie|uncanny)\b/i.test(lower)) return 'mysterious';
  if (ctx.combatActive) return 'urgent';
  if (/tense|danger|threat|hostile|charged|riot/.test(mood)) return 'tense';
  if (/ominous|dread|foreboding/.test(mood)) return 'mysterious';
  if (ctx.controllerAction === 'NPC_DIALOGUE' && /!/.test(text)) return 'dramatic';

  return 'neutral';
}

export function prepareSpeechForTts(
  rawText: string,
  ctx: SpeechDeliveryContext,
  maxChars: number,
): PreparedSpeech {
  const isNpc = Boolean(ctx.isNpc);
  const modelId = resolveTtsModel(isNpc, ctx);
  const cleaned = stripActionBeats(stripForSpeech(rawText));
  const emotion = config.voice.emotionsEnabled ? inferSpeechEmotion(cleaned, ctx) : 'neutral';

  let text = cleaned;
  if (text.length > maxChars) {
    const cut = text.slice(0, maxChars);
    const lastSentence = cut.lastIndexOf('. ');
    text =
      lastSentence > maxChars * 0.5 ? cut.slice(0, lastSentence + 1).trim() : `${cut.trim()}…`;
  }

  let voiceSettings: ElevenVoiceSettings = {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.32,
    use_speaker_boost: true,
  };

  if (config.voice.emotionsEnabled && modelSupportsAudioTags(modelId)) {
    const directive = buildDeliveryDirective(text, emotion, ctx);
    const chronicler = !isNpc;
    text = applyDeliveryDirectives(text, directive, { chronicler });
    voiceSettings = voiceSettingsForDirective(directive, { chronicler });
    return { text, modelId, voiceSettings, emotion: directive.emotion };
  }

  return { text, modelId, voiceSettings, emotion };
}
