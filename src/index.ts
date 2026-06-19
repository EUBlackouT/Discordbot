import './config/load-env.js';
import { startBot } from './bot/client.js';
import { logger } from './utils/logger.js';
import { connectDb, disconnectDb, healthCheckDb } from './db/client.js';

async function main() {
  logger.info('Starting Discord AI DM bot...');

  const dbOk = await healthCheckDb();
  if (!dbOk) {
    logger.error('Cannot connect to Supabase/PostgreSQL. Check DATABASE_URL in .env — see supabase/README.md');
    process.exit(1);
  }
  await connectDb();

  await startBot();
}

main().catch((err) => {
  const e = err as Error;
  logger.error('Fatal error', e.message ?? String(err));
  if (e.stack) console.error(e.stack);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await disconnectDb();
  process.exit(0);
});
