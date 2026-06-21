import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import type { ElevenVoiceSettings } from './speech-delivery.js';

const BASE = 'https://api.elevenlabs.io/v1';
const FALLBACK_FORMAT = 'mp3_44100_128';

export interface ElevenVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: {
    accent?: string;
    age?: string;
    gender?: string;
    language?: string;
    description?: string;
    use_case?: string;
  };
  verified_languages?: Array<string | { language: string; locale?: string }>;
}

export interface TtsRequestOptions {
  modelId?: string;
  voiceSettings?: ElevenVoiceSettings;
  /** Skip disk cache — use when rebaking curated audio. */
  force?: boolean;
  /** Unique bake id so regenerated speech gets new paths and downstream mix caches rebuild. */
  cacheBust?: string;
  outputFormat?: string;
}

export class ElevenLabsClient {
  constructor(private readonly apiKey: string) {}

  private headers(json = false): Record<string, string> {
    const h: Record<string, string> = { 'xi-api-key': this.apiKey };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  private outputFormat(options?: { outputFormat?: string }): string {
    return options?.outputFormat ?? config.voice.audioOutputFormat;
  }

  async listVoices(): Promise<ElevenVoice[]> {
    const res = await fetch(`${BASE}/voices`, { headers: this.headers() });
    if (!res.ok) throw new Error(`ElevenLabs voices: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { voices?: ElevenVoice[] };
    return data.voices ?? [];
  }

  private async postAudio(
    url: string,
    body: Record<string, unknown>,
    outputFormat: string,
  ): Promise<Buffer> {
    const res = await fetch(`${url}?output_format=${encodeURIComponent(outputFormat)}`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs ${res.status} ${text}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async textToSpeech(text: string, voiceId: string, options?: TtsRequestOptions): Promise<Buffer> {
    const model = options?.modelId ?? config.voice.ttsModelId;
    const voiceSettings = options?.voiceSettings ?? {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.32,
      use_speaker_boost: true,
    };
    const format = this.outputFormat(options);
    const body = { text, model_id: model, voice_settings: voiceSettings };
    const url = `${BASE}/text-to-speech/${voiceId}`;

    try {
      return await this.postAudio(url, body, format);
    } catch (err) {
      if (format === FALLBACK_FORMAT) throw err;
      logger.warn(`TTS ${format} failed — retrying ${FALLBACK_FORMAT}`, err);
      return this.postAudio(url, body, FALLBACK_FORMAT);
    }
  }

  /** True when the account cannot use this voice (disabled, wrong tier, etc.). */
  static isVoiceAccessDenied(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes('voice_access_denied') ||
      msg.includes('voice_disabled') ||
      (msg.includes('Voice') && msg.includes('403'))
    );
  }

  async generateSoundEffect(
    prompt: string,
    durationSeconds = 10,
    loop = true,
    outputFormat?: string,
  ): Promise<Buffer> {
    const format = outputFormat ?? config.voice.audioOutputFormat;
    const body = {
      text: prompt,
      duration_seconds: Math.min(30, Math.max(0.5, durationSeconds)),
      loop,
      prompt_influence: 0.4,
    };

    try {
      return await this.postAudio(`${BASE}/sound-generation`, body, format);
    } catch (err) {
      if (format === FALLBACK_FORMAT) throw err;
      logger.warn(`SFX ${format} failed — retrying ${FALLBACK_FORMAT}`, err);
      return this.postAudio(`${BASE}/sound-generation`, body, FALLBACK_FORMAT);
    }
  }

  /** Cache TTS mp3 to disk (reuse for identical lines + delivery). */
  async textToSpeechCached(
    text: string,
    voiceId: string,
    options?: TtsRequestOptions,
  ): Promise<string> {
    await mkdir(config.voice.tempDir, { recursive: true });
    const format = this.outputFormat(options);
    const cacheKey = JSON.stringify({
      voiceId,
      text,
      model: options?.modelId ?? config.voice.ttsModelId,
      settings: options?.voiceSettings,
      format,
      bust: options?.cacheBust ?? '',
    });
    const hash = createHash('sha256').update(cacheKey).digest('hex').slice(0, 16);
    const path = join(config.voice.tempDir, `tts-${hash}.mp3`);
    try {
      const { access } = await import('node:fs/promises');
      if (!options?.force) {
        await access(path);
        return path;
      }
    } catch {
      // cache miss or forced regenerate
    }
    const buf = await this.textToSpeech(text, voiceId, options);
    await writeFile(path, buf);
    logger.debug(`ElevenLabs TTS cached: ${path}${options?.force ? ' (forced)' : ''}`);
    return path;
  }
}

export function createElevenLabsClient(): ElevenLabsClient | null {
  const key = config.voice.elevenLabsApiKey.trim();
  if (!key) return null;
  return new ElevenLabsClient(key);
}
