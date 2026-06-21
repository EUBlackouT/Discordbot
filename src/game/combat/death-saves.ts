import { executeRoll } from '../dice/engine.js';

export interface DeathSaveResult {
  roll: number;
  total: number;
  successes: number;
  failures: number;
  stabilized: boolean;
  died: boolean;
  breakdown: string;
}

export function rollDeathSave(currentSuccesses: number, currentFailures: number): DeathSaveResult {
  const roll = executeRoll('1d20');
  const natural = roll.keptDice[0] ?? 0;
  let successes = currentSuccesses;
  let failures = currentFailures;

  if (natural === 1) {
    failures += 2;
  } else if (natural === 20) {
    return {
      roll: natural,
      total: natural,
      successes: 3,
      failures: currentFailures,
      stabilized: true,
      died: false,
      breakdown: `Natural 20 — **${roll.breakdown}** — you surge back to **1 HP**!`,
    };
  } else if (natural >= 10) {
    successes += 1;
  } else {
    failures += 1;
  }

  const died = failures >= 3;
  const stabilized = successes >= 3;

  return {
    roll: natural,
    total: natural,
    successes,
    failures,
    stabilized,
    died,
    breakdown: stabilized
      ? `Death save **${natural}** — third success. You stabilize.`
      : died
        ? `Death save **${natural}** — third failure. You slip away.`
        : `Death save **${natural}** — ${successes} success(es), ${failures} failure(s).`,
  };
}
