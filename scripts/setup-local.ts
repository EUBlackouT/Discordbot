/**
 * Database setup: run migrations + seed rules data.
 * Requires PostgreSQL already running (native install, cloud, or optional Docker).
 *
 * Usage:
 *   npm run setup              # migrate + seed (uses DATABASE_URL from .env)
 *   npm run setup -- --docker    # also start Docker Postgres first
 */
import 'dotenv/config';
import { execSync } from 'child_process';

const useDocker = process.argv.includes('--docker');

function run(cmd: string) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

async function canConnect(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url } } });
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$disconnect();
    return true;
  } catch {
    return false;
  }
}

async function waitForPostgres(maxAttempts = 15): Promise<void> {
  for (let i = 1; i <= maxAttempts; i++) {
    if (await canConnect()) {
      console.log('PostgreSQL is ready.');
      return;
    }
    console.log(`Waiting for PostgreSQL... (${i}/${maxAttempts})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('PostgreSQL did not become ready in time.');
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and configure PostgreSQL.');
  process.exit(1);
}

if (useDocker) {
  console.log('Starting PostgreSQL via Docker Compose (optional)...');
  run('docker compose up -d');
  await waitForPostgres();
} else if (!(await canConnect())) {
  console.error(`
Cannot connect to PostgreSQL at DATABASE_URL.

You do NOT need Docker. Pick one:

  A) Native PostgreSQL (Windows installer)
     https://www.postgresql.org/download/windows/
     Create a database, then set DATABASE_URL in .env

  B) Free cloud Postgres (no local install)
     Neon, Supabase, or Railway — paste the connection string into .env

  C) Optional Docker Postgres
     npm run setup -- --docker

Then run: npm run setup
`);
  process.exit(1);
} else {
  console.log('Connected to PostgreSQL.');
}

console.log('Running migrations...');
run('npx prisma migrate deploy');

console.log('Seeding rules data...');
run('npm run db:seed');

console.log('\nSetup complete. Next steps:');
console.log('  1. Add DISCORD_TOKEN + DISCORD_CLIENT_ID to .env');
console.log('  2. npm run register-commands');
console.log('  3. npm run dev');
