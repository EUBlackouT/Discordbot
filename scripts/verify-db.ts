/**
 * Verify Supabase / PostgreSQL connectivity.
 * Usage: npm run db:verify
 */
import '../src/config/load-env.js';
import { config } from '../src/config/index.js';
import { verifySupabaseApi } from '../src/lib/supabase.js';

async function check(label: string, url: string | undefined): Promise<boolean> {
  if (!url?.trim()) {
    console.log(`✗ ${label}: not set`);
    return false;
  }
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    console.log(`✗ ${label}: invalid PostgreSQL URL`);
    return false;
  }
  try {
    process.env.DATABASE_URL = url;
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    const result = await prisma.$queryRaw<[{ ok: number }]>`SELECT 1 as ok`;
    await prisma.$disconnect();
    const host = url.replace(/:[^:@]+@/, ':****@').split('?')[0];
    console.log(`✓ ${label}: connected (${host})`);
    return result[0]?.ok === 1;
  } catch (err) {
    console.log(`✗ ${label}: ${(err as Error).message}`);
    return false;
  }
}

console.log('Supabase / database connectivity\n');

if (config.supabase.url) {
  console.log(`Project: ${config.supabase.projectRef || config.supabase.url}`);
  const apiOk = await verifySupabaseApi();
  console.log(apiOk ? '✓ Supabase API: reachable' : '✗ Supabase API: check URL + anon/publishable key');
  console.log('');
}

const pool = await check('DATABASE_URL (bot)', process.env.DATABASE_URL);
const direct = await check('DIRECT_DATABASE_URL (migrations)', process.env.DIRECT_DATABASE_URL);

if (!direct && !pool) {
  if (config.supabase.url && !config.supabase.dbPassword) {
    console.log('\nAdd SUPABASE_DB_PASSWORD to .env (Supabase → Project Settings → Database).');
  } else {
    console.log('\nConfigure .env — see supabase/README.md');
  }
  process.exit(1);
}

if (process.env.DATABASE_URL?.includes('6543') && !process.env.DATABASE_URL.includes('pgbouncer=true')) {
  console.log('\n⚠ Add ?pgbouncer=true to DATABASE_URL when using Supabase Transaction pooler (port 6543)');
}

process.exit(pool && direct ? 0 : 1);
