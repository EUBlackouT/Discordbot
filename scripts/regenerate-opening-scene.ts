/**
 * Regenerate opening scene art for the active campaign location.
 * Usage: npx tsx scripts/regenerate-opening-scene.ts [campaign-name]
 */
import '../src/config/load-env.js';
import { prisma, disconnectDb } from '../src/db/client.js';
import { AssetManager, createImageService } from '../src/assets/asset-manager.js';
import { INTRO_LOCATION } from '../src/campaign/intro.js';

const nameQuery = process.argv[2] ?? 'The Veiled Compact';
const assetManager = new AssetManager(createImageService());

try {
  const campaign = await prisma.campaign.findFirst({
    where: { name: { contains: nameQuery, mode: 'insensitive' }, status: 'active' },
    include: { locations: { where: { slug: INTRO_LOCATION.slug }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });

  if (!campaign) {
    console.error(`No active campaign matching "${nameQuery}".`);
    process.exit(1);
  }

  let location = campaign.locations[0];
  if (!location) {
    console.error('Intro location not found on this campaign.');
    process.exit(1);
  }

  location = await prisma.location.update({
    where: { id: location.id },
    data: {
      visualDescription: INTRO_LOCATION.visualDescription,
      mood: INTRO_LOCATION.mood,
    },
  });

  console.log(`Regenerating opening scene for ${campaign.name}…`);

  const result = await assetManager.generateOpeningSceneImage(campaign.id, {
    id: location.id,
    name: location.name,
    visualDescription: location.visualDescription,
    mood: location.mood,
  });

  if (!result?.localPath?.match(/\.(png|jpe?g|webp)$/i)) {
    console.error('No image produced. Check IMAGE_API_KEY / AI_API_KEY.');
    process.exit(1);
  }

  console.log('Opening scene regenerated.');
  console.log(`File: ${result.localPath}`);
} catch (err) {
  console.error('Failed:', (err as Error).message);
  process.exit(1);
} finally {
  await disconnectDb();
}
