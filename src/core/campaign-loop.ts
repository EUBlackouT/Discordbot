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
import { resolveNpcSpeaker, shouldUseNpcDialogue } from '../campaign/npc-speech.js';
import { readChronicle, ensureChronicle } from '../dm/chronicle/campaign-chronicle.js';
import { formatPlotThreadsForController, plotThreadsNeedingResolution } from '../dm/plot/plot-director.js';
import {
  detectLoopPressure,
  inferTravelFromContext,
  isProgressionGoal,
} from '../dm/plot/loop-pressure.js';
import { syncBumpPlotMomentum } from '../dm/chronicle/plot-momentum-sync.js';
import { createAIProvider } from '../services/ai/index.js';
import {
  createPendingCheck,
  resolvePendingCheck,
  hasUnresolvedCheck,
} from '../game/checks/pending-check.js';
import {
  formatRollSummary,
  formatRollPlayerLine,
  computeOutcomeTier,
  computeMargin,
  narrationHintForTier,
} from '../game/checks/check-display.js';
import {
  buildRequestCheckDecision,
  detectPlayerCheckIntent,
} from '../game/checks/check-intent.js';
import {
  detectCombatStartIntent,
  buildStartCombatDecision,
} from '../game/combat/combat-intent.js';
import {
  handleStartCombatFromDecision,
  processCombatPlayerAction,
  handleCombatReinforcements,
  narrateCombatStart,
} from './combat-loop.js';
import { getActiveCombat, endCombat, tryEndCombatIfOver } from '../game/combat/combat-service.js';
import { isCampPending } from '../game/combat/rest.js';
import { detectRestIntent, detectCampContinuation } from '../game/combat/rest-intent.js';
import { handleRestRequest } from './rest-loop.js';
import { buildCombatPanel } from '../game/combat/combat-display.js';
import { buildCombatBrief } from '../game/combat/combat-ai-context.js';
import {
  awaitPendingMemoryExtraction,
  scheduleTurnMemoryExtraction,
} from '../dm/memory/schedule-extraction.js';
import { AssetManager, createImageService } from '../assets/asset-manager.js';
import { config } from '../config/index.js';
import { getActiveCharacterForPlayer, leaveCampaign } from '../tenant/campaign-member.js';
import { logger } from '../utils/logger.js';
import type { ControllerDecision } from '../validation/schemas.js';
import { applyControllerStateUpdates } from '../dm/state/apply-controller-updates.js';
import { tryGenerateSceneImage } from '../assets/scene-image.js';
import {
  buildActingPlayerContext,
  scopeStateForActingPlayer,
  isMultiplayerCampaign,
  resolveLocationForActingPlayer,
  isCharacterInActiveCombat,
  buildDistantCombatPolicy,
} from '../campaign/party-positions.js';
import { MULTIPLAYER_DM_POLICY } from '../services/ai/types.js';
import type { CampaignStatePacket } from '../campaign/state.js';
import { buildSpeechDeliveryContext } from '../voice/npc-speech-style.js';
import { ensureNpcVoice } from '../voice/npc-voice-service.js';
import { buildAmbienceContext, type AmbienceContext } from '../voice/ambience-context.js';

const ai = createAIProvider();
const imageService = createImageService();
const assetManager = new AssetManager(imageService);

function hasTravelStateUpdate(updates?: Record<string, unknown>[]): boolean {
  return (
    updates?.some((u) => {
      const type = typeof u.type === 'string' ? u.type : '';
      return (
        type === 'travel_to_location' ||
        type === 'move_to_location' ||
        type === 'set_character_location'
      );
    }) ?? false
  );
}

async function applyStuckProgressionFallback(
  campaignId: string,
  message: string,
  chronicle: string,
  decision: ControllerDecision,
  statePacket: CampaignStatePacket,
  loopPressure: ReturnType<typeof detectLoopPressure>,
): Promise<{ decision: ControllerDecision; statePacket: CampaignStatePacket }> {
  if (!loopPressure.requireTravel || !isProgressionGoal(loopPressure.goalKind)) {
    return { decision, statePacket };
  }
  if (hasTravelStateUpdate(decision.state_updates) || decision.action === 'START_SCENE') {
    return { decision, statePacket };
  }

  const travel = inferTravelFromContext(chronicle, message, statePacket.location);
  if (!travel) return { decision, statePacket };

  await applyControllerStateUpdates(campaignId, [travel], statePacket);
  const nextState = await buildStatePacket(campaignId);
  const destName = typeof travel.name === 'string' ? travel.name : 'somewhere safer';

  return {
    statePacket: nextState,
    decision: {
      ...decision,
      action: 'START_SCENE',
      asset_decision_hint: {
        ...decision.asset_decision_hint,
        location_image_relevant: true,
      },
      narration_instruction: [
        decision.narration_instruction,
        `The party completes their movement and arrives at ${destName}. Describe arrival and what is immediately visible — the prior location's immediate threat is behind them unless a new complication appears.`,
      ]
        .filter(Boolean)
        .join(' '),
    },
  };
}

export interface CampaignTurnResult {
  narration: string;
  panels?: CampaignPanel[];
  isPrivate?: boolean;
  pendingCheck?: boolean;
  rollResolved?: boolean;
  /** Shown in embed when a check is waiting — skill name + DC */
  checkPrompt?: { skill?: string | null; ability: string; dc: number };
  /** Mechanical roll breakdown shown after resolving a check */
  rollSummary?: string;
  /** Short one-liner for the player embed — never duplicates rollSummary */
  rollPlayerLine?: string;
  assetPath?: string;
  npcPortraitPath?: string;
  locationName?: string;
  controllerAction: string;
  briefReply?: boolean;
  npcSpeaker?: string;
  npcVoiceId?: string;
  npcVoiceLabel?: string;
  npcAttitude?: string;
  npcDescription?: string;
  speechRegister?: string;
  sceneMood?: string;
  combatActive?: boolean;
  combatStatus?: string;
  combatEnded?: boolean;
  campaignId?: string;
  ambience?: AmbienceContext;
}

function buildPlayerAiContext(
  statePacket: CampaignStatePacket,
  discordId: string,
  characterId?: string,
  characterName?: string,
) {
  const actingPlayer = buildActingPlayerContext(statePacket, discordId, characterId, characterName);
  const scopedState = scopeStateForActingPlayer(statePacket, actingPlayer);
  const multiplayerPolicy = isMultiplayerCampaign(statePacket) ? MULTIPLAYER_DM_POLICY : '';
  const povLocation = resolveLocationForActingPlayer(statePacket, actingPlayer);
  return { actingPlayer, scopedState, multiplayerPolicy, povLocation };
}

function voiceExtras(
  campaignId: string,
  state: Awaited<ReturnType<typeof buildStatePacket>>,
): Pick<CampaignTurnResult, 'campaignId' | 'ambience'> {
  return {
    campaignId,
    ambience: buildAmbienceContext(state, state.location?.slug, Boolean(state.combat)),
  };
}

export async function processCampaignMessage(
  campaignId: string,
  discordId: string,
  message: string,
  characterId?: string,
): Promise<CampaignTurnResult> {
  await awaitPendingMemoryExtraction(campaignId);
  const statePacket = await buildStatePacket(campaignId);
  await ensureChronicle(campaignId, statePacket.campaign.name);
  const campaignChronicle = await readChronicle(campaignId);
  const messageMode = classifyMessageMode(message);
  const narrationLimits = narrationLimitsForMode(messageMode);

  const memberCharacter = await getActiveCharacterForPlayer(campaignId, discordId);
  const activeCharacterId = characterId ?? memberCharacter?.id;
  const playerAi = buildPlayerAiContext(
    statePacket,
    discordId,
    activeCharacterId,
    memberCharacter?.name,
  );

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
    logger.debug('Campaign has unresolved check from another player');
  }

  // Active combat — only participants at the fight location use the combat loop
  if (
    statePacket.combat &&
    activeCharacterId &&
    isCharacterInActiveCombat(statePacket.combat, activeCharacterId)
  ) {
    const combatResult = await processCombatPlayerAction(
      campaignId,
      discordId,
      message,
      activeCharacterId!,
    );
    if (combatResult) return combatResult;
  }

  const campPending = isCampPending(statePacket.campaign.openThreads);
  const wantsRest = detectRestIntent(message) || (campPending && detectCampContinuation(message));
  if (wantsRest || campPending) {
    return handleRestRequest(
      campaignId,
      discordId,
      message,
      activeCharacterId,
      campPending,
      assetManager,
    );
  }

  let decision: ControllerDecision;
  const checkIntent = detectPlayerCheckIntent(message);
  const combatStartIntent =
    !statePacket.combat && !checkIntent ? detectCombatStartIntent(message, playerAi.scopedState.activeNpcs) : null;
  const distantCombatPolicy =
    statePacket.combat && activeCharacterId
      ? buildDistantCombatPolicy(statePacket.combat, activeCharacterId, memberCharacter?.name)
      : '';
  const inActiveCombat = Boolean(
    activeCharacterId && statePacket.combat && isCharacterInActiveCombat(statePacket.combat, activeCharacterId),
  );

  const recentMessages = statePacket.recentTurns.map((t) => t.message);
  const loopPressure = detectLoopPressure(recentMessages, message);
  let controllerState = statePacket;
  if (loopPressure.forceUrgent) {
    await syncBumpPlotMomentum(campaignId, loopPressure.repeatCount >= 3 ? 25 : 15, {
      activeQuest: statePacket.activeQuest,
    });
    controllerState = await buildStatePacket(campaignId);
  }
  const controllerPlayerAi = buildPlayerAiContext(
    controllerState,
    discordId,
    activeCharacterId,
    memberCharacter?.name,
  );

  const plotThreads = controllerState.campaign.plotThreads;
  const plotContext = {
    campaignThroughline: controllerState.campaign.campaignThroughline,
    primaryQuest: controllerState.activeQuest,
  };
  const plotPolicy =
    plotThreads.length > 0 || plotContext.campaignThroughline || plotContext.primaryQuest
      ? `\n\n--- CAMPAIGN PROGRESSION ---\n${formatPlotThreadsForController(plotThreads, plotContext)}`
      : '';
  const plotUrgent =
    plotThreadsNeedingResolution(plotThreads).length > 0 || loopPressure.forceUrgent
      ? `\n\nURGENT: A progression beat needs closure or hard pivot this turn — close it (escape completes, trail found, NPC reached) and hand off to the next chapter of the MAIN campaign. Do not loop identical peril.${loopPressure.controllerPolicy ? `\n\n${loopPressure.controllerPolicy}` : ''}`
      : loopPressure.controllerPolicy
        ? `\n\n${loopPressure.controllerPolicy}`
        : '';
  try {
    decision = checkIntent
      ? buildRequestCheckDecision(
          checkIntent,
          discordId,
          activeCharacterId,
          'Player requested a skill check.',
        )
      : combatStartIntent
        ? buildStartCombatDecision(combatStartIntent, discordId, activeCharacterId)
        : await ai.generateControllerDecision({
          playerMessage: message,
          playerDiscordId: discordId,
          characterId: activeCharacterId,
          statePacket: controllerPlayerAi.scopedState,
          campaignChronicle: controllerPlayerAi.scopedState.combat
            ? `${campaignChronicle}\n\n---\n${buildCombatBrief(controllerPlayerAi.scopedState) ?? controllerPlayerAi.scopedState.combat.summary}`
            : campaignChronicle,
          messageMode,
          dmPolicy: `${inActiveCombat
            ? 'COMBAT IS ACTIVE. Prefer CONTINUE_COMBAT for player actions. Use state.combat.participants HP/AC as canonical. To summon reinforcements use combat.add_enemies. Never invent different HP values.'
            : ''}${distantCombatPolicy ? `\n\n${distantCombatPolicy}` : ''}${controllerPlayerAi.multiplayerPolicy ? `\n\n${controllerPlayerAi.multiplayerPolicy}` : ''}${plotPolicy}${plotUrgent}`,
          actingPlayer: controllerPlayerAi.actingPlayer,
        });
  } catch (err) {
    logger.error('Controller AI failed', err);
    return {
      narration: 'The DM falters—a moment of silence hangs over Mistharbor. Try rephrasing your action.',
      controllerAction: 'ERROR_RECOVERY',
    };
  }

  let workingState = controllerState;
  if (decision.state_updates?.length) {
    await applyControllerStateUpdates(campaignId, decision.state_updates, controllerState);
    workingState = await buildStatePacket(campaignId);
  }

  const fallback = await applyStuckProgressionFallback(
    campaignId,
    message,
    campaignChronicle,
    decision,
    workingState,
    loopPressure,
  );
  decision = fallback.decision;
  const narrationState = fallback.statePacket;

  const narrationPlayerAi = buildPlayerAiContext(
    narrationState,
    discordId,
    activeCharacterId,
    memberCharacter?.name,
  );
  const refreshedChronicle = await readChronicle(campaignId);
  const narratorContext = {
    playerMessage: message,
    characterName: memberCharacter?.name,
    messageMode,
    campaignChronicle: narrationPlayerAi.scopedState.combat
      ? `${refreshedChronicle}\n\n---\n${buildCombatBrief(narrationPlayerAi.scopedState) ?? narrationPlayerAi.scopedState.combat.summary}`
      : refreshedChronicle,
    brief: narrationLimits.brief,
    maxParagraphs: narrationLimits.maxParagraphs,
    maxTokens: narrationLimits.maxTokens,
    actingPlayer: narrationPlayerAi.actingPlayer,
    povLocation: narrationPlayerAi.povLocation,
    statePacket: narrationPlayerAi.scopedState,
    antiLoopPolicy: loopPressure.narratorPolicy || undefined,
  };

  // START_COMBAT — roll initiative; enemies act only if they win initiative
  if (decision.action === 'START_COMBAT') {
    const { combatStarted, openingEnemyAttacks } = await handleStartCombatFromDecision(
      campaignId,
      discordId,
      decision,
      activeCharacterId,
      narrationPlayerAi.scopedState,
    );
    const postCombatState = await buildStatePacket(campaignId);
    const narration = await narrateCombatStart(
      campaignId,
      discordId,
      message,
      decision,
      openingEnemyAttacks,
    );
    const assetPath = await tryGenerateSceneImage(assetManager, campaignId, postCombatState, {
      moment: 'combat_start',
      force: true,
      hint: { location_image_relevant: true },
      narrationSnippet: narration,
    });
    await saveTurn(campaignId, discordId, message, narration, decision.action);
    const combat = await getActiveCombat(campaignId);
    return {
      narration,
      assetPath,
      combatActive: combatStarted && Boolean(combat),
      combatStatus: combat ? buildCombatPanel(combat).description : undefined,
      locationName: postCombatState.location?.name,
      controllerAction: decision.action,
      ...voiceExtras(campaignId, postCombatState),
    };
  }

  // CONTINUE_COMBAT — reinforcements, end fight, or narrate tactical scene
  if (decision.action === 'CONTINUE_COMBAT' || (narrationState.combat && decision.action === 'NARRATE' && messageMode === 'action')) {
    if (decision.combat?.add_enemies?.length) {
      const names = await handleCombatReinforcements(campaignId, decision);
      if (names.length) {
        decision.narration_instruction = `${decision.narration_instruction ?? ''} Reinforcements arrive: ${names.join(', ')}.`.trim();
      }
    }
    if (decision.combat?.end_combat) {
      await endCombat(campaignId);
    } else {
      await tryEndCombatIfOver(campaignId);
    }
    const postCombat = await buildStatePacket(campaignId);
    const postPlayerAi = buildPlayerAiContext(postCombat, discordId, activeCharacterId, memberCharacter?.name);
    const narration = await ai.generateNarration({
      controllerDecision: { ...decision, action: 'CONTINUE_COMBAT' },
      ...narratorContext,
      statePacket: postPlayerAi.scopedState,
      actingPlayer: postPlayerAi.actingPlayer,
      povLocation: postPlayerAi.povLocation,
      campaignChronicle: buildCombatBrief(postCombat) ?? refreshedChronicle,
    });
    await saveTurn(campaignId, discordId, message, narration, 'CONTINUE_COMBAT');
    const combat = await getActiveCombat(campaignId);
    return {
      narration,
      combatActive: Boolean(combat),
      combatStatus: combat ? buildCombatPanel(combat).description : undefined,
      combatEnded: !combat,
      locationName: postCombat.location?.name,
      controllerAction: 'CONTINUE_COMBAT',
      ...voiceExtras(campaignId, postCombat),
    };
  }

  if (decision.combat?.escalate && !statePacket.combat) {
    const danger = decision.combat.danger_level ?? Math.min(5, statePacket.campaign.dangerLevel + 1);
    await prisma.campaign.update({ where: { id: campaignId }, data: { dangerLevel: danger } });
  }

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
      ...narratorContext,
    });

    await saveTurn(campaignId, discordId, message, narration, decision.action);

    return {
      narration,
      pendingCheck: true,
      checkPrompt: {
        skill: decision.check.skill,
        ability: decision.check.ability,
        dc: decision.check.dc,
      },
      locationName: narrationState.location?.name,
      controllerAction: decision.action,
      ...voiceExtras(campaignId, narrationState),
    };
  }

  // Recap / scene info — dynamic panels, not slash commands
  if (decision.action === 'RECAP') {
    const panels = [await buildRecapPanel(campaignId)];
    const narration =
      (await ai.generateNarration({
        controllerDecision: decision,
        ...narratorContext,
      }).catch(() => '')) ||
      metaIntentNarration('recap');
    await saveTurn(campaignId, discordId, message, narration, decision.action);
    return {
      narration,
      panels,
      locationName: narrationState.location?.name,
      controllerAction: decision.action,
      ...voiceExtras(campaignId, narrationState),
    };
  }

  // NPC speaks directly — not Chronicler summarizing what they think
  const npc = resolveNpcSpeaker(
    decision,
    message,
    narrationState.activeNpcs,
    messageMode,
    narrationState.recentTurns,
  );
  if (
    npc &&
    shouldUseNpcDialogue(
      decision,
      message,
      narrationState.activeNpcs,
      messageMode,
      narrationState.recentTurns,
    )
  ) {
    const voicedNpc = await ensureNpcVoice(campaignId, npc);

    const narration = await ai.generateNpcDialogue({
      npc: voicedNpc,
      playerMessage: message,
      characterName: memberCharacter?.name,
      controllerDecision: decision,
      statePacket: narrationPlayerAi.scopedState,
      campaignChronicle: refreshedChronicle,
      maxTokens: narrationLimits.maxTokens,
    });

    const panels: CampaignPanel[] = [];
    let npcPortraitPath: string | undefined;
    if (voicedNpc.id) {
      npcPortraitPath = await assetManager.ensureNpcPortrait(campaignId, voicedNpc.id, discordId);
    }

    await saveTurn(campaignId, discordId, message, narration, 'NPC_DIALOGUE');

    scheduleTurnMemoryExtraction(
      campaignId,
      {
        playerMessage: message,
        dmResponse: narration,
        controllerDecision: { ...decision, action: 'NPC_DIALOGUE', npc_name: npc.name },
        statePacket: narrationPlayerAi.scopedState,
        campaignChronicle: refreshedChronicle,
      },
      {
        playerMessage: message,
        characterName: memberCharacter?.name,
      },
    );

    const speechCtx = buildSpeechDeliveryContext(voicedNpc, {
      sceneMood: narrationState.scene?.mood ?? narrationState.location?.mood,
      controllerAction: 'NPC_DIALOGUE',
      combatActive: Boolean(narrationState.combat),
    });

    return {
      narration,
      npcPortraitPath,
      locationName: narrationState.location?.name,
      controllerAction: 'NPC_DIALOGUE',
      npcSpeaker: voicedNpc.name,
      npcVoiceId: voicedNpc.voiceId,
      npcVoiceLabel: voicedNpc.voiceLabel,
      npcAttitude: voicedNpc.attitude,
      npcDescription: voicedNpc.description,
      speechRegister: speechCtx.speechRegister,
      sceneMood: speechCtx.sceneMood,
      combatActive: speechCtx.combatActive,
      briefReply: narrationLimits.brief,
      ...voiceExtras(campaignId, narrationState),
    };
  }

  // Standard narration path
  let narration = await ai.generateNarration({
    controllerDecision: decision,
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
      decision.action === 'END_SCENE' ||
      loopPressure.requireTravel;
    const moment =
      decision.action === 'START_SCENE' || decision.action === 'END_SCENE'
        ? 'scene_change'
        : wantsLocation
          ? 'dramatic'
          : 'turn';
    assetPath = await tryGenerateSceneImage(assetManager, campaignId, narrationState, {
      hint: { ...hint, location_image_relevant: wantsLocation || hint.location_image_relevant },
      moment,
      force: decision.action === 'START_SCENE' || decision.action === 'END_SCENE' || loopPressure.requireTravel,
      narrationSnippet: narration,
    });
    if (narrationState.location && (wantsLocation || assetPath)) {
      panels.push(buildLocationPanel(narrationState));
    }
  } catch (err) {
    logger.warn('Asset decision failed', err);
  }
  }

  await saveTurn(campaignId, discordId, message, narration, decision.action);

  scheduleTurnMemoryExtraction(
    campaignId,
    {
      playerMessage: message,
      dmResponse: narration,
      controllerDecision: decision,
      statePacket: narrationPlayerAi.scopedState,
      campaignChronicle: refreshedChronicle,
    },
    {
      playerMessage: message,
      characterName: memberCharacter?.name,
    },
  );

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
    sceneMood: narrationState.scene?.mood ?? narrationState.location?.mood,
    combatActive: Boolean(narrationState.combat),
    briefReply: narrationLimits.brief,
    ...voiceExtras(campaignId, narrationState),
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
  await awaitPendingMemoryExtraction(campaignId);
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
  const outcomeTier = computeOutcomeTier(roll);
  const statePacket = await buildStatePacket(campaignId);
  const memberCharacter = await getActiveCharacterForPlayer(campaignId, discordId);
  const playerAi = buildPlayerAiContext(
    statePacket,
    discordId,
    memberCharacter?.id,
    memberCharacter?.name,
  );
  await ensureChronicle(campaignId, statePacket.campaign.name);
  const campaignChronicle = await readChronicle(campaignId);

  const narration = await ai.generateNarration({
    controllerDecision: {
      action: 'RESOLVE_CHECK',
      confidence: 1,
      reason: narrationHintForTier(outcomeTier),
      narration_instruction: narrationHintForTier(outcomeTier),
      state_updates: [],
      safety_flags: [],
    },
    statePacket: playerAi.scopedState,
    playerMessage: statePacket.recentTurns.at(-1)?.message ?? '[check roll]',
    characterName: memberCharacter?.name,
    actingPlayer: playerAi.actingPlayer,
    povLocation: playerAi.povLocation,
    campaignChronicle,
    messageMode: 'action',
    maxParagraphs: roll.success ? 2 : 1,
    maxTokens: roll.success ? 200 : 120,
    rollResult: {
      total: roll.total,
      success: roll.success ?? false,
      breakdown: roll.breakdown,
      margin: computeMargin(roll),
      outcomeTier,
      checkReason: resolved.publicReason,
      skill: resolved.skill,
      successConsequence: resolved.successConsequence,
      failureConsequence: resolved.failureConsequence,
    },
  });

  await saveTurn(campaignId, discordId, `[Check roll: ${roll.breakdown}]`, narration, 'RESOLVE_CHECK');

  scheduleTurnMemoryExtraction(campaignId, {
    playerMessage: `[Resolved ${resolved.skill ?? resolved.ability} check]`,
    dmResponse: narration,
    controllerDecision: { action: 'RESOLVE_CHECK', confidence: 1, reason: '', state_updates: [], safety_flags: [] },
    statePacket,
    campaignChronicle,
    rollResult: { success: roll.success ?? false },
  });

  return {
    narration,
    rollResolved: true,
    rollSummary: formatRollSummary(resolved, roll),
    rollPlayerLine: formatRollPlayerLine(resolved, roll),
    locationName: statePacket.location?.name,
    controllerAction: 'RESOLVE_CHECK',
    ...voiceExtras(campaignId, statePacket),
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
