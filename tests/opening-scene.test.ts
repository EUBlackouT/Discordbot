import { describe, it, expect } from 'vitest';
import { buildOpeningSceneContent } from '../src/campaign/intro.js';
import { buildCampaignOpeningPayload } from '../src/bot/onboarding.js';

describe('campaign opening presentation', () => {
  it('tells the scene as prose with Henrick in the narrative', () => {
    const scene = buildOpeningSceneContent({ partyNames: ['Gyro ironbark'] });
    expect(scene.narrative).toContain('Henrick');
    expect(scene.narrative).toContain('Gyro ironbark');
    expect(scene.narrative).toContain('Caldra');
    expect(scene.narrative).toContain('Thornvale');
    expect(scene.narrative).not.toContain('Why flee');
    expect(scene.choices).toHaveLength(3);
  });

  it('uses a minimal two-embed layout without mechanic fields', () => {
    const scene = buildOpeningSceneContent();
    const { embeds, components } = buildCampaignOpeningPayload('The Veiled Compact', scene, {
      party: [{ characterName: 'Gyro ironbark' }],
    });
    expect(embeds).toHaveLength(2);
    expect(embeds[1].data.fields ?? []).toHaveLength(0);
    expect(components[0].components).toHaveLength(3);
  });
});
