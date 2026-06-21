import { prisma } from '../db/client.js';
import { buildStatePacket, type CampaignStatePacket } from '../campaign/state.js';
import {
  buildActingPlayerContext,
  resolveCombatRoster,
} from '../campaign/party-positions.js';
import type { ControllerDecision } from '../validation/schemas.js';
import type { CampaignTurnResult } from './campaign-loop.js';
import {
  getActiveCombat,
  startCombatWithEnemies,
  resolveAttack,
  findParticipantByName,
  getCurrentParticipant,
  advanceCombatTurn,
  runEnemyTurns,
  tryEndCombatIfOver,
  applyHealing,
  applyDamage,
  setConcentration,
  processDeathSaveTurn,
  updateParticipantSpellSlots,
  addCombatReinforcements,
  endCombat,
  runOpportunityAttacks,
  markActionUsed,
  markBonusActionUsed,
  activateShield,
  type AttackResult,
  type CombatEnemyInput,
} from '../game/combat/combat-service.js';
import { rollDamage } from '../game/dice/engine.js';
import {
  detectCombatAction,
  detectCombatStartIntent,
  buildContinueCombatDecision,
} from '../game/combat/combat-intent.js';
import {
  planSpellResolution,
  rollSpellHeal,
  rollSpellSave,
  isConcentrationSpell,
} from '../game/combat/spell-combat.js';
import { canCastSpell, consumeSpellSlot, getRemainingSlots, getSpellSlotState } from '../game/combat/spell-slots.js';
import type { CombatParticipant } from '../game/combat/combat-service.js';
import {
  formatAttackSummary,
  formatEnemyTurnSummaries,
  buildCombatPanel,
  extractKillEvents,
  buildKillNarrationInstruction,
  buildCombatOutcomePayload,
} from '../game/combat/combat-display.js';
import { buildCombatBrief } from '../game/combat/combat-ai-context.js';
import { createAIProvider } from '../services/ai/index.js';

const ai = createAIProvider();

export async function handleStartCombatFromDecision(
  campaignId: string,
  discordId: string,
  decision: ControllerDecision,
  initiatorCharacterId?: string,
  statePacket?: CampaignStatePacket,
): Promise<{ combatStarted: boolean; enemies: CombatEnemyInput[]; openingEnemyAttacks: AttackResult[] }> {
  const existing = await getActiveCombat(campaignId);
  if (existing) return { combatStarted: false, enemies: [], openingEnemyAttacks: [] };

  const packet = statePacket ?? (await buildStatePacket(campaignId));
  const initiatorId =
    initiatorCharacterId ??
    packet.partyPositions.find((p) => p.discordId === discordId)?.characterId;

  let playerIds: string[];
  let combatScene: { locationId: string | null; locationName: string | null; absentParty: string[] };

  if (initiatorId) {
    const roster = resolveCombatRoster(packet, initiatorId);
    playerIds = roster.inCombatIds.length > 0 ? roster.inCombatIds : [initiatorId];
    const acting = buildActingPlayerContext(packet, discordId, initiatorId);
    combatScene = {
      locationId: acting?.locationId ?? packet.location?.id ?? null,
      locationName: acting?.locationName ?? packet.location?.name ?? null,
      absentParty: roster.absentNames,
    };
  } else {
    playerIds = packet.partyPositions.map((p) => p.characterId);
    combatScene = {
      locationId: packet.location?.id ?? null,
      locationName: packet.location?.name ?? null,
      absentParty: [],
    };
  }

  const enemies: CombatEnemyInput[] = decision.combat?.enemies?.length
    ? decision.combat.enemies
        .filter((e) => e.name)
        .map((e) => ({
          name: e.name,
          ac: e.ac,
          hp: e.hp,
          attackBonus: e.attackBonus,
          damage: e.damage,
        }))
    : [{ name: 'Hostile Foe', ac: 12, hp: 14, attackBonus: 3, damage: '1d6+1' }];

  await startCombatWithEnemies(campaignId, playerIds, enemies, combatScene);

  if (decision.combat?.danger_level) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { dangerLevel: decision.combat.danger_level },
    });
  }

  let openingEnemyAttacks: AttackResult[] = [];
  const combat = await getActiveCombat(campaignId);
  const firstUp = combat ? getCurrentParticipant(combat) : undefined;
  if (firstUp?.type === 'enemy') {
    openingEnemyAttacks = await runEnemyTurns(campaignId);
  }

  return { combatStarted: true, enemies, openingEnemyAttacks };
}

export async function handleCombatReinforcements(
  campaignId: string,
  decision: ControllerDecision,
): Promise<string[]> {
  const added = decision.combat?.add_enemies;
  if (!added?.length) return [];
  const participants = await addCombatReinforcements(campaignId, added);
  return participants.map((p) => p.name);
}

export async function processCombatPlayerAction(
  campaignId: string,
  discordId: string,
  message: string,
  characterId: string,
): Promise<CampaignTurnResult | null> {
  const combat = await getActiveCombat(campaignId);
  if (!combat) return null;

  const action = detectCombatAction(message);
  if (!action) return null;

  const current = getCurrentParticipant(combat);
  const playerParticipant = combat.participants.find((p) => p.characterId === characterId);

  // Reactions can be used off-turn
  if (action.kind === 'reaction' && action.spellKey === 'shield' && playerParticipant) {
    if (playerParticipant.hasReaction === false) {
      return combatStatusReply(combat, 'You already used your reaction this round.', 'CONTINUE_COMBAT');
    }
    const caster = await prisma.character.findUnique({ where: { id: characterId } });
    if (!caster) return { narration: 'Character not found.', controllerAction: 'ERROR_RECOVERY' };
    const slotCheck = canCastSpell(caster.spellcasting, 'shield');
    if (!slotCheck.ok) {
      return combatStatusReply(combat, slotCheck.reason ?? 'No spell slots.', 'CONTINUE_COMBAT');
    }
    await consumeSpellSlot(characterId, 'shield');
    await activateShield(campaignId, playerParticipant.id);
    const slots = getRemainingSlots(getSpellSlotState((await prisma.character.findUnique({ where: { id: characterId } }))?.spellcasting ?? null));
    await updateParticipantSpellSlots(campaignId, playerParticipant.id, slots);
    return combatStatusReply(
      combat,
      '**Shield** snaps into place — +5 AC until your next turn.',
      'CONTINUE_COMBAT',
    );
  }

  if (!current) {
    return { narration: 'Combat has stalled — no active turn.', controllerAction: 'ERROR_RECOVERY' };
  }

  if (current.type === 'player' && current.characterId !== characterId) {
    return combatStatusReply(combat, `Hold — it's **${current.name}**'s turn right now.`, 'COMBAT_WAIT_TURN');
  }

  if (current.type === 'player' && current.hp <= 0 && current.isUnconscious) {
    if (action.kind !== 'end_turn') {
      const save = await processDeathSaveTurn(campaignId, current.id);
      if (save?.result.died) {
        await tryEndCombatIfOver(campaignId);
        return buildCombatResult(campaignId, discordId, message, `**${current.name}** fails their last breath.`, save.result.breakdown, 'CONTINUE_COMBAT', true);
      }
      if (save?.result.stabilized) {
        return finishPlayerTurn(campaignId, discordId, message, save.result.breakdown, []);
      }
      return buildCombatResult(campaignId, discordId, message, save?.result.breakdown ?? 'You struggle at death\'s door.', save?.result.breakdown, 'CONTINUE_COMBAT', false);
    }
  }

  if (action.kind === 'end_turn') {
    return finishPlayerTurn(campaignId, discordId, message, `**${current.name}** ends their turn.`, []);
  }

  if (action.kind === 'flee') {
    const oaResults = await runOpportunityAttacks(campaignId, current.id);
    const downed = oaResults.some((r) => r.targetDefeated);
    if (downed) {
      await tryEndCombatIfOver(campaignId);
      const mechanical = formatEnemyTurnSummaries(oaResults);
      const narration = await narrateCombatExchange(campaignId, discordId, message, mechanical, oaResults, 'You try to flee!');
      return buildCombatResult(campaignId, discordId, message, narration, mechanical, 'CONTINUE_COMBAT', true);
    }
    await endCombat(campaignId);
    const mechanical = oaResults.length ? formatEnemyTurnSummaries(oaResults) : undefined;
    const narration = oaResults.length
      ? await narrateCombatExchange(campaignId, discordId, message, mechanical!, oaResults, 'You break from the fight.')
      : 'You break from the fight — survival first. The clash fades behind you.';
    return buildCombatResult(campaignId, discordId, message, narration, mechanical, 'CONTINUE_COMBAT', true);
  }

  const caster = await prisma.character.findUnique({ where: { id: characterId } });
  if (!caster) {
    return { narration: 'Character not found.', controllerAction: 'ERROR_RECOVERY' };
  }

  const allAttacks: AttackResult[] = [];
  let mechanicalSummary: string | undefined;

  if (action.kind === 'cast_spell' && action.spellKey) {
    const plan = planSpellResolution(action.spellKey, caster);
    if (!plan) {
      return combatStatusReply(combat, `You don't know that spell.`, 'CONTINUE_COMBAT');
    }

    if (plan.actionEconomy === 'bonus') {
      if (current.hasUsedBonusAction) {
        return combatStatusReply(combat, 'You already used your bonus action this turn.', 'CONTINUE_COMBAT');
      }
    } else if (plan.actionEconomy === 'action') {
      if (current.hasUsedAction) {
        return combatStatusReply(combat, 'You already used your action this turn.', 'CONTINUE_COMBAT');
      }
    }

    const slotCheck = canCastSpell(caster.spellcasting, action.spellKey);
    if (!slotCheck.ok) {
      return combatStatusReply(combat, slotCheck.reason ?? 'No spell slots.', 'CONTINUE_COMBAT');
    }

    const target = resolveTarget(combat.participants, action.targetName, plan.kind === 'heal' ? 'player' : 'enemy');
    if (plan.requiresTarget && !target) {
      return combatStatusReply(combat, `Who are you targeting with **${plan.spellName}**?`, 'CONTINUE_COMBAT');
    }

    await consumeSpellSlot(characterId, action.spellKey);
    const updatedCaster = await prisma.character.findUnique({ where: { id: characterId } });
    const refreshedSlots = getRemainingSlots(getSpellSlotState(updatedCaster?.spellcasting ?? null));
    await updateParticipantSpellSlots(campaignId, current.id, refreshedSlots);

    if (isConcentrationSpell(action.spellKey)) {
      await setConcentration(campaignId, current.id, action.spellKey);
    }

    if (plan.actionEconomy === 'bonus') await markBonusActionUsed(campaignId, current.id);
    else if (plan.actionEconomy === 'action') await markActionUsed(campaignId, current.id);

    if (plan.kind === 'heal' && target) {
      const heal = rollSpellHeal(plan.healExpr ?? '1d8');
      const healed = await applyHealing(target.id, campaignId, heal.amount);
      mechanicalSummary = `${plan.spellName}: **+${healed}** HP to ${target.name} (${heal.breakdown})`;
    } else if (plan.kind === 'save' && target) {
      const save = rollSpellSave(plan.saveDc ?? 13, 0);
      if (!save.success && plan.damageExpr) {
        const dmg = rollDamage(plan.damageExpr);
        const effect = await applyDamage(target.id, campaignId, dmg.total);
        mechanicalSummary = `${plan.spellName}: ${target.name} fails save — **${dmg.total}** damage (${dmg.breakdown})`;
        if (effect.concentrationBroken) {
          mechanicalSummary += `\n${effect.concentrationBroken.breakdown}`;
        }
        if (effect.defeated) {
          allAttacks.push({
            attackerId: current.id,
            attackerName: current.name,
            targetId: target.id,
            targetName: target.name,
            targetType: target.type,
            hit: true,
            critical: false,
            natural1: false,
            attackRoll: 0,
            attackTotal: 0,
            targetAc: target.ac,
            damage: dmg.total,
            targetHpAfter: 0,
            targetDefeated: true,
            breakdown: mechanicalSummary,
            method: 'spell',
            spellName: plan.spellName,
          });
        }
      } else {
        mechanicalSummary = `${plan.spellName}: ${target.name} succeeds on save (${save.breakdown})`;
      }
    } else if (plan.kind === 'attack' && target) {
      const result = await resolveAttack(campaignId, current.id, target.id, {
        attackBonus: plan.attackBonus,
        damageExpr: plan.damageExpr,
        method: 'spell',
        spellName: plan.spellName,
      });
      allAttacks.push(result);
      mechanicalSummary = formatAttackSummary(result);
    } else {
      mechanicalSummary = `${plan.spellName} takes effect.`;
    }
  } else if (action.kind === 'attack') {
    if (current.hasUsedAction) {
      return combatStatusReply(combat, 'You already used your action this turn. Say **end turn** or use a bonus action.', 'CONTINUE_COMBAT');
    }
    const target = resolveTarget(combat.participants, action.targetName, 'enemy');
    if (!target) {
      return combatStatusReply(combat, 'Who are you attacking? Name your target.', 'CONTINUE_COMBAT');
    }
    await markActionUsed(campaignId, current.id);
    const result = await resolveAttack(campaignId, current.id, target.id, { method: 'weapon' });
    allAttacks.push(result);
    mechanicalSummary = formatAttackSummary(result);
  }

  const refreshedCombat = await getActiveCombat(campaignId);
  const refreshedCurrent = refreshedCombat?.participants.find((p) => p.id === current.id);
  const turnContinues =
    refreshedCurrent &&
    ((refreshedCurrent.hasUsedAction && !refreshedCurrent.hasUsedBonusAction) ||
      (!refreshedCurrent.hasUsedAction && refreshedCurrent.hasUsedBonusAction));

  if (turnContinues) {
    const hint = refreshedCurrent!.hasUsedAction
      ? '\n\n_Bonus action still available — cast a bonus spell or say **end turn**._'
      : '\n\n_Action still available — attack, cast, or say **end turn**._';
    const narration = await narrateCombatExchange(
      campaignId,
      discordId,
      message,
      mechanicalSummary ?? '',
      allAttacks,
      undefined,
    );
    return buildCombatResult(campaignId, discordId, message, narration + hint, mechanicalSummary, 'CONTINUE_COMBAT', false);
  }

  return finishPlayerTurn(campaignId, discordId, message, mechanicalSummary, allAttacks);
}

async function finishPlayerTurn(
  campaignId: string,
  discordId: string,
  message: string,
  mechanicalSummary: string | undefined,
  playerAttacks: AttackResult[],
): Promise<CampaignTurnResult> {
  await advanceCombatTurn(campaignId);
  const enemyResults = await runEnemyTurns(campaignId);
  const ended = await tryEndCombatIfOver(campaignId);

  const allAttacks = [...playerAttacks, ...enemyResults];
  const mechanical = [mechanicalSummary, formatEnemyTurnSummaries(enemyResults)].filter(Boolean).join('\n\n');

  const narration = ended
    ? await narrateCombatExchange(campaignId, discordId, message, mechanical, allAttacks, 'Combat ends.')
    : await narrateCombatExchange(campaignId, discordId, message, mechanical, allAttacks);

  return buildCombatResult(campaignId, discordId, message, narration, mechanical || undefined, 'CONTINUE_COMBAT', ended);
}

async function narrateCombatExchange(
  campaignId: string,
  discordId: string,
  message: string,
  mechanicalSummary: string,
  attacks: AttackResult[],
  fallback?: string,
): Promise<string> {
  const kills = extractKillEvents(attacks);
  const killInstruction = buildKillNarrationInstruction(kills);
  const statePacket = await buildStatePacket(campaignId);
  const combatBrief = buildCombatBrief(statePacket);
  const primaryAttack = attacks[0];

  try {
    return await ai.generateNarration({
      controllerDecision: buildContinueCombatDecision(mechanicalSummary, killInstruction || undefined),
      statePacket,
      playerMessage: message,
      messageMode: 'action',
      maxParagraphs: kills.length ? 3 : 2,
      maxTokens: kills.length ? 280 : 220,
      campaignChronicle: combatBrief ?? undefined,
      combatOutcome: buildCombatOutcomePayload(kills, attacks),
      rollResult: primaryAttack
        ? {
            total: primaryAttack.attackTotal,
            success: primaryAttack.hit,
            breakdown: primaryAttack.breakdown,
            successConsequence: primaryAttack.hit
              ? primaryAttack.targetDefeated
                ? `**${primaryAttack.targetName}** is defeated by ${primaryAttack.attackerName}${primaryAttack.critical ? ' (critical)' : ''}.`
                : `${primaryAttack.targetName} is wounded (${primaryAttack.targetHpAfter} HP remaining).`
              : 'The blow goes wide.',
            failureConsequence: 'The attack misses.',
          }
        : undefined,
    });
  } catch {
    return fallback ?? mechanicalSummary;
  }
}

/** Narrate combat beginning — enemy opening strikes only, or setup if player acts first. */
export async function narrateCombatStart(
  campaignId: string,
  discordId: string,
  message: string,
  decision: ControllerDecision,
  openingEnemyAttacks: AttackResult[],
): Promise<string> {
  if (openingEnemyAttacks.length > 0) {
    const mechanical = formatEnemyTurnSummaries(openingEnemyAttacks);
    return narrateCombatExchange(
      campaignId,
      discordId,
      message,
      mechanical,
      openingEnemyAttacks,
      mechanical,
    );
  }

  const statePacket = await buildStatePacket(campaignId);
  const combatBrief = buildCombatBrief(statePacket);
  const absentNote =
    statePacket.combat?.absentParty?.length ?
      ` Party members elsewhere (not in this fight): ${statePacket.combat.absentParty.join(', ')}. Mention only distant sounds for them — do not narrate their participation.`
    : '';
  try {
    return await ai.generateNarration({
      controllerDecision: {
        ...decision,
        action: 'START_COMBAT',
        narration_instruction:
          (decision.narration_instruction ??
            'Combat erupts. Describe weapons drawn and foes reacting — do not resolve hits yet. The player chooses their action next.') + absentNote,
      },
      statePacket,
      playerMessage: message,
      messageMode: 'action',
      maxParagraphs: 2,
      maxTokens: 200,
      campaignChronicle: combatBrief ?? undefined,
    });
  } catch {
    return 'Steel rings free — initiative is set. What do you do?';
  }
}

function combatStatusReply(
  combat: NonNullable<Awaited<ReturnType<typeof getActiveCombat>>>,
  narration: string,
  action: string,
): CampaignTurnResult {
  return {
    narration,
    combatActive: true,
    combatStatus: buildCombatPanel(combat).description,
    controllerAction: action,
  };
}

function resolveTarget(
  participants: CombatParticipant[],
  targetName: string | undefined,
  preferType: 'enemy' | 'player',
): CombatParticipant | undefined {
  const pool = participants.filter((p) => p.type === preferType && p.hp > 0);
  if (targetName) {
    return findParticipantByName(pool, targetName) ?? findParticipantByName(participants, targetName);
  }
  return pool[0];
}

async function buildCombatResult(
  campaignId: string,
  discordId: string,
  message: string,
  narration: string,
  mechanicalSummary: string | undefined,
  action: string,
  combatEnded: boolean,
): Promise<CampaignTurnResult> {
  await prisma.conversationTurn.create({
    data: { campaignId, discordId, message, response: narration, controllerAction: action },
  });

  const combat = combatEnded ? null : await getActiveCombat(campaignId);
  return {
    narration,
    rollSummary: mechanicalSummary,
    combatActive: Boolean(combat),
    combatStatus: combat ? buildCombatPanel(combat).description : undefined,
    combatEnded,
    controllerAction: action,
  };
}

export { detectCombatStartIntent };
