import { SlashCommandBuilder } from 'discord.js';
import type { CommandHandler } from '../index.js';
import { config } from '../../../config/index.js';
import { getCampaignByChannel, buildStatePacket } from '../../../campaign/state.js';
import { prisma } from '../../../db/client.js';
import { canManageCampaign } from '../../../tenant/permissions.js';

function isGlobalAdmin(discordId: string): boolean {
  return config.admin.discordIds.length === 0 || config.admin.discordIds.includes(discordId);
}

export const stateCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('Debug and admin tools')
    .addSubcommand((s) => s.setName('state').setDescription('Dump campaign state packet'))
    .addSubcommand((s) => s.setName('pending-checks').setDescription('List pending checks'))
    .addSubcommand((s) => s.setName('memory').setDescription('All memory including hidden'))
    .addSubcommand((s) => s.setName('assets').setDescription('List campaign assets')),
  execute: async (interaction) => {
    if (!isGlobalAdmin(interaction.user.id) && !(await canManageCampaign(interaction))) {
      await interaction.reply({ content: 'Admin only.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;

    if (!campaign) {
      await interaction.reply({ content: 'No active campaign.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    if (sub === 'state') {
      const state = await buildStatePacket(campaign.id);
      const json = JSON.stringify(state, null, 2);
      const truncated = json.length > 1900 ? json.slice(0, 1900) + '...' : json;
      await interaction.editReply(`\`\`\`json\n${truncated}\n\`\`\``);
      return;
    }

    if (sub === 'pending-checks') {
      const checks = await prisma.pendingCheck.findMany({ where: { campaignId: campaign.id } });
      const text =
        checks
          .map(
            (c) =>
              `[${c.status}] ${c.skill ?? c.ability} DC${c.dc} → <@${c.targetDiscordId}> (${c.id.slice(0, 8)})`,
          )
          .join('\n') || 'None';
      await interaction.editReply(text);
      return;
    }

    if (sub === 'memory') {
      const memories = await prisma.memoryEntry.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const text = memories.map((m) => `[${m.category}] ${m.content}`).join('\n') || 'None';
      await interaction.editReply(text);
      return;
    }

    if (sub === 'assets') {
      const assets = await prisma.asset.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
      });
      const text =
        assets
          .map(
            (a) =>
              `${a.isActive ? '✓' : '○'} ${a.assetType} v${a.version} ${a.id.slice(0, 8)} — ${a.localPath ?? a.imageUrl ?? 'no path'}`,
          )
          .join('\n') || 'None';
      await interaction.editReply(text);
    }
  },
};

export const pendingChecksCmd = stateCmd;
export const memoryCmd = stateCmd;
export const assetsCmd = stateCmd;
