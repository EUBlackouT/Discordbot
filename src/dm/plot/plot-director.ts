import type { PlotThread } from '../../validation/schemas.js';

export interface PlotDirectorContext {
  campaignThroughline?: string;
  primaryQuest?: { title: string; description: string } | null;
}

function mainCampaignLine(context?: PlotDirectorContext): string {
  const line =
    context?.campaignThroughline?.trim() ||
    context?.primaryQuest?.title ||
    'Infer the main campaign from chronicle, active quest, and session summary.';
  const questDetail = context?.primaryQuest?.description
    ? `\n  Quest context: ${context.primaryQuest.description}`
    : '';
  return `MAIN CAMPAIGN (always stay anchored here):\n  ${line}${questDetail}\n  Plot threads below are **progression beats inside this campaign** — closing a beat advances the main story; it is NOT the end of the campaign.`;
}

/** Summarize plot threads for the controller — in-campaign beats that can close and feed forward. */
export function formatPlotThreadsForController(
  threads: PlotThread[],
  context?: PlotDirectorContext,
): string {
  const header = mainCampaignLine(context);
  const active = threads.filter((t) => t.status !== 'resolved');

  if (active.length === 0) {
    return `${header}\n\nNo active progression beats tracked yet — identify pursuits/mysteries from play that serve the main campaign, each with 2–4 ways the beat can **close** and hand off to the next chapter.`;
  }

  const body = active
    .map((thread) => {
      const resolutions =
        thread.possible_endings.length > 0
          ? thread.possible_endings
              .map((e) => {
                const advance = e.campaign_advance
                  ? ` → main campaign: ${e.campaign_advance}`
                  : '';
                return `  • ${e.summary} (when: ${e.trigger_hint})${advance}`;
              })
              .join('\n')
          : '  • (define 2–4 ways this beat can close and what each hands to the main campaign)';

      const pressure =
        thread.momentum >= 70
          ? 'HIGH — close this beat or pivot hard; do not loop the same chase/search'
          : thread.momentum >= 40
            ? 'RISING — show progress, complication, or partial answer toward a closure'
            : 'LOW — plant clues or advance naturally within the main campaign';

      return [
        `[${thread.status}|momentum ${thread.momentum}|${pressure}] ${thread.title}`,
        `  ${thread.summary}`,
        thread.campaign_tie ? `  Serves main campaign: ${thread.campaign_tie}` : '',
        thread.stakes ? `  Stakes if unresolved: ${thread.stakes}` : '',
        thread.controller_guidance ? `  Guidance: ${thread.controller_guidance}` : '',
        `  Ways this beat can close (pick one when pressure is high):\n${resolutions}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return `${header}\n\n--- PROGRESSION BEATS ---\n${body}`;
}

/** Player/DM-facing summary for /campaign threads */
export function formatPlotThreadsForPlayers(
  threads: PlotThread[],
  context?: PlotDirectorContext,
): string {
  const throughline =
    context?.campaignThroughline?.trim() ||
    context?.primaryQuest?.title ||
    'The main campaign is still taking shape.';

  const active = threads.filter((t) => t.status !== 'resolved');
  if (active.length === 0) {
    return `**Main campaign:** ${throughline}\n\n_No active progression beats tracked yet — they appear as pursuits and mysteries unfold._`;
  }

  const beats = active
    .map((thread) => {
      const bar = '▓'.repeat(Math.round(thread.momentum / 10)) + '░'.repeat(10 - Math.round(thread.momentum / 10));
      const endings =
        thread.possible_endings.length > 0
          ? thread.possible_endings.map((e) => `    ◦ ${e.summary}`).join('\n')
          : '    ◦ (open — could go several ways)';

      return [
        `**${thread.title}** [${bar}] ${thread.momentum}%`,
        thread.campaign_tie ? `_Serves campaign:_ ${thread.campaign_tie}` : '',
        thread.summary,
        thread.stakes ? `_At stake:_ ${thread.stakes}` : '',
        `Could close as:\n${endings}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return `**Main campaign:** ${throughline}\n\n**Active beats** _(each closes and feeds the main story — not a campaign finale)_\n\n${beats}`;
}

export function plotThreadsNeedingResolution(threads: PlotThread[]): PlotThread[] {
  return threads.filter(
    (t) => t.status === 'ready_to_resolve' || (t.status === 'active' && t.momentum >= 70),
  );
}
