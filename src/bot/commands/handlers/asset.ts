import { SlashCommandBuilder } from 'discord.js';
import type { CommandHandler } from '../index.js';
import { getCampaignByChannel, buildStatePacket } from '../../../campaign/state.js';
import { assetManager } from '../../../core/campaign-loop.js';
import { createImageService } from '../../../assets/asset-manager.js';

const imageService = createImageService();

export const locationImageCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('asset')
    .setDescription('Campaign visual assets')
    .addSubcommand((s) => s.setName('location').setDescription('Generate or view location image'))
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('View an asset by ID')
        .addStringOption((o) => o.setName('id').setDescription('Asset ID').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('regenerate')
        .setDescription('Regenerate an asset')
        .addStringOption((o) => o.setName('id').setDescription('Asset ID').setRequired(true)),
    ),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;

    if (sub === 'location' || (interaction.commandName === 'location' && sub === 'image')) {
      if (!campaign) {
        await interaction.reply({ content: 'No active campaign.', ephemeral: true });
        return;
      }
      await interaction.deferReply();
      const state = await buildStatePacket(campaign.id);

      if (!state.location) {
        await interaction.editReply('No current location.');
        return;
      }

      const reused = await assetManager.reuseLocationAsset(state.location.id);
      if (reused) {
        await interaction.editReply(
          `📍 Reusing existing image for **${state.location.name}** (v${reused.version})\n\`${reused.localPath ?? reused.imageUrl}\``,
        );
        return;
      }

      const result = await assetManager.decideAndExecute(campaign.id, state, {
        should_generate_image: true,
        reason: 'Manual location image request',
        asset_type: 'location',
        new_asset_needed: true,
      });

      await interaction.editReply(
        result
          ? `📍 Generated **${state.location.name}** v${result.version}\n\`${result.localPath}\``
          : 'Image generation skipped (disabled or limit reached).',
      );
      return;
    }

    if (sub === 'view') {
      const id = interaction.options.getString('id', true);
      const asset = await imageService.getAsset(id);
      if (!asset) {
        await interaction.reply({ content: 'Asset not found.', ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `Asset **${asset.assetId}** v${asset.version}\n\`${asset.localPath ?? asset.imageUrl}\``,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'regenerate') {
      const id = interaction.options.getString('id', true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await imageService.regenerateAsset(id);
        await interaction.editReply(`Regenerated v${result.version}: \`${result.localPath}\``);
      } catch (err) {
        await interaction.editReply(`Error: ${(err as Error).message}`);
      }
    }
  },
};

export const viewCmd = locationImageCmd;
export const regenerateCmd = locationImageCmd;

// Alias for /location image requirement — handled via asset location subcommand
export { locationImageCmd as assetLocationCmd };
