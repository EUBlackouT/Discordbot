import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createElevenLabsClient, type ElevenVoice } from './elevenlabs-client.js';
import { pickVoiceForNpcProfile } from './voice-cast-profile.js';

export interface RegistryVoice {
  voiceId: string;
  name: string;
  gender?: string;
  age?: string;
  accent?: string;
  description?: string;
  category?: string;
  language?: string;
}

const CACHE_FILE = 'english-voices.json';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Premade ElevenLabs IDs used only when API is unavailable (tests / offline). */
export const OFFLINE_VOICE_POOL: RegistryVoice[] = [
  { voiceId: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', gender: 'male', age: 'middle-aged', accent: 'american' },
  { voiceId: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', age: 'young', accent: 'american' },
  { voiceId: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female', age: 'young', accent: 'english' },
  { voiceId: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', age: 'young', accent: 'american' },
  { voiceId: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male', age: 'old', accent: 'american' },
  { voiceId: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', age: 'middle-aged', accent: 'american' },
  { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', age: 'young', accent: 'american' },
  { voiceId: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', age: 'young', accent: 'american' },
  { voiceId: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', age: 'middle-aged', accent: 'australian' },
  { voiceId: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male', age: 'middle-aged', accent: 'american' },
  { voiceId: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', gender: 'male', age: 'young', accent: 'american' },
  { voiceId: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', age: 'young', accent: 'american' },
  { voiceId: 'bVMeCyTHy58xNoL34h3p', name: 'Jeremy', gender: 'male', age: 'young', accent: 'american' },
  { voiceId: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael', gender: 'male', age: 'old', accent: 'american' },
  { voiceId: 'jsCqWAovK2LkecY7zXl4', name: 'Freya', gender: 'female', age: 'young', accent: 'american' },
];

function cachePath(): string {
  return join(config.voice.tempDir, CACHE_FILE);
}

function toRegistryVoice(v: ElevenVoice): RegistryVoice {
  const labels = v.labels ?? {};
  return {
    voiceId: v.voice_id,
    name: v.name,
    gender: labels.gender,
    age: labels.age,
    accent: labels.accent,
    description: labels.description ?? labels.use_case,
    category: v.category,
    language: labels.language,
  };
}

/** True if voice is suitable for English TTS. */
export function isEnglishVoice(v: RegistryVoice | ElevenVoice): boolean {
  const labels = 'labels' in v ? v.labels : undefined;
  const language = labels?.language ?? ('language' in v ? v.language : undefined);
  if (language) {
    const lang = language.toLowerCase();
    if (lang === 'en' || lang.startsWith('en-') || lang === 'english') return true;
    if (lang !== 'en' && !lang.startsWith('en')) return false;
  }
  if ('verified_languages' in v && Array.isArray(v.verified_languages)) {
    return v.verified_languages.some((vl) => {
      const l = typeof vl === 'string' ? vl : vl.language;
      return l?.toLowerCase().startsWith('en');
    });
  }
  // Premade voices often omit language — treat as English
  return true;
}

export function filterEnglishVoices(voices: RegistryVoice[]): RegistryVoice[] {
  const narratorId = config.voice.narratorVoiceId.trim();
  const seen = new Set<string>();
  const out: RegistryVoice[] = [];

  for (const v of voices) {
    if (!v.voiceId || seen.has(v.voiceId)) continue;
    if (narratorId && v.voiceId === narratorId) continue;
    if (!isEnglishVoice(v)) continue;
    seen.add(v.voiceId);
    out.push(v);
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Voices safe for NPC casting — premade only (professional/cloned often 403 at TTS time). */
export function filterNpcCastingVoices(voices: RegistryVoice[]): RegistryVoice[] {
  const blocked = new Set(['professional', 'cloned', 'generated', 'instant']);
  return filterEnglishVoices(voices).filter((v) => {
    const cat = (v.category ?? 'premade').toLowerCase();
    return !blocked.has(cat);
  });
}

async function readCache(): Promise<{ fetchedAt: number; voices: RegistryVoice[] } | null> {
  try {
    const raw = await readFile(cachePath(), 'utf8');
    return JSON.parse(raw) as { fetchedAt: number; voices: RegistryVoice[] };
  } catch {
    return null;
  }
}

async function writeCache(voices: RegistryVoice[]): Promise<void> {
  await mkdir(config.voice.tempDir, { recursive: true });
  await writeFile(
    cachePath(),
    JSON.stringify({ fetchedAt: Date.now(), voices }, null, 0),
    'utf8',
  );
}

let memoryCache: RegistryVoice[] | null = null;

/** Fetch all English voices from ElevenLabs (cached 24h). */
export async function getEnglishVoices(forceRefresh = false): Promise<RegistryVoice[]> {
  if (memoryCache && !forceRefresh) return memoryCache;

  if (!forceRefresh) {
    const disk = await readCache();
    if (disk && Date.now() - disk.fetchedAt < CACHE_TTL_MS) {
      memoryCache = filterEnglishVoices(disk.voices);
      return memoryCache;
    }
  }

  const client = createElevenLabsClient();
  if (!client) {
    logger.warn('ElevenLabs unavailable — using offline voice pool for casting');
    memoryCache = filterEnglishVoices(OFFLINE_VOICE_POOL);
    return memoryCache;
  }

  try {
    const remote = await client.listVoices();
    const mapped = remote.map(toRegistryVoice);
    const english = filterEnglishVoices(mapped);
    if (english.length === 0) {
      logger.warn('No English voices from API — falling back to offline pool');
      memoryCache = filterEnglishVoices(OFFLINE_VOICE_POOL);
      return memoryCache;
    }
    await writeCache(english);
    memoryCache = english;
    logger.info(`Voice registry: ${english.length} English voices loaded`);
    return english;
  } catch (err) {
    logger.warn('Failed to fetch ElevenLabs voices', err);
    const disk = await readCache();
    if (disk?.voices.length) {
      memoryCache = filterEnglishVoices(disk.voices);
      return memoryCache;
    }
    memoryCache = filterEnglishVoices(OFFLINE_VOICE_POOL);
    return memoryCache;
  }
}

export function compactVoiceForAi(v: RegistryVoice): Record<string, string> {
  const row: Record<string, string> = { voice_id: v.voiceId, name: v.name };
  if (v.gender) row.gender = v.gender;
  if (v.age) row.age = v.age;
  if (v.accent) row.accent = v.accent;
  if (v.description) row.description = v.description;
  return row;
}

/** Character-aware fallback when AI casting fails or picks a poor fit. */
export function fallbackVoicePick(
  npc: string | {
    name: string;
    description?: string;
    visualDescription?: string;
    attitude?: string;
    goals?: string;
    gender?: string;
  },
  voices: RegistryVoice[],
  usedVoiceIds: string[],
): RegistryVoice | null {
  const speaker = typeof npc === 'string' ? { name: npc } : npc;
  return pickVoiceForNpcProfile(
    speaker,
    voices,
    usedVoiceIds,
    config.voice.narratorVoiceId.trim(),
  );
}

export async function clearVoiceRegistryCache(): Promise<void> {
  memoryCache = null;
  try {
    await access(cachePath());
    const { unlink } = await import('node:fs/promises');
    await unlink(cachePath());
  } catch {
    // no cache file
  }
}
