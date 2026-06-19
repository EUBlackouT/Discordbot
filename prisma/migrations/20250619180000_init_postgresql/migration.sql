-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "planTier" TEXT NOT NULL DEFAULT 'free',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'active',
    "maxCampaignChannels" INTEGER NOT NULL DEFAULT 5,
    "maxPartySize" INTEGER NOT NULL DEFAULT 8,
    "imageAutoGenerate" BOOLEAN NOT NULL DEFAULT false,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentSceneId" TEXT,
    "currentLocationId" TEXT,
    "sessionSummary" TEXT NOT NULL DEFAULT '',
    "dangerLevel" INTEGER NOT NULL DEFAULT 3,
    "openThreads" TEXT NOT NULL DEFAULT '[]',
    "resolvedThreads" TEXT NOT NULL DEFAULT '[]',
    "imageAutoGenerate" BOOLEAN NOT NULL DEFAULT false,
    "imageDailyLimit" INTEGER NOT NULL DEFAULT 10,
    "imageGeneratedToday" INTEGER NOT NULL DEFAULT 0,
    "imageLimitResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignChannel" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMember" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "campaignId" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "campaignId" TEXT,
    "playerId" TEXT NOT NULL,
    "ownerDiscordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "abilityScores" TEXT NOT NULL,
    "abilityMods" TEXT NOT NULL,
    "proficiencyBonus" INTEGER NOT NULL DEFAULT 2,
    "savingThrows" TEXT NOT NULL DEFAULT '[]',
    "skillProficiencies" TEXT NOT NULL DEFAULT '[]',
    "armorClass" INTEGER NOT NULL DEFAULT 10,
    "hitPoints" INTEGER NOT NULL,
    "maxHitPoints" INTEGER NOT NULL,
    "hitDice" TEXT NOT NULL,
    "initiative" INTEGER NOT NULL DEFAULT 0,
    "speed" INTEGER NOT NULL DEFAULT 30,
    "passivePerception" INTEGER NOT NULL DEFAULT 10,
    "equipment" TEXT NOT NULL DEFAULT '[]',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "features" TEXT NOT NULL DEFAULT '[]',
    "spellcasting" TEXT,
    "personality" TEXT NOT NULL DEFAULT '',
    "ideals" TEXT NOT NULL DEFAULT '',
    "bonds" TEXT NOT NULL DEFAULT '',
    "flaws" TEXT NOT NULL DEFAULT '',
    "backstory" TEXT NOT NULL DEFAULT '',
    "appearance" TEXT NOT NULL DEFAULT '',
    "portraitPrompt" TEXT NOT NULL DEFAULT '',
    "conditions" TEXT NOT NULL DEFAULT '[]',
    "inventory" TEXT NOT NULL DEFAULT '[]',
    "currency" TEXT NOT NULL DEFAULT '{}',
    "currentLocationId" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCreationDraft" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "campaignId" TEXT,
    "step" TEXT NOT NULL DEFAULT 'name',
    "data" TEXT NOT NULL DEFAULT '{}',
    "abilityMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCreationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mood" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "visualDescription" TEXT NOT NULL DEFAULT '',
    "mood" TEXT NOT NULL DEFAULT '',
    "lighting" TEXT NOT NULL DEFAULT '',
    "architecture" TEXT NOT NULL DEFAULT '',
    "landmarks" TEXT NOT NULL DEFAULT '[]',
    "persistentObjects" TEXT NOT NULL DEFAULT '[]',
    "currentChanges" TEXT NOT NULL DEFAULT '',
    "activeAssetId" TEXT,
    "isMajor" BOOLEAN NOT NULL DEFAULT true,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NPC" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "visualDescription" TEXT NOT NULL DEFAULT '',
    "goals" TEXT NOT NULL DEFAULT '',
    "secrets" TEXT NOT NULL DEFAULT '',
    "attitude" TEXT NOT NULL DEFAULT 'neutral',
    "locationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "activeAssetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NPC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "goals" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "objectives" TEXT NOT NULL DEFAULT '[]',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryEntry" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 3,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "relatedIds" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "characterId" TEXT,
    "message" TEXT NOT NULL,
    "response" TEXT,
    "controllerAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollHistory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "characterId" TEXT,
    "rollerDiscordId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "rawDice" TEXT NOT NULL,
    "keptDice" TEXT NOT NULL,
    "droppedDice" TEXT NOT NULL DEFAULT '[]',
    "modifier" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "advantageState" TEXT NOT NULL DEFAULT 'normal',
    "checkType" TEXT,
    "skill" TEXT,
    "ability" TEXT,
    "dc" INTEGER,
    "success" BOOLEAN,
    "pendingCheckId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RollHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingCheck" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "targetDiscordId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "checkType" TEXT NOT NULL,
    "skill" TEXT,
    "ability" TEXT NOT NULL,
    "dc" INTEGER NOT NULL,
    "advantageState" TEXT NOT NULL DEFAULT 'normal',
    "publicReason" TEXT NOT NULL,
    "successConsequence" TEXT NOT NULL,
    "failureConsequence" TEXT NOT NULL,
    "controllerReason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rollId" TEXT,
    "resolvedSuccess" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PendingCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CombatState" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "round" INTEGER NOT NULL DEFAULT 1,
    "currentTurn" INTEGER NOT NULL DEFAULT 0,
    "participants" TEXT NOT NULL,
    "initiativeOrder" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "CombatState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "characterId" TEXT,
    "locationId" TEXT,
    "npcId" TEXT,
    "ownerDiscordId" TEXT,
    "assetType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "localPath" TEXT,
    "provider" TEXT NOT NULL,
    "providerMeta" TEXT NOT NULL DEFAULT '{}',
    "styleProfileId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "changeSummary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualStyleProfile" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "artStyle" TEXT NOT NULL DEFAULT 'dark fantasy painterly cinematic illustration',
    "cameraFraming" TEXT NOT NULL DEFAULT 'medium shot, readable silhouettes',
    "colorPalette" TEXT NOT NULL DEFAULT 'muted earth tones, deep crimson accents, cold blue shadows',
    "lightingMood" TEXT NOT NULL DEFAULT 'dramatic chiaroscuro, rain-slick reflections',
    "fantasyTone" TEXT NOT NULL DEFAULT 'grounded medieval fantasy, political intrigue',
    "realismLevel" TEXT NOT NULL DEFAULT 'stylized realism',
    "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
    "negativePrompt" TEXT NOT NULL DEFAULT 'text, watermark, UI, modern objects, logos, blurry',
    "consistencyRules" TEXT NOT NULL DEFAULT 'maintain visual identity across versions',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualStyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesRace" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL DEFAULT 30,
    "size" TEXT NOT NULL DEFAULT 'Medium',
    "traits" TEXT NOT NULL DEFAULT '[]',
    "abilityBonuses" TEXT NOT NULL DEFAULT '{}',
    "languages" TEXT NOT NULL DEFAULT '[]',
    "isHomebrew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RulesRace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesClass" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hitDie" TEXT NOT NULL,
    "primaryAbility" TEXT NOT NULL,
    "savingThrows" TEXT NOT NULL DEFAULT '[]',
    "skillChoices" TEXT NOT NULL DEFAULT '{}',
    "features" TEXT NOT NULL DEFAULT '[]',
    "spellcasting" TEXT,
    "isHomebrew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RulesClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesBackground" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "skillProficiencies" TEXT NOT NULL DEFAULT '[]',
    "features" TEXT NOT NULL DEFAULT '[]',
    "equipment" TEXT NOT NULL DEFAULT '[]',
    "isHomebrew" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RulesBackground_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesSkill" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ability" TEXT NOT NULL,

    CONSTRAINT "RulesSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulesCondition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "RulesCondition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_guildId_idx" ON "Campaign"("guildId");

-- CreateIndex
CREATE INDEX "Campaign_guildId_status_idx" ON "Campaign"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignChannel_channelId_key" ON "CampaignChannel"("channelId");

-- CreateIndex
CREATE INDEX "CampaignMember_discordId_idx" ON "CampaignMember"("discordId");

-- CreateIndex
CREATE INDEX "CampaignMember_campaignId_isActive_idx" ON "CampaignMember"("campaignId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMember_campaignId_discordId_key" ON "CampaignMember"("campaignId", "discordId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMember_campaignId_characterId_key" ON "CampaignMember"("campaignId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_discordId_campaignId_key" ON "Player"("discordId", "campaignId");

-- CreateIndex
CREATE INDEX "Character_guildId_ownerDiscordId_idx" ON "Character"("guildId", "ownerDiscordId");

-- CreateIndex
CREATE INDEX "Character_campaignId_idx" ON "Character"("campaignId");

-- CreateIndex
CREATE INDEX "Character_ownerDiscordId_idx" ON "Character"("ownerDiscordId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_guildId_ownerDiscordId_name_key" ON "Character"("guildId", "ownerDiscordId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterCreationDraft_guildId_discordId_key" ON "CharacterCreationDraft"("guildId", "discordId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_campaignId_slug_key" ON "Location"("campaignId", "slug");

-- CreateIndex
CREATE INDEX "Quest_campaignId_status_idx" ON "Quest"("campaignId", "status");

-- CreateIndex
CREATE INDEX "MemoryEntry_campaignId_category_isActive_idx" ON "MemoryEntry"("campaignId", "category", "isActive");

-- CreateIndex
CREATE INDEX "MemoryEntry_campaignId_createdAt_idx" ON "MemoryEntry"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationTurn_campaignId_createdAt_idx" ON "ConversationTurn"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationTurn_discordId_idx" ON "ConversationTurn"("discordId");

-- CreateIndex
CREATE INDEX "RollHistory_campaignId_createdAt_idx" ON "RollHistory"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "RollHistory_rollerDiscordId_idx" ON "RollHistory"("rollerDiscordId");

-- CreateIndex
CREATE INDEX "PendingCheck_campaignId_status_idx" ON "PendingCheck"("campaignId", "status");

-- CreateIndex
CREATE INDEX "PendingCheck_targetDiscordId_status_idx" ON "PendingCheck"("targetDiscordId", "status");

-- CreateIndex
CREATE INDEX "Asset_campaignId_assetType_isActive_idx" ON "Asset"("campaignId", "assetType", "isActive");

-- CreateIndex
CREATE INDEX "Asset_characterId_idx" ON "Asset"("characterId");

-- CreateIndex
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisualStyleProfile_campaignId_key" ON "VisualStyleProfile"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "RulesRace_key_key" ON "RulesRace"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RulesClass_key_key" ON "RulesClass"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RulesBackground_key_key" ON "RulesBackground"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RulesSkill_key_key" ON "RulesSkill"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RulesCondition_key_key" ON "RulesCondition"("key");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignChannel" ADD CONSTRAINT "CampaignChannel_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMember" ADD CONSTRAINT "CampaignMember_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCreationDraft" ADD CONSTRAINT "CharacterCreationDraft_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCreationDraft" ADD CONSTRAINT "CharacterCreationDraft_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NPC" ADD CONSTRAINT "NPC_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryEntry" ADD CONSTRAINT "MemoryEntry_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollHistory" ADD CONSTRAINT "RollHistory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RollHistory" ADD CONSTRAINT "RollHistory_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCheck" ADD CONSTRAINT "PendingCheck_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCheck" ADD CONSTRAINT "PendingCheck_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CombatState" ADD CONSTRAINT "CombatState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualStyleProfile" ADD CONSTRAINT "VisualStyleProfile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

