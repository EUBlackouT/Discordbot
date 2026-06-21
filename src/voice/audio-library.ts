import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface AudioLibraryManifest {
  version: 1;
  outputFormat: string;
  generatedAt: string;
  beds: string[];
  spots: string[];
}

function libraryRoot(): string {
  return config.voice.audioLibraryDir;
}

export function libraryBedPath(archetype: string): string {
  return join(libraryRoot(), 'beds', `${archetype}.mp3`);
}

export function librarySpotPath(cueId: string): string {
  return join(libraryRoot(), 'spots', `${cueId}.mp3`);
}

export async function readAudioLibraryManifest(): Promise<AudioLibraryManifest | null> {
  try {
    const raw = await readFile(join(libraryRoot(), 'manifest.json'), 'utf8');
    return JSON.parse(raw) as AudioLibraryManifest;
  } catch {
    return null;
  }
}

/** Shipped loop bed for an ambience archetype (execution, forest, tavern, …). */
export async function resolveLibraryBed(archetype: string): Promise<string | null> {
  const path = libraryBedPath(archetype);
  try {
    await access(path);
    logger.debug(`Audio library bed: ${archetype}`);
    return path;
  } catch {
    return null;
  }
}

/** Shipped one-shot SFX (bell, retch, gates, …). */
export async function resolveLibrarySpot(cueId: string): Promise<string | null> {
  const path = librarySpotPath(cueId);
  try {
    await access(path);
    return path;
  } catch {
    return null;
  }
}

export async function isAudioLibraryReady(): Promise<boolean> {
  const manifest = await readAudioLibraryManifest();
  if (!manifest) return false;
  if (manifest.outputFormat !== config.voice.audioOutputFormat) return false;
  try {
    await access(libraryBedPath('execution'));
    return true;
  } catch {
    return false;
  }
}
