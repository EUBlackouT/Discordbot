import { describe, it, expect } from 'vitest';
import {
  detectCombatAction,
  detectCombatStartIntent,
  buildStartCombatDecision,
} from '../src/game/combat/combat-intent.js';
import { formatCombatStatus } from '../src/game/combat/combat-service.js';
import { planSpellResolution, parseSpellActionEconomy } from '../src/game/combat/spell-combat.js';
import { canCastSpell, getRemainingSlots, getSpellSlotState } from '../src/game/combat/spell-slots.js';
import { rollDeathSave } from '../src/game/combat/death-saves.js';
import { buildCombatBrief } from '../src/game/combat/combat-ai-context.js';
import { concentrationSaveDc, rollConcentrationSave } from '../src/game/combat/concentration.js';
import { extractKillEvents, buildKillNarrationInstruction } from '../src/game/combat/combat-display.js';
import type { AttackResult } from '../src/game/combat/combat-service.js';
import type { CampaignStatePacket } from '../src/campaign/state.js';
import type { Character } from '@prisma/client';

const cleric = {
  id: 'c1',
  className: 'Cleric',
  abilityMods: JSON.stringify({ STR: 0, DEX: 1, CON: 0, INT: 2, WIS: 3, CHA: 1 }),
  proficiencyBonus: 2,
  spellcasting: JSON.stringify({ cantrips: ['guidance'], spellsPrepared: ['cure-wounds', 'guiding-bolt'] }),
} as Character;

describe('combat-intent', () => {
  it('detects attack actions', () => {
    expect(detectCombatAction('I attack the guard')?.kind).toBe('attack');
    expect(detectCombatAction('end my turn')?.kind).toBe('end_turn');
  });

  it('detects spell casting', () => {
    const intent = detectCombatAction('I cast guiding bolt at the cultist');
    expect(intent?.kind).toBe('cast_spell');
    expect(intent?.spellKey).toBe('guiding-bolt');
  });

  it('detects shield reaction', () => {
    expect(detectCombatAction('cast shield')?.kind).toBe('reaction');
  });

  it('detects charge into melee as combat start', () => {
    const intent = detectCombatStartIntent('I draw my mace and charge towards the guard!', []);
    expect(intent?.enemies[0]?.name).toBe('City Guard');
  });

  it('builds start combat decision with inferred enemies', () => {
    const intent = detectCombatStartIntent('I attack the guard', []);
    expect(intent?.enemies[0]?.name).toBe('City Guard');
    const decision = buildStartCombatDecision(intent!, 'user1', 'char1');
    expect(decision.action).toBe('START_COMBAT');
    expect(decision.combat?.enemies?.length).toBeGreaterThan(0);
  });
});

describe('combat display', () => {
  it('formats initiative tracker', () => {
    const text = formatCombatStatus(
      [
        { id: 'p1', name: 'Hero', type: 'player', ac: 16, hp: 10, maxHp: 10, initiative: 18, conditions: [] },
        { id: 'e1', name: 'Guard', type: 'enemy', ac: 14, hp: 5, maxHp: 11, initiative: 12, conditions: [] },
      ],
      1,
      0,
    );
    expect(text).toContain('Hero');
    expect(text).toContain('Guard');
    expect(text).toContain('▶');
  });
});

describe('spell-combat', () => {
  it('plans heal and attack spells differently', () => {
    const heal = planSpellResolution('cure-wounds', cleric);
    const bolt = planSpellResolution('guiding-bolt', cleric);
    expect(heal?.kind).toBe('heal');
    expect(bolt?.kind).toBe('attack');
  });
});

describe('spell slots', () => {
  it('blocks leveled spells when slots are exhausted', () => {
    const spellcasting = JSON.stringify({
      cantrips: ['guidance'],
      spellsPrepared: ['cure-wounds'],
      slotsUsed: { '1': 2 },
    });
    const state = getSpellSlotState(spellcasting);
    expect(canCastSpell(spellcasting, 'guidance').ok).toBe(true);
    expect(canCastSpell(spellcasting, 'cure-wounds').ok).toBe(false);
    expect(getRemainingSlots(state)['1']).toBeUndefined();
  });
});

describe('death saves', () => {
  it('returns structured save results', () => {
    const result = rollDeathSave(1, 1);
    expect(result.breakdown).toBeTruthy();
    expect(typeof result.died).toBe('boolean');
    expect(typeof result.stabilized).toBe('boolean');
  });
});

describe('combat AI context', () => {
  it('builds canonical HP brief for the DM', () => {
    const packet = {
      campaign: { dangerLevel: 3 },
      combat: {
        round: 2,
        currentTurnName: 'Hero',
        reinforcementsArrived: ['Shadow Cultist'],
        participants: [
          {
            id: 'p1',
            name: 'Hero',
            type: 'player',
            hp: 8,
            maxHp: 12,
            ac: 16,
            isDefeated: false,
            isUnconscious: false,
            concentratingOn: 'bless',
            conditions: [],
          },
          {
            id: 'e1',
            name: 'Guard',
            type: 'enemy',
            hp: 0,
            maxHp: 11,
            ac: 14,
            isDefeated: true,
            isUnconscious: false,
            concentratingOn: null,
            conditions: [],
          },
        ],
      },
    } as unknown as CampaignStatePacket;

    const brief = buildCombatBrief(packet);
    expect(brief).toContain('HP 8/12');
    expect(brief).toContain('[DOWN]');
    expect(brief).toContain('Shadow Cultist');
    expect(brief).toContain('do not invent');
  });
});

describe('concentration', () => {
  it('uses 5e DC formula', () => {
    expect(concentrationSaveDc(22)).toBe(11);
    expect(concentrationSaveDc(8)).toBe(10);
  });

  it('rolls concentration saves', () => {
    const result = rollConcentrationSave(2, 10);
    expect(result.dc).toBe(10);
    expect(typeof result.success).toBe('boolean');
  });
});

describe('kill narration', () => {
  it('extracts kill events from attack results', () => {
    const attacks: AttackResult[] = [
      {
        attackerId: 'p1',
        attackerName: 'Hero',
        targetId: 'e1',
        targetName: 'Guard',
        targetType: 'enemy',
        hit: true,
        critical: true,
        natural1: false,
        attackRoll: 20,
        attackTotal: 25,
        targetAc: 16,
        damage: 18,
        targetHpAfter: 0,
        targetDefeated: true,
        breakdown: 'crit',
        method: 'weapon',
      },
    ];
    const kills = extractKillEvents(attacks);
    expect(kills).toHaveLength(1);
    expect(kills[0].victimName).toBe('Guard');
    expect(buildKillNarrationInstruction(kills)).toContain('Guard');
  });
});

describe('appearance description', () => {
  it('prefers brief look field from wizard', async () => {
    const { buildAppearanceDescription } = await import('../src/game/character/creator.js');
    const text = buildAppearanceDescription({ look: 'Stocky dwarf smith with copper braids and soot-stained apron.' });
    expect(text).toContain('copper braids');
  });
});

describe('bonus actions', () => {
  it('marks healing word as bonus action', () => {
    expect(parseSpellActionEconomy('healing-word')).toBe('bonus');
    const plan = planSpellResolution('healing-word', cleric);
    expect(plan?.actionEconomy).toBe('bonus');
  });

  it('marks shield as reaction', () => {
    expect(parseSpellActionEconomy('shield')).toBe('reaction');
  });
});
