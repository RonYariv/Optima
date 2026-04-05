import { z } from 'zod';
import { encodeCursor } from './cursor.js';

/**
 * Shared cursor-pagination fields used by all list endpoints.
 * Extend with route-specific filters via .extend({}).
 */
export const PaginationSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(), // SEC-3: cap length to prevent DoS
});

/**
 * Slice rows to the requested page size and encode the next-page cursor (CODE-1).
 * `rows` must have length `limit + 1` — the extra row is the look-ahead for hasMore.
 */
export function buildPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): { data: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;
  return { data, nextCursor };
}
