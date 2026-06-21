-- NPC ElevenLabs voice casting (run in Supabase → SQL Editor as project owner)
-- Required for /campaign start after voice features were added.

ALTER TABLE "NPC" ADD COLUMN IF NOT EXISTS "elevenLabsVoiceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NPC" ADD COLUMN IF NOT EXISTS "voiceLabel" TEXT NOT NULL DEFAULT '';

-- Optional: keep Prisma migration history in sync
INSERT INTO "_prisma_migrations" (
  "id",
  "checksum",
  "finished_at",
  "migration_name",
  "logs",
  "rolled_back_at",
  "started_at",
  "applied_steps_count"
)
SELECT
  gen_random_uuid()::text,
  'npc_voice_casting_manual',
  NOW(),
  '20250620210000_npc_voice_casting',
  NULL,
  NULL,
  NOW(),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20250620210000_npc_voice_casting'
);
