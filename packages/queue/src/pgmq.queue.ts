import type postgres from 'postgres';
import type { IQueue, QueueMessage } from './queue.interface.js';

type PgRow = {
  msg_id: string;
  message: unknown;
  enqueued_at: Date;
  read_ct: number;
};

/**
 * PGMQ-backed queue adapter.
 *
 * PGMQ is a Postgres-native durable message queue shipped as an extension.
 * It is built into Supabase and can be self-hosted on any Postgres instance.
 *
 * Docs: https://github.com/tembo-io/pgmq
 *
 * Swap guide: implement IQueue<T> with a different transport (Kafka, BullMQ, SQS)
 * and inject the new adapter — no business logic changes required.
 */
export class PgmqQueue<T> implements IQueue<T> {
  readonly name: string;

  constructor(
    private readonly sql: postgres.Sql,
    queueName: string,
  ) {
    this.name = queueName;
  }

  /**
   * Ensure the queue exists. Call once at startup.
   * PGMQ's create is idempotent — safe to call on every boot.
   */
  async init(): Promise<void> {
    await this.sql`SELECT pgmq.create(${this.name})`;
  }

  async enqueue(payload: T): Promise<bigint> {
    const rows = await this.sql<{ send: string }[]>`
      SELECT pgmq.send(${this.name}, ${JSON.stringify(payload)}::jsonb) AS send
    `;
    const first = rows[0];
    if (!first) throw new Error(`pgmq.send returned no rows for queue "${this.name}"`);
    return BigInt(first.send);
  }

  async enqueueMany(payloads: T[]): Promise<bigint[]> {
    if (payloads.length === 0) return [];
    const results: bigint[] = [];
    for (const payload of payloads) {
      const id = await this.enqueue(payload);
      results.push(id);
    }
    return results;
  }

  async read(visibilityTimeoutSecs = 30, qty = 1): Promise<QueueMessage<T>[]> {
    const rows = await this.sql<PgRow[]>`
      SELECT msg_id::text, message, enqueued_at, read_ct
      FROM pgmq.read(${this.name}, ${visibilityTimeoutSecs}, ${qty})
    `;
    return rows.map((r) => ({
      msgId: BigInt(r.msg_id),
      payload: r.message as T,
      enqueuedAt: r.enqueued_at,
      readCount: r.read_ct,
    }));
  }

  async ack(msgId: bigint): Promise<void> {
    await this.sql`SELECT pgmq.delete(${this.name}, ${msgId.toString()}::bigint)`;
  }

  async nack(msgId: bigint): Promise<void> {
    // Archive instead of delete — keeps a record in pgmq.a_<queue_name> for debugging
    await this.sql`SELECT pgmq.archive(${this.name}, ${msgId.toString()}::bigint)`;
  }
}
