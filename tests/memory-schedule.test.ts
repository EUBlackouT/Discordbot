import { describe, expect, it } from 'vitest';
import { awaitPendingMemoryExtraction } from '../src/dm/memory/schedule-extraction.js';

describe('awaitPendingMemoryExtraction', () => {
  it('resolves immediately when no extraction is queued', async () => {
    await expect(awaitPendingMemoryExtraction('no-such-campaign-id')).resolves.toBeUndefined();
  });
});
