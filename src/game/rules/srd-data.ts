/**
 * D&D 5e SRD (OGL) rules data for character creation.
 * @see https://dnd.wizards.com/resources/systems-reference-document
 */

export interface SrdRace {
  key: string;
  name: string;
  speed: number;
  size: string;
  traits: string[];
  abilityBonuses: Record<string, number>;
  languages: string[];
  extraLanguageChoices?: number;
}

export interface SrdClassChoice {
  key: string;
  label: string;
  options: { key: string; label: string; description?: string }[];
}

export interface SrdClass {
  key: string;
  name: string;
  hitDie: string;
  primaryAbility: string;
  savingThrows: string[];
  skillChoices: { count: number; options: string[] };
  features: string[];
  spellcasting?: {
    ability: string;
    ritual: boolean;
    cantripsKnown: number;
    spellsKnown?: number;
    spellsPrepared?: boolean;
    spellListKey: string;
  };
  level1Choices?: SrdClassChoice[];
  startingEquipment: { label: string; items: string[] }[];
}

export interface SrdBackground {
  key: string;
  name: string;
  skillProficiencies: string[];
  features: string[];
  equipment: string[];
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
}

export interface SrdSpell {
  key: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string[];
  ritual: boolean;
}

export const SRD_RACES: SrdRace[] = [
  { key: 'hill-dwarf', name: 'Hill Dwarf', speed: 25, size: 'Medium', traits: ['Darkvision 60ft', 'Dwarven Resilience', 'Dwarven Combat Training', 'Stonecunning'], abilityBonuses: { CON: 2, WIS: 1 }, languages: ['Common', 'Dwarvish'] },
  { key: 'mountain-dwarf', name: 'Mountain Dwarf', speed: 25, size: 'Medium', traits: ['Darkvision 60ft', 'Dwarven Resilience', 'Dwarven Armor Training', 'Stonecunning'], abilityBonuses: { CON: 2, STR: 2 }, languages: ['Common', 'Dwarvish'] },
  { key: 'high-elf', name: 'High Elf', speed: 30, size: 'Medium', traits: ['Darkvision 60ft', 'Keen Senses', 'Fey Ancestry', 'Trance', 'Cantrip (wizard)'], abilityBonuses: { DEX: 2, INT: 1 }, languages: ['Common', 'Elvish'], extraLanguageChoices: 1 },
  { key: 'wood-elf', name: 'Wood Elf', speed: 35, size: 'Medium', traits: ['Darkvision 60ft', 'Keen Senses', 'Fey Ancestry', 'Trance', 'Mask of the Wild'], abilityBonuses: { DEX: 2, WIS: 1 }, languages: ['Common', 'Elvish'], extraLanguageChoices: 1 },
  { key: 'drow', name: 'Drow', speed: 30, size: 'Medium', traits: ['Superior Darkvision 120ft', 'Sunlight Sensitivity', 'Fey Ancestry', 'Trance', 'Drow Magic'], abilityBonuses: { DEX: 2, CHA: 1 }, languages: ['Common', 'Elvish'] },
  { key: 'lightfoot-halfling', name: 'Lightfoot Halfling', speed: 25, size: 'Small', traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Naturally Stealthy'], abilityBonuses: { DEX: 2, CHA: 1 }, languages: ['Common', 'Halfling'] },
  { key: 'stout-halfling', name: 'Stout Halfling', speed: 25, size: 'Small', traits: ['Lucky', 'Brave', 'Halfling Nimbleness', 'Stout Resilience'], abilityBonuses: { DEX: 2, CON: 1 }, languages: ['Common', 'Halfling'] },
  { key: 'human', name: 'Human', speed: 30, size: 'Medium', traits: ['Versatile (+1 to all ability scores)'], abilityBonuses: { STR: 1, DEX: 1, CON: 1, INT: 1, WIS: 1, CHA: 1 }, languages: ['Common'], extraLanguageChoices: 1 },
  { key: 'dragonborn', name: 'Dragonborn', speed: 30, size: 'Medium', traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'], abilityBonuses: { STR: 2, CHA: 1 }, languages: ['Common', 'Draconic'] },
  { key: 'forest-gnome', name: 'Forest Gnome', speed: 25, size: 'Small', traits: ['Darkvision 60ft', 'Gnome Cunning', 'Natural Illusionist', 'Speak with Small Beasts'], abilityBonuses: { INT: 2, DEX: 1 }, languages: ['Common', 'Gnomish'] },
  { key: 'rock-gnome', name: 'Rock Gnome', speed: 25, size: 'Small', traits: ['Darkvision 60ft', 'Gnome Cunning', "Artificer's Lore", 'Tinker'], abilityBonuses: { INT: 2, CON: 1 }, languages: ['Common', 'Gnomish'] },
  { key: 'half-elf', name: 'Half-Elf', speed: 30, size: 'Medium', traits: ['Darkvision 60ft', 'Fey Ancestry', 'Skill Versatility'], abilityBonuses: { CHA: 2 }, languages: ['Common', 'Elvish'], extraLanguageChoices: 1 },
  { key: 'half-orc', name: 'Half-Orc', speed: 30, size: 'Medium', traits: ['Darkvision 60ft', 'Relentless Endurance', 'Savage Attacks'], abilityBonuses: { STR: 2, CON: 1 }, languages: ['Common', 'Orc'] },
  { key: 'tiefling', name: 'Tiefling', speed: 30, size: 'Medium', traits: ['Darkvision 60ft', 'Hellish Resistance', 'Infernal Legacy'], abilityBonuses: { CHA: 2, INT: 1 }, languages: ['Common', 'Infernal'] },
];

const FIGHTING_STYLES: SrdClassChoice['options'] = [
  { key: 'archery', label: 'Archery', description: '+2 to ranged attack rolls' },
  { key: 'defense', label: 'Defense', description: '+1 AC while wearing armor' },
  { key: 'dueling', label: 'Dueling', description: '+2 damage with one-handed melee weapon' },
  { key: 'great-weapon', label: 'Great Weapon Fighting', description: 'Reroll 1–2 on damage dice for two-handed weapons' },
  { key: 'protection', label: 'Protection', description: 'Impose disadvantage on attacks against adjacent ally' },
  { key: 'two-weapon', label: 'Two-Weapon Fighting', description: 'Add ability mod to off-hand damage' },
];

export const SRD_CLASSES: SrdClass[] = [
  {
    key: 'barbarian', name: 'Barbarian', hitDie: '1d12', primaryAbility: 'STR', savingThrows: ['STR', 'CON'],
    skillChoices: { count: 2, options: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'] },
    features: ['Rage', 'Unarmored Defense'],
    startingEquipment: [
      { label: 'A', items: ['Greataxe', 'Two handaxes', 'Explorer\'s pack', 'Four javelins'] },
      { label: 'B', items: ['Martial melee weapon', 'Shield', 'Two handaxes', 'Explorer\'s pack', 'Four javelins'] },
    ],
  },
  {
    key: 'bard', name: 'Bard', hitDie: '1d8', primaryAbility: 'CHA', savingThrows: ['DEX', 'CHA'],
    skillChoices: { count: 3, options: ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'] },
    features: ['Spellcasting', 'Bardic Inspiration (d6)'],
    spellcasting: { ability: 'CHA', ritual: true, cantripsKnown: 2, spellsKnown: 4, spellListKey: 'bard' },
    startingEquipment: [
      { label: 'A', items: ['Rapier', 'Diplomat\'s pack', 'Lute', 'Leather armor', 'Dagger'] },
      { label: 'B', items: ['Longsword', 'Entertainer\'s pack', 'Lute', 'Leather armor', 'Dagger'] },
    ],
  },
  {
    key: 'cleric', name: 'Cleric', hitDie: '1d8', primaryAbility: 'WIS', savingThrows: ['WIS', 'CHA'],
    skillChoices: { count: 2, options: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'] },
    features: ['Spellcasting', 'Divine Domain'],
    spellcasting: { ability: 'WIS', ritual: true, cantripsKnown: 3, spellsPrepared: true, spellListKey: 'cleric' },
    level1Choices: [{
      key: 'domain', label: 'Divine Domain', options: [
        { key: 'life', label: 'Life Domain', description: 'Bonus healing, heavy armor' },
        { key: 'light', label: 'Light Domain', description: 'Fire/light magic, Warding Flare' },
        { key: 'trickery', label: 'Trickery Domain', description: 'Illusion and deception' },
        { key: 'war', label: 'War Domain', description: 'Martial prowess, War Priest' },
      ],
    }],
    startingEquipment: [
      { label: 'A', items: ['Mace', 'Scale mail', 'Light crossbow', '20 bolts', 'Priest\'s pack', 'Shield', 'Holy symbol'] },
      { label: 'B', items: ['Warhammer', 'Scale mail', 'Light crossbow', '20 bolts', 'Priest\'s pack', 'Shield', 'Holy symbol'] },
    ],
  },
  {
    key: 'druid', name: 'Druid', hitDie: '1d8', primaryAbility: 'WIS', savingThrows: ['INT', 'WIS'],
    skillChoices: { count: 2, options: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'] },
    features: ['Druidic', 'Spellcasting'],
    spellcasting: { ability: 'WIS', ritual: true, cantripsKnown: 2, spellsPrepared: true, spellListKey: 'druid' },
    startingEquipment: [
      { label: 'A', items: ['Wooden shield', 'Scimitar', 'Leather armor', 'Explorer\'s pack', 'Druidic focus'] },
      { label: 'B', items: ['Wooden shield', 'Simple melee weapon', 'Leather armor', 'Explorer\'s pack', 'Druidic focus'] },
    ],
  },
  {
    key: 'fighter', name: 'Fighter', hitDie: '1d10', primaryAbility: 'STR', savingThrows: ['STR', 'CON'],
    skillChoices: { count: 2, options: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'] },
    features: ['Fighting Style', 'Second Wind'],
    level1Choices: [{ key: 'fighting_style', label: 'Fighting Style', options: FIGHTING_STYLES }],
    startingEquipment: [
      { label: 'A', items: ['Chain mail', 'Martial weapon and shield', 'Light crossbow', '20 bolts', 'Dungeoneer\'s pack'] },
      { label: 'B', items: ['Leather armor', 'Longbow', '20 arrows', 'Dungeoneer\'s pack', 'Two martial weapons'] },
    ],
  },
  {
    key: 'monk', name: 'Monk', hitDie: '1d8', primaryAbility: 'DEX', savingThrows: ['STR', 'DEX'],
    skillChoices: { count: 2, options: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'] },
    features: ['Unarmored Defense', 'Martial Arts (1d4)'],
    startingEquipment: [{ label: 'A', items: ['Shortsword', 'Dungeoneer\'s pack', '10 darts'] }],
  },
  {
    key: 'paladin', name: 'Paladin', hitDie: '1d10', primaryAbility: 'STR', savingThrows: ['WIS', 'CHA'],
    skillChoices: { count: 2, options: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'] },
    features: ['Divine Sense', 'Lay on Hands'],
    startingEquipment: [
      { label: 'A', items: ['Martial weapon and shield', 'Five javelins', 'Priest\'s pack', 'Chain mail', 'Holy symbol'] },
      { label: 'B', items: ['Two martial weapons', 'Five javelins', 'Priest\'s pack', 'Chain mail', 'Holy symbol'] },
    ],
  },
  {
    key: 'ranger', name: 'Ranger', hitDie: '1d10', primaryAbility: 'DEX', savingThrows: ['STR', 'DEX'],
    skillChoices: { count: 3, options: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'] },
    features: ['Favored Enemy', 'Natural Explorer'],
    level1Choices: [{
      key: 'favored_enemy', label: 'Favored Enemy', options: [
        { key: 'beasts', label: 'Beasts' }, { key: 'humanoids', label: 'Humanoids' },
        { key: 'undead', label: 'Undead' }, { key: 'fiends', label: 'Fiends' },
      ],
    }],
    spellcasting: { ability: 'WIS', ritual: false, cantripsKnown: 0, spellsKnown: 2, spellListKey: 'ranger' },
    startingEquipment: [
      { label: 'A', items: ['Scale mail', 'Two shortswords', 'Dungeoneer\'s pack', 'Longbow', '20 arrows'] },
      { label: 'B', items: ['Leather armor', 'Two shortswords', 'Explorer\'s pack', 'Longbow', '20 arrows'] },
    ],
  },
  {
    key: 'rogue', name: 'Rogue', hitDie: '1d8', primaryAbility: 'DEX', savingThrows: ['DEX', 'INT'],
    skillChoices: { count: 4, options: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'] },
    features: ['Expertise', 'Sneak Attack', 'Thieves\' Cant'],
    startingEquipment: [
      { label: 'A', items: ['Rapier', 'Shortbow', '20 arrows', 'Leather armor', 'Burglar\'s pack', 'Two daggers', 'Thieves\' tools'] },
      { label: 'B', items: ['Shortsword', 'Shortbow', '20 arrows', 'Leather armor', 'Burglar\'s pack', 'Two daggers', 'Thieves\' tools'] },
    ],
  },
  {
    key: 'sorcerer', name: 'Sorcerer', hitDie: '1d6', primaryAbility: 'CHA', savingThrows: ['CON', 'CHA'],
    skillChoices: { count: 2, options: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'] },
    features: ['Spellcasting', 'Sorcerous Origin'],
    spellcasting: { ability: 'CHA', ritual: false, cantripsKnown: 4, spellsKnown: 2, spellListKey: 'sorcerer' },
    level1Choices: [{
      key: 'origin', label: 'Sorcerous Origin', options: [
        { key: 'draconic', label: 'Draconic Bloodline', description: 'Draconic ancestry, natural armor' },
        { key: 'wild', label: 'Wild Magic', description: 'Tides of Chaos, random surges' },
      ],
    }],
    startingEquipment: [
      { label: 'A', items: ['Light crossbow', '20 bolts', 'Component pouch', 'Dungeoneer\'s pack', 'Two daggers'] },
      { label: 'B', items: ['Arcane focus', 'Component pouch', 'Explorer\'s pack', 'Two daggers'] },
    ],
  },
  {
    key: 'warlock', name: 'Warlock', hitDie: '1d8', primaryAbility: 'CHA', savingThrows: ['WIS', 'CHA'],
    skillChoices: { count: 2, options: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'] },
    features: ['Otherworldly Patron', 'Pact Magic'],
    spellcasting: { ability: 'CHA', ritual: false, cantripsKnown: 2, spellsKnown: 2, spellListKey: 'warlock' },
    level1Choices: [{
      key: 'patron', label: 'Otherworldly Patron', options: [
        { key: 'archfey', label: 'The Archfey' },
        { key: 'fiend', label: 'The Fiend' },
        { key: 'great-old-one', label: 'The Great Old One' },
      ],
    }],
    startingEquipment: [
      { label: 'A', items: ['Light crossbow', '20 bolts', 'Component pouch', 'Scholar\'s pack', 'Leather armor', 'Simple weapon', 'Two daggers'] },
      { label: 'B', items: ['Arcane focus', 'Component pouch', 'Scholar\'s pack', 'Leather armor', 'Simple weapon', 'Two daggers'] },
    ],
  },
  {
    key: 'wizard', name: 'Wizard', hitDie: '1d6', primaryAbility: 'INT', savingThrows: ['INT', 'WIS'],
    skillChoices: { count: 2, options: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'] },
    features: ['Spellcasting', 'Arcane Recovery'],
    spellcasting: { ability: 'INT', ritual: true, cantripsKnown: 3, spellsKnown: 6, spellListKey: 'wizard' },
    startingEquipment: [
      { label: 'A', items: ['Quarterstaff', 'Component pouch', 'Scholar\'s pack', 'Spellbook'] },
      { label: 'B', items: ['Dagger', 'Arcane focus', 'Scholar\'s pack', 'Spellbook'] },
    ],
  },
];

export const SRD_BACKGROUNDS: SrdBackground[] = [
  { key: 'acolyte', name: 'Acolyte', skillProficiencies: ['Insight', 'Religion'], features: ['Shelter of the Faithful'], equipment: ['Holy symbol', 'Prayer book', '5 sticks of incense', 'Vestments', 'Common clothes', '15 gp'],
    personalityTraits: ['I idolize a particular hero and refer to their deeds constantly.', 'I can find common ground between fiercest enemies.', 'I see omens in every event.', 'Nothing can shake my optimistic attitude.', 'I quote sacred texts in almost every situation.', 'I am tolerant of other faiths.', 'I\'ve enjoyed fine food and drink among high temple ranks.', 'I\'ve spent so long in the temple that I have trouble with practical matters.'],
    ideals: ['Tradition — ancient traditions must be preserved.', 'Charity — I always try to help those in need.', 'Change — we must help bring about the changes the gods are working toward.', 'Power — I hope to rise in my faith\'s hierarchy.', 'Faith — I trust my deity will guide my actions.', 'Aspiration — I seek to prove myself worthy of my god\'s favor.'],
    bonds: ['I would die to recover an ancient relic of my faith.', 'I will someday get revenge on the corrupt temple hierarchy.', 'I owe my life to the priest who took me in.', 'Everything I do is for the common people.', 'I will do anything to protect the temple where I served.', 'I seek to preserve a sacred text my enemies consider heretical.'],
    flaws: ['I judge others harshly, and myself even more severely.', 'I put too much trust in those who wield power within my temple.', 'My piety sometimes leads me to blindly trust those who profess faith.', 'I am inflexible in my thinking.', 'I am suspicious of strangers.', 'Once I pick a goal, I become obsessed to the detriment of everything else.'] },
  { key: 'charlatan', name: 'Charlatan', skillProficiencies: ['Deception', 'Sleight of Hand'], features: ['False Identity'], equipment: ['Fine clothes', 'Disguise kit', 'Tools of the con of your choice', '15 gp'],
    personalityTraits: ['I fall in and out of love easily.', 'I have a joke for every occasion.', 'Flattery is my preferred trick.', 'I\'m a born gambler.', 'I lie about almost everything.', 'Sarcasm and insults are my weapons.', 'I keep multiple holy symbols handy.', 'I pocket anything I see that might have value.'],
    ideals: ['Independence — I must be free.', 'Fairness — I never target people who can\'t afford to lose.', 'Charity — I distribute money to the people.', 'Creativity — I never run the same con twice.', 'Friendship — Material goods come and go.', 'Aspiration — I\'m determined to make something of myself.'],
    bonds: ['I fleeced the wrong person and must work to ensure they never cross paths with me.', 'I owe everything to my mentor.', 'Somewhere out there, I have a child who doesn\'t know me.', 'I was left penniless by a former partner.', 'I\'m guilty of a terrible crime and will be caught.', 'A powerful person killed someone I love.'],
    flaws: ['I can\'t resist a pretty face.', 'I\'m always in debt.', 'I\'m convinced that no one could ever fool me.', 'I\'m too greedy for my own good.', 'I can\'t resist swindling people who are more powerful than me.', 'I can\'t resist a wager.'] },
  { key: 'criminal', name: 'Criminal', skillProficiencies: ['Deception', 'Stealth'], features: ['Criminal Contact'], equipment: ['Crowbar', 'Dark common clothes with hood', '15 gp'],
    personalityTraits: ['I always have a plan for what to do when things go wrong.', 'I am always calm.', 'The first thing I do in a new place is note valuables.', 'I would rather make a new friend than a new enemy.', 'I am incredibly slow to trust.', 'I don\'t pay attention to risks.', 'The best way to get me to do something is tell me I can\'t.', 'I blow up at the slightest insult.'],
    ideals: ['Honor — I don\'t steal from fellow criminals.', 'Freedom — chains are meant to be broken.', 'Charity — I steal from the wealthy to help people.', 'Greed — I will do whatever it takes to become wealthy.', 'People — I\'m loyal to my friends, not ideals.', 'Redemption — there\'s a spark of good in me.'],
    bonds: ['I\'m trying to pay off an old debt.', 'My ill-gotten gains go to support my family.', 'Something important was taken from me.', 'I will become the greatest thief that ever lived.', 'I\'m guilty of a terrible crime.', 'Someone I loved died because of a mistake I made.'],
    flaws: ['When I see something valuable, I can\'t think about anything but stealing it.', 'I turn tail and run when things look bad.', 'An innocent person is in prison for a crime I committed.', 'I have a tell that reveals when I\'m lying.', 'I can\'t stand being cheated.', 'I\'m too frightened to fight.'] },
  { key: 'entertainer', name: 'Entertainer', skillProficiencies: ['Acrobatics', 'Performance'], features: ['By Popular Demand'], equipment: ['Musical instrument', 'Admirer\'s favor', 'Costume', '15 gp'],
    personalityTraits: ['I know a story relevant to almost every situation.', 'I insult everyone.', 'I love a good insult, even one directed at me.', 'I get bitter if I\'m not the center of attention.', 'I\'m a perfectionist.', 'I change my mood as fast as I change key.', 'I can\'t resist showing off.', 'I\'m a romantic, always searching for the hero of my heart.'],
    ideals: ['Beauty — when I perform, I make the world better.', 'Tradition — stories and legends must not be forgotten.', 'Creativity — the world is in need of new ideas.', 'Greed — I\'m only in it for the money and fame.', 'People — I like seeing smiles.', 'Honesty — art should reflect the soul.'],
    bonds: ['My instrument is my most treasured possession.', 'Someone stole my precious instrument.', 'I want to be famous.', 'I idolize a hero of the old tales.', 'I will do anything to prove myself superior to my hated rival.', 'I would do anything for members of my old troupe.'],
    flaws: ['I\'ll do anything to win fame.', 'I can\'t hide my true feelings.', 'A scandal prevents me from returning home.', 'I once satirized a noble who still wants my head.', 'I have trouble keeping my true feelings hidden.', 'Despite my best efforts, I am unreliable to my friends.'] },
  { key: 'folk-hero', name: 'Folk Hero', skillProficiencies: ['Animal Handling', 'Survival'], features: ['Rustic Hospitality'], equipment: ['Artisan\'s tools', 'Shovel', 'Iron pot', 'Common clothes', '10 gp'],
    personalityTraits: ['I judge people by their actions.', 'If someone is in trouble, I\'m ready to help.', 'When I set my mind to something, I follow through.', 'I have a strong sense of fair play.', 'I\'m confident in my own abilities.', 'I think far ahead when making plans.', 'I place no stock in wealthy or well-mannered folk.', 'I make a new friend wherever I go.'],
    ideals: ['Respect — people deserve to be treated with dignity.', 'Fairness — no one should get preferential treatment.', 'Freedom — tyrants must not be allowed to oppress.', 'Might — if I become strong, I can take what I want.', 'Sincerity — there\'s no good in pretending.', 'Destiny — nothing can steer me away from my higher calling.'],
    bonds: ['I have a family, but I have no idea where they are.', 'I worked the land, and I love the land.', 'A proud noble once gave me a horrible beating.', 'My tools are symbols of my past life.', 'I protect those who cannot protect themselves.', 'I wish my childhood sweetheart had come with me.'],
    flaws: ['The tyrant who rules my land will stop at nothing to see me killed.', 'I\'m convinced of the significance of my destiny.', 'People who knew me when I was young know my shameful secret.', 'I have a weakness for the vices of the city.', 'Secretly, I believe things would be better if I were a tyrant.', 'I have trouble trusting my allies.'] },
  { key: 'guild-artisan', name: 'Guild Artisan', skillProficiencies: ['Insight', 'Persuasion'], features: ['Guild Membership'], equipment: ['Artisan\'s tools', 'Letter of introduction from guild', 'Traveler\'s clothes', '15 gp'],
    personalityTraits: ['I believe that anything worth doing is worth doing right.', 'I\'m a snob who looks down on those who can\'t appreciate fine art.', 'I always want to know how things work.', 'I\'m full of witty aphorisms.', 'I\'m rude to people who lack my commitment to hard work.', 'I like to talk at length about my profession.', 'I don\'t part with my money easily.', 'I\'m well known for my work.'],
    ideals: ['Community — it is the duty of all civilized people to strengthen society.', 'Generosity — my talents were given so I could use them.', 'Freedom — everyone should be free to pursue their own livelihood.', 'Greed — I\'m only in it for the money.', 'People — I\'m committed to the people I care about.', 'Aspiration — I work to be the best there is at my craft.'],
    bonds: ['The workshop where I learned my trade is the most important place.', 'I created a great work for someone, then found them unworthy.', 'I owe my guild a great debt.', 'I pursue wealth to secure someone\'s love.', 'One day I will return to my guild and prove I am the greatest.', 'I am trying to pay off an old debt.'],
    flaws: ['I\'ll do anything to get my hands on something rare or priceless.', 'I\'m quick to assume that someone is trying to cheat me.', 'No one must ever learn that I once stole money from guild coffers.', 'I\'m never satisfied with what I have.', 'I would kill to acquire a noble title.', 'I\'m horribly jealous of anyone who can outshine my handiwork.'] },
  { key: 'hermit', name: 'Hermit', skillProficiencies: ['Medicine', 'Religion'], features: ['Discovery'], equipment: ['Scroll case of notes', 'Winter blanket', 'Herbalism kit', 'Common clothes', '5 gp'],
    personalityTraits: ['I\'ve been isolated so long that I rarely speak.', 'I am utterly serene.', 'The leader of my community had something wise to say on every topic.', 'I feel tremendous empathy for all who suffer.', 'I connect everything to a grand cosmic plan.', 'I often get lost in my own thoughts.', 'I am working on a grand philosophical theory.', 'I\'ve become oblivious to etiquette and social expectations.'],
    ideals: ['Greater Good — my gifts are meant to be shared.', 'Logic — emotions must not cloud our sense of what is right.', 'Free Thinking — inquiry and curiosity are the pillars of progress.', 'Power — solitude and contemplation are paths toward power.', 'Live and Let Live — meddling in others\' affairs only causes trouble.', 'Self-Knowledge — if you know yourself, there\'s nothing left to know.'],
    bonds: ['Nothing is more important than the other members of my hermitage.', 'I entered seclusion to hide from the ones who might still be hunting me.', 'I\'m still seeking the enlightenment I pursued in seclusion.', 'I entered seclusion because I loved someone I could not have.', 'If my discovery comes to light, it could bring ruin to the world.', 'My isolation gave me great insight into a great evil.'],
    flaws: ['Now that I\'ve returned to the world, I enjoy its pleasures a little too much.', 'I harbor dark, bloodthirsty thoughts.', 'I am dogmatic in my thoughts and philosophy.', 'I let my need to win arguments overshadow friendships.', 'I\'d risk too much to uncover a lost bit of knowledge.', 'I like keeping secrets and won\'t share them with anyone.'] },
  { key: 'noble', name: 'Noble', skillProficiencies: ['History', 'Persuasion'], features: ['Position of Privilege'], equipment: ['Fine clothes', 'Signet ring', 'Scroll of pedigree', '25 gp'],
    personalityTraits: ['My eloquent flattery makes everyone I talk to feel important.', 'The common folk love me for my kindness.', 'No one could doubt by looking at me that I am a cut above the masses.', 'I take great pains to always look my best.', 'I don\'t like to get my hands dirty.', 'Despite my birth, I do not place myself above other folk.', 'My favor, once lost, is lost forever.', 'If you do me an injury, I will crush you.'],
    ideals: ['Respect — respect is due to me because of my position.', 'Responsibility — it is my duty to respect the authority of those above me.', 'Independence — I must prove I can handle myself without the coddling of my family.', 'Power — if I can attain more power, no one will tell me what to do.', 'Family — blood runs thicker than water.', 'Noble Obligation — it is my duty to protect and care for the people beneath me.'],
    bonds: ['I will face any challenge to win the approval of my family.', 'My house\'s alliance with another noble family must be sustained.', 'Nothing is more important than the other members of my family.', 'I am in love with the heir of a family that my family despises.', 'My loyalty to my sovereign is unwavering.', 'The common folk must see me as a hero of the people.'],
    flaws: ['I secretly believe others are plotting to harm me.', 'I hide a truly scandalous secret.', 'I too often hear veiled insults and threats in every word.', 'I have an insatiable desire for carnal pleasures.', 'I believe myself to be far superior to everyone else.', 'I\'ve gambled away my family\'s fortune.'] },
  { key: 'outlander', name: 'Outlander', skillProficiencies: ['Athletics', 'Survival'], features: ['Wanderer'], equipment: ['Staff', 'Hunting trap', 'Trophy from an animal', 'Traveler\'s clothes', '10 gp'],
    personalityTraits: ['I\'ve been isolated by my people and culture.', 'I watch over my friends as if they were a litter of newborn pups.', 'I once ran twenty-five miles without stopping to warn my clan.', 'I have a lesson for every situation.', 'I place no stock in wealthy or well-mannered folk.', 'I\'m always picking things up, absently fiddling with them.', 'I feel far more comfortable around animals than people.', 'I was actually raised by wolves.'],
    ideals: ['Change — life is like the seasons.', 'Greater Good — it is each person\'s responsibility to make the world better.', 'Honor — if I dishonor myself, I dishonor my whole clan.', 'Might — the strongest are meant to rule.', 'Nature — the natural world is more important than civilization.', 'Glory — I must earn glory in battle.'],
    bonds: ['My family, clan, or tribe is the most important thing in my life.', 'An injury to the unspoiled wilderness is an injury to me.', 'I will bring terrible wrath down on evildoers.', 'I am the last of my tribe.', 'I suffer awful visions of a coming disaster.', 'It is my duty to provide children to sustain my tribe.'],
    flaws: ['I am too enamored of ale, alehouses, and the company of fellow drinkers.', 'There\'s no room for caution in a life lived to the fullest.', 'I remember every insult and nurse a silent resentment.', 'I am suspicious of strangers.', 'Once I start drinking, it\'s hard for me to stop.', 'I can\'t help but pocket loose coins.'] },
  { key: 'sage', name: 'Sage', skillProficiencies: ['Arcana', 'History'], features: ['Researcher'], equipment: ['Ink', 'Quill', 'Small knife', 'Letter from a dead colleague', 'Common clothes', '10 gp'],
    personalityTraits: ['I use polysyllabic words to convey the impression of great erudition.', 'I\'ve read every book in the world\'s greatest libraries.', 'I\'m used to helping out those who aren\'t as smart as I am.', 'There\'s nothing I like more than a good mystery.', 'I\'m willing to listen to every side of an argument.', 'I... speak... slowly... when talking... to idiots.', 'I am horribly, horribly awkward in social situations.', 'I\'m convinced that people are always trying to steal my secrets.'],
    ideals: ['Knowledge — the path to power and self-improvement is through knowledge.', 'Beauty — what is beautiful points us beyond itself.', 'Logic — emotions must not cloud our logical thinking.', 'No Limits — nothing should fetter the infinite possibility inherent in all existence.', 'Power — knowledge is the path to power and domination.', 'Self-Improvement — the goal of a life of study is the betterment of oneself.'],
    bonds: ['It is my duty to protect my students.', 'I have an ancient text that holds terrible secrets.', 'I work to preserve a library.', 'I\'ve been searching my whole life for the answer to a certain question.', 'I sold my soul for knowledge.', 'I\'ll do anything to uncover the lost lore of a vanished civilization.'],
    flaws: ['I am easily distracted by the promise of information.', 'Most people scream and run when they see a demon. I stop and take notes.', 'Unlocking an ancient mystery is worth the price of a civilization.', 'I overlook obvious solutions in favor of complicated ones.', 'I speak without really considering my words.', 'I can\'t keep a secret to save my life.'] },
  { key: 'sailor', name: 'Sailor', skillProficiencies: ['Athletics', 'Perception'], features: ['Ship\'s Passage'], equipment: ['Belaying pin (club)', '50 feet of silk rope', 'Lucky charm', 'Common clothes', '10 gp'],
    personalityTraits: ['My friends know they can rely on me.', 'I work hard so that I can play hard.', 'I take pleasure in the simple things in life.', 'I stretch the truth for the sake of a good story.', 'To me, a tavern brawl is a nice way to get to know a city.', 'I never pass up a friendly wager.', 'My language is as foul as an otyugh nest.', 'I like a job well done, especially if I can convince someone else to do it.'],
    ideals: ['Respect — the thing that keeps a ship together is mutual respect.', 'Fairness — we all do the work, so we all share in the rewards.', 'Freedom — the sea is freedom.', 'Mastery — I\'m a predator, and the other ships on the sea are my prey.', 'People — I\'m committed to my crewmates.', 'Aspiration — someday I\'ll own my own ship and chart my own destiny.'],
    bonds: ['I\'m loyal to my captain first, everything else second.', 'The ship is most important — crewmates and captains come and go.', 'I\'ll always remember my first ship.', 'In a harbor town, I have a paramour whose eyes nearly stole me from the sea.', 'I was cheated out of my fair share of the profits.', 'Ruthless pirates murdered my captain and crewmates.'],
    flaws: ['I follow orders, even if I think they\'re wrong.', 'I\'ll say anything to avoid having to do extra work.', 'Once someone questions my courage, I never back down.', 'Once I start drinking, it\'s hard for me to stop.', 'I can\'t help but pocket loose coins.', 'My pride will probably lead to my destruction.'] },
  { key: 'soldier', name: 'Soldier', skillProficiencies: ['Athletics', 'Intimidation'], features: ['Military Rank'], equipment: ['Insignia of rank', 'Trophy from fallen enemy', 'Bone dice or deck of cards', 'Common clothes', '10 gp'],
    personalityTraits: ['I\'m always polite and respectful.', 'I\'m haunted by memories of war.', 'I\'ve lost too many friends, and I\'m slow to make new ones.', 'I have infinite patience for military hierarchy.', 'I can stare down a hell hound without flinching.', 'I enjoy being strong and like breaking things.', 'I have a crude sense of humor.', 'I face problems head-on.'],
    ideals: ['Greater Good — our lot is to lay down our lives in defense of others.', 'Responsibility — I do what I must and obey just authority.', 'Independence — when people follow orders blindly, they embrace tyranny.', 'Might — in life as in war, the stronger force wins.', 'Ideals aren\'t worth killing or going to war for.', 'Nation — my city, nation, or people are all that matter.'],
    bonds: ['I would still lay down my life for the people I served with.', 'Someone saved my life on the battlefield.', 'I have no respect for anyone who is not a proven warrior.', 'I fight for those who cannot fight for themselves.', 'I seek to regain a stolen heirloom.', 'I will earn a battlefield honor to make my family proud.'],
    flaws: ['The monstrous enemy we faced still leaves me quivering with fear.', 'I have little respect for anyone who is not a proven warrior.', 'I made a terrible mistake in battle that cost many lives.', 'My hatred of my enemies is blind and unreasoning.', 'I obey the law, even if the law causes misery.', 'I\'d rather eat my armor than admit when I\'m wrong.'] },
  { key: 'urchin', name: 'Urchin', skillProficiencies: ['Sleight of Hand', 'Stealth'], features: ['City Secrets'], equipment: ['Small knife', 'Map of the city', 'Pet mouse', 'Token to remember parents', 'Common clothes', '10 gp'],
    personalityTraits: ['I hide scraps of food and trinkets away in my pockets.', 'I ask a lot of questions.', 'I like to squeeze into small places where no one else can get to me.', 'I sleep with my back to a wall or tree.', 'I eat like a pig and have bad manners.', 'I think anyone who\'s nice to me is hiding evil intent.', 'I don\'t like to bathe.', 'I bluntly say what other people are hinting at or hiding.'],
    ideals: ['Respect — all people deserve to be treated with dignity.', 'Community — we have to take care of each other.', 'Change — the low are lifted up, and the high are brought down.', 'Retribution — the rich need to be shown what life and death are like in the gutters.', 'People — I help the people who help me.', 'Aspiration — I\'m going to prove that I\'m worthy of a better life.'],
    bonds: ['My town or city is my home, and I\'ll fight to defend it.', 'I sponsor an orphanage to keep others from enduring what I was forced to endure.', 'I owe my survival to another urchin who taught me to live on the streets.', 'I owe a debt I can never repay to the person who took pity on me.', 'I escaped my life of poverty by robbing an important person.', 'No one else should have to endure the hardships I\'ve been through.'],
    flaws: ['If I\'m outnumbered, I will run away from a fight.', 'Gold seems like a lot of money to me, and I\'ll do just about anything for more of it.', 'I will never fully trust anyone other than myself.', 'I\'d rather kill someone in their sleep than fight fair.', 'It\'s not stealing if I need it more than someone else.', 'People who can\'t take care of themselves get what they deserve.'] },
];

export { SRD_SPELLS } from './srd-spells.js';
