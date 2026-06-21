-- Plot director columns (run in Supabase → SQL Editor as project owner)
-- Required for plot thread tracking and /campaign threads.

ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "plotThreads" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "campaignThroughline" TEXT NOT NULL DEFAULT '';

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
  'plot_threads_manual',
  NOW(),
  '20250621190000_plot_threads',
  NULL,
  NULL,
  NOW(),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20250621190000_plot_threads'
);

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
  'campaign_throughline_manual',
  NOW(),
  '20250621200000_campaign_throughline',
  NULL,
  NULL,
  NOW(),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20250621200000_campaign_throughline'
);
