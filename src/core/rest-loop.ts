import { prisma } from '../db/client.js';
import { buildStatePacket } from '../campaign/state.js';
import { buildActingPlayerContext, scopeStateForActingPlayer } from '../campaign/party-positions.js';
import { readChronicle } from '../dm/chronicle/campaign-chronicle.js';
import { createAIProvider } from '../services/ai/index.js';
import type { ControllerDecision } from '../validation/schemas.js';
import type { CampaignTurnResult } from './campaign-loop.js';
import { applyControllerStateUpdates } from '../dm/state/apply-controller-updates.js';
import { listCampaignParty } from '../tenant/campaign-member.js';
import { handleStartCombatFromDecision } from './combat-loop.js';
import { getActiveCombat } from '../game/combat/combat-service.js';
import { buildCombatPanel } from '../game/combat/combat-display.js';
import {
  performPartyLongRest,
  setCampPending,
  clearCampPending,
  isCampPending,
  formatRestRecoverySummary,
} from '../game/combat/rest.js';
import { REST_DM_POLICY } from '../game/combat/rest-intent.js';
import { createPendingCheck } from '../game/checks/pending-check.js';
import { logger } from '../utils/logger.js';
import { tryGenerateSceneImage } from '../assets/scene-image.js';
import type { AssetManager } from '../assets/asset-manager.js';

const ai = createAIProvider();

export async function handleRestRequest(
  campaignId: string,
  discordId: string,
  message: string,
  characterId: string | undefined,
  campAlreadyPending: boolean,
  assetManager: AssetManager,
): Promise<CampaignTurnResult> {
  if (await getActiveCombat(campaignId)) {
    return {
      narration:
        'Steel is still drawn and hearts still pound — there is no rest while battle rages. End the fight or flee first.',
      controllerAction: 'REST_DENIED',
    };
  }

  const statePacket = await buildStatePacket(campaignId);
  const campaignChronicle = await readChronicle(campaignId);

  let decision: ControllerDecision;
  try {
    decision = await ai.generateControllerDecision({
      playerMessage: message,
      playerDiscordId: discordId,
      characterId,
      statePacket,
      campaignChronicle,
      messageMode: 'action',
      dmPolicy: `${REST_DM_POLICY}\n\n${
        campAlreadyPending
          ? 'The party already started making camp (see openThreads). The player is continuing camp activities — resolve whether they complete a long rest, get interrupted, or must flee.'
          : 'The player is initiating rest or camp for the first time this scene.'
      }`,
    });
  } catch (err) {
    logger.error('Rest controller AI failed', err);
    return {
      narration: 'The moment hangs uncertain — try describing where and how you want to rest.',
      controllerAction: 'ERROR_RECOVERY',
    };
  }

  // Coerce non-REST actions into rest handling when rest directive missing
  if (!decision.rest) {
    decision = {
      ...decision,
      action: 'REST',
      rest: inferRestOutcome(decision, statePacket.campaign.dangerLevel, campAlreadyPending),
    };
  }

  if (decision.state_updates?.length) {
    await applyControllerStateUpdates(campaignId, decision.state_updates, statePacket);
  }

  return executeRestDecision(campaignId, discordId, message, decision, characterId, assetManager);
}

function inferRestOutcome(
  decision: ControllerDecision,
  dangerLevel: number,
  campPending: boolean,
): NonNullable<ControllerDecision['rest']> {
  if (decision.combat?.enemies?.length || decision.action === 'START_COMBAT') {
    return { outcome: 'interrupt', interrupt_type: 'ambush' };
  }
  if (decision.action === 'REQUEST_CHECK') {
    return { outcome: 'interrupt', interrupt_type: 'other' };
  }
  if (dangerLevel >= 4 && !campPending) {
    return { outcome: 'setup', camp_prompt: 'Who keeps watch first, and how defensible is this spot?' };
  }
  if (campPending && dangerLevel <= 2) {
    return { outcome: 'approve' };
  }
  if (dangerLevel <= 2) {
    return { outcome: 'approve' };
  }
  return { outcome: 'setup', camp_prompt: 'What do you do before sleeping — watch, ward the camp, or press on?' };
}

async function executeRestDecision(
  campaignId: string,
  discordId: string,
  message: string,
  decision: ControllerDecision,
  characterId: string | undefined,
  assetManager: AssetManager,
): Promise<CampaignTurnResult> {
  const outcome = decision.rest?.outcome ?? 'setup';
  const postState = await buildStatePacket(campaignId);
  const chronicle = await readChronicle(campaignId);

  const narration = await ai.generateNarration({
    controllerDecision: decision,
    statePacket: postState,
    playerMessage: message,
    messageMode: 'action',
    maxParagraphs: outcome === 'approve' ? 2 : 3,
    maxTokens: outcome === 'approve' ? 220 : 300,
    campaignChronicle: chronicle,
  });

  let assetPath: string | undefined;
  if (outcome === 'approve' || outcome === 'interrupt' || outcome === 'setup') {
    assetPath = await tryGenerateSceneImage(assetManager, campaignId, postState, {
      moment: outcome === 'approve' ? 'camp' : outcome === 'interrupt' ? 'dramatic' : 'flavor',
      force: outcome === 'interrupt',
      narrationSnippet: narration,
    });
  }

  if (outcome === 'deny') {
    await clearCampPending(campaignId);
    await saveRestTurn(campaignId, discordId, message, narration, 'REST_DENIED');
    return { narration, controllerAction: 'REST_DENIED' };
  }

  if (outcome === 'setup') {
    await setCampPending(campaignId);
    const prompt = decision.rest?.camp_prompt;
    const fullNarration = prompt
      ? `${narration}\n\n*${prompt}*`
      : narration;
    await saveRestTurn(campaignId, discordId, message, fullNarration, 'REST_SETUP');
    return { narration: fullNarration, assetPath, controllerAction: 'REST_SETUP' };
  }

  if (outcome === 'interrupt') {
    await clearCampPending(campaignId);

    if (decision.action === 'REQUEST_CHECK' && decision.check && characterId) {
      await createPendingCheck(campaignId, discordId, characterId, decision.check);
      await saveRestTurn(campaignId, discordId, message, narration, 'REST_INTERRUPT');
      return {
        narration,
        assetPath,
        pendingCheck: true,
        checkPrompt: {
          skill: decision.check.skill ?? null,
          ability: decision.check.ability,
          dc: decision.check.dc,
        },
        controllerAction: 'REST_INTERRUPT',
      };
    }

    if (decision.combat?.enemies?.length || decision.action === 'START_COMBAT') {
      const combatDecision: ControllerDecision = {
        ...decision,
        action: 'START_COMBAT',
        combat: decision.combat ?? { enemies: [{ name: 'Night Assailant', ac: 13, hp: 14, attackBonus: 3, damage: '1d6+1' }] },
      };
      const restPlayerAi = buildActingPlayerContext(postState, discordId, characterId);
      const restScoped = scopeStateForActingPlayer(postState, restPlayerAi);
      const { combatStarted } = await handleStartCombatFromDecision(
        campaignId,
        discordId,
        combatDecision,
        characterId,
        restScoped,
      );
      const combat = await getActiveCombat(campaignId);
      await saveRestTurn(campaignId, discordId, message, narration, 'REST_INTERRUPT');
      return {
        narration,
        assetPath,
        combatActive: combatStarted && Boolean(combat),
        combatStatus: combat ? buildCombatPanel(combat).description : undefined,
        controllerAction: 'REST_INTERRUPT',
      };
    }

    await saveRestTurn(campaignId, discordId, message, narration, 'REST_INTERRUPT');
    return { narration, assetPath, controllerAction: 'REST_INTERRUPT' };
  }

  // approve — mechanical long rest
  await clearCampPending(campaignId);
  const party = await listCampaignParty(campaignId);
  const results = await performPartyLongRest(
    campaignId,
    party.map((m) => m.characterId),
  );
  const recovery = formatRestRecoverySummary(results);

  if (decision.combat?.danger_level !== undefined) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { dangerLevel: Math.max(1, decision.combat.danger_level) },
    });
  } else {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (campaign && campaign.dangerLevel > 1) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { dangerLevel: campaign.dangerLevel - 1 },
      });
    }
  }

  const fullNarration = recovery ? `${narration}\n\n${recovery}` : narration;
  await saveRestTurn(campaignId, discordId, message, fullNarration, 'REST_APPROVED');
  return {
    narration: fullNarration,
    rollSummary: recovery || undefined,
    assetPath,
    controllerAction: 'REST_APPROVED',
  };
}

async function saveRestTurn(
  campaignId: string,
  discordId: string,
  message: string,
  response: string,
  action: string,
): Promise<void> {
  await prisma.conversationTurn.create({
    data: { campaignId, discordId, message, response, controllerAction: action },
  });
}
