import { describe, expect, it } from 'vitest';
import { detectMetaIntent } from '../src/campaign/player-intent.js';

describe('detectMetaIntent', () => {
  it('detects recap questions', () => {
    expect(detectMetaIntent('can you recap what happened?')).toBe('recap');
    expect(detectMetaIntent('catch me up')).toBe('recap');
  });

  it('detects location questions', () => {
    expect(detectMetaIntent('where are we?')).toBe('location');
    expect(detectMetaIntent('describe the scene')).toBe('location');
  });

  it('detects quest and party questions', () => {
    expect(detectMetaIntent('what are our objectives?')).toBe('quests');
    expect(detectMetaIntent("who's in the party?")).toBe('party');
  });

  it('returns null for in-world actions', () => {
    expect(detectMetaIntent('I draw my sword and charge the guard')).toBeNull();
    expect(detectMetaIntent('I sneak toward the warehouse door')).toBeNull();
  });
});
