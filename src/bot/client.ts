import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  type Interaction,
  type Message,
  TextChannel,
} from 'discord.js';
import { config, validateConfig } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { commands, handleCharacterComponent } from './commands/index.js';
import { getCampaignByChannel } from '../campaign/state.js';
import { INTRO_CHOICES } from '../campaign/intro.js';
import { processCampaignMessage, assetManager } from '../core/campaign-loop.js';
import { getActiveCharacterForPlayer } from '../tenant/campaign-member.js';
import { ensureGuild } from '../tenant/guild-service.js';
import { buildCampaignTurnReply, type PlayerTurnContext } from './campaign-reply.js';
import {
  buildGettingStartedEmbed,
  buildNotInCampaignEmbed,
  looksLikeHelpMessage,
} from './onboarding.js';
import { getCharactersForPlayer } from '../game/character/service.js';
import type { CampaignTurnResult } from '../core/campaign-loop.js';

async function buildCampaignReplyPayload(
  result: CampaignTurnResult,
  player?: Omit<PlayerTurnContext, 'portraitPath'>,
  opts?: { suppressPlayerEmbed?: boolean },
) {
  const portraitPath = player
    ? await assetManager.getCharacterPortraitPath(player.characterId)
    : undefined;
  return buildCampaignTurnReply(result, {
    player: player ? { ...player, portraitPath } : undefined,
    portraitPath,
    suppressPlayerEmbed: opts?.suppressPlayerEmbed,
  });
}

export function createBotClient(): Client {
  const errors = validateConfig();
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info(`Bot logged in as ${c.user.tag}`);
    for (const [, guild] of c.guilds.cache) {
      await ensureGuild(guild.id, guild.name).catch((err) => logger.warn('Guild sync failed', err));
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    await ensureGuild(guild.id, guild.name);
    logger.info(`Bot added to guild: ${guild.name} (${guild.id})`);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.find((cmd) => {
          const json = cmd.data.toJSON() as { name?: string };
          return json.name === interaction.commandName;
        });
        if (!command) {
          await interaction.reply({ content: 'Unknown command.', ephemeral: true });
          return;
        }
        await command.execute(interaction, client);
        return;
      }

      if (await handleCharacterComponent(interaction)) {
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith('opening_choice_')) {
        const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
        if (!campaign || !interaction.channel?.isTextBased() || interaction.channel.isDMBased()) {
          await interaction.reply({ content: 'No campaign in this channel.', ephemeral: true });
          return;
        }

        const character = await getActiveCharacterForPlayer(campaign.id, interaction.user.id);
        if (!character) {
          await interaction.reply({
            content: 'Join the party first with `/campaign join character:YourName`, then pick an opening move.',
            ephemeral: true,
          });
          return;
        }

        const choiceIndex = parseInt(interaction.customId.replace('opening_choice_', ''), 10);
        const action = INTRO_CHOICES[choiceIndex];
        if (!action) return;

        await interaction.deferUpdate();

        if (interaction.channel instanceof TextChannel) {
          await interaction.channel.sendTyping();
        }

        const result = await processCampaignMessage(
          campaign.id,
          interaction.user.id,
          action,
          character.id,
        );
        const payload = await buildCampaignReplyPayload(result, {
          displayName: interaction.user.displayName,
          characterName: character.name,
          characterId: character.id,
          action,
        });
        await interaction.channel.send(payload);
        return;
      }

      if (interaction.isButton() && interaction.customId === 'roll_check') {
        const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
        if (!campaign) return;
        const { processCheckRoll } = await import('../core/campaign-loop.js');
        await interaction.deferReply();
        const result = await processCheckRoll(campaign.id, interaction.user.id);
        const character = await getActiveCharacterForPlayer(campaign.id, interaction.user.id);
        const payload = await buildCampaignReplyPayload(
          result,
          character
            ? {
                displayName: interaction.user.displayName,
                characterName: character.name,
                characterId: character.id,
                action: 'Rolls the dice',
              }
            : undefined,
        );
        await interaction.editReply(payload);
      }
    } catch (err) {
      const meta = interaction.isRepliable()
        ? { customId: 'customId' in interaction ? interaction.customId : interaction.commandName }
        : {};
      logger.error('Interaction error', { ...meta, err });
      if (interaction.isRepliable()) {
        const msg = interaction.deferred || interaction.replied
          ? interaction.editReply.bind(interaction)
          : interaction.reply.bind(interaction);
        await msg({ content: 'Something went wrong processing that action.', ephemeral: true }).catch(() => {});
      }
    }
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    if (!message.guild || !message.channelId) return;

    const campaign = await getCampaignByChannel(message.channelId);
    const isMentioned = message.mentions.has(client.user!.id);
    const wantsHelp = looksLikeHelpMessage(message.content);

    if (!campaign && (isMentioned || wantsHelp)) {
      await message.reply({ embeds: [buildGettingStartedEmbed()] });
      return;
    }

    if (!campaign) return;
    if (message.content.startsWith('/')) return;

    try {
      if (message.channel instanceof TextChannel) {
        await message.channel.sendTyping();
      }

      const member = await getActiveCharacterForPlayer(campaign.id, message.author.id);
      if (!member) {
        if (wantsHelp || isMentioned) {
          const chars = await getCharactersForPlayer(message.guild.id, message.author.id);
          const names = chars.filter((c) => c.isComplete).map((c) => c.name);
          await message.reply({ embeds: [buildNotInCampaignEmbed(names)] });
          return;
        }
        await message.reply({
          embeds: [buildNotInCampaignEmbed([])],
        });
        return;
      }

      const result = await processCampaignMessage(
        campaign.id,
        message.author.id,
        message.content,
        member.id,
      );

      if (result.isPrivate) {
        await message.author.send(result.narration);
        await message.react('🔒');
        return;
      }

      const payload = await buildCampaignReplyPayload(
        result,
        {
          displayName: message.author.displayName,
          characterName: member.name,
          characterId: member.id,
          action: message.content,
        },
        { suppressPlayerEmbed: true },
      );

      await message.reply(payload);
    } catch (err) {
      logger.error('Message handler error', err);
      await message.reply('The DM falters. Please try again.');
    }
  });

  return client;
}

export async function startBot(): Promise<Client> {
  const client = createBotClient();
  await client.login(config.discord.token);
  return client;
}
