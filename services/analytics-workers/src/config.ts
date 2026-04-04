import { z } from 'zod';

const WorkerConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().url(),
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
