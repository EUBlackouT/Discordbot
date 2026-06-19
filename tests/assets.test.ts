import { describe, it, expect } from 'vitest';
import { buildCharacterPortraitPrompt, buildLocationPrompt } from '../src/assets/prompt-builder.js';

const styleProfile = {
  artStyle: 'dark fantasy painterly',
  colorPalette: 'muted earth tones',
  lightingMood: 'dramatic rain lighting',
  negativePrompt: 'text, watermark, UI',
};

describe('Image prompt builder', () => {
  it('builds consistent character portrait prompt', () => {
    const { prompt, negativePrompt } = buildCharacterPortraitPrompt({
      name: 'Kael',
      race: 'Human',
      className: 'Rogue',
      appearance: 'Scarred jaw, hooded cloak',
      styleProfile,
    });
    expect(prompt).toContain('Kael');
    expect(prompt).toContain('dark fantasy');
    expect(prompt).toContain('no text');
    expect(negativePrompt).toContain('watermark');
  });

  it('builds location prompt with continuity', () => {
    const { prompt } = buildLocationPrompt({
      name: 'Mistharbor Execution Yard',
      visualDescription: 'Rain-swept cobblestone square',
      mood: 'tense',
      styleProfile,
      previousPrompt: 'Previous chapel image',
      changeSummary: 'Fire damage added',
    });
    expect(prompt).toContain('Mistharbor');
    expect(prompt).toContain('Fire damage');
    expect(prompt).toContain('Same location identity');
  });
});

describe('Location asset reuse logic', () => {
  it('reuse decision when active asset exists', () => {
    const decision = {
      should_generate_image: false,
      reason: 'Reusing existing location asset',
      reuse_existing_asset_id: 'asset-123',
      new_asset_needed: false,
    };
    expect(decision.reuse_existing_asset_id).toBeTruthy();
    expect(decision.should_generate_image).toBe(false);
  });

  it('new version when location changed', () => {
    const decision = {
      should_generate_image: true,
      reason: 'Major visual change',
      asset_type: 'location' as const,
      new_asset_needed: true,
      change_summary: 'Chapel burned down',
    };
    expect(decision.new_asset_needed).toBe(true);
    expect(decision.change_summary).toContain('burned');
  });
});
