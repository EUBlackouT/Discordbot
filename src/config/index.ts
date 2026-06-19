import './load-env.js';

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export const config = {
  discord: {
    token: process.env.DISCORD_TOKEN ?? '',
    clientId: process.env.DISCORD_CLIENT_ID ?? '',
    guildId: process.env.DISCORD_GUILD_ID,
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    projectRef: process.env.SUPABASE_PROJECT_REF ?? '',
    dbPassword: process.env.SUPABASE_DB_PASSWORD ?? '',
    region: process.env.SUPABASE_REGION ?? '',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
    directUrl: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  ai: {
    provider: (process.env.AI_PROVIDER ?? 'mock') as 'openai' | 'mock',
    apiKey: process.env.AI_API_KEY ?? '',
    models: {
      controller: process.env.AI_MODEL_CONTROLLER ?? 'gpt-4o-mini',
      narrator: process.env.AI_MODEL_NARRATOR ?? 'gpt-4o-mini',
      memory: process.env.AI_MODEL_MEMORY ?? 'gpt-4o-mini',
    },
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10),
  },
  image: {
    provider: (process.env.IMAGE_PROVIDER ?? 'stub') as 'stub' | 'openai',
    apiKey: process.env.IMAGE_API_KEY ?? process.env.AI_API_KEY ?? '',
    model: process.env.IMAGE_MODEL ?? 'gpt-image-1',
    autoGenerate: process.env.IMAGE_AUTO_GENERATE === 'true',
    dailyLimitPerCampaign: parseInt(process.env.IMAGE_DAILY_LIMIT_PER_CAMPAIGN ?? '10', 10),
    userCooldownMs: parseInt(process.env.IMAGE_USER_COOLDOWN_MS ?? '60000', 10),
    outputDir: process.env.IMAGE_OUTPUT_DIR ?? './assets/generated',
  },
  campaign: {
    dataDir: process.env.CAMPAIGN_DATA_DIR ?? './data/campaigns',
  },
  admin: {
    discordIds: parseList(process.env.ADMIN_DISCORD_IDS),
  },
  logLevel: process.env.LOG_LEVEL ?? 'info',
} as const;

export function validateDiscordConfig(): string[] {
  const errors: string[] = [];
  if (!config.discord.token) errors.push('DISCORD_TOKEN is required');
  if (!config.discord.clientId) errors.push('DISCORD_CLIENT_ID is required');
  return errors;
}

export function validateDatabaseConfig(): string[] {
  const errors: string[] = [];
  if (!config.database.url) {
    if (config.supabase.url && !config.supabase.dbPassword) {
      errors.push(
        'SUPABASE_DB_PASSWORD is required (Project Settings → Database → database password)',
      );
    } else {
      errors.push('DATABASE_URL is required (or set SUPABASE_URL + SUPABASE_DB_PASSWORD)');
    }
  }
  if (!config.database.directUrl) {
    errors.push('DIRECT_DATABASE_URL is required for migrations');
  }
  if (
    config.database.url &&
    !config.database.url.startsWith('postgresql://') &&
    !config.database.url.startsWith('postgres://')
  ) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string');
  }
  return errors;
}

export function validateConfig(): string[] {
  const errors = validateDiscordConfig();
  errors.push(...validateDatabaseConfig());
  if (config.ai.provider === 'openai' && !config.ai.apiKey) {
    errors.push('AI_API_KEY is required when AI_PROVIDER=openai');
  }
  return errors;
}
