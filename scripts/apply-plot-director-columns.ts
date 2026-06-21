/**
 * Adds plot director columns when prisma migrate deploy cannot run.
 * Safe to run multiple times (IF NOT EXISTS).
 */
import { buildSupabasePostgresUrls } from '../src/config/load-env.js';
import { PrismaClient } from '@prisma/client';

const statements = [
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "plotThreads" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "campaignThroughline" TEXT NOT NULL DEFAULT ''`,
];

function ownerDatabaseUrls(): string[] {
  const urls = new Set<string>();

  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (projectRef && password) {
    const region = process.env.SUPABASE_REGION?.trim() || undefined;
    // Postgres owner first — bot role cannot ALTER TABLE
    urls.add(buildSupabasePostgresUrls(projectRef, password, region, 'postgres').directDatabaseUrl);
    urls.add(buildSupabasePostgresUrls(projectRef, password, undefined, 'postgres').directDatabaseUrl);
  }

  const explicit = process.env.MIGRATION_DATABASE_URL?.trim();
  if (explicit) urls.add(explicit);

  const direct = process.env.DIRECT_DATABASE_URL?.trim();
  if (direct) urls.add(direct);

  return [...urls];
}

async function main(): Promise<void> {
  const urls = ownerDatabaseUrls();
  if (urls.length === 0) {
    console.error(
      'Need DIRECT_DATABASE_URL, MIGRATION_DATABASE_URL, or SUPABASE_DB_PASSWORD to alter tables.\n' +
        'Or run prisma/migrations/20250621190000_plot_threads and 20250621200000_campaign_throughline in Supabase SQL Editor.',
    );
    process.exit(1);
  }

  let lastError: unknown;
  for (const url of urls) {
    const host = url.replace(/:[^:@]+@/, ':****@').split('?')[0];
    console.log(`Trying ${host} …`);
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    try {
      for (const stmt of statements) {
        await prisma.$executeRawUnsafe(stmt);
        console.log('Applied:', stmt);
      }
      console.log('Plot director columns ready.');
      return;
    } catch (err) {
      lastError = err;
      console.warn(`Failed on ${host}:`, (err as Error).message);
    } finally {
      await prisma.$disconnect();
    }
  }

  throw lastError;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
