import { prisma } from '../db/client.js';
import { ensureGuild } from './guild-service.js';

const GUILD_ASSET_CAMPAIGN_NAME = '__guild_assets__';

/** Hidden campaign bucket for character portraits created before a story campaign exists. */
export async function ensureGuildAssetCampaign(guildId: string) {
  await ensureGuild(guildId);

  const existing = await prisma.campaign.findFirst({
    where: { guildId, name: GUILD_ASSET_CAMPAIGN_NAME },
  });
  if (existing) return existing;

  const campaign = await prisma.campaign.create({
    data: {
      guildId,
      name: GUILD_ASSET_CAMPAIGN_NAME,
      status: 'vault',
      imageDailyLimit: 100,
    },
  });

  await prisma.visualStyleProfile.create({ data: { campaignId: campaign.id } });
  return campaign;
}
