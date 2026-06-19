/**

 * Connect to Supabase Postgres, run migrations, seed rules data.

 * Usage: npm run setup

 */

import '../src/config/load-env.js';

import { config } from '../src/config/index.js';

import { execSync } from 'child_process';



function run(cmd: string) {

  console.log(`> ${cmd}`);

  execSync(cmd, { stdio: 'inherit', shell: true, env: process.env });

}



async function testConnection(url: string, label: string): Promise<boolean> {

  try {

    const { PrismaClient } = await import('@prisma/client');

    const prisma = new PrismaClient({ datasources: { db: { url } } });

    await prisma.$queryRaw`SELECT 1`;

    await prisma.$disconnect();

    console.log(`✓ ${label} OK`);

    return true;

  } catch (err) {

    console.error(`✗ ${label} failed:`, (err as Error).message);

    return false;

  }

}



if (!process.env.DATABASE_URL) {

  console.error(`

DATABASE_URL is missing.



Option A — auto-build (recommended):

  SUPABASE_URL=https://YOUR_REF.supabase.co

  SUPABASE_ANON_KEY=your_publishable_key

  SUPABASE_DB_PASSWORD=your_database_password



Option B — paste full strings from Supabase → Connect:

  DATABASE_URL=... (Transaction pooler, port 6543)

  DIRECT_DATABASE_URL=... (Direct, port 5432)



See supabase/README.md

`);

  process.exit(1);

}



if (!process.env.DIRECT_DATABASE_URL) {

  console.error('DIRECT_DATABASE_URL is required for migrations. See supabase/README.md');

  process.exit(1);

}



console.log(`Supabase project: ${config.supabase.projectRef || config.supabase.url || 'unknown'}\n`);

console.log('Checking database connections...\n');



const directOk = await testConnection(process.env.DIRECT_DATABASE_URL, 'Direct URL (migrations)');

if (!directOk) {

  console.error(`

Fix DIRECT_DATABASE_URL / SUPABASE_DB_PASSWORD first.

Password: Supabase → Project Settings → Database → database password

See supabase/README.md

`);

  process.exit(1);

}



const poolOk = await testConnection(process.env.DATABASE_URL, 'Bot URL (runtime)');

if (!poolOk) {

  console.warn('\nBot URL failed — check DATABASE_URL or SUPABASE_DB_PASSWORD');

}



console.log('\nApplying database schema to Supabase...');

run('npx prisma migrate deploy');



console.log('\nSeeding SRD rules data...');

run('npm run db:seed');



console.log(`

✓ Supabase is ready.



Next:

  1. Add DISCORD_TOKEN and DISCORD_CLIENT_ID to .env

  2. npm run register-commands

  3. npm run dev



View tables in Supabase → Table Editor.

`);

