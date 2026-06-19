/**
 * Generate SQL to seed rules tables. Used with Supabase MCP execute_sql.
 * Usage: npx tsx scripts/generate-seed-sql.ts
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../prisma/seed/data');

function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(dataDir, filename), 'utf-8')) as T;
}

const statements: string[] = [];

const races = loadJson<Array<Record<string, unknown>>>('races.json');
for (const race of races) {
  statements.push(
    `INSERT INTO "RulesRace" (id, key, name, speed, size, traits, "abilityBonuses", languages, "isHomebrew") VALUES (gen_random_uuid()::text, '${esc(race.key as string)}', '${esc(race.name as string)}', ${race.speed}, '${esc(race.size as string)}', '${esc(JSON.stringify(race.traits))}', '${esc(JSON.stringify(race.abilityBonuses))}', '${esc(JSON.stringify(race.languages))}', false) ON CONFLICT (key) DO NOTHING;`,
  );
}

const classes = loadJson<Array<Record<string, unknown>>>('classes.json');
for (const cls of classes) {
  const spellcasting = cls.spellcasting ? `'${esc(JSON.stringify(cls.spellcasting))}'` : 'NULL';
  statements.push(
    `INSERT INTO "RulesClass" (id, key, name, "hitDie", "primaryAbility", "savingThrows", "skillChoices", features, spellcasting, "isHomebrew") VALUES (gen_random_uuid()::text, '${esc(cls.key as string)}', '${esc(cls.name as string)}', '${esc(cls.hitDie as string)}', '${esc(cls.primaryAbility as string)}', '${esc(JSON.stringify(cls.savingThrows))}', '${esc(JSON.stringify(cls.skillChoices))}', '${esc(JSON.stringify(cls.features))}', ${spellcasting}, false) ON CONFLICT (key) DO NOTHING;`,
  );
}

const backgrounds = loadJson<Array<Record<string, unknown>>>('backgrounds.json');
for (const bg of backgrounds) {
  statements.push(
    `INSERT INTO "RulesBackground" (id, key, name, "skillProficiencies", features, equipment, "isHomebrew") VALUES (gen_random_uuid()::text, '${esc(bg.key as string)}', '${esc(bg.name as string)}', '${esc(JSON.stringify(bg.skillProficiencies))}', '${esc(JSON.stringify(bg.features))}', '${esc(JSON.stringify(bg.equipment))}', false) ON CONFLICT (key) DO NOTHING;`,
  );
}

const skills = loadJson<Array<Record<string, unknown>>>('skills.json');
for (const skill of skills) {
  statements.push(
    `INSERT INTO "RulesSkill" (id, key, name, ability) VALUES (gen_random_uuid()::text, '${esc(skill.key as string)}', '${esc(skill.name as string)}', '${esc(skill.ability as string)}') ON CONFLICT (key) DO NOTHING;`,
  );
}

const conditions = loadJson<Array<Record<string, unknown>>>('conditions.json');
for (const cond of conditions) {
  statements.push(
    `INSERT INTO "RulesCondition" (id, key, name, description) VALUES (gen_random_uuid()::text, '${esc(cond.key as string)}', '${esc(cond.name as string)}', '${esc(cond.description as string)}') ON CONFLICT (key) DO NOTHING;`,
  );
}

// Prisma migration tracking so `prisma migrate deploy` stays in sync
statements.push(`
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id VARCHAR(36) PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMPTZ,
  migration_name VARCHAR(255) NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
SELECT gen_random_uuid()::text, 'mcp_applied', now(), '20250619180000_init_postgresql', 1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20250619180000_init_postgresql'
);
`);

console.log(statements.join('\n'));
