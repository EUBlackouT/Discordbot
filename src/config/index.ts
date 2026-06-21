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
    dailyLimitPerCampaign: parseInt(process.env.IMAGE_DAILY_LIMIT_PER_CAMPAIGN ?? '25', 10),
    userCooldownMs: parseInt(process.env.IMAGE_USER_COOLDOWN_MS ?? '60000', 10),
    outputDir: process.env.IMAGE_OUTPUT_DIR ?? './assets/generated',
  },
  voice: {
    enabled: process.env.VOICE_ENABLED === 'true',
    provider: (process.env.VOICE_PROVIDER ?? 'elevenlabs') as 'elevenlabs' | 'stub',
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY ?? '',
    ttsModelId: process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5',
    /** Model for NPC lines when emotions enabled (v3 audio tags) */
    npcTtsModelId: process.env.ELEVENLABS_NPC_TTS_MODEL ?? 'eleven_v3',
    /** Chronicler / narrator — v3 for expressive storytelling; override with Flash for lower latency */
    narratorTtsModelId: process.env.ELEVENLABS_NARRATOR_TTS_MODEL ?? 'eleven_v3',
    /** Infer delivery tone + v3 audio tags / dynamic voice_settings */
    emotionsEnabled: process.env.VOICE_EMOTIONS_ENABLED !== 'false',
    narratorVoiceId: process.env.ELEVENLABS_NARRATOR_VOICE_ID ?? 'onwK4e9ZLuTAKqWW03F9',
    /** Max characters spoken per line (cost guard) */
    maxCharsPerLine: parseInt(process.env.VOICE_MAX_CHARS_PER_LINE ?? '1200', 10),
    /** off | narration | all */
    speakMode: (process.env.VOICE_SPEAK_MODE ?? 'all') as 'off' | 'narration' | 'all',
    tempDir: process.env.VOICE_TEMP_DIR ?? './assets/voice-cache',
    ambienceEnabled: process.env.VOICE_AMBIENCE_ENABLED !== 'false',
    ambienceDir: process.env.VOICE_AMBIENCE_DIR ?? './assets/ambience-cache',
    /** Loop bed volume under speech (0–1) */
    ambienceVolume: parseFloat(process.env.VOICE_AMBIENCE_VOLUME ?? '0.22'),
    speechVolume: parseFloat(process.env.VOICE_SPEECH_VOLUME ?? '1'),
    /** Contextual one-shot SFX when narration mentions bells, retching, etc. */
    spotSfxEnabled: process.env.VOICE_SPOT_SFX_ENABLED !== 'false',
    spotSfxVolume: parseFloat(process.env.VOICE_SPOT_SFX_VOLUME ?? '1'),
    spotSfxMaxPerClip: parseInt(process.env.VOICE_SPOT_SFX_MAX ?? '5', 10),
    /** Spot SFX cap per intro/TTS segment (each clip gets its own layered sounds). */
    spotSfxMaxPerSegment: parseInt(process.env.VOICE_SPOT_SFX_MAX_PER_SEGMENT ?? '3', 10),
    /** AI-generated spot SFX when regex cues miss sensory narration (live TTS). */
    spotSfxAiEnabled: process.env.VOICE_SPOT_SFX_AI !== 'false',
    /** Default silence between stitched narration segments (ms). */
    narrationPauseMs: parseInt(process.env.VOICE_NARRATION_PAUSE_MS ?? '650', 10),
    /** Play pre-rendered Mistharbor prologue from assets (instant `/campaign start` voice). */
    bakedIntroEnabled: process.env.VOICE_BAKED_INTRO !== 'false',
    bakedIntroDir: process.env.VOICE_BAKED_DIR ?? './assets/voice/baked',
    /** Optional fixed ElevenLabs voice IDs for intro NPC lines when baking (`npm run bake:intro`). */
    introNpcVoiceIds: {
      'Captain Mira Thornvale': process.env.INTRO_VOICE_THORNVALE_ID?.trim() ?? '',
      'Sister Caldra Venn': process.env.INTRO_VOICE_CALDRA_ID?.trim() ?? '',
    },
    /** ElevenLabs mp3 output — mp3_44100_192 needs Creator tier; falls back to 128 on error */
    audioOutputFormat: process.env.VOICE_AUDIO_FORMAT ?? 'mp3_44100_192',
    /** Pre-generated beds + spot SFX shipped with the bot (instant playback on VPS) */
    audioLibraryDir: process.env.VOICE_AUDIO_LIBRARY_DIR ?? './assets/audio-library',
    /** Prefer shipped library over per-campaign API generation */
    preferAudioLibrary: process.env.VOICE_PREFER_AUDIO_LIBRARY !== 'false',
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
