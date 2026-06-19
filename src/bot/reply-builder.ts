import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { CampaignPanel } from '../campaign/campaign-panels.js';
import { buildCampaignTurnReply } from './campaign-reply.js';

export { buildCheckRollRow } from './campaign-reply.js';
export function panelsToEmbeds(panels: CampaignPanel[]): EmbedBuilder[] {
  return panels.map((p) => {
    const embed = new EmbedBuilder()
      .setDescription(p.description)
      .setColor(p.color ?? 0x2d1b4e);
    if (p.title) embed.setTitle(p.title);
    if (p.fields?.length) embed.addFields(p.fields);
    if (p.footer) embed.setFooter({ text: p.footer });
    if (p.imageUrl) embed.setImage(p.imageUrl);
    return embed;
  });
}

export function buildDmReplyEmbeds(narration: string, panels?: CampaignPanel[], pendingCheck?: boolean): EmbedBuilder[] {
  const payload = buildCampaignTurnReply(
    {
      narration,
      panels,
      pendingCheck,
      controllerAction: 'LEGACY',
    },
    {},
  );
  return payload.embeds;
}

export async function buildSceneAttachment(assetPath: string): Promise<AttachmentBuilder | null> {
  if (!assetPath.endsWith('.png') && !assetPath.endsWith('.jpg') && !assetPath.endsWith('.webp')) {
    return null;
  }
  return new AttachmentBuilder(assetPath);
}
