import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export type DbClient = ReturnType<typeof createDbClient>;

/**
 * Creates a Drizzle ORM client backed by postgres-js.
 *
 * Swap guide: to use a different driver (e.g. pg, neon-serverless),
 * replace the `postgres` import and the `drizzle()` call here.
 * Nothing outside this file needs to change.
 */
export function createDbClient(connectionString: string) {
  const sslMode = process.env['DATABASE_SSL'] === 'disable'
    ? false
    : connectionString.includes('localhost') ? false : 'require';

  const pg = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: sslMode,
  });

  return drizzle(pg, { schema });
}
