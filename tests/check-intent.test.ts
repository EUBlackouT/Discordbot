import { describe, it, expect } from 'vitest';
import {
  detectPlayerCheckIntent,
  detectInspectIntent,
  buildRequestCheckDecision,
} from '../src/game/checks/check-intent.js';
import { parseControllerDecision } from '../src/validation/schemas.js';

describe('detectPlayerCheckIntent', () => {
  it('detects explicit investigation check with typo', () => {
    const intent = detectPlayerCheckIntent('i want to do a investigastion check');
    expect(intent?.skill).toBe('Investigation');
    expect(intent?.ability).toBe('INT');
  });

  it('detects roll perception', () => {
    const intent = detectPlayerCheckIntent('can I roll a perception check?');
    expect(intent?.skill).toBe('Perception');
  });
});

describe('detectInspectIntent', () => {
  it('detects inspect without saying check', () => {
    const intent = detectInspectIntent('i want to inspect the area the prisoner vanished from');
    expect(intent?.skill).toBe('Investigation');
    expect(intent?.dc).toBe(14);
    expect(intent?.publicReason).toMatch(/inspect|examine|Investigation/i);
    expect(intent?.successConsequence).not.toContain('scorch marks');
  });

  it('does not double-trigger when player says check', () => {
    expect(detectInspectIntent('i want to do an investigation check')).toBeNull();
  });

  it('tailors consequences to what the player is searching for', () => {
    const intent = detectInspectIntent('search the room for jewelry');
    expect(intent?.publicReason).toContain('jewelry');
    expect(intent?.failureConsequence).toContain('jewelry');
  });
});

describe('buildRequestCheckDecision', () => {
  it('produces valid controller decision', () => {
    const intent = detectInspectIntent('inspect the scaffold')!;
    const decision = buildRequestCheckDecision(intent, 'user-1', 'char-1');
    expect(decision.action).toBe('REQUEST_CHECK');
    expect(decision.check?.skill).toBe('Investigation');
  });
});

describe('normalizeCheckObject via parseControllerDecision', () => {
  it('fixes AI returning type investigation instead of skill', () => {
    const parsed = parseControllerDecision({
      action: 'REQUEST_CHECK',
      confidence: 0.9,
      reason: 'roll',
      check: {
        type: 'investigation',
      },
      state_updates: [],
      safety_flags: [],
    });
    expect(parsed.check?.type).toBe('skill');
    expect(parsed.check?.skill).toBe('Investigation');
    expect(parsed.check?.ability).toBe('INT');
    expect(parsed.check?.dc).toBe(14);
    expect(parsed.check?.publicReason).toBeTruthy();
  });
});
