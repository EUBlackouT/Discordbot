import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { AmbienceContext } from './ambience-context.js';
import { resolveAmbienceSpec } from './ambience-resolver.js';
import { resolveLibraryBed } from './audio-library.js';
import { createElevenLabsClient } from './elevenlabs-client.js';

interface AmbienceCacheMeta {
  prompt: string;
  label: string;
  locationId?: string;
  locationName?: string;
}

function cacheDir(campaignId: string): string {
  return join(config.voice.ambienceDir, campaignId);
}

function cachePaths(campaignId: string, cacheKey: string): { mp3: string; meta: string } {
  const dir = cacheDir(campaignId);
  return {
    mp3: join(dir, `${cacheKey}.mp3`),
    meta: join(dir, `${cacheKey}.json`),
  };
}

function cacheKeyFor(ctx: AmbienceContext, combatActive?: boolean): string {
  const spec = resolveAmbienceSpec({ ...ctx, combatActive: combatActive ?? ctx.combatActive });
  return createHash('sha256')
    .update(`${spec.label}:${spec.prompt}:${(combatActive ?? ctx.combatActive) ? 'combat' : 'peace'}`)
    .digest('hex')
    .slice(0, 16);
}

/** Stable key for the ambience bed — changes when location, mood, or combat shifts. */
export function ambienceCacheKey(ctx: AmbienceContext): string {
  return cacheKeyFor(ctx, Boolean(ctx.combatActive));
}

export function ambienceLabel(ctx: AmbienceContext): string {
  return resolveAmbienceSpec(ctx).label;
}

/** Generate or load a loopable ambience bed for this location/scene. */
export async function ensureAmbienceLoop(
  campaignId: string,
  ctx: AmbienceContext,
): Promise<string | null> {
  if (!config.voice.ambienceEnabled) return null;
  if (!ctx.locationId) return null;

  const client = createElevenLabsClient();
  if (!client) return null;

  const spec = resolveAmbienceSpec(ctx);
  const key = cacheKeyFor(ctx, Boolean(ctx.combatActive));

  if (config.voice.preferAudioLibrary) {
    const libraryBed = await resolveLibraryBed(spec.label);
    if (libraryBed) return libraryBed;
  }

  const paths = cachePaths(campaignId, key);

  try {
    await access(paths.mp3);
    return paths.mp3;
  } catch {
    // cache miss — generate below
  }

  await mkdir(cacheDir(campaignId), { recursive: true });

  try {
    logger.info(`Generating ambience [${spec.label}] for ${ctx.locationName ?? ctx.locationId}`);
    const buf = await client.generateSoundEffect(spec.prompt, spec.durationSeconds, true);
    await writeFile(paths.mp3, buf);
    const meta: AmbienceCacheMeta = {
      prompt: spec.prompt,
      label: spec.label,
      locationId: ctx.locationId,
      locationName: ctx.locationName,
    };
    await writeFile(paths.meta, JSON.stringify(meta), 'utf8');
    return paths.mp3;
  } catch (err) {
    logger.warn('Ambience generation failed', err);
    return null;
  }
}

/** Pre-generate ambience when entering a location (non-blocking). */
export function warmAmbienceForLocation(campaignId: string, ctx: AmbienceContext | undefined): void {
  if (!ctx?.locationId || !config.voice.ambienceEnabled) return;
  void ensureAmbienceLoop(campaignId, ctx).catch((err) => {
    logger.warn('Ambience warm failed', err);
  });
}

export async function readAmbienceMeta(campaignId: string, cacheKey: string): Promise<AmbienceCacheMeta | null> {
  try {
    const raw = await readFile(cachePaths(campaignId, cacheKey).meta, 'utf8');
    return JSON.parse(raw) as AmbienceCacheMeta;
  } catch {
    return null;
  }
}
