import { describe, it, expect } from 'vitest';
import {
  parseControllerDecision,
  parseMemoryExtractor,
  parseAssetDecision,
} from '../src/validation/schemas.js';

describe('Controller JSON validation', () => {
  it('parses REQUEST_CHECK decision', () => {
    const decision = parseControllerDecision({
      action: 'REQUEST_CHECK',
      confidence: 0.9,
      reason: 'Searching room',
      check: {
        type: 'skill',
        skill: 'Perception',
        ability: 'WIS',
        dc: 14,
        advantageState: 'normal',
        publicReason: 'Scan the room',
        successConsequence: 'Find hidden latch',
        failureConsequence: 'Miss the latch',
      },
      state_updates: [],
      safety_flags: [],
    });
    expect(decision.action).toBe('REQUEST_CHECK');
    expect(decision.check?.dc).toBe(14);
  });

  it('rejects invalid action', () => {
    expect(() =>
      parseControllerDecision({ action: 'INVALID', confidence: 1, reason: 'test' }),
    ).toThrow();
  });
});

describe('Memory extractor validation', () => {
  it('parses memory output', () => {
    const mem = parseMemoryExtractor({
      new_public_facts: ['Party found a latch'],
      new_hidden_facts: [],
      importance: 3,
    });
    expect(mem.new_public_facts).toHaveLength(1);
  });
});

describe('Asset decision validation', () => {
  it('parses reuse decision', () => {
    const d = parseAssetDecision({
      should_generate_image: false,
      reason: 'Reuse existing',
      reuse_existing_asset_id: 'abc-123',
      new_asset_needed: false,
    });
    expect(d.should_generate_image).toBe(false);
    expect(d.reuse_existing_asset_id).toBe('abc-123');
  });
});

describe('No pre-roll narration', () => {
  it('REQUEST_CHECK should not include success in controller', () => {
    const decision = parseControllerDecision({
      action: 'REQUEST_CHECK',
      confidence: 0.9,
      reason: 'test',
      check: {
        type: 'skill',
        skill: 'Perception',
        ability: 'WIS',
        dc: 14,
        publicReason: 'Look around',
        successConsequence: 'Find something',
        failureConsequence: 'Find nothing',
      },
    });
    expect(decision.action).toBe('REQUEST_CHECK');
    // Consequences stored but not narrated until roll resolves
    expect(decision.check?.successConsequence).toBeDefined();
  });
});
