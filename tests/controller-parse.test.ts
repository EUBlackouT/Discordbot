import { describe, it, expect } from 'vitest';
import { parseControllerDecision } from '../src/validation/schemas.js';

describe('parseControllerDecision', () => {
  it('unwraps nested controller payloads', () => {
    const parsed = parseControllerDecision({
      decision: {
        action: 'NARRATE',
        confidence: 0.9,
        reason: 'test',
        state_updates: [],
        safety_flags: [],
      },
    });
    expect(parsed.action).toBe('NARRATE');
    expect(parsed.confidence).toBe(0.9);
  });

  it('maps common alternate field names', () => {
    const parsed = parseControllerDecision({
      action_type: 'START_SCENE',
      confidence: 1,
      rationale: 'scene change',
      narrationInstruction: 'describe alleys',
      stateUpdates: [],
      safetyFlags: [],
    });
    expect(parsed.action).toBe('START_SCENE');
    expect(parsed.reason).toBe('scene change');
    expect(parsed.narration_instruction).toBe('describe alleys');
  });
});
