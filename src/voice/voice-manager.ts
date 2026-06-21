import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  getVoiceConnection,
} from '@discordjs/voice';
import type { Guild, VoiceBasedChannel } from 'discord.js';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { createElevenLabsClient } from './elevenlabs-client.js';
import type { AmbienceContext } from './ambience-context.js';
import { ambienceCacheKey, ambienceLabel, ensureAmbienceLoop } from './ambience-cache.js';
import { enrichNarrationAudio } from './narration-audio.js';
import type { NarrationAudioContext } from './narration-audio.js';
import { AmbienceBedStream } from './ambience-bed.js';
import { prepareSpeechForTts, type SpeechDeliveryContext } from './speech-delivery.js';
import { ensureVoiceCryptoReady } from './voice-crypto.js';

const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;
if (ffmpegPath && existsSync(ffmpegPath)) {
  const ffmpegDir = dirname(ffmpegPath);
  if (!process.env.PATH?.includes(ffmpegDir)) {
    process.env.PATH = `${ffmpegDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`;
  }
}

type SpeakJob =
  | {
      kind: 'tts';
      text: string;
      voiceId: string;
      delivery?: SpeechDeliveryContext;
      campaignId?: string;
      ambience?: AmbienceContext;
    }
  | {
      kind: 'file';
      filePath: string;
      campaignId?: string;
      ambience?: AmbienceContext;
      /** After this clip, resume looping scene bed (intro already includes bed in the mix). */
      resumeBedAfter?: boolean;
      /** Track already has ambience mixed under speech — skip separate bed loop until clip ends. */
      ambienceMixed?: boolean;
      /** Original text for spot SFX timing when mixing at playback. */
      narrationText?: string;
    };

class GuildVoiceSession {
  private player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  private connection: VoiceConnection | null = null;
  private queue: SpeakJob[] = [];
  private busy = false;
  private bedStream = new AmbienceBedStream();
  private bedPath: string | null = null;
  private bedKey: string | null = null;
  private bedLabel: string | null = null;
  private playingBedOnly = false;

  constructor(readonly guildId: string) {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.busy = false;
      this.playingBedOnly = false;
      void this.onIdle();
    });
    this.player.on('error', (err) => {
      logger.warn('Voice player error', err);
      this.busy = false;
      this.playingBedOnly = false;
      this.bedStream.stop();
      void this.onIdle();
    });
  }

  private async onIdle(): Promise<void> {
    if (this.queue.length > 0) {
      void this.pump();
      return;
    }
    this.startBedLoop();
  }

  private stopBedLoop(): void {
    if (this.playingBedOnly) {
      this.player.stop(true);
      this.playingBedOnly = false;
    }
    this.bedStream.stop();
  }

  private startBedLoop(): void {
    if (!config.voice.ambienceEnabled || !this.bedPath || this.busy) return;
    if (this.player.state.status === AudioPlayerStatus.Playing) return;

    const resource = this.bedStream.createResource(this.bedPath);
    if (!resource) return;

    this.playingBedOnly = true;
    this.player.play(resource);
    logger.info(`Ambience bed looping [${this.bedLabel ?? 'scene'}]`);
  }

  /** Resolve/cache bed and switch when location, mood, or combat changes. */
  async applySceneAmbience(campaignId: string, ctx: AmbienceContext | undefined): Promise<string | null> {
    if (!config.voice.ambienceEnabled || !ctx?.locationId) return null;

    const path = await ensureAmbienceLoop(campaignId, ctx);
    if (!path) return null;

    const key = ambienceCacheKey(ctx);
    if (key !== this.bedKey) {
      this.stopBedLoop();
      this.bedKey = key;
      this.bedPath = path;
      this.bedLabel = ambienceLabel(ctx);
      logger.info(
        `Ambience scene → [${this.bedLabel}] at ${ctx.locationName ?? ctx.locationId}${ctx.combatActive ? ' (combat)' : ''}`,
      );
    }

    return path;
  }

  async join(channel: VoiceBasedChannel): Promise<boolean> {
    await ensureVoiceCryptoReady();

    const existing = getVoiceConnection(channel.guild.id);
    if (existing?.joinConfig.channelId === channel.id && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection = existing;
      existing.subscribe(this.player);
    } else {
      existing?.destroy();
      this.connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as Parameters<typeof joinVoiceChannel>[0]['adapterCreator'],
        selfDeaf: false,
        selfMute: false,
        debug: process.env.LOG_LEVEL === 'debug',
      });
      this.connection.subscribe(this.player);
    }

    this.connection.on('stateChange', (oldState, newState) => {
      logger.info(`Voice state: ${oldState.status} → ${newState.status}`);
    });

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 30_000);
      logger.info(`Voice connection ready: ${channel.name}`);
      return true;
    } catch (err) {
      logger.error(
        `Voice connection stuck at ${this.connection.state.status} — check DAVE (@snazzah/davey) and bot Connect/Speak permissions`,
        err,
      );
      return false;
    }
  }

  leave(): void {
    this.queue = [];
    this.busy = false;
    this.bedKey = null;
    this.bedPath = null;
    this.bedLabel = null;
    this.stopBedLoop();
    this.player.stop(true);
    this.connection?.destroy();
    this.connection = null;
  }

  isConnected(): boolean {
    return this.connection !== null && this.connection.state.status !== VoiceConnectionStatus.Destroyed;
  }

  isReady(): boolean {
    return this.connection?.state.status === VoiceConnectionStatus.Ready;
  }

  async waitUntilReady(timeoutMs = 30_000): Promise<boolean> {
    if (!this.connection || this.isReady()) return this.isReady();
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  enqueue(
    text: string,
    voiceId: string,
    delivery?: SpeechDeliveryContext,
    ambient?: { campaignId?: string; ambience?: AmbienceContext },
  ): void {
    if (!text.trim()) return;
    this.queue.push({
      kind: 'tts',
      text,
      voiceId,
      delivery,
      campaignId: ambient?.campaignId,
      ambience: ambient?.ambience,
    });
    this.stopBedLoop();
    void this.pump();
  }

  enqueueFile(
    filePath: string,
    ambient?: {
      campaignId?: string;
      ambience?: AmbienceContext;
      resumeBedAfter?: boolean;
      ambienceMixed?: boolean;
      narrationText?: string;
    },
  ): void {
    this.queue.push({
      kind: 'file',
      filePath,
      campaignId: ambient?.campaignId,
      ambience: ambient?.ambience,
      resumeBedAfter: ambient?.resumeBedAfter ?? true,
      ambienceMixed: ambient?.ambienceMixed ?? false,
      narrationText: ambient?.narrationText,
    });
    this.stopBedLoop();
    void this.pump();
  }

  private narrationAudioContext(ambience?: AmbienceContext): NarrationAudioContext | undefined {
    if (!ambience) return undefined;
    return {
      locationName: ambience.locationName,
      sceneMood: ambience.sceneMood ?? ambience.mood,
    };
  }

  private async pump(): Promise<void> {
    if (this.busy || this.player.state.status === AudioPlayerStatus.Playing) return;
    const job = this.queue.shift();
    if (!job) {
      this.startBedLoop();
      return;
    }

    this.busy = true;
    this.stopBedLoop();

    try {
      if (job.kind === 'file') {
        let playPath = job.filePath;
        if (job.campaignId && job.ambience) {
          await this.applySceneAmbience(job.campaignId, job.ambience);
        }
        if (
          !job.ambienceMixed &&
          config.voice.ambienceEnabled &&
          job.campaignId &&
          job.ambience &&
          this.bedPath
        ) {
          playPath = await enrichNarrationAudio(
            playPath,
            job.narrationText ?? '',
            this.bedPath,
            this.narrationAudioContext(job.ambience),
          );
        }
        if (!(await this.waitUntilReadyIfNeeded())) {
          this.busy = false;
          return;
        }
        logger.info(`Playing narration track (${playPath})`);
        const resource = createAudioResource(playPath, { inlineVolume: true });
        if (resource.volume) resource.volume.setVolume(1);
        this.player.play(resource);
        if (!job.resumeBedAfter && !job.ambienceMixed) {
          this.bedPath = null;
        }
        return;
      }

      const client = createElevenLabsClient();
      if (!client) {
        logger.warn('ElevenLabs client unavailable — skip speech');
        this.busy = false;
        void this.pump();
        return;
      }

      const prepared = prepareSpeechForTts(
        job.text,
        { isNpc: Boolean(job.delivery?.isNpc), ...job.delivery },
        config.voice.maxCharsPerLine,
      );
      let filePath = await client.textToSpeechCached(prepared.text, job.voiceId, {
        modelId: prepared.modelId,
        voiceSettings: prepared.voiceSettings,
      });

      if (job.campaignId && job.ambience?.locationId) {
        const bed = await this.applySceneAmbience(job.campaignId, job.ambience);
        if (bed) {
          filePath = await enrichNarrationAudio(
            filePath,
            job.text,
            bed,
            this.narrationAudioContext(job.ambience),
          );
        }
      } else if (job.text.trim()) {
        filePath = await enrichNarrationAudio(filePath, job.text, null, this.narrationAudioContext(job.ambience));
      }

      if (!(await this.waitUntilReadyIfNeeded())) {
        this.busy = false;
        return;
      }

      logger.info(`Playing TTS (${prepared.text.length} chars)`);
      const resource = createAudioResource(filePath, { inlineVolume: true });
      if (resource.volume) resource.volume.setVolume(1);
      this.player.play(resource);
    } catch (err) {
      logger.warn('Failed to play TTS', err);
      this.busy = false;
      void this.pump();
    }
  }

  private async waitUntilReadyIfNeeded(): Promise<boolean> {
    if (this.isReady()) return true;
    logger.warn(`Voice connection not ready (status=${this.connection?.state.status}) — waiting…`);
    const ready = await this.waitUntilReady(20_000);
    if (!ready) {
      logger.error('Voice playback aborted — connection never became Ready');
      this.busy = false;
      void this.pump();
      return false;
    }
    return true;
  }
}

export class VoiceManager {
  private sessions = new Map<string, GuildVoiceSession>();

  isEnabled(): boolean {
    return config.voice.enabled && Boolean(config.voice.elevenLabsApiKey.trim());
  }

  isConnected(guildId: string): boolean {
    return this.sessions.get(guildId)?.isConnected() ?? false;
  }

  async adoptChannel(channel: VoiceBasedChannel): Promise<boolean> {
    await ensureVoiceCryptoReady();
    let session = this.sessions.get(channel.guild.id);
    if (!session) {
      session = new GuildVoiceSession(channel.guild.id);
      this.sessions.set(channel.guild.id, session);
    }
    if (session.isConnected() && session.isReady()) return true;
    session.leave();
    const ready = await session.join(channel);
    logger.info(`Voice adopted: ${channel.name} (${channel.guild.name})${ready ? '' : ' — handshake failed'}`);
    return ready;
  }

  async join(memberChannel: VoiceBasedChannel): Promise<boolean> {
    await ensureVoiceCryptoReady();
    let session = this.sessions.get(memberChannel.guild.id);
    if (!session) {
      session = new GuildVoiceSession(memberChannel.guild.id);
      this.sessions.set(memberChannel.guild.id, session);
    }
    session.leave();
    const ready = await session.join(memberChannel);
    logger.info(`Voice joined: ${memberChannel.name} (${memberChannel.guild.name})${ready ? '' : ' — handshake failed'}`);
    return ready;
  }

  async waitForReady(guildId: string, timeoutMs = 30_000): Promise<boolean> {
    const session = this.sessions.get(guildId);
    if (!session?.isConnected()) return false;
    return session.waitUntilReady(timeoutMs);
  }

  leave(guildId: string): void {
    this.sessions.get(guildId)?.leave();
    this.sessions.delete(guildId);
    getVoiceConnection(guildId)?.destroy();
    logger.info(`Voice left guild ${guildId}`);
  }

  speakWithVoice(
    guildId: string,
    text: string,
    voiceId: string,
    delivery?: SpeechDeliveryContext,
    ambient?: { campaignId?: string; ambience?: AmbienceContext },
  ): void {
    if (!this.isEnabled()) {
      logger.info('Voice skip: VOICE_ENABLED=false or missing ELEVENLABS_API_KEY');
      return;
    }
    if (config.voice.speakMode === 'off') {
      logger.info('Voice skip: VOICE_SPEAK_MODE=off');
      return;
    }
    const session = this.sessions.get(guildId);
    if (!session?.isConnected()) {
      logger.info('Voice skip: bot has no active voice session — run `/voice join` while you are in a VC');
      return;
    }
    if (!text.trim() || !voiceId.trim()) return;

    session.enqueue(text, voiceId.trim(), delivery, ambient);
  }

  /** Play a pre-mixed mp3 (e.g. full intro prologue). */
  playNarrationFile(
    guildId: string,
    filePath: string,
    ambient?: {
      campaignId?: string;
      ambience?: AmbienceContext;
      resumeBedAfter?: boolean;
      ambienceMixed?: boolean;
      narrationText?: string;
    },
  ): void {
    if (!this.isEnabled()) return;
    const session = this.sessions.get(guildId);
    if (!session?.isConnected()) return;
    session.enqueueFile(filePath, ambient);
  }

  speakNarration(guildId: string, text: string, _npcSpeaker?: string): void {
    this.speakWithVoice(guildId, text, config.voice.narratorVoiceId, { isNpc: false });
  }
}

export const voiceManager = new VoiceManager();

export async function joinMemberVoiceChannel(guild: Guild, memberId: string): Promise<string | null> {
  const member = await guild.members.fetch(memberId).catch(() => null);
  const channel = member?.voice.channel;
  if (!channel) return 'Join a voice channel first, then run `/voice join`.';
  if (!channel.joinable) return 'I cannot join that voice channel (permissions?).';
  const ready = await voiceManager.join(channel);
  if (!ready) {
    return 'Joined the channel but Discord voice encryption failed to connect. Restart the bot after updating dependencies, then try again.';
  }
  return null;
}
