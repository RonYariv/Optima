/**
 * A message read from the queue, not yet acknowledged.
 */
export interface QueueMessage<T> {
  /** Unique message ID assigned by PGMQ. Use this to ack or nack. */
  msgId: bigint;
  payload: T;
  enqueuedAt: Date;
  /** How many times this message has been delivered. */
  readCount: number;
}

/**
 * Core queue abstraction.
 *
 * Current implementation: PGMQ (Postgres-native).
 * To swap to Kafka, BullMQ, SQS etc. — implement this interface and inject the new adapter.
 */
export interface IQueue<T> {
  readonly name: string;

  /** Enqueue a single message. Returns the assigned message ID. */
  enqueue(payload: T): Promise<bigint>;

  /** Enqueue multiple messages in one round-trip. */
  enqueueMany(payloads: T[]): Promise<bigint[]>;

  /**
   * Read up to `qty` messages, hiding them for `visibilityTimeoutSecs`.
   * Returns null when the queue is empty.
   */
  read(visibilityTimeoutSecs?: number, qty?: number): Promise<QueueMessage<T>[]>;

  /** Acknowledge a message — permanently remove it from the queue. */
  ack(msgId: bigint): Promise<void>;

  /**
   * Negative-acknowledge — move to the dead-letter queue after max retries.
   * For PGMQ this archives the message rather than deleting it.
   */
  nack(msgId: bigint): Promise<void>;
}
