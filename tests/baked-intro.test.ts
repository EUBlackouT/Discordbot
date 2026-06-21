import { describe, expect, it } from 'vitest';
import { buildOpeningVoiceScript } from '../src/campaign/intro.js';
import { openingScriptHash } from '../src/voice/baked-intro.js';

describe('baked intro', () => {
  it('has a stable hash for the generic-crowd script', () => {
    const hash1 = openingScriptHash();
    const hash2 = openingScriptHash();
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{16}$/);
  });

  it('uses generic crowd line in baked script (no party names)', () => {
    const segs = buildOpeningVoiceScript();
    expect(segs[0]?.text).toContain('You are packed in with strangers and dockhands');
    expect(segs[0]?.text).not.toMatch(/\*\*/);
  });
});
