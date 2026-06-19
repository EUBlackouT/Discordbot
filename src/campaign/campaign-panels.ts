import type { CampaignStatePacket } from './state.js';
import { getCampaignRecap } from './state.js';
import { prisma } from '../db/client.js';
import { parseJson } from '../utils/helpers.js';
import { listCampaignParty } from '../tenant/campaign-member.js';

/** Discord-agnostic embed payload — built into EmbedBuilder in the bot layer. */
export interface CampaignPanel {
  title?: string;
  description: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: string;
  imageUrl?: string;
}

export async function buildRecapPanel(campaignId: string): Promise<CampaignPanel> {
  const recap = await getCampaignRecap(campaignId);
  return {
    title: '📖 Campaign Recap',
    description: recap.slice(0, 4000),
    color: 0x4a0080,
    footer: 'Ask anything in chat — no commands needed.',
  };
}

export function buildLocationPanel(state: CampaignStatePacket): CampaignPanel {
  const loc = state.location;
  if (!loc) {
    return {
      title: '📍 Location',
      description: 'The scene shifts — no fixed location is set yet.',
      color: 0x2d1b4e,
    };
  }

  const fields = [
    { name: 'Mood', value: loc.mood, inline: true },
    ...(state.scene ? [{ name: 'Scene', value: state.scene.name, inline: true }] : []),
  ];

  return {
    title: `📍 ${loc.name}`,
    description: `${loc.description}\n\n*${loc.visualDescription}*`,
    color: 0x1a4d2e,
    fields,
    footer: loc.currentChanges ? `Recent changes: ${loc.currentChanges}` : undefined,
  };
}

export async function buildQuestsPanel(campaignId: string): Promise<CampaignPanel> {
  const quests = await prisma.quest.findMany({ where: { campaignId, status: 'active' } });
  if (quests.length === 0) {
    return {
      title: '📜 Quests',
      description: 'No active quests on the ledger — the path ahead is unwritten.',
      color: 0x8b4513,
    };
  }

  const description = quests
    .map((q) => {
      const objs = parseJson<string[]>(q.objectives, []);
      return `**${q.title}**\n${q.description}\n_Objectives:_ ${objs.join(' · ') || '—'}`;
    })
    .join('\n\n');

  return { title: '📜 Active Quests', description: description.slice(0, 4000), color: 0x8b4513 };
}

export function buildNpcsPanel(state: CampaignStatePacket): CampaignPanel {
  if (state.activeNpcs.length === 0) {
    return {
      title: '🎭 Known Faces',
      description: 'No one noteworthy has crossed your path yet.',
      color: 0x5c4033,
    };
  }

  const description = state.activeNpcs
    .map((n) => `**${n.name}** (${n.attitude})\n${n.description}`)
    .join('\n\n');

  return { title: '🎭 Known NPCs', description: description.slice(0, 4000), color: 0x5c4033 };
}

export async function buildPartyPanel(campaignId: string, campaignName: string): Promise<CampaignPanel> {
  const party = await listCampaignParty(campaignId);
  if (party.length === 0) {
    return {
      title: '⚔️ Party',
      description: 'The adventuring company has not yet assembled.',
      color: 0x2d1b4e,
    };
  }

  const lines = party.map(
    (m, i) =>
      `${i + 1}. **${m.character.name}** — ${m.character.race} ${m.character.className} (<@${m.discordId}>)`,
  );

  return {
    title: `⚔️ Party — ${campaignName}`,
    description: lines.join('\n'),
    color: 0x2d1b4e,
  };
}

export function buildSceneStatusPanel(state: CampaignStatePacket): CampaignPanel {
  const fields = [
    { name: 'Danger', value: `${state.campaign.dangerLevel}/10`, inline: true },
    ...(state.location ? [{ name: 'Location', value: state.location.name, inline: true }] : []),
    ...(state.activeQuest ? [{ name: 'Quest', value: state.activeQuest.title, inline: true }] : []),
    {
      name: 'Open threads',
      value: state.campaign.openThreads.join('; ') || 'None',
      inline: false,
    },
  ];

  return {
    title: state.campaign.name,
    description: state.campaign.sessionSummary || 'The story unfolds...',
    color: 0x4a0080,
    fields,
  };
}

/** Short in-character lead-in for meta panels (no AI call). */
export function metaIntentNarration(intent: NonNullable<import('./player-intent.js').PlayerMetaIntent>): string {
  switch (intent) {
    case 'recap':
      return 'The Chronicler unfurls a worn journal and recounts what has passed...';
    case 'location':
      return 'You take in your surroundings...';
    case 'quests':
      return 'You review the threads of purpose still pulling at the party...';
    case 'npcs':
      return 'Faces from the road rise in your mind...';
    case 'party':
      return 'You glance at your companions...';
    case 'leave':
      return '';
    default:
      return '';
  }
}
