import { describe, expect, it } from 'vitest';
import { findSpotSfxPlacements } from '../src/voice/scene-sfx.js';
import { resolveNarrationSfxPlacements } from '../src/voice/narration-sfx-resolver.js';

describe('live narration SFX', () => {
  it('matches pulsing energy from investigation success narration', () => {
    const text =
      'The manacles still hum with residue — a slow pulsing beneath the iron, tugging your attention toward the alleys.';
    const cues = findSpotSfxPlacements(text, 3);
    const ids = cues.map((c) => c.cue.id);
    expect(ids).toContain('pulse');
    expect(ids.some((id) => id === 'energy_hum' || id === 'chain')).toBe(true);
  });

  it('resolves AI cues when regex alone is insufficient', async () => {
    const text = 'You feel a faint thrum in the stones — something alive and wrong.';
    const placements = await resolveNarrationSfxPlacements(text, 2);
    expect(placements.length).toBeGreaterThan(0);
  });
});
