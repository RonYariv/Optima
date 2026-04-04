import type { IQueue, QueueMessage } from './queue.interface.js';

export { PgmqQueue } from './pgmq.queue.js';
export type { IQueue, QueueMessage } from './queue.interface.js';

/**
 * Generic polling worker runner.
 *
 * Continuously reads from a queue, calls the handler, and acks on success.
 * On failure: retries up to `maxRetries` then nacks (archives) the message.
 *
 * To stop cleanly, set the AbortSignal. The loop exits after the current
 * message finishes processing.
 *
 * Swap guide: this runner is transport-agnostic — it works with any IQueue<T>.
 * Replace the queue adapter without touching this file.
 */
export async function runWorker<T>(
  queue: IQueue<T>,
  handler: (payload: T) => Promise<void>,
  opts: {
    visibilityTimeoutSecs?: number;
    pollIntervalMs?: number;
    maxRetries?: number;
    signal?: AbortSignal;
    onError?: (err: unknown, payload: T) => void;
  } = {},
): Promise<void> {
  const {
    visibilityTimeoutSecs = 30,
    pollIntervalMs = 1_000,
    maxRetries = 3,
    signal,
    onError,
  } = opts;

  while (!signal?.aborted) {
    const messages = await queue.read(visibilityTimeoutSecs, 1);

    if (messages.length === 0) {
      await sleep(pollIntervalMs);
      continue;
    }

    const msg = messages[0]!;

    if (msg.readCount > maxRetries) {
      // Exceeded retry budget — nack (archive) to DLQ
      await queue.nack(msg.msgId);
      continue;
    }

    try {
      await handler(msg.payload);
      await queue.ack(msg.msgId);
    } catch (err) {
      onError?.(err, msg.payload);
      // Message visibility will expire and be re-delivered automatically
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
