import '../src/config/load-env.js';
import { registerSlashCommands } from '../src/bot/commands/index.js';
import { validateDiscordConfig } from '../src/config/index.js';

const errors = validateDiscordConfig();
if (errors.length > 0) {
  console.error('Configuration errors:');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

registerSlashCommands()
  .then(() => console.log('Done.'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
