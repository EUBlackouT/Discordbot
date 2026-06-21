-- Per-NPC ElevenLabs voice casting (persisted, AI-assigned)
ALTER TABLE "NPC" ADD COLUMN IF NOT EXISTS "elevenLabsVoiceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NPC" ADD COLUMN IF NOT EXISTS "voiceLabel" TEXT NOT NULL DEFAULT '';
