import { describe, expect, it } from 'vitest';
import { buildAmbienceContext } from '../src/voice/ambience-context.js';
import { resolveAmbienceSpec } from '../src/voice/ambience-resolver.js';

describe('buildAmbienceContext', () => {
  it('returns undefined without a location', () => {
    expect(buildAmbienceContext({ location: null })).toBeUndefined();
  });

  it('includes slug and combat flag', () => {
    const ctx = buildAmbienceContext(
      {
        location: {
          id: 'loc-1',
          name: 'Old Quarter Alleys',
          slug: 'old-quarter-alleys',
          description: 'A narrow rainy alley',
          mood: 'tense',
        },
        scene: { mood: 'charged' },
        combat: null,
      },
      undefined,
      false,
    );
    expect(ctx?.locationSlug).toBe('old-quarter-alleys');
    expect(ctx?.combatActive).toBe(false);
    expect(ctx?.sceneMood).toBe('charged');
  });
});

describe('resolveAmbienceSpec', () => {
  it('picks alley archetype for alley locations', () => {
    const spec = resolveAmbienceSpec({
      locationName: 'Old Quarter Alleys',
      locationSlug: 'mistharbor-alleys',
      description: 'rain-slick cobbles between tall warehouses',
    });
    expect(spec.label).toBe('alley');
    expect(spec.prompt.toLowerCase()).toContain('alley');
  });

  it('picks harbor for dock scenes', () => {
    const spec = resolveAmbienceSpec({
      locationName: 'Mistharbor Docks',
      description: 'gulls and rigging above the wharf',
    });
    expect(spec.label).toBe('harbor');
  });

  it('uses combat bed when combat is active', () => {
    const spec = resolveAmbienceSpec({
      locationName: 'Market Square',
      combatActive: true,
    });
    expect(spec.label).toBe('combat');
  });

  it('picks tavern for inn scenes', () => {
    const spec = resolveAmbienceSpec({
      locationName: 'The Rusty Anchor Inn',
      mood: 'warm',
    });
    expect(spec.label).toBe('tavern');
  });
});
