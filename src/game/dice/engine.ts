export interface ParsedRoll {
  count: number;
  sides: number;
  modifier: number;
  keepHighest?: number;
  keepLowest?: number;
  dropLowest?: number;
  dropHighest?: number;
  raw: string;
}

const ROLL_REGEX =
  /^(\d+)?d(\d+)(kh(\d+)|kl(\d+)|dl(\d+)|dh(\d+))?([+-]\d+)?$/i;

export function parseRollExpression(expression: string): ParsedRoll {
  const cleaned = expression.replace(/\s/g, '').toLowerCase();
  const match = cleaned.match(ROLL_REGEX);
  if (!match) {
    throw new Error(`Invalid roll expression: ${expression}`);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[8] ? parseInt(match[8], 10) : 0;

  if (count < 1 || count > 100) throw new Error('Dice count must be 1-100');
  if (sides < 2 || sides > 1000) throw new Error('Die sides must be 2-1000');

  return {
    count,
    sides,
    modifier,
    keepHighest: match[4] ? parseInt(match[4], 10) : undefined,
    keepLowest: match[5] ? parseInt(match[5], 10) : undefined,
    dropLowest: match[6] ? parseInt(match[6], 10) : undefined,
    dropHighest: match[7] ? parseInt(match[7], 10) : undefined,
    raw: cleaned,
  };
}

export function rollDie(sides: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * sides) + 1;
}

export interface RollResult {
  expression: string;
  rawDice: number[];
  keptDice: number[];
  droppedDice: number[];
  modifier: number;
  total: number;
  advantageState: 'normal' | 'advantage' | 'disadvantage';
  breakdown: string;
}

function applyKeepDrop(allRolls: number[], parsed: ParsedRoll): { kept: number[]; dropped: number[] } {
  let sorted = [...allRolls];
  let dropped: number[] = [];

  if (parsed.keepHighest !== undefined) {
    sorted.sort((a, b) => b - a);
    const kept = sorted.slice(0, parsed.keepHighest);
    dropped = sorted.slice(parsed.keepHighest);
    return { kept, dropped };
  }
  if (parsed.keepLowest !== undefined) {
    sorted.sort((a, b) => a - b);
    const kept = sorted.slice(0, parsed.keepLowest);
    dropped = sorted.slice(parsed.keepLowest);
    return { kept, dropped };
  }
  if (parsed.dropLowest !== undefined) {
    sorted.sort((a, b) => a - b);
    dropped = sorted.slice(0, parsed.dropLowest);
    const kept = sorted.slice(parsed.dropLowest);
    return { kept, dropped };
  }
  if (parsed.dropHighest !== undefined) {
    sorted.sort((a, b) => b - a);
    dropped = sorted.slice(0, parsed.dropHighest);
    const kept = sorted.slice(parsed.dropHighest);
    return { kept, dropped };
  }

  return { kept: allRolls, dropped: [] };
}

export function executeRoll(
  expression: string,
  advantageState: 'normal' | 'advantage' | 'disadvantage' = 'normal',
  rng: () => number = Math.random,
): RollResult {
  const parsed = parseRollExpression(expression);

  if (parsed.sides === 20 && parsed.count === 1 && advantageState !== 'normal') {
    const roll1 = rollDie(20, rng);
    const roll2 = rollDie(20, rng);
    const kept = advantageState === 'advantage' ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
    const dropped = advantageState === 'advantage'
      ? (kept === roll1 ? [roll2] : [roll1])
      : (kept === roll1 ? [roll2] : [roll1]);
    const total = kept + parsed.modifier;
    return {
      expression,
      rawDice: [roll1, roll2],
      keptDice: [kept],
      droppedDice: dropped,
      modifier: parsed.modifier,
      total,
      advantageState,
      breakdown: `[${roll1}, ${roll2}] → ${kept}${parsed.modifier >= 0 ? '+' : ''}${parsed.modifier} = ${total} (${advantageState})`,
    };
  }

  const rawDice: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rawDice.push(rollDie(parsed.sides, rng));
  }

  const { kept, dropped } = applyKeepDrop(rawDice, parsed);
  const diceSum = kept.reduce((a, b) => a + b, 0);
  const total = diceSum + parsed.modifier;

  const modStr = parsed.modifier !== 0 ? `${parsed.modifier >= 0 ? '+' : ''}${parsed.modifier}` : '';
  const breakdown = `[${rawDice.join(', ')}] → keep [${kept.join(', ')}]${modStr} = ${total}`;

  return {
    expression,
    rawDice,
    keptDice: kept,
    droppedDice: dropped,
    modifier: parsed.modifier,
    total,
    advantageState,
    breakdown,
  };
}

export interface CheckRollInput {
  abilityModifier: number;
  proficiencyBonus: number;
  isProficient: boolean;
  dc: number;
  advantageState?: 'normal' | 'advantage' | 'disadvantage';
  rng?: () => number;
}

export interface CheckRollResult extends RollResult {
  dc: number;
  success: boolean;
  natural20: boolean;
  natural1: boolean;
}

export function rollAbilityCheck(input: CheckRollInput): CheckRollResult {
  const profBonus = input.isProficient ? input.proficiencyBonus : 0;
  const modifier = input.abilityModifier + profBonus;
  const expr = modifier >= 0 ? `1d20+${modifier}` : `1d20${modifier}`;
  const result = executeRoll(expr, input.advantageState ?? 'normal', input.rng);
  const natural = result.keptDice[0] ?? 0;

  return {
    ...result,
    expression: `1d20${modifier >= 0 ? '+' : ''}${modifier}`,
    dc: input.dc,
    success: result.total >= input.dc,
    natural20: natural === 20,
    natural1: natural === 1,
  };
}

export function rollInitiative(
  dexModifier: number,
  rng?: () => number,
): RollResult {
  const expr = dexModifier >= 0 ? `1d20+${dexModifier}` : `1d20${dexModifier}`;
  return executeRoll(expr, 'normal', rng);
}

export function rollDamage(expression: string, rng?: () => number): RollResult {
  return executeRoll(expression, 'normal', rng);
}

/** Standard 4d6 drop lowest for character creation */
export function rollAbilityScores(rng: () => number = Math.random): number[] {
  const scores: number[] = [];
  for (let i = 0; i < 6; i++) {
    const result = executeRoll('4d6dl1', 'normal', rng);
    scores.push(result.total);
  }
  return scores;
}
