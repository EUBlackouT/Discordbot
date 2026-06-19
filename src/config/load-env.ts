/**
 * Load .env and derive Supabase / Postgres connection strings when possible.
 * Import this module before Prisma or any code that reads DATABASE_URL.
 */
import 'dotenv/config';

function firstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

export function parseSupabaseProjectRef(url: string): string | null {
  const match = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i);
  return match?.[1] ?? null;
}

export function buildSupabasePostgresUrls(
  projectRef: string,
  password: string,
  region?: string,
  dbUser = 'postgres',
): { databaseUrl: string; directDatabaseUrl: string } {
  const encodedPassword = encodeURIComponent(password);
  const poolerUser = dbUser === 'postgres' ? `postgres.${projectRef}` : `${dbUser}.${projectRef}`;

  if (region) {
    const poolerHost =
      process.env.SUPABASE_POOLER_HOST ?? `aws-1-${region}.pooler.supabase.com`;
    const directDatabaseUrl = `postgresql://${poolerUser}:${encodedPassword}@${poolerHost}:5432/postgres`;
    const databaseUrl = `postgresql://${poolerUser}:${encodedPassword}@${poolerHost}:6543/postgres?pgbouncer=true&connection_limit=10`;
    return { databaseUrl, directDatabaseUrl };
  }

  const directDatabaseUrl = `postgresql://${dbUser}:${encodedPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  return { databaseUrl: directDatabaseUrl, directDatabaseUrl };
}

export function applySupabaseEnv(): void {
  const supabaseUrl = firstEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
  const publishableKey = firstEnv(
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  if (supabaseUrl) {
    process.env.SUPABASE_URL = supabaseUrl;
  }
  if (publishableKey) {
    process.env.SUPABASE_ANON_KEY = publishableKey;
  }

  const projectRef =
    firstEnv('SUPABASE_PROJECT_REF') ?? (supabaseUrl ? parseSupabaseProjectRef(supabaseUrl) : null);
  if (projectRef) {
    process.env.SUPABASE_PROJECT_REF = projectRef;
  }

  const dbPassword = firstEnv('SUPABASE_DB_PASSWORD');
  const dbUser = firstEnv('SUPABASE_DB_USER') || 'postgres';
  if (projectRef && dbPassword) {
    const region = firstEnv('SUPABASE_REGION') || undefined;
    const { databaseUrl, directDatabaseUrl } = buildSupabasePostgresUrls(
      projectRef,
      dbPassword,
      region,
      dbUser,
    );

    if (!process.env.DIRECT_DATABASE_URL?.trim()) {
      process.env.DIRECT_DATABASE_URL = directDatabaseUrl;
    }
    if (!process.env.DATABASE_URL?.trim()) {
      process.env.DATABASE_URL = databaseUrl;
    }
  }
}

applySupabaseEnv();
