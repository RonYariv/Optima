import type { FastifyInstance } from 'fastify';

/**
 * Health check — always public, no auth required.
 * Returns a simple JSON object so load balancers and k8s can probe readiness.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    { config: { public: true } },
    async (_request, _reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] ?? 'unknown',
      };
    },
  );
}
