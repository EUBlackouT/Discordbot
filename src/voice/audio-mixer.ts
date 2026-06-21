import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import ffmpegStatic from 'ffmpeg-static';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : null;

export interface AudioMixCacheOptions {
  /** Unique per bake — forces new ffmpeg derivative filenames. */
  sessionId?: string;
  /** Re-run ffmpeg even when a cached derivative exists. */
  rebuild?: boolean;
}

function mixCacheSuffix(cache?: AudioMixCacheOptions): string {
  return cache?.sessionId ? `|${cache.sessionId}` : '';
}

function shouldUseMixCache(cache?: AudioMixCacheOptions): boolean {
  return !cache?.rebuild;
}

function probeDurationSeconds(filePath: string): Promise<number> {
  if (!ffmpegPath) return Promise.resolve(120);

  return new Promise((resolveDuration) => {
    const proc = spawn(ffmpegPath, ['-i', resolve(filePath), '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', () => resolveDuration(120));
    proc.on('close', () => {
      const match = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (!match) {
        resolveDuration(120);
        return;
      }
      const hours = parseInt(match[1]!, 10);
      const mins = parseInt(match[2]!, 10);
      const secs = parseFloat(match[3]!);
      resolveDuration(hours * 3600 + mins * 60 + secs);
    });
  });
}

/** ffmpeg concat demuxer expects forward slashes, even on Windows. */
function ffmpegFileRef(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

function runFfmpeg(args: string[], timeoutMs = 90_000): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg not available');
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else reject(new Error(`ffmpeg exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
    });
  });
}

/** Mix timed spot SFX into a speech clip (bed is mixed separately). */
export async function mixSpotSfxIntoSpeech(
  speechPath: string,
  spots: Array<{ path: string; offsetSec: number; volume: number }>,
  cache?: AudioMixCacheOptions,
): Promise<string> {
  if (spots.length === 0 || !ffmpegPath) return speechPath;

  const mixDir = join(config.voice.ambienceDir, '_spots');
  await mkdir(mixDir, { recursive: true });

  const hash = createHash('sha256')
    .update(`${speechPath}|${JSON.stringify(spots)}|${config.voice.speechVolume}${mixCacheSuffix(cache)}`)
    .digest('hex')
    .slice(0, 16);
  const outPath = join(mixDir, `spots-${hash}.mp3`);

  if (shouldUseMixCache(cache)) {
    try {
      await access(outPath);
      return outPath;
    } catch {
      // build
    }
  }

  const duration = await probeDurationSeconds(speechPath);
  const timeoutMs = Math.min(180_000, Math.max(30_000, Math.ceil(duration * 3) * 1000));
  const speechVol = config.voice.speechVolume;

  const filterParts: string[] = [`[0:a]volume=${speechVol}[speech]`];
  const mixInputs = ['[speech]'];

  spots.forEach((spot, i) => {
    const inputIdx = i + 1;
    const delayMs = Math.round(spot.offsetSec * 1000);
    filterParts.push(
      `[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${spot.volume}[sfx${i}]`,
    );
    mixInputs.push(`[sfx${i}]`);
  });

  const n = mixInputs.length;
  const weights = ['1', ...spots.map((s) => String(Math.max(0.15, s.volume)))].join(' ');
  filterParts.push(
    `${mixInputs.join('')}amix=inputs=${n}:duration=first:dropout_transition=0:normalize=0:weights=${weights}[out]`,
  );

  try {
    const inputs = [speechPath, ...spots.map((s) => s.path)].flatMap((p) => ['-i', resolve(p)]);
    await runFfmpeg(
      ['-y', ...inputs, '-filter_complex', filterParts.join(';'), '-map', '[out]', '-t', String(duration + 0.25), resolve(outPath)],
      timeoutMs,
    );
    return outPath;
  } catch (err) {
    logger.warn('Spot SFX mix failed — speech only', err);
    return speechPath;
  }
}

export { probeDurationSeconds };

/** Match perceived loudness across TTS clips (fixes quiet opening segments). */
export async function normalizeSpeechLoudness(
  speechPath: string,
  cache?: AudioMixCacheOptions,
): Promise<string> {
  if (!ffmpegPath) return speechPath;

  const outDir = join(config.voice.ambienceDir, '_norm');
  await mkdir(outDir, { recursive: true });
  const hash = createHash('sha256')
    .update(`norm|${speechPath}${mixCacheSuffix(cache)}`)
    .digest('hex')
    .slice(0, 16);
  const outPath = join(outDir, `norm-${hash}.mp3`);

  if (shouldUseMixCache(cache)) {
    try {
      await access(outPath);
      return outPath;
    } catch {
      // build
    }
  }

  try {
    await runFfmpeg(
      [
        '-y',
        '-i',
        resolve(speechPath),
        '-af',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        resolve(outPath),
      ],
      120_000,
    );
    return outPath;
  } catch (err) {
    logger.warn('Loudness normalize failed — using raw clip', err);
    return speechPath;
  }
}

/** Mix looping ambience under speech (speech duration wins). */
export async function mixSpeechWithAmbience(
  speechPath: string,
  ambiencePath: string,
  cache?: AudioMixCacheOptions,
): Promise<string> {
  if (!config.voice.ambienceEnabled) return speechPath;

  const mixDir = join(config.voice.ambienceDir, '_mixed');
  await mkdir(mixDir, { recursive: true });

  const hash = createHash('sha256')
    .update(
      `${speechPath}|${ambiencePath}|${config.voice.ambienceVolume}|${config.voice.speechVolume}${mixCacheSuffix(cache)}`,
    )
    .digest('hex')
    .slice(0, 16);
  const outPath = join(mixDir, `mix-${hash}.mp3`);

  if (shouldUseMixCache(cache)) {
    try {
      await access(outPath);
      return outPath;
    } catch {
      // generate mix
    }
  }

  const bedVol = config.voice.ambienceVolume;
  const speechVol = config.voice.speechVolume;

  try {
    const duration = await probeDurationSeconds(speechPath);
    const timeoutMs = Math.min(300_000, Math.max(45_000, Math.ceil(duration * 4) * 1000));

    await runFfmpeg(
      [
        '-y',
        '-i',
        resolve(speechPath),
        '-stream_loop',
        '-1',
        '-i',
        resolve(ambiencePath),
        '-filter_complex',
        `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,volume=${bedVol}[bed];[0:a]volume=${speechVol}[speech];[bed][speech]amix=inputs=2:duration=first:dropout_transition=0:normalize=0:weights=${bedVol} ${speechVol}[out]`,
        '-map',
        '[out]',
        '-t',
        String(duration + 0.25),
        '-c:a',
        'libmp3lame',
        '-b:a',
        '192k',
        resolve(outPath),
      ],
      timeoutMs,
    );
    return outPath;
  } catch (err) {
    logger.warn('Ambience mix failed — playing speech only', err);
    return speechPath;
  }
}

/** Concatenate speech clips with optional silence gaps between them. */
export async function concatSpeechFiles(
  speechPaths: string[],
  options?: { pauseAfterMs?: number[]; defaultPauseMs?: number; cache?: AudioMixCacheOptions },
): Promise<string> {
  if (speechPaths.length === 0) throw new Error('No speech paths to concat');
  if (speechPaths.length === 1) return speechPaths[0]!;

  const pauseAfterMs = options?.pauseAfterMs ?? [];
  const defaultPauseMs = options?.defaultPauseMs ?? 0;
  const mixCache = options?.cache;
  const clips: string[] = [];

  for (let i = 0; i < speechPaths.length; i++) {
    clips.push(speechPaths[i]!);
    if (i < speechPaths.length - 1) {
      const gapMs = pauseAfterMs[i] ?? defaultPauseMs;
      if (gapMs > 0) {
        clips.push(await ensureSilenceClip(gapMs));
      }
    }
  }

  const outDir = join(config.voice.ambienceDir, '_concat');
  await mkdir(outDir, { recursive: true });
  const hash = createHash('sha256')
    .update(`${clips.join('|')}|${pauseAfterMs.join(',')}|${defaultPauseMs}${mixCacheSuffix(mixCache)}`)
    .digest('hex')
    .slice(0, 16);
  const outPath = join(outDir, `speech-${hash}.mp3`);

  if (shouldUseMixCache(mixCache)) {
    try {
      await access(outPath);
      return outPath;
    } catch {
      // build concat
    }
  }

  try {
    const inputs = clips.flatMap((p) => ['-i', resolve(p)]);
    const n = clips.length;
    const filter = `${clips.map((_, i) => `[${i}:a]`).join('')}concat=n=${n}:v=0:a=1[out]`;
    await runFfmpeg(
      ['-y', ...inputs, '-filter_complex', filter, '-map', '[out]', resolve(outPath)],
      60_000 + clips.length * 15_000,
    );
    return outPath;
  } catch (err) {
    logger.warn('Speech concat re-encode failed — retrying demuxer', err);
  }

  const listPath = join(tmpdir(), `discord-dm-concat-${hash}.txt`);
  const listBody = clips.map((p) => `file '${ffmpegFileRef(resolve(p))}'`).join('\n');
  await writeFile(listPath, listBody, 'utf8');

  try {
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      ffmpegFileRef(resolve(listPath)),
      '-c',
      'copy',
      resolve(outPath),
    ]);
    return outPath;
  } catch (err) {
    logger.warn('Speech concat failed — using first clip only', err);
    return speechPaths[0]!;
  }
}

async function ensureSilenceClip(ms: number): Promise<string> {
  const outDir = join(config.voice.ambienceDir, '_silence');
  await mkdir(outDir, { recursive: true });
  const hash = createHash('sha256').update(`silence|${ms}`).digest('hex').slice(0, 12);
  const outPath = join(outDir, `gap-${ms}ms-${hash}.mp3`);

  try {
    await access(outPath);
    return outPath;
  } catch {
    // generate
  }

  await runFfmpeg(
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t',
      String(ms / 1000),
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      resolve(outPath),
    ],
    15_000,
  );
  return outPath;
}

/** One continuous narration clip with ambience under the full duration. */
export async function mixContinuousNarration(
  speechPaths: string[],
  ambiencePath: string,
): Promise<string> {
  const speechPath = await concatSpeechFiles(speechPaths);
  return mixSpeechWithAmbience(speechPath, ambiencePath);
}
