import { SlashCommandBuilder } from 'discord.js';
import type { CommandHandler } from '../index.js';
import * as campaignHandlers from './campaign.js';
import {
  startCombat,
  getCombatStatus,
  nextCombatTurn,
  endCombat,
} from '../../../game/combat/combat-service.js';
import { getCampaignByChannel } from '../../../campaign/state.js';
import { getCharactersForPlayer } from '../../../game/character/service.js';

export const startCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('combat')
    .setDescription('Combat management')
    .addSubcommand((s) => s.setName('start').setDescription('Start combat with your character'))
    .addSubcommand((s) => s.setName('status').setDescription('Show combat status'))
    .addSubcommand((s) => s.setName('next').setDescription('Next turn'))
    .addSubcommand((s) => s.setName('end').setDescription('End combat')),
  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;

    if (!campaign) {
      await interaction.reply({ content: 'No active campaign in this channel.', ephemeral: true });
      return;
    }

    if (sub === 'start') {
      if (!interaction.guildId) {
        await interaction.reply({ content: 'Combat must be started in a server.', ephemeral: true });
        return;
      }
      const chars = await getCharactersForPlayer(interaction.guildId, interaction.user.id, campaign.id);
      if (chars.length === 0) {
        await interaction.reply({ content: 'You need a character to enter combat.', ephemeral: true });
        return;
      }
      try {
        await startCombat(campaign.id, chars.map((c) => c.id));
        await interaction.reply(`⚔️ Combat started! ${await getCombatStatus(campaign.id)}`);
      } catch (err) {
        await interaction.reply({ content: (err as Error).message, ephemeral: true });
      }
      return;
    }

    if (sub === 'status') {
      await interaction.reply(await getCombatStatus(campaign.id));
      return;
    }

    if (sub === 'next') {
      try {
        await interaction.reply(await nextCombatTurn(campaign.id));
      } catch (err) {
        await interaction.reply({ content: (err as Error).message, ephemeral: true });
      }
      return;
    }

    if (sub === 'end') {
      try {
        await endCombat(campaign.id);
        await interaction.reply('Combat ended.');
      } catch (err) {
        await interaction.reply({ content: (err as Error).message, ephemeral: true });
      }
    }
  },
};

export const statusCmd = startCmd;
export const nextCmd = startCmd;
export const endCmd = startCmd;
