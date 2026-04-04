import { z } from 'zod';

/**
 * Shared cursor-pagination fields used by all list endpoints.
 * Extend with route-specific filters via .extend({}).
 */
export const PaginationSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
