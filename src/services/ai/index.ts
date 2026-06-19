import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { createMockAIProvider } from './mock-provider.js';
import { createOpenAIProvider } from './openai-provider.js';
import type { AIService } from './types.js';

export function createAIProvider(): AIService {
  if (config.ai.provider === 'openai') {
    logger.info('Using OpenAI AI provider');
    return createOpenAIProvider();
  }
  logger.info('Using Mock AI provider');
  return createMockAIProvider();
}

export type { AIService, ControllerInput, NarratorInput, MemoryExtractorInput, ImagePromptInput } from './types.js';
export { DM_POLICY } from './types.js';
