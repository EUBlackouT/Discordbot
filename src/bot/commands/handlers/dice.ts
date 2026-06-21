import { SlashCommandBuilder } from 'discord.js';
import type { CommandHandler } from '../index.js';
import { executeRoll, rollAbilityCheck } from '../../../game/dice/engine.js';
import { prisma } from '../../../db/client.js';
import { parseJson, toJson } from '../../../utils/helpers.js';
import type { Ability } from '../../../utils/helpers.js';
import { getCampaignByChannel } from '../../../campaign/state.js';
import { processCheckRoll } from '../../../core/campaign-loop.js';
import { getCharactersForPlayer } from '../../../game/character/service.js';
import { buildCampaignTurnReply } from '../../campaign-reply.js';
import { getActiveCharacterForPlayer } from '../../../tenant/campaign-member.js';
import { loadRulesData, getSkillAbility } from '../../../game/rules/loader.js';

const diceBuilder = () => new SlashCommandBuilder().setName('dice').setDescription('Dice rolling');

export const rollCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('roll')
    .setDescription('Roll dice')
    .addStringOption((o) => o.setName('expression').setDescription('e.g. 1d20+5, 2d6+3').setRequired(true))
    .addStringOption((o) =>
      o
        .setName('advantage')
        .setDescription('Advantage state')
        .addChoices(
          { name: 'Normal', value: 'normal' },
          { name: 'Advantage', value: 'advantage' },
          { name: 'Disadvantage', value: 'disadvantage' },
        ),
    ),
  execute: async (interaction) => {
    const expression = interaction.options.getString('expression', true);
    const advantage = (interaction.options.getString('advantage') ?? 'normal') as
      | 'normal'
      | 'advantage'
      | 'disadvantage';

    try {
      const result = executeRoll(expression, advantage);
      const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;

      await prisma.rollHistory.create({
        data: {
          campaignId: campaign?.id,
          rollerDiscordId: interaction.user.id,
          expression: result.expression,
          rawDice: toJson(result.rawDice),
          keptDice: toJson(result.keptDice),
          droppedDice: toJson(result.droppedDice),
          modifier: result.modifier,
          total: result.total,
          advantageState: result.advantageState,
          checkType: 'free_roll',
        },
      });

      await interaction.reply(`🎲 ${result.breakdown} = **${result.total}**`);
    } catch (err) {
      await interaction.reply({ content: `Invalid roll: ${(err as Error).message}`, ephemeral: true });
    }
  },
};

export const checkCmd: CommandHandler = {
  data: new SlashCommandBuilder().setName('check').setDescription('Resolve a pending check or roll a skill check'),
  execute: async (interaction) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;

    if (campaign) {
      const pending = await prisma.pendingCheck.findFirst({
        where: { campaignId: campaign.id, targetDiscordId: interaction.user.id, status: 'pending' },
      });

      if (pending) {
        await interaction.deferReply();
        const result = await processCheckRoll(campaign.id, interaction.user.id);
        const character = await getActiveCharacterForPlayer(campaign.id, interaction.user.id);
        const payload = buildCampaignTurnReply(
          result,
          character
            ? {
                player: {
                  displayName: interaction.user.displayName,
                  characterName: character.name,
                  characterId: character.id,
                  action: result.rollPlayerLine ?? 'Rolls the dice',
                },
              }
            : {},
        );
        await interaction.editReply(payload);
        return;
      }
    }

    await interaction.reply({
      content: 'No pending check for you. The DM will ask you to roll when a check is needed.',
      ephemeral: true,
    });
  },
};

export const saveCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('save')
    .setDescription('Make a saving throw')
    .addStringOption((o) =>
      o
        .setName('ability')
        .setDescription('Ability')
        .setRequired(true)
        .addChoices(
          { name: 'STR', value: 'STR' },
          { name: 'DEX', value: 'DEX' },
          { name: 'CON', value: 'CON' },
          { name: 'INT', value: 'INT' },
          { name: 'WIS', value: 'WIS' },
          { name: 'CHA', value: 'CHA' },
        ),
    )
    .addIntegerOption((o) => o.setName('dc').setDescription('DC').setRequired(true)),
  execute: async (interaction) => {
    const ability = interaction.options.getString('ability', true) as Ability;
    const dc = interaction.options.getInteger('dc', true);
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }
    const chars = await getCharactersForPlayer(guildId, interaction.user.id, campaign?.id);
    const character = chars[0];

    if (!character) {
      await interaction.reply({ content: 'You need a character to make saving throws.', ephemeral: true });
      return;
    }

    const mods = parseJson<Record<Ability, number>>(character.abilityMods, {
      STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0,
    });
    const saves = parseJson<string[]>(character.savingThrows, []);

    const roll = rollAbilityCheck({
      abilityModifier: mods[ability],
      proficiencyBonus: character.proficiencyBonus,
      isProficient: saves.includes(ability),
      dc,
    });

    await prisma.rollHistory.create({
      data: {
        campaignId: campaign?.id,
        characterId: character.id,
        rollerDiscordId: interaction.user.id,
        expression: roll.expression,
        rawDice: toJson(roll.rawDice),
        keptDice: toJson(roll.keptDice),
        droppedDice: toJson(roll.droppedDice),
        modifier: roll.modifier,
        total: roll.total,
        advantageState: roll.advantageState,
        checkType: 'save',
        ability,
        dc,
        success: roll.success,
      },
    });

    await interaction.reply(
      `${ability} Save vs DC ${dc}\n${roll.breakdown}\n${roll.success ? '✅ Success!' : '❌ Failure.'}`,
    );
  },
};

export const initiativeCmd: CommandHandler = {
  data: new SlashCommandBuilder().setName('initiative').setDescription('Roll initiative for your character'),
  execute: async (interaction) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.reply({ content: 'This command only works in a server.', ephemeral: true });
      return;
    }
    const chars = await getCharactersForPlayer(guildId, interaction.user.id, campaign?.id);
    const character = chars[0];

    if (!character) {
      await interaction.reply({ content: 'You need a character.', ephemeral: true });
      return;
    }

    const mods = parseJson<Record<Ability, number>>(character.abilityMods, {
      STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0,
    });
    const { rollInitiative } = await import('../../../game/dice/engine.js');
    const roll = rollInitiative(mods.DEX);

    await interaction.reply(`🎯 **${character.name}** rolls initiative: ${roll.breakdown} = **${roll.total}**`);
  },
};

// Placeholder exports for index - dice commands use separate slash names
export { rollCmd as diceRollCmd };
