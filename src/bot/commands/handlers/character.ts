import { SlashCommandBuilder, MessageFlags, type Interaction, type AutocompleteInteraction } from 'discord.js';
import type { CommandHandler } from '../index.js';
import {
  getCharactersForPlayer,
  deleteCharacter,
  resolveCharacterForPlayer,
} from '../../../game/character/service.js';
import { buildCharacterSheetPayload } from '../../../game/character/sheet-display.js';
import { assetManager } from '../../../core/campaign-loop.js';
import {
  lookupSpell,
  buildSpellDetailEmbed,
} from '../../../game/character/spell-reference.js';
import { prisma } from '../../../db/client.js';
import { getCampaignByChannel } from '../../../campaign/state.js';
import { ensureGuild } from '../../../tenant/guild-service.js';
import { requireGuild } from '../../../tenant/permissions.js';
import { logger } from '../../../utils/logger.js';
import { startCharacterWizard, handleCharacterWizardComponent } from './character-wizard.js';

export const createCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('character')
    .setDescription('Character management')
    .addSubcommand((s) => s.setName('create').setDescription('Start character creation'))
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription('View a character')
        .addStringOption((o) =>
          o.setName('name').setDescription('Character name (defaults to active character)').setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('sheet')
        .setDescription('Full character sheet')
        .addStringOption((o) =>
          o.setName('name').setDescription('Character name (defaults to active character)').setAutocomplete(true),
        ),
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
    const sub = interaction.options.getSubcommand();
    const ephemeral = sub !== 'view';

    if (sub !== 'edit') {
      await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    }

    const guildErr = requireGuild(interaction);
    if (guildErr) {
      if (interaction.deferred) {
        await interaction.editReply({ content: guildErr });
      } else {
        await interaction.reply({ content: guildErr, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    const guildId = interaction.guildId!;

    try {
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
        const chars = await getCharactersForPlayer(guildId, interaction.user.id);
        if (chars.length === 0) {
          await interaction.editReply('You have no characters. Use `/character create`.');
          return;
        }
        const list = chars.map((c) => `• **${c.name}** — ${c.race} ${c.className} (Lv ${c.level})`).join('\n');
        await interaction.editReply(`**Your Characters:**\n${list}`);
        return;
      }

      if (sub === 'view' || sub === 'sheet') {
        const name = interaction.options.getString('name');
        const char = await resolveCharacterForPlayer(guildId, interaction.user.id, {
          name,
          campaignId: campaign?.id,
        });

        if (!char) {
          const chars = await getCharactersForPlayer(guildId, interaction.user.id);
          if (chars.length === 0) {
            await interaction.editReply('You have no characters. Use `/character create`.');
            return;
          }
          if (chars.length > 1) {
            const names = chars.map((c) => c.name).join(', ');
            await interaction.editReply(
              `Which character? Use \`/character sheet name:...\` or pick from autocomplete.\nYour characters: ${names}`,
            );
            return;
          }
        }

        const resolved = char ?? (await getCharactersForPlayer(guildId, interaction.user.id))[0];
        if (!resolved) {
          await interaction.editReply('No character found.');
          return;
        }

        const portraitPath = await assetManager.getCharacterPortraitPath(resolved.id);
        const { embeds, components, files } = buildCharacterSheetPayload(resolved, portraitPath);
        await interaction.editReply({ embeds, components, files: files ?? [] });
        return;
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name', true);
        const chars = await getCharactersForPlayer(guildId, interaction.user.id);
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
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      logger.error('Character command failed', { sub, err });
      const message = `Could not complete \`/character ${sub}\`: ${(err as Error).message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: message, embeds: [], components: [] });
      } else {
        await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
      }
    }
  },
};

export async function handleCharacterAutocomplete(interaction: AutocompleteInteraction): Promise<boolean> {
  if (interaction.commandName !== 'character') return false;
  const sub = interaction.options.getSubcommand(false);
  if (sub !== 'view' && sub !== 'sheet') return false;

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]);
    return true;
  }

  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'name') return false;

  const chars = await getCharactersForPlayer(guildId, interaction.user.id);
  const query = focused.value.toLowerCase();
  const choices = chars
    .filter((c) => c.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map((c) => ({
      name: `${c.name} — ${c.race} ${c.className}`.slice(0, 100),
      value: c.name.slice(0, 100),
    }));

  await interaction.respond(choices);
  return true;
}

export async function handleCharacterComponent(interaction: Interaction): Promise<boolean> {
  if (await handleCharacterSheetComponent(interaction)) return true;
  if (await handleCharacterWizardComponent(interaction)) return true;
  return false;
}

async function handleCharacterSheetComponent(interaction: Interaction): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith('char_sheet_spell:')) return false;

  const characterId = interaction.customId.slice('char_sheet_spell:'.length);
  const spellKey = interaction.values[0];

  const character = await prisma.character.findFirst({
    where: { id: characterId, ownerDiscordId: interaction.user.id },
  });
  if (!character) {
    await interaction.reply({
      content: 'That character sheet is not yours or no longer exists.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const spell = lookupSpell(spellKey);
  if (!spell) {
    await interaction.reply({
      content: `No SRD entry found for **${spellKey}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.reply({
    embeds: [buildSpellDetailEmbed(spell)],
    flags: MessageFlags.Ephemeral,
  });
  return true;
}
