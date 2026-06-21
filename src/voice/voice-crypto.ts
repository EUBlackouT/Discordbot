import { generateDependencyReport } from '@discordjs/voice';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let cryptoReady: Promise<void> | null = null;

/** libsodium-wrappers must be awaited before Discord voice encryption works. */
export function ensureVoiceCryptoReady(): Promise<void> {
  if (!cryptoReady) {
    cryptoReady = import('libsodium-wrappers').then(async (mod) => {
      await mod.default.ready;
      if (config.voice.enabled) {
        const report = generateDependencyReport();
        logger.info('Voice crypto ready');
        if (report.includes('@snazzah/davey')) {
          logger.info('DAVE voice encryption library available');
        } else {
          logger.warn('DAVE library missing — Discord voice cannot reach Ready (upgrade @discordjs/voice)');
        }
        logger.debug(report);
      }
    });
  }
  return cryptoReady;
}
