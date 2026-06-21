import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import type { CampaignPanel } from '../campaign/campaign-panels.js';
import type { CampaignTurnResult } from '../core/campaign-loop.js';

const CHRONICLER_COLOR = 0x1a0a2e;
const PLAYER_COLOR = 0x2d6a4f;
const PANEL_COLORS = {
  location: 0x1a4d2e,
  recap: 0x4a0080,
  quest: 0x8b4513,
  npc: 0x5c4033,
  party: 0x2d1b4e,
  default: 0x2d1b4e,
} as const;

export interface PlayerTurnContext {
  displayName: string;
  characterName: string;
  characterId: string;
  action: string;
  portraitPath?: string;
}

export interface CampaignReplyPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files: AttachmentBuilder[];
}

export function isRenderableImagePath(path?: string | null): path is string {
  return Boolean(path && /\.(png|jpe?g|webp)$/i.test(path));
}

export function structureNarration(narration: string): { lead: string; beats: string[] } {
  const paragraphs = narration
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    return { lead: narration.trim(), beats: [] };
  }

  return { lead: paragraphs[0], beats: paragraphs.slice(1) };
}

function panelColor(panel: CampaignPanel): number {
  const title = panel.title ?? '';
  if (title.includes('📍')) return PANEL_COLORS.location;
  if (title.includes('📖')) return PANEL_COLORS.recap;
  if (title.includes('📜')) return PANEL_COLORS.quest;
  if (title.includes('🎭')) return PANEL_COLORS.npc;
  if (title.includes('⚔️')) return PANEL_COLORS.party;
  return panel.color ?? PANEL_COLORS.default;
}

function panelToEmbed(panel: CampaignPanel, sceneImageName?: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setDescription(panel.description)
    .setColor(panelColor(panel));
  if (panel.title) embed.setTitle(panel.title);
  if (panel.fields?.length) embed.addFields(panel.fields);
  if (panel.footer) embed.setFooter({ text: panel.footer });
  if (sceneImageName) {
    embed.setImage(`attachment://${sceneImageName}`);
  } else if (panel.imageUrl) {
    embed.setImage(panel.imageUrl);
  }
  return embed;
}

function buildPlayerEmbed(
  player: PlayerTurnContext,
  portraitAttachmentName?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setAuthor({ name: player.characterName })
    .setDescription(player.action)
    .setColor(PLAYER_COLOR)
    .setFooter({ text: player.displayName });

  if (portraitAttachmentName) {
    embed.setThumbnail(`attachment://${portraitAttachmentName}`);
  }

  return embed;
}

const NPC_COLOR = 0x5c4033;

function buildStoryEmbed(
  narration: string,
  options: {
    pendingCheck?: boolean;
    checkPrompt?: { skill?: string | null; ability: string; dc: number };
    rollSummary?: string;
    locationName?: string;
    rollResolved?: boolean;
    speakerName?: string;
    portraitAttachmentName?: string;
    sceneAttachmentName?: string;
    briefReply?: boolean;
    npcSpeaker?: boolean;
    combatStatus?: string;
  },
): EmbedBuilder {
  const { lead, beats } = structureNarration(narration);
  const embed = new EmbedBuilder()
    .setDescription(lead || '…')
    .setColor(
      options.pendingCheck ? 0xff6600 : options.npcSpeaker ? NPC_COLOR : CHRONICLER_COLOR,
    );

  if (options.speakerName) {
    const author: { name: string; iconURL?: string } = { name: options.speakerName };
    if (options.portraitAttachmentName) {
      author.iconURL = `attachment://${options.portraitAttachmentName}`;
    }
    embed.setAuthor(author);
  } else {
    embed.setAuthor({ name: 'Chronicler' });
  }

  if (options.portraitAttachmentName && !options.speakerName) {
    embed.setThumbnail(`attachment://${options.portraitAttachmentName}`);
  } else if (options.portraitAttachmentName && options.npcSpeaker) {
    embed.setThumbnail(`attachment://${options.portraitAttachmentName}`);
  }

  if (options.checkPrompt) {
    const label = options.checkPrompt.skill ?? options.checkPrompt.ability;
    embed.addFields({
      name: '🎲 Check',
      value: `**${label}** · DC **${options.checkPrompt.dc}**`,
    });
  }

  if (options.combatStatus) {
    embed.addFields({ name: '⚔️ Combat', value: options.combatStatus.slice(0, 1024) });
  }

  if (options.rollSummary) {
    embed.addFields({ name: '🎲 Roll', value: options.rollSummary });
  }

  for (const [index, beat] of beats.entries()) {
    if (index >= 4) {
      embed.addFields({ name: '\u200b', value: beat.slice(0, 1024) });
      break;
    }
    embed.addFields({ name: '\u200b', value: beat.slice(0, 1024) });
  }

  const footerParts = [
    options.locationName ? `📍 ${options.locationName}` : null,
    options.pendingCheck
      ? 'Tap Roll when ready'
      : options.combatStatus
        ? 'Your turn — attack, cast a spell, or End Turn'
        : options.rollResolved
          ? 'The dice have spoken'
          : options.briefReply || options.npcSpeaker
            ? null
            : 'What do you do?',
  ].filter(Boolean);

  embed.setFooter({ text: footerParts.join(' · ') });

  if (options.sceneAttachmentName) {
    embed.setImage(`attachment://${options.sceneAttachmentName}`);
  }

  return embed;
}

export function buildCampaignTurnReply(
  result: CampaignTurnResult,
  options: { player?: PlayerTurnContext; portraitPath?: string; suppressPlayerEmbed?: boolean } = {},
): CampaignReplyPayload {
  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];
  let portraitName: string | undefined;
  let npcPortraitName: string | undefined;
  let sceneName: string | undefined;

  const portraitPath = options.portraitPath ?? options.player?.portraitPath;
  if (isRenderableImagePath(portraitPath)) {
    portraitName = `portrait-${options.player?.characterId ?? 'player'}.png`;
    files.push(new AttachmentBuilder(portraitPath, { name: portraitName }));
  }

  if (isRenderableImagePath(result.npcPortraitPath)) {
    npcPortraitName = `npc-portrait-${result.npcSpeaker?.replace(/\s+/g, '-').toLowerCase() ?? 'npc'}.png`;
    files.push(new AttachmentBuilder(result.npcPortraitPath, { name: npcPortraitName }));
  }

  const showPlayerEmbed = options.player && !options.suppressPlayerEmbed;
  if (showPlayerEmbed) {
    const playerCtx =
      result.rollResolved && result.rollPlayerLine
        ? { ...options.player!, action: result.rollPlayerLine }
        : options.player!;
    embeds.push(buildPlayerEmbed(playerCtx, portraitName));
  }

  if (isRenderableImagePath(result.assetPath)) {
    sceneName = 'scene.png';
    files.push(new AttachmentBuilder(result.assetPath, { name: sceneName }));
  }

  embeds.push(
    buildStoryEmbed(result.narration, {
      pendingCheck: result.pendingCheck,
      checkPrompt: result.checkPrompt,
      rollSummary: result.rollSummary,
      locationName: result.locationName,
      rollResolved: result.rollResolved,
      combatStatus: result.combatStatus,
      speakerName: result.npcSpeaker
        ? result.npcSpeaker
        : options.suppressPlayerEmbed
          ? options.player?.characterName
          : undefined,
      portraitAttachmentName: options.suppressPlayerEmbed && !result.npcSpeaker ? portraitName : result.npcSpeaker ? npcPortraitName : undefined,
      sceneAttachmentName: sceneName,
      briefReply: result.briefReply,
      npcSpeaker: Boolean(result.npcSpeaker),
    }),
  );

  const panels = result.panels ?? [];
  for (const panel of panels) {
    embeds.push(panelToEmbed(panel));
  }

  const components: ActionRowBuilder<ButtonBuilder>[] = [];
  if (result.pendingCheck) {
    components.push(buildCheckRollRow());
  } else if (result.combatActive) {
    components.push(buildCombatActionRow());
  }

  return { embeds: embeds.slice(0, 10), components, files };
}

export function buildCombatActionRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('combat_end_turn').setLabel('End Turn').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
  );
}

export function buildCheckRollRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('roll_check').setLabel('Roll').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
  );
}
