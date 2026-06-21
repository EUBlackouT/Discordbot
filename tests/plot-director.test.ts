import { describe, expect, it } from 'vitest';
import {
  formatPlotThreadsForController,
  formatPlotThreadsForPlayers,
  plotThreadsNeedingResolution,
} from '../src/dm/plot/plot-director.js';
import type { PlotThread } from '../src/validation/schemas.js';

const sampleThread: PlotThread = {
  id: 'follow-henrick',
  title: 'Chasing Old Henrick',
  summary: 'The party is pursuing Henrick through the riot toward the old quarter.',
  campaign_tie: 'Henrick may know who staged the vanishing.',
  stakes: 'He may reach allies before the watch seals the alleys.',
  status: 'active',
  momentum: 75,
  possible_endings: [
    {
      id: 'cornered',
      summary: 'Henrick slips into a bolt-hole and barricades the door.',
      trigger_hint: 'Party closes distance or blocks alley exits.',
      campaign_advance: 'Party gains a lead on the faction behind the vanishing.',
    },
    {
      id: 'lost',
      summary: 'Crowd and side-streets swallow the trail.',
      trigger_hint: 'Party delays or fails checks while chasing.',
      campaign_advance: 'Watch pressure rises; party must find another path into the conspiracy.',
    },
  ],
  controller_guidance: 'Show progress each turn — not the same chase description.',
};

describe('plot director', () => {
  it('anchors beats to the main campaign in controller text', () => {
    const text = formatPlotThreadsForController([sampleThread], {
      campaignThroughline: 'Expose who erased the prisoner and survive the political fallout.',
      primaryQuest: { title: 'The Vanished Spy', description: 'Find proof of who vanished the condemned man.' },
    });
    expect(text).toContain('MAIN CAMPAIGN');
    expect(text).toContain('NOT the end of the campaign');
    expect(text).toContain('Serves main campaign');
    expect(text).toContain('main campaign: Party gains a lead');
  });

  it('formats player-facing threads with throughline', () => {
    const text = formatPlotThreadsForPlayers([sampleThread], {
      campaignThroughline: 'Expose who erased the prisoner.',
    });
    expect(text).toContain('Main campaign');
    expect(text).toContain('not a campaign finale');
    expect(text).toContain('Chasing Old Henrick');
  });

  it('flags high-momentum beats needing closure', () => {
    expect(plotThreadsNeedingResolution([sampleThread])).toHaveLength(1);
    expect(plotThreadsNeedingResolution([{ ...sampleThread, momentum: 20 }])).toHaveLength(0);
  });
});
