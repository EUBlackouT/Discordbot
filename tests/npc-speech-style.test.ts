import { describe, expect, it } from 'vitest';
import { INTRO_NPCS } from '../src/campaign/intro.js';
import {
  buildDialogueStyleHint,
  inferNpcSpeechRegister,
  registerToV3Tag,
} from '../src/voice/npc-speech-style.js';

describe('npc speech register', () => {
  it('maps Thornvale to command delivery', () => {
    expect(inferNpcSpeechRegister(INTRO_NPCS[0]!)).toBe('military_clipped');
    expect(buildDialogueStyleHint('military_clipped')).toMatch(/terse/i);
    expect(registerToV3Tag('military_clipped')).toBe('[firm]');
  });

  it('maps desperate Caldra to fearful hushed delivery', () => {
    expect(inferNpcSpeechRegister(INTRO_NPCS[1]!)).toBe('fearful_hushed');
    expect(registerToV3Tag('fearful_hushed')).toBe('[nervously]');
  });

  it('maps Henrick to elder raspy delivery', () => {
    expect(inferNpcSpeechRegister(INTRO_NPCS[2]!)).toBe('elder_raspy');
  });
});
