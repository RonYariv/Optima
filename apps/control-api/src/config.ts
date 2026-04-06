import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

loadEnv({ path: resolve(fileURLToPath(import.meta.url), '../../../../.env') });

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(['disable', 'require']).default('require'),

  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('agent-optima'),
  JWT_AUDIENCE: z.string().default('agent-optima-api'),

  CORS_ORIGIN: z
    .string()
    .url()
    .refine((v) => !v.endsWith('/'), { message: 'CORS_ORIGIN must not have a trailing slash' })
    .default('http://localhost:5173'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

  GATEWAY_METRICS_URL: z.string().url().default('http://localhost:3000/metrics'),
  WORKER_METRICS_URL: z.string().url().default('http://localhost:9465/metrics'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid control-api configuration:\n${formatted}`);
  }
  return result.data;
}

export const config: Config = loadConfig();
