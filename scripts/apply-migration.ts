import '../src/config/load-env.js';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  const sql = readFileSync(
    join(__dirname, '../prisma/migrations/20250619171500_character_creator_full/migration.sql'),
    'utf8',
  );
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
    console.log('Applied:', stmt.slice(0, 60).replace(/\n/g, ' '));
  }
  console.log('Migration applied.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
