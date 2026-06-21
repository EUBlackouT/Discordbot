/**
 * Adds NPC voice columns when prisma migrate deploy cannot run (e.g. bot DB role lacks table owner).
 * Uses the Supabase postgres owner URL (SUPABASE_DB_PASSWORD), not the limited bot DATABASE_URL.
 * Safe to run multiple times (IF NOT EXISTS).
 */
import { buildSupabasePostgresUrls } from '../src/config/load-env.js';
import { PrismaClient } from '@prisma/client';

const statements = [
  `ALTER TABLE "NPC" ADD COLUMN IF NOT EXISTS "elevenLabsVoiceId" TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE "NPC" ADD COLUMN IF NOT EXISTS "voiceLabel" TEXT NOT NULL DEFAULT ''`,
];

function ownerDatabaseUrls(): string[] {
  const explicit = process.env.MIGRATION_DATABASE_URL?.trim();
  if (explicit) return [explicit];

  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!projectRef || !password) return [];

  const region = process.env.SUPABASE_REGION?.trim() || undefined;
  const urls = new Set<string>();
  // DDL requires the postgres owner — not the limited bot role (SUPABASE_DB_USER).
  for (const dbUser of ['postgres', process.env.SUPABASE_DB_USER?.trim()].filter(Boolean)) {
    urls.add(buildSupabasePostgresUrls(projectRef, password, region, dbUser!).directDatabaseUrl);
    urls.add(buildSupabasePostgresUrls(projectRef, password, undefined, dbUser!).directDatabaseUrl);
  }
  return [...urls];
}

async function main(): Promise<void> {
  const urls = ownerDatabaseUrls();
  if (urls.length === 0) {
    console.error(
      'Need SUPABASE_DB_PASSWORD (postgres owner) or MIGRATION_DATABASE_URL to alter tables.\n' +
        'Or run prisma/migrations/20250620210000_npc_voice_casting/migration.sql in Supabase → SQL Editor.',
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
      console.log('NPC voice columns ready.');
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
