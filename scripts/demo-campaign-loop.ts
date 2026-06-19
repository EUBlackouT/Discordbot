/**
 * Demo script simulating the core campaign loop without Discord.
 * Requires PostgreSQL (run npm run setup first).
 */
import '../src/config/load-env.js';
import { execSync } from 'child_process';

if (!process.env.DATABASE_URL?.startsWith('postgres')) {
  console.error('DATABASE_URL must point to Supabase/PostgreSQL. See supabase/README.md');
  process.exit(1);
}

execSync('npx prisma migrate deploy', { stdio: 'inherit' });
execSync('npm run db:seed', { stdio: 'inherit' });

const { prisma, disconnectDb } = await import('../src/db/client.js');
const { upsertCharacterDraft, finalizeCharacter } = await import('../src/game/character/service.js');
const { startCampaign, buildStatePacket, getCampaignRecap } = await import('../src/campaign/state.js');
const { processCampaignMessage, processCheckRoll } = await import('../src/core/campaign-loop.js');
const { AssetManager, createImageService } = await import('../src/assets/asset-manager.js');
const { ensureGuild } = await import('../src/tenant/guild-service.js');
const { joinCampaign } = await import('../src/tenant/campaign-member.js');

const DISCORD_ID = 'demo-user-001';
const GUILD_ID = 'demo-guild-001';
const CHANNEL_ID = 'demo-channel-001';

async function cleanupDemoData() {
  const campaigns = await prisma.campaign.findMany({ where: { guildId: GUILD_ID }, select: { id: true } });
  for (const c of campaigns) {
    await prisma.conversationTurn.deleteMany({ where: { campaignId: c.id } });
    await prisma.pendingCheck.deleteMany({ where: { campaignId: c.id } });
    await prisma.campaignMember.deleteMany({ where: { campaignId: c.id } });
    await prisma.campaignChannel.deleteMany({ where: { campaignId: c.id } });
    await prisma.memoryEntry.deleteMany({ where: { campaignId: c.id } });
    await prisma.asset.deleteMany({ where: { campaignId: c.id } });
    await prisma.campaign.delete({ where: { id: c.id } });
  }
  await prisma.character.deleteMany({ where: { guildId: GUILD_ID } });
  await prisma.characterCreationDraft.deleteMany({ where: { guildId: GUILD_ID } });
}

console.log('\n=== Cleanup prior demo data ===');
await cleanupDemoData();

console.log('\n=== 0. Register guild ===');
await ensureGuild(GUILD_ID, 'Demo Community');

console.log('\n=== 1. Create character ===');
await upsertCharacterDraft(GUILD_ID, DISCORD_ID, 'finalize', {
  name: 'Demo Rogue',
  raceKey: 'human',
  race: 'Human',
  classKey: 'rogue',
  className: 'Rogue',
  background: 'Criminal',
  backgroundKey: 'criminal',
  abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 12, WIS: 13, CHA: 8 },
  savingThrows: ['DEX', 'INT'],
  skillProficiencies: ['Stealth', 'Investigation', 'Perception', 'Deception'],
  hitPoints: 10,
  maxHitPoints: 10,
  hitDice: '1d8',
  armorClass: 14,
  speed: 30,
  appearanceAnswers: { face: 'Sharp eyes, dark hood', clothing: 'Leather armor' },
});
const character = await finalizeCharacter(GUILD_ID, DISCORD_ID);
console.log(`Created: ${character.name} (${character.id})`);

console.log('\n=== 2. Portrait prompt ===');
console.log(character.portraitPrompt.slice(0, 120) + '...');

console.log('\n=== 3. Start campaign ===');
const { campaign, location, openingNarration } = await startCampaign(GUILD_ID, CHANNEL_ID);
await joinCampaign(campaign.id, GUILD_ID, DISCORD_ID, character.name);
console.log(`Campaign: ${campaign.name}`);
console.log(`Location: ${location.name}`);
console.log(openingNarration.slice(0, 100) + '...');

console.log('\n=== 4. Generate location image ===');
await prisma.campaign.update({
  where: { id: campaign.id },
  data: { imageAutoGenerate: true },
});
const assetManager = new AssetManager(createImageService());
const state1 = await buildStatePacket(campaign.id);
const locAsset = await assetManager.decideAndExecute(campaign.id, state1, {
  should_generate_image: true,
  reason: 'First visit',
  asset_type: 'location',
  new_asset_needed: true,
});
console.log(`Location asset: ${locAsset?.assetId} v${locAsset?.version}`);

console.log('\n=== 5. Player investigates ===');
const turn1 = await processCampaignMessage(
  campaign.id,
  DISCORD_ID,
  'I search the room for anything strange.',
  character.id,
);
console.log(`Controller: ${turn1.controllerAction}`);
console.log(`Pending check: ${turn1.pendingCheck}`);
console.log(turn1.narration.slice(0, 150) + '...');

console.log('\n=== 6. Player rolls check ===');
const rollResult = await processCheckRoll(campaign.id, DISCORD_ID);
console.log(`Roll resolved: ${rollResult.rollResolved}`);
console.log(rollResult.narration.slice(0, 200) + '...');

console.log('\n=== 7. Return to location — reuse asset ===');
const reused = await assetManager.reuseLocationAsset(location.id);
console.log(`Reused asset: ${reused?.assetId} (same as ${locAsset?.assetId})`);
console.log(`Match: ${reused?.assetId === locAsset?.assetId}`);

console.log('\n=== 8. Recap ===');
const recap = await getCampaignRecap(campaign.id);
console.log(recap.slice(0, 300) + '...');

console.log('\n=== Demo complete ===');
await disconnectDb();
