import { mkdir, writeFile, access } from 'fs/promises';
import { join, resolve, isAbsolute } from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { config } from '../config/index.js';
import { prisma } from '../db/client.js';
import {
  buildLocationPrompt,
  buildCharacterPortraitPrompt,
  buildNpcPortraitPrompt,
} from './prompt-builder.js';
import type { AssetDecision } from '../validation/schemas.js';
import type { CampaignStatePacket } from '../campaign/state.js';
import { logger } from '../utils/logger.js';
import { ensureGuildAssetCampaign } from '../tenant/guild-asset-campaign.js';

export interface GenerateAssetInput {
  campaignId: string;
  assetType: 'character_portrait' | 'location' | 'npc_portrait' | 'item';
  prompt: string;
  negativePrompt: string;
  characterId?: string;
  locationId?: string;
  npcId?: string;
  ownerDiscordId?: string;
  styleProfileId?: string;
  changeSummary?: string;
  previousVersion?: number;
}

export interface GeneratedAssetResult {
  assetId: string;
  imageUrl?: string;
  localPath?: string;
  prompt: string;
  version: number;
}

export interface ImageService {
  generateCharacterPortrait(input: GenerateAssetInput): Promise<GeneratedAssetResult>;
  generateLocationImage(input: GenerateAssetInput): Promise<GeneratedAssetResult>;
  regenerateAsset(assetId: string): Promise<GeneratedAssetResult>;
  getAsset(assetId: string): Promise<GeneratedAssetResult | null>;
}

async function persistAsset(
  input: GenerateAssetInput,
  localPath: string,
  provider: string,
  providerMeta: Record<string, unknown>,
  imageUrl?: string,
): Promise<GeneratedAssetResult> {
  const prevVersion = input.previousVersion ?? 0;
  const version = prevVersion + 1;

  if (input.locationId) {
    await prisma.asset.updateMany({
      where: { locationId: input.locationId, isActive: true },
      data: { isActive: false },
    });
  }
  if (input.characterId) {
    await prisma.asset.updateMany({
      where: { characterId: input.characterId, assetType: 'character_portrait', isActive: true },
      data: { isActive: false },
    });
  }
  if (input.npcId) {
    await prisma.asset.updateMany({
      where: { npcId: input.npcId, assetType: 'npc_portrait', isActive: true },
      data: { isActive: false },
    });
  }

  const asset = await prisma.asset.create({
    data: {
      campaignId: input.campaignId,
      characterId: input.characterId,
      locationId: input.locationId,
      npcId: input.npcId,
      ownerDiscordId: input.ownerDiscordId,
      assetType: input.assetType,
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      localPath,
      imageUrl: imageUrl ?? null,
      provider,
      providerMeta: JSON.stringify(providerMeta),
      styleProfileId: input.styleProfileId,
      version,
      isActive: true,
      changeSummary: input.changeSummary ?? '',
    },
  });

  if (input.locationId) {
    await prisma.location.update({
      where: { id: input.locationId },
      data: { activeAssetId: asset.id },
    });
  }
  if (input.npcId) {
    await prisma.nPC.update({
      where: { id: input.npcId },
      data: { activeAssetId: asset.id },
    });
  }

  return { assetId: asset.id, imageUrl: imageUrl ?? undefined, localPath, prompt: input.prompt, version };
}

/** Stub provider — saves placeholder metadata; swap for OpenAI DALL-E in production */
export class StubImageService implements ImageService {
  async generateCharacterPortrait(input: GenerateAssetInput): Promise<GeneratedAssetResult> {
    return this.saveAsset(input);
  }

  async generateLocationImage(input: GenerateAssetInput): Promise<GeneratedAssetResult> {
    return this.saveAsset(input);
  }

  async regenerateAsset(assetId: string): Promise<GeneratedAssetResult> {
    const existing = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    return this.saveAsset({
      campaignId: existing.campaignId,
      assetType: existing.assetType as GenerateAssetInput['assetType'],
      prompt: existing.prompt,
      negativePrompt: existing.negativePrompt,
      characterId: existing.characterId ?? undefined,
      locationId: existing.locationId ?? undefined,
      npcId: existing.npcId ?? undefined,
      ownerDiscordId: existing.ownerDiscordId ?? undefined,
      styleProfileId: existing.styleProfileId ?? undefined,
      previousVersion: existing.version,
    });
  }

  async getAsset(assetId: string): Promise<GeneratedAssetResult | null> {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return null;
    return {
      assetId: asset.id,
      imageUrl: asset.imageUrl ?? undefined,
      localPath: asset.localPath ?? undefined,
      prompt: asset.prompt,
      version: asset.version,
    };
  }

  private async saveAsset(input: GenerateAssetInput): Promise<GeneratedAssetResult> {
    await mkdir(config.image.outputDir, { recursive: true });
    const filename = `${input.assetType}-${uuidv4()}.txt`;
    const localPath = join(config.image.outputDir, filename);
    const placeholder = `[STUB IMAGE]\nPrompt: ${input.prompt}\nNegative: ${input.negativePrompt}`;
    await writeFile(localPath, placeholder, 'utf-8');

    logger.info(`Stub asset created at ${localPath}`);
    return persistAsset(input, localPath, 'stub', { stub: true });
  }
}

export class OpenAIImageService implements ImageService {
  private readonly client: OpenAI;
  private readonly fallback = new StubImageService();

  constructor() {
    this.client = new OpenAI({ apiKey: config.image.apiKey });
  }

  async generateCharacterPortrait(input: GenerateAssetInput): Promise<GeneratedAssetResult> {
    return this.generateImage(input, 'portrait');
  }

  async generateLocationImage(input: GenerateAssetInput): Promise<GeneratedAssetResult> {
    return this.generateImage(input, 'location');
  }

  async regenerateAsset(assetId: string): Promise<GeneratedAssetResult> {
    const existing = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
    const input: GenerateAssetInput = {
      campaignId: existing.campaignId,
      assetType: existing.assetType as GenerateAssetInput['assetType'],
      prompt: existing.prompt,
      negativePrompt: existing.negativePrompt,
      characterId: existing.characterId ?? undefined,
      locationId: existing.locationId ?? undefined,
      npcId: existing.npcId ?? undefined,
      ownerDiscordId: existing.ownerDiscordId ?? undefined,
      styleProfileId: existing.styleProfileId ?? undefined,
      previousVersion: existing.version,
    };
    if (existing.assetType === 'character_portrait') return this.generateCharacterPortrait(input);
    if (existing.assetType === 'location') return this.generateLocationImage(input);
    return this.fallback.regenerateAsset(assetId);
  }

  async getAsset(assetId: string): Promise<GeneratedAssetResult | null> {
    return this.fallback.getAsset(assetId);
  }

  private async generateImage(
    input: GenerateAssetInput,
    kind: 'location' | 'portrait',
  ): Promise<GeneratedAssetResult> {
    if (!config.image.apiKey) {
      return kind === 'location'
        ? this.fallback.generateLocationImage(input)
        : this.fallback.generateCharacterPortrait(input);
    }

    try {
      await mkdir(config.image.outputDir, { recursive: true });
      const model = config.image.model;
      const usesGptImage = model.startsWith('gpt-image');

      const request = {
        model,
        prompt: input.prompt.slice(0, 4000),
        n: 1,
        size: (kind === 'location' ? '1536x1024' : '1024x1024') as '1536x1024' | '1024x1024',
      };

      let response;
      try {
        response = await this.client.images.generate(
          usesGptImage
            ? { ...request, output_format: 'png' as const, quality: 'medium' as const }
            : { ...request, response_format: 'b64_json' as const },
        );
      } catch (err) {
        const code = (err as { code?: string; error?: { param?: string } }).error?.param
          ?? (err as { param?: string }).param;
        if (code === 'response_format') {
          response = await this.client.images.generate({
            ...request,
            output_format: 'png',
            quality: 'medium',
          });
        } else {
          throw err;
        }
      }

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data returned');

      const filename = `${input.assetType}-${uuidv4()}.png`;
      const localPath = join(config.image.outputDir, filename);
      await writeFile(localPath, Buffer.from(b64, 'base64'));

      logger.info(`OpenAI image saved: ${localPath}`);
      return persistAsset(input, localPath, 'openai', { model: config.image.model }, undefined);
    } catch (err) {
      logger.warn('OpenAI image generation failed, using stub', err);
      return kind === 'location'
        ? this.fallback.generateLocationImage(input)
        : this.fallback.generateCharacterPortrait(input);
    }
  }
}

export function createImageService(): ImageService {
  if (config.image.apiKey) {
    return new OpenAIImageService();
  }
  return new StubImageService();
}

const userCooldowns = new Map<string, number>();

function isRenderablePortraitPath(path?: string | null): path is string {
  return Boolean(path && /\.(png|jpe?g|webp)$/i.test(path));
}

function resolveAssetFilePath(localPath: string): string {
  return isAbsolute(localPath) ? localPath : resolve(process.cwd(), localPath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function firstRenderablePortraitPath(
  ...candidates: Array<string | null | undefined>
): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = resolveAssetFilePath(candidate);
    if (isRenderablePortraitPath(resolved) && (await pathExists(resolved))) {
      return resolved;
    }
  }
  return undefined;
}

export class AssetManager {
  constructor(private imageService: ImageService) {}

  async canGenerate(
    campaignId: string,
    discordId?: string,
    opts?: { bypassAutoGate?: boolean; skipUserCooldown?: boolean },
  ): Promise<{ allowed: boolean; reason?: string }> {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

    const autoAllowed =
      opts?.bypassAutoGate ||
      config.image.apiKey ||
      config.image.autoGenerate ||
      campaign.imageAutoGenerate;

    if (!autoAllowed) {
      return { allowed: false, reason: 'Auto image generation is disabled' };
    }

    const now = Date.now();
    const resetAt = campaign.imageLimitResetAt.getTime();
    if (now - resetAt > 86400000) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { imageGeneratedToday: 0, imageLimitResetAt: new Date() },
      });
    } else if (campaign.imageGeneratedToday >= campaign.imageDailyLimit) {
      return { allowed: false, reason: 'Daily image limit reached for this campaign' };
    }

    if (discordId && !opts?.skipUserCooldown) {
      const last = userCooldowns.get(discordId) ?? 0;
      if (now - last < config.image.userCooldownMs) {
        return { allowed: false, reason: 'Please wait before generating another image' };
      }
    }

    return { allowed: true };
  }

  async decideAndExecute(
    campaignId: string,
    statePacket: CampaignStatePacket,
    decision: AssetDecision,
  ): Promise<GeneratedAssetResult | null> {
    if (!decision.should_generate_image) {
      if (decision.reuse_existing_asset_id) {
        return this.imageService.getAsset(decision.reuse_existing_asset_id);
      }
      return null;
    }

    const check = await this.canGenerate(campaignId, undefined, { bypassAutoGate: Boolean(config.image.apiKey) });
    if (!check.allowed) {
      logger.info(`Asset generation skipped: ${check.reason}`);
      return null;
    }

    const style = await prisma.visualStyleProfile.findUnique({ where: { campaignId } });
    const styleProfile = {
      artStyle: style?.artStyle ?? 'dark fantasy painterly',
      colorPalette: style?.colorPalette ?? 'muted earth tones',
      lightingMood: style?.lightingMood ?? 'dramatic lighting',
      negativePrompt: style?.negativePrompt ?? 'text, watermark, UI',
      cameraFraming: style?.cameraFraming ?? 'medium shot',
    };

    if (decision.asset_type === 'location' && statePacket.location) {
      const loc = statePacket.location;
      if (!decision.new_asset_needed && loc.activeAssetId) {
        return this.imageService.getAsset(loc.activeAssetId);
      }

      const { prompt, negativePrompt } = buildLocationPrompt({
        name: loc.name,
        visualDescription: loc.visualDescription,
        mood: loc.mood,
        currentChanges: loc.currentChanges,
        styleProfile,
        changeSummary: decision.change_summary,
      });

      const result = await this.imageService.generateLocationImage({
        campaignId,
        assetType: 'location',
        prompt,
        negativePrompt,
        locationId: loc.id,
        styleProfileId: style?.id,
        changeSummary: decision.change_summary,
      });

      await this.incrementUsage(campaignId);
      return result;
    }

    return null;
  }

  async getActiveCharacterPortrait(characterId: string): Promise<GeneratedAssetResult | null> {
    const asset = await prisma.asset.findFirst({
      where: { characterId, assetType: 'character_portrait', isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!asset) return null;
    return {
      assetId: asset.id,
      imageUrl: asset.imageUrl ?? undefined,
      localPath: asset.localPath ?? undefined,
      prompt: asset.prompt,
      version: asset.version,
    };
  }

  /** Portrait at character creation — always runs when an image API key is configured. */
  async generateCharacterPortraitOnCreate(
    characterId: string,
    guildId: string,
    ownerDiscordId: string,
    campaignId?: string | null,
  ): Promise<GeneratedAssetResult | null> {
    if (!config.image.apiKey) return null;

    const resolvedCampaignId =
      campaignId ?? (await ensureGuildAssetCampaign(guildId)).id;

    const check = await this.canGenerate(resolvedCampaignId, ownerDiscordId, {
      bypassAutoGate: true,
      skipUserCooldown: true,
    });
    if (!check.allowed) {
      logger.info(`Character portrait skipped: ${check.reason}`);
      return null;
    }

    try {
      return await this.generateCharacterPortrait(
        characterId,
        resolvedCampaignId,
        ownerDiscordId,
        { skipCooldown: true },
      );
    } catch (err) {
      logger.warn('Character portrait on create failed', err);
      return null;
    }
  }

  async generateCharacterPortrait(
    characterId: string,
    campaignId: string,
    ownerDiscordId: string,
    opts?: { skipCooldown?: boolean },
  ): Promise<GeneratedAssetResult> {
    const check = await this.canGenerate(campaignId, ownerDiscordId, {
      bypassAutoGate: Boolean(config.image.apiKey),
      skipUserCooldown: opts?.skipCooldown,
    });
    if (!check.allowed) throw new Error(check.reason ?? 'Generation not allowed');

    const character = await prisma.character.findUniqueOrThrow({ where: { id: characterId } });
    const style = await prisma.visualStyleProfile.findUnique({ where: { campaignId } });
    const styleProfile = {
      artStyle: style?.artStyle ?? 'dark fantasy painterly',
      colorPalette: style?.colorPalette ?? 'muted earth tones',
      lightingMood: style?.lightingMood ?? 'dramatic lighting',
      negativePrompt: style?.negativePrompt ?? 'text, watermark, UI',
      cameraFraming: 'portrait head and shoulders',
    };

    const { prompt, negativePrompt } = buildCharacterPortraitPrompt({
      name: character.name,
      race: character.race,
      className: character.className,
      appearance: character.appearance || character.portraitPrompt,
      styleProfile,
    });

    const result = await this.imageService.generateCharacterPortrait({
      campaignId,
      assetType: 'character_portrait',
      prompt,
      negativePrompt,
      characterId,
      ownerDiscordId,
      styleProfileId: style?.id,
    });

    userCooldowns.set(ownerDiscordId, Date.now());
    await this.incrementUsage(campaignId);
    return result;
  }

  async ensureNpcPortrait(
    campaignId: string,
    npcId: string,
    ownerDiscordId?: string,
  ): Promise<string | undefined> {
    const npc = await prisma.nPC.findUnique({ where: { id: npcId } });
    if (!npc) return undefined;

    if (npc.activeAssetId) {
      const active = await this.imageService.getAsset(npc.activeAssetId);
      const fromActive = await firstRenderablePortraitPath(active?.localPath);
      if (fromActive) return fromActive;
    }

    const existing = await prisma.asset.findFirst({
      where: { npcId, assetType: 'npc_portrait', isActive: true },
      orderBy: { version: 'desc' },
    });
    const fromExisting = await firstRenderablePortraitPath(existing?.localPath);
    if (fromExisting) return fromExisting;

    if (!config.image.apiKey) return undefined;

    const check = await this.canGenerate(campaignId, ownerDiscordId, {
      bypassAutoGate: true,
      skipUserCooldown: true,
    });
    if (!check.allowed) {
      logger.info(`NPC portrait skipped: ${check.reason}`);
      return undefined;
    }

    try {
      const style = await prisma.visualStyleProfile.findUnique({ where: { campaignId } });
      const styleProfile = {
        artStyle: style?.artStyle ?? 'dark fantasy painterly',
        colorPalette: style?.colorPalette ?? 'muted earth tones',
        lightingMood: style?.lightingMood ?? 'dramatic lighting',
        negativePrompt: style?.negativePrompt ?? 'text, watermark, UI',
        cameraFraming: 'portrait head and shoulders',
      };

      const appearance =
        npc.visualDescription?.trim() ||
        npc.description?.trim() ||
        `A memorable ${npc.name} fitting a medieval fantasy port town.`;

      const { prompt, negativePrompt } = buildNpcPortraitPrompt({
        name: npc.name,
        appearance,
        attitude: npc.attitude,
        styleProfile,
        mood: npc.attitude === 'hostile' ? ' wary, guarded' : undefined,
      });

      const result = await this.imageService.generateCharacterPortrait({
        campaignId,
        assetType: 'npc_portrait',
        prompt,
        negativePrompt,
        npcId,
        ownerDiscordId,
        styleProfileId: style?.id,
        changeSummary: 'First NPC portrait',
      });

      await this.incrementUsage(campaignId);
      return (await firstRenderablePortraitPath(result.localPath)) ?? undefined;
    } catch (err) {
      logger.warn('NPC portrait generation failed', err);
      return undefined;
    }
  }

  async getCharacterPortraitPath(characterId: string): Promise<string | undefined> {
    const active = await this.getActiveCharacterPortrait(characterId);
    const fromActive = await firstRenderablePortraitPath(active?.localPath);
    if (fromActive) return fromActive;

    // Active record may point at a stub .txt — try any portrait asset for this character.
    const assets = await prisma.asset.findMany({
      where: { characterId, assetType: 'character_portrait' },
      orderBy: { version: 'desc' },
      take: 5,
    });
    const fromHistory = await firstRenderablePortraitPath(...assets.map((a) => a.localPath));
    if (fromHistory) return fromHistory;

    // Script/legacy naming: character_portrait-{characterId}.png
    const legacy = join(config.image.outputDir, `character_portrait-${characterId}.png`);
    return (await firstRenderablePortraitPath(legacy)) ?? undefined;
  }

  async reuseLocationAsset(locationId: string): Promise<GeneratedAssetResult | null> {
    const location = await prisma.location.findUnique({ where: { id: locationId } });
    if (!location?.activeAssetId) return null;
    await prisma.location.update({
      where: { id: locationId },
      data: { visitCount: { increment: 1 } },
    });
    return this.imageService.getAsset(location.activeAssetId);
  }

  /** Opening scene art — always attempts when an image API key is configured. */
  async generateOpeningSceneImage(
    campaignId: string,
    location: { id: string; name: string; visualDescription: string; mood: string },
  ): Promise<GeneratedAssetResult | null> {
    if (!config.image.apiKey) return null;

    const style = await prisma.visualStyleProfile.findUnique({ where: { campaignId } });
    const styleProfile = {
      artStyle: style?.artStyle ?? 'dark fantasy painterly cinematic illustration',
      colorPalette: style?.colorPalette ?? 'muted earth tones, deep crimson accents, cold blue shadows',
      lightingMood: style?.lightingMood ?? 'dramatic chiaroscuro, rain-slick reflections',
      negativePrompt: style?.negativePrompt ?? 'text, watermark, UI, modern objects',
      cameraFraming: 'wide establishing shot, readable silhouettes',
    };

    const { prompt, negativePrompt: baseNegative } = buildLocationPrompt({
      name: location.name,
      visualDescription: location.visualDescription,
      mood: location.mood,
      styleProfile,
      changeSummary: 'Campaign opening — grounded execution yard, no surreal elements',
    });

    const negativePrompt = [
      baseNegative,
      'floating objects, levitating cages, impossible physics, surreal architecture, glowing cages in sky, fantasy floating structures, CGI gloss, oversaturated colors, AI artifacts, dreamlike distortions',
    ].join(', ');

    const result = await this.imageService.generateLocationImage({
      campaignId,
      assetType: 'location',
      prompt: `${prompt}. Grounded medieval realism. Scaffold and gibbets bolted to stone — nothing floating.`,
      negativePrompt,
      locationId: location.id,
      styleProfileId: style?.id,
      changeSummary: 'Opening scene',
    });

    await this.incrementUsage(campaignId);
    return result;
  }

  private async incrementUsage(campaignId: string): Promise<void> {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { imageGeneratedToday: { increment: 1 } },
    });
  }
}
