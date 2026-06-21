import type { Ability } from '../../utils/helpers.js';
import type { CheckRollResult } from '../dice/engine.js';
import type { PendingCheck } from '@prisma/client';

/** How close the roll was to the DC — drives narration depth, not mechanics. */
export type CheckOutcomeTier =
  | 'critical_success'
  | 'solid_success'
  | 'bare_success'
  | 'bare_failure'
  | 'solid_failure'
  | 'critical_failure';

export function computeOutcomeTier(roll: CheckRollResult): CheckOutcomeTier {
  const margin = roll.total - roll.dc;
  if (roll.natural20) return 'critical_success';
  if (roll.natural1) return 'critical_failure';
  if (roll.success) {
    return margin >= 5 ? 'solid_success' : 'bare_success';
  }
  return margin >= -2 ? 'bare_failure' : 'solid_failure';
}

export function computeMargin(roll: CheckRollResult): number {
  return roll.total - roll.dc;
}

export function formatCheckLabel(pending: Pick<PendingCheck, 'skill' | 'ability' | 'checkType'>): string {
  if (pending.skill) return pending.skill;
  if (pending.checkType === 'save') return `${pending.ability} save`;
  return `${pending.ability} check`;
}

function formatModifierClause(
  ability: string,
  abilityMod: number,
  proficiencyApplied: number,
): string {
  const parts: string[] = [];
  const abSign = abilityMod >= 0 ? '+' : '';
  parts.push(`${ability} (${abSign}${abilityMod})`);
  if (proficiencyApplied !== 0) {
    const pSign = proficiencyApplied >= 0 ? '+' : '';
    parts.push(`prof (${pSign}${proficiencyApplied})`);
  }
  return parts.join(' · ');
}

/** Full mechanical breakdown — shown once on the Chronicler embed only. */
export function formatRollSummary(
  pending: Pick<PendingCheck, 'skill' | 'ability' | 'checkType' | 'dc'>,
  roll: CheckRollResult,
): string {
  const label = formatCheckLabel(pending);
  const abilityMod = roll.abilityModifier ?? 0;
  const profApplied = roll.proficiencyApplied ?? 0;
  const modClause = formatModifierClause(pending.ability, abilityMod, profApplied);
  const die = roll.keptDice[0] ?? '?';
  const adv =
    roll.advantageState === 'advantage'
      ? ' · advantage'
      : roll.advantageState === 'disadvantage'
        ? ' · disadvantage'
        : '';
  const nat =
    roll.natural20 ? ' · **Natural 20!**' : roll.natural1 ? ' · **Natural 1!**' : '';
  const outcome = roll.success ? '✅ **Success**' : '❌ **Failure**';
  const margin = computeMargin(roll);
  const marginNote =
    margin === 0
      ? ' (exactly DC)'
      : roll.success && margin <= 2
        ? ' (barely)'
        : !roll.success && margin >= -2
          ? ' (near miss)'
          : '';

  return (
    `**${label}** vs DC **${roll.dc}**\n` +
    `d20 **${die}** · ${modClause} = **${roll.total}**${adv}${nat}\n` +
    `${outcome}${marginNote}`
  );
}

/** One-line player embed — never duplicates the full roll block. */
export function formatRollPlayerLine(
  pending: Pick<PendingCheck, 'skill' | 'ability' | 'checkType' | 'dc'>,
  roll: CheckRollResult,
): string {
  const label = formatCheckLabel(pending);
  const verb = roll.success ? 'succeeds' : 'fails';
  return `${label} — ${verb} (${roll.total} vs DC ${roll.dc})`;
}

export function formatCheckPromptField(
  check: { skill?: string | null; ability: string; dc: number; checkType?: string },
): string {
  const label = check.skill ?? (check.checkType === 'save' ? `${check.ability} save` : check.ability);
  return `**${label}** · DC **${check.dc}**`;
}

/** Narration rules injected for every RESOLVE_CHECK — not scenario-specific. */
export const CHECK_RESOLVE_NARRATION_RULES = `
When narrating a resolved skill check (RESOLVE_CHECK):
- Dice math is shown in a separate Roll field — NEVER repeat d20 values, modifiers, totals, or DC in prose.
- roll_result.check_reason and player_message say WHAT the roll was for (e.g. searching for jewelry, tracking a prisoner). Your narration MUST stay on that topic — if they failed to find jewelry, say no jewelry was found, not a generic "nothing useful."
- success_consequence / failure_consequence are the intended plot beats — weave them into prose tied to check_reason.
- Length: 1-2 short sentences on failure; 2-3 on success. Speakable in under 15 seconds.
- Use outcome_tier from roll_result to calibrate what the character learns:
  - critical_success: major reveal tied to the active quest; connect to success_consequence fully
  - solid_success: clear useful finding from success_consequence
  - bare_success: partial or ambiguous clue from success_consequence — not everything
  - bare_failure: near miss — a hint of something wrong but no useful fact (tease failure_consequence)
  - solid_failure: nothing useful; complication or lost opportunity from failure_consequence
  - critical_failure: wrong lead, visible mistake, or worsening situation from failure_consequence
- Advance the story one beat — do not restage the same scene or repeat prior narration.
`.trim();

export function narrationHintForTier(tier: CheckOutcomeTier): string {
  switch (tier) {
    case 'critical_success':
      return 'Critical success — deliver a major plot-relevant reveal.';
    case 'solid_success':
      return 'Solid success — a clear, useful finding.';
    case 'bare_success':
      return 'Bare success — partial clue only; leave ambiguity.';
    case 'bare_failure':
      return 'Near miss — almost found something; no hard fact.';
    case 'solid_failure':
      return 'Clear failure — nothing useful; slight complication ok.';
    case 'critical_failure':
      return 'Critical failure — wrong conclusion or visible blunder.';
  }
}
