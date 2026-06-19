import '../src/config/load-env.js';
import { connectDb } from '../src/db/client.js';
import { startBot } from '../src/bot/client.js';

try {
  await connectDb();
  const client = await startBot();
  console.log('Logged in as', client.user?.tag);
} catch (err) {
  const e = err as Error & { code?: string; rawError?: unknown };
  console.error('Login failed:', e.message);
  console.error('Code:', e.code);
  if (e.rawError) console.error('Raw:', e.rawError);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
