import { describe, it, expect } from 'vitest';
import {
  detectRestIntent,
  detectCampContinuation,
} from '../src/game/combat/rest-intent.js';
import { isCampPending, CAMP_PENDING_THREAD } from '../src/game/combat/rest.js';

describe('rest-intent', () => {
  it('detects camp and long rest phrases', () => {
    expect(detectRestIntent('we make camp for the night')).toBe(true);
    expect(detectRestIntent('long rest')).toBe(true);
    expect(detectRestIntent('I attack the guard')).toBe(false);
  });

  it('detects camp continuation activities', () => {
    expect(detectCampContinuation('I take first watch')).toBe(true);
    expect(detectCampContinuation('I go to sleep')).toBe(true);
    expect(detectCampContinuation('I attack the guard')).toBe(false);
  });
});

describe('camp pending state', () => {
  it('tracks camp in progress via open threads', () => {
    expect(isCampPending(['Quest A', CAMP_PENDING_THREAD])).toBe(true);
    expect(isCampPending(['Quest A'])).toBe(false);
  });
});
