import { describe, expect, it } from 'vitest';
import { INTRO_NPCS } from '../src/campaign/intro.js';
import { inferNpcGender } from '../src/voice/voice-gender.js';

describe('inferNpcGender', () => {
  it('reads explicit gender on intro NPCs', () => {
    expect(inferNpcGender(INTRO_NPCS[0]!)).toBe('female');
    expect(inferNpcGender(INTRO_NPCS[1]!)).toBe('female');
    expect(inferNpcGender(INTRO_NPCS[2]!)).toBe('male');
  });

  it('infers from description when gender omitted', () => {
    expect(inferNpcGender({ description: 'A young woman in green robes' })).toBe('female');
    expect(inferNpcGender({ description: 'An elderly man with a broken bell' })).toBe('male');
  });
});
