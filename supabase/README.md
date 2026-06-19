# Supabase → Discord AI DM Bot



This project stores all campaign data in **Supabase PostgreSQL**. The Discord bot connects via Prisma.



## Quick setup

### Option A — Cursor Supabase MCP (schema already applied)

See **[MCP.md](./MCP.md)**. Project MCP is configured in `.cursor/mcp.json`. Authenticate once in Cursor → Settings → Tools & MCP.

### Option B — Bot runtime (`.env` required)

You need **three** values from your Supabase dashboard:



| `.env` variable | Where to find it |

|-----------------|------------------|

| `SUPABASE_URL` | Project Settings → API → Project URL |

| `SUPABASE_ANON_KEY` | Project Settings → API → publishable / anon key |

| `SUPABASE_DB_PASSWORD` | Project Settings → Database → database password |



Example (your project is already configured with URL + key):



```env

SUPABASE_URL=https://uakboacjjrwidnaimzsk.supabase.co

SUPABASE_ANON_KEY=sb_publishable_...

SUPABASE_DB_PASSWORD=the_password_you_set_when_creating_the_project

```



The bot **auto-builds** `DATABASE_URL` and `DIRECT_DATABASE_URL` from these — no need to copy connection strings manually.



`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` also work (same values).



### 2. Optional: Transaction pooler



For high traffic, set your AWS region to use Supavisor on port 6543:



```env

SUPABASE_REGION=eu-west-1

```



Without this, the bot uses a direct connection on port 5432 — fine for a single Discord bot process.



### 3. Run setup



```bash

npm install

npm run setup

npm run db:verify

```



### 4. Start the bot



Add Discord token to `.env`, then:



```bash

npm run register-commands

npm run dev

```



## Manual connection strings (alternative)



If you prefer paste-from-dashboard strings instead of auto-build:



| Variable | Supabase Connect tab | Port |

|----------|---------------------|------|

| `DATABASE_URL` | Transaction pooler | 6543 + `?pgbouncer=true` |

| `DIRECT_DATABASE_URL` | Direct | 5432 |



These override auto-build when set explicitly.



## View data



Supabase → **Table Editor** — `Guild`, `Campaign`, `Character`, etc.



## Troubleshooting



**`SUPABASE_DB_PASSWORD is required`**  

The publishable key is not the database password. Reset it under Project Settings → Database if needed.



**`P1001: Can't reach database server`**  

Free-tier projects pause when idle — open the Supabase dashboard to wake the project.



**Migration fails**  

Ensure `DIRECT_DATABASE_URL` uses port **5432**, not 6543.



**`prepared statement already exists`**  

Add `?pgbouncer=true` to a Transaction pooler `DATABASE_URL`.



## What we use from Supabase



- **PostgreSQL** — all campaign data via Prisma

- **API URL + anon key** — connectivity checks; ready for future Storage/Auth



We do not use Supabase Auth, Realtime, or Edge Functions yet.

