import { prisma } from '../db/client.js';
import { logger } from '../utils/logger.js';

export type PlanTier = 'free' | 'premium' | 'enterprise';

export interface GuildLimits {
  maxCampaignChannels: number;
  maxPartySize: number;
  imageAutoGenerate: boolean;
}

const PLAN_LIMITS: Record<PlanTier, GuildLimits> = {
  free: { maxCampaignChannels: 2, maxPartySize: 4, imageAutoGenerate: false },
  premium: { maxCampaignChannels: 10, maxPartySize: 8, imageAutoGenerate: true },
  enterprise: { maxCampaignChannels: 50, maxPartySize: 12, imageAutoGenerate: true },
};

/** Register or refresh a Discord server when the bot is used or joins. */
export async function ensureGuild(guildId: string, guildName?: string) {
  const existing = await prisma.guild.findUnique({ where: { id: guildId } });
  if (existing) {
    if (guildName && guildName !== existing.name) {
      return prisma.guild.update({ where: { id: guildId }, data: { name: guildName } });
    }
    return existing;
  }

  logger.info(`New guild registered: ${guildId} (${guildName ?? 'unknown'})`);
  return prisma.guild.create({
    data: { id: guildId, name: guildName ?? '' },
  });
}

export async function getGuildLimits(guildId: string): Promise<GuildLimits> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild || guild.subscriptionStatus !== 'active') {
    return PLAN_LIMITS.free;
  }
  const tier = (guild.planTier as PlanTier) ?? 'free';
  const defaults = PLAN_LIMITS[tier] ?? PLAN_LIMITS.free;
  return {
    maxCampaignChannels: guild.maxCampaignChannels || defaults.maxCampaignChannels,
    maxPartySize: guild.maxPartySize || defaults.maxPartySize,
    imageAutoGenerate: guild.imageAutoGenerate ?? defaults.imageAutoGenerate,
  };
}

export async function countGuildCampaignChannels(guildId: string): Promise<number> {
  return prisma.campaignChannel.count({
    where: { campaign: { guildId }, isActive: true },
  });
}

export async function assertGuildCanStartCampaign(guildId: string): Promise<void> {
  const limits = await getGuildLimits(guildId);
  const count = await countGuildCampaignChannels(guildId);
  if (count >= limits.maxCampaignChannels) {
    throw new Error(
      `This server has reached its campaign channel limit (${limits.maxCampaignChannels}). Upgrade your plan for more.`,
    );
  }
}

/** TODO: Wire to Discord App Subscriptions / Stripe webhook */
export async function setGuildPlan(guildId: string, planTier: PlanTier, status = 'active') {
  const limits = PLAN_LIMITS[planTier];
  return prisma.guild.update({
    where: { id: guildId },
    data: {
      planTier,
      subscriptionStatus: status,
      maxCampaignChannels: limits.maxCampaignChannels,
      maxPartySize: limits.maxPartySize,
      imageAutoGenerate: limits.imageAutoGenerate,
    },
  });
}
