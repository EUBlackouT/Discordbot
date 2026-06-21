import { createAIProvider } from '../../services/ai/index.js';
import type { MemoryExtractorInput } from '../../services/ai/types.js';
import { logger } from '../../utils/logger.js';
import { applyChronicleFromMemory } from '../chronicle/campaign-chronicle.js';
import { applyMemoryExtraction } from './extractor.js';

const ai = createAIProvider();

/** Per-campaign chain so extractions run in order without blocking player replies. */
const extractionChains = new Map<string, Promise<void>>();

/** Wait for any in-flight extraction before reading campaign memory for a new turn. */
export async function awaitPendingMemoryExtraction(campaignId: string): Promise<void> {
  await (extractionChains.get(campaignId) ?? Promise.resolve());
}

export interface TurnMemoryContext {
  playerMessage: string;
  characterName?: string;
}

/**
 * Run full memory + chronicle update after the player sees/hears the response.
 * Same work as before — only the timing changes.
 */
export function scheduleTurnMemoryExtraction(
  campaignId: string,
  input: MemoryExtractorInput,
  turnContext?: TurnMemoryContext,
): void {
  const run = async (): Promise<void> => {
    const memory = await ai.extractMemory(input);
    await applyMemoryExtraction(campaignId, memory);
    await applyChronicleFromMemory(campaignId, memory, turnContext);
  };

  const prev = extractionChains.get(campaignId) ?? Promise.resolve();
  const next = prev.then(run).catch((err) => {
    logger.warn('Memory extraction failed', err);
  });
  extractionChains.set(campaignId, next);
}
