import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { CommandHandler } from '../index.js';
import { config } from '../../../config/index.js';
import { getEnglishVoices, clearVoiceRegistryCache } from '../../../voice/voice-registry.js';
import { assignVoicesForCampaign, getNarratorVoiceId } from '../../../voice/npc-voice-service.js';
import { joinMemberVoiceChannel, voiceManager } from '../../../voice/voice-manager.js';
import { getCampaignByChannel } from '../../../campaign/state.js';

export const voiceCmd: CommandHandler = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('DM voice narration in a voice channel (ElevenLabs)')
    .addSubcommand((s) => s.setName('join').setDescription('Join your current voice channel'))
    .addSubcommand((s) => s.setName('leave').setDescription('Leave the voice channel'))
    .addSubcommand((s) =>
      s
        .setName('test')
        .setDescription('Speak a test line in voice')
        .addStringOption((o) =>
          o
            .setName('line')
            .setDescription('Text to speak')
            .setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('voices')
        .setDescription('List English voices available for NPC casting')
        .addBooleanOption((o) =>
          o.setName('refresh').setDescription('Refresh voice list from ElevenLabs API'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('cast')
        .setDescription('Assign AI voices to NPCs in this campaign that lack one'),
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Voice connection and config status'),
    ),

  execute: async (interaction) => {
    const sub = interaction.options.getSubcommand();

    if (!config.voice.elevenLabsApiKey.trim()) {
      await interaction.reply({
        content: 'ElevenLabs is not configured. Set `ELEVENLABS_API_KEY` in `.env` and restart the bot.',
        ephemeral: true,
      });
      return;
    }

    if (sub === 'join') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply('Guild only.');
        return;
      }
      const err = await joinMemberVoiceChannel(guild, interaction.user.id);
      if (err) {
        await interaction.editReply(err);
        return;
      }
      await interaction.editReply(
        'Joined your voice channel. Narration speaks when `VOICE_ENABLED=true`. NPCs use their own cast voice.',
      );
      return;
    }

    if (sub === 'leave') {
      if (interaction.guildId) voiceManager.leave(interaction.guildId);
      await interaction.reply({ content: 'Left voice channel.', ephemeral: true });
      return;
    }

    if (sub === 'test') {
      await interaction.deferReply({ ephemeral: true });
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply('Guild only.');
        return;
      }
      const line =
        interaction.options.getString('line') ??
        'Steel rings on cobblestones. The Chronicler watches from the shadows, and the tale goes on.';
      if (!voiceManager.isConnected(guild.id)) {
        const err = await joinMemberVoiceChannel(guild, interaction.user.id);
        if (err) {
          await interaction.editReply(err);
          return;
        }
      } else if (!(await voiceManager.waitForReady(guild.id))) {
        await interaction.editReply(
          'Bot is in voice but the audio link is not ready. Run `/voice leave` then `/voice join` again.',
        );
        return;
      }
      voiceManager.speakWithVoice(guild.id, line, getNarratorVoiceId());
      await interaction.editReply('Speaking in voice channel (narrator voice)…');
      return;
    }

    if (sub === 'voices') {
      await interaction.deferReply({ ephemeral: true });
      const refresh = interaction.options.getBoolean('refresh') ?? false;
      if (refresh) await clearVoiceRegistryCache();
      const voices = await getEnglishVoices(refresh);
      const preview = voices
        .slice(0, 25)
        .map((v) => {
          const tags = [v.gender, v.age, v.accent].filter(Boolean).join(', ');
          return `• **${v.name}** (\`${v.voiceId.slice(0, 8)}…\`)${tags ? ` — ${tags}` : ''}`;
        })
        .join('\n');
      const more = voices.length > 25 ? `\n\n…and **${voices.length - 25}** more.` : '';
      await interaction.editReply({
        content: [
          `**${voices.length}** English voices in casting pool (narrator excluded).`,
          `Narrator: \`${getNarratorVoiceId()}\``,
          '',
          preview + more,
          '',
          'Each NPC gets one voice assigned by AI on first appearance — stored permanently.',
        ].join('\n'),
      });
      return;
    }

    if (sub === 'cast') {
      await interaction.deferReply({ ephemeral: true });
      const campaign = interaction.channelId
        ? await getCampaignByChannel(interaction.channelId)
        : null;
      if (!campaign) {
        await interaction.editReply('Run this in a campaign channel.');
        return;
      }
      await assignVoicesForCampaign(campaign.id);
      await interaction.editReply('Cast voices for unvoiced NPCs in this campaign (check logs for assignments).');
      return;
    }

    if (sub === 'status') {
      const connected = interaction.guildId ? voiceManager.isConnected(interaction.guildId) : false;
      const voices = await getEnglishVoices().catch(() => []);
      await interaction.reply({
        content: [
          `Enabled: **${config.voice.enabled}**`,
          `Speak mode: **${config.voice.speakMode}**`,
          `TTS model: **${config.voice.ttsModelId}**`,
          `NPC model (emotions): **${config.voice.npcTtsModelId}**`,
          `Emotional delivery: **${config.voice.emotionsEnabled ? 'on' : 'off'}**`,
          `Ambience beds: **${config.voice.ambienceEnabled ? 'on' : 'off'}** (vol ${config.voice.ambienceVolume})`,
          `English voices in pool: **${voices.length}**`,
          `Narrator voice: \`${getNarratorVoiceId()}\``,
          `In voice channel: **${connected ? 'yes' : 'no'}**`,
        ].join('\n'),
        ephemeral: true,
      });
    }
  },
};
