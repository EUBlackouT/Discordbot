import type { CampaignStatePacket } from '../campaign/state.js';
import type { ControllerDecision, AssetDecision } from '../validation/schemas.js';
import { createAIProvider } from '../services/ai/index.js';
import { AssetManager } from './asset-manager.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const ai = createAIProvider();

export type SceneImageMoment =
  | 'turn'
  | 'combat_start'
  | 'scene_change'
  | 'camp'
  | 'dramatic'
  | 'flavor';

export async function tryGenerateSceneImage(
  assetManager: AssetManager,
  campaignId: string,
  statePacket: CampaignStatePacket,
  options?: {
    hint?: ControllerDecision['asset_decision_hint'];
    moment?: SceneImageMoment;
    force?: boolean;
    narrationSnippet?: string;
  },
): Promise<string | undefined> {
  if (!config.image.apiKey) return undefined;

  try {
    const moment = options?.moment ?? 'turn';
    const hint = options?.hint ?? {};
    const forceMajor =
      options?.force ||
      moment === 'combat_start' ||
      moment === 'scene_change' ||
      moment === 'camp';

    const assetDecision = await ai.generateAssetDecision(statePacket, {
      ...hint,
      location_image_relevant:
        forceMajor ||
        hint.location_image_relevant ||
        moment === 'dramatic' ||
        moment === 'flavor',
    });

    const shouldGenerate =
      forceMajor ||
      assetDecision.should_generate_image ||
      (moment === 'flavor' && Boolean(statePacket.location?.visualDescription));

    const merged: AssetDecision = {
      ...assetDecision,
      should_generate_image: shouldGenerate,
      asset_type: 'location',
      new_asset_needed: forceMajor || !statePacket.location?.activeAssetId || assetDecision.new_asset_needed,
      reason: assetDecision.reason || `Scene image for ${moment}`,
      change_summary:
        assetDecision.change_summary ||
        (options?.narrationSnippet ? options.narrationSnippet.slice(0, 200) : undefined),
    };

    const asset = await assetManager.decideAndExecute(campaignId, statePacket, merged);
    return asset?.localPath;
  } catch (err) {
    logger.warn('Scene image generation failed', err);
    return undefined;
  }
}
