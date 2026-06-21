import { describe, expect, it } from 'vitest';
import { AMBIENCE_BED_ARCHETYPES } from '../src/voice/ambience-resolver.js';
import { isAudioLibraryReady } from '../src/voice/audio-library.js';
import { SPOT_SFX_CUES } from '../src/voice/scene-sfx.js';

describe('audio library', () => {
  it('defines beds for common scene types', () => {
    expect(AMBIENCE_BED_ARCHETYPES).toContain('execution');
    expect(AMBIENCE_BED_ARCHETYPES).toContain('forest');
    expect(AMBIENCE_BED_ARCHETYPES).toContain('tavern');
    expect(AMBIENCE_BED_ARCHETYPES.length).toBeGreaterThanOrEqual(10);
  });

  it('has spot cues for intro moments', () => {
    const ids = SPOT_SFX_CUES.map((c) => c.id);
    expect(ids).toContain('bell');
    expect(ids).toContain('retch');
    expect(ids).toContain('manacles');
  });

  it('is ready when baked assets exist on disk', async () => {
    const ready = await isAudioLibraryReady();
    expect(ready).toBe(true);
  });
});
