import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

loadEnv({ path: resolve(fileURLToPath(import.meta.url), '../../../../.env') });

const WorkerConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(['disable', 'require']).default('require'),
  TENANT_ID: z.string().min(1).default('default'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
  VISIBILITY_TIMEOUT_SECS: z.coerce.number().int().positive().default(30),
  MAX_RETRIES: z.coerce.number().int().positive().default(3),
});

export type WorkerConfig = z.infer<typeof WorkerConfigSchema>;

function loadConfig(): WorkerConfig {
  const result = WorkerConfigSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid worker configuration:\n${formatted}`);
  }
  return result.data;
}

export const config: WorkerConfig = loadConfig();
