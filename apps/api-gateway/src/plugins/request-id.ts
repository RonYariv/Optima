import type { FastifyInstance } from 'fastify';

/**
 * Adds a consistent X-Request-Id header to every request/response.
 * Falls back to the incoming header if present (useful for distributed tracing).
 */
export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    const incoming =
      (request.headers['x-request-id'] as string | undefined) ??
      crypto.randomUUID();

    // Make the ID available on the request object
    request.id = incoming;
    reply.header('X-Request-Id', incoming);
  });
}
