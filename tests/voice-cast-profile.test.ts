import { describe, expect, it } from 'vitest';
import { INTRO_NPCS } from '../src/campaign/intro.js';
import { OFFLINE_VOICE_POOL } from '../src/voice/voice-registry.js';
import {
  inferVoiceCastProfile,
  pickVoiceForNpcProfile,
  scoreVoiceForProfile,
} from '../src/voice/voice-cast-profile.js';

const SARAH_ID = 'EXAVITQu4vr4xnSDxMaL';
const NARRATOR_ID = 'onwK4e9ZLuTAKqWW03F9';

describe('voice cast profile', () => {
  it('profiles Thornvale as commanding authority', () => {
    const profile = inferVoiceCastProfile(INTRO_NPCS[0]!);
    expect(profile.gender).toBe('female');
    expect(profile.role).toBe('authority');
    expect(profile.archetype).toMatch(/authority/i);
    expect(profile.idealVoiceBrief).toMatch(/stern|command|riot/i);
    expect(profile.toneHints).toContain('commanding');
    expect(profile.avoidHints).toContain('warm');
  });

  it('scores Sarah poorly for a watch captain', () => {
    const profile = inferVoiceCastProfile(INTRO_NPCS[0]!);
    const sarah = OFFLINE_VOICE_POOL.find((v) => v.voiceId === SARAH_ID)!;
    expect(scoreVoiceForProfile(sarah, profile)).toBeLessThan(1);
  });

  it('does not cast Thornvale as Sarah from the offline pool', () => {
    const pick = pickVoiceForNpcProfile(INTRO_NPCS[0]!, OFFLINE_VOICE_POOL, [], NARRATOR_ID);
    expect(pick).toBeDefined();
    expect(pick!.voiceId).not.toBe(SARAH_ID);
    expect(pick!.name).not.toMatch(/Sarah/i);
  });

  it('casts Henrick as an older male voice when available', () => {
    const henrick = INTRO_NPCS[2]!;
    const pick = pickVoiceForNpcProfile(henrick, OFFLINE_VOICE_POOL, [], NARRATOR_ID);
    expect(pick?.gender).toBe('male');
    expect(['old', 'middle-aged']).toContain(pick?.age);
  });

  it('keeps intro NPC casts distinct', () => {
    const thornvale = pickVoiceForNpcProfile(INTRO_NPCS[0]!, OFFLINE_VOICE_POOL, [], NARRATOR_ID)!;
    const caldra = pickVoiceForNpcProfile(
      INTRO_NPCS[1]!,
      OFFLINE_VOICE_POOL,
      [thornvale.voiceId],
      NARRATOR_ID,
    )!;
    expect(caldra.voiceId).not.toBe(thornvale.voiceId);
  });
});
