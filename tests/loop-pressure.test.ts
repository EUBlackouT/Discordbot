import { describe, expect, it } from 'vitest';
import {
  classifyPlayerGoal,
  detectLoopPressure,
  inferTravelFromContext,
} from '../src/dm/plot/loop-pressure.js';
import { syncBumpPlotMomentum, seedProgressionBeat } from '../src/dm/chronicle/plot-momentum-sync.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config/index.js';

describe('loop pressure', () => {
  it('classifies escape and follow goals', () => {
    expect(classifyPlayerGoal('ok lets be off then, we have no time to spare')).toBe('move_away');
    expect(classifyPlayerGoal('ok i stay by henrick and we escape')).toBe('move_away');
    expect(classifyPlayerGoal('i follow the crier into the alley')).toBe('follow');
  });

  it('detects repeated escape attempts', () => {
    const recent = ['ok lets be off then', 'while escaping i glance back'];
    const pressure = detectLoopPressure(recent, 'ok i stay by henrick and we escape');
    expect(pressure.repeatCount).toBeGreaterThanOrEqual(2);
    expect(pressure.forceUrgent).toBe(true);
    expect(pressure.controllerPolicy).toContain('LOOP PRESSURE');
    expect(pressure.narratorPolicy).toContain('ANTI-LOOP');
  });

  it('requires travel after three escape attempts', () => {
    const recent = ['ok lets be off then', 'we escape now', 'stay by henrick and run'];
    const pressure = detectLoopPressure(recent, 'ok i stay by henrick and we escape');
    expect(pressure.requireTravel).toBe(true);
  });

  it('infers travel from chronicle hints without hardcoded slugs', () => {
    const chronicle = 'Old Henrick: fleeing toward the old quarter through rain-slick alleys';
    const travel = inferTravelFromContext(
      chronicle,
      'we escape with him',
      { name: 'Mistharbor Execution Yard', slug: 'mistharbor-execution-yard' },
    );
    expect(travel?.type).toBe('travel_to_location');
    expect(String(travel?.name).toLowerCase()).toContain('old quarter');
    expect(travel?.slug).not.toBe('mistharbor-execution-yard');
  });

  it('seeds and bumps plot momentum in chronicle', async () => {
    const campaignId = `test-loop-${Date.now()}`;
    const dir = path.join(config.campaign.dataDir, campaignId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'chronicle.txt'),
      `# Campaign\n\n## Current Situation\nRiot at the yard.\n\n## Progression Beats\n[]\n`,
      'utf8',
    );

    const beat = seedProgressionBeat('Riot at the yard.', { title: 'Marked', description: 'Escape the yard.' });
    expect(beat.momentum).toBeGreaterThan(0);

    const threads = await syncBumpPlotMomentum(campaignId, 20, {
      activeQuest: { title: 'Marked', description: 'Escape.' },
    });
    expect(threads[0].momentum).toBeGreaterThanOrEqual(35);

    await fs.rm(dir, { recursive: true, force: true });
  });
});
