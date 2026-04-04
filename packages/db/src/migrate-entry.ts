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

console.log('Running database migrations...');
await runMigrations(url);
console.log('Database migrations complete.');
