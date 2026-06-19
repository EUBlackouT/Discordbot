import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config/index.js';
import {
  ensureChronicle,
  readChronicle,
  applyChronicleFromMemory,
  getChroniclePath,
} from '../src/dm/chronicle/campaign-chronicle.js';

const TEST_ID = 'test-chronicle-campaign';

describe('campaign chronicle', () => {
  beforeEach(async () => {
    await ensureChronicle(TEST_ID, 'Test Campaign', 'Opening situation.');
  });

  afterEach(async () => {
    const dir = path.join(config.campaign.dataDir, TEST_ID);
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates and reads chronicle file', async () => {
    const text = await readChronicle(TEST_ID);
    expect(text).toContain('Current Situation');
    expect(text).toContain('Opening situation');
    await expect(fs.access(getChroniclePath(TEST_ID))).resolves.toBeUndefined();
  });

  it('updates situation and npc status from memory', async () => {
    await applyChronicleFromMemory(
      TEST_ID,
      {
        new_public_facts: ['Party left Sister Caldra at the yard'],
        new_hidden_facts: [],
        character_updates: [],
        npc_updates: [],
        location_updates: [],
        quest_updates: [],
        faction_updates: [],
        asset_updates: [],
        open_threads_added: [],
        open_threads_resolved: [],
        session_summary_update: 'Party tails Henrick in the old quarter',
        chronicle_situation:
          'The party is in the Old Quarter Alleys, tailing Old Henrick. Sister Caldra was left behind at the execution yard.',
        chronicle_npc_status: [
          { name: 'Old Henrick', status: 'ahead in the alleys, frightened' },
          { name: 'Sister Caldra Venn', status: 'at execution yard, not with party' },
        ],
        chronicle_turn_line: 'Followed Henrick stealthily; left Caldra behind',
        importance: 4,
      },
      { playerMessage: 'follow henrick', characterName: 'Gyro' },
    );

    const text = await readChronicle(TEST_ID);
    expect(text).toContain('Sister Caldra was left behind');
    expect(text).toContain('Sister Caldra Venn: at execution yard, not with party');
    expect(text).toContain('Party left Sister Caldra at the yard');
    expect(text).toContain('Followed Henrick stealthily');
  });
});
