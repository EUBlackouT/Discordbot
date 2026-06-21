import { describe, it, expect } from 'vitest';
import type { Character } from '@prisma/client';
import { buildCharacterSheetEmbeds, buildCharacterSheetPayload } from '../src/game/character/sheet-display.js';
import { lookupSpell, formatSpellKey, summarizeSpellsForAI } from '../src/game/character/spell-reference.js';

const sampleCharacter = {
  id: 'c1',
  guildId: 'g1',
  campaignId: null,
  playerId: 'p1',
  ownerDiscordId: 'u1',
  name: 'Gyro ironbark',
  race: 'Human',
  className: 'Cleric',
  background: 'Acolyte',
  level: 1,
  abilityScores: JSON.stringify({ STR: 10, DEX: 12, CON: 14, INT: 14, WIS: 16, CHA: 10 }),
  abilityMods: JSON.stringify({ STR: 0, DEX: 1, CON: 2, INT: 2, WIS: 3, CHA: 0 }),
  proficiencyBonus: 2,
  savingThrows: JSON.stringify(['WIS', 'CHA']),
  skillProficiencies: JSON.stringify(['Investigation', 'Medicine']),
  armorClass: 14,
  hitPoints: 10,
  maxHitPoints: 10,
  hitDice: '1d8',
  initiative: 1,
  speed: 30,
  passivePerception: 13,
  equipment: JSON.stringify(['Holy symbol', 'Chain shirt']),
  languages: JSON.stringify(['Common', 'Celestial']),
  features: JSON.stringify(['Spellcasting', 'Divine Domain']),
  spellcasting: JSON.stringify({
    cantrips: ['guidance'],
    spellsKnown: ['cure-wounds'],
    spellsPrepared: ['cure-wounds'],
    slots: { '1': 2 },
  }),
  personality: '',
  ideals: '',
  bonds: '',
  flaws: '',
  backstory: '',
  appearance: 'Hooded cleric',
  portraitPrompt: '',
  conditions: '[]',
  inventory: '[]',
  currency: '{}',
  currentLocationId: null,
  isComplete: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies Character;

describe('buildCharacterSheetEmbeds', () => {
  it('builds split embeds under Discord size limits', () => {
    const embeds = buildCharacterSheetEmbeds(sampleCharacter);
    expect(embeds.length).toBeGreaterThanOrEqual(1);
    expect(embeds[0].data.title).toBe('Gyro ironbark');
    expect(embeds[0].data.fields?.some((f) => f.name === 'Abilities')).toBe(true);

    const totalLen = embeds.reduce((sum, embed) => {
      const data = embed.data;
      return (
        sum +
        (data.description?.length ?? 0) +
        (data.fields?.reduce((n, f) => n + (f.name?.length ?? 0) + (f.value?.length ?? 0), 0) ?? 0)
      );
    }, 0);
    expect(totalLen).toBeLessThan(6000);
  });

  it('formats spell names and adds spell lookup menu', () => {
    const { embeds, components } = buildCharacterSheetPayload(sampleCharacter);
    const spellField = embeds.flatMap((e) => e.data.fields ?? []).find((f) => f.name === '✨ Spellcasting');
    expect(spellField?.value).toContain('Guidance');
    expect(spellField?.value).toContain('Cure Wounds');
    expect(components).toHaveLength(1);
    expect(components[0].components[0]?.data.custom_id).toBe('char_sheet_spell:c1');
  });

  it('handles legacy spellcasting array format', () => {
    const legacy = { ...sampleCharacter, spellcasting: JSON.stringify(['guidance', 'light']) };
    expect(() => buildCharacterSheetEmbeds(legacy)).not.toThrow();
  });
});

describe('spell-reference', () => {
  it('looks up SRD spells by key', () => {
    expect(lookupSpell('cure-wounds')?.name).toBe('Cure Wounds');
    expect(formatSpellKey('cure-wounds')).toBe('Cure Wounds');
  });

  it('summarizes spells for AI context', () => {
    const summary = summarizeSpellsForAI(sampleCharacter.spellcasting);
    expect(summary.cantrips[0]).toContain('Guidance');
    expect(summary.prepared[0]).toContain('Cure Wounds');
    expect(summary.slots['1']).toBe(2);
  });
});
