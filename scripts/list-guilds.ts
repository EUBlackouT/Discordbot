import '../src/config/load-env.js';
import { Client, GatewayIntentBits } from 'discord.js';
import { config } from '../src/config/index.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once('ready', () => {
  for (const [, guild] of client.guilds.cache) {
    console.log(`${guild.name}\t${guild.id}`);
  }
  client.destroy();
});
await client.login(config.discord.token);
