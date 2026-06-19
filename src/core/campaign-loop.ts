import { prisma } from '../db/client.js';
import { buildStatePacket } from '../campaign/state.js';
import {
  buildLocationPanel,
  buildNpcsPanel,
  buildPartyPanel,
  buildQuestsPanel,
  buildRecapPanel,
  metaIntentNarration,
  type CampaignPanel,
} from '../campaign/campaign-panels.js';
import { detectMetaIntent } from '../campaign/player-intent.js';
import { classifyMessageMode, narrationLimitsForMode } from '../campaign/message-mode.js';
import { readChronicle, ensureChronicle, applyChronicleFromMemory } from '../dm/chronicle/campaign-chronicle.js';
import { createAIProvider } from '../services/ai/index.js';
import { createPendingCheck, resolvePendingCheck, hasUnresolvedCheck } from '../game/checks/pending-check.js';
import { applyMemoryExtraction } from '../dm/memory/extractor.js';
import { AssetManager, createImageService } from '../assets/asset-manager.js';
import { config } from '../config/index.js';
import { getActiveCharacterForPlayer, leaveCampaign } from '../tenant/campaign-member.js';
import { logger } from '../utils/logger.js';
import type { ControllerDecision } from '../validation/schemas.js';
import { applyControllerStateUpdates } from '../dm/state/apply-controller-updates.js';

const ai = createAIProvider();
const imageService = createImageService();
const assetManager = new AssetManager(imageService);

export interface CampaignTurnResult {
  narration: string;
  panels?: CampaignPanel[];
  isPrivate?: boolean;
  pendingCheck?: boolean;
  rollResolved?: boolean;
  assetPath?: string;
  locationName?: string;
  controllerAction: string;
  briefReply?: boolean;
}

export async function processCampaignMessage(
  campaignId: string,
  discordId: string,
  message: string,
  characterId?: string,
): Promise<CampaignTurnResult> {
  const statePacket = await buildStatePacket(campaignId);
  await ensureChronicle(campaignId, statePacket.campaign.name);
  const campaignChronicle = await readChronicle(campaignId);
  const messageMode = classifyMessageMode(message);
  const narrationLimits = narrationLimitsForMode(messageMode);

  const memberCharacter = await getActiveCharacterForPlayer(campaignId, discordId);
  const activeCharacterId = characterId ?? memberCharacter?.id;

  if (!activeCharacterId && !statePacket.pendingChecks.some((p) => p.targetDiscordId === discordId)) {
    return {
      narration: 'You need to join this campaign first. Use `/campaign join character:YourName`.',
      controllerAction: 'ERROR_RECOVERY',
    };
  }

  const metaIntent = detectMetaIntent(message);
  if (metaIntent) {
    return handleMetaIntent(campaignId, discordId, metaIntent, statePacket);
  }

  // If player has pending check and message looks like roll attempt, redirect
  const pending = await prisma.pendingCheck.findFirst({
    where: { campaignId, targetDiscordId: discordId, status: 'pending' },
  });

  if (pending && /\b(roll|check)\b/i.test(message)) {
    return {
      narration: 'You have a pending check — tap **Roll** below or type what you\'re attempting.',
      pendingCheck: true,
      controllerAction: 'PENDING_CHECK_REMINDER',
    };
  }

  if (await hasUnresolvedCheck(campaignId) && !pending) {
    // Another player has pending check - still process but warn in logs
    logger.debug('Campaign has unresolved check from another player');
  }

  let decision: ControllerDecision;
  try {
    decision = await ai.generateControllerDecision({
      playerMessage: message,
      playerDiscordId: discordId,
      characterId: activeCharacterId,
      statePacket,
      campaignChronicle,
      messageMode,
      dmPolicy: '',
    });
  } catch (err) {
    logger.error('Controller AI failed', err);
    return {
      narration: 'The DM falters—a moment of silence hangs over Mistharbor. Try rephrasing your action.',
      controllerAction: 'ERROR_RECOVERY',
    };
  }

  if (decision.state_updates?.length) {
    await applyControllerStateUpdates(campaignId, decision.state_updates, statePacket);
  }
  const narrationState = await buildStatePacket(campaignId);
  const refreshedChronicle = await readChronicle(campaignId);
  const narratorContext = {
    playerMessage: message,
    characterName: memberCharacter?.name,
    messageMode,
    campaignChronicle: refreshedChronicle,
    brief: narrationLimits.brief,
    maxParagraphs: narrationLimits.maxParagraphs,
    maxTokens: narrationLimits.maxTokens,
  };

  // REQUEST_CHECK — store pending, narrate request only (no success/failure)
  if (decision.action === 'REQUEST_CHECK' && decision.check) {
    if (!activeCharacterId) {
      return {
        narration: 'You need a complete character to attempt checks. Use `/character create`.',
        controllerAction: 'ERROR_RECOVERY',
      };
    }

    await createPendingCheck(
      campaignId,
      decision.target_player_id ?? discordId,
      decision.target_character_id ?? activeCharacterId,
      decision.check,
      decision.reason,
    );

    const narration = await ai.generateNarration({
      controllerDecision: decision,
      statePacket: narrationState,
      ...narratorContext,
    });

    await saveTurn(campaignId, discordId, message, narration, decision.action);

    return {
      narration,
      pendingCheck: true,
      locationName: narrationState.location?.name,
      controllerAction: decision.action,
    };
  }

  // Recap / scene info — dynamic panels, not slash commands
  if (decision.action === 'RECAP') {
    const panels = [await buildRecapPanel(campaignId)];
    const narration =
      (await ai.generateNarration({
        controllerDecision: decision,
        statePacket: narrationState,
        ...narratorContext,
      }).catch(() => '')) ||
      metaIntentNarration('recap');
    await saveTurn(campaignId, discordId, message, narration, decision.action);
    return { narration, panels, locationName: narrationState.location?.name, controllerAction: decision.action };
  }

  // Standard narration path
  let narration = await ai.generateNarration({
    controllerDecision: decision,
    statePacket: narrationState,
    ...narratorContext,
  });
  const panels: CampaignPanel[] = [];

  // Asset decision — skip for brief observation questions
  let assetPath: string | undefined;
  const skipSceneImage = messageMode === 'observe';
  if (!skipSceneImage) {
  try {
    const hint = decision.asset_decision_hint ?? {};
    const wantsLocation =
      hint.location_image_relevant ||
      decision.action === 'START_SCENE' ||
      decision.action === 'END_SCENE';
    const assetDecision = await ai.generateAssetDecision(narrationState, {
      ...hint,
      location_image_relevant: wantsLocation || hint.location_image_relevant,
    });
    const needsNewLocationArt = Boolean(
      narrationState.location && (wantsLocation || !narrationState.location.activeAssetId),
    );
    const asset = await assetManager.decideAndExecute(campaignId, narrationState, {
      ...assetDecision,
      should_generate_image:
        assetDecision.should_generate_image ||
        (needsNewLocationArt && Boolean(config.image.apiKey)),
      asset_type: 'location',
      new_asset_needed: !narrationState.location?.activeAssetId,
    });
    if (asset?.localPath) assetPath = asset.localPath;
    if (narrationState.location && (wantsLocation || assetDecision.should_generate_image)) {
      panels.push(buildLocationPanel(narrationState));
    }
  } catch (err) {
    logger.warn('Asset decision failed', err);
  }
  }

  await saveTurn(campaignId, discordId, message, narration, decision.action);

  // Memory extraction + chronicle update
  try {
    const memory = await ai.extractMemory({
      playerMessage: message,
      dmResponse: narration,
      controllerDecision: decision,
      statePacket: narrationState,
      campaignChronicle: refreshedChronicle,
    });
    await applyMemoryExtraction(campaignId, memory);
    await applyChronicleFromMemory(campaignId, memory, {
      playerMessage: message,
      characterName: memberCharacter?.name,
    });
  } catch (err) {
    logger.warn('Memory extraction failed', err);
  }

  if (decision.action === 'PRIVATE_WHISPER' && decision.private_message) {
    return {
      narration: decision.private_message,
      isPrivate: true,
      controllerAction: decision.action,
    };
  }

  return {
    narration,
    panels: panels.length ? panels : undefined,
    assetPath,
    locationName: narrationState.location?.name,
    controllerAction: decision.action,
    briefReply: narrationLimits.brief,
  };
}

async function handleMetaIntent(
  campaignId: string,
  discordId: string,
  intent: NonNullable<ReturnType<typeof detectMetaIntent>>,
  statePacket: Awaited<ReturnType<typeof buildStatePacket>>,
): Promise<CampaignTurnResult> {
  if (intent === 'leave') {
    try {
      await leaveCampaign(campaignId, discordId);
      return {
        narration: 'You step back from the tale. Your character remains on the roster if you wish to return.',
        controllerAction: 'LEAVE_CAMPAIGN',
      };
    } catch (err) {
      return { narration: (err as Error).message, controllerAction: 'ERROR_RECOVERY' };
    }
  }

  const panels: CampaignPanel[] = [];
  switch (intent) {
    case 'recap':
      panels.push(await buildRecapPanel(campaignId));
      break;
    case 'location': {
      panels.push(buildLocationPanel(statePacket));
      if (statePacket.location) {
        try {
          const asset = await assetManager.reuseLocationAsset(statePacket.location.id);
          if (asset?.localPath) {
            return {
              narration: metaIntentNarration('location'),
              panels,
              assetPath: asset.localPath,
              locationName: statePacket.location?.name,
              controllerAction: 'META_LOCATION',
            };
          }
          const assetDecision = await ai.generateAssetDecision(statePacket, { location_image_relevant: true });
          const generated = await assetManager.decideAndExecute(campaignId, statePacket, {
            ...assetDecision,
            should_generate_image: true,
            asset_type: 'location',
            new_asset_needed: !statePacket.location.activeAssetId,
            reason: 'Player asked about surroundings',
          });
          return {
            narration: metaIntentNarration('location'),
            panels,
            assetPath: generated?.localPath,
            locationName: statePacket.location?.name,
            controllerAction: 'META_LOCATION',
          };
        } catch (err) {
          logger.warn('Location visual failed', err);
        }
      }
      break;
    }
    case 'quests':
      panels.push(await buildQuestsPanel(campaignId));
      break;
    case 'npcs':
      panels.push(buildNpcsPanel(statePacket));
      break;
    case 'party':
      panels.push(await buildPartyPanel(campaignId, statePacket.campaign.name));
      break;
  }

  const narration = metaIntentNarration(intent);
  await saveTurn(campaignId, discordId, `[${intent}]`, narration, `META_${intent.toUpperCase()}`);
  return { narration, panels, locationName: statePacket.location?.name, controllerAction: `META_${intent.toUpperCase()}` };
}

export async function processCheckRoll(
  campaignId: string,
  discordId: string,
): Promise<CampaignTurnResult> {
  const pending = await prisma.pendingCheck.findFirst({
    where: { campaignId, targetDiscordId: discordId, status: 'pending' },
  });

  if (!pending) {
    return {
      narration: 'You have no pending checks.',
      controllerAction: 'ERROR_RECOVERY',
    };
  }

  const { pending: resolved, roll } = await resolvePendingCheck(pending.id, discordId);
  const statePacket = await buildStatePacket(campaignId);
  await ensureChronicle(campaignId, statePacket.campaign.name);
  const campaignChronicle = await readChronicle(campaignId);

  const narration = await ai.generateNarration({
    controllerDecision: {
      action: 'RESOLVE_CHECK',
      confidence: 1,
      reason: 'Check resolved',
      state_updates: [],
      safety_flags: [],
    },
    statePacket,
    playerMessage: statePacket.recentTurns.at(-1)?.message ?? '[check roll]',
    campaignChronicle,
    rollResult: {
      total: roll.total,
      success: roll.success ?? false,
      breakdown: roll.breakdown,
      successConsequence: resolved.successConsequence,
      failureConsequence: resolved.failureConsequence,
    },
  });

  await saveTurn(campaignId, discordId, `[Check roll: ${roll.breakdown}]`, narration, 'RESOLVE_CHECK');

  try {
    const memory = await ai.extractMemory({
      playerMessage: `[Resolved ${resolved.skill ?? resolved.ability} check]`,
      dmResponse: narration,
      controllerDecision: { action: 'RESOLVE_CHECK', confidence: 1, reason: '', state_updates: [], safety_flags: [] },
      statePacket,
      campaignChronicle,
      rollResult: { success: roll.success ?? false },
    });
    await applyMemoryExtraction(campaignId, memory);
    await applyChronicleFromMemory(campaignId, memory);
  } catch (err) {
    logger.warn('Memory extraction after roll failed', err);
  }

  return {
    narration,
    rollResolved: true,
    locationName: statePacket.location?.name,
    controllerAction: 'RESOLVE_CHECK',
  };
}

async function saveTurn(
  campaignId: string,
  discordId: string,
  message: string,
  response: string,
  controllerAction: string,
): Promise<void> {
  await prisma.conversationTurn.create({
    data: { campaignId, discordId, message, response, controllerAction },
  });
}

export { assetManager, ai, imageService };
