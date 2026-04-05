import fp from 'fastify-plugin';
import postgres from 'postgres';
import type { FastifyInstance } from 'fastify';
import { PgmqQueue } from '@agent-optima/queue';
import type { IQueue } from '@agent-optima/queue';
import type { ModelCallIngest, ToolCallIngest, AuditEventIngest } from '@agent-optima/schemas';
import { config } from '../config.js';

export const QUEUE_MODEL_CALL = 'model-call-ingest';
export const QUEUE_TOOL_CALL = 'tool-call-ingest';
export const QUEUE_AUDIT_EVENT = 'audit-event-ingest';

declare module 'fastify' {
  interface FastifyInstance {
    queues: {
      modelCall: IQueue<ModelCallIngest>;
      toolCall: IQueue<ToolCallIngest>;
      auditEvent: IQueue<AuditEventIngest>;
    } | null;
  }
}

/**
 * Queue plugin — sets up PGMQ-backed queues and decorates the Fastify instance.
 *
 * When DATABASE_URL is not configured (dev mock mode) `app.queues` is null
 * and ingest routes fall back to pino-only logging.
 *
 * Swap guide: replace PgmqQueue with any IQueue<T> implementation here.
 * No other file needs to change.
 */
export const queuePlugin = fp(async (app: FastifyInstance) => {
  if (!config.DATABASE_URL) {
    app.log.warn('DATABASE_URL not set — queue disabled, events will be logged only');
    app.decorate('queues', null);
    return;
  }

  const pgSql = postgres(config.DATABASE_URL, {
    max: 2,
    ssl: config.DATABASE_SSL === 'disable' ? false : 'require',
  });

  const modelCallQueue = new PgmqQueue<ModelCallIngest>(pgSql, QUEUE_MODEL_CALL);
  const toolCallQueue = new PgmqQueue<ToolCallIngest>(pgSql, QUEUE_TOOL_CALL);
  const auditEventQueue = new PgmqQueue<AuditEventIngest>(pgSql, QUEUE_AUDIT_EVENT);

  await modelCallQueue.init();
  await toolCallQueue.init();
  await auditEventQueue.init();

  app.decorate('queues', {
    modelCall: modelCallQueue,
    toolCall: toolCallQueue,
    auditEvent: auditEventQueue,
  });

  app.addHook('onClose', async () => {
    await pgSql.end();
  });
});
