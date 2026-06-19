import { prisma } from '../db/client.js';
import { parseJson, toJson } from '../utils/helpers.js';
import { ensureChronicle, deleteChronicle } from '../dm/chronicle/campaign-chronicle.js';
import { ensureGuild, assertGuildCanStartCampaign } from '../tenant/guild-service.js';
import {
  DEFAULT_CAMPAIGN_NAME,
  INTRO_CHOICES,
  INTRO_FACTION,
  INTRO_LOCATION,
  INTRO_MEMORY,
  INTRO_NPCS,
  INTRO_QUEST,
  INTRO_SCENE,
  buildOpeningNarration,
  buildOpeningSceneContent,
} from './intro.js';

export interface CampaignStatePacket {
  campaign: {
    id: string;
    name: string;
    sessionSummary: string;
    dangerLevel: number;
    openThreads: string[];
    currentSceneId: string | null;
    currentLocationId: string | null;
  };
  scene: { id: string; name: string; description: string; mood: string } | null;
  location: {
    id: string;
    name: string;
    description: string;
    visualDescription: string;
    mood: string;
    activeAssetId: string | null;
    currentChanges: string;
  } | null;
  activeCharacters: Array<{
    id: string;
    name: string;
    race: string;
    className: string;
    hitPoints: number;
    maxHitPoints: number;
    conditions: string[];
    appearance: string;
  }>;
  activeNpcs: Array<{ id: string; name: string; description: string; attitude: string; goals: string }>;
  activeQuest: { id: string; title: string; description: string; objectives: string[] } | null;
  publicMemories: string[];
  hiddenMemories: string[];
  recentTurns: Array<{ message: string; response: string | null; discordId: string }>;
  pendingChecks: Array<{ id: string; skill: string | null; ability: string; dc: number; targetDiscordId: string }>;
  combat: { id: string; round: number; currentTurn: number; status: string } | null;
  visualStyle: Record<string, string> | null;
}

export async function getCampaignByChannel(channelId: string) {
  const channel = await prisma.campaignChannel.findUnique({
    where: { channelId },
    include: { campaign: true },
  });
  return channel?.campaign ?? null;
}

export async function startCampaign(guildId: string, channelId: string, name?: string) {
  await ensureGuild(guildId);
  await assertGuildCanStartCampaign(guildId);

  const existing = await prisma.campaignChannel.findUnique({ where: { channelId } });
  if (existing) {
    throw new Error('This channel already has an active campaign.');
  }

  const campaign = await prisma.campaign.create({
    data: {
      guildId,
      name: name ?? DEFAULT_CAMPAIGN_NAME,
      sessionSummary: 'The campaign begins in Mistharbor during a public execution gone wrong.',
      openThreads: toJson(['Why did the prisoner vanish?', 'What does the pale sigil mean?']),
      imageAutoGenerate: false,
    },
  });

  await prisma.campaignChannel.create({
    data: { campaignId: campaign.id, channelId, isActive: true },
  });

  await prisma.visualStyleProfile.create({
    data: { campaignId: campaign.id },
  });

  const location = await prisma.location.create({
    data: {
      campaignId: campaign.id,
      name: INTRO_LOCATION.name,
      slug: INTRO_LOCATION.slug,
      description: INTRO_LOCATION.description,
      visualDescription: INTRO_LOCATION.visualDescription,
      mood: INTRO_LOCATION.mood,
      lighting: INTRO_LOCATION.lighting,
      architecture: INTRO_LOCATION.architecture,
      landmarks: toJson(INTRO_LOCATION.landmarks),
      persistentObjects: toJson(INTRO_LOCATION.persistentObjects),
      isMajor: INTRO_LOCATION.isMajor,
      visitCount: 1,
    },
  });

  const scene = await prisma.scene.create({
    data: {
      campaignId: campaign.id,
      name: INTRO_SCENE.name,
      description: INTRO_SCENE.description,
      mood: INTRO_SCENE.mood,
      isActive: true,
    },
  });

  for (const npc of INTRO_NPCS) {
    await prisma.nPC.create({
      data: {
        campaignId: campaign.id,
        name: npc.name,
        description: npc.description,
        visualDescription: npc.visualDescription,
        goals: npc.goals,
        secrets: npc.secrets,
        attitude: npc.attitude,
        locationId: location.id,
        isActive: true,
      },
    });
  }

  await prisma.quest.create({
    data: {
      campaignId: campaign.id,
      title: INTRO_QUEST.title,
      description: INTRO_QUEST.description,
      objectives: toJson(INTRO_QUEST.objectives),
      isPrimary: INTRO_QUEST.isPrimary,
      status: 'active',
    },
  });

  await prisma.faction.create({
    data: {
      campaignId: campaign.id,
      name: INTRO_FACTION.name,
      description: INTRO_FACTION.description,
      reputation: INTRO_FACTION.reputation,
      goals: INTRO_FACTION.goals,
    },
  });

  for (const fact of INTRO_MEMORY.public) {
    await prisma.memoryEntry.create({
      data: { campaignId: campaign.id, category: 'public', content: fact, importance: 4 },
    });
  }
  for (const fact of INTRO_MEMORY.hidden) {
    await prisma.memoryEntry.create({
      data: { campaignId: campaign.id, category: 'hidden', content: fact, importance: 5 },
    });
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { currentSceneId: scene.id, currentLocationId: location.id },
  });

  await ensureChronicle(
    campaign.id,
    campaign.name,
    'The party is at the Mistharbor execution yard. A prisoner vanished from the scaffold; riot and panic spread. Old Henrick fled toward the old quarter.',
  );

  return {
    campaign,
    location,
    scene,
    openingNarration: buildOpeningNarration(),
    openingScene: buildOpeningSceneContent(),
    choices: INTRO_CHOICES,
  };
}

export async function buildStatePacket(campaignId: string): Promise<CampaignStatePacket> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  const [scene, location, members, npcs, quests, memories, turns, pendingChecks, combat, style] =
    await Promise.all([
      campaign.currentSceneId
        ? prisma.scene.findUnique({ where: { id: campaign.currentSceneId } })
        : null,
      campaign.currentLocationId
        ? prisma.location.findUnique({ where: { id: campaign.currentLocationId } })
        : null,
      prisma.campaignMember.findMany({
        where: { campaignId, isActive: true },
        include: { character: true },
      }),
      prisma.nPC.findMany({ where: { campaignId, isActive: true } }),
      prisma.quest.findMany({ where: { campaignId, status: 'active' } }),
      prisma.memoryEntry.findMany({ where: { campaignId, isActive: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.conversationTurn.findMany({ where: { campaignId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.pendingCheck.findMany({ where: { campaignId, status: 'pending' } }),
      prisma.combatState.findFirst({ where: { campaignId, status: 'active' } }),
      prisma.visualStyleProfile.findUnique({ where: { campaignId } }),
    ]);

  const primaryQuest = quests.find((q) => q.isPrimary) ?? quests[0] ?? null;

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      sessionSummary: campaign.sessionSummary,
      dangerLevel: campaign.dangerLevel,
      openThreads: parseJson<string[]>(campaign.openThreads, []),
      currentSceneId: campaign.currentSceneId,
      currentLocationId: campaign.currentLocationId,
    },
    scene: scene
      ? { id: scene.id, name: scene.name, description: scene.description, mood: scene.mood }
      : null,
    location: location
      ? {
          id: location.id,
          name: location.name,
          description: location.description,
          visualDescription: location.visualDescription,
          mood: location.mood,
          activeAssetId: location.activeAssetId,
          currentChanges: location.currentChanges,
        }
      : null,
    activeCharacters: members
      .filter((m) => m.character.isComplete && m.character.isActive)
      .map((m) => m.character)
      .map((c) => ({
      id: c.id,
      name: c.name,
      race: c.race,
      className: c.className,
      hitPoints: c.hitPoints,
      maxHitPoints: c.maxHitPoints,
      conditions: parseJson<string[]>(c.conditions, []),
      appearance: c.appearance,
    })),
    activeNpcs: npcs.map((n) => ({
      id: n.id,
      name: n.name,
      description: n.description,
      attitude: n.attitude,
      goals: n.goals,
    })),
    activeQuest: primaryQuest
      ? {
          id: primaryQuest.id,
          title: primaryQuest.title,
          description: primaryQuest.description,
          objectives: parseJson<string[]>(primaryQuest.objectives, []),
        }
      : null,
    publicMemories: memories.filter((m) => m.category === 'public').map((m) => m.content),
    hiddenMemories: memories.filter((m) => m.category === 'hidden').map((m) => m.content),
    recentTurns: turns.reverse().map((t) => ({
      message: t.message,
      response: t.response,
      discordId: t.discordId,
    })),
    pendingChecks: pendingChecks.map((p) => ({
      id: p.id,
      skill: p.skill,
      ability: p.ability,
      dc: p.dc,
      targetDiscordId: p.targetDiscordId,
    })),
    combat: combat
      ? { id: combat.id, round: combat.round, currentTurn: combat.currentTurn, status: combat.status }
      : null,
    visualStyle: style
      ? {
          artStyle: style.artStyle,
          colorPalette: style.colorPalette,
          lightingMood: style.lightingMood,
          negativePrompt: style.negativePrompt,
        }
      : null,
  };
}

export async function getCampaignRecap(campaignId: string): Promise<string> {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const memories = await prisma.memoryEntry.findMany({
    where: { campaignId, category: 'public', isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const quests = await prisma.quest.findMany({ where: { campaignId, status: 'active' } });

  const lines = [
    `**${campaign.name}**`,
    '',
    campaign.sessionSummary || 'No session summary yet.',
    '',
    '**Recent Events:**',
    ...memories.map((m) => `• ${m.content}`),
    '',
    '**Active Quests:**',
    ...quests.map((q) => `• ${q.title}: ${q.description}`),
  ];

  return lines.join('\n');
}

export async function resetCampaign(campaignId: string): Promise<void> {
  await deleteChronicle(campaignId);
  await prisma.conversationTurn.deleteMany({ where: { campaignId } });
  await prisma.pendingCheck.deleteMany({ where: { campaignId } });
  await prisma.rollHistory.deleteMany({ where: { campaignId } });
  await prisma.memoryEntry.deleteMany({ where: { campaignId } });
  await prisma.asset.deleteMany({ where: { campaignId } });
  await prisma.combatState.deleteMany({ where: { campaignId } });
  await prisma.quest.deleteMany({ where: { campaignId } });
  await prisma.nPC.deleteMany({ where: { campaignId } });
  await prisma.faction.deleteMany({ where: { campaignId } });
  await prisma.scene.deleteMany({ where: { campaignId } });
  await prisma.location.deleteMany({ where: { campaignId } });
  await prisma.campaignMember.deleteMany({ where: { campaignId } });
  await prisma.character.updateMany({ where: { campaignId }, data: { campaignId: null, currentLocationId: null } });
  await prisma.campaignChannel.deleteMany({ where: { campaignId } });
  await prisma.visualStyleProfile.deleteMany({ where: { campaignId } });
  await prisma.campaign.delete({ where: { id: campaignId } });
}
