import { describe, it, expect } from 'vitest';
import {
  buildActingPlayerContext,
  scopeStateForActingPlayer,
  isMultiplayerCampaign,
  resolveLocationForActingPlayer,
  resolveCombatRoster,
  isCharacterInActiveCombat,
  buildDistantCombatPolicy,
} from '../src/campaign/party-positions.js';
import type { CampaignStatePacket } from '../src/campaign/state.js';

function mockState(overrides: Partial<CampaignStatePacket> = {}): CampaignStatePacket {
  return {
    campaign: {
      id: 'c1',
      name: 'Test',
      sessionSummary: '',
      dangerLevel: 3,
      openThreads: [],
      currentSceneId: null,
      currentLocationId: 'yard',
    },
    scene: null,
    location: {
      id: 'yard',
      name: 'Execution Yard',
      description: 'Outside',
      visualDescription: '',
      mood: 'tense',
      activeAssetId: null,
      currentChanges: '',
    },
    activeCharacters: [],
    partyPositions: [],
    locationsById: {
      yard: {
        id: 'yard',
        name: 'Execution Yard',
        description: 'Outside',
        visualDescription: '',
        mood: 'tense',
        activeAssetId: null,
        currentChanges: '',
      },
      house: {
        id: 'house',
        name: 'Guardhouse Interior',
        description: 'Inside',
        visualDescription: '',
        mood: 'dim',
        activeAssetId: null,
        currentChanges: '',
      },
    },
    activeNpcs: [],
    activeQuest: null,
    publicMemories: [],
    hiddenMemories: [],
    recentTurns: [],
    pendingChecks: [],
    combat: null,
    visualStyle: null,
    ...overrides,
  };
}

describe('multiplayer party positions', () => {
  it('detects split party', () => {
    const state = mockState({
      partyPositions: [
        { characterId: 'a', discordId: 'd1', name: 'Gyro', locationId: 'yard', locationName: 'Execution Yard' },
        { characterId: 'b', discordId: 'd2', name: 'Mira', locationId: 'house', locationName: 'Guardhouse Interior' },
      ],
    });
    expect(isMultiplayerCampaign(state)).toBe(true);
  });

  it('scopes narration location to acting player', () => {
    const state = mockState({
      partyPositions: [
        { characterId: 'a', discordId: 'd1', name: 'Gyro', locationId: 'yard', locationName: 'Execution Yard' },
        { characterId: 'b', discordId: 'd2', name: 'Mira', locationId: 'house', locationName: 'Guardhouse Interior' },
      ],
    });

    const acting = buildActingPlayerContext(state, 'd2', 'b', 'Mira');
    expect(acting?.locationName).toBe('Guardhouse Interior');
    expect(acting?.separatedParty).toEqual([{ name: 'Gyro', locationName: 'Execution Yard' }]);

    const pov = resolveLocationForActingPlayer(state, acting);
    expect(pov?.name).toBe('Guardhouse Interior');

    const scoped = scopeStateForActingPlayer(state, acting);
    expect(scoped.location?.id).toBe('house');
  });

  it('lists co-located allies', () => {
    const state = mockState({
      partyPositions: [
        { characterId: 'a', discordId: 'd1', name: 'Gyro', locationId: 'yard', locationName: 'Execution Yard' },
        { characterId: 'b', discordId: 'd2', name: 'Mira', locationId: 'yard', locationName: 'Execution Yard' },
      ],
    });
    const acting = buildActingPlayerContext(state, 'd1', 'a');
    expect(acting?.coLocatedParty).toEqual(['Mira']);
    expect(acting?.separatedParty).toEqual([]);
  });

  it('resolves combat roster to co-located PCs only', () => {
    const state = mockState({
      partyPositions: [
        { characterId: 'a', discordId: 'd1', name: 'Gyro', locationId: 'yard', locationName: 'Execution Yard' },
        { characterId: 'b', discordId: 'd2', name: 'Mira', locationId: 'house', locationName: 'Guardhouse Interior' },
      ],
    });
    const roster = resolveCombatRoster(state, 'a');
    expect(roster.inCombatIds).toEqual(['a']);
    expect(roster.absentNames).toEqual(['Mira']);
  });

  it('excludes distant PCs from active combat participation', () => {
    const combat: NonNullable<CampaignStatePacket['combat']> = {
      id: 'fight1',
      round: 1,
      currentTurn: 0,
      status: 'active',
      currentTurnName: 'Gyro',
      locationId: 'yard',
      locationName: 'Execution Yard',
      absentParty: ['Mira'],
      participants: [
        {
          id: 'a',
          name: 'Gyro',
          type: 'player',
          hp: 20,
          maxHp: 20,
          ac: 14,
          isDefeated: false,
          isUnconscious: false,
          concentratingOn: null,
          conditions: [],
          spellSlotsRemaining: null,
          deathSaveSuccesses: null,
          deathSaveFailures: null,
        },
        {
          id: 'e1',
          name: 'Guard',
          type: 'enemy',
          hp: 11,
          maxHp: 11,
          ac: 16,
          isDefeated: false,
          isUnconscious: false,
          concentratingOn: null,
          conditions: [],
          spellSlotsRemaining: null,
          deathSaveSuccesses: null,
          deathSaveFailures: null,
        },
      ],
      summary: '',
      reinforcementsArrived: [],
    };
    expect(isCharacterInActiveCombat(combat, 'a')).toBe(true);
    expect(isCharacterInActiveCombat(combat, 'b')).toBe(false);
    expect(buildDistantCombatPolicy(combat, 'b', 'Mira')).toContain('NOT in this encounter');
  });

  it('filters NPCs to acting player location', () => {
    const state = mockState({
      partyPositions: [
        { characterId: 'a', discordId: 'd1', name: 'Gyro', locationId: 'yard', locationName: 'Execution Yard' },
      ],
      activeNpcs: [
        { id: 'n1', name: 'Sergeant', description: '', attitude: 'hostile', goals: '', locationId: 'yard', elevenLabsVoiceId: '', voiceLabel: '' },
        { id: 'n2', name: 'Cook', description: '', attitude: 'neutral', goals: '', locationId: 'house', elevenLabsVoiceId: '', voiceLabel: '' },
      ],
    });
    const acting = buildActingPlayerContext(state, 'd1', 'a');
    const scoped = scopeStateForActingPlayer(state, acting);
    expect(scoped.activeNpcs.map((n) => n.name)).toEqual(['Sergeant']);
  });
});
