import { SlashCommandBuilder } from 'discord.js';
import type { CommandHandler } from '../index.js';
import { getCampaignByChannel } from '../../../campaign/state.js';
import { buildGettingStartedEmbed } from '../../onboarding.js';

export const helpCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('How to create a character and start playing'),

  execute: async (interaction) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    const embed = buildGettingStartedEmbed();

    if (campaign) {
      embed.spliceFields(0, 0, {
        name: 'This channel',
        value: `**${campaign.name}** is already running here — create a character and \`/campaign join\`, then type your actions.`,
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
