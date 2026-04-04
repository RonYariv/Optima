import postgres from 'postgres';
import { config } from './config.js';
import {
  createDbClient,
  runMigrations,
  TraceRepository,
  ModelCallRepository,
  ToolCallRepository,
  FailureEventRepository,
  AuditEventRepository,
} from '@agent-optima/db';
import { PgmqQueue, runWorker } from '@agent-optima/queue';
import type { ModelCallIngest, ToolCallIngest, AuditEventIngest } from '@agent-optima/schemas';
import { ModelCallIngestSchema, ToolCallIngestSchema, AuditEventIngestSchema } from '@agent-optima/schemas';
import { ModelCallWorker } from './workers/model-call.worker.js';
import { ToolCallWorker } from './workers/tool-call.worker.js';
import { AuditEventWorker } from './workers/audit-event.worker.js';
import { StaticPricingService } from './pricing.js';

const QUEUE_MODEL_CALL = 'model-call-ingest';
const QUEUE_TOOL_CALL = 'tool-call-ingest';
const QUEUE_AUDIT_EVENT = 'audit-event-ingest';

async function main() {
  console.log('Analytics workers starting...');

  // ── Migrations ──────────────────────────────────────────────────────────── 
  console.log('Running DB migrations...');
  await runMigrations(config.DATABASE_URL);
  console.log('Migrations applied.');

  // ── DB ──────────────────────────────────────────────────────────────────── 
  const db = createDbClient(config.DATABASE_URL);

  const traceRepo = new TraceRepository(db);
  const modelCallRepo = new ModelCallRepository(db);
  const toolCallRepo = new ToolCallRepository(db);
  const failureRepo = new FailureEventRepository(db);
  const auditEventRepo = new AuditEventRepository(db);
  const pricing = new StaticPricingService();

  // ── Queue (PGMQ via separate postgres-js connection) ──────────────────────
  // PGMQ uses a dedicated connection for queue operations.
  // Swap guide: replace `pgSql` and `PgmqQueue` with any IQueue<T> implementation.
  const pgSql = postgres(config.DATABASE_URL, {
    max: 2,
    ssl: config.DATABASE_SSL === 'disable' ? false : 'require',
  });

  const modelCallQueue = new PgmqQueue<ModelCallIngest>(pgSql, QUEUE_MODEL_CALL);
  const toolCallQueue = new PgmqQueue<ToolCallIngest>(pgSql, QUEUE_TOOL_CALL);
  const auditEventQueue = new PgmqQueue<AuditEventIngest>(pgSql, QUEUE_AUDIT_EVENT);

  // Ensure queues exist (idempotent)
  await modelCallQueue.init();
  await toolCallQueue.init();
  await auditEventQueue.init();

  console.log(`Queues ready: ${QUEUE_MODEL_CALL}, ${QUEUE_TOOL_CALL}, ${QUEUE_AUDIT_EVENT}`);

  // ── Workers ───────────────────────────────────────────────────────────────
  const modelCallWorker = new ModelCallWorker(traceRepo, modelCallRepo, pricing);
  const toolCallWorker = new ToolCallWorker(traceRepo, toolCallRepo, failureRepo);
  const auditEventWorker = new AuditEventWorker(auditEventRepo);

  const ac = new AbortController();

  process.on('SIGTERM', () => { console.log('SIGTERM received, shutting down...'); ac.abort(); });
  process.on('SIGINT',  () => { console.log('SIGINT received, shutting down...');  ac.abort(); });

  const workerOpts = {
    visibilityTimeoutSecs: config.VISIBILITY_TIMEOUT_SECS,
    pollIntervalMs: config.POLL_INTERVAL_MS,
    maxRetries: config.MAX_RETRIES,
    signal: ac.signal,
    onError: (err: unknown, payload: unknown) => {
      console.error('Worker error', { err, payload });
    },
  };

  console.log('Workers running. Waiting for jobs...');

  await Promise.all([
    runWorker<ModelCallIngest>(
      modelCallQueue,
      async (payload) => {
        const raw = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const parsed = ModelCallIngestSchema.safeParse(raw);
        if (!parsed.success) throw new Error(`Invalid model-call payload: ${parsed.error.message}`);
        await modelCallWorker.handle(parsed.data);
      },
      workerOpts,
    ),
    runWorker<ToolCallIngest>(
      toolCallQueue,
      async (payload) => {
        const raw = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const parsed = ToolCallIngestSchema.safeParse(raw);
        if (!parsed.success) throw new Error(`Invalid tool-call payload: ${parsed.error.message}`);
        await toolCallWorker.handle(parsed.data);
      },
      workerOpts,
    ),
    runWorker<AuditEventIngest>(
      auditEventQueue,
      async (payload) => {
        const raw = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const parsed = AuditEventIngestSchema.safeParse(raw);
        if (!parsed.success) throw new Error(`Invalid audit-event payload: ${parsed.error.message}`);
        await auditEventWorker.handle(parsed.data);
      },
      workerOpts,
    ),
  ]);

  await pgSql.end();
  console.log('Workers shut down cleanly.');
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection', err);
  process.exit(1);
});

await main();
