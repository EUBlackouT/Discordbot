import { describe, it, expect } from 'vitest';
import { slugify } from '../src/dm/state/apply-controller-updates.js';

describe('applyControllerStateUpdates helpers', () => {
  it('slugifies location names', () => {
    expect(slugify('Old Quarter Alleys')).toBe('old-quarter-alleys');
    expect(slugify('Mistharbor — Execution Yard')).toBe('mistharbor-execution-yard');
  });
});
