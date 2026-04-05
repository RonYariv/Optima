/**
 * Standalone migration entry point.
 * Used as the init container command in the Helm chart:
 *   node /app/packages/db/dist/migrate-entry.js
 */
import { runMigrations } from './migrate.js';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const sslDisabled = process.env['DATABASE_SSL'] === 'disable';

console.log('Running database migrations...');
await runMigrations(url, sslDisabled);
console.log('Database migrations complete.');
