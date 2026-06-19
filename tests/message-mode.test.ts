import { describe, it, expect } from 'vitest';
import { classifyMessageMode, narrationLimitsForMode } from '../src/campaign/message-mode.js';

describe('classifyMessageMode', () => {
  it('treats visibility questions as observe', () => {
    expect(classifyMessageMode('do i still see henrick?')).toBe('observe');
    expect(classifyMessageMode('can I see him ahead?')).toBe('observe');
  });

  it('treats actions as action', () => {
    expect(classifyMessageMode('i pull away from her and follow Henrick, but i try to stay out of sight')).toBe(
      'action',
    );
  });

  it('limits observe replies to brief', () => {
    const limits = narrationLimitsForMode('observe');
    expect(limits.brief).toBe(true);
    expect(limits.maxParagraphs).toBe(1);
    expect(limits.maxTokens).toBeLessThanOrEqual(150);
  });
});
