# Discord AI Dungeon Master

A Discord bot that hosts persistent, AI-driven fantasy tabletop campaigns with 5e-style mechanics (SRD-compatible), real dice resolution, campaign memory, and persistent visual assets.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | **Node.js 20+** | Native async, excellent Discord ecosystem |
| Language | **TypeScript** | Type safety for complex game state + AI JSON |
| Discord | **discord.js v14** | Slash commands, buttons, modals, embeds |
| Database | **Supabase (PostgreSQL) + Prisma** | Hosted Postgres, pooling, multi-tenant scale — no local DB |
| Validation | **Zod** | Strict AI output + character validation |
| Tests | **Vitest** | Fast unit tests for dice/rules |
| AI | **Provider-agnostic** | OpenAI or Mock (no API key needed) |
| Images | **Provider-agnostic** | Stub (local) or OpenAI DALL-E (TODO) |

**Architecture principle:** The database owns canonical truth. The LLM proposes narration, checks, and memory — the app validates and persists everything.

## Project Structure

```
src/
  index.ts                 # Bot entry point
  config/                  # Environment config
  db/                      # Prisma client
  bot/
    client.ts              # Discord client + event handlers
    commands/              # Slash commands + handlers
  core/
    campaign-loop.ts       # Main DM brain loop
  campaign/
    intro.ts               # Original campaign opening (Mistharbor)
    state.ts               # Campaign state packet builder
  dm/memory/               # Memory extractor persistence
  game/
    dice/engine.ts         # Real dice parser + roller
    checks/pending-check.ts
    character/             # Creator + service
    combat/                # Combat foundation (TODO: full automation)
    rules/loader.ts        # SRD rules data loader
  services/ai/             # OpenAI + Mock providers
  assets/                  # Asset manager + prompt builder
  validation/schemas.ts    # Zod schemas for AI JSON
prisma/
  schema.prisma            # Full data model
  seed/                    # SRD rules seed data
tests/                     # Vitest tests
scripts/
  register-commands.ts
  demo-campaign-loop.ts
```

## Setup (Supabase + Discord)

No local Postgres. No Docker required.

### 1. Prerequisites

- Node.js 20+
- Free [Supabase](https://supabase.com) account
- [Discord Application](https://discord.com/developers/applications) with bot token

### 2. Create Supabase database

Follow **[supabase/README.md](supabase/README.md)** — add to `.env`:

- `SUPABASE_URL` — Project URL from Supabase API settings
- `SUPABASE_ANON_KEY` — publishable / anon key
- `SUPABASE_DB_PASSWORD` — database password (not the publishable key)

### 3. Install & push schema to Supabase

```bash
npm install
cp .env.example .env
# Paste Supabase URLs into .env
npm run setup
```

This creates all tables in Supabase and seeds SRD rules data. Check **Table Editor** in the Supabase dashboard.

### 4. Add Discord + AI keys to `.env`

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...          # your test server
AI_PROVIDER=openai
AI_API_KEY=sk-...
```

Enable **Message Content Intent** in the Discord Developer Portal.

### 5. Start the bot

```bash
npm run db:verify              # optional — test Supabase connection
npm run register-commands
npm run dev
```

### Useful commands

```bash
npm run db:verify              # test Supabase connectivity
npm run db:setup               # migrate + seed only
npm run db:migrate:deploy      # production deploy migrations
npm run test:demo              # simulate campaign loop against Supabase
npm run setup:docker           # optional local Postgres — not needed with Supabase
```

## Commands

| Command | Description |
|---------|-------------|
| `/character create/view/sheet/list/delete` | Character setup |
| `/campaign start/join/leave/reset` | Campaign setup & admin |
| `/roll`, `/check`, `/save`, `/initiative` | Optional dice shortcuts |
| `/combat start/status/next/end` | Combat foundation |
| `/debug state/pending-checks/memory/assets` | Admin debug |

**In campaign channels, just type** — no commands for recap, location, quests, NPCs, or party. The DM responds with narration and panels automatically. Scene images generate when locations change or you ask about your surroundings.

## Core Play Loop

1. `/character create` — guided creation with race/class/background/abilities
2. `/campaign start` — original Mistharbor intro scene
3. **Speak naturally** in the campaign channel (actions, questions, recaps)
4. AI Controller decides action (JSON) — may request a check
5. Tap **Roll** or use `/check` when a check is pending
6. AI Narrator describes outcome; panels appear for location, quests, etc. when relevant
7. Memory Extractor saves durable facts
8. Location images reuse on return visits

## Tests

```bash
npm test
npm run test:demo    # Full loop simulation without Discord
```

## What Works Fully

- Project setup, Prisma schema, rules seed (SRD-compatible races/classes/skills)
- Real dice engine (parse, advantage/disadvantage, 4d6dl1, skill/save checks)
- Character creator with Standard Array, Roll, Point Buy
- Campaign start with original intro, NPCs, quest, location, memory
- AI Controller + Narrator + Memory Extractor (Mock provider, OpenAI optional)
- Pending check flow (no pre-roll success narration)
- Campaign state persistence across restarts
- Asset manager with location reuse + versioning foundation
- Image prompt builder with style bible
- Combat foundation (initiative order, turns, HP tracking)
- Demo script simulating full loop

## Partial / Stubbed

- **OpenAI DALL-E image generation** — stub writes prompt files locally; interface ready
- **Character appearance modal flow** — finalize via button; full multi-step appearance TODO
- **Character edit** — delete/recreate for now
- **Full combat automation** — attack/damage/healing foundation only
- **Contested checks, full spell system** — not yet implemented
- **Homebrew content editor** — data structure ready in `RulesRace.isHomebrew` etc.

## Image Consistency

- Each location stores `activeAssetId` — returns reuse existing image
- Regeneration creates new version; old versions kept (`isActive: false`)
- Prompt builder includes continuity constraints from previous prompts
- Campaign `VisualStyleProfile` ensures consistent art direction

## Test First in Discord

1. Set `AI_PROVIDER=mock` and create character
2. `/campaign start` in a dedicated channel
3. Say: "I search the room for anything strange"
4. Bot should request Perception/Investigation check (not narrate success)
5. `/check` or the **Roll** button to resolve a pending check
6. Ask "recap" or "where are we?" in chat to verify memory and panels
7. Restart bot — state should persist

## Multi-Server / Commercial Readiness

This bot is built as a **multi-tenant** Discord application — one bot instance serves many communities with isolated data.

### How it works per community

1. Someone adds the bot to their Discord server (standard OAuth invite).
2. The bot auto-registers that server (`Guild` record) on join or first use.
3. Each server gets **isolated characters** (`guildId` scoped — your rogue in Server A is separate from Server B).
4. An admin runs `/campaign start` in a campaign channel.
5. Each player runs `/character create`, then `/campaign join character:Name`.
6. Multiple players play together in the same channel; party state feeds the AI DM.

### Party & info (in chat)

| Say in channel | What happens |
|----------------|--------------|
| "recap" / "what happened?" | Recap panel |
| "where are we?" | Location panel + scene image |
| "what are our quests?" | Quest panel |
| "who's in the party?" | Party list |
| "leave the campaign" | Leaves (or `/campaign leave`) |

### Plan tiers (infrastructure ready)

| Tier | Campaign channels | Party size |
|------|-------------------|------------|
| free | 2 | 4 |
| premium | 10 | 8 |
| enterprise | 50 | 12 |

`Guild.planTier` and `subscriptionStatus` fields exist for wiring Discord App Subscriptions or Stripe. Billing integration is **TODO** — the data model and limits enforcement are in place.

### What's NOT built yet (for selling)

- Discord App Subscription / Stripe webhook handlers
- Customer dashboard or billing portal
- Per-server AI usage metering / cost caps beyond image limits
- PostgreSQL migration guide for high-scale multi-instance deploy

For Discord App Store listing, you still need: verified bot, privacy policy, terms, and Discord's monetization approval.

## Known Limitations

- Mock AI uses keyword matching unless `AI_PROVIDER=openai`
- Stub images are text files, not actual pictures
- Global slash commands can take up to 1 hour to propagate
- Supabase free tier pauses inactive projects — wake it in the dashboard if the bot can't connect
- Use Transaction pooler (6543) for bot, Direct (5432) for migrations — see `supabase/README.md`
- No web dashboard or voice (by design for v0.1)

## License

SRD-compatible mechanics only. All campaign content is original homebrew.
