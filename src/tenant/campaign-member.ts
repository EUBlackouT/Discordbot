import { prisma } from '../db/client.js';
import { getGuildLimits } from './guild-service.js';
import { getOrCreatePlayer } from '../game/character/service.js';

export async function joinCampaign(
  campaignId: string,
  guildId: string,
  discordId: string,
  characterName: string,
  displayName?: string,
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, guildId },
  });
  if (!campaign) throw new Error('Campaign not found in this server.');

  const characters = await prisma.character.findMany({
    where: {
      guildId,
      ownerDiscordId: discordId,
      isComplete: true,
      isActive: true,
    },
  });

  const character = characters.find((c) => c.name.toLowerCase() === characterName.toLowerCase());

  if (!character) {
    throw new Error(
      `No character named "${characterName}" in this server. Use \`/character create\` first.`,
    );
  }

  if (character.campaignId && character.campaignId !== campaignId) {
    throw new Error(
      `**${character.name}** is already in another campaign. Create a new character or leave that campaign first.`,
    );
  }

  const limits = await getGuildLimits(guildId);
  const memberCount = await prisma.campaignMember.count({
    where: { campaignId, isActive: true },
  });
  if (memberCount >= limits.maxPartySize) {
    throw new Error(`This campaign is full (max ${limits.maxPartySize} players for your plan).`);
  }

  await getOrCreatePlayer(discordId, campaignId);

  await prisma.character.update({
    where: { id: character.id },
    data: {
      campaignId,
      currentLocationId: character.currentLocationId ?? campaign.currentLocationId,
    },
  });

  const member = await prisma.campaignMember.upsert({
    where: { campaignId_discordId: { campaignId, discordId } },
    create: {
      campaignId,
      discordId,
      characterId: character.id,
      displayName: displayName ?? null,
    },
    update: {
      characterId: character.id,
      displayName: displayName ?? null,
      isActive: true,
    },
  });

  return { member, character };
}

export async function getCampaignMember(campaignId: string, discordId: string) {
  return prisma.campaignMember.findUnique({
    where: { campaignId_discordId: { campaignId, discordId } },
    include: { character: true },
  });
}

export async function getActiveCharacterForPlayer(campaignId: string, discordId: string) {
  const member = await getCampaignMember(campaignId, discordId);
  if (member?.character) return member.character;

  return prisma.character.findFirst({
    where: { campaignId, ownerDiscordId: discordId, isComplete: true, isActive: true },
  });
}

export async function listCampaignParty(campaignId: string) {
  return prisma.campaignMember.findMany({
    where: { campaignId, isActive: true },
    include: { character: true },
    orderBy: { joinedAt: 'asc' },
  });
}

export async function leaveCampaign(campaignId: string, discordId: string): Promise<void> {
  const member = await getCampaignMember(campaignId, discordId);
  if (!member) throw new Error('You are not in this campaign.');

  await prisma.campaignMember.update({
    where: { id: member.id },
    data: { isActive: false },
  });

  await prisma.character.update({
    where: { id: member.characterId },
    data: { campaignId: null },
  });
}

export async function autoJoinStarter(campaignId: string, guildId: string, discordId: string) {
  const character = await prisma.character.findFirst({
    where: {
      guildId,
      ownerDiscordId: discordId,
      isComplete: true,
      isActive: true,
      campaignId: null,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!character) return null;
  return joinCampaign(campaignId, guildId, discordId, character.name);
}
