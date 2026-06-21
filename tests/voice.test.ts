import { describe, expect, it } from 'vitest';
import { stripForSpeech, truncateForSpeech, stripActionBeats } from '../src/voice/text-for-speech.js';
import {
  filterEnglishVoices,
  fallbackVoicePick,
  isEnglishVoice,
  OFFLINE_VOICE_POOL,
} from '../src/voice/voice-registry.js';
import {
  inferSpeechEmotion,
  prepareSpeechForTts,
} from '../src/voice/speech-delivery.js';

describe('stripForSpeech', () => {
  it('removes markdown formatting', () => {
    const input = '**Bold** and *italic* with `code` and [link](https://x.com)';
    expect(stripForSpeech(input)).toBe('Bold and italic with code and link');
  });

  it('collapses excessive newlines', () => {
    expect(stripForSpeech('Line one\n\n\n\nLine two')).toBe('Line one\n\nLine two');
  });
});

describe('stripActionBeats', () => {
  it('removes leading italic stage directions', () => {
    const input = '*Rain beads on my hood.*\n\n"I saw the sigil too."';
    expect(stripActionBeats(input)).toBe('"I saw the sigil too."');
  });
});

describe('truncateForSpeech', () => {
  it('truncates long text at sentence boundary when possible', () => {
    const long = 'A'.repeat(100) + '. ' + 'B'.repeat(200);
    const out = truncateForSpeech(long, 120);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('.')).toBe(true);
  });

  it('adds ellipsis when no sentence break', () => {
    const out = truncateForSpeech('x'.repeat(200), 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});

describe('isEnglishVoice', () => {
  it('accepts explicit English language', () => {
    expect(isEnglishVoice({ voiceId: 'a', name: 'Test', language: 'en' })).toBe(true);
  });

  it('rejects non-English when language is set', () => {
    expect(isEnglishVoice({ voiceId: 'a', name: 'Test', language: 'de' })).toBe(false);
  });
});

describe('filterEnglishVoices', () => {
  it('excludes narrator voice id from pool', () => {
    const voices = [
      { voiceId: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
      { voiceId: 'abc123', name: 'Other' },
    ];
    const filtered = filterEnglishVoices(voices);
    expect(filtered.some((v) => v.voiceId === 'onwK4e9ZLuTAKqWW03F9')).toBe(false);
    expect(filtered.some((v) => v.voiceId === 'abc123')).toBe(true);
  });
});

describe('fallbackVoicePick', () => {
  it('picks deterministically per NPC name', () => {
    const a = fallbackVoicePick('Old Henrick', OFFLINE_VOICE_POOL, []);
    const b = fallbackVoicePick('Old Henrick', OFFLINE_VOICE_POOL, []);
    const c = fallbackVoicePick('Captain Mira', OFFLINE_VOICE_POOL, []);
    expect(a?.voiceId).toBe(b?.voiceId);
    expect(c?.voiceId).not.toBe(a?.voiceId);
  });

  it('avoids already-used voices when possible', () => {
    const used = [OFFLINE_VOICE_POOL[0].voiceId];
    const pick = fallbackVoicePick('Test NPC', OFFLINE_VOICE_POOL, used);
    expect(pick?.voiceId).not.toBe(used[0]);
  });
});

describe('inferSpeechEmotion', () => {
  it('detects fearful NPC attitude', () => {
    expect(
      inferSpeechEmotion('We need to leave now.', {
        isNpc: true,
        npcAttitude: 'fearful',
      }),
    ).toBe('fearful');
  });

  it('detects whisper from prose', () => {
    expect(inferSpeechEmotion('She leaned in to whisper the secret.', {})).toBe('whisper');
  });

  it('detects combat urgency', () => {
    expect(inferSpeechEmotion('Steel rings out.', { combatActive: true })).toBe('urgent');
  });
});

describe('prepareSpeechForTts', () => {
  it('prepends v3 audio tag for NPC fear', () => {
    const prepared = prepareSpeechForTts(
      '*trembling* "They are coming for us!"',
      { isNpc: true, npcAttitude: 'fearful' },
      500,
    );
    expect(prepared.modelId).toBe('eleven_v3');
    expect(prepared.text).toMatch(/^\[nervously\]/);
    expect(prepared.voiceSettings.stability).toBeLessThan(0.5);
  });

  it('uses lower style for neutral narrator', () => {
    const prepared = prepareSpeechForTts('The rain continues.', { isNpc: false }, 500);
    expect(prepared.emotion).toBe('neutral');
    expect(prepared.voiceSettings.stability).toBeGreaterThan(0.4);
  });
});
