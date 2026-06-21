import { AttachmentBuilder, MessageFlags } from 'discord.js';
import type { CommandHandler } from '../index.js';
import {
  startCampaign,
  getCampaignByChannel,
  buildStatePacket,
  getCampaignRecap,
  resetCampaign,
} from '../../../campaign/state.js';
import { prisma } from '../../../db/client.js';
import { parseJson } from '../../../utils/helpers.js';
import { assetManager } from '../../../core/campaign-loop.js';
import { ensureGuild } from '../../../tenant/guild-service.js';
import { autoJoinStarter, joinCampaign, leaveCampaign, listCampaignParty } from '../../../tenant/campaign-member.js';
import { canManageCampaign, requireGuild } from '../../../tenant/permissions.js';
import { buildCampaignOpeningPayload } from '../../onboarding.js';
import { buildOpeningSceneContent } from '../../../campaign/intro.js';
import { config } from '../../../config/index.js';
import { logger } from '../../../utils/logger.js';
import { prepareCampaignOpeningVoice, playCampaignOpeningVoice } from '../../../voice/opening-voice.js';
import { isBakedIntroReady } from '../../../voice/baked-intro.js';
import { voiceManager } from '../../../voice/voice-manager.js';
import { formatPlotThreadsForPlayers } from '../../../dm/plot/plot-director.js';

const OPENING_VOICE_PREP_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        logger.warn(`${label} timed out after ${ms}ms`);
        resolve(null);
      }, ms);
    }),
  ]);
}

export const startCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const guildErr = requireGuild(interaction);
    if (guildErr) {
      await interaction.reply({ content: guildErr, ephemeral: true });
      return;
    }

    if (!interaction.channelId) return;

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: 'Start the campaign in a server text channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString('name') ?? undefined;

    try {
      await ensureGuild(interaction.guildId!, interaction.guild?.name);
      const result = await startCampaign(interaction.guildId!, interaction.channelId, name);

      await autoJoinStarter(result.campaign.id, interaction.guildId!, interaction.user.id);
      const party = await listCampaignParty(result.campaign.id);

      const opening = buildCampaignOpeningPayload(
        result.campaign.name,
        buildOpeningSceneContent({ partyNames: party.map((m) => m.character.name) }),
        party.length > 0
          ? { party: party.map((m) => ({ characterName: m.character.name })) }
          : undefined,
      );

      const partyContext = { partyNames: party.map((m) => m.character.name) };

      const imagePromise = assetManager
        .generateOpeningSceneImage(result.campaign.id, {
          id: result.location.id,
          name: result.location.name,
          visualDescription: result.location.visualDescription,
          mood: result.location.mood,
        })
        .catch((err) => {
          logger.warn('Opening scene image failed', err);
          return null;
        });

      // Hold opening text until narration is rendered so voice starts with the post.
      let openingVoice = null;
      if (interaction.guildId && config.voice.enabled && voiceManager.isConnected(interaction.guildId)) {
        const bakedReady = await isBakedIntroReady();
        if (!bakedReady) {
          await interaction.editReply({
            content: 'Preparing opening narration (this can take up to a minute)…',
          });
        }
        openingVoice = await withTimeout(
          prepareCampaignOpeningVoice(
            interaction.guildId,
            result.campaign.id,
            result.location,
            partyContext,
          ),
          OPENING_VOICE_PREP_MS,
          'Opening voice prepare',
        ).catch((err) => {
          logger.warn('Opening voice prepare failed', err);
          return null;
        });
      }

      await channel.send({
        embeds: opening.embeds,
        components: opening.components,
        files: opening.files,
      });

      if (openingVoice && interaction.guildId) {
        playCampaignOpeningVoice(interaction.guildId, openingVoice);
      }

      void imagePromise.then(async (sceneAsset) => {
        if (!sceneAsset?.localPath?.match(/\.(png|jpg|jpeg|webp)$/i)) return;
        await channel.send({
          content: `_${result.location.name}_`,
          files: [new AttachmentBuilder(sceneAsset.localPath, { name: 'scene.png' })],
        });
      });

      const voiceHint =
        config.voice.enabled && interaction.guildId
          ? voiceManager.isConnected(interaction.guildId)
            ? ' The opening is being read aloud in voice.'
            : ' Join a voice channel and run `/voice join` before starting next time to hear the prologue.'
          : '';

      await interaction.editReply({
        content: `✅ **${result.campaign.name}** has begun in ${channel}. The opening scene is posted above for everyone.${voiceHint}`,
      });
    } catch (err) {
      await interaction.editReply({ content: `Error: ${(err as Error).message}` });
    }
  },
};

export const recapCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign in this channel.', ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const recap = await getCampaignRecap(campaign.id);
    await interaction.editReply(recap);
  },
};

export const stateCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const state = await buildStatePacket(campaign.id);
    const summary = [
      `**${state.campaign.name}** — Danger ${state.campaign.dangerLevel}/10`,
      state.location ? `📍 ${state.location.name}` : '',
      state.scene ? `🎬 ${state.scene.name}` : '',
      state.activeQuest ? `📜 ${state.activeQuest.title}` : '',
      `Open threads: ${state.campaign.openThreads.join('; ') || 'None'}`,
    ]
      .filter(Boolean)
      .join('\n');
    await interaction.editReply(summary);
  },
};

export const memoryCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign.', ephemeral: true });
      return;
    }
    const memories = await prisma.memoryEntry.findMany({
      where: { campaignId: campaign.id, category: 'public', isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    const text = memories.map((m) => `• ${m.content}`).join('\n') || 'No memories yet.';
    await interaction.reply({ content: `**Campaign Memory:**\n${text}`, ephemeral: true });
  },
};

export const questsCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign.', ephemeral: true });
      return;
    }
    const quests = await prisma.quest.findMany({ where: { campaignId: campaign.id, status: 'active' } });
    const text = quests
      .map((q) => {
        const objs = parseJson<string[]>(q.objectives, []);
        return `**${q.title}**\n${q.description}\nObjectives: ${objs.join('; ')}`;
      })
      .join('\n\n') || 'No active quests.';
    await interaction.reply({ content: text });
  },
};

export const npcsCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign.', ephemeral: true });
      return;
    }
    const npcs = await prisma.nPC.findMany({ where: { campaignId: campaign.id, isActive: true } });
    const text =
      npcs.map((n) => `**${n.name}** (${n.attitude}) — ${n.description}`).join('\n') || 'No known NPCs.';
    await interaction.reply({ content: text });
  },
};

export const locationCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign.', ephemeral: true });
      return;
    }
    const state = await buildStatePacket(campaign.id);
    if (!state.location) {
      await interaction.reply({ content: 'No current location set.' });
      return;
    }
    const loc = state.location;
    await interaction.reply({
      content: `**${loc.name}**\n${loc.description}\n\n_${loc.visualDescription}_\n\nMood: ${loc.mood}`,
    });
  },
};

export const joinCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const guildErr = requireGuild(interaction);
    if (guildErr) {
      await interaction.reply({ content: guildErr, ephemeral: true });
      return;
    }

    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No campaign in this channel. An admin runs `/campaign start` first.', ephemeral: true });
      return;
    }

    const characterName = interaction.options.getString('character', true);
    await interaction.deferReply({ ephemeral: true });

    try {
      await ensureGuild(interaction.guildId!, interaction.guild?.name);
      const { character } = await joinCampaign(
        campaign.id,
        interaction.guildId!,
        interaction.user.id,
        characterName,
        interaction.user.displayName ?? interaction.user.username,
      );
      await interaction.editReply(
        `✅ **${character.name}** has joined **${campaign.name}**!\n\n` +
          '**You\'re in.** Scroll up for the opening scene (if the campaign already started), then **type what your character does** in this channel.',
      );
    } catch (err) {
      await interaction.editReply(`Error: ${(err as Error).message}`);
    }
  },
};

export const partyCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign in this channel.', ephemeral: true });
      return;
    }

    const party = await listCampaignParty(campaign.id);
    if (party.length === 0) {
      await interaction.reply({
        content: 'No players have joined yet. Use `/character create` then `/campaign join character:YourName`.',
      });
      return;
    }

    const lines = party.map(
      (m, i) => `${i + 1}. **${m.character.name}** — ${m.character.race} ${m.character.className} (<@${m.discordId}>)`,
    );
    await interaction.reply(`**Party — ${campaign.name}**\n${lines.join('\n')}`);
  },
};

export const threadsCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign in this channel.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const state = await buildStatePacket(campaign.id);
    const text = formatPlotThreadsForPlayers(state.campaign.plotThreads, {
      campaignThroughline: state.campaign.campaignThroughline,
      primaryQuest: state.activeQuest,
    });
    await interaction.editReply(text.slice(0, 2000));
  },
};

export const leaveCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.reply({ content: 'No active campaign in this channel.', ephemeral: true });
      return;
    }

    try {
      await leaveCampaign(campaign.id, interaction.user.id);
      await interaction.reply({ content: 'You left the campaign. Your character is available for other campaigns.', ephemeral: true });
    } catch (err) {
      await interaction.reply({ content: (err as Error).message, ephemeral: true });
    }
  },
};

export const resetCmd = {
  execute: async (interaction: Parameters<CommandHandler['execute']>[0]) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const confirm = interaction.options.getBoolean('confirm', true);
    const campaign = interaction.channelId ? await getCampaignByChannel(interaction.channelId) : null;
    if (!campaign) {
      await interaction.editReply({ content: 'No active campaign.' });
      return;
    }
    if (!(await canManageCampaign(interaction))) {
      await interaction.editReply({ content: 'Only server admins can reset a campaign.' });
      return;
    }
    if (!confirm) {
      await interaction.editReply({ content: 'Reset cancelled.' });
      return;
    }
    await resetCampaign(campaign.id);
    await interaction.editReply({ content: 'Campaign has been reset.' });
  },
};
