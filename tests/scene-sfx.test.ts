import { describe, expect, it } from 'vitest';
import { buildOpeningVoiceScript } from '../src/campaign/intro.js';
import { findSpotSfxPlacements } from '../src/voice/scene-sfx.js';

describe('scene spot SFX', () => {
  it('finds bell, retch, and manacles in the vanishing paragraph', () => {
    const segs = buildOpeningVoiceScript();
    const beatIdx = segs.findIndex((s) => s.text === 'Then Henrick stops mid-sentence.');
    const vanishing = segs[beatIdx + 1];
    expect(vanishing).toBeDefined();
    const cues = findSpotSfxPlacements(vanishing!.text, 3);
    const ids = cues.map((c) => c.cue.id);
    expect(ids).toContain('manacles');
    expect(ids).toContain('retch');
    expect(ids).toContain('crowd_scream');
  });

  it('finds bell in Henrick setup paragraph', () => {
    const segs = buildOpeningVoiceScript();
    const setup = segs.find((s) => s.text.includes('bell hangs'));
    expect(setup).toBeDefined();
    expect(findSpotSfxPlacements(setup!.text, 3).map((c) => c.cue.id)).toContain('bell');
  });

  it('finds bell and gates in the closing narrator block', () => {
    const segs = buildOpeningVoiceScript();
    const closing = segs[segs.length - 1]!;
    const ids = findSpotSfxPlacements(closing.text, 3).map((c) => c.cue.id);
    expect(ids).toContain('bell');
    expect(ids).toContain('gates');
  });

  it('finds pulse and energy cues in magical inspection narration', () => {
    const text =
      'The shackles pulse with pale energy; arcane residue clings to the iron like frost.';
    const ids = findSpotSfxPlacements(text, 3).map((c) => c.cue.id);
    expect(ids).toContain('pulse');
    expect(ids).toContain('energy_hum');
  });
});
