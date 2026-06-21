import { prisma } from '../../db/client.js';
import { toJson, parseJson } from '../../utils/helpers.js';
import type { MemoryExtractorOutput } from '../../validation/schemas.js';
import { createNpcWithVoice } from '../../voice/npc-voice-service.js';

export async function applyMemoryExtraction(
  campaignId: string,
  extraction: MemoryExtractorOutput,
): Promise<void> {
  for (const fact of extraction.new_public_facts) {
    await prisma.memoryEntry.create({
      data: { campaignId, category: 'public', content: fact, importance: extraction.importance },
    });
  }

  for (const fact of extraction.new_hidden_facts) {
    await prisma.memoryEntry.create({
      data: { campaignId, category: 'hidden', content: fact, importance: extraction.importance },
    });
  }

  if (extraction.session_summary_update) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sessionSummary: extraction.session_summary_update },
    });
  }

  if (extraction.open_threads_added.length > 0 || extraction.open_threads_resolved.length > 0) {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    let open = parseJson<string[]>(campaign.openThreads, []);
    let resolved = parseJson<string[]>(campaign.resolvedThreads, []);

    for (const thread of extraction.open_threads_added) {
      if (!open.includes(thread)) open.push(thread);
    }
    for (const thread of extraction.open_threads_resolved) {
      open = open.filter((t) => t !== thread);
      if (!resolved.includes(thread)) resolved.push(thread);
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { openThreads: toJson(open), resolvedThreads: toJson(resolved) },
    });
  }

  for (const update of extraction.location_updates) {
    const locationId = update.location_id as string | undefined;
    if (!locationId) continue;
    const changes = update.current_changes as string | undefined;
    if (changes) {
      await prisma.location.update({
        where: { id: locationId },
        data: { currentChanges: changes, updatedAt: new Date() },
      });
    }
  }

  for (const update of extraction.quest_updates) {
    const questId = update.quest_id as string | undefined;
    const status = update.status as string | undefined;
    if (questId && status) {
      await prisma.quest.update({ where: { id: questId }, data: { status } });
    }
  }

  for (const update of extraction.npc_updates) {
    const name = typeof update.name === 'string' ? update.name.trim() : '';
    if (!name) continue;

    const existing = await prisma.nPC.findFirst({ where: { campaignId, name } });
    if (existing) {
      await prisma.nPC.update({
        where: { id: existing.id },
        data: {
          description: typeof update.description === 'string' ? update.description : undefined,
          attitude: typeof update.attitude === 'string' ? update.attitude : undefined,
          goals: typeof update.goals === 'string' ? update.goals : undefined,
          locationId:
            typeof update.location_id === 'string'
              ? update.location_id
              : typeof update.locationId === 'string'
                ? update.locationId
                : undefined,
        },
      });
      continue;
    }

    const create =
      update.create === true ||
      update.action === 'create' ||
      typeof update.description === 'string';
    if (!create) continue;

    await createNpcWithVoice(campaignId, {
      name,
      description: typeof update.description === 'string' ? update.description : '',
      attitude: typeof update.attitude === 'string' ? update.attitude : 'neutral',
      goals: typeof update.goals === 'string' ? update.goals : '',
      visualDescription:
        typeof update.visual_description === 'string'
          ? update.visual_description
          : typeof update.visualDescription === 'string'
            ? update.visualDescription
            : '',
      locationId:
        typeof update.location_id === 'string'
          ? update.location_id
          : typeof update.locationId === 'string'
            ? update.locationId
            : null,
    });
  }
}
