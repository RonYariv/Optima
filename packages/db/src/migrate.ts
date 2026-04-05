import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import { createDbClient } from './client.js';

/**
 * Applies all pending SQL migrations from packages/db/migrations/.
 * Safe to call on every process startup — drizzle tracks applied migrations
 * in the __drizzle_migrations table.
 */
export async function runMigrations(connectionString: string, sslDisabled = false): Promise<void> {
  const migrationsFolder = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../migrations',
  );

  const db = createDbClient(connectionString, sslDisabled);
  await migrate(db, { migrationsFolder });
}
