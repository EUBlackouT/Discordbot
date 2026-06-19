import { SlashCommandBuilder, type Interaction } from 'discord.js';
import type { CommandHandler } from '../index.js';
import {
  getCharactersForPlayer,
  getCharacterSheet,
  deleteCharacter,
} from '../../../game/character/service.js';
import { getCampaignByChannel } from '../../../campaign/state.js';
import { ensureGuild } from '../../../tenant/guild-service.js';
import { requireGuild } from '../../../tenant/permissions.js';
import { startCharacterWizard, handleCharacterWizardComponent } from './character-wizard.js';
function charGroup(_name: string) {
  return new SlashCommandBuilder().setName(_name).setDescription(`Character: ${_name}`);
}
void charGroup;

export const createCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('character')
    .setDescription('Character management')
    .addSubcommand((s) => s.setName('create').setDescription('Start character creation'))
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('View a character')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('sheet')
        .setDescription('Full character sheet')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('edit').setDescription('Edit character (limited)'))
    .addSubcommand((s) =>
      s
        .setName('delete')
        .setDescription('Delete a character')
        .addStringOption((o) => o.setName('name').setDescription('Character name').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List your characters')),

  async execute(interaction, _client) {
    const guildErr = requireGuild(interaction);
    if (guildErr) {
      await interaction.reply({ content: guildErr, ephemeral: true });
      return;
    }
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    // Acknowledge before guild/DB I/O (Discord 3s limit).
    if (sub !== 'edit') {
      await interaction.deferReply({ ephemeral: sub !== 'view' });
    }

    await ensureGuild(guildId, interaction.guild?.name);

    const campaign = interaction.channelId
      ? await getCampaignByChannel(interaction.channelId)
      : null;

    if (sub === 'create') {
      const { embeds, components } = await startCharacterWizard(guildId, interaction.user.id, campaign?.id);
      await interaction.editReply({ embeds, components });
      return;
    }

    if (sub === 'list') {
      const chars = await getCharactersForPlayer(guildId, interaction.user.id, campaign?.id);
      if (chars.length === 0) {
        await interaction.editReply('You have no characters. Use `/character create`.');
        return;
      }
      const list = chars.map((c) => `• **${c.name}** — ${c.race} ${c.className} (Lv ${c.level})`).join('\n');
      await interaction.editReply(`**Your Characters:**\n${list}`);
      return;
    }

    if (sub === 'view' || sub === 'sheet') {
      const name = interaction.options.getString('name', true);
      const chars = await getCharactersForPlayer(guildId, interaction.user.id, campaign?.id);
      const char = chars.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!char) {
        await interaction.editReply(`No character named "${name}" found.`);
        return;
      }
      const sheet = await getCharacterSheet(char.id, guildId, interaction.user.id);
      await interaction.editReply(sheet);
      return;
    }

    if (sub === 'delete') {
      const name = interaction.options.getString('name', true);
      const chars = await getCharactersForPlayer(guildId, interaction.user.id, campaign?.id);
      const char = chars.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!char) {
        await interaction.editReply(`No character named "${name}" found.`);
        return;
      }
      await deleteCharacter(char.id, guildId, interaction.user.id);
      await interaction.editReply(`Character **${char.name}** has been retired.`);
      return;
    }

    if (sub === 'edit') {
      await interaction.reply({
        content: 'Character editing is limited in v0.1. Delete and recreate, or use admin tools. TODO: full edit flow.',
        ephemeral: true,
      });
    }
  },
};

export async function handleCharacterComponent(interaction: Interaction): Promise<boolean> {
  if (await handleCharacterWizardComponent(interaction)) return true;
  return false;
}

