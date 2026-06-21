import { readChronicle, parsePlotDirectorFromChronicle } from './campaign-chronicle.js';
import { writePlotThreadsToChronicle } from './plot-chronicle-write.js';
import type { PlotThread } from '../../validation/schemas.js';
import { v4 as uuidv4 } from 'uuid';

function extractSection(chronicle: string, heading: string): string {
  const pattern = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = chronicle.match(pattern);
  return match?.[1]?.trim() ?? '';
}

/** Seed a generic progression beat when memory extraction has not yet populated beats. */
export function seedProgressionBeat(
  chronicle: string,
  activeQuest?: { title: string; description: string } | null,
): PlotThread {
  const situation = extractSection(chronicle, 'Current Situation').slice(0, 240);
  const title = activeQuest?.title ?? 'Resolve the opening crisis';
  const summary =
    situation ||
    activeQuest?.description ||
    'The party must move past the immediate danger and learn what happens next.';

  return {
    id: uuidv4(),
    title,
    summary,
    campaign_tie: activeQuest?.description ?? 'Advances the main campaign once the immediate scene resolves.',
    stakes: 'Staying stuck repeats the same danger without new leads.',
    status: 'active',
    momentum: 15,
    possible_endings: [
      {
        id: 'break-out',
        summary: 'The party reaches safety and gains a foothold to investigate.',
        trigger_hint: 'Player commits to escape or follow-through repeatedly.',
        campaign_advance: 'Opens the next investigation beat in the main campaign.',
      },
      {
        id: 'cornered',
        summary: 'Pursuers close in before the party fully escapes.',
        trigger_hint: 'Failed checks or delay while repeating the same action.',
        campaign_advance: 'Raises stakes and forces a new approach to the main mystery.',
      },
    ],
    controller_guidance:
      'When the player repeats escape or follow actions, change geography or close the micro-beat — never restage identical peril.',
  };
}

/**
 * Bump plot momentum synchronously so the controller sees pressure on the SAME turn.
 * Returns updated threads (also written to chronicle).
 */
export async function syncBumpPlotMomentum(
  campaignId: string,
  amount: number,
  opts?: { activeQuest?: { title: string; description: string } | null; threadIndex?: number },
): Promise<PlotThread[]> {
  const chronicle = await readChronicle(campaignId);
  let { plotThreads } = parsePlotDirectorFromChronicle(chronicle);

  if (plotThreads.length === 0) {
    plotThreads = [seedProgressionBeat(chronicle, opts?.activeQuest)];
  }

  const idx =
    opts?.threadIndex ??
    plotThreads.findIndex((t) => t.status !== 'resolved' && t.status !== 'ready_to_resolve');
  const target = idx >= 0 ? idx : 0;
  const thread = plotThreads[target];
  if (!thread || thread.status === 'resolved') return plotThreads;

  const nextMomentum = Math.min(100, thread.momentum + amount);
  const updated: PlotThread = {
    ...thread,
    momentum: nextMomentum,
    status: nextMomentum >= 70 ? 'ready_to_resolve' : thread.status,
  };

  const next = [...plotThreads];
  next[target] = updated;
  await writePlotThreadsToChronicle(campaignId, next);
  return next;
}
