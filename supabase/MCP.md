# Supabase MCP setup (Cursor)



This project uses the hosted **Supabase MCP** for database setup and admin tasks.



## Cursor MCP config



Project config: [`.cursor/mcp.json`](../.cursor/mcp.json)



```json

{

  "mcpServers": {

    "supabase": {

      "url": "https://mcp.supabase.com/mcp?project_ref=uakboacjjrwidnaimzsk",

      "transport": "http"

    }

  }

}

```



On first use, Cursor opens a browser window to log in to Supabase and authorize MCP access.



## What was applied via MCP



| Step | Migration name | Status |

|------|----------------|--------|

| Schema (24 tables) | `init_postgresql` | Applied |

| Indexes | `init_postgresql_indexes` | Applied |

| Foreign keys | `init_postgresql_foreign_keys` | Applied |

| SRD rules seed | `execute_sql` | 46 rows across rules tables |

| Prisma tracking | `_prisma_migrations` | Synced |



Verify anytime in Cursor: ask the agent to run Supabase MCP `list_tables` or `list_migrations`.



## Re-apply / update schema



For future schema changes:



1. Update `prisma/schema.prisma` and generate migration SQL locally

2. Apply via MCP `apply_migration` with a snake_case name

3. Or run `npm run setup` if `SUPABASE_DB_PASSWORD` is in `.env`



## Bot runtime still needs DB password



MCP uses your Supabase account — the **Discord bot** uses Prisma with a direct Postgres URL.



Add to `.env`:



```env

SUPABASE_DB_PASSWORD=your_database_password

SUPABASE_REGION=eu-central-2

```



Then `npm run db:verify` should pass.



## Security note (RLS)



These tables have **Row Level Security disabled**. That is fine for a server-side Discord bot using Prisma (service-level DB access). Do not expose campaign tables via Supabase client SDK to browsers without adding RLS policies first.

