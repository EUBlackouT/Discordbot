import { spawn, type ChildProcess } from 'node:child_process';
import { createAudioResource, StreamType, type AudioResource } from '@discordjs/voice';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;

/** Looping location bed streamed to Discord while the party stays in a scene. */
export class AmbienceBedStream {
  private proc: ChildProcess | null = null;

  stop(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
  }

  createResource(ambiencePath: string): AudioResource | null {
    if (!ffmpegPath || !config.voice.ambienceEnabled) return null;
    this.stop();

    const vol = config.voice.ambienceVolume;
    this.proc = spawn(
      ffmpegPath,
      [
        '-stream_loop',
        '-1',
        '-i',
        ambiencePath,
        '-af',
        `volume=${vol}`,
        '-f',
        's16le',
        '-ar',
        '48000',
        '-ac',
        '2',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    this.proc.on('error', (err) => logger.warn('Ambience bed stream error', err));
    this.proc.stderr?.on('data', () => {
      /* ffmpeg noise */
    });

    const stdout = this.proc.stdout;
    if (!stdout) {
      this.stop();
      return null;
    }

    return createAudioResource(stdout, { inputType: StreamType.Raw });
  }
}
