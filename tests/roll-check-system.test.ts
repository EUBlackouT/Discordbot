import '../src/config/load-env.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PendingCheck } from '@prisma/client';
import {
  detectInspectIntent,
  detectPlayerCheckIntent,
  buildRequestCheckDecision,
} from '../src/game/checks/check-intent.js';
import { parseControllerDecision } from '../src/validation/schemas.js';
import { rollAbilityCheck } from '../src/game/dice/engine.js';
import {
  formatCheckRequest,
  formatRollResult,
  createPendingCheck,
  resolvePendingCheck,
  getPendingCheckForPlayer,
} from '../src/game/checks/pending-check.js';
import {
  formatRollSummary,
  formatRollPlayerLine,
} from '../src/game/checks/check-display.js';
import {
  buildCampaignTurnReply,
} from '../src/bot/campaign-reply.js';

function mockPending(overrides: Partial<PendingCheck> = {}): PendingCheck {
  return {
    id: 'pending-1',
    campaignId: 'camp-1',
    targetDiscordId: 'user-1',
    targetCharacterId: 'char-1',
    checkType: 'skill',
    skill: 'Investigation',
    ability: 'INT',
    dc: 14,
    advantageState: 'normal',
    publicReason: 'You comb the scaffold stones for how the prisoner vanished.',
    successConsequence: 'You trace the magic residue toward the old quarter.',
    failureConsequence: 'The crowd jostles you before you can read the marks.',
    controllerReason: 'Inspecting with uncertain outcome.',
    status: 'pending',
    rollId: null,
    resolvedSuccess: null,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

describe('roll check system — player scenarios', () => {
  it('inspect vanished prisoner → Investigation REQUEST_CHECK (no "check" keyword)', () => {
    const message = 'i want to inspect the area the prisoner vanished from';
    const intent = detectInspectIntent(message);
    expect(intent).not.toBeNull();
    expect(intent!.skill).toBe('Investigation');

    const decision = buildRequestCheckDecision(intent!, 'discord-123', 'char-abc');
    const parsed = parseControllerDecision(decision);
    expect(parsed.action).toBe('REQUEST_CHECK');
    expect(parsed.check?.skill).toBe('Investigation');
    expect(parsed.check?.dc).toBe(14);
    expect(parsed.check?.successConsequence).toMatch(/concrete|actionable/i);
    expect(parsed.check?.publicReason).toMatch(/vanished|prisoner|area/i);
  });

  it('explicit investigastion check typo → valid REQUEST_CHECK', () => {
    const message = 'i want to do a investigastion check';
    const intent = detectPlayerCheckIntent(message);
    expect(intent?.skill).toBe('Investigation');

    const decision = buildRequestCheckDecision(intent!, 'discord-123', 'char-abc');
    expect(() => parseControllerDecision(decision)).not.toThrow();
  });

  it('recovers from OpenAI-style malformed check (production log case)', () => {
    const parsed = parseControllerDecision({
      action: 'REQUEST_CHECK',
      confidence: 0.9,
      reason: 'The player wants to perform an investigation check',
      check: { type: 'investigation' },
      state_updates: [],
      safety_flags: [],
    });
    expect(parsed.check?.type).toBe('skill');
    expect(parsed.check?.skill).toBe('Investigation');
    expect(parsed.check?.ability).toBe('INT');
    expect(parsed.check?.publicReason).toBeTruthy();
    expect(parsed.check?.successConsequence).toBeTruthy();
    expect(parsed.check?.failureConsequence).toBeTruthy();
  });
});

describe('roll check system — dice resolution', () => {
  it('succeeds when total meets DC with proficiency', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 3,
      proficiencyBonus: 2,
      isProficient: true,
      dc: 14,
      rng: () => 0.6, // d20 → 13, +5 = 18
    });
    expect(roll.total).toBeGreaterThanOrEqual(14);
    expect(roll.success).toBe(true);
    expect(roll.expression).toContain('1d20');
  });

  it('fails when total is below DC', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 0,
      proficiencyBonus: 2,
      isProficient: false,
      dc: 18,
      rng: () => 0.2, // d20 → 5
    });
    expect(roll.success).toBe(false);
  });

  it('applies advantage on skill checks', () => {
    let i = 0;
    const roll = rollAbilityCheck({
      abilityModifier: 0,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 10,
      advantageState: 'advantage',
      rng: () => [0.05, 0.95][i++],
    });
    expect(roll.advantageState).toBe('advantage');
    expect(roll.keptDice[0]).toBeGreaterThanOrEqual(15);
  });

  it('flags natural 20 and natural 1', () => {
    const nat20 = rollAbilityCheck({
      abilityModifier: 0,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 25,
      rng: () => 0.99,
    });
    expect(nat20.natural20).toBe(true);

    const nat1 = rollAbilityCheck({
      abilityModifier: 10,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 5,
      rng: () => 0,
    });
    expect(nat1.natural1).toBe(true);
  });
});

describe('roll check system — Discord presentation', () => {
  it('formatCheckRequest shows skill, DC, and roll hint', () => {
    const text = formatCheckRequest(mockPending());
    expect(text).toContain('Investigation');
    expect(text).toContain('DC 14');
    expect(text).toMatch(/roll|check/i);
  });

  it('formatRollResult shows breakdown and outcome', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 2,
      proficiencyBonus: 2,
      isProficient: true,
      dc: 14,
      rng: () => 0.75,
    });
    const text = formatRollResult(roll, mockPending());
    expect(text).toMatch(/Success|Failure/);
    expect(text).toContain('DC **14**');
    expect(text).toContain('INT');
    expect(text).toContain(String(roll.total));
  });

  it('roll resolution uses short player line separate from full summary', () => {
    const roll = rollAbilityCheck({
      abilityModifier: 2,
      proficiencyBonus: 0,
      isProficient: false,
      dc: 14,
      rng: () => 0.5,
    });
    const summary = formatRollSummary(mockPending(), roll);
    const playerLine = formatRollPlayerLine(mockPending(), roll);

    const payload = buildCampaignTurnReply(
      {
        narration: 'The scorch marks blur under the rain.',
        rollResolved: true,
        rollSummary: summary,
        rollPlayerLine: playerLine,
        controllerAction: 'RESOLVE_CHECK',
      },
      {
        player: {
          displayName: 'BlackouT',
          characterName: 'Gyro ironbark',
          characterId: 'char-1',
          action: playerLine,
        },
      },
    );

    expect(payload.embeds[0].data.description).toContain('Investigation — fails');
    expect(payload.embeds[0].data.description).not.toContain('d20');
    const rollField = payload.embeds[1].data.fields?.find((f) => f.name === '🎲 Roll');
    expect(rollField?.value).toContain('d20');
    expect(rollField?.value).toContain('INT (+2)');
  });

  it('pending check turn includes Roll button and DC field', () => {
    const payload = buildCampaignTurnReply({
      narration: 'Kneel by the scaffold. The marks wait for a steady hand.',
      pendingCheck: true,
      checkPrompt: { skill: 'Investigation', ability: 'INT', dc: 14 },
      controllerAction: 'REQUEST_CHECK',
      locationName: 'Mistharbor Execution Yard',
    });
    expect(payload.components).toHaveLength(1);
    const button = payload.components[0]?.components[0];
    expect(button?.data.custom_id).toBe('roll_check');
    expect(payload.embeds[0].data.footer?.text).toContain('Roll');
    const checkField = payload.embeds[0].data.fields?.find((f) => f.name === '🎲 Check');
    expect(checkField?.value).toContain('DC **14**');
  });

  it('resolved roll shows mechanical breakdown field', () => {
    const payload = buildCampaignTurnReply({
      narration: 'You trace the sigil residue toward the alleys.',
      rollResolved: true,
      rollSummary: '**Investigation** vs DC **14**\nd20 (**17**) +5 = **22**\n✅ **Success!**',
      controllerAction: 'RESOLVE_CHECK',
    });
    expect(payload.components).toHaveLength(0);
    const rollField = payload.embeds[0].data.fields?.find((f) => f.name === '🎲 Roll');
    expect(rollField?.value).toContain('DC **14**');
  });
});

const hasPostgres = Boolean(process.env.DATABASE_URL?.startsWith('postgres'));

describe.skipIf(!hasPostgres)('roll check system — database integration', () => {
  const GUILD_ID = `test-roll-check-${Date.now()}`;
  const DISCORD_ID = 'roll-check-tester';
  let campaignId: string;
  let characterId: string;

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'mock';
    const { prisma } = await import('../src/db/client.js');
    const { ensureGuild } = await import('../src/tenant/guild-service.js');
    const { getOrCreatePlayer } = await import('../src/game/character/service.js');
    const { startCampaign } = await import('../src/campaign/state.js');
    const { joinCampaign } = await import('../src/tenant/campaign-member.js');
    const { toJson } = await import('../src/utils/helpers.js');

    await ensureGuild(GUILD_ID, 'Roll Check Test Guild');

    const player = await getOrCreatePlayer(DISCORD_ID);
    const character = await prisma.character.create({
      data: {
        guildId: GUILD_ID,
        playerId: player.id,
        ownerDiscordId: DISCORD_ID,
        name: 'Test Rogue',
        race: 'Human',
        className: 'Rogue',
        background: 'Criminal',
        abilityScores: toJson({ STR: 10, DEX: 16, CON: 14, INT: 14, WIS: 13, CHA: 8 }),
        abilityMods: toJson({ STR: 0, DEX: 3, CON: 2, INT: 2, WIS: 1, CHA: -1 }),
        savingThrows: toJson(['DEX', 'INT']),
        skillProficiencies: toJson(['Stealth', 'Investigation', 'Perception', 'Deception']),
        hitPoints: 10,
        maxHitPoints: 10,
        hitDice: '1d8',
        armorClass: 14,
        speed: 30,
        isComplete: true,
        isActive: true,
      },
    });
    characterId = character.id;

    const { campaign } = await startCampaign(GUILD_ID, `channel-${GUILD_ID}`);
    campaignId = campaign.id;
    await joinCampaign(campaignId, GUILD_ID, DISCORD_ID, character.name);
  });

  afterAll(async () => {
    const { prisma, disconnectDb } = await import('../src/db/client.js');
    await prisma.pendingCheck.deleteMany({ where: { campaignId } });
    await prisma.rollHistory.deleteMany({ where: { campaignId } });
    await prisma.conversationTurn.deleteMany({ where: { campaignId } });
    await prisma.campaignMember.deleteMany({ where: { campaignId } });
    await prisma.campaignChannel.deleteMany({ where: { campaignId } });
    await prisma.memoryEntry.deleteMany({ where: { campaignId } });
    await prisma.campaign.deleteMany({ where: { id: campaignId } });
    await prisma.character.deleteMany({ where: { guildId: GUILD_ID } });
    await prisma.player.deleteMany({ where: { discordId: DISCORD_ID } });
    await prisma.guild.deleteMany({ where: { id: GUILD_ID } });
    await disconnectDb();
  });

  it('processCampaignMessage inspect → REQUEST_CHECK with Roll pending', async () => {
    const { processCampaignMessage } = await import('../src/core/campaign-loop.js');

    const result = await processCampaignMessage(
      campaignId,
      DISCORD_ID,
      'i want to inspect the area the prisoner vanished from',
      characterId,
    );

    expect(result.controllerAction).toBe('REQUEST_CHECK');
    expect(result.pendingCheck).toBe(true);
    expect(result.narration.length).toBeGreaterThan(0);

    const pending = await getPendingCheckForPlayer(campaignId, DISCORD_ID);
    expect(pending?.skill).toBe('Investigation');
  });

  it('processCheckRoll resolves and narrates outcome', async () => {
    const { processCheckRoll } = await import('../src/core/campaign-loop.js');

    const result = await processCheckRoll(campaignId, DISCORD_ID);
    expect(result.rollResolved).toBe(true);
    expect(result.controllerAction).toBe('RESOLVE_CHECK');
    expect(result.narration.length).toBeGreaterThan(0);
  });

  it('createPendingCheck rejects duplicate while one is pending', async () => {
    const intent = detectInspectIntent('inspect the scaffold')!;
    const check = buildRequestCheckDecision(intent, DISCORD_ID, characterId).check!;

    const pending = await createPendingCheck(campaignId, DISCORD_ID, characterId, check);
    expect(pending.status).toBe('pending');

    await expect(
      createPendingCheck(campaignId, DISCORD_ID, characterId, check),
    ).rejects.toThrow(/already has a pending check/i);
  });

  it('resolvePendingCheck rejects wrong player then succeeds for target', async () => {
    const pending = await getPendingCheckForPlayer(campaignId, DISCORD_ID);
    expect(pending).not.toBeNull();

    await expect(resolvePendingCheck(pending!.id, 'wrong-player')).rejects.toThrow(
      /only the targeted player/i,
    );

    const { roll } = await resolvePendingCheck(pending!.id, DISCORD_ID);
    expect(typeof roll.success).toBe('boolean');
    expect(roll.total).toBeGreaterThan(0);

    const cleared = await getPendingCheckForPlayer(campaignId, DISCORD_ID);
    expect(cleared).toBeNull();
  });
});
