/**
 * One-off portrait generation for a character by name.
 * Usage: npx tsx scripts/generate-portrait.ts "Gyro ironbark"
 */
import '../src/config/load-env.js';
import { prisma, disconnectDb } from '../src/db/client.js';
import { AssetManager, createImageService } from '../src/assets/asset-manager.js';
import { ensureGuildAssetCampaign } from '../src/tenant/guild-asset-campaign.js';

const nameQuery = process.argv[2];
const lookOverride = process.argv[3];
if (!nameQuery) {
  console.error('Usage: npx tsx scripts/generate-portrait.ts "Character Name"');
  process.exit(1);
}

const assetManager = new AssetManager(createImageService());

try {
  const character = await prisma.character.findFirst({
    where: {
      name: { equals: nameQuery, mode: 'insensitive' },
      isActive: true,
      isComplete: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (!character) {
    const similar = await prisma.character.findMany({
      where: { isActive: true, name: { contains: nameQuery.split(' ')[0], mode: 'insensitive' } },
      select: { name: true, id: true, guildId: true },
      take: 10,
    });
    console.error(`No complete character named "${nameQuery}".`);
    if (similar.length) {
      console.error('Similar:', similar.map((c) => c.name).join(', '));
    }
    process.exit(1);
  }

  const campaignId =
    character.campaignId ?? (await ensureGuildAssetCampaign(character.guildId)).id;

  if (lookOverride) {
    const { updateCharacterAppearance } = await import('../src/game/character/service.js');
    await updateCharacterAppearance(character.id, lookOverride);
    console.log('Updated appearance from CLI argument.');
  }

  console.log(`Generating portrait for ${character.name} (${character.race} ${character.className})…`);

  const result = await assetManager.generateCharacterPortraitOnCreate(
    character.id,
    character.guildId,
    character.ownerDiscordId,
    campaignId,
  );

  if (!result?.localPath) {
    console.error('Portrait generation returned no image. Check IMAGE_API_KEY / AI_API_KEY and logs.');
    process.exit(1);
  }

  console.log('Portrait generated.');
  console.log(`Asset ID: ${result.assetId}`);
  console.log(`Version: ${result.version}`);
  console.log(`File: ${result.localPath}`);
} catch (err) {
  console.error('Failed:', (err as Error).message);
  process.exit(1);
} finally {
  await disconnectDb();
}
