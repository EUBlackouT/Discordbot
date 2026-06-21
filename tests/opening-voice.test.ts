import { describe, expect, it } from 'vitest';
import { buildOpeningVoiceScript } from '../src/campaign/intro.js';

describe('buildOpeningVoiceScript', () => {
  it('alternates narrator and named NPC speakers with narrator setup before each quote', () => {
    const segs = buildOpeningVoiceScript({ partyNames: ['Aldric'] });
    expect(segs.length).toBeGreaterThanOrEqual(7);
    expect(segs.filter((s) => s.kind === 'narrator').length).toBeGreaterThan(2);
    const thornvaleIdx = segs.findIndex((s) => s.npcName === 'Captain Mira Thornvale');
    const caldraIdx = segs.findIndex((s) => s.npcName === 'Sister Caldra Venn');
    expect(thornvaleIdx).toBeGreaterThan(0);
    expect(caldraIdx).toBeGreaterThan(thornvaleIdx);
    expect(segs[thornvaleIdx - 1]?.kind).toBe('narrator');
    expect(segs[thornvaleIdx - 1]?.text).toMatch(/Mira Thornvale/i);
    expect(segs[caldraIdx - 1]?.kind).toBe('narrator');
    expect(segs[caldraIdx - 1]?.text).toMatch(/Caldra Venn/i);
    expect(segs[thornvaleIdx]?.kind).toBe('npc');
    expect(segs[caldraIdx]?.kind).toBe('npc');
    expect(segs[thornvaleIdx]?.text).toMatch(/Witchcraft/i);
    expect(segs[caldraIdx]?.text).toMatch(/seaward alleys/i);
    expect(segs[caldraIdx]?.text).toMatch(/whispers/i);
  });

  it('isolates the Henrick mid-sentence beat with a long pause after', () => {
    const segs = buildOpeningVoiceScript();
    const beatIdx = segs.findIndex((s) => s.text === 'Then Henrick stops mid-sentence.');
    expect(beatIdx).toBeGreaterThan(0);
    expect(segs[beatIdx]?.pauseAfterMs).toBeGreaterThanOrEqual(1000);
    expect(segs[beatIdx + 1]?.text).toMatch(/hooded figure vanishes/i);
  });
});
