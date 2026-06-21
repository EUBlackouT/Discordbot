import { prisma } from '../../db/client.js';
import type { CampaignStatePacket } from '../../campaign/state.js';
import { listCampaignParty } from '../../tenant/campaign-member.js';
import { logger } from '../../utils/logger.js';
import { createNpcWithVoice } from '../../voice/npc-voice-service.js';
import { warmAmbienceForLocation } from '../../voice/ambience-cache.js';
import { buildAmbienceContext } from '../../voice/ambience-context.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function applyControllerStateUpdates(
  campaignId: string,
  updates: Record<string, unknown>[],
  context: CampaignStatePacket,
): Promise<void> {
  for (const raw of updates) {
    try {
      await applyOneUpdate(campaignId, raw, context);
    } catch (err) {
      logger.warn('Controller state update failed', { update: raw, err });
    }
  }
}

async function applyOneUpdate(
  campaignId: string,
  raw: Record<string, unknown>,
  context: CampaignStatePacket,
): Promise<void> {
  const type = asString(raw.type) ?? inferUpdateType(raw);

  if (type === 'travel_to_location' || type === 'move_to_location') {
    const name = asString(raw.name);
    if (!name) return;

    const slug = asString(raw.slug) ?? slugify(name);
    const location = await prisma.location.upsert({
      where: { campaignId_slug: { campaignId, slug } },
      create: {
        campaignId,
        name,
        slug,
        description: asString(raw.description) ?? `The party reaches ${name}.`,
        visualDescription: asString(raw.visual_description) ?? asString(raw.visualDescription) ?? '',
        mood: asString(raw.mood) ?? '',
        currentChanges: asString(raw.current_changes) ?? asString(raw.currentChanges) ?? '',
        visitCount: 1,
      },
      update: {
        name,
        description: asString(raw.description) ?? undefined,
        visualDescription: asString(raw.visual_description) ?? asString(raw.visualDescription) ?? undefined,
        mood: asString(raw.mood) ?? undefined,
        currentChanges: asString(raw.current_changes) ?? asString(raw.currentChanges) ?? undefined,
        visitCount: { increment: 1 },
      },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { currentLocationId: location.id },
    });

    const party = await listCampaignParty(campaignId);
    if (party.length > 0) {
      await prisma.character.updateMany({
        where: { id: { in: party.map((m) => m.characterId) } },
        data: { currentLocationId: location.id },
      });
    }

    warmAmbienceForLocation(
      campaignId,
      buildAmbienceContext(
        {
          location: {
            id: location.id,
            name: location.name,
            slug: location.slug,
            description: location.description,
            visualDescription: location.visualDescription,
            mood: location.mood,
            currentChanges: location.currentChanges,
          },
          scene: context.scene,
          combat: context.combat,
        },
        location.slug,
        Boolean(context.combat),
      ),
    );
    return;
  }

  if (type === 'set_character_location' || type === 'move_character') {
    const characterId =
      asString(raw.character_id) ?? asString(raw.characterId) ?? asString(raw.target_character_id);
    const locationId =
      asString(raw.location_id) ?? asString(raw.locationId) ?? context.location?.id;
    const slug = asString(raw.slug);
    const name = asString(raw.name);

    let resolvedLocationId = locationId;
    if (!resolvedLocationId && (slug || name)) {
      const loc = await prisma.location.findFirst({
        where: {
          campaignId,
          ...(slug ? { slug } : { name: name! }),
        },
      });
      resolvedLocationId = loc?.id;
    }

    if (!characterId || !resolvedLocationId) return;

    await prisma.character.update({
      where: { id: characterId },
      data: { currentLocationId: resolvedLocationId },
    });
    return;
  }

  if (type === 'set_location_changes' || type === 'location_changes') {
    const locationId =
      asString(raw.location_id) ?? asString(raw.locationId) ?? context.location?.id;
    const changes = asString(raw.current_changes) ?? asString(raw.currentChanges);
    if (!locationId || !changes) return;

    await prisma.location.update({
      where: { id: locationId },
      data: { currentChanges: changes },
    });
    return;
  }

  if (type === 'update_scene' || type === 'set_scene') {
    const sceneId = context.campaign.currentSceneId;
    if (!sceneId) return;

    await prisma.scene.update({
      where: { id: sceneId },
      data: {
        name: asString(raw.name) ?? undefined,
        description: asString(raw.description) ?? undefined,
        mood: asString(raw.mood) ?? undefined,
      },
    });
    return;
  }

  if (type === 'update_session_summary' || type === 'session_summary') {
    const summary = asString(raw.summary) ?? asString(raw.session_summary);
    if (!summary) return;

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { sessionSummary: summary },
    });
    return;
  }

  if (type === 'create_npc' || type === 'introduce_npc' || type === 'add_npc') {
    const name = asString(raw.name);
    if (!name) return;

    const existing = await prisma.nPC.findFirst({ where: { campaignId, name } });
    if (existing) return;

    const locationId =
      asString(raw.location_id) ??
      asString(raw.locationId) ??
      context.location?.id ??
      context.campaign.currentLocationId ??
      undefined;

    await createNpcWithVoice(campaignId, {
      name,
      description: asString(raw.description) ?? '',
      visualDescription: asString(raw.visual_description) ?? asString(raw.visualDescription) ?? '',
      goals: asString(raw.goals) ?? '',
      secrets: asString(raw.secrets) ?? '',
      attitude: asString(raw.attitude) ?? 'neutral',
      locationId: locationId ?? null,
    });
    return;
  }

  if (type === 'update_npc') {
    const name = asString(raw.name);
    if (!name) return;

    const npc = await prisma.nPC.findFirst({ where: { campaignId, name } });
    if (!npc) return;

    const locationId =
      asString(raw.location_id) ?? asString(raw.locationId) ?? undefined;

    await prisma.nPC.update({
      where: { id: npc.id },
      data: {
        description: asString(raw.description) ?? undefined,
        visualDescription: asString(raw.visual_description) ?? asString(raw.visualDescription) ?? undefined,
        goals: asString(raw.goals) ?? undefined,
        secrets: asString(raw.secrets) ?? undefined,
        attitude: asString(raw.attitude) ?? undefined,
        locationId: locationId ?? undefined,
        isActive: typeof raw.is_active === 'boolean' ? raw.is_active : undefined,
      },
    });
  }
}

function inferUpdateType(raw: Record<string, unknown>): string | undefined {
  if (raw.slug || (raw.name && (raw.description || raw.visual_description))) {
    return 'travel_to_location';
  }
  if (raw.current_changes || raw.currentChanges) return 'set_location_changes';
  if (raw.summary || raw.session_summary) return 'update_session_summary';
  if (raw.scene_id || raw.mood || raw.description) return 'update_scene';
  return undefined;
}

export { slugify };
