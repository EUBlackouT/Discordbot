import '../../src/config/load-env.js';
import { PrismaClient } from '@prisma/client';
import { SRD_RACES, SRD_CLASSES, SRD_BACKGROUNDS } from '../../src/game/rules/srd-data.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding SRD rules data (core tables)...');

  for (const race of SRD_RACES) {
    await prisma.rulesRace.upsert({
      where: { key: race.key },
      update: {
        name: race.name,
        speed: race.speed,
        size: race.size,
        traits: JSON.stringify(race.traits),
        abilityBonuses: JSON.stringify(race.abilityBonuses),
        languages: JSON.stringify(race.languages),
      },
      create: {
        key: race.key,
        name: race.name,
        speed: race.speed,
        size: race.size,
        traits: JSON.stringify(race.traits),
        abilityBonuses: JSON.stringify(race.abilityBonuses),
        languages: JSON.stringify(race.languages),
        isHomebrew: false,
      },
    });
  }

  for (const cls of SRD_CLASSES) {
    await prisma.rulesClass.upsert({
      where: { key: cls.key },
      update: {
        name: cls.name,
        hitDie: cls.hitDie,
        primaryAbility: cls.primaryAbility,
        savingThrows: JSON.stringify(cls.savingThrows),
        skillChoices: JSON.stringify(cls.skillChoices),
        features: JSON.stringify([...cls.features, JSON.stringify({ level1Choices: cls.level1Choices ?? [], startingEquipment: cls.startingEquipment })]),
        spellcasting: cls.spellcasting ? JSON.stringify(cls.spellcasting) : null,
      },
      create: {
        key: cls.key,
        name: cls.name,
        hitDie: cls.hitDie,
        primaryAbility: cls.primaryAbility,
        savingThrows: JSON.stringify(cls.savingThrows),
        skillChoices: JSON.stringify(cls.skillChoices),
        features: JSON.stringify([...cls.features, JSON.stringify({ level1Choices: cls.level1Choices ?? [], startingEquipment: cls.startingEquipment })]),
        spellcasting: cls.spellcasting ? JSON.stringify(cls.spellcasting) : null,
        isHomebrew: false,
      },
    });
  }

  for (const bg of SRD_BACKGROUNDS) {
    await prisma.rulesBackground.upsert({
      where: { key: bg.key },
      update: {
        name: bg.name,
        skillProficiencies: JSON.stringify(bg.skillProficiencies),
        features: JSON.stringify({
          traits: bg.features,
          personalityTraits: bg.personalityTraits,
          ideals: bg.ideals,
          bonds: bg.bonds,
          flaws: bg.flaws,
        }),
        equipment: JSON.stringify(bg.equipment),
      },
      create: {
        key: bg.key,
        name: bg.name,
        skillProficiencies: JSON.stringify(bg.skillProficiencies),
        features: JSON.stringify({
          traits: bg.features,
          personalityTraits: bg.personalityTraits,
          ideals: bg.ideals,
          bonds: bg.bonds,
          flaws: bg.flaws,
        }),
        equipment: JSON.stringify(bg.equipment),
        isHomebrew: false,
      },
    });
  }

  const skills = [
    'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight',
    'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance',
    'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival',
  ].map((name) => ({
    key: name.toLowerCase().replace(/ /g, '_'),
    name,
    ability: name.match(/^(Arcana|History|Investigation|Nature|Religion)$/) ? 'INT'
      : name.match(/^(Animal Handling|Insight|Medicine|Perception|Survival)$/) ? 'WIS'
      : name.match(/^(Deception|Intimidation|Performance|Persuasion)$/) ? 'CHA'
      : name.match(/^(Acrobatics|Sleight of Hand|Stealth)$/) ? 'DEX' : 'STR',
  }));

  for (const skill of skills) {
    await prisma.rulesSkill.upsert({ where: { key: skill.key }, update: {}, create: skill });
  }

  console.log(`Seed complete: ${SRD_RACES.length} races, ${SRD_CLASSES.length} classes, ${SRD_BACKGROUNDS.length} backgrounds. Spells load from static SRD module.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
