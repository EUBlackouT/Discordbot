import {
  SlashCommandBuilder,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type Client,
  type Interaction,
} from 'discord.js';
import { config } from '../../config/index.js';

export interface CommandHandler {
  data?: { toJSON(): unknown };
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
}

import { createCmd as characterCmd, handleCharacterComponent, handleCharacterAutocomplete } from './handlers/character.js';
import {
  startCmd as campaignStartHandler,
  joinCmd as campaignJoinHandler,
  leaveCmd as campaignLeaveHandler,
  resetCmd as campaignResetHandler,
  threadsCmd as campaignThreadsHandler,
} from './handlers/campaign.js';
import { rollCmd, checkCmd, saveCmd, initiativeCmd } from './handlers/dice.js';
import { startCmd as combatCmd } from './handlers/combat.js';
import { voiceCmd } from './handlers/voice.js';
import { helpCmd } from './handlers/help.js';
import { stateCmd as debugCmd } from './handlers/debug.js';

/** Setup & admin only — gameplay is conversational in campaign channels. */
const campaignData = new SlashCommandBuilder()
  .setName('campaign')
  .setDescription('Start or join a campaign (gameplay is in chat)')
  .addSubcommand((s) =>
    s.setName('start').setDescription('Start a campaign in this channel').addStringOption((o) => o.setName('name').setDescription('Campaign name')),
  )
  .addSubcommand((s) =>
    s
      .setName('join')
      .setDescription('Join the campaign in this channel with your character')
      .addStringOption((o) => o.setName('character').setDescription('Your character name').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('leave').setDescription('Leave this campaign (or say it in chat)'))
  .addSubcommand((s) =>
    s
      .setName('threads')
      .setDescription('Show main campaign focus and active progression beats (DM debug)'),
  )
  .addSubcommand((s) =>
    s.setName('reset').setDescription('Reset campaign (destructive)').addBooleanOption((o) => o.setName('confirm').setDescription('Confirm reset').setRequired(true)),
  ) as SlashCommandBuilder;

const campaignHandlers: Record<string, CommandHandler> = {
  start: campaignStartHandler,
  join: campaignJoinHandler,
  leave: campaignLeaveHandler,
  reset: campaignResetHandler,
  threads: campaignThreadsHandler,
};

const campaignCmd: CommandHandler & { data: SlashCommandBuilder } = {
  data: campaignData,
  execute: async (interaction, client) => {
    const sub = interaction.options.getSubcommand();
    const handler = campaignHandlers[sub];
    if (handler) await handler.execute(interaction, client);
  },
};

// /location image removed — location visuals are generated during play

export const commands: (CommandHandler & { data: { toJSON(): unknown } })[] = [
  helpCmd as CommandHandler & { data: { toJSON(): unknown } },
  characterCmd as CommandHandler & { data: { toJSON(): unknown } },
  campaignCmd as CommandHandler & { data: { toJSON(): unknown } },
  rollCmd as CommandHandler & { data: { toJSON(): unknown } },
  checkCmd as CommandHandler & { data: { toJSON(): unknown } },
  saveCmd as CommandHandler & { data: { toJSON(): unknown } },
  initiativeCmd as CommandHandler & { data: { toJSON(): unknown } },
  combatCmd as CommandHandler & { data: { toJSON(): unknown } },
  voiceCmd as CommandHandler & { data: { toJSON(): unknown } },
  debugCmd as CommandHandler & { data: { toJSON(): unknown } },
];

export { handleCharacterComponent, handleCharacterAutocomplete };

export async function registerSlashCommands(): Promise<void> {
  const rest = new REST().setToken(config.discord.token);
  const body = commands.map((c) => c.data.toJSON());

  if (config.discord.guildId) {
    // Clear stale global commands so Discord doesn't show duplicates alongside guild commands
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
    console.log(`Registered ${body.length} guild commands (cleared global duplicates).`);
  } else {
    await rest.put(Routes.applicationCommands(config.discord.clientId), { body });
    console.log(`Registered ${body.length} global commands (may take up to 1 hour).`);
  }
}
