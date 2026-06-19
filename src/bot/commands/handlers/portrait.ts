import { SlashCommandBuilder } from 'discord.js';
import type { CommandHandler } from '../index.js';
import { getCampaignByChannel } from '../../../campaign/state.js';
import { getCharactersForPlayer } from '../../../game/character/service.js';
import { assetManager } from '../../../core/campaign-loop.js';
import { prisma } from '../../../db/client.js';

export const generateCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('portrait')
    .setDescription('Character portrait management')
    .addSubcommand((s) =>
      s
        .setName('generate')
        .setDescription('Generate character portrait')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('View character portrait')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('regenerate')
        .setDescription('Regenerate portrait (new version)')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true)),
    ),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const name = interaction.options.getString('name', true);
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }

    const chars = await getCharactersForPlayer(guildId, interaction.user.id, campaign?.id);
    const character = chars.find((c) => c.name.toLowerCase() === name.toLowerCase());

    if (!character) {
      await interaction.reply({ content: `Character "${name}" not found.`, ephemeral: true });
      return;
    }

    if (sub === 'generate' || sub === 'regenerate') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const campaignId = campaign?.id ?? character.campaignId;
        if (!campaignId) {
          await interaction.editReply('Join a campaign first, or start one with `/campaign start`.');
          return;
        }
        const result = await assetManager.generateCharacterPortrait(
          character.id,
          campaignId,
          interaction.user.id,
        );
        await interaction.editReply(
          `Portrait v${result.version} generated.\nPrompt saved.\n${result.localPath ? `File: \`${result.localPath}\`` : ''}`,
        );
      } catch (err) {
        await interaction.editReply(`Error: ${(err as Error).message}`);
      }
      return;
    }

    if (sub === 'view') {
      const asset = await prisma.asset.findFirst({
        where: { characterId: character.id, assetType: 'character_portrait', isActive: true },
      });
      if (!asset) {
        await interaction.reply({ content: 'No portrait yet. Use `/portrait generate`.', ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `**${character.name}** — Portrait v${asset.version}\n${asset.localPath ?? asset.imageUrl ?? 'No file'}`,
        ephemeral: true,
      });
    }
  },
};

export const viewCmd = generateCmd;
export const regenerateCmd = generateCmd;
