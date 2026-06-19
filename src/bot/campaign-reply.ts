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

function buildChroniclerEmbed(
  narration: string,
  options: {
    pendingCheck?: boolean;
    locationName?: string;
    rollResolved?: boolean;
    speakerName?: string;
    portraitAttachmentName?: string;
    briefReply?: boolean;
  },
): EmbedBuilder {
  const { lead, beats } = structureNarration(narration);
  const embed = new EmbedBuilder()
    .setDescription(lead || '…')
    .setColor(options.pendingCheck ? 0xff6600 : CHRONICLER_COLOR);

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
      : options.rollResolved
        ? 'The dice have spoken'
        : options.briefReply
          ? null
          : 'What do you do?',
  ].filter(Boolean);

  embed.setFooter({ text: footerParts.join(' · ') });
  return embed;
}

export function buildCampaignTurnReply(
  result: CampaignTurnResult,
  options: { player?: PlayerTurnContext; portraitPath?: string; suppressPlayerEmbed?: boolean } = {},
): CampaignReplyPayload {
  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];
  let portraitName: string | undefined;
  let sceneName: string | undefined;

  const portraitPath = options.portraitPath ?? options.player?.portraitPath;
  if (isRenderableImagePath(portraitPath)) {
    portraitName = `portrait-${options.player?.characterId ?? 'player'}.png`;
    files.push(new AttachmentBuilder(portraitPath, { name: portraitName }));
  }

  const showPlayerEmbed = options.player && !options.suppressPlayerEmbed;
  if (showPlayerEmbed) {
    embeds.push(buildPlayerEmbed(options.player!, portraitName));
  }

  embeds.push(
    buildChroniclerEmbed(result.narration, {
      pendingCheck: result.pendingCheck,
      locationName: result.locationName,
      rollResolved: result.rollResolved,
      speakerName: options.suppressPlayerEmbed ? options.player?.characterName : undefined,
      portraitAttachmentName: options.suppressPlayerEmbed ? portraitName : undefined,
      briefReply: result.briefReply,
    }),
  );

  if (isRenderableImagePath(result.assetPath)) {
    sceneName = 'scene.png';
    files.push(new AttachmentBuilder(result.assetPath, { name: sceneName }));
  }

  const panels = result.panels ?? [];
  for (const [index, panel] of panels.entries()) {
    const isLocationPanel = panel.title?.includes('📍');
    const attachSceneHere = Boolean(sceneName && isLocationPanel);
    embeds.push(panelToEmbed(panel, attachSceneHere ? sceneName : undefined));
    if (attachSceneHere) sceneName = undefined;
  }

  if (sceneName && result.assetPath) {
    const sceneEmbed = new EmbedBuilder()
      .setTitle('🖼️ Scene')
      .setColor(CHRONICLER_COLOR)
      .setImage(`attachment://${sceneName}`);
    embeds.push(sceneEmbed);
  }

  const components = result.pendingCheck ? [buildCheckRollRow()] : [];

  return { embeds: embeds.slice(0, 10), components, files };
}

export function buildCheckRollRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('roll_check').setLabel('Roll').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
  );
}
