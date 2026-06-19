-- AlterTable Character
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "classChoices" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "spellsKnown" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "spellsPrepared" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "spellSlots" TEXT NOT NULL DEFAULT '{}';

-- AlterTable RulesClass
ALTER TABLE "RulesClass" ADD COLUMN IF NOT EXISTS "level1Choices" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RulesClass" ADD COLUMN IF NOT EXISTS "startingEquipment" TEXT NOT NULL DEFAULT '[]';

-- AlterTable RulesBackground
ALTER TABLE "RulesBackground" ADD COLUMN IF NOT EXISTS "personalityTraits" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RulesBackground" ADD COLUMN IF NOT EXISTS "ideals" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RulesBackground" ADD COLUMN IF NOT EXISTS "bonds" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "RulesBackground" ADD COLUMN IF NOT EXISTS "flaws" TEXT NOT NULL DEFAULT '[]';

-- CreateTable RulesSpell
CREATE TABLE IF NOT EXISTS "RulesSpell" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "school" TEXT NOT NULL,
    "castingTime" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "components" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classes" TEXT NOT NULL DEFAULT '[]',
    "ritual" BOOLEAN NOT NULL DEFAULT false,
    "isHomebrew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RulesSpell_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RulesSpell_key_key" ON "RulesSpell"("key");
CREATE INDEX IF NOT EXISTS "RulesSpell_level_idx" ON "RulesSpell"("level");
