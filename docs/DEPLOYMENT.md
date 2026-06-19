# Production deployment

The bot uses **Supabase** as hosted PostgreSQL. Deploy the Node process anywhere; point it at your Supabase project via env vars.

## Environment variables (production)

```env
DATABASE_URL=...              # Supabase Transaction pooler :6543 ?pgbouncer=true
DIRECT_DATABASE_URL=...       # Supabase Direct :5432 — migrations/CI only
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
AI_PROVIDER=openai
AI_API_KEY=...
NODE_ENV=production
```

## Deploy checklist

1. Supabase project created (same region as your bot host if possible)
2. `npm run db:migrate:deploy` in CI or once before first boot
3. `npm run db:seed` once per environment
4. Start bot: `npm run build && npm run start`
5. Optional: run multiple bot replicas — all share one Supabase database

## Scaling

- **Thousands of Discord servers:** one Supabase Postgres + multiple bot processes is fine; data is isolated per `guildId`
- **Connection pooling:** Supabase pooler handles this; keep `connection_limit=10` per bot instance on `DATABASE_URL`
- **Discord sharding:** required above ~2,500 guilds (TODO: add sharding manager)

## Local development

Use Supabase cloud even for dev — no local Postgres needed. See [supabase/README.md](../supabase/README.md).

Optional Docker Postgres: `npm run setup:docker` (legacy, not recommended if using Supabase).

## Other hosts

Works on Railway, Render, Fly.io, VPS, etc. — only needs Node 20+ and the env vars above.
