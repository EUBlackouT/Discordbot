import { prisma } from '../../db/client.js';
import { toJson } from '../../utils/helpers.js';
import { rollAbilityCheck, type CheckRollResult } from '../dice/engine.js';
import { formatRollSummary } from './check-display.js';
import { parseJson } from '../../utils/helpers.js';
import type { Ability } from '../../utils/helpers.js';
import type { PendingCheck } from '@prisma/client';

export async function createPendingCheck(
  campaignId: string,
  targetDiscordId: string,
  targetCharacterId: string,
  check: {
    type: string;
    skill?: string;
    ability: string;
    dc: number;
    advantageState?: string;
    publicReason: string;
    successConsequence: string;
    failureConsequence: string;
  },
  controllerReason?: string,
): Promise<PendingCheck> {
  const existing = await prisma.pendingCheck.findFirst({
    where: { campaignId, targetDiscordId, status: 'pending' },
  });
  if (existing) {
    throw new Error('This player already has a pending check. Resolve it first.');
  }

  return prisma.pendingCheck.create({
    data: {
      campaignId,
      targetDiscordId,
      targetCharacterId,
      checkType: check.type,
      skill: check.skill,
      ability: check.ability,
      dc: check.dc,
      advantageState: check.advantageState ?? 'normal',
      publicReason: check.publicReason,
      successConsequence: check.successConsequence,
      failureConsequence: check.failureConsequence,
      controllerReason: controllerReason ?? '',
      status: 'pending',
    },
  });
}

export async function getPendingCheckForPlayer(
  campaignId: string,
  discordId: string,
): Promise<PendingCheck | null> {
  return prisma.pendingCheck.findFirst({
    where: { campaignId, targetDiscordId: discordId, status: 'pending' },
  });
}

export async function resolvePendingCheck(
  pendingCheckId: string,
  rollerDiscordId: string,
): Promise<{ pending: PendingCheck; roll: CheckRollResult; rollRecordId: string }> {
  const pending = await prisma.pendingCheck.findUniqueOrThrow({
    where: { id: pendingCheckId },
    include: { character: true },
  });

  if (pending.status !== 'pending') {
    throw new Error('This check has already been resolved.');
  }
  if (pending.targetDiscordId !== rollerDiscordId) {
    throw new Error('Only the targeted player can resolve this check.');
  }

  const character = pending.character;
  const abilityMods = parseJson<Record<Ability, number>>(character.abilityMods, {
    STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0,
  });
  const skillProfs = parseJson<string[]>(character.skillProficiencies, []);
  const ability = pending.ability as Ability;
  const abilityMod = abilityMods[ability] ?? 0;
  const isProficient =
    pending.checkType === 'save'
      ? parseJson<string[]>(character.savingThrows, []).includes(ability)
      : pending.skill
        ? skillProfs.includes(pending.skill)
        : false;

  const roll = rollAbilityCheck({
    abilityModifier: abilityMod,
    proficiencyBonus: character.proficiencyBonus,
    isProficient,
    dc: pending.dc,
    advantageState: pending.advantageState as 'normal' | 'advantage' | 'disadvantage',
  });

  const rollRecord = await prisma.rollHistory.create({
    data: {
      campaignId: pending.campaignId,
      characterId: character.id,
      rollerDiscordId,
      expression: roll.expression,
      rawDice: toJson(roll.rawDice),
      keptDice: toJson(roll.keptDice),
      droppedDice: toJson(roll.droppedDice),
      modifier: roll.modifier,
      total: roll.total,
      advantageState: roll.advantageState,
      checkType: pending.checkType,
      skill: pending.skill,
      ability: pending.ability,
      dc: pending.dc,
      success: roll.success,
      pendingCheckId: pending.id,
    },
  });

  await prisma.pendingCheck.update({
    where: { id: pending.id },
    data: {
      status: 'resolved',
      rollId: rollRecord.id,
      resolvedSuccess: roll.success,
      resolvedAt: new Date(),
    },
  });

  return { pending, roll, rollRecordId: rollRecord.id };
}

export function formatCheckRequest(pending: PendingCheck): string {
  const skillPart = pending.skill ? `${pending.skill} ` : '';
  return `**${skillPart}Check Required** (DC ${pending.dc})\n${pending.publicReason}\n\nUse \`/check\` or the Roll button to resolve.`;
}

export {
  formatCheckLabel,
  formatRollSummary,
  formatRollPlayerLine,
  formatCheckPromptField,
  computeOutcomeTier,
  computeMargin,
} from './check-display.js';

/** @deprecated Use formatRollSummary — kept for tests migrating to new name */
export function formatRollResult(roll: CheckRollResult, pending: PendingCheck): string {
  return formatRollSummary(pending, roll);
}

export async function hasUnresolvedCheck(campaignId: string): Promise<boolean> {
  const count = await prisma.pendingCheck.count({
    where: { campaignId, status: 'pending' },
  });
  return count > 0;
}
