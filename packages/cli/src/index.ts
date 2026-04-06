#!/usr/bin/env node
import { generateToken } from './commands/token.js';
import { showStats } from './commands/stats.js';

const [, , command, subcommand, ...rest] = process.argv;

function printHelp(): void {
  console.log(
    [
      'optima-ctl — Agent-Optima management CLI',
      '',
      'COMMANDS',
      '  token generate   Generate a JWT bearer token for SDK authentication',
      '  stats            Show performance stats (1h / 24h / 7d)',
      '',
      'OPTIONS (token generate)',
      '  --tenant  <id>   Tenant ID to embed in the token  (required)',
      '  --secret  <str>  JWT signing secret, min 32 chars (default: $JWT_SECRET)',
      '  --expiry  <sec>  Token lifetime in seconds         (default: 31536000 = 1 year)',
      '  --no-expiry      Issue a non-expiring token',
      '',
      'OPTIONS (stats)',
      '  --window <w>     Aggregation window: 1h | 24h | 7d (default: 1h)',
      '  --api <url>      Control API base URL               (default: $OPTIMA_API_URL or http://localhost:3001)',
      '',
      'EXAMPLES',
      '  optima-ctl token generate --tenant my-project',
      '  JWT_SECRET=xxx optima-ctl token generate --tenant my-project --expiry 86400',
      '  optima-ctl token generate --tenant ci-bot --no-expiry',
      '  OPTIMA_TOKEN=<jwt> optima-ctl stats --window 24h',
    ].join('\n'),
  );
}

if (command === 'token' && subcommand === 'generate') {
  generateToken(rest).catch((err: unknown) => {
    console.error('ERROR:', err);
    process.exit(1);
  });
} else if (command === 'stats') {
  showStats(rest).catch((err: unknown) => {
    console.error('ERROR:', err);
    process.exit(1);
  });
} else {
  printHelp();
  if (command !== undefined) process.exit(1);
}
